// Projeyle gelen kanun veri paketini veritabanından yeniden üretir:
//   setup-data/kanun-maddeleri.csv.gz  madde metinleri ve BGE-M3 vektörleri
//   setup-data/kanunlar-guncellik.csv  her kanunun son doğrulanma tarihi
// Yeni bir yerel kurulumda docker/db-init/load-kanunlar.sh bu dosyaları yükler.
//
//   npm run kanun:snapshot
//
// Güncellemeleri onayladıktan sonra çalıştırın; bekleyen değişiklik varken
// paket mevzuat.gov.tr'nin gerisinde kalır.
import "dotenv/config";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { createServerSupabase } from "../../src/lib/supabase";

type Row = {
  kanun_no: string;
  kanun_adi: string;
  madde_no: string;
  baslik: string | null;
  icerik: string;
  embedding_bge_m3: string | number[] | null;
};

const PAGE = 500;
// Dört basamak, kosinüs benzerliğini binde birden az değiştirir ve paketi yarıya indirir.
const DECIMALS = 4;

function csvField(value: string | null): string {
  if (value === null || value === "") return "";
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function vectorText(raw: Row["embedding_bge_m3"]): string {
  const values: number[] = typeof raw === "string" ? JSON.parse(raw) : raw ?? [];
  return `[${values.map((x) => Number(x.toFixed(DECIMALS)).toString()).join(",")}]`;
}

async function main() {
  const db = createServerSupabase();

  const { count, error: pendingError } = await db
    .from("kanun_degisiklikleri")
    .select("id", { count: "exact", head: true })
    .eq("durum", "beklemede");
  if (pendingError) throw new Error(pendingError.message);
  if (count) console.warn(`uyarı: ${count} bekleyen değişiklik var; paket bunları içermez.`);

  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("kanun_maddeleri")
      .select("kanun_no, kanun_adi, madde_no, baslik, icerik, embedding_bge_m3")
      .order("kanun_no")
      .order("madde_no")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data as Row[]));
    if (data.length < PAGE) break;
  }
  const missing = rows.filter((r) => !r.embedding_bge_m3).length;
  if (missing) throw new Error(`${missing} maddenin vektörü yok; önce npm run kanun:embed çalıştırın.`);

  const { data: laws, error: lawError } = await db
    .from("kanunlar")
    .select("kanun_no, guncellik_tarihi, son_kontrol")
    .order("kanun_no");
  if (lawError) throw new Error(lawError.message);

  const dir = path.join(__dirname, "..", "..", "setup-data");
  const csv = rows
    .map((r) =>
      [r.kanun_no, r.kanun_adi, r.madde_no, r.baslik, r.icerik, vectorText(r.embedding_bge_m3)]
        .map(csvField)
        .join(","),
    )
    .join("\n");
  fs.writeFileSync(path.join(dir, "kanun-maddeleri.csv.gz"), zlib.gzipSync(`${csv}\n`, { level: 9 }));
  fs.writeFileSync(
    path.join(dir, "kanunlar-guncellik.csv"),
    (laws ?? [])
      .map((l) => [l.kanun_no, l.guncellik_tarihi ?? "", l.son_kontrol ?? ""].join(","))
      .join("\n") + "\n",
  );
  console.log(`${rows.length} madde ve ${laws?.length ?? 0} kanun yazıldı: ${dir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
