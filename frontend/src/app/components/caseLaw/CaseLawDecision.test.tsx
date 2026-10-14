import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MikeApiError } from "@/app/lib/mikeApi";
import { CaseLawDecisionPage } from "./CaseLawDecision";
import { decisionHref, decisionReaderHref } from "./caseLawLinks";

let params = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => params }));

const getCaseLawDecision = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/mikeApi", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/app/lib/mikeApi")>()),
    getCaseLawDecision,
}));

// PageHeader measures its breadcrumbs with matchMedia, which jsdom lacks.
beforeAll(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }));
});

describe("decision links", () => {
    it("opens Yargıtay on its official page and UYAP Emsal in the reader", () => {
        expect(decisionHref({ id: "yargitay:1", kaynak: "https://mevzuat.adalet.gov.tr/ictihat/1" })).toBe(
            "https://mevzuat.adalet.gov.tr/ictihat/1",
        );
        expect(decisionHref({ id: "5", atif: "Ankara BAM 4. HD, E.1 K.2, T.3", kaynak: "https://emsal.uyap.gov.tr/" })).toBe(
            "/case-law/decision?id=5&atif=Ankara+BAM+4.+HD%2C+E.1+K.2%2C+T.3",
        );
        expect(decisionReaderHref({ id: "yargitay:1" })).toBe("/case-law/decision?id=yargitay%3A1");
        expect(decisionHref({ id: "aym:x", kaynak: "https://kararlarbilgibankasi.anayasa.gov.tr/kbb/BB/2021/1240" })).toBe(
            "https://kararlarbilgibankasi.anayasa.gov.tr/kbb/BB/2021/1240",
        );
    });
});

describe("CaseLawDecisionPage", () => {
    beforeEach(() => {
        getCaseLawDecision.mockReset();
        params = new URLSearchParams();
    });

    it("asks for a decision when none is given", () => {
        render(<CaseLawDecisionPage />);
        expect(screen.getByText("No decision selected")).toBeInTheDocument();
        expect(getCaseLawDecision).not.toHaveBeenCalled();
    });

    it("shows a UYAP Emsal decision with its citation and where to find it", async () => {
        params = new URLSearchParams({ id: "5", atif: "Ankara BAM 4. HD, E.1 K.2, T.3" });
        getCaseLawDecision.mockResolvedValue({ id: "5", kaynak: "https://emsal.uyap.gov.tr/", metin: "GEREĞİ DÜŞÜNÜLDÜ" });
        render(<CaseLawDecisionPage />);

        expect(await screen.findByText("GEREĞİ DÜŞÜNÜLDÜ")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Ankara BAM 4. HD, E.1 K.2, T.3" })).toBeInTheDocument();
        expect(screen.getByText(/It has no page per decision/)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Open UYAP Emsal/ })).toHaveAttribute("href", "https://emsal.uyap.gov.tr/");
    });

    it("links a Yargıtay decision to its official page", async () => {
        params = new URLSearchParams({ id: "yargitay:1" });
        getCaseLawDecision.mockResolvedValue({ id: "yargitay:1", kaynak: "https://mevzuat.adalet.gov.tr/ictihat/1", metin: "Karar" });
        render(<CaseLawDecisionPage />);
        expect(await screen.findByRole("link", { name: /Official source/ })).toHaveAttribute(
            "href",
            "https://mevzuat.adalet.gov.tr/ictihat/1",
        );
    });

    it.each([
        ["danistay:1", /Danıştay decision search/],
        ["norm:7c31037d-be2a-4a4b-087f-ab5ff35e0a2e", /Constitutional Court decisions database/],
    ])("names the source of %s", async (id, note) => {
        params = new URLSearchParams({ id });
        getCaseLawDecision.mockResolvedValue({ id, kaynak: "https://example.test/page", metin: "Karar" });
        render(<CaseLawDecisionPage />);
        expect(await screen.findByText(note)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Official source/ })).toHaveAttribute("href", "https://example.test/page");
    });

    it("explains a failure and retries", async () => {
        params = new URLSearchParams({ id: "5" });
        getCaseLawDecision.mockImplementationOnce(async () => {
            throw new MikeApiError({ message: "UYAP Emsal did not respond in time.", status: 503 });
        });
        getCaseLawDecision.mockResolvedValueOnce({ id: "5", kaynak: "https://emsal.uyap.gov.tr/", metin: "Karar metni" });
        render(<CaseLawDecisionPage />);

        expect(await screen.findByText("The decision could not be loaded")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByText("Karar metni")).toBeInTheDocument();
    });
});
