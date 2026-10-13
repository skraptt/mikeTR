import { describe, expect, it, vi } from "vitest";
import { andQuery } from "../query";
import { IctihatSourceError, getDecision, htmlToText, searchDecisions } from "../client";

describe("andQuery", () => {
  it.each([
    ["kira tahliye", "+kira +tahliye"],
    ["TMK'nın 706. maddesi", "+TMK +706 +maddesi"],
    ['"ihtiyaç nedeniyle tahliye" -ceza', '+"ihtiyaç nedeniyle tahliye" -ceza'],
    ["kira OR kiracı", "kira OR kiracı"],
    ["kira or kiracı", "kira OR kiracı"],
    ["AND kira AND AND tahliye OR", "kira AND tahliye"],
    ["tapuya not düşülmesi", "+tapuya +not +düşülmesi"],
    ["iş-güç a+b", "+iş +güç +a +b"],
    ['kira "tahliye', "+kira +tahliye"],
    ["E.2023/8563", "+E +2023 +8563"],
  ])("turns %j into %j", (input, expected) => {
    expect(andQuery(input)).toBe(expected);
  });

  it("rejects a query without letters or digits", () => {
    expect(() => andQuery("?! ...")).toThrow(/harf ya da rakam/);
  });
});

describe("htmlToText", () => {
  it("keeps paragraphs and decodes entities", () => {
    expect(htmlToText("<style>x{}</style><p>Kira&nbsp;bedeli</p><p>&quot;6098&quot; &amp; &#252;</p>")).toBe(
      'Kira bedeli\n"6098" & ü',
    );
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const bedestenSearch = {
  data: {
    total: 568,
    emsalKararList: [
      { documentId: "1065746300", birimAdi: "12. Hukuk Dairesi", esasNo: "2023/8563", kararNo: "2024/4902", kararTarihiStr: "16.05.2024", kesinlesmeDurumu: "KONUT İHTİYACI NEDENİYLE TAHLİYE" },
    ],
  },
  metadata: { FMTY: "SUCCESS" },
};

const emsalSearch = {
  data: {
    recordsTotal: 1212,
    data: [
      { id: "567892800", daire: "İstanbul 18. Asliye Ticaret Mahkemesi", esasNo: "2018/253", kararNo: "2019/1099", kararTarihi: "19.12.2019", durum: "KESİNLEŞTİ" },
    ],
  },
  metadata: { FMTY: "SUCCESS" },
};

function fakeFetch(routes: Record<string, () => Response | Promise<Response>>) {
  return vi.fn(async (url: string | URL | Request) => {
    const key = Object.keys(routes).find((path) => String(url).includes(path));
    if (!key) throw new Error(`unexpected ${String(url)}`);
    return routes[key]();
  }) as unknown as typeof fetch;
}

describe("searchDecisions", () => {
  it("asks both sources for adli and labels each hit", async () => {
    const fetchFn = fakeFetch({
      searchDocuments: () => jsonResponse(bedestenSearch),
      aramalist: () => jsonResponse(emsalSearch),
    });
    const result = await searchDecisions({ query: "kiracının temerrüdü", limit: 4 }, fetchFn);

    expect(result.total).toBe(568 + 1212);
    expect(result.results).toEqual([
      expect.objectContaining({
        id: "yargitay:1065746300",
        kaynak_turu: "yargitay",
        mahkeme: "Yargıtay 12. Hukuk Dairesi",
        // Subject headings in the finality field are dropped.
        durum: null,
        atif: "Yargıtay 12. Hukuk Dairesi, E.2023/8563 K.2024/4902, T.16.05.2024",
        kaynak: "https://mevzuat.adalet.gov.tr/ictihat/1065746300",
      }),
      expect.objectContaining({
        id: "567892800",
        kaynak_turu: "emsal",
        durum: "KESİNLEŞTİ",
        atif: "İstanbul 18. Asliye Ticaret Mahkemesi, E.2018/253 K.2019/1099, T.19.12.2019",
      }),
    ]);
    const bodies = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
      ([, init]) => JSON.parse((init as RequestInit).body as string),
    );
    expect(bodies[0].data).toMatchObject({ phrase: "+kiracının +temerrüdü", pageSize: 2 });
    expect(bodies[1].data).toMatchObject({ aranan: "+kiracının +temerrüdü", pageSize: 2 });
  });

  it("still answers when one source fails, with a warning", async () => {
    const fetchFn = fakeFetch({
      searchDocuments: () => jsonResponse({}, 503),
      aramalist: () => jsonResponse(emsalSearch),
    });
    const result = await searchDecisions({ query: "kira" }, fetchFn);
    expect(result.results).toHaveLength(1);
    expect(result.warnings).toEqual(["Yargıtay search answered with HTTP 503."]);
  });

  it("fails when every source fails", async () => {
    const fetchFn = fakeFetch({
      searchDocuments: () => jsonResponse({}, 429),
      aramalist: () => jsonResponse({ metadata: { FMTY: "ERROR", FMTE: "Geçersiz istek" } }),
    });
    await expect(searchDecisions({ query: "kira" }, fetchFn)).rejects.toThrow(
      "Yargıtay search is limiting requests. Try again in a minute. UYAP Emsal search: Geçersiz istek",
    );
  });

  it("reports an unreachable source as a source error", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(searchDecisions({ query: "kira", court: "yargitay" }, fetchFn)).rejects.toBeInstanceOf(
      IctihatSourceError,
    );
  });
});

describe("getDecision", () => {
  it("decodes a Yargıtay decision", async () => {
    const html = "<p>12. Hukuk Dairesi 2023/8563 E. , 2024/4902 K.</p><p>Gereği düşünüldü.</p>";
    const fetchFn = fakeFetch({
      getDocumentContent: () =>
        jsonResponse({ data: { content: Buffer.from(html).toString("base64"), mimeType: "text/html" } }),
    });
    await expect(getDecision("yargitay:1065746300", fetchFn)).resolves.toEqual({
      id: "yargitay:1065746300",
      kaynak: "https://mevzuat.adalet.gov.tr/ictihat/1065746300",
      metin: "12. Hukuk Dairesi 2023/8563 E. , 2024/4902 K.\nGereği düşünüldü.",
    });
  });

  it("reads a UYAP Emsal decision", async () => {
    const fetchFn = fakeFetch({ getDokuman: () => jsonResponse({ data: "<p>Karar metni</p>" }) });
    await expect(getDecision("567892800", fetchFn)).resolves.toMatchObject({ metin: "Karar metni" });
  });

  it("refuses an id that did not come from a search", async () => {
    await expect(getDecision("../etc", vi.fn() as unknown as typeof fetch)).rejects.toThrow(
      "Use a decision id returned by the case-law search.",
    );
  });

  it("says when the decision is not in a readable format", async () => {
    const fetchFn = fakeFetch({
      getDocumentContent: () => jsonResponse({ data: { content: "JVBERi0=", mimeType: "application/pdf" } }),
    });
    await expect(getDecision("yargitay:1", fetchFn)).rejects.toThrow(/only available as application\/pdf/);
  });
});
