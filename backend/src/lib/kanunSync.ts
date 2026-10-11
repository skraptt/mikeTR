// mikeTR: reading a law's current text from mevzuat.gov.tr and comparing it
// with the statute index.
//
// mevzuat.gov.tr publishes the consolidated (amendments applied) text of each
// law as HTML. Resmen yayımlanan kanunlar FSEK md. 31 uyarınca serbestçe
// kullanılabilir. The check is deliberately light: one request per law, run
// once a day, with an identifying User-Agent.
//
// Nothing here writes to the database. computeKanunChanges() returns the
// differences, and the kanun module stores them as pending changes for a
// person to approve.

import { createHash } from "node:crypto";
import { dedupeMaddeler, parseKanun, type ParsedMadde } from "./kanunParser";

export type KanunSource = {
  kanun_no: string;
  mevzuat_tur: number;
  mevzuat_tertip: number;
};

export type StoredMadde = {
  madde_no: string;
  baslik: string | null;
  icerik: string;
};

export type KanunChange = {
  tur: "yeni" | "degisti" | "kaldirildi";
  madde_no: string;
  eski_baslik: string | null;
  eski_icerik: string | null;
  yeni_baslik: string | null;
  yeni_icerik: string | null;
  yeni_ozet: string;
};

const FETCH_TIMEOUT_MS = 60_000;
// A parse that finds far fewer articles than the index holds means the page
// changed shape or came back truncated; proposing hundreds of removals from
// it would be noise at best.
const MIN_ARTICLE_RATIO = 0.9;

export function mevzuatPageUrl(source: KanunSource): string {
  return `https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=${source.kanun_no}&MevzuatTur=${source.mevzuat_tur}&MevzuatTertip=${source.mevzuat_tertip}`;
}

function mevzuatTextUrl(source: KanunSource): string {
  return `https://www.mevzuat.gov.tr/anasayfa/MevzuatFihristDetayIframe?MevzuatTur=${source.mevzuat_tur}&MevzuatNo=${source.kanun_no}&MevzuatTertip=${source.mevzuat_tertip}`;
}

export async function fetchKanunHtml(
  source: KanunSource,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(mevzuatTextUrl(source), {
    headers: {
      "User-Agent":
        process.env.KANUN_SYNC_USER_AGENT?.trim() ||
        "mikeTR-statute-check/1.0 (daily consolidated-text comparison)",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`mevzuat.gov.tr returned ${response.status} for law ${source.kanun_no}`);
  }
  return await response.text();
}

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole);
}

// Soft hyphens, zero-width characters and non-breaking spaces come from the
// Word export behind the HTML and differ between copies of the same text.
function cleanInvisible(text: string): string {
  return text.replace(/[­​-‍﻿]/g, "").replace(/ /g, " ");
}

/** The page's paragraphs as plain text, one per line. */
export function htmlToParagraphs(html: string): string[] {
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
    // Word footnote links: the reference in the text (#_ftnN) and the number
    // in front of the footnote itself (#_ftnrefN). Some documents print the
    // number with brackets and some without, so both become "[N]".
    .replace(/<a\b[^>]*href="#_ftn(?:ref)?(\d+)"[^>]*>[\s\S]*?<\/a>/gi, "[$1]")
    // …and a footnote number left without its link.
    .replace(/<span\b[^>]*class=["']?MsoFootnoteReference["']?[^>]*>\s*(\d+)\s*<\/span>/gi, "[$1]")
    .replace(/<\/(p|pre|div|h\d|li|tr|td)>|<br\s*\/?>/gi, "\u0000")
    .replace(/<[^>]+>/g, "");
  return cleanInvisible(decodeEntities(text))
    .split("\u0000")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const FOOTNOTE_MARKER = /\[(\d+)\]/g;
// Footnote references are parked at the start of their line while parsing:
// left at the end ("…verilebilir.[3]") they would hide the full stop the
// parser uses to tell article text from the next article's title.
const PARKED_MARKER = /\u27E6(\d+)\u27E7/g;
const HEADING_START = /^(?:(?:ge[çÇ][iİ]c[iİ]|ek)\s+)?madde\s+\d/iu;
// Some laws put an article's title and its "MADDE 90-" heading in one
// paragraph ("Sürelerin belirlenmesi MADDE 90- (1) …"). Only the upper-case
// form is split on: running text refers to articles in lower case.
const INLINE_HEADING =
  /(?<!(?:GEÇİCİ|EK)\s+)(?=(?:(?:GEÇİCİ|EK)\s+)?MADDE\s+\d+(?:\/[A-ZÇĞİÖŞÜ])?(?:\s+ila\s+\d+)?\s*[-–—])/u;

function splitInlineHeadings(paragraph: string): string[] {
  return paragraph
    .split(INLINE_HEADING)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parkMarkers(line: string): string {
  if (HEADING_START.test(line)) return line;
  const markers: string[] = [];
  const rest = line.replace(FOOTNOTE_MARKER, (_, n: string) => {
    markers.push(`\u27E6${n}\u27E7`);
    return "";
  });
  return markers.join("") + rest.replace(/\s+/g, " ").trim();
}

/**
 * Parses the HTML of a law into articles. Footnote texts, which the page
 * collects after the last article, are moved to the end of the article that
 * references them as "Dipnot: …" lines: they record things like a provision
 * not applying for a period or a Constitutional Court annulment, which a
 * reader of the article must not miss.
 */
export function parseKanunHtml(html: string, kanunNo: string): ParsedMadde[] {
  const paragraphs = htmlToParagraphs(html)
    .flatMap(splitInlineHeadings)
    // An anchor such as "[2530]" in front of an article heading is not a footnote.
    .map((p) => p.replace(/^\[\d+\]\s*(?=(?:(?:ge[çÇ][iİ]c[iİ]|ek)\s+)?madde\s+\d)/iu, ""));

  let lastHeading = -1;
  paragraphs.forEach((p, i) => {
    if (HEADING_START.test(p)) lastHeading = i;
  });
  const footnotes = new Map<string, string>();
  const body: string[] = [];
  paragraphs.forEach((p, i) => {
    const note = i > lastHeading ? /^\[(\d+)\]\s*(\S.*)$/.exec(p) : null;
    if (note && !footnotes.has(note[1])) footnotes.set(note[1], note[2]);
    else body.push(parkMarkers(p));
  });

  return dedupeMaddeler(parseKanun(body.join("\n"), `${kanunNo}.html`)).map((madde) => {
    const referenced = new Set<string>();
    const strip = (text: string) =>
      text
        .replace(PARKED_MARKER, (_, n: string) => {
          referenced.add(n);
          return "";
        })
        .replace(FOOTNOTE_MARKER, (_, n: string) => {
          referenced.add(n);
          return "";
        });
    const baslik = madde.baslik === null ? null : strip(madde.baslik).trim() || null;
    const lines = strip(madde.icerik)
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    for (const n of [...referenced].sort((a, b) => Number(a) - Number(b))) {
      const note = footnotes.get(n);
      if (note) lines.push(`Dipnot: ${note}`);
    }
    return { ...madde, baslik, icerik: lines.join("\n") };
  });
}

/** Whitespace and invisible characters never count as a change. */
export function normalizeForCompare(text: string | null): string {
  return cleanInvisible(text ?? "").replace(/\s+/g, " ").trim();
}

function changeDigest(baslik: string | null, icerik: string | null): string {
  return createHash("sha256")
    .update(`${normalizeForCompare(baslik)}\n${normalizeForCompare(icerik)}`)
    .digest("hex");
}

export function computeKanunChanges(
  stored: StoredMadde[],
  remote: ParsedMadde[],
): KanunChange[] {
  if (stored.length > 0 && remote.length < stored.length * MIN_ARTICLE_RATIO) {
    throw new Error(
      `the official text parsed into ${remote.length} articles but the index holds ${stored.length}; the page may have changed format`,
    );
  }
  const byNo = new Map(stored.map((m) => [m.madde_no, m]));
  const changes: KanunChange[] = [];
  for (const m of remote) {
    const old = byNo.get(m.madde_no);
    byNo.delete(m.madde_no);
    if (
      old &&
      normalizeForCompare(old.icerik) === normalizeForCompare(m.icerik) &&
      normalizeForCompare(old.baslik) === normalizeForCompare(m.baslik)
    ) {
      continue;
    }
    changes.push({
      tur: old ? "degisti" : "yeni",
      madde_no: m.madde_no,
      eski_baslik: old?.baslik ?? null,
      eski_icerik: old?.icerik ?? null,
      yeni_baslik: m.baslik,
      yeni_icerik: m.icerik,
      yeni_ozet: changeDigest(m.baslik, m.icerik),
    });
  }
  for (const old of byNo.values()) {
    changes.push({
      tur: "kaldirildi",
      madde_no: old.madde_no,
      eski_baslik: old.baslik,
      eski_icerik: old.icerik,
      yeni_baslik: null,
      yeni_icerik: null,
      yeni_ozet: changeDigest(null, null),
    });
  }
  return changes;
}
