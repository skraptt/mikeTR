// mikeTR değerlendirme seti (evals/tr-legal/sorular.yaml) çalıştırıcısı.
//
// Her soruyu, uygulamadaki asistanla aynı sistem talimatı, aynı araçlar
// (mevzuat, içtihat, süre/faiz/harç) ve aynı model katmanıyla, yeni bir
// sohbetmiş gibi sorar; cevabı, kullanılan araçları ve atıf kontrolünü kaydeder
// ve otomatik ölçülebilen kısmı puanlar. Hukuki noktalar ve tuzaklar elle
// puanlanmak üzere rapora yazılır.
//
//   npm run eval -- --model gemini-3.8-flash
//   npm run eval -- --model ollama/qwen3:8b --ids kira-01,hesap-01
//   npm run eval -- --model gemini-3.8-flash --devam --bekle 60
//
// --bekle: sorular arasında beklenecek saniye (varsayılan 20). Kota veya yoğunluk
// hatasında soru 1, 2 ve 4 dakika bekleyerek yeniden denenir; yine olmazsa
// "çalışmadı" sayılır ve toplama girmez. --devam: aynı modelin en son sonuç
// dosyasındaki başarılı cevapları korur, yalnızca çalışmayanları yeniden sorar.
//
// Sonuçlar evals/tr-legal/sonuclar/<model>-<tarih>.{json,md} dosyalarına yazılır.
// Ücretsiz katman anahtarlarıyla gönderilen metinler sağlayıcı tarafından
// kullanılabilir; sorular gerçek müvekkil verisi içermez.
import "dotenv/config";
import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";
import type { IctihatDecisionEvent, IctihatSearchEvent } from "@mike/contracts";
import { createServerSupabase } from "../../src/lib/supabase";
import {
  streamChatWithTools,
  type NormalizedToolCall,
  type NormalizedToolResult,
} from "../../src/lib/llm";
import { buildSystemPrompt } from "../../src/modules/chat/engine/prompts";
import {
  KANUN_TOOLS,
  KANUN_TOOL_NAMES,
  runKanunSearch,
} from "../../src/modules/chat/engine/tools/kanunTools";
import {
  ICTIHAT_TOOLS,
  ICTIHAT_TOOL_NAMES,
  retrievedDecisions,
  runGetKarar,
  runIctihatSearch,
} from "../../src/modules/chat/engine/tools/ictihatTools";
import {
  HESAP_TOOLS,
  HESAP_TOOL_NAMES,
  runFaizHesabi,
  runHarcHesabi,
  runSureHesabi,
  runTazminatHesabi,
} from "../../src/modules/chat/engine/tools/hesapTools";
import { checkStatuteCitations } from "../../src/lib/citationCheck";
import { checkCaseCitations } from "../../src/lib/ictihat/citationCheck";

type Soru = {
  id: string;
  alan: string;
  soru: string;
  beklenen_maddeler?: { kanun: string; madde: string }[];
  beklenen_noktalar?: string[];
  tuzaklar?: string[];
  kapsam_disi?: boolean;
  ictihat?: { mahkeme: string };
  hesap?: { arac: string; beklenen?: string };
  guncellik?: boolean;
};

type AracKaydi = { ad: string; girdi: Record<string, unknown>; hata?: string };

type Sonuc = {
  id: string;
  soru: string;
  cevap: string;
  araclar: AracKaydi[];
  kanunAtiflari: { etiket: string; durum: string }[];
  kararAtiflari: { etiket: string; durum: string }[];
  puan: {
    maddeler: number;
    gereklilik: number;
    uydurma: boolean;
    otomatik: number;
  };
  /** Sağlayıcı hatası yüzünden cevap alınamadı; puan toplamına girmez. */
  calismadi?: boolean;
  notlar: string[];
  sureMs: number;
  hata?: string;
};

const ROOT = path.join(__dirname, "..", "..", "..");
const NOT_DOGRULANMADI = "veritabanındaki kanun metinleriyle doğrulanmamıştır";
// Sağlayıcının geçici hataları: yeniden denenir, kalırsa soru puanlanmaz.
const GECICI_HATA =
  /rate limit|quota|high demand|stopped responding|overloaded|429|503|timed out|timeout|abort/i;
const DENEME_SURESI_MS = 10 * 60 * 1000;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const TARIH_YAZISI: Record<string, string> = {};
function tarihYazisiVar(cevap: string, iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  const aylar = [
    "Ocak",
    "Şubat",
    "Mart",
    "Nisan",
    "Mayıs",
    "Haziran",
    "Temmuz",
    "Ağustos",
    "Eylül",
    "Ekim",
    "Kasım",
    "Aralık",
  ];
  TARIH_YAZISI[iso] = `${d} ${aylar[m - 1]} ${y}`;
  const nokta = `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
  return (
    cevap.includes(TARIH_YAZISI[iso]) ||
    cevap.includes(nokta) ||
    cevap.includes(`${d}.${m}.${y}`)
  );
}

async function soruCalistir(
  db: ReturnType<typeof createServerSupabase>,
  model: string,
  q: Soru,
): Promise<Sonuc> {
  const baslangic = Date.now();
  const araclar: AracKaydi[] = [];
  const getirilenMaddeler = new Set<string>();
  const ictihatOlaylari: (IctihatSearchEvent | IctihatDecisionEvent)[] = [];

  const runTools = async (
    calls: NormalizedToolCall[],
  ): Promise<NormalizedToolResult[]> => {
    const out: NormalizedToolResult[] = [];
    for (const call of calls) {
      const kayit: AracKaydi = { ad: call.name, girdi: call.input };
      araclar.push(kayit);
      let content: string;
      try {
        if (call.name === KANUN_TOOL_NAMES.search) {
          const r = await runKanunSearch(db, call.input);
          for (const hit of r.event.results)
            getirilenMaddeler.add(`${hit.kanun_no}|${hit.madde_no}`);
          content = r.content;
        } else if (call.name === ICTIHAT_TOOL_NAMES.search) {
          const r = await runIctihatSearch(call.input);
          ictihatOlaylari.push(r.event);
          content = r.content;
        } else if (call.name === ICTIHAT_TOOL_NAMES.read) {
          const r = await runGetKarar(call.input);
          ictihatOlaylari.push(r.event);
          content = r.content;
        } else if (call.name === HESAP_TOOL_NAMES.sure)
          content = runSureHesabi(call.input);
        else if (call.name === HESAP_TOOL_NAMES.faiz)
          content = runFaizHesabi(call.input);
        else if (call.name === HESAP_TOOL_NAMES.harc)
          content = runHarcHesabi(call.input);
        else if (call.name === HESAP_TOOL_NAMES.kidem)
          content = runTazminatHesabi(call.input);
        else content = JSON.stringify({ error: `Unknown tool ${call.name}` });
      } catch (error) {
        kayit.hata = error instanceof Error ? error.message : String(error);
        content = JSON.stringify({ error: kayit.hata });
      }
      out.push({ tool_use_id: call.id, content });
    }
    return out;
  };

  const bugun = new Date().toISOString().slice(0, 10);
  let cevap = "";
  let hata: string | undefined;
  for (let deneme = 0; deneme < 4; deneme++) {
    if (deneme > 0) {
      const bekle = 60 * 2 ** (deneme - 1);
      process.stdout.write(`(kota/yoğunluk, ${bekle} sn bekleniyor) `);
      await new Promise((r) => setTimeout(r, bekle * 1000));
      araclar.length = 0;
      getirilenMaddeler.clear();
      ictihatOlaylari.length = 0;
    }
    hata = undefined;
    try {
      const result = await streamChatWithTools({
        model,
        systemPrompt: `${buildSystemPrompt(false)}\n\nToday's date is ${bugun}.`,
        messages: [{ role: "user", content: q.soru }],
        tools: [...KANUN_TOOLS, ...ICTIHAT_TOOLS, ...HESAP_TOOLS] as never,
        maxIterations: 10,
        // Yanıt vermeyi bırakan bir sağlayıcı soruyu saatlerce bekletmesin.
        abortSignal: AbortSignal.timeout(DENEME_SURESI_MS),
        runTools,
      });
      cevap = result.fullText;
    } catch (error) {
      hata = error instanceof Error ? error.message : String(error);
    }
    if (!hata || !GECICI_HATA.test(hata)) break;
  }

  const kanun = cevap
    ? await checkStatuteCitations(cevap, getirilenMaddeler, db)
    : [];
  const karar = cevap
    ? checkCaseCitations(cevap, retrievedDecisions(ictihatOlaylari))
    : [];
  const notlar: string[] = [];

  // Beklenen maddeler (0-3)
  const atifSet = new Set(
    kanun.filter((c) => c.kanun_no).map((c) => `${c.kanun_no}|${c.madde_no}`),
  );
  const beklenen = q.beklenen_maddeler ?? [];
  const bulunan = beklenen.filter((m) => atifSet.has(`${m.kanun}|${m.madde}`));
  const maddeler = beklenen.length
    ? Math.round(((3 * bulunan.length) / beklenen.length) * 10) / 10
    : 3;
  for (const m of beklenen)
    if (!atifSet.has(`${m.kanun}|${m.madde}`))
      notlar.push(`Beklenen madde atfı yok: ${m.kanun} md. ${m.madde}`);

  // Soruya özgü gereklilik (0-2): içtihat, hesap, kapsam dışı
  let gereklilik = 2;
  if (q.ictihat) {
    const aradi = araclar.some((a) => a.ad === ICTIHAT_TOOL_NAMES.search);
    const okudu = araclar.some((a) => a.ad === ICTIHAT_TOOL_NAMES.read);
    if (!aradi || !okudu) {
      gereklilik = aradi ? 1 : 0;
      notlar.push(
        aradi ? "İçtihat aradı ama karar okumadı." : "İçtihat aramadı.",
      );
    }
  }
  if (q.hesap) {
    const kullandi = araclar.some((a) => a.ad === q.hesap!.arac);
    if (!kullandi) {
      gereklilik = 0;
      notlar.push(`${q.hesap.arac} aracını kullanmadı.`);
    } else if (q.hesap.beklenen && !tarihYazisiVar(cevap, q.hesap.beklenen)) {
      gereklilik = 1;
      notlar.push(`Beklenen sonuç (${q.hesap.beklenen}) cevapta yok.`);
    }
  }
  if (q.kapsam_disi && !cevap.includes(NOT_DOGRULANMADI)) {
    gereklilik = Math.min(gereklilik, 1);
    notlar.push("Kapsam dışı uyarısını eklemedi.");
  }

  // Sıfırlayan hata: veritabanında olmayan madde ya da kaynaksız karar künyesi
  const uydurma =
    kanun.some((c) => c.status === "bulunamadi") ||
    karar.some((c) => c.status === "kaynaksiz");
  if (uydurma)
    notlar.push(
      "Uydurma atıf: veritabanında olmayan madde ya da kaynaksız karar künyesi.",
    );
  const okunmadi =
    kanun.filter((c) => c.status === "okunmadi").length +
    karar.filter((c) => c.status === "okunmadi").length;
  if (okunmadi)
    notlar.push(`${okunmadi} atıf, aranmadan ya da okunmadan yapılmış.`);
  if (hata) notlar.push(`Hata: ${hata}`);

  return {
    id: q.id,
    soru: q.soru,
    cevap,
    araclar,
    kanunAtiflari: kanun.map((c) => ({ etiket: c.label, durum: c.status })),
    kararAtiflari: karar.map((c) => ({ etiket: c.label, durum: c.status })),
    puan: {
      maddeler,
      gereklilik,
      uydurma,
      otomatik: uydurma || hata ? 0 : maddeler + gereklilik,
    },
    notlar,
    sureMs: Date.now() - baslangic,
    ...(hata ? { hata } : {}),
    ...(hata && !cevap ? { calismadi: true } : {}),
  };
}

function rapor(model: string, sonuclar: Sonuc[], sorular: Soru[]): string {
  const tamam = sonuclar.filter((s) => !s.calismadi);
  const toplam = tamam.reduce((t, s) => t + s.puan.otomatik, 0);
  const satirlar = sonuclar.map((s) => {
    if (s.calismadi) return `| ${s.id} | çalışmadı | — | — | ${s.hata ?? ""} |`;
    const kanunOzet =
      s.kanunAtiflari.map((c) => `${c.etiket} (${c.durum})`).join(", ") || "—";
    const araclar = [...new Set(s.araclar.map((a) => a.ad))].join(", ") || "—";
    return `| ${s.id} | ${s.puan.otomatik}/5${s.puan.uydurma ? " ⚠" : ""} | ${araclar} | ${kanunOzet} | ${s.notlar.join(" ") || "—"} |`;
  });
  const ayrintilar = sonuclar.map((s) => {
    const q = sorular.find((x) => x.id === s.id)!;
    return [
      `### ${s.id}`,
      `**Soru:** ${s.soru}`,
      "",
      "**Elle puanlanacak noktalar (0-3):**",
      ...(q.beklenen_noktalar ?? []).map((n) => `- [ ] ${n}`),
      "",
      "**Tuzaklar (0-2):**",
      ...(q.tuzaklar ?? []).map((n) => `- [ ] ${n}`),
      "",
      "**Cevap:**",
      "",
      s.cevap
        ? s.cevap
            .split("\n")
            .map((l) => `> ${l}`)
            .join("\n")
        : "> (cevap yok)",
      "",
    ].join("\n");
  });
  return [
    `# mikeTR değerlendirmesi: ${model}`,
    "",
    `Tarih: ${new Date().toISOString().slice(0, 16).replace("T", " ")} · ${tamam.length}/${sonuclar.length} soru cevaplandı · otomatik puan ${toplam.toFixed(1)}/${tamam.length * 5}`,
    "",
    "Otomatik puan (0-5): beklenen maddelere atıf (0-3) + soruya özgü gereklilik (0-2: içtihat okuma, hesap aracı, kapsam dışı uyarısı). Uydurma atıf (⚠) puanı sıfırlar. Hukuki noktalar (0-3) ve tuzaklar (0-2) aşağıda elle puanlanır.",
    "",
    "| Soru | Otomatik | Araçlar | Kanun atıfları | Notlar |",
    "|---|---|---|---|---|",
    ...satirlar,
    "",
    "## Cevaplar",
    "",
    ...ayrintilar,
  ].join("\n");
}

async function main() {
  const model = arg("model");
  if (!model)
    throw new Error("Kullanım: npm run eval -- --model <model-id> [--ids a,b]");
  const ids = arg("ids")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const set = parseYaml(
    fs.readFileSync(path.join(ROOT, "evals/tr-legal/sorular.yaml"), "utf8"),
  ) as { sorular: Soru[] };
  const sorular = ids
    ? set.sorular.filter((q) => ids.includes(q.id))
    : set.sorular;
  if (!sorular.length) throw new Error("Seçilen soru yok.");

  const bekleSn = Number(arg("bekle") ?? 20);
  const dir = path.join(ROOT, "evals/tr-legal/sonuclar");
  fs.mkdirSync(dir, { recursive: true });
  const onEk = model.replace(/[^a-zA-Z0-9.-]+/g, "_");
  const ad = `${onEk}-${new Date().toISOString().slice(0, 10)}`;

  // --devam: en son sonuç dosyasındaki cevaplanmış soruları koru.
  const onceki = new Map<string, Sonuc>();
  if (process.argv.includes("--devam")) {
    const dosya = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(`${onEk}-`) && f.endsWith(".json"))
      .sort()
      .pop();
    if (dosya) {
      for (const s of (
        JSON.parse(fs.readFileSync(path.join(dir, dosya), "utf8")) as {
          sonuclar: Sonuc[];
        }
      ).sonuclar) {
        if (!s.calismadi && !s.hata) onceki.set(s.id, s);
      }
      console.log(`${dosya}: ${onceki.size} cevap korunuyor.`);
    }
  }

  const db = createServerSupabase();
  const sonuclar: Sonuc[] = [];
  let ilk = true;
  let art_arda = 0;
  const BOS: Sonuc = {
    id: "",
    soru: "",
    cevap: "",
    araclar: [],
    kanunAtiflari: [],
    kararAtiflari: [],
    puan: { maddeler: 0, gereklilik: 0, uydurma: false, otomatik: 0 },
    notlar: [],
    sureMs: 0,
  };
  for (const q of sorular) {
    const eski = onceki.get(q.id);
    if (eski) {
      sonuclar.push(eski);
      continue;
    }
    if (art_arda >= 2) {
      // Kota bitti: kalan soruları boşuna bekleyerek denemeyin.
      sonuclar.push({ ...BOS, id: q.id, soru: q.soru, calismadi: true, hata: "Kota dolu; sorulmadı." });
      continue;
    }
    if (!ilk && bekleSn > 0)
      await new Promise((r) => setTimeout(r, bekleSn * 1000));
    ilk = false;
    process.stdout.write(`${q.id} ... `);
    const s = await soruCalistir(db, model, q);
    sonuclar.push(s);
    art_arda = s.calismadi && /rate limit|quota/i.test(s.hata ?? "") ? art_arda + 1 : 0;
    if (art_arda >= 2) console.log("İki soru üst üste kota hatası verdi; kalan sorular sorulmadan bırakılıyor (--devam ile sonra tamamlanır).");
    console.log(
      `${s.calismadi ? "çalışmadı" : `${s.puan.otomatik}/5`} (${Math.round(s.sureMs / 1000)} sn)${s.notlar.length ? " — " + s.notlar.join(" ") : ""}`,
    );
  }

  fs.writeFileSync(
    path.join(dir, `${ad}.json`),
    JSON.stringify(
      { model, tarih: new Date().toISOString(), sonuclar },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(dir, `${ad}.md`), rapor(model, sonuclar, sorular));
  const tamam = sonuclar.filter((s) => !s.calismadi);
  const toplam = tamam.reduce((t, s) => t + s.puan.otomatik, 0);
  console.log(
    `\n${tamam.length}/${sonuclar.length} soru cevaplandı · otomatik puan ${toplam.toFixed(1)}/${tamam.length * 5} → evals/tr-legal/sonuclar/${ad}.md`,
  );
}

main().catch((error) => {
  console.error("[eval] hata:", error instanceof Error ? error.message : error);
  process.exit(1);
});
