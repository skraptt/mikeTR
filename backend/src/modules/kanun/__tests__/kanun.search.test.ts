import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../../../lib/supabase";

const searchKanunMaddeleri = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/kanunSearch", () => ({ searchKanunMaddeleri }));

import { searchStatutes } from "../kanun.service";

const db = {} as Db;

const match = {
  id: "m1",
  kanun_no: "6098",
  kanun_adi: "Türk Borçlar Kanunu",
  madde_no: "315",
  baslik: "Ödememe",
  icerik: "Kiracı, teslimden sonra muaccel olan kira bedelini…",
  created_at: "2026-10-01T00:00:00Z",
  similarity: 0.71,
};

describe("searchStatutes", () => {
  beforeEach(() => {
    searchKanunMaddeleri.mockReset();
  });

  it("rejects an empty query without searching", async () => {
    const result = await searchStatutes(db, { query: "   " });
    expect(result).toEqual({ ok: false, kind: "validation", detail: "Enter a search query." });
    expect(searchKanunMaddeleri).not.toHaveBeenCalled();
  });

  it("rejects an overlong query", async () => {
    const result = await searchStatutes(db, { query: "a".repeat(501) });
    expect(result).toMatchObject({ ok: false, kind: "validation" });
  });

  it("clamps the limit and returns articles without internal columns", async () => {
    searchKanunMaddeleri.mockResolvedValue([match]);
    const result = await searchStatutes(db, { query: " kira temerrüt ", limit: 99 });
    expect(searchKanunMaddeleri).toHaveBeenCalledWith(db, {
      query: "kira temerrüt",
      limit: 20,
      matchThreshold: 0.5,
    });
    expect(result).toEqual({
      ok: true,
      data: {
        query: "kira temerrüt",
        results: [
          {
            id: "m1",
            kanun_no: "6098",
            kanun_adi: "Türk Borçlar Kanunu",
            madde_no: "315",
            baslik: "Ödememe",
            icerik: match.icerik,
            similarity: 0.71,
          },
        ],
      },
    });
  });

  it("turns an embedding or database error into an internal failure", async () => {
    searchKanunMaddeleri.mockImplementation(async () => {
      throw new Error("ollama unreachable");
    });
    const result = await searchStatutes(db, { query: "kira" });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.kind).toBe("error");
  });
});
