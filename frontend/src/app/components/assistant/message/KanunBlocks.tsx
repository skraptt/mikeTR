"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, XCircle } from "lucide-react";
import type {
    CaseLawCitation,
    IctihatHit,
    KanunSearchHit,
    StatuteCitation,
} from "@/app/components/shared/types";
import type { CourtListenerBlockItem } from "./EventBlocks";
import { t } from "@/shared/i18n";
import { decisionHref } from "@/app/components/caseLaw/caseLawLinks";

// mikeTR: Türk mevzuatı araması ve atıf kontrolü için sohbet blokları.

// Kanun numarası -> atıfta kullanılan kısa ad; backend/src/lib/kanunList.ts ile aynı.
// Listede olmayanlar "<no> s. K." olarak yazılır.
const KANUN_KISALTMA: Record<string, string> = {
    "4721": "TMK",
    "6098": "TBK",
    "6102": "TTK",
    "5941": "Çek K.",
    "6502": "TKHK",
    "634": "KMK",
    "2644": "Tapu K.",
    "5846": "FSEK",
    "6769": "SMK",
    "6362": "SPK",
    "4054": "RKHK",
    "6698": "KVKK",
    "6100": "HMK",
    "2004": "İİK",
    "6325": "HUAK",
    "7201": "Tebligat K.",
    "1136": "Av. K.",
    "1512": "Noterlik K.",
    "4857": "İş K.",
    "7036": "İş Mah. K.",
    "5237": "TCK",
    "5271": "CMK",
    "5326": "Kabahatler K.",
    "2918": "KTK",
    "2709": "AY",
    "2577": "İYUK",
    "657": "DMK",
    "2942": "Kamulaştırma K.",
    "3194": "İmar K.",
    "4734": "KİK",
    "213": "VUK",
    "193": "GVK",
    "3065": "KDVK",
};

/** "TBK md. 315", "TMK Geçici md. 1", "6101 s. K. md. 1" */
export function kanunMaddeEtiketi(hit: Pick<KanunSearchHit, "kanun_no" | "madde_no">): string {
    const kanun = KANUN_KISALTMA[hit.kanun_no] ?? `${hit.kanun_no} s. K.`;
    const madde = /^(Geçici|Ek) /.test(hit.madde_no)
        ? hit.madde_no.replace(/^(Geçici|Ek) /, "$1 md. ")
        : `md. ${hit.madde_no}`;
    return `${kanun} ${madde}`;
}

/** Arama sonuçlarını mevcut CourtListenerBlock listesinin biçimine çevirir. */
export function kanunSearchItems(results: KanunSearchHit[]): CourtListenerBlockItem[] {
    return results.map((hit) => ({
        caseName: `${kanunMaddeEtiketi(hit)}${hit.baslik ? ` – ${hit.baslik}` : ""}`,
        citation: t("{percent}% match", { percent: Math.round(hit.similarity * 100) }),
    }));
}

/** İçtihat arama sonuçları: künye, kesinleşme durumu ve resmî sayfa bağlantısı. */
export function ictihatSearchItems(results: IctihatHit[]): CourtListenerBlockItem[] {
    return results.map((hit) => ({
        caseName: hit.atif,
        citation: hit.durum,
        url: decisionHref(hit),
    }));
}

const CITATION_STATUS: Record<
    StatuteCitation["status"],
    { Icon: typeof CheckCircle2; className: string; note?: string }
> = {
    dogrulandi: { Icon: CheckCircle2, className: "text-green-600" },
    okunmadi: {
        Icon: AlertTriangle,
        className: "text-amber-600",
        note: "The article exists, but the assistant cited it without reading its text; the content may be misstated.",
    },
    bulunamadi: {
        Icon: XCircle,
        className: "text-red-600",
        note: "No article with this number exists in this law.",
    },
    kapsam_disi: {
        Icon: AlertTriangle,
        className: "text-amber-600",
        note: "This law is not in the statute database; the citation could not be verified.",
    },
};

/** Cevabın altında: metindeki her kanun atfının doğrulama sonucu. */
export function KanunCitationCheck({ citations }: { citations: StatuteCitation[] }) {
    const verified = citations.filter((c) => c.status === "dogrulandi").length;
    const problems = citations.length - verified;
    const [isOpen, setIsOpen] = useState(problems > 0);
    return (
        <div className="mt-3 font-sans text-sm text-gray-600">
            <button
                type="button"
                onClick={() => setIsOpen((v) => !v)}
                aria-expanded={isOpen}
                className="flex items-center gap-1.5 text-left hover:text-gray-800"
            >
                {problems > 0 ? (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
                ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" aria-hidden />
                )}
                <span className="font-medium">{t("Citation check:")}</span>
                <span>
                    {t("{verified}/{total} statute citations verified", {
                        verified,
                        total: citations.length,
                    })}
                    {problems > 0 &&
                        t.plural(problems, ", {count} needs attention", ", {count} need attention")}
                </span>
                <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    aria-hidden
                />
            </button>
            {isOpen && (
                <ul className="mt-1.5 flex flex-col gap-1 pl-5">
                    {citations.map((c) => {
                        const { Icon, className, note } = CITATION_STATUS[c.status];
                        return (
                            <li key={`${c.kanun_no ?? c.label}-${c.madde_no}`} className="flex gap-1.5">
                                <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${className}`} aria-hidden />
                                <span className="min-w-0 break-words">
                                    <span className="text-gray-800">{c.label}</span>
                                    {note && <span className="text-gray-500"> — {t(note)}</span>}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

const CASE_CITATION_STATUS: Record<
    CaseLawCitation["status"],
    { Icon: typeof CheckCircle2; className: string; note?: string }
> = {
    dogrulandi: { Icon: CheckCircle2, className: "text-green-600" },
    okunmadi: {
        Icon: AlertTriangle,
        className: "text-amber-600",
        note: "The decision came up in a search, but the assistant cited it without reading it; what it held may be misstated.",
    },
    kaynaksiz: {
        Icon: XCircle,
        className: "text-red-600",
        note: "No search in this chat returned this decision; check the citation before relying on it.",
    },
};

/** Cevabın altında: metindeki her karar künyesinin doğrulama sonucu. */
export function IctihatCitationCheck({ citations }: { citations: CaseLawCitation[] }) {
    const verified = citations.filter((c) => c.status === "dogrulandi").length;
    const problems = citations.length - verified;
    const [isOpen, setIsOpen] = useState(problems > 0);
    return (
        <div className="mt-2 font-sans text-sm text-gray-600">
            <button
                type="button"
                onClick={() => setIsOpen((v) => !v)}
                aria-expanded={isOpen}
                className="flex items-center gap-1.5 text-left hover:text-gray-800"
            >
                {problems > 0 ? (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
                ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" aria-hidden />
                )}
                <span className="font-medium">{t("Decision check:")}</span>
                <span>
                    {t("{verified}/{total} decision citations verified", {
                        verified,
                        total: citations.length,
                    })}
                    {problems > 0 &&
                        t.plural(problems, ", {count} needs attention", ", {count} need attention")}
                </span>
                <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    aria-hidden
                />
            </button>
            {isOpen && (
                <ul className="mt-1.5 flex flex-col gap-1 pl-5">
                    {citations.map((c) => {
                        const { Icon, className, note } = CASE_CITATION_STATUS[c.status];
                        return (
                            <li key={`${c.basvuru_no ?? `${c.esas_no}-${c.karar_no}`}`} className="flex gap-1.5">
                                <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${className}`} aria-hidden />
                                <span className="min-w-0 break-words">
                                    <span className="text-gray-800">{c.label}</span>
                                    {note && <span className="text-gray-500"> — {t(note)}</span>}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
