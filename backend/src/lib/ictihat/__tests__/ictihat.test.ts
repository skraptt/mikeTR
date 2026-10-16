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
    expect(htmlToText("<p>T&Uuml;RK&#x130;YE &ouml;n al\u200bım &ldquo;x&rdquo; &bogus;</p>")).toBe("TÜRKİYE ön alım “x” &bogus;");
    // Doubly encoded HTML (Danıştay's own site) is opened first.
    expect(htmlToText("&lt;p&gt;Karar&lt;/p&gt;&lt;p&gt;Metin&lt;/p&gt;")).toBe("Karar\nMetin");
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
        // No page per decision on UYAP Emsal; the search site finds it.
        kaynak: "https://emsal.uyap.gov.tr/",
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
    [{ daire: "99. Hukuk Dairesi" }, "Unknown chamber: 99. Hukuk Dairesi."],
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

  it("rejects a finality filter with a chamber, and an unknown finality", () => {
    expect(() => normalizeFilters({ daire: "3. Hukuk Dairesi", kesinlesme: "kesinlesti" })).toThrow(
      /cannot be combined/,
    );
    expect(() => normalizeFilters({ kesinlesme: "belki" as never })).toThrow("Unknown finality: belki.");
  });

  it("reads UYAP Emsal pages until it has a page of decisions with the wanted finality", async () => {
    const decision = (n: number, durum: string) => ({
      id: String(n),
      daire: "Ankara BAM 4. HD",
      esasNo: `2024/${n}`,
      kararNo: `2024/${n}`,
      kararTarihi: "01.01.2024",
      durum,
    });
    // Source pages of 10: every third decision is final; 25 decisions in all.
    const all = Array.from({ length: 25 }, (_, i) => decision(i + 1, i % 3 === 0 ? "KESİNLEŞTİ" : "KESİNLEŞMEDİ"));
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const { pageNumber, pageSize } = JSON.parse(init!.body as string).data;
      const rows = all.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
      return jsonResponse({ data: { recordsTotal: all.length, data: rows } });
    }) as unknown as typeof fetch;

    const first = await searchDecisions(
      { query: "kira", court: "yargitay", limit: 3, filters: { kesinlesme: "kesinlesti" } },
      fetchFn,
    );
    expect(first.court).toBe("emsal");
    expect(first.results.map((hit) => hit.id)).toEqual(["1", "4", "7"]);
    // Four matches by page 2 were enough to know a next page exists.
    expect(first).toMatchObject({ total: 4, approximate: true });

    const last = await searchDecisions(
      { query: "kira", limit: 3, page: 3, filters: { kesinlesme: "kesinlesti" } },
      fetchFn,
    );
    // The source ran out, so the count is exact: decisions 1, 4, ..., 25.
    expect(last).toMatchObject({ total: 9, results: [{ id: "19" }, { id: "22" }, { id: "25" }] });
    expect(last.approximate).toBeUndefined();
  });

  it("lists a decision the service returns twice only once", async () => {
    const [hit] = bedestenSearch.data.emsalKararList;
    const twice = { ...bedestenSearch, data: { total: 2, emsalKararList: [hit, { ...hit, documentId: "1065746301" }] } };
    const fetchFn = fakeFetch({ searchDocuments: () => jsonResponse(twice) });
    const result = await searchDecisions({ query: "kira", court: "yargitay" }, fetchFn);
    expect(result.results.map((r) => r.id)).toEqual(["yargitay:1065746300"]);
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

describe("kanun yararına bozma", () => {
  const kybSearch = {
    data: {
      total: 8,
      emsalKararList: [
        { documentId: "152530800", birimAdi: "8. Ceza Dairesi", esasNo: "2015/12262", kararNo: "2015/22468", kararTarihiStr: "12.10.2015", kesinlesmeDurumu: null },
      ],
    },
    metadata: { FMTY: "SUCCESS" },
  };

  it("searches KYB decisions as Yargıtay's, under their own item type and id", async () => {
    const fetchFn = fakeFetch({ searchDocuments: () => jsonResponse(kybSearch) });
    const result = await searchDecisions({ query: "kira", court: "kyb" }, fetchFn);
    expect(result.court).toBe("kyb");
    expect(result.results[0]).toMatchObject({
      id: "kyb:152530800",
      kaynak_turu: "kyb",
      mahkeme: "Yargıtay 8. Ceza Dairesi",
      kaynak: "https://mevzuat.adalet.gov.tr/ictihat/152530800",
    });
    const [[, init]] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(JSON.parse((init as RequestInit).body as string).data.itemTypeList).toEqual(["KYB"]);
  });

  it("keeps a chamber filter on KYB instead of moving to Yargıtay", async () => {
    const fetchFn = fakeFetch({ searchDocuments: () => jsonResponse(kybSearch) });
    const result = await searchDecisions({ query: "kira", court: "kyb", filters: { daire: "8. Ceza Dairesi" } }, fetchFn);
    expect(result.court).toBe("kyb");
    const [[, init]] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(JSON.parse((init as RequestInit).body as string).data).toMatchObject({ itemTypeList: ["KYB"], birimAdi: "8. Ceza Dairesi" });
  });

  it("reads a KYB decision", async () => {
    const html = "<p>8. Ceza Dairesi 2015/12262 E. , 2015/22468 K.</p>";
    const fetchFn = fakeFetch({
      getDocumentContent: () =>
        jsonResponse({ data: { content: Buffer.from(html).toString("base64"), mimeType: "text/html" } }),
    });
    await expect(getDecision("kyb:152530800", fetchFn)).resolves.toMatchObject({
      id: "kyb:152530800",
      kaynak: "https://mevzuat.adalet.gov.tr/ictihat/152530800",
    });
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
    await expect(getDecision("567892800", fetchFn)).resolves.toEqual({
      id: "567892800",
      kaynak: "https://emsal.uyap.gov.tr/",
      metin: "Karar metni",
    });
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

describe("Danıştay and the Constitutional Court", () => {
  const aymRecord = {
    id: "891e2b7d-6bf8-ccc6-91db-b18f2c4377d6",
    basvuruNo: "2021/1240",
    kararTarihi: "2026-09-03",
    basvuruAdi: "T&Uuml;LAY İRİ",
    kararKonusu: "<p>Başvuru; &ouml;n alım hakkına dayalı tapu iptali</p>",
    kararTuruBasvuruSonucuLabel: "Esas (İhlal)",
    kararVerenBirimLabel: "İkinci Bölüm",
  };
  const normRecord = {
    id: "7c31037d-be2a-4a4b-087f-ab5ff35e0a2e",
    esasNo: "2024/176",
    kararNo: "2025/42",
    kararTarihi: "2025-02-11",
    resmiGazeteTarihi: "2025-05-06",
    resmiGazeteSayisi: "32892",
    kararTuruDosyaSonucuLabel: "Esas - Ret",
  };

  it("searches Danıştay through Bedesten, and a Danıştay chamber picks that court", async () => {
    const fetchFn = fakeFetch({
      searchDocuments: () =>
        jsonResponse({
          data: {
            total: 2777,
            emsalKararList: [
              { documentId: "1047060500", birimAdi: "6. Daire", esasNo: "2022/6753", kararNo: "2024/316", kararTarihiStr: "16.01.2024" },
            ],
          },
        }),
    });
    const result = await searchDecisions({ query: "imar planı", filters: { daire: "6. daire" } }, fetchFn);
    expect(result).toMatchObject({
      court: "danistay",
      filters: { daire: "6. Daire" },
      results: [
        {
          id: "danistay:1047060500",
          kaynak_turu: "danistay",
          mahkeme: "Danıştay 6. Daire",
          atif: "Danıştay 6. Daire, E.2022/6753 K.2024/316, T.16.01.2024",
          kaynak: "https://mevzuat.adalet.gov.tr/ictihat/1047060500",
        },
      ],
    });
    const [[, init]] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(JSON.parse((init as RequestInit).body as string).data).toMatchObject({
      itemTypeList: ["DANISTAYKARAR"],
      birimAdi: "6. Daire",
    });
  });

  it("searches individual applications with dates and sort, and reads one", async () => {
    const fetchFn = fakeFetch({
      "/api/core/public/search": () =>
        jsonResponse({ total: "1083", data: [{ ...aymRecord, icerik: "<p>T&Uuml;RKİYE CUMHURİYETİ ANAYASA MAHKEMESİ İKİNCİ BÖLÜM KARAR — başvuru incelendi.</p>" }] }),
    });
    const result = await searchDecisions(
      { query: "mülkiyet hakkı", court: "anayasa", filters: { baslangic: "2026-01-01", siralama: "yeni" } },
      fetchFn,
    );
    expect(result).toMatchObject({
      court: "anayasa",
      total: 1083,
      results: [
        {
          id: `aym:${aymRecord.id}`,
          kaynak_turu: "anayasa",
          mahkeme: "Anayasa Mahkemesi İkinci Bölüm",
          esas_no: "2021/1240",
          karar_tarihi: "03.09.2026",
          atif: "AYM, B. No: 2021/1240, K.T. 03.09.2026",
          kaynak: "https://kararlarbilgibankasi.anayasa.gov.tr/kbb/BB/2021/1240",
          baslik: "TÜLAY İRİ",
          sonuc: "Esas (İhlal)",
          konu: "Başvuru; ön alım hakkına dayalı tapu iptali",
        },
      ],
    });
    const calls = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(JSON.parse((calls[0][1] as RequestInit).body as string)).toEqual({
      kararTipi: "BireyselBasvuru",
      query: "+mülkiyet +hakkı",
      page: 1,
      size: 10,
      kararTarihiStart: "2026-01-01",
      sort: "kararTarihi",
      order: "desc",
    });

    const decision = await getDecision(`aym:${aymRecord.id}`, fetchFn);
    expect(decision).toMatchObject({
      id: `aym:${aymRecord.id}`,
      kaynak: "https://kararlarbilgibankasi.anayasa.gov.tr/kbb/BB/2021/1240",
    });
    expect(decision.metin).toMatch(/^TÜRKİYE CUMHURİYETİ/);
    expect(JSON.parse((calls[1][1] as RequestInit).body as string)).toEqual({
      kararTipi: "BireyselBasvuru",
      id: aymRecord.id,
      page: 1,
      size: 1,
    });
  });

  it("cites constitutional review by docket and decision numbers with the Official Gazette", async () => {
    const fetchFn = fakeFetch({ "/api/core/public/search": () => jsonResponse({ total: 1, data: [normRecord] }) });
    const result = await searchDecisions({ query: "kira", court: "norm", filters: { siralama: "eski" } }, fetchFn);
    expect(result.results[0]).toMatchObject({
      id: `norm:${normRecord.id}`,
      kaynak_turu: "norm",
      mahkeme: "Anayasa Mahkemesi",
      esas_no: "2024/176",
      karar_no: "2025/42",
      atif: "AYM, E.2024/176, K.2025/42, K.T. 11.02.2025",
      kaynak: "https://kararlarbilgibankasi.anayasa.gov.tr/kbb/ND/2025/42",
      resmi_gazete: "RG 06.05.2025, S. 32892",
      sonuc: "Esas - Ret",
    });
  });

  it("refuses a malformed Constitutional Court id and reports a missing decision", async () => {
    await expect(getDecision("aym:2021/1240", vi.fn() as unknown as typeof fetch)).rejects.toThrow(
      "Use a decision id returned by the case-law search.",
    );
    const fetchFn = fakeFetch({ "/api/core/public/search": () => jsonResponse({ data: [] }) });
    await expect(getDecision(`norm:${normRecord.id}`, fetchFn)).rejects.toThrow(
      /No Constitutional Court decision was found/,
    );
  });

  it("reads a Danıştay decision through Bedesten", async () => {
    const fetchFn = fakeFetch({
      getDocumentContent: () =>
        jsonResponse({ data: { content: Buffer.from("<p>Danıştay 4. Daire</p>").toString("base64"), mimeType: "text/html" } }),
    });
    await expect(getDecision("danistay:1216593200", fetchFn)).resolves.toEqual({
      id: "danistay:1216593200",
      kaynak: "https://mevzuat.adalet.gov.tr/ictihat/1216593200",
      metin: "Danıştay 4. Daire",
    });
  });
});
