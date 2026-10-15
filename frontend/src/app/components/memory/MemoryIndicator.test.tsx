import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryIndicator } from "./MemoryIndicator";

const { getUserMemory } = vi.hoisted(() => ({ getUserMemory: vi.fn() }));

vi.mock("@/app/lib/mikeApi", () => ({ getUserMemory }));

describe("MemoryIndicator", () => {
    beforeEach(() => {
        getUserMemory.mockReset();
    });

    it("shows a link to the memory settings while memory is on", async () => {
        getUserMemory.mockResolvedValue({ enabled: true });
        render(<MemoryIndicator />);
        const link = await screen.findByRole("link", { name: "Memory on" });
        expect(link).toHaveAttribute("href", "/settings/memory");
    });

    it("shows nothing while memory is off", async () => {
        getUserMemory.mockResolvedValue({ enabled: false });
        render(<MemoryIndicator />);
        await waitFor(() => expect(getUserMemory).toHaveBeenCalled());
        expect(screen.queryByRole("link", { name: "Memory on" })).not.toBeInTheDocument();
    });

    it("shows nothing when the memory status cannot be loaded", async () => {
        getUserMemory.mockRejectedValue(new Error("offline"));
        render(<MemoryIndicator />);
        await waitFor(() => expect(getUserMemory).toHaveBeenCalled());
        expect(screen.queryByRole("link", { name: "Memory on" })).not.toBeInTheDocument();
    });
});
