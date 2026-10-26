"use client";

// mikeTR: Hesaplamalar sayfası. Süre, faiz ve harç hesapları sohbet açmadan,
// asistanın kullandığı araçlarla aynı kurallarla yapılır.

import { useState, type FormEvent, type ReactNode } from "react";
import type { FaizHesabiYaniti, HarcHesabiYaniti, SureHesabiYaniti } from "@mike/contracts";
import { PageHeader } from "@/app/components/shared/PageHeader";
import { PillButtonUI } from "@/shared/ui/PillButtonUI";
import { LIQUID_GLASS_FLAT_CLASS } from "@/app/components/ui/liquid-surface";
import { calculateCourtFees, calculateDeadline, calculateInterest } from "@/app/lib/mikeApi";
import { userFacingApiError } from "@/app/lib/userFacingError";
import { cn } from "@/app/lib/utils";
import { t } from "@/shared/i18n";
import { FaizSonucu, HarcSonucu, SureSonucu } from "./HesapSonucu";

type Sekme = "sure" | "faiz" | "harc";

const SEKMELER: { value: Sekme; label: string }[] = [
    { value: "sure", label: "Deadline" },
    { value: "faiz", label: "Interest" },
    { value: "harc", label: "Court fees" },
];

const FIELD_CLASS =
    "h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-800 outline-none focus:border-gray-400";

function bugun(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Alan({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
    return (
        <label className={cn("flex flex-col gap-1 text-xs text-gray-500", className)}>
            {label}
            {children}
        </label>
    );
}

/** Runs a calculation request and keeps its result or error. */
function useHesap<T>() {
    const [sonuc, setSonuc] = useState<T | null>(null);
    const [hata, setHata] = useState<string | null>(null);
    const [mesgul, setMesgul] = useState(false);
    async function calistir(fn: () => Promise<T>) {
        setMesgul(true);
        setHata(null);
        try {
            setSonuc(await fn());
        } catch (error) {
            setSonuc(null);
            setHata(userFacingApiError(error, t("The calculation could not be made. Check the values and try again.")));
        } finally {
            setMesgul(false);
        }
    }
    return { sonuc, hata, mesgul, calistir };
}

function Sonuc({ hata, children }: { hata: string | null; children: ReactNode }) {
    if (hata) {
        return (
            <p role="alert" className="text-sm text-red-600">
                {hata}
            </p>
        );
    }
    if (!children) return null;
    return <section className={cn("rounded-2xl px-5 py-4", LIQUID_GLASS_FLAT_CLASS)}>{children}</section>;
}

function SureFormu() {
    const [baslangic, setBaslangic] = useState(bugun());
    const [sure, setSure] = useState("2");
    const [birim, setBirim] = useState("hafta");
    const [rejim, setRejim] = useState("hmk");
    const [tabi, setTabi] = useState(true);
    const { sonuc, hata, mesgul, calistir } = useHesap<SureHesabiYaniti>();
    const adliTatilVar = rejim === "hmk" || rejim === "cmk";

    function gonder(event: FormEvent) {
        event.preventDefault();
        void calistir(() =>
            calculateDeadline({ baslangic, sure: Number(sure), birim, rejim, adliTatileTabi: adliTatilVar ? tabi : undefined }),
        );
    }

    return (
        <>
            <form onSubmit={gonder} className="flex flex-wrap items-end gap-3">
                <Alan label={t("Start date (notification)")}>
                    <input type="date" required value={baslangic} onChange={(e) => setBaslangic(e.target.value)} className={FIELD_CLASS} />
                </Alan>
                <Alan label={t("Period")}>
                    <div className="flex gap-1.5">
                        <input
                            type="number"
                            min={1}
                            max={3650}
                            required
                            value={sure}
                            onChange={(e) => setSure(e.target.value)}
                            className={cn(FIELD_CLASS, "w-20")}
                        />
                        <select value={birim} onChange={(e) => setBirim(e.target.value)} className={FIELD_CLASS}>
                            <option value="gun">{t("days")}</option>
                            <option value="hafta">{t("weeks")}</option>
                            <option value="ay">{t("months")}</option>
                            <option value="yil">{t("years")}</option>
                        </select>
                    </div>
                </Alan>
                <Alan label={t("Law")}>
                    <select value={rejim} onChange={(e) => setRejim(e.target.value)} className={FIELD_CLASS}>
                        <option value="hmk">{t("HMK (civil procedure)")}</option>
                        <option value="iik">{t("İİK (enforcement)")}</option>
                        <option value="cmk">{t("CMK (criminal procedure)")}</option>
                        <option value="tbk">{t("TBK (contractual period)")}</option>
                    </select>
                </Alan>
                {adliTatilVar && (
                    <label className="flex h-9 items-center gap-2 text-xs text-gray-700">
                        <input type="checkbox" checked={tabi} onChange={(e) => setTabi(e.target.checked)} />
                        {t("Subject to the judicial recess")}
                    </label>
                )}
                <PillButtonUI type="submit" tone="black" size="sm" loading={mesgul} disabled={mesgul}>
                    {t("Calculate")}
                </PillButtonUI>
            </form>
            <Sonuc hata={hata}>{sonuc && <SureSonucu sonuc={sonuc} />}</Sonuc>
        </>
    );
}

function FaizFormu() {
    const [anapara, setAnapara] = useState("");
    const [baslangic, setBaslangic] = useState("");
    const [bitis, setBitis] = useState(bugun());
    const [tur, setTur] = useState("kanuni");
    const { sonuc, hata, mesgul, calistir } = useHesap<FaizHesabiYaniti>();

    function gonder(event: FormEvent) {
        event.preventDefault();
        void calistir(() =>
            calculateInterest({ anapara: Number(anapara.replace(/\./g, "").replace(",", ".")), baslangic, bitis, tur }),
        );
    }

    return (
        <>
            <form onSubmit={gonder} className="flex flex-wrap items-end gap-3">
                <Alan label={t("Principal (TL)")}>
                    <input
                        inputMode="decimal"
                        required
                        placeholder="100.000"
                        value={anapara}
                        onChange={(e) => setAnapara(e.target.value)}
                        className={cn(FIELD_CLASS, "w-36")}
                    />
                </Alan>
                <Alan label={t("From")}>
                    <input type="date" required value={baslangic} max={bitis} onChange={(e) => setBaslangic(e.target.value)} className={FIELD_CLASS} />
                </Alan>
                <Alan label={t("Until")}>
                    <input type="date" required value={bitis} min={baslangic} onChange={(e) => setBitis(e.target.value)} className={FIELD_CLASS} />
                </Alan>
                <Alan label={t("Interest type")}>
                    <select value={tur} onChange={(e) => setTur(e.target.value)} className={FIELD_CLASS}>
                        <option value="kanuni">{t("Statutory interest")}</option>
                        <option value="ticari">{t("Commercial default interest")}</option>
                    </select>
                </Alan>
                <PillButtonUI type="submit" tone="black" size="sm" loading={mesgul} disabled={mesgul}>
                    {t("Calculate")}
                </PillButtonUI>
            </form>
            <Sonuc hata={hata}>{sonuc && <FaizSonucu sonuc={sonuc} />}</Sonuc>
        </>
    );
}

function HarcFormu() {
    const [mahkeme, setMahkeme] = useState("asliye");
    const [deger, setDeger] = useState("");
    const [maktu, setMaktu] = useState(false);
    const [olum, setOlum] = useState(false);
    const { sonuc, hata, mesgul, calistir } = useHesap<HarcHesabiYaniti>();

    function gonder(event: FormEvent) {
        event.preventDefault();
        void calistir(() =>
            calculateCourtFees({
                mahkeme,
                deger: maktu ? undefined : Number(deger.replace(/\./g, "").replace(",", ".")),
                olumCismaniZarar: olum,
            }),
        );
    }

    return (
        <>
            <form onSubmit={gonder} className="flex flex-wrap items-end gap-3">
                <Alan label={t("Court")}>
                    <select value={mahkeme} onChange={(e) => setMahkeme(e.target.value)} className={FIELD_CLASS}>
                        <option value="asliye">{t("Asliye / administrative court")}</option>
                        <option value="sulh">{t("Sulh / enforcement court")}</option>
                    </select>
                </Alan>
                <Alan label={t("Claim value (TL)")}>
                    <input
                        inputMode="decimal"
                        required={!maktu}
                        disabled={maktu}
                        placeholder="500.000"
                        value={maktu ? "" : deger}
                        onChange={(e) => setDeger(e.target.value)}
                        className={cn(FIELD_CLASS, "w-36")}
                    />
                </Alan>
                <div className="flex flex-col gap-1">
                    <label className="flex items-center gap-2 text-xs text-gray-700">
                        <input type="checkbox" checked={maktu} onChange={(e) => setMaktu(e.target.checked)} />
                        {t("Claim without a money value")}
                    </label>
                    <label className="flex items-center gap-2 text-xs text-gray-700">
                        <input type="checkbox" checked={olum} disabled={maktu} onChange={(e) => setOlum(e.target.checked)} />
                        {t("Damages for death or bodily injury")}
                    </label>
                </div>
                <PillButtonUI type="submit" tone="black" size="sm" loading={mesgul} disabled={mesgul}>
                    {t("Calculate")}
                </PillButtonUI>
            </form>
            <Sonuc hata={hata}>{sonuc && <HarcSonucu sonuc={sonuc} />}</Sonuc>
        </>
    );
}

export function CalculationsPage() {
    const [sekme, setSekme] = useState<Sekme>("sure");
    return (
        <div className="flex h-full min-h-0 flex-col">
            <PageHeader shrink>
                <h1 className="font-serif text-2xl font-medium text-gray-900">{t("Calculations")}</h1>
            </PageHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 md:px-8">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
                    <div role="tablist" aria-label={t("Calculations")} className="flex flex-wrap gap-1.5">
                        {SEKMELER.map((s) => (
                            <button
                                key={s.value}
                                type="button"
                                role="tab"
                                aria-selected={sekme === s.value}
                                onClick={() => setSekme(s.value)}
                                className={cn(
                                    "rounded-full px-3 py-1 text-xs font-medium",
                                    sekme === s.value ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                                )}
                            >
                                {t(s.label)}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-gray-500">
                        {sekme === "sure"
                            ? t("Calculates the last day of a period under HMK, İİK, CMK or TBK, with weekends, public and religious holidays and the judicial recess.")
                            : sekme === "faiz"
                              ? t("Simple statutory or commercial default interest under Law 3095, split where the official rate changes.")
                              : t("Court fees due when filing a civil lawsuit under the current tariff of Law 492.")}{" "}
                        {t("These calculations are aids; check the result before relying on it.")}
                    </p>
                    {sekme === "sure" ? <SureFormu /> : sekme === "faiz" ? <FaizFormu /> : <HarcFormu />}
                </div>
            </div>
        </div>
    );
}
