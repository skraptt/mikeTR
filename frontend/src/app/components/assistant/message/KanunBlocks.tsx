"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, XCircle } from "lucide-react";
import type {
    KanunSearchHit,
    StatuteCitation,
} from "@/app/components/shared/types";
import type { CourtListenerBlockItem } from "./EventBlocks";

// mikeTR: Türk mevzuatı araması ve atıf kontrolü için sohbet blokları.

const KANUN_KISALTMA: Record<string, string> = {
    "4721": "TMK",
    "5846": "FSEK",
    "5941": "Çek K.",
    "6098": "TBK",
    "6100": "HMK",
    "6102": "TTK",
    "6362": "SPK",
    "6502": "TKHK",
    "6698": "KVKK",
    "6769": "SMK",
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
        citation: `%${Math.round(hit.similarity * 100)} uyum`,
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
        note: "Madde veritabanında var ama asistan metnini okumadan atıf yaptı; içerik doğru aktarılmamış olabilir.",
    },
    bulunamadi: {
        Icon: XCircle,
        className: "text-red-600",
        note: "Bu kanunda böyle bir madde numarası bulunamadı.",
    },
    kapsam_disi: {
        Icon: AlertTriangle,
        className: "text-amber-600",
        note: "Bu kanun veritabanında yok; atıf doğrulanamadı.",
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
                <span className="font-medium">Atıf kontrolü:</span>
                <span>
                    {verified}/{citations.length} kanun atfı doğrulandı
                    {problems > 0 && `, ${problems} atıf dikkat gerektiriyor`}
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
                                    {note && <span className="text-gray-500"> — {note}</span>}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
