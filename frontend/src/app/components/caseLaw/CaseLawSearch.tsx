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
import type {
    IctihatCourt,
    IctihatFilters,
    IctihatFinality,
    IctihatHit,
    IctihatSearchResponse,
    IctihatSort,
} from "@/app/components/shared/types";
import { getCaseLawDecision, searchCaseLaw } from "@/app/lib/mikeApi";
import { userFacingApiError } from "@/app/lib/userFacingError";
import { LIQUID_GLASS_FLAT_CLASS } from "@/app/components/ui/liquid-surface";
import { LIQUID_GLASS_SUBTLE_CLASS } from "@/shared/ui/LiquidGlassUI";
import { cn } from "@/app/lib/utils";
import { decisionReaderHref } from "./caseLawLinks";
import { t } from "@/shared/i18n";

const PAGE_SIZE = 10;

const COURTS: { value: IctihatCourt; label: string }[] = [
    { value: "adli", label: "All civil courts" },
    { value: "yargitay", label: "Yargıtay" },
    { value: "kyb", label: "Reversals in the interest of the law" },
    { value: "emsal", label: "Regional and first-instance courts" },
    { value: "danistay", label: "Danıştay" },
    { value: "anayasa", label: "Constitutional Court: individual applications" },
    { value: "norm", label: "Constitutional Court: review of laws" },
];

const SOURCE_LABELS: Record<IctihatHit["kaynak_turu"], string> = {
    yargitay: "Yargıtay",
    kyb: "Yargıtay: reversal in the interest of the law",
    emsal: "UYAP Emsal",
    danistay: "Danıştay",
    anayasa: "Constitutional Court: individual application",
    norm: "Constitutional Court: review of a law",
};

function isCourt(value: string | null): value is IctihatCourt {
    return COURTS.some((court) => court.value === value);
}

type ChamberGroup = { group: string; names: string[] };

// Chambers and boards, under the names the decision service uses.
const YARGITAY_CHAMBERS: ChamberGroup[] = [
    {
        group: "Boards",
        names: [
            "Hukuk Genel Kurulu",
            "Ceza Genel Kurulu",
            "Büyük Genel Kurulu",
            "Hukuk Daireleri Başkanlar Kurulu",
            "Ceza Daireleri Başkanlar Kurulu",
        ],
    },
    { group: "Civil chambers", names: Array.from({ length: 23 }, (_, i) => `${i + 1}. Hukuk Dairesi`) },
    { group: "Criminal chambers", names: Array.from({ length: 23 }, (_, i) => `${i + 1}. Ceza Dairesi`) },
];

const DANISTAY_CHAMBERS: ChamberGroup[] = [
    { group: "Boards", names: ["İdare Dava Daireleri Kurulu", "Vergi Dava Daireleri Kurulu"] },
    { group: "Chambers", names: Array.from({ length: 17 }, (_, i) => `${i + 1}. Daire`) },
];

const CHAMBERS_BY_COURT: Partial<Record<IctihatCourt, ChamberGroup[]>> = {
    yargitay: YARGITAY_CHAMBERS,
    danistay: DANISTAY_CHAMBERS,
};

/** The court a chamber belongs to, if it is a known one. */
function chamberCourt(name: string): IctihatCourt | undefined {
    return (Object.keys(CHAMBERS_BY_COURT) as IctihatCourt[]).find((court) =>
        CHAMBERS_BY_COURT[court]!.some((group) => group.names.includes(name)),
    );
}

// Only UYAP Emsal reports finality; adli searches it alongside Yargıtay.
function reportsFinality(court: IctihatCourt): boolean {
    return court === "adli" || court === "emsal";
}

const SORTS: { value: IctihatSort; label: string }[] = [
    { value: "ilgili", label: "Most relevant" },
    { value: "yeni", label: "Newest first" },
    { value: "eski", label: "Oldest first" },
];

const FINALITIES: { value: IctihatFinality; label: string }[] = [
    { value: "kesinlesti", label: "Final" },
    { value: "kesinlesmedi", label: "Not final" },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function filtersFrom(params: URLSearchParams): IctihatFilters {
    const filters: IctihatFilters = {};
    const daire = params.get("daire");
    if (daire && chamberCourt(daire)) filters.daire = daire;
    const from = params.get("from");
    if (from && ISO_DATE.test(from)) filters.baslangic = from;
    const to = params.get("to");
    if (to && ISO_DATE.test(to)) filters.bitis = to;
    const sort = params.get("sort");
    if (sort === "yeni" || sort === "eski") filters.siralama = sort;
    const final = params.get("final");
    // Finality and a chamber exclude each other; the chamber wins.
    if (!filters.daire && (final === "kesinlesti" || final === "kesinlesmedi")) filters.kesinlesme = final;
    return filters;
}

function filtersKey(filters: IctihatFilters): string {
    return [filters.daire, filters.baslangic, filters.bitis, filters.siralama, filters.kesinlesme].join("|");
}

const FIELD_CLASS =
    "h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-800 outline-none focus:border-gray-400";

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
                    <p className="text-xs text-gray-500">{t(SOURCE_LABELS[hit.kaynak_turu])}</p>
                    <h3 className="mt-0.5 font-serif text-lg text-gray-950">
                        {hit.mahkeme}
                        {hit.baslik && <span className="text-gray-600"> – {hit.baslik}</span>}
                    </h3>
                    <p className="mt-0.5 text-sm text-gray-700">
                        {hit.kaynak_turu === "anayasa"
                            ? t("Application {no} · {date}", { no: hit.esas_no, date: hit.karar_tarihi })
                            : t("Docket {esas} · Decision {karar} · {date}", {
                                  esas: hit.esas_no,
                                  karar: hit.karar_no,
                                  date: hit.karar_tarihi,
                              })}
                        {hit.resmi_gazete && <span className="text-gray-500"> · {hit.resmi_gazete}</span>}
                    </p>
                </div>
                {(hit.durum ?? hit.sonuc) && (
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {hit.durum ?? hit.sonuc}
                    </span>
                )}
            </div>
            {hit.konu && <p className="mt-2 text-sm leading-6 text-gray-700">{hit.konu}</p>}
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
                {hit.kaynak_turu !== "emsal" ? (
                    <a
                        href={hit.kaynak}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-950"
                    >
                        {t("Official source")}
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                ) : (
                    // UYAP Emsal has no page per decision; open mikeTR's reader.
                    <a
                        href={decisionReaderHref(hit)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-950"
                    >
                        {t("Open in a new tab")}
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                )}
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
    initialFilters,
    onSearch,
    busy,
}: {
    initialQuery: string;
    initialCourt: IctihatCourt;
    initialFilters: IctihatFilters;
    onSearch: (query: string, court: IctihatCourt, filters: IctihatFilters) => void;
    busy: boolean;
}) {
    // The page remounts the form (key) when the URL changes.
    const [query, setQuery] = useState(initialQuery);
    const [court, setCourt] = useState<IctihatCourt>(
        (initialFilters.daire && chamberCourt(initialFilters.daire)) ||
            (initialFilters.kesinlesme ? "emsal" : initialCourt),
    );
    const [filters, setFilters] = useState<IctihatFilters>(initialFilters);

    function apply(requestedCourt: IctihatCourt, nextFilters: IctihatFilters) {
        // Only UYAP Emsal reports finality, so choosing one moves the search
        // there; a chamber belongs to its court, and other courts drop it.
        const nextCourt = nextFilters.kesinlesme ? "emsal" : requestedCourt;
        const cleaned = {
            ...nextFilters,
            daire:
                nextFilters.daire && chamberCourt(nextFilters.daire) === nextCourt ? nextFilters.daire : undefined,
            kesinlesme: reportsFinality(nextCourt) ? nextFilters.kesinlesme : undefined,
        };
        setCourt(nextCourt);
        setFilters(cleaned);
        // Once there is a query, a filter change searches again right away.
        const trimmed = query.trim();
        if (trimmed && initialQuery && !busy) onSearch(trimmed, nextCourt, cleaned);
    }

    function setFilter<K extends keyof IctihatFilters>(key: K, value: IctihatFilters[K] | "") {
        apply(court, { ...filters, [key]: value || undefined });
    }

    function submit(event: FormEvent) {
        event.preventDefault();
        const trimmed = query.trim();
        if (trimmed && !busy) onSearch(trimmed, court, filters);
    }

    const hasFilters = !!(
        filters.daire ||
        filters.baslangic ||
        filters.bitis ||
        filters.siralama ||
        filters.kesinlesme
    );

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
                        onClick={() =>
                            // Leaving UYAP Emsal drops the finality filter with it.
                            apply(
                                option.value,
                                option.value === "emsal" ? filters : { ...filters, kesinlesme: undefined },
                            )
                        }
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
            <div className="flex flex-wrap items-end gap-2">
                {CHAMBERS_BY_COURT[court] && (
                    <label className="flex flex-col gap-1 text-[11px] text-gray-500">
                        {t("Chamber")}
                        <select
                            value={filters.daire ?? ""}
                            onChange={(event) => setFilter("daire", event.target.value)}
                            className={FIELD_CLASS}
                        >
                            <option value="">{t("All chambers")}</option>
                            {CHAMBERS_BY_COURT[court]!.map((group) => (
                                <optgroup key={group.group} label={t(group.group)}>
                                    {group.names.map((name) => (
                                        <option key={name} value={name}>
                                            {name}
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </label>
                )}
                <label className="flex flex-col gap-1 text-[11px] text-gray-500">
                    {t("Decided from")}
                    <input
                        type="date"
                        value={filters.baslangic ?? ""}
                        max={filters.bitis}
                        onChange={(event) => setFilter("baslangic", event.target.value)}
                        className={FIELD_CLASS}
                    />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-gray-500">
                    {t("Decided until")}
                    <input
                        type="date"
                        value={filters.bitis ?? ""}
                        min={filters.baslangic}
                        onChange={(event) => setFilter("bitis", event.target.value)}
                        className={FIELD_CLASS}
                    />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-gray-500">
                    {t("Sort")}
                    <select
                        value={filters.siralama ?? "ilgili"}
                        onChange={(event) =>
                            setFilter("siralama", event.target.value === "ilgili" ? "" : (event.target.value as IctihatSort))
                        }
                        className={FIELD_CLASS}
                    >
                        {SORTS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {t(option.label)}
                            </option>
                        ))}
                    </select>
                </label>
                {reportsFinality(court) && (
                    <label className="flex flex-col gap-1 text-[11px] text-gray-500">
                        {t("Finality")}
                        <select
                            value={filters.kesinlesme ?? ""}
                            onChange={(event) =>
                                setFilter("kesinlesme", event.target.value as IctihatFinality | "")
                            }
                            className={FIELD_CLASS}
                        >
                            <option value="">{t("Any")}</option>
                            {FINALITIES.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {t(option.label)}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                {hasFilters && (
                    <button
                        type="button"
                        onClick={() => apply(court, {})}
                        className="h-8 rounded-lg px-2 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-950"
                    >
                        {t("Clear filters")}
                    </button>
                )}
            </div>
            {filters.kesinlesme && (
                <p className="text-[11px] text-gray-500">
                    {t(
                        "Only the regional courts of appeal and first-instance courts report finality, so this filter searches their decisions only.",
                    )}
                </p>
            )}
        </form>
    );
}

type SearchKey = { query: string; court: IctihatCourt; page: number; filters: IctihatFilters };

type SearchOutcome =
    | ({ status: "done" } & SearchKey & { response: IctihatSearchResponse })
    | ({ status: "error" } & SearchKey & { message: string });

function sameSearch(a: SearchKey, b: SearchKey) {
    return (
        a.query === b.query &&
        a.court === b.court &&
        a.page === b.page &&
        filtersKey(a.filters) === filtersKey(b.filters)
    );
}

export function CaseLawSearchPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const urlQuery = searchParams.get("q")?.trim() ?? "";
    const courtParam = searchParams.get("court");
    const urlCourt: IctihatCourt = isCourt(courtParam) ? courtParam : "adli";
    const urlPage = Math.max(Number.parseInt(searchParams.get("page") ?? "1", 10) || 1, 1);
    const urlFilters = filtersFrom(searchParams);
    const urlFiltersKey = filtersKey(urlFilters);
    // Only finished searches are stored; "loading" is derived below.
    const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
    const requestId = useRef(0);

    const run = useCallback(async (key: SearchKey) => {
        const id = ++requestId.current;
        try {
            const response = await searchCaseLaw(key.query, key.court, key.page, key.filters);
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
        if (urlQuery) void run({ query: urlQuery, court: urlCourt, page: urlPage, filters: filtersFrom(searchParams) });
        // urlFiltersKey stands for the filters read from searchParams.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [urlQuery, urlCourt, urlPage, urlFiltersKey, run]);

    const current: SearchKey = { query: urlQuery, court: urlCourt, page: urlPage, filters: urlFilters };
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
        if (key.filters.daire) params.set("daire", key.filters.daire);
        if (key.filters.baslangic) params.set("from", key.filters.baslangic);
        if (key.filters.bitis) params.set("to", key.filters.bitis);
        if (key.filters.siralama) params.set("sort", key.filters.siralama);
        if (key.filters.kesinlesme) params.set("final", key.filters.kesinlesme);
        if (key.page > 1) params.set("page", String(key.page));
        router.push(`/case-law?${params.toString()}`);
    }

    const hasNextPage =
        view.status === "done" &&
        view.response.results.length > 0 &&
        (view.page * PAGE_SIZE < view.response.total || !!view.response.approximate);

    return (
        <div className="flex h-full min-h-0 flex-col">
            <PageHeader shrink>
                <h1 className="font-serif text-2xl font-medium text-gray-900">{t("Case law")}</h1>
            </PageHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 md:px-8">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
                    <CaseLawSearchForm
                        key={`${urlQuery}|${urlCourt}|${urlFiltersKey}`}
                        initialQuery={urlQuery}
                        initialCourt={urlCourt}
                        initialFilters={urlFilters}
                        onSearch={(query, court, filters) => navigate({ query, court, page: 1, filters })}
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
                                {view.response.approximate
                                    ? t("At least {count} decisions found", { count: view.response.total })
                                    : t.plural(view.response.total, "{count} decision found", "{count} decisions found")}
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
