// Turkish statute search for the assistant's start screen (mikeTR).
//
// The chat model reaches the same index through the search_kanun_maddeleri
// tool (chat/engine/tools/kanunTools.ts); this facade serves the direct
// search panel, so a person can look articles up without starting a chat.

import type { KanunArticle, KanunSearchResponse } from "@mike/contracts";
import type { Db } from "../../lib/supabase";
import { searchKanunMaddeleri } from "../../lib/kanunSearch";
import {
  failure,
  internalFailure,
  ok,
  type ServiceResult,
} from "../../lib/serviceResult";

export type { KanunArticle, KanunSearchResponse } from "@mike/contracts";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const MAX_QUERY_LENGTH = 500;
// Relevant articles score 0.6-0.8 with BGE-M3; unrelated ones about 0.35.
const MATCH_THRESHOLD = 0.5;

export async function searchStatutes(
  db: Db,
  body: unknown,
): Promise<ServiceResult<KanunSearchResponse>> {
  const input = (body ?? {}) as { query?: unknown; limit?: unknown };
  const query = typeof input.query === "string" ? input.query.trim() : "";
  if (!query) return failure("validation", "Enter a search query.");
  if (query.length > MAX_QUERY_LENGTH) {
    return failure("validation", "The search query is too long.");
  }
  const limitRaw = Number(input.limit ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  try {
    const matches = await searchKanunMaddeleri(db, {
      query,
      limit,
      matchThreshold: MATCH_THRESHOLD,
    });
    const results: KanunArticle[] = matches.map((match) => ({
      id: match.id,
      kanun_no: match.kanun_no,
      kanun_adi: match.kanun_adi,
      madde_no: match.madde_no,
      baslik: match.baslik,
      icerik: match.icerik,
      similarity: match.similarity,
    }));
    return ok({ query, results });
  } catch (error) {
    return internalFailure(error);
  }
}
