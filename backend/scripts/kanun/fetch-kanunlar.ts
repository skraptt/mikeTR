// lib/kanunList.ts'deki kanunlardan dizinde hiç maddesi olmayanları
// mevzuat.gov.tr'nin işlenmiş metninden indirip kanun_maddeleri tablosuna yazar
// ve kanunlar tablosuna kaydeder. Var olan kanunlara dokunmaz; onları günlük
// kontrol günceller. Ardından `npm run kanun:embed` çalıştırılır.
//
//   npm run kanun:fetch -- --dry-run          (veritabanına yazmadan özet)
//   npm run kanun:fetch                       (eksik kanunların hepsi)
//   npm run kanun:fetch -- 4857 2004          (yalnızca bu kanunlar)
import "dotenv/config";
import { createServerSupabase } from "../../src/lib/supabase";
import { KANUNLAR } from "../../src/lib/kanunList";
import { fetchKanunHtml, parseKanunHtml } from "../../src/lib/kanunSync";
import { dedupeMaddeler } from "../../src/lib/kanunParser";

// mevzuat.gov.tr'yi yormamak için istekler arasında bekle.
const PAUSE_MS = 2_000;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const wanted = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
  const db = createServerSupabase();

  const present = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("kanun_maddeleri")
      .select("kanun_no")
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) present.add(r.kanun_no);
    if (!data || data.length < 1000) break;
  }

  const targets = KANUNLAR.filter((k) =>
    wanted.length ? wanted.includes(k.no) : !present.has(k.no),
  );
  if (!targets.length) {
    console.log("eksik kanun yok.");
    return;
  }

  let total = 0;
  for (const [i, kanun] of targets.entries()) {
    if (i) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    if (present.has(kanun.no)) {
      console.log(`${kanun.no}  zaten dizinde; atlandı (güncellemeler günlük kontrolle gelir)`);
      continue;
    }
    const html = await fetchKanunHtml({ kanun_no: kanun.no, mevzuat_tur: 1, mevzuat_tertip: kanun.tertip });
    // Ayrıştırıcının bulduğu başlık dipnot işaretleri taşıyabilir; ad listeden gelir.
    const maddeler = dedupeMaddeler(parseKanunHtml(html, kanun.no)).map((m) => ({ ...m, kanun_adi: kanun.adi }));
    if (maddeler.length < 5) throw new Error(`${kanun.no}: yalnızca ${maddeler.length} madde ayrıştırıldı`);
    console.log(`${kanun.no.padEnd(5)} ${String(maddeler.length).padStart(4)} madde  ${kanun.adi}`);
    total += maddeler.length;
    if (dryRun) continue;

    const now = new Date().toISOString();
    const { error: kanunError } = await db.from("kanunlar").upsert(
      { kanun_no: kanun.no, kanun_adi: kanun.adi, mevzuat_tertip: kanun.tertip, guncellik_tarihi: now, son_kontrol: now },
      { onConflict: "kanun_no" },
    );
    if (kanunError) throw new Error(`${kanun.no}: ${kanunError.message}`);
    for (let j = 0; j < maddeler.length; j += 200) {
      const rows = maddeler.slice(j, j + 200).map((m) => ({ ...m, embedding: null, embedding_bge_m3: null }));
      const { error } = await db.from("kanun_maddeleri").upsert(rows, { onConflict: "kanun_no,madde_no" });
      if (error) throw new Error(`${kanun.no}: ${error.message}`);
    }
  }
  console.log(`toplam: ${total} madde, ${targets.length} kanun${dryRun ? " (deneme, yazılmadı)" : ""}`);
  if (!dryRun) console.log("Embedding'ler için: npm run kanun:embed");
}

main().catch((error) => {
  console.error("[kanun:fetch] hata:", error instanceof Error ? error.message : error);
  process.exit(1);
});
