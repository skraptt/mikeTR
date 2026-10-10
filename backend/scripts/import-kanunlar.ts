// setup-data altındaki kanun metinlerini maddelere ayırıp kanun_maddeleri tablosuna yazar.
// Metni değişen maddelerin embedding'leri sıfırlanır; ardından `npm run embed` çalıştırılır.
//
//   npm run import-kanunlar -- --dry-run     (veritabanına yazmadan özet)
//   npm run import-kanunlar
import "dotenv/config";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

export type ParsedMadde = {
  kanun_no: string;
  kanun_adi: string;
  madde_no: string;
  baslik: string | null;
  icerik: string;
};

// "MADDE 1-", "Madde 1 –", "Geçici Madde 2-", "EK MADDE 3 –", "Madde 1/A –", "MADDE 146 ila 149 –"
// "İ" büyük/küçük harf duyarsız eşleşmede "i" sayılmadığı için açıkça yazıldı.
const HEADING = /^\s*(?:(ge[çÇ][iİ]c[iİ]|ek)\s+)?madde\s+(\d+(?:\/[a-zçğıöşü])?)(?:\s+ila\s+(\d+))?\s*[-–—]\s*/iu;

function trUpperFirst(word: string): string {
  return word.charAt(0).toLocaleUpperCase("tr-TR") + word.slice(1);
}

function titleCaseTr(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .split(/\s+/)
    .map((w) => (["ve", "ile", "hakkında"].includes(w) ? w : trUpperFirst(w)))
    .join(" ");
}

// Bir sonraki maddenin başlığı ya da bölüm adı olan satırlar: kısa, noktalama ile bitmeyen,
// "(1)" gibi fıkra numarasıyla başlamayan satırlar.
function isTitleLine(line: string): boolean {
  const t = line.trim();
  return t.length > 0 && t.length < 150 && !/[.:;,]$/.test(t) && !/^\(\d+\)/.test(t);
}

export function parseKanun(text: string, fileName: string): ParsedMadde[] {
  const allLines = text.replace(/\r\n?/g, "\n").split("\n");
  // Dosya sonundaki "İŞLENEMEYEN HÜKÜMLER" ve yürürlük tablosu bölümleri madde değildir.
  const tailStart = allLines.findIndex((l) => /İŞLENEMEYEN HÜKÜMLER|DEĞİŞİKLİK GETİREN MEVZUATIN/u.test(l));
  const lines = tailStart === -1 ? allLines : allLines.slice(0, tailStart);

  const noLine = lines.find((l) => /^\s*Kanun Numarası\s*:/i.test(l));
  const kanun_no = noLine?.split(":")[1]?.trim() || fileName.match(/^(\d+)/)?.[1];
  if (!kanun_no) throw new Error(`${fileName}: kanun numarası bulunamadı`);

  const titleLines: string[] = [];
  for (const l of lines) {
    if (!l.trim()) {
      if (titleLines.length) break;
      continue;
    }
    titleLines.push(l.trim());
  }
  const kanun_adi = titleCaseTr(titleLines.join(" "));

  const headingIdx = lines.flatMap((l, i) => (HEADING.test(l) ? [i] : []));
  const result: ParsedMadde[] = [];
  let pendingTitle: string[] = [];

  // İlk maddenin başlığı, ondan hemen önceki başlık satırlarıdır (künye bloğundan sonra).
  for (let i = (headingIdx[0] ?? 0) - 1; i >= 0 && isTitleLine(lines[i]); i--) {
    pendingTitle.unshift(lines[i].trim());
  }

  for (let h = 0; h < headingIdx.length; h++) {
    const start = headingIdx[h];
    const end = h + 1 < headingIdx.length ? headingIdx[h + 1] : lines.length;
    const match = lines[start].match(HEADING)!;
    const prefix = match[1] ? (/^ek$/i.test(match[1]) ? "Ek " : "Geçici ") : "";
    const madde_no = prefix + match[2].toUpperCase() + (match[3] ? `-${match[3]}` : "");

    const body = [lines[start].slice(match[0].length), ...lines.slice(start + 1, end)];
    while (body.length && !body[body.length - 1].trim()) body.pop();

    // Gövdenin sonundaki başlık satırları bir sonraki maddeye aittir.
    const nextTitle: string[] = [];
    if (h + 1 < headingIdx.length) {
      while (body.length > 1 && isTitleLine(body[body.length - 1])) {
        nextTitle.unshift(body.pop()!.trim());
        while (body.length && !body[body.length - 1].trim()) body.pop();
      }
    }

    const icerik = body.map((l) => l.trim()).filter(Boolean).join("\n");
    // Bölüm adları ("BİRİNCİ KISIM") başlığı uzatmasın; en yakın iki satır yeterli.
    const baslik = pendingTitle.slice(-2).join(" / ") || null;
    result.push({ kanun_no, kanun_adi, madde_no, baslik, icerik });
    pendingTitle = nextTitle;
  }

  return result;
}

function listTxtFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return listTxtFiles(full);
    return e.name.endsWith(".txt") ? [full] : [];
  });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const dataDir = path.join(__dirname, "..", "setup-data");
  const files = listTxtFiles(dataDir).sort();

  const all: ParsedMadde[] = [];
  for (const file of files) {
    const maddeler = parseKanun(fs.readFileSync(file, "utf8"), path.basename(file));
    const seen = new Map<string, number>();
    for (const m of maddeler) seen.set(m.madde_no, (seen.get(m.madde_no) ?? 0) + 1);
    const dupes = [...seen].filter(([, n]) => n > 1).map(([no]) => no);
    console.log(
      `${maddeler[0]?.kanun_no ?? "?"}  ${String(maddeler.length).padStart(5)} madde  ${maddeler[0]?.kanun_adi ?? path.basename(file)}` +
        (dupes.length ? `  ⚠ tekrar eden: ${dupes.join(", ")}` : ""),
    );
    // Aynı numara tekrar ederse ilk geçen asıl maddedir; sonrakiler alıntı/değişiklik metnidir.
    all.push(...maddeler.filter((m, i, arr) => arr.findIndex((x) => x.madde_no === m.madde_no) === i));
  }
  console.log(`toplam: ${all.length} madde, ${files.length} kanun`);

  if (dryRun) {
    const sample = (k: string, no: string) => all.find((m) => m.kanun_no === k && m.madde_no === no);
    for (const [k, no] of [["4721", "1"], ["4721", "2"], ["4721", "Geçici 1"], ["6698", "5"], ["5846", "1/A"]]) {
      const m = sample(k, no);
      console.log(`\n--- ${k} md. ${no} | başlık: ${m?.baslik}\n${m?.icerik.slice(0, 200)}`);
    }
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL ve SUPABASE_SECRET_KEY .env içinde tanımlı olmalı");
  }
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const existing = new Map<string, { kanun_adi: string; baslik: string | null; icerik: string }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("kanun_maddeleri")
      .select("kanun_no, kanun_adi, madde_no, baslik, icerik")
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) existing.set(`${r.kanun_no}|${r.madde_no}`, r);
    if (!data || data.length < 1000) break;
  }

  const changed = all.filter((m) => {
    const old = existing.get(`${m.kanun_no}|${m.madde_no}`);
    return !old || old.icerik !== m.icerik || old.baslik !== m.baslik || old.kanun_adi !== m.kanun_adi;
  });
  console.log(`yeni veya değişen: ${changed.length} madde`);

  for (let i = 0; i < changed.length; i += 200) {
    const rows = changed
      .slice(i, i + 200)
      .map((m) => ({ ...m, embedding: null, embedding_bge_m3: null }));
    const { error } = await db.from("kanun_maddeleri").upsert(rows, { onConflict: "kanun_no,madde_no" });
    if (error) throw new Error(error.message);
    console.log(`yazıldı: ${Math.min(i + 200, changed.length)}/${changed.length}`);
  }
  console.log("tamamlandı. Embedding'ler için: npm run embed");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("[import] hata:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
