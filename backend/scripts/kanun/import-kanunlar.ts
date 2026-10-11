// setup-data altındaki kanun metinlerini maddelere ayırıp kanun_maddeleri tablosuna yazar.
// Metni değişen maddelerin embedding'leri sıfırlanır; ardından `npm run kanun:embed` çalıştırılır.
//
//   npm run kanun:import -- --dry-run     (veritabanına yazmadan özet)
//   npm run kanun:import
import "dotenv/config";
import fs from "fs";
import path from "path";
import { createServerSupabase } from "../../src/lib/supabase";
import { dedupeMaddeler, parseKanun, type ParsedMadde } from "../../src/lib/kanunParser";

export { parseKanun, type ParsedMadde };

function listTxtFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return listTxtFiles(full);
    return e.name.endsWith(".txt") ? [full] : [];
  });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const dataDir = path.join(__dirname, "..", "..", "setup-data");
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
    all.push(...dedupeMaddeler(maddeler));
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

  const db = createServerSupabase();

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
  console.log("tamamlandı. Embedding'ler için: npm run kanun:embed");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("[import] hata:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
