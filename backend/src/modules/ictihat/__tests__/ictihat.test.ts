import { describe, expect, it, vi } from "vitest";
import { readCaseLawDecision, searchCaseLaw } from "../ictihat.service";
import { runGetKarar, runIctihatSearch } from "../../chat/engine/tools/ictihatTools";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const yargitayHit = {
  documentId: "1065746300",
  birimAdi: "12. Hukuk Dairesi",
  esasNo: "2023/8563",
  kararNo: "2024/4902",
  kararTarihiStr: "16.05.2024",
};

function sources(options: { yargitay?: number; emsal?: number } = {}) {
  return vi.fn(async (url: string | URL | Request) => {
    const target = String(url);
    if (target.includes("searchDocuments")) {
      return options.yargitay
        ? jsonResponse({}, options.yargitay)
        : jsonResponse({ data: { total: 1, emsalKararList: [yargitayHit] } });
    }
    if (target.includes("aramalist")) {
      return options.emsal ? jsonResponse({}, options.emsal) : jsonResponse({ data: { recordsTotal: 0, data: [] } });
    }
    if (target.includes("getDocumentContent")) {
      return jsonResponse({
        data: { content: Buffer.from("<p>Gereği düşünüldü.</p>").toString("base64"), mimeType: "text/html" },
      });
    }
    throw new Error(`unexpected ${target}`);
  }) as unknown as typeof fetch;
}

describe("searchCaseLaw", () => {
  it.each([
    [{ query: "  " }, "Enter a search query."],
    [{ query: "a".repeat(301) }, "The search query is too long."],
    [{ query: "?!" }, "The search query needs at least one letter or digit."],
  ])("rejects %j", async (body, detail) => {
    await expect(searchCaseLaw(body, sources())).resolves.toEqual({ ok: false, kind: "validation", detail });
  });

  it("returns the hits with the court and page it searched", async () => {
    const result = await searchCaseLaw({ query: " temerrüt ", court: "yargitay", page: "2" }, sources());
    expect(result).toMatchObject({
      ok: true,
      data: {
        query: "temerrüt",
        court: "yargitay",
        page: 2,
        filters: {},
        total: 1,
        results: [{ id: "yargitay:1065746300" }],
      },
    });
  });

  it("passes string filters and rejects invalid ones", async () => {
    const result = await searchCaseLaw(
      { query: "temerrüt", filters: { daire: "3. Hukuk Dairesi", bitis: 7, siralama: "yeni" } },
      sources(),
    );
    expect(result).toMatchObject({
      ok: true,
      data: { court: "yargitay", filters: { daire: "3. Hukuk Dairesi", siralama: "yeni" } },
    });
    await expect(
      searchCaseLaw({ query: "temerrüt", filters: { baslangic: "dün" } }, sources()),
    ).resolves.toEqual({ ok: false, kind: "validation", detail: "Dates must be YYYY-MM-DD: dün." });
  });

  it("falls back to adli for an unknown court", async () => {
    const result = await searchCaseLaw({ query: "temerrüt", court: "ceza" }, sources());
    expect(result).toMatchObject({ ok: true, data: { court: "adli" } });
  });

  it("reports sources that are down as unavailable", async () => {
    const result = await searchCaseLaw({ query: "temerrüt" }, sources({ yargitay: 503, emsal: 502 }));
    expect(result).toMatchObject({ ok: false, kind: "unavailable" });
  });
});

describe("readCaseLawDecision", () => {
  it("returns the decision text", async () => {
    await expect(readCaseLawDecision("yargitay:1065746300", sources())).resolves.toEqual({
      ok: true,
      data: {
        id: "yargitay:1065746300",
        kaynak: "https://mevzuat.adalet.gov.tr/ictihat/1065746300",
        metin: "Gereği düşünüldü.",
      },
    });
  });

  it("refuses an id the search did not produce", async () => {
    await expect(readCaseLawDecision("abc", sources())).resolves.toMatchObject({
      ok: false,
      kind: "unavailable",
    });
  });
});

describe("case-law chat tools", () => {
  it("gives the model citations and an event for the UI, then labels the read decision", async () => {
    const fetchFn = sources();
    const search = await runIctihatSearch({ query: "kiracının temerrüdü", court: "yargitay" }, fetchFn);

    expect(search.event).toMatchObject({
      type: "ictihat_search",
      court: "yargitay",
      results: [{ atif: "Yargıtay 12. Hukuk Dairesi, E.2023/8563 K.2024/4902, T.16.05.2024" }],
    });
    const content = JSON.parse(search.content);
    expect(content.results[0]).not.toHaveProperty("kaynak_turu");
    expect(content.note).toMatch(/get_karar/);

    const read = await runGetKarar({ id: "yargitay:1065746300" }, fetchFn);
    expect(read.event).toEqual({
      type: "ictihat_karar",
      id: "yargitay:1065746300",
      atif: "Yargıtay 12. Hukuk Dairesi, E.2023/8563 K.2024/4902, T.16.05.2024",
      kaynak: "https://mevzuat.adalet.gov.tr/ictihat/1065746300",
    });
    expect(JSON.parse(read.content)).toMatchObject({ ok: true, metin: "Gereği düşünüldü." });
  });

  it("tells the model to broaden an empty search", async () => {
    const search = await runIctihatSearch({ query: "temerrüt", court: "emsal" }, sources());
    expect(JSON.parse(search.content).note).toMatch(/fewer or more general terms/);
  });

  it("turns failures into errors the model must not paper over", async () => {
    const search = await runIctihatSearch({ query: "" }, sources());
    expect(search.event.error).toBe("query is required");
    expect(JSON.parse(search.content).error).toMatch(/do not cite any decision/);

    const read = await runGetKarar({ id: "x" }, sources());
    expect(read.event).toMatchObject({ error: "Use a decision id returned by the case-law search.", kaynak: null });
  });
});
