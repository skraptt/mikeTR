import "dotenv/config";
import * as cheerio from "cheerio";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const TARGET_URL = "https://www.mevzuat.gov.tr/anasayfa/MevzuatFihristDetayIframe?MevzuatTur=1&MevzuatNo=4721&MevzuatTertip=5";

async function scrapeAndChunkLaw() {
  try {
    console.log("Kanun metni çekiliyor ve temizleniyor...");
    
    const response = await fetch(TARGET_URL);
    if (!response.ok) {
        throw new Error(`Sunucu hatası: ${response.status}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);

    // 1. ADIM: TEMİZLİK (Data Cleaning)
    // Sitenin dağınık yapısını toparlıyoruz. Tüm paragraf ve div'leri gezip metinleri alıyoruz.
    let fullText = $(".WordSection1").text();
    
    // Regex ile tüm çoklu boşlukları, gereksiz "Enter" (newline) ve "Tab" karakterlerini tek bir boşluğa indirgiyoruz.
    fullText = fullText.replace(/\s+/g, " ").trim();

    // 2. ADIM: PARÇALAMA (Chunking)
    // "Madde 1 -", "Madde 2 -" gibi kalıpları yakalayarak kanunu maddelerine ayırıyoruz.
    const regex = /Madde\s+(\d+)\s*-(.*?)(?=Madde\s+\d+\s*-|$)/gs;
    
    const articles: { maddeNo: string; icerik: string }[] = [];
    let match;
    
    while ((match = regex.exec(fullText)) !== null) {
      const maddeNo = match[1];
      const icerik = match[2];

      if (!maddeNo || !icerik) {
        continue;
      }

        articles.push({
        maddeNo: maddeNo.trim(),
        icerik: icerik.trim()
        });
    }

    console.log("--------------------------------------------------");
    console.log(`Başarı! Toplam ${articles.length} madde temizlendi ve ayrıştırıldı.`);
    console.log("--------------------------------------------------");

    // Prepare clients
    const supabaseUrl = process.env.SUPABASE_URL;
    // Prefer the service role key for write operations (useful if RLS is enabled)
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn("Supabase URL veya KEY eksik; veritabanına kayıt atlanacak.");
    } else if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log("Using SUPABASE_SERVICE_ROLE_KEY for database writes (RLS-safe).");
    }

    if (!openaiKey) {
      console.warn("OPENAI_API_KEY eksik; embedding oluşturulamayacak.");
    }

    const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
    const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

    // Batch processing parameters
    const batchSize = Number(process.env.SCRAPER_BATCH_SIZE) || 5; // articles per batch
    const batchDelayMs = Number(process.env.SCRAPER_BATCH_DELAY_MS) || 1200; // ms between batches

    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

    const chunk = <T,>(arr: T[], size: number) => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };

    // Retry/backoff helper
    const retryWithBackoff = async <T,>(fn: () => Promise<T>, opts?: {
      retries?: number;
      initialDelayMs?: number;
      maxDelayMs?: number;
      factor?: number;
    }): Promise<T> => {
      const retries = opts?.retries ?? 3;
      const initialDelayMs = opts?.initialDelayMs ?? 500;
      const maxDelayMs = opts?.maxDelayMs ?? 10000;
      const factor = opts?.factor ?? 2;

      let attempt = 0;
      let delay = initialDelayMs;
      while (true) {
        try {
          return await fn();
        } catch (err) {
          attempt++;
          if (attempt > retries) throw err;
          // jitter
          const jitter = Math.random() * 0.2 * delay;
          const wait = Math.min(maxDelayMs, delay + jitter);
          console.warn(`Retry ${attempt}/${retries} after error: ${err}. Waiting ${Math.round(wait)}ms`);
          // eslint-disable-next-line no-await-in-loop
          await sleep(wait);
          delay = Math.min(maxDelayMs, delay * factor);
        }
      }
    };

    const articleChunks = chunk(articles, batchSize);

    for (let i = 0; i < articleChunks.length; i++) {
      const batch = articleChunks[i]!; // non-null: chunk() always returns arrays
      try {
        let embeddings: (number[] | null)[] = [];
        if (openai) {
          // Use a single embeddings call with multiple inputs to reduce request count
          const inputs = batch.map((b) => b.icerik);
          const embRes: any = await retryWithBackoff(() => openai.embeddings.create({ model: "text-embedding-3-small", input: inputs }), { retries: 4, initialDelayMs: 500 });
          embeddings = (embRes?.data ?? []).map((d: any) => d?.embedding ?? null);
        } else {
          embeddings = batch.map(() => null);
        }

        // Persist each row (upsert-like behavior)
        for (let j = 0; j < batch.length; j++) {
          const art = batch[j]!;
          const embedding = embeddings[j];

          if (supabase) {
            // Try upsert by madde_no using insert with on_conflict; wrap with retry
            try {
              await retryWithBackoff(async () => {
                const res: any = await supabase.from("kanun_maddeleri").upsert(
                  {
                    madde_no: art.maddeNo,
                    icerik: art.icerik,
                    embedding,
                  },
                  { onConflict: "madde_no" }
                );
                if (res.error) throw res.error;
                return res;
              }, { retries: 3, initialDelayMs: 500 });
              console.log(`Madde ${art.maddeNo} upsert başarılı.`);
            } catch (err) {
              console.error(`Madde ${art.maddeNo} upsert hatası (retry sonrası):`, err);
            }
          } else {
            console.log(`(Dry run) Madde ${art.maddeNo} hazırlandı.`);
          }
        }

        // Delay between batches to avoid rate limits
        if (i < articleChunks.length - 1) {
          await sleep(batchDelayMs);
        }
      } catch (e) {
        console.error(`Batch ${i + 1} işlenirken hata:`, e);
        // Optional: short delay before next batch on error
        await sleep(Math.min(batchDelayMs * 2, 5000));
      }
    }
    
    if (articles.length > 0) {
        console.log("ÖRNEK TEST - Madde 1:");
        console.log(articles[0]);
        console.log("\nÖRNEK TEST - Madde 2:");
        console.log(articles[1]);
    }
    
  } catch (error) {
    console.error("Sayfa işlenirken bir hata oluştu:", error);
  }
}

scrapeAndChunkLaw();