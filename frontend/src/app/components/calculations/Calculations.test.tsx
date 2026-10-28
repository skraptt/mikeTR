import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MikeApiError } from "@/app/lib/mikeApi";
import { CalculationsPage } from "./Calculations";
import { HesapSonucuKarti } from "./HesapSonucu";

const calculateDeadline = vi.hoisted(() => vi.fn());
const calculateInterest = vi.hoisted(() => vi.fn());
const calculateCourtFees = vi.hoisted(() => vi.fn());
const calculateSeverance = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/mikeApi", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/app/lib/mikeApi")>()),
    calculateDeadline,
    calculateInterest,
    calculateCourtFees,
    calculateSeverance,
}));

// PageHeader measures its breadcrumbs with matchMedia, which jsdom lacks.
beforeAll(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
});

beforeEach(() => vi.clearAllMocks());

const sure = {
    baslangic: "2026-07-10",
    sonGun: "2026-09-07",
    sonGunAdi: "7 Eylül 2026 Pazartesi",
    adimlar: ["2 haftalık süre (HMK md. 92).", "Adli tatil (HMK md. 104)."],
    uyarilar: ["Hesap bir yardımcıdır."],
};

describe("CalculationsPage", () => {
    it("calculates a deadline and shows the last day with its steps", async () => {
        calculateDeadline.mockResolvedValue(sure);
        render(<CalculationsPage />);
        fireEvent.change(screen.getByLabelText("Start date (notification)"), { target: { value: "2026-07-10" } });
        fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
        expect(await screen.findByText("7 Eylül 2026 Pazartesi")).toBeTruthy();
        expect(screen.getByText("Adli tatil (HMK md. 104).")).toBeTruthy();
        expect(calculateDeadline).toHaveBeenCalledWith({
            baslangic: "2026-07-10",
            sure: 2,
            birim: "hafta",
            rejim: "hmk",
            adliTatileTabi: true,
        });
    });

    it("reads Turkish-formatted amounts for interest", async () => {
        calculateInterest.mockResolvedValue({
            anapara: 100000,
            toplamFaiz: 17753.43,
            toplam: 117753.43,
            donemler: [{ baslangic: "2024-01-01", bitis: "2024-06-01", gun: 152, oran: 9, faiz: 3747.95, dayanak: "kanuni faiz %9" }],
            uyarilar: [],
            tabloTarihi: "2026-10-22",
        });
        render(<CalculationsPage />);
        fireEvent.click(screen.getByRole("tab", { name: "Interest" }));
        fireEvent.change(screen.getByLabelText("Principal (TL)"), { target: { value: "100.000" } });
        fireEvent.change(screen.getByLabelText("From"), { target: { value: "2024-01-01" } });
        fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
        expect(await screen.findByText("17.753,43 TL")).toBeTruthy();
        expect(calculateInterest).toHaveBeenCalledWith(expect.objectContaining({ anapara: 100000, baslangic: "2024-01-01", tur: "kanuni" }));
    });

    it("calculates severance and notice pay with Turkish-formatted wages", async () => {
        calculateSeverance.mockResolvedValue({
            hizmetSuresi: { yil: 5, ay: 5, gun: 6 },
            hizmetSuresiYazili: "5 yıl 5 ay 6 gün",
            brutUcret: 60000,
            tavan: 73729.87,
            tavanBaslangici: "2026-07-01",
            esasUcret: 60000,
            ihbarSuresiHafta: 8,
            kalemler: [
                { kalem: "Kıdem tazminatı", brut: 325986.3, gelirVergisi: 0, damgaVergisi: 2474.24, net: 323512.06, dayanak: "1475 s. K. md. 14" },
            ],
            toplamBrut: 325986.3,
            toplamNet: 323512.06,
            adimlar: ["Hizmet süresi 5 yıl 5 ay 6 gün."],
            uyarilar: [],
        });
        render(<CalculationsPage />);
        fireEvent.click(screen.getByRole("tab", { name: "Severance / notice pay" }));
        fireEvent.change(screen.getByLabelText("Start of employment"), { target: { value: "2021-03-15" } });
        fireEvent.change(screen.getByLabelText("End of employment"), { target: { value: "2026-08-20" } });
        fireEvent.change(screen.getByLabelText("Monthly gross wage incl. benefits (TL)"), { target: { value: "60.000,00" } });
        fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
        expect(await screen.findAllByText("323.512,06 TL")).toHaveLength(2);
        expect(screen.getAllByText("5 yıl 5 ay 6 gün").length).toBeGreaterThan(0);
        expect(calculateSeverance).toHaveBeenCalledWith({
            giris: "2021-03-15",
            cikis: "2026-08-20",
            brutUcret: 60000,
            ihbar: true,
            gelirVergisiOrani: 15,
        });
    });

    it("sends no value for a claim without a money value, and shows a failure", async () => {
        calculateCourtFees.mockRejectedValue(new MikeApiError({ message: "Mahkeme sulh veya asliye olmalı.", status: 400, code: "validation" }));
        render(<CalculationsPage />);
        fireEvent.click(screen.getByRole("tab", { name: "Court fees" }));
        fireEvent.click(screen.getByLabelText("Claim without a money value"));
        fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
        expect(await screen.findByRole("alert")).toBeTruthy();
        expect(calculateCourtFees).toHaveBeenCalledWith({ mahkeme: "asliye", deger: undefined, olumCismaniZarar: false });
    });
});

describe("HesapSonucuKarti", () => {
    it("renders a court fee result card", () => {
        render(
            <HesapSonucuKarti
                event={{
                    type: "hesap_sonucu",
                    arac: "harc",
                    sonuc: {
                        kalemler: [{ kalem: "Başvurma harcı", tutar: 732, dayanak: "492 s. K." }],
                        acilistaOdenecek: 1464,
                        kalanKararHarci: 0,
                        uyarilar: [],
                        tarifeYili: 2026,
                    },
                }}
            />,
        );
        expect(screen.getByText("Court fee calculation")).toBeTruthy();
        expect(screen.getByText("1.464,00 TL")).toBeTruthy();
    });
});
