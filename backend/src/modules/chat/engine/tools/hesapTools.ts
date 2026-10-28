// mikeTR: hesaplama araçları (süre, faiz, harç, kıdem/ihbar tazminatı). Model bunları kafadan
// yapmaz; araçlar kanundaki kurallarla sonucu ve dayandığı maddeleri verir.

import {
  SureHesabiHatasi,
  sureHesapla,
  BAYRAM_TABLOSU_YILLARI,
} from "../../../../lib/sureHesap";
import {
  FaizHesabiHatasi,
  faizHesapla,
  TCMB_TABLO_TARIHI,
} from "../../../../lib/faizHesap";
import {
  HARC_TARIFE_YILI,
  HarcHesabiHatasi,
  harcHesapla,
} from "../../../../lib/harcHesap";
import {
  KIDEM_TAVAN_TABLO_TARIHI,
  TazminatHesabiHatasi,
  tazminatHesapla,
} from "../../../../lib/tazminatHesap";
import type { HesapSonucuEvent } from "@mike/contracts";
import {
  faizHesabi,
  harcHesabi,
  sureHesabi,
  tazminatHesabi,
} from "../../../hesap/hesap.service";

export const HESAP_TOOL_NAMES = {
  sure: "calculate_deadline",
  faiz: "calculate_interest",
  harc: "calculate_court_fees",
  kidem: "calculate_severance",
} as const;

export const HESAP_SYSTEM_PROMPT = `DEADLINE CALCULATION (calculate_deadline):
- Whenever an answer depends on when a legal period ends (itiraz, istinaf, temyiz, cevap, ihtar, ödeme süresi, etc.), call calculate_deadline instead of counting days yourself. Give it the start date (the day of notification, pronouncement or contract), the length and unit, and the governing law: hmk for civil procedure, iik for enforcement and bankruptcy, cmk for criminal procedure, tbk for contractual periods.
- Set adli_tatile_tabi to false for matters HMK md. 103 excludes from the judicial recess (e.g. interim measures, maintenance, employee lawsuits, bankruptcy) and for detained (tutuklu) criminal matters.
- State the resulting last day with its weekday, explain the steps briefly with the articles the tool cites, and pass on its warnings. If the user has not given a start date, ask for it rather than assuming one.
- The tool knows public and religious holidays for ${BAYRAM_TABLOSU_YILLARI[0]}-${BAYRAM_TABLOSU_YILLARI[BAYRAM_TABLOSU_YILLARI.length - 1]}.

INTEREST CALCULATION (calculate_interest):
- For statutory interest (kanuni faiz) or commercial default interest (ticari temerrüt faizi, avans faizi) under Law 3095, call calculate_interest instead of computing it yourself. Use tur "ticari" only for commercial matters; otherwise "kanuni". If a contract sets its own rate, say so: the tool does not cover contractual interest.
- Present the total and the periods with their rates and legal basis as returned, and pass on the warnings. The TCMB rate table was last checked on ${TCMB_TABLO_TARIHI}; statutory interest has been 80% of the TCMB rediscount rate since 31.7.2026 (Law 7589).

COURT FEES (calculate_court_fees):
- For the court fees due when filing a lawsuit (başvurma harcı, peşin harç, karar ve ilam harcı), call calculate_court_fees instead of computing them. Give the court (sulh or asliye) and, for money claims, the claim value; leave the value out for claims without a money value. Use the ${HARC_TARIFE_YILI} tariff it applies, list the items with their basis, and pass on the warnings (it excludes gider avansı and vekâlet harcı).

SEVERANCE AND NOTICE PAY (calculate_severance):
- For kıdem tazminatı (Law 1475 md. 14) or ihbar tazminatı (Law 4857 md. 17), call calculate_severance instead of computing them. Give the start and end dates of employment and the last monthly gross wage including regular benefits (giydirilmiş brüt ücret). Set ihbar to false when notice pay is not in question (e.g. the employee resigned with notice, or the contract was terminated for just cause).
- The tool applies the severance ceiling (kıdem tazminatı tavanı) in force on the end date; the ceiling table was last checked on ${KIDEM_TAVAN_TABLO_TARIHI}. Present the service period, gross and net amounts with their deductions and basis, and pass on the warnings, especially whether the termination reason gives a right to severance at all. If the user has not given the dates or the wage, ask for them.`;

const SURE_TOOL = {
  type: "function",
  function: {
    name: HESAP_TOOL_NAMES.sure,
    description:
      "Calculates the last day of a Turkish legal period under HMK, İİK, CMK or TBK: excludes the start day, applies week/month/year rules, moves a last day off weekends and public holidays, and applies the judicial recess (20 July - 31 August). Returns the last day, the steps with the articles they rest on, and warnings.",
    parameters: {
      type: "object",
      properties: {
        baslangic: {
          type: "string",
          description:
            "Start date (notification, pronouncement or contract), YYYY-MM-DD.",
        },
        sure: {
          type: "integer",
          description: "Length of the period, e.g. 2 for two weeks.",
        },
        birim: {
          type: "string",
          enum: ["gun", "hafta", "ay", "yil"],
          description:
            "Unit: gun (days), hafta (weeks), ay (months), yil (years).",
        },
        rejim: {
          type: "string",
          enum: ["hmk", "iik", "cmk", "tbk"],
          description: "Governing law: hmk, iik, cmk or tbk.",
        },
        adli_tatile_tabi: {
          type: "boolean",
          description:
            "Whether the matter is subject to the judicial recess (HMK and CMK only). Default true.",
        },
      },
      required: ["baslangic", "sure", "birim", "rejim"],
    },
  },
};

const FAIZ_TOOL = {
  type: "function",
  function: {
    name: HESAP_TOOL_NAMES.faiz,
    description:
      "Calculates simple statutory interest (kanuni faiz) or commercial default interest (ticari temerrüt faizi) under Turkish Law 3095 between two dates, splitting the period where the official rate changes. Returns the total, each period's rate and legal basis, and warnings.",
    parameters: {
      type: "object",
      properties: {
        anapara: { type: "number", description: "Principal in Turkish lira." },
        baslangic: {
          type: "string",
          description:
            "Date interest starts running (default, filing or enforcement date), YYYY-MM-DD.",
        },
        bitis: {
          type: "string",
          description: "Date interest is calculated to, YYYY-MM-DD.",
        },
        tur: {
          type: "string",
          enum: ["kanuni", "ticari"],
          description:
            "kanuni (statutory) or ticari (commercial default, TCMB advance rate).",
        },
      },
      required: ["anapara", "baslangic", "bitis", "tur"],
    },
  },
};

const HARC_TOOL = {
  type: "function",
  function: {
    name: HESAP_TOOL_NAMES.harc,
    description:
      "Calculates Turkish court fees due when filing a civil lawsuit under Law 492 (Harçlar Kanunu): application fee, advance proportional or fixed judgment fee, and the remainder due at judgment.",
    parameters: {
      type: "object",
      properties: {
        mahkeme: {
          type: "string",
          enum: ["sulh", "asliye"],
          description:
            "sulh (also icra mahkemesi) or asliye (also idare mahkemesi).",
        },
        deger: {
          type: "number",
          description:
            "Claim value in Turkish lira; omit for claims without a money value.",
        },
        olum_cismani_zarar: {
          type: "boolean",
          description: "True for damages claims for death or bodily injury.",
        },
      },
      required: ["mahkeme"],
    },
  },
};

const KIDEM_TOOL = {
  type: "function",
  function: {
    name: HESAP_TOOL_NAMES.kidem,
    description:
      "Calculates Turkish severance pay (kıdem tazminatı, Law 1475 md. 14) with the ceiling in force on the end date, and notice pay (ihbar tazminatı, Law 4857 md. 17), with stamp duty and income tax deductions. Returns the service period, each item gross and net with its legal basis, the steps and warnings.",
    parameters: {
      type: "object",
      properties: {
        giris: {
          type: "string",
          description: "Employment start date, YYYY-MM-DD.",
        },
        cikis: {
          type: "string",
          description: "Date the employment contract ended, YYYY-MM-DD.",
        },
        brut_ucret: {
          type: "number",
          description:
            "Last monthly gross wage in Turkish lira, including regular benefits (giydirilmiş brüt ücret).",
        },
        ihbar: {
          type: "boolean",
          description: "Also calculate notice pay. Default true.",
        },
        gelir_vergisi_orani: {
          type: "number",
          description:
            "Income tax rate in percent applied to notice pay. Default 15.",
        },
      },
      required: ["giris", "cikis", "brut_ucret"],
    },
  },
};

export const HESAP_TOOLS = [SURE_TOOL, FAIZ_TOOL, HARC_TOOL, KIDEM_TOOL];

function tazminatGirdisi(args: Record<string, unknown>) {
  return {
    giris: String(args.giris ?? ""),
    cikis: String(args.cikis ?? ""),
    brutUcret: Number(args.brut_ucret),
    ihbar: typeof args.ihbar === "boolean" ? args.ihbar : undefined,
    gelirVergisiOrani:
      typeof args.gelir_vergisi_orani === "number"
        ? args.gelir_vergisi_orani
        : undefined,
  };
}

export function runTazminatHesabi(args: Record<string, unknown>): string {
  try {
    const r = tazminatHesapla(tazminatGirdisi(args));
    return JSON.stringify({
      hizmet_suresi: r.hizmetSuresiYazili,
      esas_ucret: r.esasUcret,
      tavan: r.tavan,
      ihbar_suresi_hafta: r.ihbarSuresiHafta,
      kalemler: r.kalemler,
      toplam_brut: r.toplamBrut,
      toplam_net: r.toplamNet,
      adimlar: r.adimlar,
      uyarilar: r.uyarilar,
    });
  } catch (error) {
    if (error instanceof TazminatHesabiHatasi)
      return JSON.stringify({ hata: error.message });
    throw error;
  }
}

export function runHarcHesabi(args: Record<string, unknown>): string {
  try {
    const r = harcHesapla({
      mahkeme: String(args.mahkeme ?? "") as never,
      deger: typeof args.deger === "number" ? args.deger : undefined,
      olumCismaniZarar: args.olum_cismani_zarar === true,
    });
    return JSON.stringify({
      kalemler: r.kalemler,
      acilista_odenecek: r.acilistaOdenecek,
      kalan_karar_harci: r.kalanKararHarci,
      uyarilar: r.uyarilar,
    });
  } catch (error) {
    if (error instanceof HarcHesabiHatasi)
      return JSON.stringify({ hata: error.message });
    throw error;
  }
}

export function runFaizHesabi(args: Record<string, unknown>): string {
  try {
    const r = faizHesapla({
      anapara: Number(args.anapara),
      baslangic: String(args.baslangic ?? ""),
      bitis: String(args.bitis ?? ""),
      tur: String(args.tur ?? "") as never,
    });
    return JSON.stringify({
      anapara: r.anapara,
      toplam_faiz: r.toplamFaiz,
      toplam: r.toplam,
      donemler: r.donemler,
      uyarilar: r.uyarilar,
    });
  } catch (error) {
    if (error instanceof FaizHesabiHatasi)
      return JSON.stringify({ hata: error.message });
    throw error;
  }
}

export function runSureHesabi(args: Record<string, unknown>): string {
  try {
    const sonuc = sureHesapla({
      baslangic: String(args.baslangic ?? ""),
      sure: Number(args.sure),
      birim: String(args.birim ?? "") as never,
      rejim: String(args.rejim ?? "") as never,
      adliTatileTabi:
        typeof args.adli_tatile_tabi === "boolean"
          ? args.adli_tatile_tabi
          : undefined,
    });
    return JSON.stringify({
      son_gun: sonuc.sonGun,
      son_gun_yazili: sonuc.sonGunAdi,
      adimlar: sonuc.adimlar,
      uyarilar: sonuc.uyarilar,
    });
  } catch (error) {
    if (error instanceof SureHesabiHatasi)
      return JSON.stringify({ hata: error.message });
    throw error;
  }
}

/**
 * Runs a calculation tool for the chat: the JSON the model reads, and the
 * result card the chat shows (null when the input was invalid).
 */
export function runHesapAraci(
  name: string,
  args: Record<string, unknown>,
): { content: string; event: HesapSonucuEvent | null } {
  if (name === HESAP_TOOL_NAMES.sure) {
    const r = sureHesabi({ ...args, adliTatileTabi: args.adli_tatile_tabi });
    return {
      content: runSureHesabi(args),
      event: r.ok
        ? { type: "hesap_sonucu", arac: "sure", sonuc: r.data }
        : null,
    };
  }
  if (name === HESAP_TOOL_NAMES.faiz) {
    const r = faizHesabi(args);
    return {
      content: runFaizHesabi(args),
      event: r.ok
        ? { type: "hesap_sonucu", arac: "faiz", sonuc: r.data }
        : null,
    };
  }
  if (name === HESAP_TOOL_NAMES.kidem) {
    const r = tazminatHesabi(tazminatGirdisi(args));
    return {
      content: runTazminatHesabi(args),
      event: r.ok
        ? { type: "hesap_sonucu", arac: "kidem", sonuc: r.data }
        : null,
    };
  }
  const r = harcHesabi({
    ...args,
    olumCismaniZarar: args.olum_cismani_zarar === true,
  });
  return {
    content: runHarcHesabi(args),
    event: r.ok ? { type: "hesap_sonucu", arac: "harc", sonuc: r.data } : null,
  };
}
