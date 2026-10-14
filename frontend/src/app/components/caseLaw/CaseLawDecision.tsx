"use client";

// mikeTR: reads one court decision in full. UYAP Emsal decisions have no
// public page of their own, so their links land here.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ExternalLink, Loader2 } from "lucide-react";
import { PageHeader } from "@/app/components/shared/PageHeader";
import { EmptyState } from "@/app/components/ui/empty-state";
import { PillButtonUI } from "@/shared/ui/PillButtonUI";
import type { IctihatDecision } from "@/app/components/shared/types";
import { getCaseLawDecision } from "@/app/lib/mikeApi";
import { userFacingApiError } from "@/app/lib/userFacingError";
import { LIQUID_GLASS_FLAT_CLASS } from "@/app/components/ui/liquid-surface";
import { cn } from "@/app/lib/utils";
import { t } from "@/shared/i18n";

type Outcome =
    | { status: "done"; id: string; decision: IctihatDecision }
    | { status: "error"; id: string; message: string };

export function CaseLawDecisionPage() {
    const searchParams = useSearchParams();
    const id = searchParams.get("id")?.trim() ?? "";
    const atif = searchParams.get("atif")?.trim() ?? "";
    // Only finished loads are stored; "loading" is derived below.
    const [outcome, setOutcome] = useState<Outcome | null>(null);
    const requestId = useRef(0);

    const load = useCallback(async (decisionId: string) => {
        const current = ++requestId.current;
        try {
            const decision = await getCaseLawDecision(decisionId);
            if (current === requestId.current) setOutcome({ status: "done", id: decisionId, decision });
        } catch (error) {
            if (current !== requestId.current) return;
            setOutcome({
                status: "error",
                id: decisionId,
                message: userFacingApiError(error, t("The decision could not be loaded. Please try again.")),
            });
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches from the API; state is only set once the request resolves
        if (id) void load(id);
    }, [id, load]);

    const view = !id ? null : outcome && outcome.id === id ? outcome : ({ status: "loading" } as const);
    const fromYargitay = id.startsWith("yargitay:");

    return (
        <div className="flex h-full min-h-0 flex-col">
            <PageHeader shrink>
                <div className="flex min-w-0 items-center gap-2">
                    <Link href="/case-law" className="font-serif text-2xl font-medium text-gray-500 hover:text-gray-900">
                        {t("Case law")}
                    </Link>
                    <span className="text-gray-300" aria-hidden>
                        ›
                    </span>
                    <h1 className="truncate font-serif text-2xl font-medium text-gray-900">{t("Decision")}</h1>
                </div>
            </PageHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 md:px-8">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
                    {!view && (
                        <EmptyState className="mt-10" title={t("No decision selected")} description={t("Open a decision from the case-law search.")} />
                    )}
                    {view?.status === "loading" && (
                        <div role="status" className="flex items-center gap-2 py-6 text-sm text-gray-500">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            {t("Loading the decision...")}
                        </div>
                    )}
                    {view?.status === "error" && (
                        <EmptyState
                            className="mt-10"
                            tone="error"
                            title={t("The decision could not be loaded")}
                            description={view.message}
                            action={
                                <PillButtonUI
                                    tone="white"
                                    size="sm"
                                    onClick={() => {
                                        setOutcome(null);
                                        void load(id);
                                    }}
                                >
                                    {t("Try again")}
                                </PillButtonUI>
                            }
                        />
                    )}
                    {view?.status === "done" && (
                        <article className={cn("rounded-2xl px-5 py-4", LIQUID_GLASS_FLAT_CLASS)}>
                            {atif && <h2 className="font-serif text-lg text-gray-950">{atif}</h2>}
                            <p className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-gray-500">
                                {fromYargitay
                                    ? t("Source: Yargıtay decision search (mevzuat.adalet.gov.tr).")
                                    : t("Source: UYAP Emsal. It has no page per decision; search it there by the docket and decision numbers.")}
                                <a
                                    href={view.decision.kaynak}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 font-medium text-gray-600 hover:text-gray-950"
                                >
                                    {fromYargitay ? t("Official source") : t("Open UYAP Emsal")}
                                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                                </a>
                            </p>
                            <p className="mt-3 whitespace-pre-line border-t border-gray-100 pt-3 text-sm leading-6 text-gray-800">
                                {view.decision.metin}
                            </p>
                        </article>
                    )}
                </div>
            </div>
        </div>
    );
}
