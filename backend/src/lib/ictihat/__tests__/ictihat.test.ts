import { describe, expect, it, vi } from "vitest";
import { andQuery } from "../query";
import { IctihatSourceError, getDecision, htmlToText, normalizeFilters, searchDecisions } from "../client";

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

describe("filters", () => {
  it("accepts known chambers, real dates and sorts", () => {
    expect(
      normalizeFilters({ daire: "3. hukuk dairesi", baslangic: "2023-01-01", bitis: "2024-12-31", siralama: "yeni" }),
    ).toEqual({ daire: "3. Hukuk Dairesi", baslangic: "2023-01-01", bitis: "2024-12-31", siralama: "yeni" });
    // Relevance is the services' default, so it is not sent.
    expect(normalizeFilters({ siralama: "ilgili", daire: " " })).toEqual({});
  });

  it.each([
    [{ daire: "99. Hukuk Dairesi" }, "Unknown Yargıtay chamber: 99. Hukuk Dairesi."],
    [{ baslangic: "2023-02-30" }, "Dates must be YYYY-MM-DD: 2023-02-30."],
    [{ bitis: "31.12.2024" }, "Dates must be YYYY-MM-DD: 31.12.2024."],
    [{ baslangic: "2025-01-01", bitis: "2024-01-01" }, "The start date is after the end date."],
    [{ siralama: "random" as never }, "Unknown sort: random."],
  ])("rejects %j", (filters, message) => {
    expect(() => normalizeFilters(filters)).toThrow(message);
  });

  it("sends the filters each service understands", async () => {
    const fetchFn = fakeFetch({
      searchDocuments: () => jsonResponse(bedestenSearch),
      aramadetaylist: () => jsonResponse(emsalSearch),
    });
    const result = await searchDecisions(
      { query: "kira", filters: { baslangic: "2023-01-01", bitis: "2024-12-31", siralama: "eski" } },
      fetchFn,
    );
    expect(result).toMatchObject({ court: "adli", filters: { siralama: "eski" } });
    const [yargitay, emsal] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
      ([, init]) => JSON.parse((init as RequestInit).body as string).data,
    );
    expect(yargitay).toMatchObject({
      kararTarihiStart: "2023-01-01T00:00:00.000Z",
      kararTarihiEnd: "2024-12-31T23:59:59.999Z",
      sortFields: ["KARAR_TARIHI"],
      sortDirection: "ASC",
    });
    expect(emsal).toMatchObject({
      arananKelime: "+kira",
      baslangicTarihi: "01.01.2023",
      bitisTarihi: "31.12.2024",
      siralama: "3",
      siralamaDirection: "asc",
    });
  });

  it("narrows a chamber search to Yargıtay", async () => {
    const fetchFn = fakeFetch({ searchDocuments: () => jsonResponse(bedestenSearch) });
    const result = await searchDecisions({ query: "kira", court: "emsal", filters: { daire: "Hukuk Genel Kurulu" } }, fetchFn);
    expect(result.court).toBe("yargitay");
    const [[, init]] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(JSON.parse((init as RequestInit).body as string).data).toMatchObject({ birimAdi: "Hukuk Genel Kurulu" });
    expect(JSON.parse((init as RequestInit).body as string).data).not.toHaveProperty("sortFields");
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
