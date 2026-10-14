// Asistan cevabındaki karar künyelerini ayıklar ve her birini bu sohbette
// içtihat araçlarıyla bulunan ve okunan kararlarla karşılaştırır. Kanun
// atıflarının denetimi (lib/citationCheck.ts) ile aynı fikir: model künyeyi
// hafızasından yazdıysa, o künye hiçbir aramada dönmemiş olur.

import type {
  CaseLawCitation,
  CaseLawCitationStatus,
  IctihatHit,
} from "@mike/contracts";

/** "2023/8563": a year and a sequence number. */
const NO = String.raw`(\d{4})\s*\/\s*(\d{1,7})`;

// "E.2023/8563 K.2024/4902", "E. 2023/8563, K. 2024/4902",
// "Esas No: 2023/8563 Karar No: 2024/4902", "E:2023/8563 K:2024/4902"
const ESAS_KARAR = new RegExp(
  String.raw`\bE(?:sas)?\s*(?:No|Sayısı)?\s*[.:]?\s*${NO}\s*[,;]?\s*(?:ve\s+)?K(?:arar)?\s*(?:No|Sayısı)?\s*[.:]?\s*${NO}`,
  "giu",
);
// The decision services' own heading style: "2023/8563 E. , 2024/4902 K."
const NUMBER_FIRST = new RegExp(String.raw`(?<![\d/])${NO}\s*E\.\s*,?\s*${NO}\s*K\.`, "giu");
// Constitutional Court individual application: "B. No: 2021/1240"
const BASVURU = new RegExp(String.raw`\b(?:B\.\s*No|Başvuru\s+(?:Numarası|No))\s*[.:]?\s*${NO}`, "giu");

// A court named just before the numbers makes the label readable.
const COURT = /(Yargıtay|Danıştay|AYM|Anayasa Mahkemesi|Bölge Adliye Mahkemesi|Asliye|Sulh|İş Mahkemesi|Tüketici Mahkemesi|Hukuk Genel Kurulu|Ceza Genel Kurulu)/giu;

type Raw = { key: string; esas: string | null; karar: string | null; basvuru: string | null; label: string };

function no(year: string, seq: string): string {
  return `${year}/${Number(seq)}`;
}

export function caseKey(parts: { esas?: string | null; karar?: string | null; basvuru?: string | null }): string | null {
  const clean = (value: string | null | undefined) => {
    const match = /^(\d{4})\s*\/\s*(\d+)$/.exec((value ?? "").trim());
    return match ? no(match[1], match[2]) : null;
  };
  const basvuru = clean(parts.basvuru);
  if (basvuru) return `B:${basvuru}`;
  const esas = clean(parts.esas);
  const karar = clean(parts.karar);
  return esas && karar ? `E:${esas}|K:${karar}` : null;
}

/** The key a search result is cited by. */
export function hitKey(hit: Pick<IctihatHit, "kaynak_turu" | "esas_no" | "karar_no">): string | null {
  return hit.kaynak_turu === "anayasa"
    ? caseKey({ basvuru: hit.esas_no })
    : caseKey({ esas: hit.esas_no, karar: hit.karar_no });
}

// The court is looked for only in the same clause: back to a line break,
// a bracket, a semicolon or a sentence end ("3. Hukuk" is not one).
const CLAUSE_END = /[\n();]|(?<!\d)\.\s/g;

function labelFor(text: string, start: number, end: number, floor: number): string {
  let window = text.slice(Math.max(floor, start - 70), start);
  let cut = -1;
  for (const match of window.matchAll(CLAUSE_END)) cut = match.index! + match[0].length;
  if (cut >= 0) window = window.slice(cut);
  let from = start;
  for (const match of window.matchAll(COURT)) {
    from = start - window.length + match.index!;
    break;
  }
  return text
    .slice(from, end)
    .replace(/\s+/g, " ")
    .replace(/^[(\s]+|[),;\s]+$/g, "")
    .trim();
}

export function extractCaseCitations(text: string): Raw[] {
  const spans: { at: number; end: number; key: string; esas: string | null; karar: string | null; basvuru: string | null }[] = [];
  for (const m of text.matchAll(ESAS_KARAR)) {
    const esas = no(m[1], m[2]);
    const karar = no(m[3], m[4]);
    spans.push({ at: m.index!, end: m.index! + m[0].length, key: `E:${esas}|K:${karar}`, esas, karar, basvuru: null });
  }
  for (const m of text.matchAll(NUMBER_FIRST)) {
    const esas = no(m[1], m[2]);
    const karar = no(m[3], m[4]);
    spans.push({ at: m.index!, end: m.index! + m[0].length, key: `E:${esas}|K:${karar}`, esas, karar, basvuru: null });
  }
  for (const m of text.matchAll(BASVURU)) {
    const basvuru = no(m[1], m[2]);
    spans.push({ at: m.index!, end: m.index! + m[0].length, key: `B:${basvuru}`, esas: null, karar: null, basvuru });
  }
  spans.sort((a, b) => a.at - b.at);
  const seen = new Set<string>();
  const out: Raw[] = [];
  let floor = 0;
  for (const span of spans) {
    // A label never reaches back into the previous citation.
    const label = labelFor(text, span.at, span.end, floor);
    floor = span.end;
    if (seen.has(span.key)) continue;
    seen.add(span.key);
    out.push({ key: span.key, esas: span.esas, karar: span.karar, basvuru: span.basvuru, label });
  }
  return out;
}

export type RetrievedDecisions = {
  /** Keys of decisions returned by a search in this chat, with their citation. */
  found: Map<string, string>;
  /** Keys of decisions read in full with get_karar. */
  read: Set<string>;
};

export function checkCaseCitations(text: string, retrieved: RetrievedDecisions): CaseLawCitation[] {
  return extractCaseCitations(text).map((c) => {
    const status: CaseLawCitationStatus = retrieved.read.has(c.key)
      ? "dogrulandi"
      : retrieved.found.has(c.key)
        ? "okunmadi"
        : "kaynaksiz";
    return {
      // A known decision is named the way the source names it.
      label: retrieved.found.get(c.key) ?? c.label,
      esas_no: c.esas,
      karar_no: c.karar,
      basvuru_no: c.basvuru,
      status,
    };
  });
}
