"use client";

// mikeTR: süre, faiz ve harç hesaplarının sonucu. Hesaplamalar sayfası ve
// sohbetteki hesap kartı aynı bileşenleri kullanır.

import type {
    FaizHesabiYaniti,
    HarcHesabiYaniti,
    HesapSonucuEvent,
    SureHesabiYaniti,
} from "@mike/contracts";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/app/lib/utils";
import { LIQUID_GLASS_FLAT_CLASS } from "@/app/components/ui/liquid-surface";
import { t } from "@/shared/i18n";

export function tl(n: number): string {
    return `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
}

function tarih(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
}

function Uyarilar({ uyarilar }: { uyarilar: string[] }) {
    if (!uyarilar.length) return null;
    return (
        <ul className="mt-3 flex flex-col gap-1.5 border-t border-gray-100 pt-3">
            {uyarilar.map((u) => (
                <li key={u} className="flex gap-2 text-xs text-gray-600">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
                    <span>{u}</span>
                </li>
            ))}
        </ul>
    );
}

export function SureSonucu({ sonuc }: { sonuc: SureHesabiYaniti }) {
    return (
        <div>
            <p className="text-xs text-gray-500">{t("Last day")}</p>
            <p className="font-serif text-2xl text-gray-950">{sonuc.sonGunAdi}</p>
            <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-sm text-gray-700">
                {sonuc.adimlar.map((adim) => (
                    <li key={adim}>{adim}</li>
                ))}
            </ol>
            <Uyarilar uyarilar={sonuc.uyarilar} />
        </div>
    );
}

export function FaizSonucu({ sonuc }: { sonuc: FaizHesabiYaniti }) {
    return (
        <div>
            <div className="flex flex-wrap gap-x-8 gap-y-2">
                <div>
                    <p className="text-xs text-gray-500">{t("Interest")}</p>
                    <p className="font-serif text-2xl text-gray-950">{tl(sonuc.toplamFaiz)}</p>
                </div>
                <div>
                    <p className="text-xs text-gray-500">{t("Principal and interest")}</p>
                    <p className="font-serif text-2xl text-gray-700">{tl(sonuc.toplam)}</p>
                </div>
            </div>
            <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-700">
                    <thead className="text-gray-500">
                        <tr>
                            <th className="py-1 pr-3 font-medium">{t("Period")}</th>
                            <th className="py-1 pr-3 font-medium">{t("Days")}</th>
                            <th className="py-1 pr-3 font-medium">{t("Rate")}</th>
                            <th className="py-1 pr-3 text-right font-medium">{t("Interest")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sonuc.donemler.map((d) => (
                            <tr key={d.baslangic} className="border-t border-gray-100 align-top">
                                <td className="py-1.5 pr-3 whitespace-nowrap">
                                    {tarih(d.baslangic)} – {tarih(d.bitis)}
                                </td>
                                <td className="py-1.5 pr-3">{d.gun}</td>
                                <td className="py-1.5 pr-3">
                                    %{String(d.oran).replace(".", ",")}
                                    <span className="block text-[11px] text-gray-500">{d.dayanak}</span>
                                </td>
                                <td className="py-1.5 pr-3 text-right whitespace-nowrap">{tl(d.faiz)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Uyarilar uyarilar={sonuc.uyarilar} />
        </div>
    );
}

export function HarcSonucu({ sonuc }: { sonuc: HarcHesabiYaniti }) {
    return (
        <div>
            <div className="flex flex-wrap gap-x-8 gap-y-2">
                <div>
                    <p className="text-xs text-gray-500">{t("Due at filing")}</p>
                    <p className="font-serif text-2xl text-gray-950">{tl(sonuc.acilistaOdenecek)}</p>
                </div>
                {sonuc.kalanKararHarci > 0 && (
                    <div>
                        <p className="text-xs text-gray-500">{t("Remaining judgment fee")}</p>
                        <p className="font-serif text-2xl text-gray-700">{tl(sonuc.kalanKararHarci)}</p>
                    </div>
                )}
            </div>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-gray-700">
                {sonuc.kalemler.map((k) => (
                    <li key={k.kalem}>
                        <div className="flex justify-between gap-3">
                            <span>{k.kalem}</span>
                            <span className="whitespace-nowrap">{tl(k.tutar)}</span>
                        </div>
                        <p className="text-[11px] text-gray-500">{k.dayanak}</p>
                    </li>
                ))}
            </ul>
            <Uyarilar uyarilar={sonuc.uyarilar} />
        </div>
    );
}

const BASLIK: Record<HesapSonucuEvent["arac"], string> = {
    sure: "Deadline calculation",
    faiz: "Interest calculation",
    harc: "Court fee calculation",
};

/** The card shown under an assistant answer that used a calculation tool. */
export function HesapSonucuKarti({ event, className }: { event: HesapSonucuEvent; className?: string }) {
    return (
        <section className={cn("rounded-2xl px-5 py-4", LIQUID_GLASS_FLAT_CLASS, className)}>
            <p className="mb-2 text-xs font-medium text-gray-500">{t(BASLIK[event.arac])}</p>
            {event.arac === "sure" ? (
                <SureSonucu sonuc={event.sonuc} />
            ) : event.arac === "faiz" ? (
                <FaizSonucu sonuc={event.sonuc} />
            ) : (
                <HarcSonucu sonuc={event.sonuc} />
            )}
        </section>
    );
}

/** One line for the step timeline. */
export function hesapOzeti(event: HesapSonucuEvent): string {
    if (event.arac === "sure") return event.sonuc.sonGunAdi;
    if (event.arac === "faiz") return `${tl(event.sonuc.toplamFaiz)}`;
    return tl(event.sonuc.acilistaOdenecek);
}
