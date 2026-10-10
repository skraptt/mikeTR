// kanun_maddeleri tablosunda seçili sağlayıcının sütunu boş olan satırları doldurur.
// Kaldığı yerden devam eder; yalnızca eksik satırları işler.
//
//   npm run embed                              (.env'deki EMBEDDING_PROVIDER)
//   EMBEDDING_PROVIDER=openai npm run embed
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import {
  EMBEDDING_PROVIDERS,
  createTextEmbeddings,
  getEmbeddingProvider,
} from "../src/lib/kanunSearch";

const BATCH_SIZE = 16;

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL ve SUPABASE_SECRET_KEY .env içinde tanımlı olmalı");
  }
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const provider = getEmbeddingProvider();
  const { column } = EMBEDDING_PROVIDERS[provider];

  const { count, error: countError } = await db
    .from("kanun_maddeleri")
    .select("id", { count: "exact", head: true })
    .is(column, null);
  if (countError) throw new Error(countError.message);
  console.log(`[embed] sağlayıcı=${provider}, sütun=${column}, eksik satır=${count ?? 0}`);

  let done = 0;
  const startedAt = Date.now();

  while (true) {
    // Güncellenen satırlar filtreden düştüğü için her turda baştan okumak yeterli.
    const { data: rows, error } = await db
      .from("kanun_maddeleri")
      .select("id, icerik")
      .is(column, null)
      .order("id")
      .limit(BATCH_SIZE);
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) break;

    const embeddings = await createTextEmbeddings(rows.map((r) => r.icerik), provider);

    for (let i = 0; i < rows.length; i++) {
      const { error: updateError } = await db
        .from("kanun_maddeleri")
        .update({ [column]: embeddings[i] })
        .eq("id", rows[i].id);
      if (updateError) throw new Error(`id=${rows[i].id}: ${updateError.message}`);
    }

    done += rows.length;
    const elapsed = (Date.now() - startedAt) / 1000;
    console.log(`[embed] ${done}/${count ?? "?"}  (${elapsed.toFixed(0)} sn)`);
  }

  console.log(`[embed] tamamlandı: ${done} satır işlendi`);
}

main().catch((error) => {
  console.error("[embed] hata:", error instanceof Error ? error.message : error);
  process.exit(1);
});
