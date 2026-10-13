// Turkish case-law search for the İçtihat page (mikeTR).
//
// The chat model reaches the same sources through the search_ictihat and
// get_karar tools (chat/engine/tools/ictihatTools.ts); this facade serves the
// direct search page, so a person can look decisions up without a chat.

import type { IctihatCourt, IctihatDecision, IctihatSearchResponse } from "@mike/contracts";
import {
  IctihatSourceError,
  getDecision,
  searchDecisions,
} from "../../lib/ictihat/client";
import { failure, internalFailure, ok, type ServiceResult } from "../../lib/serviceResult";

export type { IctihatDecision, IctihatSearchResponse } from "@mike/contracts";

const DEFAULT_LIMIT = 10;
const MAX_QUERY_LENGTH = 300;
const COURTS: readonly IctihatCourt[] = ["adli", "yargitay", "emsal"];

export async function searchCaseLaw(
  body: unknown,
  fetchFn: typeof fetch = fetch,
): Promise<ServiceResult<IctihatSearchResponse>> {
  const input = (body ?? {}) as { query?: unknown; court?: unknown; limit?: unknown; page?: unknown };
  const query = typeof input.query === "string" ? input.query.trim() : "";
  if (!query) return failure("validation", "Enter a search query.");
  if (query.length > MAX_QUERY_LENGTH) return failure("validation", "The search query is too long.");
  if (!/[\p{L}\p{N}]/u.test(query)) {
    return failure("validation", "The search query needs at least one letter or digit.");
  }
  const court = COURTS.includes(input.court as IctihatCourt) ? (input.court as IctihatCourt) : "adli";
  const limitRaw = Number(input.limit ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitRaw) ? limitRaw : DEFAULT_LIMIT;
  const pageRaw = Number(input.page ?? 1);
  const page = Number.isFinite(pageRaw) ? Math.max(Math.trunc(pageRaw), 1) : 1;

  try {
    const result = await searchDecisions({ query, court, limit, page }, fetchFn);
    return ok({ query, court, page, ...result });
  } catch (error) {
    if (error instanceof IctihatSourceError) return failure("unavailable", error.message);
    return internalFailure(error);
  }
}

export async function readCaseLawDecision(
  id: string,
  fetchFn: typeof fetch = fetch,
): Promise<ServiceResult<IctihatDecision>> {
  try {
    return ok(await getDecision(id, fetchFn));
  } catch (error) {
    if (error instanceof IctihatSourceError) return failure("unavailable", error.message);
    return internalFailure(error);
  }
}
