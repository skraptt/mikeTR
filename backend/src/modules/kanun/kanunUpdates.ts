// mikeTR: keeping the statute index in step with mevzuat.gov.tr.
//
// runStatuteCheck() compares each law with its official consolidated text and
// records the differences as pending changes; it never edits the index.
// decideStatuteUpdate() applies (or discards) one change after a statute
// admin has reviewed it, archiving the text it replaces.

import type { Db } from "../../lib/supabase";
import {
  computeKanunChanges,
  fetchKanunHtml,
  mevzuatPageUrl,
  normalizeForCompare,
  parseKanunHtml,
  type KanunChange,
  type KanunSource,
  type StoredMadde,
} from "../../lib/kanunSync";
import {
  EMBEDDING_PROVIDERS,
  createTextEmbeddings,
  getEmbeddingProvider,
  kanunEmbeddingText,
} from "../../lib/kanunSearch";
import {
  failure,
  internalFailure,
  ok,
  type ServiceResult,
} from "../../lib/serviceResult";

export type KanunRow = KanunSource & {
  kanun_adi: string;
  guncellik_tarihi: string | null;
  son_kontrol: string | null;
  son_kontrol_hatasi: string | null;
};

export type StatuteUpdate = KanunChange & {
  id: string;
  kanun_no: string;
  durum: "beklemede" | "onaylandi" | "reddedildi";
  tespit_tarihi: string;
};

export type StatuteCheckResult = {
  kanun_no: string;
  bekleyen: number;
  yeni_bulunan: number;
  hata?: string;
};

const KANUN_COLUMNS =
  "kanun_no, kanun_adi, mevzuat_tur, mevzuat_tertip, guncellik_tarihi, son_kontrol, son_kontrol_hatasi";
const UPDATE_COLUMNS =
  "id, kanun_no, madde_no, tur, eski_baslik, eski_icerik, yeni_baslik, yeni_icerik, yeni_ozet, durum, tespit_tarihi";
// One request per law, a second apart: the check must stay a light load on
// a public service.
const DELAY_BETWEEN_LAWS_MS = 1_000;

/** Statute admins are listed in KANUN_ADMIN_EMAILS (comma-separated). */
export function isStatuteAdmin(email: string | undefined | null): boolean {
  if (!email) return false;
  const admins = (process.env.KANUN_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}

export async function listKanunlar(db: Db): Promise<KanunRow[]> {
  const { data, error } = await db.from("kanunlar").select(KANUN_COLUMNS).order("kanun_no");
  if (error) throw error;
  return (data ?? []) as KanunRow[];
}

async function loadStoredMaddeler(db: Db, kanunNo: string): Promise<StoredMadde[]> {
  const rows: StoredMadde[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("kanun_maddeleri")
      .select("madde_no, baslik, icerik")
      .eq("kanun_no", kanunNo)
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as StoredMadde[]));
    if (!data || data.length < 1000) return rows;
  }
}

async function pendingCount(db: Db, kanunNo: string): Promise<number> {
  const { count, error } = await db
    .from("kanun_degisiklikleri")
    .select("id", { count: "exact", head: true })
    .eq("kanun_no", kanunNo)
    .eq("durum", "beklemede");
  if (error) throw error;
  return count ?? 0;
}

/**
 * Stores this check's differences for one law. A change already pending
 * with the same text is left alone; a pending change whose text moved on
 * is refreshed; a change someone rejected is not proposed again; and a
 * pending change the official text no longer shows is withdrawn.
 */
async function recordChanges(
  db: Db,
  kanunNo: string,
  changes: KanunChange[],
): Promise<number> {
  const { data, error } = await db
    .from("kanun_degisiklikleri")
    .select("id, madde_no, durum, yeni_ozet")
    .eq("kanun_no", kanunNo)
    .in("durum", ["beklemede", "reddedildi"]);
  if (error) throw error;
  const known = (data ?? []) as {
    id: string;
    madde_no: string;
    durum: string;
    yeni_ozet: string;
  }[];
  const pending = new Map(known.filter((k) => k.durum === "beklemede").map((k) => [k.madde_no, k]));
  const rejected = new Set(
    known.filter((k) => k.durum === "reddedildi").map((k) => `${k.madde_no}|${k.yeni_ozet}`),
  );

  let added = 0;
  const stillDifferent = new Set<string>();
  for (const change of changes) {
    stillDifferent.add(change.madde_no);
    if (rejected.has(`${change.madde_no}|${change.yeni_ozet}`)) continue;
    const existing = pending.get(change.madde_no);
    if (existing?.yeni_ozet === change.yeni_ozet) continue;
    const row = {
      ...change,
      kanun_no: kanunNo,
      durum: "beklemede",
      tespit_tarihi: new Date().toISOString(),
    };
    const result = existing
      ? await db.from("kanun_degisiklikleri").update(row).eq("id", existing.id)
      : await db.from("kanun_degisiklikleri").insert(row);
    if (result.error) throw result.error;
    added++;
  }

  const withdrawn = [...pending.values()].filter((p) => !stillDifferent.has(p.madde_no));
  if (withdrawn.length > 0) {
    const { error: deleteError } = await db
      .from("kanun_degisiklikleri")
      .delete()
      .in(
        "id",
        withdrawn.map((p) => p.id),
      );
    if (deleteError) throw deleteError;
  }
  return added;
}

export async function runStatuteCheck(
  db: Db,
  options: { fetchHtml?: (source: KanunSource) => Promise<string>; delayMs?: number } = {},
): Promise<StatuteCheckResult[]> {
  const fetchHtml = options.fetchHtml ?? ((source: KanunSource) => fetchKanunHtml(source));
  const delayMs = options.delayMs ?? DELAY_BETWEEN_LAWS_MS;
  const results: StatuteCheckResult[] = [];
  const kanunlar = await listKanunlar(db);

  for (const [index, kanun] of kanunlar.entries()) {
    if (index > 0 && delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const checkedAt = new Date().toISOString();
    try {
      const remote = parseKanunHtml(await fetchHtml(kanun), kanun.kanun_no);
      const changes = computeKanunChanges(await loadStoredMaddeler(db, kanun.kanun_no), remote);
      const added = await recordChanges(db, kanun.kanun_no, changes);
      const bekleyen = await pendingCount(db, kanun.kanun_no);
      const { error } = await db
        .from("kanunlar")
        .update({
          son_kontrol: checkedAt,
          son_kontrol_hatasi: null,
          // Current means nothing is waiting for review; a rejected change
          // is a decision, not a gap.
          ...(bekleyen === 0 ? { guncellik_tarihi: checkedAt } : {}),
        })
        .eq("kanun_no", kanun.kanun_no);
      if (error) throw error;
      results.push({ kanun_no: kanun.kanun_no, bekleyen, yeni_bulunan: added });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .from("kanunlar")
        .update({ son_kontrol: checkedAt, son_kontrol_hatasi: message.slice(0, 500) })
        .eq("kanun_no", kanun.kanun_no);
      results.push({ kanun_no: kanun.kanun_no, bekleyen: 0, yeni_bulunan: 0, hata: message });
    }
  }
  return results;
}

export async function listStatuteUpdates(
  db: Db,
): Promise<ServiceResult<{ kanunlar: (KanunRow & { kaynak_url: string })[]; degisiklikler: StatuteUpdate[] }>> {
  try {
    const kanunlar = await listKanunlar(db);
    const { data, error } = await db
      .from("kanun_degisiklikleri")
      .select(UPDATE_COLUMNS)
      .eq("durum", "beklemede")
      .order("kanun_no")
      .order("tespit_tarihi");
    if (error) throw error;
    return ok({
      kanunlar: kanunlar.map((k) => ({ ...k, kaynak_url: mevzuatPageUrl(k) })),
      degisiklikler: (data ?? []) as StatuteUpdate[],
    });
  } catch (error) {
    return internalFailure(error);
  }
}

async function embedArticle(
  db: Db,
  row: { kanun_no: string; kanun_adi: string; madde_no: string; baslik: string | null; icerik: string },
): Promise<boolean> {
  try {
    const provider = getEmbeddingProvider();
    const [embedding] = await createTextEmbeddings([kanunEmbeddingText(row)], provider);
    const { error } = await db
      .from("kanun_maddeleri")
      .update({ [EMBEDDING_PROVIDERS[provider].column]: embedding })
      .eq("kanun_no", row.kanun_no)
      .eq("madde_no", row.madde_no);
    if (error) throw error;
    return true;
  } catch {
    // The text is already current; `npm run kanun:embed` fills the vector in.
    return false;
  }
}

export async function decideStatuteUpdate(
  db: Db,
  input: { id: string; decision: "approve" | "reject"; actorEmail: string },
): Promise<ServiceResult<{ durum: StatuteUpdate["durum"]; aranabilir: boolean }>> {
  try {
    const { data: update, error } = await db
      .from("kanun_degisiklikleri")
      .select(UPDATE_COLUMNS)
      .eq("id", input.id)
      .maybeSingle();
    if (error) throw error;
    if (!update) return failure("not_found", "Change not found.");
    const change = update as StatuteUpdate;
    if (change.durum !== "beklemede") {
      return failure("conflict", "This change has already been decided.");
    }

    const decidedAt = new Date().toISOString();
    let searchable = true;
    if (input.decision === "approve") {
      const { data: current, error: currentError } = await db
        .from("kanun_maddeleri")
        .select("baslik, icerik")
        .eq("kanun_no", change.kanun_no)
        .eq("madde_no", change.madde_no)
        .maybeSingle();
      if (currentError) throw currentError;
      // The change was computed against the text then in the index; if that
      // text has moved since, the comparison is stale.
      const unchanged = current
        ? normalizeForCompare(current.icerik) === normalizeForCompare(change.eski_icerik) &&
          normalizeForCompare(current.baslik) === normalizeForCompare(change.eski_baslik)
        : change.tur === "yeni";
      if (!unchanged) {
        return failure(
          "conflict",
          "The article changed after this comparison. Run the check again before deciding.",
        );
      }

      if (current) {
        const { error: archiveError } = await db.from("kanun_madde_arsivi").insert({
          kanun_no: change.kanun_no,
          madde_no: change.madde_no,
          baslik: current.baslik,
          icerik: current.icerik,
          gecerlilik_bitis: decidedAt,
          degisiklik_id: change.id,
        });
        if (archiveError) throw archiveError;
      }

      if (change.tur === "kaldirildi") {
        const { error: deleteError } = await db
          .from("kanun_maddeleri")
          .delete()
          .eq("kanun_no", change.kanun_no)
          .eq("madde_no", change.madde_no);
        if (deleteError) throw deleteError;
      } else {
        const { data: kanun, error: kanunError } = await db
          .from("kanunlar")
          .select("kanun_adi")
          .eq("kanun_no", change.kanun_no)
          .single();
        if (kanunError) throw kanunError;
        const row = {
          kanun_no: change.kanun_no,
          kanun_adi: kanun.kanun_adi as string,
          madde_no: change.madde_no,
          baslik: change.yeni_baslik,
          icerik: change.yeni_icerik ?? "",
        };
        const { error: upsertError } = await db
          .from("kanun_maddeleri")
          .upsert(
            { ...row, embedding: null, embedding_bge_m3: null },
            { onConflict: "kanun_no,madde_no" },
          );
        if (upsertError) throw upsertError;
        searchable = await embedArticle(db, row);
      }
    }

    const durum = input.decision === "approve" ? "onaylandi" : "reddedildi";
    const { error: decideError } = await db
      .from("kanun_degisiklikleri")
      .update({ durum, karar_tarihi: decidedAt, karar_veren: input.actorEmail })
      .eq("id", change.id);
    if (decideError) throw decideError;

    if ((await pendingCount(db, change.kanun_no)) === 0) {
      // Everything the last check found is decided: the law is as current as
      // that check.
      const { data: kanun } = await db
        .from("kanunlar")
        .select("son_kontrol")
        .eq("kanun_no", change.kanun_no)
        .single();
      await db
        .from("kanunlar")
        .update({ guncellik_tarihi: kanun?.son_kontrol ?? decidedAt })
        .eq("kanun_no", change.kanun_no);
    }
    return ok({ durum, aranabilir: searchable });
  } catch (error) {
    return internalFailure(error);
  }
}
