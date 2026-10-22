import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../supabase";
import { findArticleReferences } from "../citationCheck";
import { searchKanunWithReferences } from "../kanunSearch";

describe("findArticleReferences", () => {
  it.each([
    ["HMK 107", [["6100", "107"]]],
    ["hmk m.107", [["6100", "107"]]],
    ["TBK md. 49", [["6098", "49"]]],
    ["KVKK madde 5", [["6698", "5"]]],
    ["6698 s. K. m. 5", [["6698", "5"]]],
    ["6100 sayılı Kanun 107", [["6100", "107"]]],
    ["TMK geçici 1", [["4721", "Geçici 1"]]],
    ["TTK 1/A", [["6102", "1/A"]]],
    ["TBK 49 ve 50", [["6098", "49"], ["6098", "50"]]],
    ["Türk Borçlar Kanunu'nun 315. maddesi", [["6098", "315"]]],
    ["HMK 107 belirsiz alacak", [["6100", "107"]]],
    ["TMK1", [["4721", "1"]]],
    ["İİK 89", [["2004", "89"]]],
    ["TCK md. 141", [["5237", "141"]]],
    ["İşK 18", [["4857", "18"]]],
    ["AY 2", [["2709", "2"]]],
    ["Anayasa'nın 35. maddesi", [["2709", "35"]]],
    ["213 sayılı Kanun 359", [["213", "359"]]],
    ["4857 sayılı İş Kanunu'nun 18. maddesi", [["4857", "18"]]],
    // The old 1475 sayılı İş Kanunu (severance pay) is not the 4857 one.
    ["1475 sayılı İş Kanunu'nun 14. maddesi", [["1475", "14"]]],
  ])("reads %j", (query, expected) => {
    expect(findArticleReferences(query)).toEqual(
      expected.map(([kanun_no, madde_no]) => ({ kanun_no, madde_no })),
    );
  });

  it.each(["belirsiz alacak davası", "HMK", "6098 sayılı kanun", "HarçK 28", "6100107"])(
    "finds nothing in %j",
    (query) => {
      expect(findArticleReferences(query)).toEqual([]);
    },
  );
});

describe("searchKanunWithReferences", () => {
  const row = (kanun_no: string, madde_no: string) => ({
    id: `${kanun_no}-${madde_no}`,
    kanun_no,
    kanun_adi: "Kanun",
    madde_no,
    baslik: null,
    icerik: "metin",
    created_at: "2026-10-01T00:00:00Z",
  });
  const semantic = [{ ...row("6100", "107"), similarity: 0.71 }, { ...row("6100", "109"), similarity: 0.62 }];

  function fakeDb(rows: ReturnType<typeof row>[]) {
    const lookups: string[][] = [];
    const db = {
      from: () => {
        const query = {
          select: () => query,
          in: (_column: string, values: string[]) => {
            lookups.push(values);
            return query;
          },
          then: (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null }),
        };
        return query;
      },
      rpc: vi.fn(async () => ({ data: semantic, error: null })),
    } as unknown as Db;
    return { db, lookups };
  }

  beforeEach(() => {
    process.env.EMBEDDING_PROVIDER = "bge-m3";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ embeddings: [new Array(1024).fill(0)] }))),
    );
  });

  it("puts a referenced article first and drops its semantic duplicate", async () => {
    const { db, lookups } = fakeDb([row("6100", "107")]);
    const results = await searchKanunWithReferences(db, { query: "HMK 107", limit: 5, matchThreshold: 0.5 });
    expect(lookups).toEqual([["6100"], ["107"]]);
    expect(results.map((r) => [r.madde_no, r.similarity, r.exact])).toEqual([
      ["107", 1, true],
      ["109", 0.62, undefined],
    ]);
  });

  it("falls back to semantic results when the article does not exist", async () => {
    const { db } = fakeDb([]);
    const results = await searchKanunWithReferences(db, { query: "HMK 9999", limit: 5, matchThreshold: 0.5 });
    expect(results.map((r) => r.exact)).toEqual([undefined, undefined]);
  });

  it("skips the lookup for a descriptive query", async () => {
    const { db, lookups } = fakeDb([]);
    const results = await searchKanunWithReferences(db, {
      query: "belirsiz alacak davası",
      limit: 1,
      matchThreshold: 0.5,
    });
    expect(lookups).toEqual([]);
    expect(results).toHaveLength(1);
  });
});
