// Yargı kararlarını Adalet Bakanlığı'nın herkese açık karar servislerinden arar
// ve tam metinlerini getirir:
//
//   Yargıtay   bedesten.adalet.gov.tr (Mevzuat ve İçtihat Programı'nın arka ucu)
//              POST /emsal-karar/searchDocuments, POST /emsal-karar/getDocumentContent
//              Kararın herkese açık sayfası: mevzuat.adalet.gov.tr/ictihat/<id>
//   Danıştay   aynı Bedesten servisi, itemType DANISTAYKARAR
//   Emsal      emsal.uyap.gov.tr (Bölge Adliye hukuk daireleri, bazı ilk derece
//              mahkemeleri): POST /aramalist, GET /getDokuman?id=
//   AYM        kararlarbilgibankasi.anayasa.gov.tr: POST /api/core/public/search
//              (bireysel başvuru ve norm denetimi; arama ve tam metin aynı uçtan)
//
// Künye (mahkeme, esas/karar no, tarih) yapısal gelir; model numarayı metinden
// ayıklamak ya da hafızadan yazmak zorunda kalmaz. Servisler belgelenmiş bir API
// değildir; uç noktalar aydincan/turk-hukuku-ictihat-mcp (MIT) projesinden alındı.

import type {
  IctihatCourt,
  IctihatDecision,
  IctihatFilters,
  IctihatFinality,
  IctihatHit,
  IctihatSearchResult,
  IctihatSort,
  IctihatSource,
} from "@mike/contracts";
import { andQuery } from "./query";

export type {
  IctihatCourt,
  IctihatDecision,
  IctihatFilters,
  IctihatHit,
  IctihatSearchResult,
  IctihatSort,
  IctihatFinality,
} from "@mike/contracts";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const BEDESTEN = "https://bedesten.adalet.gov.tr/emsal-karar";
const YARGITAY_PAGE = "https://mevzuat.adalet.gov.tr/ictihat";
const EMSAL = "https://emsal.uyap.gov.tr";
// UYAP Emsal has no page per decision (getDokuman answers raw data), so its
// decisions point at the search site, where the citation finds them.
const EMSAL_SITE = `${EMSAL}/`;
// Asılı kalan bir istek sohbeti uzun süre bekletmesin.
const TIMEOUT_MS = 30_000;
const YARGITAY_PREFIX = "yargitay:";
const DANISTAY_PREFIX = "danistay:";
const KYB_PREFIX = "kyb:";
const AYM_PREFIX = "aym:";
const NORM_PREFIX = "norm:";
const AYM = "https://kararlarbilgibankasi.anayasa.gov.tr";
export const MAX_RESULTS = 20;

/** Yargıtay chambers and boards Bedesten filters by, under its own names. */
export const YARGITAY_CHAMBERS: readonly string[] = [
  "Hukuk Genel Kurulu",
  "Ceza Genel Kurulu",
  "Büyük Genel Kurulu",
  "Hukuk Daireleri Başkanlar Kurulu",
  "Ceza Daireleri Başkanlar Kurulu",
  ...Array.from({ length: 23 }, (_, i) => `${i + 1}. Hukuk Dairesi`),
  ...Array.from({ length: 23 }, (_, i) => `${i + 1}. Ceza Dairesi`),
];

/** Danıştay chambers and boards, under Bedesten's names. */
export const DANISTAY_CHAMBERS: readonly string[] = [
  "İdare Dava Daireleri Kurulu",
  "Vergi Dava Daireleri Kurulu",
  ...Array.from({ length: 17 }, (_, i) => `${i + 1}. Daire`),
];

function findChamber(list: readonly string[], name: string): string | undefined {
  const wanted = name.toLocaleLowerCase("tr-TR");
  return list.find((known) => known.toLocaleLowerCase("tr-TR") === wanted);
}

export const SORTS: readonly IctihatSort[] = ["ilgili", "yeni", "eski"];
export const FINALITIES: readonly IctihatFinality[] = ["kesinlesti", "kesinlesmedi"];

// UYAP Emsal cannot filter by finality and answers at most 10 decisions a
// page, so a finality filter reads pages until it has enough matches, up to
// this many requests per search.
const FINALITY_SCAN_PAGES = 10;
const EMSAL_PAGE_SIZE = 10;
const FINALITY_LABEL: Record<IctihatFinality, string> = {
  kesinlesti: "KESİNLEŞTİ",
  kesinlesmedi: "KESİNLEŞMEDİ",
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Keeps only filters the services understand: a known chamber, real calendar
 * dates and a known sort. Throws on anything else so a typo is not silently
 * dropped into a broader search.
 */
export function normalizeFilters(filters: IctihatFilters = {}): IctihatFilters {
  const out: IctihatFilters = {};
  const daire = filters.daire?.trim();
  if (daire) {
    const known = findChamber(YARGITAY_CHAMBERS, daire) ?? findChamber(DANISTAY_CHAMBERS, daire);
    if (!known) throw new IctihatSourceError(`Unknown chamber: ${daire}.`);
    out.daire = known;
  }
  for (const key of ["baslangic", "bitis"] as const) {
    const value = filters[key]?.trim();
    if (!value) continue;
    const match = ISO_DATE.exec(value);
    const date = match ? new Date(`${value}T00:00:00Z`) : null;
    if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new IctihatSourceError(`Dates must be YYYY-MM-DD: ${value}.`);
    }
    out[key] = value;
  }
  if (out.baslangic && out.bitis && out.baslangic > out.bitis) {
    throw new IctihatSourceError("The start date is after the end date.");
  }
  if (filters.siralama && filters.siralama !== "ilgili") {
    if (!SORTS.includes(filters.siralama)) throw new IctihatSourceError(`Unknown sort: ${filters.siralama}.`);
    out.siralama = filters.siralama;
  }
  if (filters.kesinlesme) {
    if (!FINALITIES.includes(filters.kesinlesme)) {
      throw new IctihatSourceError(`Unknown finality: ${filters.kesinlesme}.`);
    }
    if (out.daire) {
      throw new IctihatSourceError(
        "A chamber and a finality filter cannot be combined: chambers are Yargıtay's and Danıştay's, and only UYAP Emsal reports finality.",
      );
    }
    out.kesinlesme = filters.kesinlesme;
  }
  return out;
}

/** "2024-05-16" -> "16.05.2024" */
function dottedDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

/** The service could not answer; the message is safe to show and to give the model. */
export class IctihatSourceError extends Error {}

type FetchFn = typeof fetch;

async function request(
  fetchFn: FetchFn,
  source: string,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new IctihatSourceError(
      timedOut ? `${source} did not respond in time.` : `${source} could not be reached.`,
      { cause: error },
    );
  }
  if (response.status === 429) {
    throw new IctihatSourceError(`${source} is limiting requests. Try again in a minute.`);
  }
  if (!response.ok) {
    throw new IctihatSourceError(`${source} answered with HTTP ${response.status}.`);
  }
  const body = (await response.json().catch(() => null)) as {
    metadata?: { FMTY?: string; FMTE?: string };
  } | null;
  if (!body) throw new IctihatSourceError(`${source} returned an unreadable answer.`);
  if (body.metadata?.FMTY === "ERROR") {
    throw new IctihatSourceError(`${source}: ${body.metadata.FMTE ?? "error"}`);
  }
  return body;
}

// Named entities the courts' HTML uses (AYM writes Turkish letters this way).
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  ouml: "ö", Ouml: "Ö", uuml: "ü", Uuml: "Ü", ccedil: "ç", Ccedil: "Ç",
  acirc: "â", Acirc: "Â", icirc: "î", Icirc: "Î", ucirc: "û", Ucirc: "Û",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  agrave: "à", egrave: "è", ograve: "ò", auml: "ä", Auml: "Ä",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", sbquo: "‚", bdquo: "„",
  laquo: "«", raquo: "»", ndash: "–", mdash: "—", hellip: "…", bull: "•",
  middot: "·", sect: "§", para: "¶", deg: "°", shy: "", zwnj: "", zwj: "",
  copy: "©", reg: "®", trade: "™", times: "×", divide: "÷", euro: "€",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const point = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : whole;
    }
    return NAMED_ENTITIES[code] ?? whole;
  });
}

export function htmlToText(html: string): string {
  // Some sources encode their HTML once more ("&lt;p&gt;"); open that first.
  const source = /&lt;\/?[a-z]/i.test(html) && !/<\/?[a-z]/i.test(html) ? decodeEntities(html) : html;
  const stripped = source
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(stripped)
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function citation(court: string, esas: string, karar: string, date: string): string {
  return `${court}, E.${esas} K.${karar}, T.${date}`.replace(/^, /, "");
}

// Bedesten sometimes fills this field with the decision's subject headings
// instead of its finality; only a finality statement is kept.
function finality(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return /KES[İI]NLEŞ/i.test(text) ? text : null;
}

// ---------------------------------------------------------------------------
// Yargıtay (Bedesten)

const BEDESTEN_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "application/json",
  "Content-Type": "application/json; charset=UTF-8",
  AdaletApplicationName: "UyapMevzuat",
  Origin: "https://mevzuat.adalet.gov.tr",
  Referer: "https://mevzuat.adalet.gov.tr/",
};

type BedestenHit = {
  documentId?: string | number;
  birimAdi?: string;
  esasNo?: string;
  kararNo?: string;
  kararTarihiStr?: string;
  kesinlesmeDurumu?: string | null;
};

type BedestenCourt = { itemType: string; prefix: string; name: string; source: IctihatSource };

const YARGITAY: BedestenCourt = {
  itemType: "YARGITAYKARARI",
  prefix: YARGITAY_PREFIX,
  name: "Yargıtay",
  source: "yargitay",
};
// Kanun yararına bozma: Yargıtay decisions on the Minister of Justice's or the
// Chief Public Prosecutor's request, under their own item type.
const KYB: BedestenCourt = {
  itemType: "KYB",
  prefix: KYB_PREFIX,
  name: "Yargıtay",
  source: "kyb",
};
const DANISTAY: BedestenCourt = {
  itemType: "DANISTAYKARAR",
  prefix: DANISTAY_PREFIX,
  name: "Danıştay",
  source: "danistay",
};

async function searchBedesten(
  fetchFn: FetchFn,
  court: BedestenCourt,
  phrase: string,
  limit: number,
  page: number,
  filters: IctihatFilters,
): Promise<IctihatSearchResult> {
  const data: Record<string, unknown> = {
    phrase,
    itemTypeList: [court.itemType],
    pageSize: limit,
    pageNumber: page,
  };
  if (filters.daire) data.birimAdi = filters.daire;
  if (filters.baslangic) data.kararTarihiStart = `${filters.baslangic}T00:00:00.000Z`;
  if (filters.bitis) data.kararTarihiEnd = `${filters.bitis}T23:59:59.999Z`;
  // Without sortFields Bedesten ranks by relevance.
  if (filters.siralama) {
    data.sortFields = ["KARAR_TARIHI"];
    data.sortDirection = filters.siralama === "yeni" ? "desc" : "ASC";
  }
  const body = (await request(fetchFn, `${court.name} search`, `${BEDESTEN}/searchDocuments`, {
    method: "POST",
    headers: BEDESTEN_HEADERS,
    body: JSON.stringify({ data, applicationName: "UyapMevzuat", paging: true }),
  })) as { data?: { emsalKararList?: BedestenHit[]; total?: number } };
  const hits = (body.data?.emsalKararList ?? []).map((k): IctihatHit => {
    const id = String(k.documentId ?? "");
    const unit = (k.birimAdi ?? "").trim();
    const name = !unit || unit.toLocaleLowerCase("tr-TR").startsWith(court.name.toLocaleLowerCase("tr-TR"))
      ? unit
      : `${court.name} ${unit}`;
    const esas = k.esasNo ?? "";
    const karar = k.kararNo ?? "";
    const date = k.kararTarihiStr ?? "";
    return {
      id: `${court.prefix}${id}`,
      kaynak_turu: court.source,
      mahkeme: name,
      esas_no: esas,
      karar_no: karar,
      karar_tarihi: date,
      durum: finality(k.kesinlesmeDurumu),
      atif: citation(name, esas, karar, date),
      kaynak: `${YARGITAY_PAGE}/${id}`,
    };
  });
  return { total: body.data?.total ?? hits.length, results: hits };
}

async function getBedesten(fetchFn: FetchFn, court: BedestenCourt, id: string): Promise<IctihatDecision> {
  const body = (await request(fetchFn, court.name, `${BEDESTEN}/getDocumentContent`, {
    method: "POST",
    headers: BEDESTEN_HEADERS,
    body: JSON.stringify({ data: { documentId: id }, applicationName: "UyapMevzuat" }),
  })) as { data?: { content?: string; mimeType?: string } };
  const source = `${YARGITAY_PAGE}/${id}`;
  const content = body.data?.content;
  if (!content) throw new IctihatSourceError(`No ${court.name} decision was found for id ${id}.`);
  if (!(body.data?.mimeType ?? "text/html").includes("html")) {
    throw new IctihatSourceError(
      `This decision is only available as ${body.data?.mimeType}; read it at ${source}.`,
    );
  }
  return {
    id: `${court.prefix}${id}`,
    kaynak: source,
    metin: htmlToText(Buffer.from(content, "base64").toString("utf8")),
  };
}

// ---------------------------------------------------------------------------
// Bölge Adliye ve ilk derece (UYAP Emsal)

const EMSAL_HEADERS = {
  "User-Agent": USER_AGENT,
  "X-Requested-With": "XMLHttpRequest",
  Referer: `${EMSAL}/`,
  "Content-Type": "application/json; charset=UTF-8",
};

type EmsalHit = {
  id?: string | number;
  daire?: string;
  esasNo?: string;
  kararNo?: string;
  kararTarihi?: string;
  durum?: string | null;
};

// UYAP Emsal's detailed search sorts by a numbered column: 3 is the decision date.
const EMSAL_DATE_COLUMN = "3";

async function searchEmsal(
  fetchFn: FetchFn,
  phrase: string,
  limit: number,
  page: number,
  filters: IctihatFilters,
): Promise<IctihatSearchResult> {
  if (filters.kesinlesme) return searchEmsalByFinality(fetchFn, phrase, limit, page, filters);
  return searchEmsalPage(fetchFn, phrase, limit, page, filters);
}

/**
 * The `page`-th block of `limit` decisions with the requested finality, read
 * from consecutive source pages. Exact when the source runs out within the
 * scan; otherwise a lower bound, flagged `approximate`.
 */
async function searchEmsalByFinality(
  fetchFn: FetchFn,
  phrase: string,
  limit: number,
  page: number,
  filters: IctihatFilters,
): Promise<IctihatSearchResult> {
  const wanted = FINALITY_LABEL[filters.kesinlesme!];
  const matches: IctihatHit[] = [];
  const needed = page * limit + 1; // one extra tells whether a next page exists
  let exhausted = false;
  for (let sourcePage = 1; sourcePage <= FINALITY_SCAN_PAGES; sourcePage++) {
    const chunk = await searchEmsalPage(fetchFn, phrase, EMSAL_PAGE_SIZE, sourcePage, filters);
    matches.push(...chunk.results.filter((hit) => hit.durum?.toLocaleUpperCase("tr-TR") === wanted));
    if (chunk.results.length < EMSAL_PAGE_SIZE || sourcePage * EMSAL_PAGE_SIZE >= chunk.total) {
      exhausted = true;
      break;
    }
    if (matches.length >= needed) break;
  }
  const results = matches.slice((page - 1) * limit, page * limit);
  return exhausted
    ? { total: matches.length, results }
    : { total: matches.length, results, approximate: true };
}

async function searchEmsalPage(
  fetchFn: FetchFn,
  phrase: string,
  limit: number,
  page: number,
  filters: IctihatFilters,
): Promise<IctihatSearchResult> {
  const detailed = !!(filters.baslangic || filters.bitis || filters.siralama);
  const data: Record<string, unknown> = detailed
    ? {
        // The detailed form takes every field, empty when unused, and its
        // dates in DD.MM.YYYY.
        arananKelime: phrase,
        "Bam Hukuk Mahkemeleri": "",
        "Hukuk Mahkemeleri": "",
        birimHukukMah: "",
        esasYil: "",
        esasIlkSiraNo: "",
        esasSonSiraNo: "",
        kararYil: "",
        kararIlkSiraNo: "",
        kararSonSiraNo: "",
        ...(filters.baslangic ? { baslangicTarihi: dottedDate(filters.baslangic) } : {}),
        ...(filters.bitis ? { bitisTarihi: dottedDate(filters.bitis) } : {}),
        siralama: EMSAL_DATE_COLUMN,
        siralamaDirection: filters.siralama === "eski" ? "asc" : "desc",
        pageSize: limit,
        pageNumber: page,
      }
    : { aranan: phrase, arananKelime: phrase, pageSize: limit, pageNumber: page };
  const endpoint = detailed ? "aramadetaylist" : "aramalist";
  const body = (await request(fetchFn, "UYAP Emsal search", `${EMSAL}/${endpoint}`, {
    method: "POST",
    headers: EMSAL_HEADERS,
    body: JSON.stringify({ data }),
  })) as { data?: { data?: EmsalHit[]; recordsTotal?: number } };
  const hits = (body.data?.data ?? []).map((k): IctihatHit => {
    const id = String(k.id ?? "");
    const court = (k.daire ?? "").trim();
    const esas = (k.esasNo ?? "").trim();
    const karar = (k.kararNo ?? "").trim();
    const date = (k.kararTarihi ?? "").trim();
    return {
      id,
      kaynak_turu: "emsal",
      mahkeme: court,
      esas_no: esas,
      karar_no: karar,
      karar_tarihi: date,
      durum: k.durum ?? null,
      atif: citation(court, esas, karar, date),
      kaynak: EMSAL_SITE,
    };
  });
  return { total: body.data?.recordsTotal ?? hits.length, results: hits };
}

async function getEmsal(fetchFn: FetchFn, id: string): Promise<IctihatDecision> {
  const body = (await request(
    fetchFn,
    "UYAP Emsal",
    `${EMSAL}/getDokuman?id=${encodeURIComponent(id)}`,
    { method: "GET", headers: { "User-Agent": USER_AGENT, Referer: `${EMSAL}/` } },
  )) as { data?: string };
  if (!body.data) throw new IctihatSourceError(`No UYAP Emsal decision was found for id ${id}.`);
  return { id, kaynak: EMSAL_SITE, metin: htmlToText(body.data) };
}

// ---------------------------------------------------------------------------
// Anayasa Mahkemesi (Kararlar Bilgi Bankası)

const AYM_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "application/json",
  "Content-Type": "application/json; charset=utf-8",
  Referer: `${AYM}/`,
};

type AymKind = { kararTipi: "BireyselBasvuru" | "NormDenetimi"; prefix: string; source: IctihatSource };
const AYM_INDIVIDUAL: AymKind = { kararTipi: "BireyselBasvuru", prefix: AYM_PREFIX, source: "anayasa" };
const AYM_NORM: AymKind = { kararTipi: "NormDenetimi", prefix: NORM_PREFIX, source: "norm" };

type AymRecord = {
  id?: string;
  basvuruNo?: string;
  esasNo?: string;
  kararNo?: string;
  kararTarihi?: string;
  basvuruAdi?: string;
  kararKonusu?: string;
  kararTuruBasvuruSonucuLabel?: string;
  kararTuruDosyaSonucuLabel?: string;
  kararVerenBirimLabel?: string;
  resmiGazeteTarihi?: string;
  resmiGazeteSayisi?: string;
  icerik?: string;
};

const MAX_SUBJECT_CHARS = 400;

/** "2025-01-08" -> "08.01.2025", the format of the other courts' dates. */
function aymDate(iso: string | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return match ? `${match[3]}.${match[2]}.${match[1]}` : (iso ?? "");
}

function plainText(html: string | undefined, max?: number): string | null {
  const text = htmlToText(html ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return max && text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

// The site's public pages live under /kbb (/BB/… redirects there over plain http).
function aymPage(kind: AymKind, record: AymRecord): string {
  if (kind === AYM_INDIVIDUAL) return record.basvuruNo ? `${AYM}/kbb/BB/${record.basvuruNo}` : `${AYM}/`;
  return record.kararNo ? `${AYM}/kbb/ND/${record.kararNo}` : `${AYM}/`;
}

function aymHit(kind: AymKind, r: AymRecord): IctihatHit {
  const date = aymDate(r.kararTarihi);
  if (kind === AYM_INDIVIDUAL) {
    const basvuru = (r.basvuruNo ?? "").trim();
    const unit = plainText(r.kararVerenBirimLabel);
    return {
      id: `${kind.prefix}${r.id ?? ""}`,
      kaynak_turu: kind.source,
      mahkeme: unit ? `Anayasa Mahkemesi ${unit}` : "Anayasa Mahkemesi",
      esas_no: basvuru,
      karar_no: "",
      karar_tarihi: date,
      durum: null,
      atif: `AYM, B. No: ${basvuru}${date ? `, K.T. ${date}` : ""}`,
      kaynak: aymPage(kind, r),
      baslik: plainText(r.basvuruAdi),
      sonuc: plainText(r.kararTuruBasvuruSonucuLabel),
      konu: plainText(r.kararKonusu, MAX_SUBJECT_CHARS),
    };
  }
  const esas = (r.esasNo ?? "").trim();
  const karar = (r.kararNo ?? "").trim();
  const gazette =
    r.resmiGazeteTarihi && r.resmiGazeteSayisi
      ? `RG ${aymDate(r.resmiGazeteTarihi)}, S. ${r.resmiGazeteSayisi}`
      : null;
  return {
    id: `${kind.prefix}${r.id ?? ""}`,
    kaynak_turu: kind.source,
    mahkeme: "Anayasa Mahkemesi",
    esas_no: esas,
    karar_no: karar,
    karar_tarihi: date,
    durum: null,
    atif: `AYM, E.${esas}, K.${karar}${date ? `, K.T. ${date}` : ""}`,
    kaynak: aymPage(kind, r),
    sonuc: plainText(r.kararTuruDosyaSonucuLabel),
    konu: plainText(r.kararKonusu, MAX_SUBJECT_CHARS),
    resmi_gazete: gazette,
  };
}

async function searchAym(
  fetchFn: FetchFn,
  kind: AymKind,
  phrase: string,
  limit: number,
  page: number,
  filters: IctihatFilters,
): Promise<IctihatSearchResult> {
  const payload: Record<string, unknown> = { kararTipi: kind.kararTipi, query: phrase, page, size: limit };
  if (filters.baslangic) payload.kararTarihiStart = filters.baslangic;
  if (filters.bitis) payload.kararTarihiEnd = filters.bitis;
  if (filters.siralama) {
    payload.sort = "kararTarihi";
    payload.order = filters.siralama === "yeni" ? "desc" : "asc";
  }
  const body = (await request(fetchFn, "Constitutional Court search", `${AYM}/api/core/public/search`, {
    method: "POST",
    headers: AYM_HEADERS,
    body: JSON.stringify(payload),
  })) as { data?: AymRecord[]; total?: number | string };
  const hits = (body.data ?? []).filter((r) => r.id).map((r) => aymHit(kind, r));
  return { total: Number(body.total ?? hits.length) || hits.length, results: hits };
}

async function getAym(fetchFn: FetchFn, kind: AymKind, uuid: string): Promise<IctihatDecision> {
  const body = (await request(fetchFn, "Constitutional Court", `${AYM}/api/core/public/search`, {
    method: "POST",
    headers: AYM_HEADERS,
    body: JSON.stringify({ kararTipi: kind.kararTipi, id: uuid, page: 1, size: 1 }),
  })) as { data?: AymRecord[] };
  const record = body.data?.[0];
  const text = htmlToText(record?.icerik ?? "");
  if (!record || text.length < 60) {
    throw new IctihatSourceError(`No Constitutional Court decision was found for id ${uuid}.`);
  }
  return { id: `${kind.prefix}${uuid}`, kaynak: aymPage(kind, record), metin: text };
}

// ---------------------------------------------------------------------------

// The services sometimes list one decision twice (for example once per
// publication); a decision is its court with its docket and decision numbers.
function uniqueHits(hits: IctihatHit[]): IctihatHit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    const key = hit.esas_no
      ? `${hit.mahkeme}|${hit.esas_no}|${hit.karar_no}`
      : hit.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Searches decisions. `adli` (the default) asks Yargıtay and UYAP Emsal together,
 * splitting the limit, and still answers when one of them fails. A chamber
 * filter narrows the search to Yargıtay, whose chambers it names.
 */
export async function searchDecisions(
  params: {
    query: string;
    court?: IctihatCourt;
    limit?: number;
    page?: number;
    filters?: IctihatFilters;
  },
  fetchFn: FetchFn = fetch,
): Promise<IctihatSearchResult & { court: IctihatCourt; filters: IctihatFilters; warnings?: string[] }> {
  const phrase = andQuery(params.query);
  const filters = normalizeFilters(params.filters);
  // A chamber names its court (KYB decisions come from Yargıtay chambers too);
  // only UYAP Emsal reports finality.
  const court: IctihatCourt = filters.daire
    ? DANISTAY_CHAMBERS.includes(filters.daire)
      ? "danistay"
      : params.court === "kyb"
        ? "kyb"
        : "yargitay"
    : filters.kesinlesme
      ? "emsal"
      : (params.court ?? "adli");
  const limit = Math.min(Math.max(Math.trunc(params.limit ?? 10), 1), MAX_RESULTS);
  const page = Math.max(Math.trunc(params.page ?? 1), 1);

  const single: Record<Exclude<IctihatCourt, "adli">, () => Promise<IctihatSearchResult>> = {
    yargitay: () => searchBedesten(fetchFn, YARGITAY, phrase, limit, page, filters),
    kyb: () => searchBedesten(fetchFn, KYB, phrase, limit, page, filters),
    danistay: () => searchBedesten(fetchFn, DANISTAY, phrase, limit, page, filters),
    emsal: () => searchEmsal(fetchFn, phrase, limit, page, filters),
    anayasa: () => searchAym(fetchFn, AYM_INDIVIDUAL, phrase, limit, page, filters),
    norm: () => searchAym(fetchFn, AYM_NORM, phrase, limit, page, filters),
  };
  if (court !== "adli") {
    const result = await single[court]();
    return { court, filters, ...result, results: uniqueHits(result.results) };
  }

  const yargitayLimit = Math.max(Math.ceil(limit / 2), 1);
  const emsalLimit = Math.max(limit - yargitayLimit, 1);
  const [yargitay, emsal] = await Promise.allSettled([
    searchBedesten(fetchFn, YARGITAY, phrase, yargitayLimit, page, filters),
    searchEmsal(fetchFn, phrase, emsalLimit, page, filters),
  ]);
  const warnings: string[] = [];
  const results: IctihatHit[] = [];
  let total = 0;
  for (const outcome of [yargitay, emsal]) {
    if (outcome.status === "fulfilled") {
      results.push(...outcome.value.results);
      total += outcome.value.total;
    } else {
      const reason = outcome.reason;
      if (!(reason instanceof IctihatSourceError)) throw reason;
      warnings.push(reason.message);
    }
  }
  if (!results.length && warnings.length) throw new IctihatSourceError(warnings.join(" "));
  return {
    court,
    filters,
    total,
    results: uniqueHits(results),
    ...(warnings.length ? { warnings } : {}),
  };
}

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Full text of one decision, by an id from searchDecisions. */
export async function getDecision(id: string, fetchFn: FetchFn = fetch): Promise<IctihatDecision> {
  const trimmed = id.trim();
  const [, prefix = "", rest] = /^(?:([a-z]+):)?(.*)$/i.exec(trimmed) ?? [];
  const kind = prefix.toLowerCase();
  if ((kind === "" || kind === "yargitay" || kind === "kyb" || kind === "danistay") && /^\d+$/.test(rest)) {
    if (kind === "yargitay") return getBedesten(fetchFn, YARGITAY, rest);
    if (kind === "kyb") return getBedesten(fetchFn, KYB, rest);
    if (kind === "danistay") return getBedesten(fetchFn, DANISTAY, rest);
    return getEmsal(fetchFn, rest);
  }
  if ((kind === "aym" || kind === "norm") && UUID.test(rest)) {
    return getAym(fetchFn, kind === "aym" ? AYM_INDIVIDUAL : AYM_NORM, rest);
  }
  throw new IctihatSourceError("Use a decision id returned by the case-law search.");
}
