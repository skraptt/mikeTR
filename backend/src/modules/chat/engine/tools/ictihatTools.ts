// mikeTR: Türk içtihadı araması. Model bir karara atıf yapmadan önce kararı bu
// araçlarla bulur ve okur; künye (mahkeme, esas/karar no, tarih) hafızadan değil
// Adalet Bakanlığı'nın karar servislerinden gelir (lib/ictihat/client.ts).
import type { IctihatCourt, IctihatDecisionEvent, IctihatSearchEvent } from "@mike/contracts";
import {
  MAX_RESULTS,
  getDecision,
  searchDecisions,
} from "../../../../lib/ictihat/client";

export type { IctihatDecisionEvent, IctihatSearchEvent } from "@mike/contracts";

export const ICTIHAT_TOOL_NAMES = {
  search: "search_ictihat",
  read: "get_karar",
} as const;

// A decision can run to tens of thousands of characters; the model gets the
// opening (court, parties' claims) and the reasoning up to this length.
const MAX_DECISION_CHARS = 24_000;

export const ICTIHAT_SYSTEM_PROMPT = `TURKISH CASE LAW (search_ictihat, get_karar):
search_ictihat searches published Turkish court decisions: Yargıtay (Court of Cassation) and UYAP Emsal (regional courts of appeal and some first-instance courts). get_karar returns a decision's full text.
- Use them when the user asks for case law, precedent, "Yargıtay kararı", "içtihat", or how courts apply a rule. Search with a few distinctive Turkish legal terms, not a sentence: every word must appear in the decision (e.g. "kiracının temerrüdü tahliye", "belirsiz alacak davası"). Put fixed phrases in double quotes ("ihtiyaç nedeniyle tahliye") and exclude terms with a leading minus (-ceza). If there are no results, retry with fewer or more general terms.
- Before relying on or quoting a decision, read it with get_karar. Search results contain only the citation details, not the holding.
- Cite a decision exactly by the "atif" field of the result, e.g. "(Yargıtay 12. Hukuk Dairesi, E.2023/8563 K.2024/4902, T.16.05.2024)". NEVER write a court, esas/karar number or date that did not come from these tools in this conversation. Do not cite decisions from memory.
- State what the decision actually held, from its text. Note when its "durum" says it is not final (KESİNLEŞMEDİ), and that decisions of the regional courts and first-instance courts are not binding precedent.
- Case citations go in prose only, never in the <CITATIONS> block.`;

const COURT_VALUES: readonly IctihatCourt[] = ["adli", "yargitay", "emsal"];

export const ICTIHAT_TOOLS = [
  {
    type: "function",
    function: {
      name: ICTIHAT_TOOL_NAMES.search,
      description:
        "Search published Turkish court decisions (Yargıtay and UYAP Emsal). Every word must appear in the decision. Returns citation details (court, esas/karar no, date, finality) and an id for get_karar.",
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
              "adli (default): Yargıtay and regional/first-instance courts together; yargitay: Court of Cassation only; emsal: regional courts of appeal and first-instance courts only.",
          },
          limit: {
            type: "integer",
            description: `Number of decisions to return (1-${MAX_RESULTS}, default 8).`,
          },
          page: { type: "integer", description: "Result page, starting at 1." },
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
          id: { type: "string", description: 'The decision id from search_ictihat, e.g. "yargitay:1065746300".' },
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
    const result = await searchDecisions({ query, court, limit, page }, fetchFn);
    for (const hit of result.results) remember(hit.id, hit.atif);
    return {
      event: { type: "ictihat_search", query, court, total: result.total, results: result.results },
      content: JSON.stringify({
        ok: true,
        query,
        court,
        total: result.total,
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
