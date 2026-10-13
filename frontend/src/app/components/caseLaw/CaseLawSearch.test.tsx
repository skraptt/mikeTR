import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MikeApiError } from "@/app/lib/mikeApi";
import { CaseLawSearchPage } from "./CaseLawSearch";

const push = vi.fn();
let params = new URLSearchParams();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push }),
    useSearchParams: () => params,
}));

const searchCaseLaw = vi.hoisted(() => vi.fn());
const getCaseLawDecision = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/mikeApi", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/app/lib/mikeApi")>()),
    searchCaseLaw,
    getCaseLawDecision,
}));

const hit = {
    id: "yargitay:1065746300",
    kaynak_turu: "yargitay",
    mahkeme: "Yargıtay 12. Hukuk Dairesi",
    esas_no: "2023/8563",
    karar_no: "2024/4902",
    karar_tarihi: "16.05.2024",
    durum: "KESİNLEŞTİ",
    atif: "Yargıtay 12. Hukuk Dairesi, E.2023/8563 K.2024/4902, T.16.05.2024",
    kaynak: "https://mevzuat.adalet.gov.tr/ictihat/1065746300",
};

function response(overrides: Record<string, unknown> = {}) {
    return { query: "temerrüt", court: "adli", page: 1, total: 25, results: [hit], ...overrides };
}

// PageHeader measures its breadcrumbs on the next animation frame with
// matchMedia, which jsdom does not provide.
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

describe("CaseLawSearchPage", () => {
    beforeEach(() => {
        push.mockClear();
        searchCaseLaw.mockReset();
        getCaseLawDecision.mockReset();
        params = new URLSearchParams();
    });

    it("invites a search when there is no query", () => {
        render(<CaseLawSearchPage />);
        expect(screen.getByText("Search Turkish case law", { selector: "h3, h2, p, div" })).toBeInTheDocument();
        expect(searchCaseLaw).not.toHaveBeenCalled();
    });

    it("searches the URL query and court, and reads a decision on demand", async () => {
        params = new URLSearchParams({ q: "temerrüt", court: "yargitay", page: "2" });
        searchCaseLaw.mockResolvedValue(response({ court: "yargitay", page: 2 }));
        getCaseLawDecision.mockResolvedValue({ id: hit.id, kaynak: hit.kaynak, metin: "Gereği düşünüldü." });
        render(<CaseLawSearchPage />);

        expect(await screen.findByText("Yargıtay 12. Hukuk Dairesi")).toBeInTheDocument();
        expect(searchCaseLaw).toHaveBeenCalledWith("temerrüt", "yargitay", 2);
        expect(screen.getByText("Docket 2023/8563 · Decision 2024/4902 · 16.05.2024")).toBeInTheDocument();
        expect(screen.getByText("KESİNLEŞTİ")).toBeInTheDocument();
        expect(screen.getByText("25 decisions found")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Official source/ })).toHaveAttribute("href", hit.kaynak);

        fireEvent.click(screen.getByRole("button", { name: /Read decision/ }));
        expect(await screen.findByText("Gereği düşünüldü.")).toBeInTheDocument();
        expect(getCaseLawDecision).toHaveBeenCalledWith(hit.id);
        fireEvent.click(screen.getByRole("button", { name: /Hide decision/ }));
        expect(screen.queryByText("Gereği düşünüldü.")).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Next page" }));
        expect(push).toHaveBeenCalledWith("/case-law?q=temerr%C3%BCt&court=yargitay&page=3");
        fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
        expect(push).toHaveBeenCalledWith("/case-law?q=temerr%C3%BCt&court=yargitay");
    });

    it("shows why a decision could not be read", async () => {
        params = new URLSearchParams({ q: "temerrüt" });
        searchCaseLaw.mockResolvedValue(response());
        getCaseLawDecision.mockImplementation(async () => {
            throw new MikeApiError({ message: "Yargıtay did not respond in time.", status: 503 });
        });
        render(<CaseLawSearchPage />);

        fireEvent.click(await screen.findByRole("button", { name: /Read decision/ }));
        expect(await screen.findByRole("alert")).toHaveTextContent(
            "The decision could not be loaded. Please try again.",
        );
    });

    it("puts a new search with its court in the URL", () => {
        render(<CaseLawSearchPage />);
        fireEvent.change(screen.getByRole("searchbox", { name: "Search Turkish case law" }), {
            target: { value: '"ihtiyaç nedeniyle tahliye"' },
        });
        fireEvent.click(screen.getByRole("radio", { name: "Regional and first-instance courts" }));
        fireEvent.click(screen.getByRole("button", { name: "Search" }));
        expect(push).toHaveBeenCalledWith(
            "/case-law?q=%22ihtiya%C3%A7+nedeniyle+tahliye%22&court=emsal",
        );
    });

    it("says so when nothing matches, and warns about a source that failed", async () => {
        params = new URLSearchParams({ q: "uzay" });
        searchCaseLaw.mockResolvedValueOnce(response({ total: 0, results: [] }));
        const { unmount } = render(<CaseLawSearchPage />);
        expect(await screen.findByText("No matching decisions")).toBeInTheDocument();
        unmount();

        searchCaseLaw.mockResolvedValueOnce(response({ warnings: ["UYAP Emsal search answered with HTTP 503."] }));
        render(<CaseLawSearchPage />);
        expect(
            await screen.findByText("Some sources could not be searched: UYAP Emsal search answered with HTTP 503."),
        ).toBeInTheDocument();
    });

    it("shows the API's message and retries", async () => {
        params = new URLSearchParams({ q: "kira" });
        searchCaseLaw.mockImplementationOnce(async () => {
            throw new MikeApiError({ message: "Enter a search query.", status: 400 });
        });
        searchCaseLaw.mockResolvedValueOnce(response());
        render(<CaseLawSearchPage />);

        expect(await screen.findByText("Enter a search query.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByText("Yargıtay 12. Hukuk Dairesi")).toBeInTheDocument();
    });
});
