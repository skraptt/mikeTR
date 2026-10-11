// Compares every law in the index with its current text on mevzuat.gov.tr
// and queues differences for review (they are approved on the Statutes ›
// Updates page). The worker runs the same check daily.
//
//   npm run kanun:check
import "dotenv/config";
import { createServerSupabase } from "../../src/lib/supabase";
import { runStatuteCheck } from "../../src/modules/kanun/kanun.service";

async function main() {
  const results = await runStatuteCheck(createServerSupabase());
  for (const r of results) {
    console.log(
      `${r.kanun_no}  ${r.hata ? `HATA: ${r.hata}` : `bekleyen: ${r.bekleyen} (bu kontrolde yeni: ${r.yeni_bulunan})`}`,
    );
  }
  const pending = results.reduce((sum, r) => sum + r.bekleyen, 0);
  console.log(`\ntoplam bekleyen değişiklik: ${pending}`);
  if (results.some((r) => r.hata)) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[kanun:check]", error instanceof Error ? error.message : error);
  process.exit(1);
});
