import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MikeApiError } from "@/app/lib/mikeApi";
import { StatuteSearchPage } from "./StatuteSearch";

const push = vi.fn();
let query = "";
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push }),
    useSearchParams: () => new URLSearchParams(query ? { q: query } : {}),
}));

const searchStatutes = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/mikeApi", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/app/lib/mikeApi")>()),
    searchStatutes,
}));

const article = {
    id: "a1",
    kanun_no: "6098",
    kanun_adi: "Türk Borçlar Kanunu",
    madde_no: "315",
    baslik: "Ödememe",
    icerik: "Kiracı, teslimden sonra muaccel olan kira bedelini ödemezse…",
    similarity: 0.71,
};


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

describe("StatuteSearchPage", () => {
    beforeEach(() => {
        push.mockClear();
        searchStatutes.mockReset();
        query = "";
    });

    it("invites a search when there is no query", () => {
        render(<StatuteSearchPage />);
        expect(screen.getByText(/Describe a legal issue in plain words/)).toBeInTheDocument();
        expect(searchStatutes).not.toHaveBeenCalled();
    });

    it("searches the query in the URL and lists the articles", async () => {
        query = "kira ödememe";
        searchStatutes.mockResolvedValue({ query, results: [article] });
        render(<StatuteSearchPage />);

        expect(await screen.findByText("TBK md. 315")).toBeInTheDocument();
        expect(screen.getByText("71% match")).toBeInTheDocument();
        expect(screen.getByText("1 relevant article")).toBeInTheDocument();
        expect(searchStatutes).toHaveBeenCalledWith("kira ödememe", 10);
    });

    it("labels an article the query named instead of scoring it", async () => {
        query = "TBK 315";
        searchStatutes.mockResolvedValue({ query, results: [{ ...article, similarity: 1, exact: true }] });
        render(<StatuteSearchPage />);

        expect(await screen.findByText("Cited article")).toBeInTheDocument();
        expect(screen.queryByText("100% match")).not.toBeInTheDocument();
    });

    it("says so when nothing matches", async () => {
        query = "uzay hukuku";
        searchStatutes.mockResolvedValue({ query, results: [] });
        render(<StatuteSearchPage />);
        expect(await screen.findByText("No matching articles")).toBeInTheDocument();
    });

    it("shows the API's message and retries", async () => {
        query = "kira";
        searchStatutes.mockImplementationOnce(async () => {
            throw new MikeApiError({ message: "Enter a search query.", status: 400 });
        });
        searchStatutes.mockResolvedValueOnce({ query, results: [article] });
        render(<StatuteSearchPage />);

        expect(await screen.findByText("Enter a search query.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByText("TBK md. 315")).toBeInTheDocument();
    });

    it("puts a new search in the URL", () => {
        render(<StatuteSearchPage />);
        fireEvent.change(screen.getByRole("searchbox", { name: "Search Turkish statutes" }), {
            target: { value: "  ayıplı mal  " },
        });
        fireEvent.click(screen.getByRole("button", { name: "Search" }));
        expect(push).toHaveBeenCalledWith("/statutes?q=ay%C4%B1pl%C4%B1%20mal");
    });
});
