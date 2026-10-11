// mikeTR: Türk mevzuatı semantik araması. Model hukuki bir kural veya madde
// söylemeden önce bu aracı çağırır; cevaptaki atıflar sonradan
// lib/citationCheck.ts ile bu aramaların sonuçlarına göre doğrulanır.
import type { KanunCitationsEvent, KanunSearchEvent } from "@mike/contracts";
import type { Db } from "../../../../lib/supabase";
import { searchKanunMaddeleri } from "../../../../lib/kanunSearch";
import { checkStatuteCitations } from "../../../../lib/citationCheck";
import { statuteCurrencyDates } from "../../../kanun/kanun.service";

export type { KanunCitationsEvent, KanunSearchEvent } from "@mike/contracts";

export const KANUN_TOOL_NAMES = {
    search: "search_kanun_maddeleri",
} as const;

const MATCH_THRESHOLD = 0.5;

export const KANUN_SYSTEM_PROMPT = `TURKISH STATUTE SEARCH (search_kanun_maddeleri):
The search_kanun_maddeleri tool performs semantic search over the full text of these Turkish laws (short name used in citations, law number): Türk Medeni Kanunu (TMK, 4721) and its Yürürlük Kanunu (4722), Fikir ve Sanat Eserleri Kanunu (FSEK, 5846), Çek Kanunu (Çek K., 5941), Türk Borçlar Kanunu (TBK, 6098) and its Yürürlük Kanunu (6101), Hukuk Muhakemeleri Kanunu (HMK, 6100), Türk Ticaret Kanunu (TTK, 6102) and its Yürürlük Kanunu (6103), Sermaye Piyasası Kanunu (SPK, 6362), Tüketicinin Korunması Hakkında Kanun (TKHK, 6502), Kişisel Verilerin Korunması Kanunu (KVKK, 6698), Sınai Mülkiyet Kanunu (SMK, 6769). For the Yürürlük laws cite the law number, e.g. "(6101 s. K. md. 1)".
- Before stating any Turkish legal rule, right, obligation, deadline, sanction or article number, call search_kanun_maddeleri. Phrase the query as a short Turkish legal description of the issue (e.g. "kiracının kira bedelini ödememesi temerrüt fesih"), not as the user's full question. For questions touching several issues, call it once per issue.
- Cite statutes inline in prose using the law's short name and article number exactly as returned, e.g. "(TBK md. 315)", "(KVKK md. 5)", "(TMK Geçici md. 1)". Only cite article numbers that appear in the tool results of this conversation. NEVER cite an article number from memory.
- When you quote statutory text, quote it verbatim from the tool result.
- If the results do not cover the question (unrelated articles, or the relevant law is not in the list above — e.g. İcra ve İflas Kanunu, İş Kanunu, Türk Ceza Kanunu), say clearly that the statute database does not contain the relevant provision. You may then give general guidance, but do not cite any article numbers for it, and mark every such part of the answer with this exact sentence in its own paragraph: "Not: Bu bölüm, veritabanındaki kanun metinleriyle doğrulanmamıştır; ilgili mevzuatın güncel metninden kontrol edilmelidir." This applies even when the rest of the answer is grounded in search results.
- Each result has metin_guncelligi: the date the law's text was last confirmed against mevzuat.gov.tr. If it is "doğrulanmadı" or more than 30 days old, add a short note that recent amendments may not be reflected.
- Statute citations go in prose only. The <CITATIONS> block is reserved for user documents and fetched opinions; never put statutes in it.`;

export const KANUN_TOOLS = [
    {
        type: "function",
        function: {
            name: KANUN_TOOL_NAMES.search,
            description:
                "Semantic search over the full text of the Turkish laws listed under TURKISH STATUTE SEARCH. Returns the most relevant articles with law name, article number, article title, text and a similarity score (0-1; above ~0.6 is usually relevant). Call this before stating any Turkish legal rule or citing any article.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description:
                            "Short Turkish description of the legal issue, e.g. 'hâkimin reddi sebepleri' or 'ayıplı malda tüketicinin seçimlik hakları'.",
                    },
                    limit: {
                        type: "integer",
                        description: "Number of articles to return (1-10, default 6).",
                    },
                },
                required: ["query"],
            },
        },
    },
];

/** Runs one search and returns the UI event plus the tool result for the model. */
export async function runKanunSearch(
    db: Db,
    args: Record<string, unknown>,
): Promise<{ event: KanunSearchEvent; content: string }> {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const limit =
        typeof args.limit === "number"
            ? Math.min(Math.max(Math.trunc(args.limit), 1), 10)
            : 6;
    try {
        if (!query) throw new Error("query is required");
        const matches = await searchKanunMaddeleri(db, {
            query,
            limit,
            matchThreshold: MATCH_THRESHOLD,
        });
        const currentAsOf = await statuteCurrencyDates(db);
        return {
            event: {
                type: "kanun_search",
                query,
                results: matches.map((m) => ({
                    kanun_no: m.kanun_no,
                    kanun_adi: m.kanun_adi,
                    madde_no: m.madde_no,
                    baslik: m.baslik,
                    similarity: m.similarity,
                })),
            },
            content: JSON.stringify({
                ok: true,
                query,
                results: matches.map((m) => ({
                    kanun: `${m.kanun_adi} (${m.kanun_no})`,
                    madde_no: m.madde_no,
                    baslik: m.baslik,
                    similarity: Number(m.similarity.toFixed(3)),
                    metin_guncelligi: currentAsOf.get(m.kanun_no) ?? "doğrulanmadı",
                    metin: m.icerik,
                })),
                note:
                    matches.length === 0
                        ? "No article scored above the relevance threshold."
                        : undefined,
            }),
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return {
            event: { type: "kanun_search", query, results: [], error: message },
            content: JSON.stringify({
                ok: false,
                error: `Statute search failed: ${message}. Tell the user statute search is unavailable and do not cite article numbers.`,
            }),
        };
    }
}

function retrievedKey(kanunNo: string, maddeNo: string): string {
    return `${kanunNo}|${maddeNo}`;
}

/** Articles returned by statute searches in this chat's earlier assistant messages. */
async function loadPriorKanunKeys(db: Db, chatId: string): Promise<Set<string>> {
    const keys = new Set<string>();
    const { data, error } = await db
        .from("chat_messages")
        .select("content")
        .eq("chat_id", chatId)
        .eq("role", "assistant");
    if (error) {
        console.error("[kanunTools] prior searches could not be loaded:", error.message);
        return keys;
    }
    for (const row of (data ?? []) as { content: unknown }[]) {
        if (!Array.isArray(row.content)) continue;
        for (const e of row.content as KanunSearchEvent[]) {
            if (e?.type !== "kanun_search" || !Array.isArray(e.results)) continue;
            for (const r of e.results) keys.add(retrievedKey(r.kanun_no, r.madde_no));
        }
    }
    return keys;
}

/**
 * Checks the statute citations in the finished answer. Returns null when the
 * answer cites no statutes, so callers emit nothing.
 */
export async function buildKanunCitationsEvent(
    db: Db,
    fullText: string,
    turnEvents: readonly { type: string }[],
    chatId?: string | null,
): Promise<KanunCitationsEvent | null> {
    const retrieved = chatId ? await loadPriorKanunKeys(db, chatId) : new Set<string>();
    for (const e of turnEvents) {
        if (e.type !== "kanun_search") continue;
        for (const r of (e as KanunSearchEvent).results) {
            retrieved.add(retrievedKey(r.kanun_no, r.madde_no));
        }
    }
    const citations = await checkStatuteCitations(fullText, retrieved, db);
    return citations.length > 0 ? { type: "kanun_citations", citations } : null;
}
