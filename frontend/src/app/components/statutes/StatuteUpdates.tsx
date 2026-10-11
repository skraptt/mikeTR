"use client";

// mikeTR: review page for differences between the statute index and the
// official text on mevzuat.gov.tr. Nothing reaches the index until a statute
// admin approves it here.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/app/components/shared/PageHeader";
import { EmptyState } from "@/app/components/ui/empty-state";
import { PillButtonUI } from "@/shared/ui/PillButtonUI";
import { kanunMaddeEtiketi } from "@/app/components/assistant/message/KanunBlocks";
import type { StatuteUpdate, StatuteUpdatesResponse } from "@/app/components/shared/types";
import {
    MikeApiError,
    decideStatuteUpdate,
    getStatuteStatus,
    listStatuteUpdates,
    startStatuteCheck,
} from "@/app/lib/mikeApi";
import { userFacingApiError } from "@/app/lib/userFacingError";
import { LIQUID_GLASS_FLAT_CLASS } from "@/app/components/ui/liquid-surface";
import { cn } from "@/app/lib/utils";
import { t } from "@/shared/i18n";
import { formatStatuteDate } from "./StatuteSearch";
import { wordDiff } from "./wordDiff";

const CHECK_POLL_MS = 5_000;

const TUR_LABELS: Record<StatuteUpdate["tur"], string> = {
    yeni: "New article",
    degisti: "Changed",
    kaldirildi: "Removed",
};

function DiffText({ oldText, newText, side }: { oldText: string; newText: string; side: "old" | "new" }) {
    const parts = useMemo(() => wordDiff(oldText, newText), [oldText, newText]);
    if (!parts) return <>{side === "old" ? oldText : newText}</>;
    return (
        <>
            {parts.map((part, index) => {
                if (part.kind === "same") return <span key={index}>{part.text}</span>;
                if (side === "old" && part.kind === "removed") {
                    return (
                        <del key={index} className="bg-red-100 text-red-800 decoration-red-400">
                            {part.text}
                        </del>
                    );
                }
                if (side === "new" && part.kind === "added") {
                    return (
                        <ins key={index} className="bg-green-100 text-green-900 no-underline">
                            {part.text}
                        </ins>
                    );
                }
                return null;
            })}
        </>
    );
}

function ChangeCard({
    change,
    busy,
    onDecide,
}: {
    change: StatuteUpdate;
    busy: boolean;
    onDecide: (decision: "approve" | "reject") => void;
}) {
    const oldText = change.eski_icerik ?? "";
    const newText = change.yeni_icerik ?? "";
    const titleChanged = (change.eski_baslik ?? "") !== (change.yeni_baslik ?? "");
    return (
        <article className={cn("rounded-2xl px-5 py-4", LIQUID_GLASS_FLAT_CLASS)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-serif text-lg text-gray-950">
                    {kanunMaddeEtiketi(change)}
                    {(change.yeni_baslik ?? change.eski_baslik) && (
                        <span className="text-gray-600"> – {change.yeni_baslik ?? change.eski_baslik}</span>
                    )}
                </h3>
                <span
                    className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        change.tur === "yeni" && "bg-green-100 text-green-800",
                        change.tur === "degisti" && "bg-amber-100 text-amber-800",
                        change.tur === "kaldirildi" && "bg-red-100 text-red-800",
                    )}
                >
                    {t(TUR_LABELS[change.tur])}
                </span>
            </div>
            {titleChanged && change.tur === "degisti" && (
                <p className="mt-1 text-xs text-gray-500">
                    {t("Title: {old} → {new}", {
                        old: change.eski_baslik ?? "—",
                        new: change.yeni_baslik ?? "—",
                    })}
                </p>
            )}
            <div className="mt-3 grid gap-3 md:grid-cols-2">
                <section aria-label={t("Text in the index")}>
                    <p className="mb-1 text-xs font-medium text-gray-500">{t("Text in the index")}</p>
                    <p className="whitespace-pre-line rounded-xl bg-white/60 p-3 text-sm leading-6 text-gray-700">
                        {change.tur === "yeni" ? (
                            <span className="text-gray-400">{t("Not in the index")}</span>
                        ) : (
                            <DiffText oldText={oldText} newText={newText} side="old" />
                        )}
                    </p>
                </section>
                <section aria-label={t("Official text")}>
                    <p className="mb-1 text-xs font-medium text-gray-500">{t("Official text")}</p>
                    <p className="whitespace-pre-line rounded-xl bg-white/60 p-3 text-sm leading-6 text-gray-700">
                        {change.tur === "kaldirildi" ? (
                            <span className="text-gray-400">{t("No longer in the official text")}</span>
                        ) : (
                            <DiffText oldText={oldText} newText={newText} side="new" />
                        )}
                    </p>
                </section>
            </div>
            <div className="mt-3 flex justify-end gap-2">
                <PillButtonUI tone="white" size="sm" disabled={busy} onClick={() => onDecide("reject")}>
                    {t("Reject")}
                </PillButtonUI>
                <PillButtonUI tone="black" size="sm" loading={busy} disabled={busy} onClick={() => onDecide("approve")}>
                    {t("Approve")}
                </PillButtonUI>
            </div>
        </article>
    );
}

export function StatuteUpdatesPage() {
    const router = useRouter();
    const [data, setData] = useState<StatuteUpdatesResponse | null>(null);
    const [error, setError] = useState<{ message: string; forbidden: boolean } | null>(null);
    const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
    const [notice, setNotice] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);

    const load = useCallback(async () => {
        try {
            setData(await listStatuteUpdates());
            setError(null);
        } catch (cause) {
            setError({
                message: userFacingApiError(cause, t("Statute updates could not be loaded. Please try again.")),
                forbidden: cause instanceof MikeApiError && cause.status === 403,
            });
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches from the API; state is only set once the request resolves
        void load();
    }, [load]);

    // While a check runs, poll until it is done and then show its results.
    useEffect(() => {
        if (!checking) return;
        const timer = setInterval(() => {
            void getStatuteStatus()
                .then((status) => {
                    if (status.kontrol_suruyor) return;
                    setChecking(false);
                    void load();
                })
                .catch(() => setChecking(false));
        }, CHECK_POLL_MS);
        return () => clearInterval(timer);
    }, [checking, load]);

    async function checkNow() {
        setNotice(null);
        try {
            await startStatuteCheck();
            setChecking(true);
        } catch (cause) {
            setNotice(userFacingApiError(cause, t("The check could not be started. Please try again.")));
        }
    }

    async function decide(ids: string[], decision: "approve" | "reject") {
        setNotice(null);
        setBusyIds((current) => new Set([...current, ...ids]));
        let notSearchable = 0;
        let failed = 0;
        for (const id of ids) {
            try {
                const result = await decideStatuteUpdate(id, decision);
                if (!result.aranabilir) notSearchable++;
                setData((current) =>
                    current
                        ? { ...current, degisiklikler: current.degisiklikler.filter((c) => c.id !== id) }
                        : current,
                );
            } catch {
                failed++;
            }
            setBusyIds((current) => {
                const next = new Set(current);
                next.delete(id);
                return next;
            });
        }
        const messages: string[] = [];
        if (failed > 0) {
            messages.push(
                t.plural(
                    failed,
                    "{count} change could not be saved. Run the check again and retry.",
                    "{count} changes could not be saved. Run the check again and retry.",
                ),
            );
        }
        if (notSearchable > 0) {
            messages.push(
                t.plural(
                    notSearchable,
                    "{count} approved article is not searchable yet: its embedding could not be created. Run npm run kanun:embed.",
                    "{count} approved articles are not searchable yet: their embeddings could not be created. Run npm run kanun:embed.",
                ),
            );
        }
        setNotice(messages.length > 0 ? messages.join(" ") : null);
        void load();
    }

    const groups = useMemo(() => {
        if (!data) return [];
        return data.kanunlar.map((kanun) => ({
            kanun,
            changes: data.degisiklikler.filter((c) => c.kanun_no === kanun.kanun_no),
        }));
    }, [data]);

    return (
        <div className="flex h-full min-h-0 flex-col">
            <PageHeader
                shrink
                breadcrumbs={[
                    { label: t("Statutes"), onClick: () => router.push("/statutes") },
                    { label: t("Updates") },
                ]}
            />
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 md:px-8">
                <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
                    {error ? (
                        <EmptyState
                            className="mt-10"
                            tone={error.forbidden ? "default" : "error"}
                            title={error.forbidden ? t("Statute admins only") : t("Updates unavailable")}
                            description={
                                error.forbidden
                                    ? t("Statute changes are reviewed by the addresses listed in KANUN_ADMIN_EMAILS.")
                                    : error.message
                            }
                        />
                    ) : !data ? (
                        <p role="status" className="py-6 text-sm text-gray-500">
                            {t("Loading...")}
                        </p>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="max-w-2xl text-sm text-gray-600">
                                    {t(
                                        "Each law is compared with its consolidated text on mevzuat.gov.tr once a day. Differences wait here; approving one updates the index and archives the previous text.",
                                    )}
                                </p>
                                <PillButtonUI tone="black" size="sm" loading={checking} disabled={checking} onClick={() => void checkNow()}>
                                    {checking ? t("Checking…") : t("Check now")}
                                </PillButtonUI>
                            </div>
                            {notice && (
                                <p role="alert" className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">
                                    {notice}
                                </p>
                            )}
                            {groups.map(({ kanun, changes }) => (
                                <section key={kanun.kanun_no} aria-label={kanun.kanun_adi} className="flex flex-col gap-3">
                                    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-200 pb-2">
                                        <div>
                                            <h2 className="font-serif text-xl text-gray-950">
                                                {kanun.kanun_adi} ({kanun.kanun_no})
                                            </h2>
                                            <p className="text-xs text-gray-500">
                                                {kanun.guncellik_tarihi
                                                    ? t("Current as of {date}", {
                                                          date: formatStatuteDate(kanun.guncellik_tarihi),
                                                      })
                                                    : t("Not yet confirmed current")}
                                                {" · "}
                                                {kanun.son_kontrol
                                                    ? t("Last checked {date}", { date: formatStatuteDate(kanun.son_kontrol) })
                                                    : t("Never checked")}
                                                {" · "}
                                                <a
                                                    href={kanun.kaynak_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-0.5 hover:text-gray-800"
                                                >
                                                    mevzuat.gov.tr
                                                    <ExternalLink className="h-3 w-3" aria-hidden />
                                                </a>
                                            </p>
                                            {kanun.son_kontrol_hatasi && (
                                                <p className="mt-1 text-xs text-red-600">
                                                    {t("Last check failed: {error}", { error: kanun.son_kontrol_hatasi })}
                                                </p>
                                            )}
                                        </div>
                                        {changes.length > 1 && (
                                            <PillButtonUI
                                                tone="white"
                                                size="sm"
                                                disabled={changes.some((c) => busyIds.has(c.id))}
                                                onClick={() => void decide(changes.map((c) => c.id), "approve")}
                                            >
                                                {t("Approve all ({count})", { count: changes.length })}
                                            </PillButtonUI>
                                        )}
                                    </div>
                                    {changes.length === 0 ? (
                                        <p className="text-sm text-gray-500">{t("No pending changes.")}</p>
                                    ) : (
                                        changes.map((change) => (
                                            <ChangeCard
                                                key={change.id}
                                                change={change}
                                                busy={busyIds.has(change.id)}
                                                onDecide={(decision) => void decide([change.id], decision)}
                                            />
                                        ))
                                    )}
                                </section>
                            ))}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
