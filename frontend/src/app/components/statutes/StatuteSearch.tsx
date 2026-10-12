"use client";

// mikeTR: direct semantic search over the Turkish statute index, without
// starting a chat. The assistant reaches the same index through its
// search_kanun_maddeleri tool.

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { PageHeader } from "@/app/components/shared/PageHeader";
import { EmptyState } from "@/app/components/ui/empty-state";
import { PillButtonUI } from "@/shared/ui/PillButtonUI";
import { kanunMaddeEtiketi } from "@/app/components/assistant/message/KanunBlocks";
import type { KanunArticle, StatuteStatus } from "@/app/components/shared/types";
import { getStatuteStatus, searchStatutes } from "@/app/lib/mikeApi";
import { userFacingApiError } from "@/app/lib/userFacingError";
import { LIQUID_GLASS_FLAT_CLASS } from "@/app/components/ui/liquid-surface";
import { LIQUID_GLASS_SUBTLE_CLASS } from "@/shared/ui/LiquidGlassUI";
import { cn } from "@/app/lib/utils";
import { t } from "@/shared/i18n";

const RESULT_LIMIT = 10;
const EXCERPT_LENGTH = 280;

function StatutesIcon() {
    return (
        <Image src="/icons/features/statutes.svg" alt="" width={32} height={32} unoptimized />
    );
}

function excerpt(text: string): string {
    const cleaned = text.replace(/\s+/g, " ").trim();
    return cleaned.length <= EXCERPT_LENGTH
        ? cleaned
        : `${cleaned.slice(0, EXCERPT_LENGTH).trimEnd()}…`;
}

/** "12 Ekim 2026" in a Turkish deployment, the browser's format otherwise. */
export function formatStatuteDate(value: string): string {
    return new Date(value).toLocaleDateString(t.locale === "tr" ? "tr-TR" : undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}

function ArticleCard({ article }: { article: KanunArticle }) {
    const [expanded, setExpanded] = useState(false);
    const long = article.icerik.replace(/\s+/g, " ").trim().length > EXCERPT_LENGTH;
    return (
        <article className={cn("rounded-2xl px-5 py-4", LIQUID_GLASS_FLAT_CLASS)}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs text-gray-500">
                        {article.kanun_adi} ({article.kanun_no})
                    </p>
                    <h3 className="mt-0.5 font-serif text-lg text-gray-950">
                        {kanunMaddeEtiketi(article)}
                        {article.baslik && (
                            <span className="text-gray-600"> – {article.baslik}</span>
                        )}
                    </h3>
                </div>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {article.exact
                        ? t("Cited article")
                        : t("{percent}% match", { percent: Math.round(article.similarity * 100) })}
                </span>
            </div>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-gray-700">
                {expanded ? article.icerik.trim() : excerpt(article.icerik)}
            </p>
            <p className="mt-2 text-[11px] text-gray-400">
                {article.guncellik_tarihi
                    ? t("Text checked against mevzuat.gov.tr on {date}", {
                          date: formatStatuteDate(article.guncellik_tarihi),
                      })
                    : t("Not yet checked against mevzuat.gov.tr")}
            </p>
            {long && (
                <button
                    type="button"
                    onClick={() => setExpanded((value) => !value)}
                    aria-expanded={expanded}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-950"
                >
                    {expanded ? t("Show less") : t("Show full text")}
                    <ChevronDown
                        className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
                        aria-hidden
                    />
                </button>
            )}
        </article>
    );
}

/** The search box, shared by the statutes page and the assistant start screen. */
export function StatuteSearchForm({
    initialQuery = "",
    onSearch,
    busy = false,
    autoFocus = false,
    size = "normal",
    placeholder,
}: {
    initialQuery?: string;
    onSearch: (query: string) => void;
    busy?: boolean;
    autoFocus?: boolean;
    size?: "sm" | "normal";
    placeholder?: string;
}) {
    // The page remounts the form (key) when the URL query changes.
    const [query, setQuery] = useState(initialQuery);

    function submit(event: FormEvent) {
        event.preventDefault();
        const trimmed = query.trim();
        if (trimmed && !busy) onSearch(trimmed);
    }

    return (
        <form role="search" onSubmit={submit} className="flex w-full items-center gap-2">
            <label
                className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3",
                    size === "sm" ? "h-9" : "h-11",
                    LIQUID_GLASS_SUBTLE_CLASS,
                )}
            >
                <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label={t("Search Turkish statutes")}
                    placeholder={
                        placeholder ?? t("Describe the legal issue, e.g. the tenant does not pay the rent")
                    }
                    autoFocus={autoFocus}
                    maxLength={500}
                    className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
                />
            </label>
            <PillButtonUI
                type="submit"
                tone="black"
                size="sm"
                loading={busy}
                disabled={busy || !query.trim()}
            >
                {t("Search")}
            </PillButtonUI>
        </form>
    );
}

type SearchState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "done"; query: string; results: KanunArticle[] }
    | { status: "error"; query: string; message: string };

type SearchOutcome = Extract<SearchState, { status: "done" | "error" }>;

export function StatuteSearchPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const urlQuery = searchParams.get("q")?.trim() ?? "";
    // Only finished searches are stored; "loading" is derived below, so the
    // effect never has to set state before its request resolves.
    const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
    const requestId = useRef(0);
    // Only used to offer the review page to statute admins; the search works
    // without it.
    const [status, setStatus] = useState<StatuteStatus | null>(null);
    useEffect(() => {
        getStatuteStatus()
            .then(setStatus)
            .catch(() => setStatus(null));
    }, []);

    const run = useCallback(async (query: string) => {
        const id = ++requestId.current;
        try {
            const response = await searchStatutes(query, RESULT_LIMIT);
            if (id !== requestId.current) return;
            setOutcome({ status: "done", query, results: response.results });
        } catch (error) {
            if (id !== requestId.current) return;
            setOutcome({
                status: "error",
                query,
                message: userFacingApiError(error, t("The statute search failed. Please try again.")),
            });
        }
    }, []);

    // The URL is the source of truth, so a search from the start screen, a
    // reload or the back button all land on the same results.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches from the API; state is only set once the request resolves
        if (urlQuery) void run(urlQuery);
    }, [urlQuery, run]);

    const view: SearchState = !urlQuery
        ? { status: "idle" }
        : outcome && outcome.query === urlQuery
          ? outcome
          : { status: "loading" };

    function rerun(query: string) {
        setOutcome(null);
        void run(query);
    }

    function search(query: string) {
        if (query === urlQuery) rerun(query);
        else router.push(`/statutes?q=${encodeURIComponent(query)}`);
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            <PageHeader shrink>
                <div className="flex w-full items-center justify-between gap-3">
                    <h1 className="font-serif text-2xl font-medium text-gray-900">{t("Statutes")}</h1>
                    {status?.yetkili && (
                        <Link
                            href="/statutes/updates"
                            className="rounded-full px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                        >
                            {status.bekleyen > 0
                                ? t("Updates ({count})", { count: status.bekleyen })
                                : t("Updates")}
                        </Link>
                    )}
                </div>
            </PageHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 md:px-8">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
                    <StatuteSearchForm
                        key={urlQuery}
                        initialQuery={urlQuery}
                        onSearch={search}
                        busy={view.status === "loading"}
                        autoFocus={!urlQuery}
                    />
                    <p className="text-xs text-gray-500">
                        {t(
                            "Semantic search over the full text of Turkish laws. Results are a starting point; check the current official text before relying on them.",
                        )}
                    </p>

                    {view.status === "idle" && (
                        <EmptyState
                            className="mt-10"
                            icon={<StatutesIcon />}
                            title={t("Search Turkish statutes")}
                            description={t(
                                "Describe a legal issue in plain words to find the most relevant articles of the Turkish Civil Code, Code of Obligations, Commercial Code, Civil Procedure Code and other laws.",
                            )}
                        />
                    )}
                    {view.status === "loading" && (
                        <div role="status" className="flex items-center gap-2 py-6 text-sm text-gray-500">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            {t("Searching statutes...")}
                        </div>
                    )}
                    {view.status === "error" && (
                        <EmptyState
                            className="mt-10"
                            tone="error"
                            title={t("Search failed")}
                            description={view.message}
                            action={
                                <PillButtonUI tone="white" size="sm" onClick={() => rerun(view.query)}>
                                    {t("Try again")}
                                </PillButtonUI>
                            }
                        />
                    )}
                    {view.status === "done" && view.results.length === 0 && (
                        <EmptyState
                            className="mt-10"
                            icon={<StatutesIcon />}
                            title={t("No matching articles")}
                            description={t(
                                "The laws in the database do not seem to cover this. Try describing the issue with different legal terms.",
                            )}
                        />
                    )}
                    {view.status === "done" && view.results.length > 0 && (
                        <section aria-label={t("Search results")} className="flex flex-col gap-3">
                            <p className="text-xs text-gray-500">
                                {t.plural(
                                    view.results.length,
                                    "{count} relevant article",
                                    "{count} relevant articles",
                                )}
                            </p>
                            {view.results.map((article) => (
                                <ArticleCard key={article.id} article={article} />
                            ))}
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}
