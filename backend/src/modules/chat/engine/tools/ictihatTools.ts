// mikeTR: Türk içtihadı araması. Model bir karara atıf yapmadan önce kararı bu
// araçlarla bulur ve okur; künye (mahkeme, esas/karar no, tarih) hafızadan değil
// Adalet Bakanlığı'nın karar servislerinden gelir (lib/ictihat/client.ts).
import type {
  IctihatCitationsEvent,
  IctihatCourt,
  IctihatDecisionEvent,
  IctihatSearchEvent,
} from "@mike/contracts";
import type { Db } from "../../../../lib/supabase";
import { checkCaseCitations, hitKey, type RetrievedDecisions } from "../../../../lib/ictihat/citationCheck";
import {
  MAX_RESULTS,
  getDecision,
  searchDecisions,
} from "../../../../lib/ictihat/client";

export type { IctihatCitationsEvent, IctihatDecisionEvent, IctihatSearchEvent } from "@mike/contracts";

export const ICTIHAT_TOOL_NAMES = {
  search: "search_ictihat",
  read: "get_karar",
} as const;

// A decision can run to tens of thousands of characters; the model gets the
// opening (court, parties' claims) and the reasoning up to this length.
const MAX_DECISION_CHARS = 24_000;

export const ICTIHAT_SYSTEM_PROMPT = `TURKISH CASE LAW (search_ictihat, get_karar):
search_ictihat searches published Turkish court decisions: Yargıtay (Court of Cassation), UYAP Emsal (regional courts of appeal and some first-instance courts), Danıştay (Council of State, administrative and tax law) and the Anayasa Mahkemesi (Constitutional Court: individual applications and constitutional review). get_karar returns a decision's full text.
- Choose the court by the question: civil, commercial and criminal law -> adli (or yargitay); administrative acts, zoning, public servants, tax -> danistay; fundamental rights violations -> anayasa; whether a statute is unconstitutional -> norm.
- Use them when the user asks for case law, precedent, "Yargıtay kararı", "içtihat", or how courts apply a rule. Search with a few distinctive Turkish legal terms, not a sentence: every word must appear in the decision (e.g. "kiracının temerrüdü tahliye", "belirsiz alacak davası"). Put fixed phrases in double quotes ("ihtiyaç nedeniyle tahliye") and exclude terms with a leading minus (-ceza). If there are no results, retry with fewer or more general terms.
- Narrow with the optional filters when the question calls for it: daire (a Yargıtay chamber, e.g. "3. Hukuk Dairesi" for tenancy, "12. Hukuk Dairesi" for enforcement; or a Danıştay one, e.g. "4. Daire" for tax, "6. Daire" for zoning), baslangic/bitis (decision date range) and siralama "yeni" for the most recent decisions. Prefer recent decisions when the law has changed. kesinlesme "kesinlesti" keeps only final decisions of the regional and first-instance courts.
- Before relying on or quoting a decision, read it with get_karar. Search results contain only the citation details, not the holding.
- Cite a decision exactly by the "atif" field of the result, e.g. "(Yargıtay 12. Hukuk Dairesi, E.2023/8563 K.2024/4902, T.16.05.2024)", "(Danıştay 4. Daire, E.2025/4453 K.2026/990, T.02.03.2026)", "(AYM, B. No: 2019/27727, K.T. 08.01.2025)" or "(AYM, E.2024/176, K.2025/42, K.T. 11.02.2025)". NEVER write a court, esas/karar number or date that did not come from these tools in this conversation. Do not cite decisions from memory. After the answer, every decision citation is checked against the decisions found and read in this conversation, and unread or unsourced ones are flagged to the user.
- State what the decision actually held, from its text. Note when its "durum" says it is not final (KESİNLEŞMEDİ), and that decisions of the regional courts and first-instance courts are not binding precedent.
- Case citations go in prose only, never in the <CITATIONS> block.`;

const COURT_VALUES: readonly IctihatCourt[] = ["adli", "yargitay", "emsal", "danistay", "anayasa", "norm"];

export const ICTIHAT_TOOLS = [
  {
    type: "function",
    function: {
      name: ICTIHAT_TOOL_NAMES.search,
      description:
        "Search published Turkish court decisions (Yargıtay, UYAP Emsal, Danıştay, Anayasa Mahkemesi). Every word must appear in the decision. Returns citation details (court, esas/karar or application no, date, finality, outcome) and an id for get_karar.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              'A few distinctive Turkish legal terms, e.g. "kiracının temerrüdü tahliye". Use double quotes for exact phrases and a leading minus to exclude a term.',
          },
          court: {
            type: "string",
            enum: COURT_VALUES,
            description:
              "adli (default): Yargıtay and regional/first-instance courts together; yargitay: Court of Cassation only; emsal: regional courts of appeal and first-instance courts only; danistay: Council of State; anayasa: Constitutional Court individual applications; norm: Constitutional Court review of statutes.",
          },
          limit: {
            type: "integer",
            description: `Number of decisions to return (1-${MAX_RESULTS}, default 8).`,
          },
          page: { type: "integer", description: "Result page, starting at 1." },
          daire: {
            type: "string",
            description:
              'Optional chamber or board: Yargıtay ("3. Hukuk Dairesi", "Hukuk Genel Kurulu") or Danıştay ("4. Daire", "Vergi Dava Daireleri Kurulu"). Searches that court only.',
          },
          baslangic: { type: "string", description: "Optional earliest decision date, YYYY-MM-DD." },
          bitis: { type: "string", description: "Optional latest decision date, YYYY-MM-DD." },
          siralama: {
            type: "string",
            enum: ["ilgili", "yeni", "eski"],
            description: "ilgili (relevance, default), yeni (newest first) or eski (oldest first).",
          },
          kesinlesme: {
            type: "string",
            enum: ["kesinlesti", "kesinlesmedi"],
            description:
              "Optional finality: kesinlesti (final) or kesinlesmedi (not final). Searches regional and first-instance courts only, the one source that reports finality; cannot be combined with daire.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: ICTIHAT_TOOL_NAMES.read,
      description:
        "Read the full text of a Turkish court decision found with search_ictihat (its id field).",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: 'The decision id from search_ictihat, e.g. "yargitay:1065746300" or "aym:891e2b7d-…".' },
        },
        required: ["id"],
      },
    },
  },
];

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Unknown error";
}

// Citations of recently found decisions, so a get_karar call (often in a later
// model step than its search) can label the decision. Bounded; oldest go first.
const recentCitations = new Map<string, string>();
const MAX_REMEMBERED = 2_000;

function remember(id: string, atif: string): void {
  recentCitations.delete(id);
  recentCitations.set(id, atif);
  if (recentCitations.size > MAX_REMEMBERED) {
    recentCitations.delete(recentCitations.keys().next().value as string);
  }
}

/** One search: the UI event plus the tool result for the model. */
export async function runIctihatSearch(
  args: Record<string, unknown>,
  fetchFn: typeof fetch = fetch,
): Promise<{ event: IctihatSearchEvent; content: string }> {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  const court = COURT_VALUES.includes(args.court as IctihatCourt) ? (args.court as IctihatCourt) : "adli";
  const limit = typeof args.limit === "number" ? args.limit : 8;
  const page = typeof args.page === "number" ? args.page : 1;
  try {
    if (!query) throw new Error("query is required");
    const filters = Object.fromEntries(
      (["daire", "baslangic", "bitis", "siralama", "kesinlesme"] as const)
        .filter((key) => typeof args[key] === "string" && args[key])
        .map((key) => [key, args[key] as string]),
    );
    const result = await searchDecisions({ query, court, limit, page, filters }, fetchFn);
    for (const hit of result.results) remember(hit.id, hit.atif);
    return {
      event: { type: "ictihat_search", query, court: result.court, total: result.total, results: result.results },
      content: JSON.stringify({
        ok: true,
        query,
        court: result.court,
        filters: result.filters,
        total: result.total,
        ...(result.approximate ? { total_is_lower_bound: true } : {}),
        results: result.results.map(({ kaynak_turu: _source, ...hit }) => hit),
        warnings: result.warnings,
        note:
          result.results.length === 0
            ? "No decision contains all of these terms. Retry with fewer or more general terms."
            : "Read a decision with get_karar before relying on it.",
      }),
    };
  } catch (error) {
    const message = errorMessage(error);
    return {
      event: { type: "ictihat_search", query, court, total: 0, results: [], error: message },
      content: JSON.stringify({
        ok: false,
        error: `Case-law search failed: ${message}. Tell the user and do not cite any decision you have not read.`,
      }),
    };
  }
}

/** Reads one decision; `atif` is known when an earlier search returned it. */
export async function runGetKarar(
  args: Record<string, unknown>,
  fetchFn: typeof fetch = fetch,
): Promise<{ event: IctihatDecisionEvent; content: string }> {
  const id = typeof args.id === "string" ? args.id.trim() : "";
  const atif = recentCitations.get(id) ?? null;
  try {
    const decision = await getDecision(id, fetchFn);
    const truncated = decision.metin.length > MAX_DECISION_CHARS;
    return {
      event: { type: "ictihat_karar", id: decision.id, atif, kaynak: decision.kaynak },
      content: JSON.stringify({
        ok: true,
        id: decision.id,
        atif,
        kaynak: decision.kaynak,
        metin: truncated ? `${decision.metin.slice(0, MAX_DECISION_CHARS)}\n[…]` : decision.metin,
        ...(truncated ? { note: "The text was shortened; the full decision is at kaynak." } : {}),
      }),
    };
  } catch (error) {
    const message = errorMessage(error);
    return {
      event: { type: "ictihat_karar", id, atif, kaynak: null, error: message },
      content: JSON.stringify({ ok: false, error: `Could not read the decision: ${message}` }),
    };
  }
}

type IctihatEvent = IctihatSearchEvent | IctihatDecisionEvent;

function isIctihatEvent(event: unknown): event is IctihatEvent {
  const type = (event as { type?: unknown } | null)?.type;
  return type === "ictihat_search" || type === "ictihat_karar";
}

/** Case-law searches and reads in this chat's earlier assistant messages. */
async function loadPriorIctihatEvents(db: Db, chatId: string): Promise<IctihatEvent[]> {
  const { data, error } = await db
    .from("chat_messages")
    .select("content")
    .eq("chat_id", chatId)
    .eq("role", "assistant");
  if (error) {
    console.error("[ictihatTools] prior case-law searches could not be loaded:", error.message);
    return [];
  }
  return ((data ?? []) as { content: unknown }[]).flatMap((row) =>
    Array.isArray(row.content) ? row.content.filter(isIctihatEvent) : [],
  );
}

/** What the model found and read, keyed by the numbers a citation uses. */
export function retrievedDecisions(events: readonly IctihatEvent[]): RetrievedDecisions {
  const found = new Map<string, string>();
  const keyById = new Map<string, string>();
  for (const event of events) {
    if (event.type !== "ictihat_search" || !Array.isArray(event.results)) continue;
    for (const hit of event.results) {
      const key = hitKey(hit);
      if (!key) continue;
      found.set(key, hit.atif);
      keyById.set(hit.id, key);
    }
  }
  const read = new Set<string>();
  for (const event of events) {
    if (event.type !== "ictihat_karar" || event.error) continue;
    const key = keyById.get(event.id);
    if (key) read.add(key);
  }
  return { found, read };
}

/**
 * Checks the decision citations in the finished answer. Returns null when the
 * answer cites no decisions, so callers emit nothing.
 */
export async function buildIctihatCitationsEvent(
  db: Db,
  fullText: string,
  turnEvents: readonly { type: string }[],
  chatId?: string | null,
): Promise<IctihatCitationsEvent | null> {
  const prior = chatId ? await loadPriorIctihatEvents(db, chatId) : [];
  const retrieved = retrievedDecisions([...prior, ...turnEvents.filter(isIctihatEvent)]);
  const citations = checkCaseCitations(fullText, retrieved);
  return citations.length > 0 ? { type: "ictihat_citations", citations } : null;
}
