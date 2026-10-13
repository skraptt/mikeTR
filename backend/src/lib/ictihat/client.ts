// Yargı kararlarını Adalet Bakanlığı'nın herkese açık karar servislerinden arar
// ve tam metinlerini getirir:
//
//   Yargıtay   bedesten.adalet.gov.tr (Mevzuat ve İçtihat Programı'nın arka ucu)
//              POST /emsal-karar/searchDocuments, POST /emsal-karar/getDocumentContent
//              Kararın herkese açık sayfası: mevzuat.adalet.gov.tr/ictihat/<id>
//   Emsal      emsal.uyap.gov.tr (Bölge Adliye hukuk daireleri, bazı ilk derece
//              mahkemeleri): POST /aramalist, GET /getDokuman?id=
//
// Künye (mahkeme, esas/karar no, tarih) yapısal gelir; model numarayı metinden
// ayıklamak ya da hafızadan yazmak zorunda kalmaz. Servisler belgelenmiş bir API
// değildir; uç noktalar aydincan/turk-hukuku-ictihat-mcp (MIT) projesinden alındı.

import type { IctihatCourt, IctihatDecision, IctihatHit, IctihatSearchResult } from "@mike/contracts";
import { andQuery } from "./query";

export type { IctihatCourt, IctihatDecision, IctihatHit, IctihatSearchResult } from "@mike/contracts";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const BEDESTEN = "https://bedesten.adalet.gov.tr/emsal-karar";
const YARGITAY_PAGE = "https://mevzuat.adalet.gov.tr/ictihat";
const EMSAL = "https://emsal.uyap.gov.tr";
// Asılı kalan bir istek sohbeti uzun süre bekletmesin.
const TIMEOUT_MS = 30_000;
const YARGITAY_PREFIX = "yargitay:";
export const MAX_RESULTS = 20;

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

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
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

function yargitayCourt(unit: string | undefined): string {
  const name = (unit ?? "").trim();
  return !name || name.toLocaleLowerCase("tr-TR").startsWith("yargıtay") ? name : `Yargıtay ${name}`;
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

async function searchYargitay(
  fetchFn: FetchFn,
  phrase: string,
  limit: number,
  page: number,
): Promise<IctihatSearchResult> {
  const body = (await request(fetchFn, "Yargıtay search", `${BEDESTEN}/searchDocuments`, {
    method: "POST",
    headers: BEDESTEN_HEADERS,
    body: JSON.stringify({
      data: { phrase, itemTypeList: ["YARGITAYKARARI"], pageSize: limit, pageNumber: page },
      applicationName: "UyapMevzuat",
      paging: true,
    }),
  })) as { data?: { emsalKararList?: BedestenHit[]; total?: number } };
  const hits = (body.data?.emsalKararList ?? []).map((k): IctihatHit => {
    const id = String(k.documentId ?? "");
    const court = yargitayCourt(k.birimAdi);
    const esas = k.esasNo ?? "";
    const karar = k.kararNo ?? "";
    const date = k.kararTarihiStr ?? "";
    return {
      id: `${YARGITAY_PREFIX}${id}`,
      kaynak_turu: "yargitay",
      mahkeme: court,
      esas_no: esas,
      karar_no: karar,
      karar_tarihi: date,
      durum: finality(k.kesinlesmeDurumu),
      atif: citation(court, esas, karar, date),
      kaynak: `${YARGITAY_PAGE}/${id}`,
    };
  });
  return { total: body.data?.total ?? hits.length, results: hits };
}

async function getYargitay(fetchFn: FetchFn, id: string): Promise<IctihatDecision> {
  const body = (await request(fetchFn, "Yargıtay", `${BEDESTEN}/getDocumentContent`, {
    method: "POST",
    headers: BEDESTEN_HEADERS,
    body: JSON.stringify({ data: { documentId: id }, applicationName: "UyapMevzuat" }),
  })) as { data?: { content?: string; mimeType?: string } };
  const source = `${YARGITAY_PAGE}/${id}`;
  const content = body.data?.content;
  if (!content) throw new IctihatSourceError(`No Yargıtay decision was found for id ${id}.`);
  if (!(body.data?.mimeType ?? "text/html").includes("html")) {
    throw new IctihatSourceError(
      `This decision is only available as ${body.data?.mimeType}; read it at ${source}.`,
    );
  }
  return {
    id: `${YARGITAY_PREFIX}${id}`,
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

async function searchEmsal(
  fetchFn: FetchFn,
  phrase: string,
  limit: number,
  page: number,
): Promise<IctihatSearchResult> {
  const body = (await request(fetchFn, "UYAP Emsal search", `${EMSAL}/aramalist`, {
    method: "POST",
    headers: EMSAL_HEADERS,
    body: JSON.stringify({
      data: { aranan: phrase, arananKelime: phrase, pageSize: limit, pageNumber: page },
    }),
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
      kaynak: `${EMSAL}/getDokuman?id=${id}`,
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
  return { id, kaynak: `${EMSAL}/getDokuman?id=${id}`, metin: htmlToText(body.data) };
}

// ---------------------------------------------------------------------------

/**
 * Searches decisions. `adli` (the default) asks Yargıtay and UYAP Emsal together,
 * splitting the limit, and still answers when one of them fails.
 */
export async function searchDecisions(
  params: { query: string; court?: IctihatCourt; limit?: number; page?: number },
  fetchFn: FetchFn = fetch,
): Promise<IctihatSearchResult & { warnings?: string[] }> {
  const phrase = andQuery(params.query);
  const court = params.court ?? "adli";
  const limit = Math.min(Math.max(Math.trunc(params.limit ?? 10), 1), MAX_RESULTS);
  const page = Math.max(Math.trunc(params.page ?? 1), 1);

  if (court === "yargitay") return searchYargitay(fetchFn, phrase, limit, page);
  if (court === "emsal") return searchEmsal(fetchFn, phrase, limit, page);

  const yargitayLimit = Math.max(Math.ceil(limit / 2), 1);
  const emsalLimit = Math.max(limit - yargitayLimit, 1);
  const [yargitay, emsal] = await Promise.allSettled([
    searchYargitay(fetchFn, phrase, yargitayLimit, page),
    searchEmsal(fetchFn, phrase, emsalLimit, page),
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
  return { total, results, ...(warnings.length ? { warnings } : {}) };
}

/** Full text of one decision, by an id from searchDecisions. */
export async function getDecision(id: string, fetchFn: FetchFn = fetch): Promise<IctihatDecision> {
  const trimmed = id.trim();
  if (!/^(yargitay:)?\d+$/i.test(trimmed)) {
    throw new IctihatSourceError("Use a decision id returned by the case-law search.");
  }
  return trimmed.toLowerCase().startsWith(YARGITAY_PREFIX)
    ? getYargitay(fetchFn, trimmed.slice(YARGITAY_PREFIX.length))
    : getEmsal(fetchFn, trimmed);
}
