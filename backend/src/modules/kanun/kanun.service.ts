// Turkish statute search for the assistant's start screen (mikeTR).
//
// The chat model reaches the same index through the search_kanun_maddeleri
// tool (chat/engine/tools/kanunTools.ts); this facade serves the direct
// search panel, so a person can look articles up without starting a chat.

import type { KanunArticle, KanunSearchResponse } from "@mike/contracts";
import type { Db } from "../../lib/supabase";
import { searchKanunMaddeleri } from "../../lib/kanunSearch";
import { isStatuteAdmin, listKanunlar, runStatuteCheck } from "./kanunUpdates";
import {
  failure,
  internalFailure,
  ok,
  type ServiceResult,
} from "../../lib/serviceResult";

export type { KanunArticle, KanunSearchResponse } from "@mike/contracts";
export {
  decideStatuteUpdate,
  isStatuteAdmin,
  listStatuteUpdates,
  runStatuteCheck,
  type StatuteCheckResult,
  type StatuteUpdate,
} from "./kanunUpdates";

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
    // The law list is short and read once per search; a failure to read it
    // only hides the dates, never the results.
    const currentAsOf = new Map(
      (await listKanunlar(db).catch(() => [])).map((k) => [k.kanun_no, k.guncellik_tarihi]),
    );
    const results: KanunArticle[] = matches.map((match) => ({
      id: match.id,
      kanun_no: match.kanun_no,
      kanun_adi: match.kanun_adi,
      madde_no: match.madde_no,
      baslik: match.baslik,
      icerik: match.icerik,
      similarity: match.similarity,
      guncellik_tarihi: currentAsOf.get(match.kanun_no) ?? null,
    }));
    return ok({ query, results });
  } catch (error) {
    return internalFailure(error);
  }
}

export type StatuteStatus = {
  kanunlar: {
    kanun_no: string;
    kanun_adi: string;
    guncellik_tarihi: string | null;
    son_kontrol: string | null;
    son_kontrol_hatasi: string | null;
  }[];
  bekleyen: number;
  yetkili: boolean;
  kontrol_suruyor: boolean;
};

// One check at a time per process; the daily schedule and the admin's
// "check now" button share this flag.
let checkInFlight: Promise<unknown> | null = null;

export function isStatuteCheckRunning(): boolean {
  return checkInFlight !== null;
}

/** Starts a check in the background; false when one is already running. */
export function startStatuteCheck(
  db: Db,
  onDone?: (results: Awaited<ReturnType<typeof runStatuteCheck>>) => void,
  onError?: (error: unknown) => void,
): boolean {
  if (checkInFlight) return false;
  checkInFlight = runStatuteCheck(db)
    .then((results) => onDone?.(results))
    .catch((error) => onError?.(error))
    .finally(() => {
      checkInFlight = null;
    });
  return true;
}

export async function getStatuteStatus(
  db: Db,
  email: string | undefined,
): Promise<ServiceResult<StatuteStatus>> {
  try {
    const kanunlar = await listKanunlar(db);
    const { count, error } = await db
      .from("kanun_degisiklikleri")
      .select("id", { count: "exact", head: true })
      .eq("durum", "beklemede");
    if (error) throw error;
    return ok({
      kanunlar: kanunlar.map(({ kanun_no, kanun_adi, guncellik_tarihi, son_kontrol, son_kontrol_hatasi }) => ({
        kanun_no,
        kanun_adi,
        guncellik_tarihi,
        son_kontrol,
        son_kontrol_hatasi,
      })),
      bekleyen: count ?? 0,
      yetkili: isStatuteAdmin(email),
      kontrol_suruyor: isStatuteCheckRunning(),
    });
  } catch (error) {
    return internalFailure(error);
  }
}

/** Hours between daily statute checks; 0 turns the schedule off. */
export function statuteCheckIntervalMs(): number {
  const raw = Number(process.env.KANUN_SYNC_INTERVAL_HOURS ?? 24);
  return Number.isFinite(raw) && raw > 0 ? raw * 60 * 60 * 1000 : 0;
}

/**
 * Called hourly by the worker. Starts a check when the least recently
 * checked law is older than the interval, so restarts do not re-run it.
 */
export async function maybeStartScheduledStatuteCheck(
  db: Db,
  onError: (error: unknown) => void,
): Promise<boolean> {
  const interval = statuteCheckIntervalMs();
  if (!interval || isStatuteCheckRunning()) return false;
  const kanunlar = await listKanunlar(db);
  if (kanunlar.length === 0) return false;
  const oldest = Math.min(
    ...kanunlar.map((k) => (k.son_kontrol ? Date.parse(k.son_kontrol) : 0)),
  );
  if (Date.now() - oldest < interval) return false;
  return startStatuteCheck(
    db,
    (results) => {
      const pending = results.reduce((sum, r) => sum + r.bekleyen, 0);
      const failed = results.filter((r) => r.hata).map((r) => r.kanun_no);
      console.log("[kanun-check] done", { pending, failed });
    },
    onError,
  );
}

/** kanun_no -> the date its text was last confirmed (YYYY-MM-DD), or null. */
export async function statuteCurrencyDates(db: Db): Promise<Map<string, string | null>> {
  const kanunlar = await listKanunlar(db).catch(() => []);
  return new Map(kanunlar.map((k) => [k.kanun_no, k.guncellik_tarihi?.slice(0, 10) ?? null]));
}
