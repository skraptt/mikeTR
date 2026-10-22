// mikeTR: hesaplama araçları. Süre hesabını model kafadan yapmaz; bu araç
// kanundaki kurallara göre son günü ve dayandığı maddeleri verir.

import { SureHesabiHatasi, sureHesapla, BAYRAM_TABLOSU_YILLARI } from "../../../../lib/sureHesap";

export const HESAP_TOOL_NAMES = {
  sure: "calculate_deadline",
} as const;

export const HESAP_SYSTEM_PROMPT = `DEADLINE CALCULATION (calculate_deadline):
- Whenever an answer depends on when a legal period ends (itiraz, istinaf, temyiz, cevap, ihtar, ödeme süresi, etc.), call calculate_deadline instead of counting days yourself. Give it the start date (the day of notification, pronouncement or contract), the length and unit, and the governing law: hmk for civil procedure, iik for enforcement and bankruptcy, cmk for criminal procedure, tbk for contractual periods.
- Set adli_tatile_tabi to false for matters HMK md. 103 excludes from the judicial recess (e.g. interim measures, maintenance, employee lawsuits, bankruptcy) and for detained (tutuklu) criminal matters.
- State the resulting last day with its weekday, explain the steps briefly with the articles the tool cites, and pass on its warnings. If the user has not given a start date, ask for it rather than assuming one.
- The tool knows public and religious holidays for ${BAYRAM_TABLOSU_YILLARI[0]}-${BAYRAM_TABLOSU_YILLARI[BAYRAM_TABLOSU_YILLARI.length - 1]}.`;

export const HESAP_TOOLS = [
  {
    type: "function",
    function: {
      name: HESAP_TOOL_NAMES.sure,
      description:
        "Calculates the last day of a Turkish legal period under HMK, İİK, CMK or TBK: excludes the start day, applies week/month/year rules, moves a last day off weekends and public holidays, and applies the judicial recess (20 July - 31 August). Returns the last day, the steps with the articles they rest on, and warnings.",
      parameters: {
        type: "object",
        properties: {
          baslangic: { type: "string", description: "Start date (notification, pronouncement or contract), YYYY-MM-DD." },
          sure: { type: "integer", description: "Length of the period, e.g. 2 for two weeks." },
          birim: { type: "string", enum: ["gun", "hafta", "ay", "yil"], description: "Unit: gun (days), hafta (weeks), ay (months), yil (years)." },
          rejim: { type: "string", enum: ["hmk", "iik", "cmk", "tbk"], description: "Governing law: hmk, iik, cmk or tbk." },
          adli_tatile_tabi: {
            type: "boolean",
            description: "Whether the matter is subject to the judicial recess (HMK and CMK only). Default true.",
          },
        },
        required: ["baslangic", "sure", "birim", "rejim"],
      },
    },
  },
];

export function runSureHesabi(args: Record<string, unknown>): string {
  try {
    const sonuc = sureHesapla({
      baslangic: String(args.baslangic ?? ""),
      sure: Number(args.sure),
      birim: String(args.birim ?? "") as never,
      rejim: String(args.rejim ?? "") as never,
      adliTatileTabi: typeof args.adli_tatile_tabi === "boolean" ? args.adli_tatile_tabi : undefined,
    });
    return JSON.stringify({
      son_gun: sonuc.sonGun,
      son_gun_yazili: sonuc.sonGunAdi,
      adimlar: sonuc.adimlar,
      uyarilar: sonuc.uyarilar,
    });
  } catch (error) {
    if (error instanceof SureHesabiHatasi) return JSON.stringify({ hata: error.message });
    throw error;
  }
}
