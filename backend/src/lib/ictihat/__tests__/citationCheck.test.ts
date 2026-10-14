import { describe, expect, it, vi } from "vitest";
import type { Db } from "../../supabase";
import { caseKey, checkCaseCitations, extractCaseCitations, hitKey } from "../citationCheck";
import {
  buildIctihatCitationsEvent,
  retrievedDecisions,
} from "../../../modules/chat/engine/tools/ictihatTools";

const yargitayHit = {
  id: "yargitay:1",
  kaynak_turu: "yargitay" as const,
  mahkeme: "Yargıtay 3. Hukuk Dairesi",
  esas_no: "2022/1258",
  karar_no: "2022/3089",
  karar_tarihi: "04.04.2022",
  durum: null,
  atif: "Yargıtay 3. Hukuk Dairesi, E.2022/1258 K.2022/3089, T.04.04.2022",
  kaynak: "https://mevzuat.adalet.gov.tr/ictihat/1",
};
const aymHit = {
  ...yargitayHit,
  id: "aym:891e2b7d-6bf8-ccc6-91db-b18f2c4377d6",
  kaynak_turu: "anayasa" as const,
  esas_no: "2021/1240",
  karar_no: "",
  atif: "AYM, B. No: 2021/1240, K.T. 03.09.2026",
};
const emsalHit = {
  ...yargitayHit,
  id: "567892800",
  kaynak_turu: "emsal" as const,
  esas_no: "2018/253",
  karar_no: "2019/1099",
  atif: "İstanbul 18. Asliye Ticaret Mahkemesi, E.2018/253 K.2019/1099, T.19.12.2019",
};

describe("extractCaseCitations", () => {
  it("reads the citation styles lawyers and the courts use", () => {
    const text = [
      "Yargıtay 3. Hukuk Dairesi'nin E.2022/1258 K.2022/3089 sayılı kararında…",
      "Danıştay 6. Daire, E. 2022/6753, K. 2024/316 ve",
      "Esas No: 2018/253 Karar No: 2019/1099 olan karar",
      "12. Hukuk Dairesi 2023/8563 E. , 2024/4902 K.",
      "(AYM, B. No: 2021/1240, K.T. 03.09.2026)",
      "Başvuru Numarası: 2019/27727",
      "AYM, E.2024/176, K.2025/42",
      "Tekrar: E.2022/1258 K.2022/3089",
    ].join("\n");
    expect(extractCaseCitations(text).map((c) => [c.key, c.label])).toEqual([
      ["E:2022/1258|K:2022/3089", "Yargıtay 3. Hukuk Dairesi'nin E.2022/1258 K.2022/3089"],
      ["E:2022/6753|K:2024/316", "Danıştay 6. Daire, E. 2022/6753, K. 2024/316"],
      ["E:2018/253|K:2019/1099", "Esas No: 2018/253 Karar No: 2019/1099"],
      ["E:2023/8563|K:2024/4902", "2023/8563 E. , 2024/4902 K."],
      ["B:2021/1240", "AYM, B. No: 2021/1240"],
      ["B:2019/27727", "Başvuru Numarası: 2019/27727"],
      ["E:2024/176|K:2025/42", "AYM, E.2024/176, K.2025/42"],
    ]);
  });

  it("ignores statute citations, dates and amendment notes", () => {
    expect(
      extractCaseCitations("TBK md. 315 uyarınca, 16.05.2024 tarihinde, (Mülga:16/7/2026-7589/19 md.)"),
    ).toEqual([]);
  });

  it("normalizes leading zeros so the same decision matches", () => {
    expect(caseKey({ esas: "2022/01258", karar: "2022/3089" })).toBe("E:2022/1258|K:2022/3089");
    expect(caseKey({ esas: "2022/1258", karar: "" })).toBeNull();
    expect(hitKey(aymHit)).toBe("B:2021/1240");
    expect(hitKey(emsalHit)).toBe("E:2018/253|K:2019/1099");
  });
});

describe("checkCaseCitations", () => {
  const retrieved = retrievedDecisions([
    { type: "ictihat_search", query: "kira", court: "adli", total: 3, results: [yargitayHit, aymHit, emsalHit] },
    { type: "ictihat_karar", id: "yargitay:1", atif: yargitayHit.atif, kaynak: yargitayHit.kaynak },
    { type: "ictihat_karar", id: aymHit.id, atif: null, kaynak: null, error: "down" },
  ]);

  it("separates read, merely found and unsourced decisions", () => {
    const text =
      "Yargıtay (E.2022/1258 K.2022/3089) böyle dedi; AYM ise (B. No: 2021/1240) ve bir başka karar E.2020/1 K.2020/2.";
    expect(checkCaseCitations(text, retrieved)).toEqual([
      {
        label: yargitayHit.atif,
        esas_no: "2022/1258",
        karar_no: "2022/3089",
        basvuru_no: null,
        status: "dogrulandi",
      },
      // The read failed, so the decision was only seen in the search.
      { label: aymHit.atif, esas_no: null, karar_no: null, basvuru_no: "2021/1240", status: "okunmadi" },
      { label: "E.2020/1 K.2020/2", esas_no: "2020/1", karar_no: "2020/2", basvuru_no: null, status: "kaynaksiz" },
    ]);
  });
});

describe("buildIctihatCitationsEvent", () => {
  function chatDb(rows: { content: unknown }[]) {
    const query = {
      select: () => query,
      eq: () => query,
      then: (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null }),
    };
    return { from: vi.fn(() => query) } as unknown as Db;
  }

  it("counts searches and reads from earlier messages in the chat", async () => {
    const db = chatDb([
      {
        content: [
          { type: "content", text: "…" },
          { type: "ictihat_search", query: "kira", court: "adli", total: 1, results: [emsalHit] },
          { type: "ictihat_karar", id: emsalHit.id, atif: emsalHit.atif, kaynak: emsalHit.kaynak },
        ],
      },
      { content: "plain text" },
    ]);
    const event = await buildIctihatCitationsEvent(db, "Bkz. E.2018/253 K.2019/1099.", [], "chat-1");
    expect(event).toEqual({
      type: "ictihat_citations",
      citations: [expect.objectContaining({ label: emsalHit.atif, status: "dogrulandi" })],
    });
  });

  it("returns nothing for an answer without decision citations", async () => {
    await expect(buildIctihatCitationsEvent(chatDb([]), "TBK md. 315.", [], null)).resolves.toBeNull();
  });

  it("still checks the turn when earlier messages cannot be read", async () => {
    const query = {
      select: () => query,
      eq: () => query,
      then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: { message: "down" } }),
    };
    const db = { from: () => query } as unknown as Db;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const event = await buildIctihatCitationsEvent(
      db,
      "E.2022/1258 K.2022/3089",
      [{ type: "ictihat_search", query: "kira", court: "adli", total: 1, results: [yargitayHit] } as never],
      "chat-1",
    );
    expect(event?.citations[0].status).toBe("okunmadi");
    spy.mockRestore();
  });
});
