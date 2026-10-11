import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MikeApiError } from "@/app/lib/mikeApi";
import { StatuteUpdatesPage } from "./StatuteUpdates";
import { wordDiff } from "./wordDiff";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

const api = vi.hoisted(() => ({
    listStatuteUpdates: vi.fn(),
    decideStatuteUpdate: vi.fn(),
    startStatuteCheck: vi.fn(),
    getStatuteStatus: vi.fn(),
}));
vi.mock("@/app/lib/mikeApi", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/app/lib/mikeApi")>()),
    ...api,
}));

const kanun = {
    kanun_no: "6100",
    kanun_adi: "Hukuk Muhakemeleri Kanunu",
    guncellik_tarihi: null,
    son_kontrol: "2026-10-12T06:00:00Z",
    son_kontrol_hatasi: null,
    kaynak_url: "https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6100&MevzuatTur=1&MevzuatTertip=5",
};
const change = {
    id: "c1",
    kanun_no: "6100",
    madde_no: "107",
    tur: "degisti" as const,
    eski_baslik: "Belirsiz alacak davası",
    eski_icerik: "(1) Davanın açıldığı tarihte alacağın miktarını belirleyemeyen alacaklı…",
    yeni_baslik: "Belirsiz alacak davası",
    yeni_icerik: "(Mülga:16/7/2026-7589/19 md.)",
    durum: "beklemede" as const,
    tespit_tarihi: "2026-10-12T06:00:00Z",
};

describe("wordDiff", () => {
    it("marks removed and added words", () => {
        expect(wordDiff("süre bir hafta", "süre iki hafta")).toEqual([
            { text: "süre ", kind: "same" },
            { text: "bir", kind: "removed" },
            { text: "iki", kind: "added" },
            { text: " hafta", kind: "same" },
        ]);
    });
});

describe("StatuteUpdatesPage", () => {
    beforeEach(() => {
        Object.values(api).forEach((fn) => fn.mockReset());
    });

    it("tells non-admins who reviews changes", async () => {
        api.listStatuteUpdates.mockImplementation(async () => {
            throw new MikeApiError({ message: "Only a statute admin can review statute changes.", status: 403 });
        });
        render(<StatuteUpdatesPage />);
        expect(await screen.findByText("Statute admins only")).toBeInTheDocument();
    });

    it("shows a pending change and removes it once approved", async () => {
        api.listStatuteUpdates
            .mockResolvedValueOnce({ kanunlar: [kanun], degisiklikler: [change] })
            .mockResolvedValue({ kanunlar: [{ ...kanun, guncellik_tarihi: kanun.son_kontrol }], degisiklikler: [] });
        api.decideStatuteUpdate.mockResolvedValue({ durum: "onaylandi", aranabilir: true });
        render(<StatuteUpdatesPage />);

        expect(await screen.findByText("HMK md. 107")).toBeInTheDocument();
        expect(screen.getByText("Changed")).toBeInTheDocument();
        expect(screen.getByRole("region", { name: "Official text" })).toHaveTextContent(
            "(Mülga:16/7/2026-7589/19 md.)",
        );

        fireEvent.click(screen.getByRole("button", { name: "Approve" }));
        await waitFor(() => expect(api.decideStatuteUpdate).toHaveBeenCalledWith("c1", "approve"));
        expect(await screen.findByText("No pending changes.")).toBeInTheDocument();
    });

    it("warns when an approved article could not be embedded", async () => {
        api.listStatuteUpdates.mockResolvedValue({ kanunlar: [kanun], degisiklikler: [change] });
        api.decideStatuteUpdate.mockResolvedValue({ durum: "onaylandi", aranabilir: false });
        render(<StatuteUpdatesPage />);
        fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("not searchable yet");
    });
});
