"use client";

// mikeTR: direct search over published Turkish court decisions (Yargıtay and
// UYAP Emsal), without starting a chat. The assistant reaches the same sources
// through its search_ictihat and get_karar tools.

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ExternalLink, Loader2, Search } from "lucide-react";
import { PageHeader } from "@/app/components/shared/PageHeader";
import { EmptyState } from "@/app/components/ui/empty-state";
import { PillButtonUI } from "@/shared/ui/PillButtonUI";
import type { IctihatCourt, IctihatHit, IctihatSearchResponse } from "@/app/components/shared/types";
import { getCaseLawDecision, searchCaseLaw } from "@/app/lib/mikeApi";
import { userFacingApiError } from "@/app/lib/userFacingError";
import { LIQUID_GLASS_FLAT_CLASS } from "@/app/components/ui/liquid-surface";
import { LIQUID_GLASS_SUBTLE_CLASS } from "@/shared/ui/LiquidGlassUI";
import { cn } from "@/app/lib/utils";
import { t } from "@/shared/i18n";

const PAGE_SIZE = 10;

const COURTS: { value: IctihatCourt; label: string }[] = [
    { value: "adli", label: "All civil courts" },
    { value: "yargitay", label: "Yargıtay" },
    { value: "emsal", label: "Regional and first-instance courts" },
];

function isCourt(value: string | null): value is IctihatCourt {
    return COURTS.some((court) => court.value === value);
}

function CaseLawIcon() {
    return <Image src="/icons/features/case-law.svg" alt="" width={32} height={32} unoptimized />;
}

type DecisionText =
    | { status: "closed" }
    | { status: "loading" }
    | { status: "open"; text: string }
    | { status: "error"; message: string };

function DecisionCard({ hit }: { hit: IctihatHit }) {
    const [text, setText] = useState<DecisionText>({ status: "closed" });

    async function toggle() {
        if (text.status === "open" || text.status === "error") {
            setText({ status: "closed" });
            return;
        }
        if (text.status === "loading") return;
        setText({ status: "loading" });
        try {
            const decision = await getCaseLawDecision(hit.id);
            setText({ status: "open", text: decision.metin });
        } catch (error) {
            setText({
                status: "error",
                message: userFacingApiError(error, t("The decision could not be loaded. Please try again.")),
            });
        }
    }

    const expanded = text.status === "open" || text.status === "error";
    return (
        <article className={cn("rounded-2xl px-5 py-4", LIQUID_GLASS_FLAT_CLASS)}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs text-gray-500">
                        {hit.kaynak_turu === "yargitay" ? t("Yargıtay") : t("UYAP Emsal")}
                    </p>
                    <h3 className="mt-0.5 font-serif text-lg text-gray-950">{hit.mahkeme}</h3>
                    <p className="mt-0.5 text-sm text-gray-700">
                        {t("Docket {esas} · Decision {karar} · {date}", {
                            esas: hit.esas_no,
                            karar: hit.karar_no,
                            date: hit.karar_tarihi,
                        })}
                    </p>
                </div>
                {hit.durum && (
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {hit.durum}
                    </span>
                )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <button
                    type="button"
                    onClick={() => void toggle()}
                    aria-expanded={expanded}
                    className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-950"
                >
                    {text.status === "loading" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : null}
                    {expanded ? t("Hide decision") : t("Read decision")}
                    <ChevronDown
                        className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
                        aria-hidden
                    />
                </button>
                <a
                    href={hit.kaynak}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-950"
                >
                    {t("Official source")}
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
            </div>
            {text.status === "open" && (
                <p className="mt-3 max-h-[28rem] overflow-y-auto whitespace-pre-line border-t border-gray-100 pt-3 text-sm leading-6 text-gray-700">
                    {text.text}
                </p>
            )}
            {text.status === "error" && (
                <p role="alert" className="mt-3 text-sm text-red-600">
                    {text.message}
                </p>
            )}
        </article>
    );
}

function CaseLawSearchForm({
    initialQuery,
    initialCourt,
    onSearch,
    busy,
}: {
    initialQuery: string;
    initialCourt: IctihatCourt;
    onSearch: (query: string, court: IctihatCourt) => void;
    busy: boolean;
}) {
    // The page remounts the form (key) when the URL changes.
    const [query, setQuery] = useState(initialQuery);
    const [court, setCourt] = useState<IctihatCourt>(initialCourt);

    function submit(event: FormEvent) {
        event.preventDefault();
        const trimmed = query.trim();
        if (trimmed && !busy) onSearch(trimmed, court);
    }

    return (
        <form role="search" onSubmit={submit} className="flex w-full flex-col gap-2">
            <div className="flex w-full items-center gap-2">
                <label className={cn("flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-3", LIQUID_GLASS_SUBTLE_CLASS)}>
                    <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                    <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        aria-label={t("Search Turkish case law")}
                        placeholder={t('Key terms, e.g. "ihtiyaç nedeniyle tahliye" konut')}
                        autoFocus={!initialQuery}
                        maxLength={300}
                        className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
                    />
                </label>
                <PillButtonUI type="submit" tone="black" size="sm" loading={busy} disabled={busy || !query.trim()}>
                    {t("Search")}
                </PillButtonUI>
            </div>
            <div role="radiogroup" aria-label={t("Court")} className="flex flex-wrap gap-1.5">
                {COURTS.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={court === option.value}
                        onClick={() => setCourt(option.value)}
                        className={cn(
                            "rounded-full px-3 py-1 text-xs font-medium",
                            court === option.value
                                ? "bg-gray-900 text-white"
                                : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                        )}
                    >
                        {t(option.label)}
                    </button>
                ))}
            </div>
        </form>
    );
}

type SearchKey = { query: string; court: IctihatCourt; page: number };

type SearchOutcome =
    | ({ status: "done" } & SearchKey & { response: IctihatSearchResponse })
    | ({ status: "error" } & SearchKey & { message: string });

function sameSearch(a: SearchKey, b: SearchKey) {
    return a.query === b.query && a.court === b.court && a.page === b.page;
}

export function CaseLawSearchPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const urlQuery = searchParams.get("q")?.trim() ?? "";
    const courtParam = searchParams.get("court");
    const urlCourt: IctihatCourt = isCourt(courtParam) ? courtParam : "adli";
    const urlPage = Math.max(Number.parseInt(searchParams.get("page") ?? "1", 10) || 1, 1);
    // Only finished searches are stored; "loading" is derived below.
    const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
    const requestId = useRef(0);

    const run = useCallback(async (key: SearchKey) => {
        const id = ++requestId.current;
        try {
            const response = await searchCaseLaw(key.query, key.court, key.page);
            if (id !== requestId.current) return;
            setOutcome({ status: "done", ...key, response });
        } catch (error) {
            if (id !== requestId.current) return;
            setOutcome({
                status: "error",
                ...key,
                message: userFacingApiError(error, t("The case-law search failed. Please try again.")),
            });
        }
    }, []);

    // The URL is the source of truth, so a reload or the back button land on
    // the same results.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches from the API; state is only set once the request resolves
        if (urlQuery) void run({ query: urlQuery, court: urlCourt, page: urlPage });
    }, [urlQuery, urlCourt, urlPage, run]);

    const current: SearchKey = { query: urlQuery, court: urlCourt, page: urlPage };
    const view = !urlQuery
        ? ({ status: "idle" } as const)
        : outcome && sameSearch(outcome, current)
          ? outcome
          : ({ status: "loading" } as const);

    function navigate(key: SearchKey) {
        if (sameSearch(key, current)) {
            setOutcome(null);
            void run(key);
            return;
        }
        const params = new URLSearchParams({ q: key.query });
        if (key.court !== "adli") params.set("court", key.court);
        if (key.page > 1) params.set("page", String(key.page));
        router.push(`/case-law?${params.toString()}`);
    }

    const hasNextPage =
        view.status === "done" && view.response.results.length > 0 && view.page * PAGE_SIZE < view.response.total;

    return (
        <div className="flex h-full min-h-0 flex-col">
            <PageHeader shrink>
                <h1 className="font-serif text-2xl font-medium text-gray-900">{t("Case law")}</h1>
            </PageHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 md:px-8">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
                    <CaseLawSearchForm
                        key={`${urlQuery}|${urlCourt}`}
                        initialQuery={urlQuery}
                        initialCourt={urlCourt}
                        onSearch={(query, court) => navigate({ query, court, page: 1 })}
                        busy={view.status === "loading"}
                    />
                    <p className="text-xs text-gray-500">
                        {t(
                            "Searches decisions published by the Ministry of Justice. Every word must appear in the decision; put fixed phrases in double quotes. Check finality and the official text before relying on a decision.",
                        )}
                    </p>

                    {view.status === "idle" && (
                        <EmptyState
                            className="mt-10"
                            icon={<CaseLawIcon />}
                            title={t("Search Turkish case law")}
                            description={t(
                                "Find Yargıtay decisions and decisions of the regional courts of appeal and first-instance courts with a few distinctive legal terms.",
                            )}
                        />
                    )}
                    {view.status === "loading" && (
                        <div role="status" className="flex items-center gap-2 py-6 text-sm text-gray-500">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            {t("Searching case law...")}
                        </div>
                    )}
                    {view.status === "error" && (
                        <EmptyState
                            className="mt-10"
                            tone="error"
                            title={t("Search failed")}
                            description={view.message}
                            action={
                                <PillButtonUI tone="white" size="sm" onClick={() => navigate(current)}>
                                    {t("Try again")}
                                </PillButtonUI>
                            }
                        />
                    )}
                    {view.status === "done" && view.response.results.length === 0 && (
                        <EmptyState
                            className="mt-10"
                            icon={<CaseLawIcon />}
                            title={t("No matching decisions")}
                            description={t("No decision contains all of these words. Try fewer or more general terms.")}
                        />
                    )}
                    {view.status === "done" && view.response.results.length > 0 && (
                        <section aria-label={t("Search results")} className="flex flex-col gap-3">
                            <p className="text-xs text-gray-500">
                                {t.plural(view.response.total, "{count} decision found", "{count} decisions found")}
                            </p>
                            {view.response.warnings?.map((warning) => (
                                <p key={warning} className="text-xs text-amber-700">
                                    {t("Some sources could not be searched: {reason}", { reason: warning })}
                                </p>
                            ))}
                            {view.response.results.map((hit) => (
                                <DecisionCard key={hit.id} hit={hit} />
                            ))}
                            <div className="flex items-center justify-between pt-2">
                                <PillButtonUI
                                    tone="white"
                                    size="sm"
                                    disabled={view.page <= 1}
                                    onClick={() => navigate({ ...current, page: view.page - 1 })}
                                >
                                    {t("Previous page")}
                                </PillButtonUI>
                                <span className="text-xs text-gray-500">{t("Page {page}", { page: view.page })}</span>
                                <PillButtonUI
                                    tone="white"
                                    size="sm"
                                    disabled={!hasNextPage}
                                    onClick={() => navigate({ ...current, page: view.page + 1 })}
                                >
                                    {t("Next page")}
                                </PillButtonUI>
                            </div>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}
