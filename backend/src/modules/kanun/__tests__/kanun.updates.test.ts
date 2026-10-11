import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../../../lib/supabase";

const createTextEmbeddings = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/kanunSearch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/kanunSearch")>()),
  createTextEmbeddings,
}));

import { decideStatuteUpdate, runStatuteCheck } from "../kanun.service";

// ---------------------------------------------------------------------------
// A small in-memory stand-in for the PostgREST builder: just the calls the
// statute updater makes, with real filtering so writes can be read back.
type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function fakeDb(tables: Tables): Db {
  let nextId = 1;
  type Result = { data: unknown; error: null; count?: number };
  class Query implements PromiseLike<Result> {
    private filters: ((row: Row) => boolean)[] = [];
    private op: "select" | "update" | "delete" | "insert" | "upsert" = "select";
    private payload: Row | Row[] = {};
    private conflict: string[] = [];
    private headCount = false;
    private one: "single" | "maybe" | null = null;
    constructor(private table: string) {
      tables[table] ??= [];
    }
    select(_columns?: string, options?: { head?: boolean }) {
      this.headCount = !!options?.head;
      return this;
    }
    eq(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value);
      return this;
    }
    in(column: string, values: unknown[]) {
      this.filters.push((row) => values.includes(row[column]));
      return this;
    }
    order() {
      return this;
    }
    range() {
      return this;
    }
    insert(payload: Row | Row[]) {
      this.op = "insert";
      this.payload = payload;
      return this;
    }
    update(payload: Row) {
      this.op = "update";
      this.payload = payload;
      return this;
    }
    upsert(payload: Row, options: { onConflict: string }) {
      this.op = "upsert";
      this.payload = payload;
      this.conflict = options.onConflict.split(",");
      return this;
    }
    delete() {
      this.op = "delete";
      return this;
    }
    single() {
      this.one = "single";
      return this;
    }
    maybeSingle() {
      this.one = "maybe";
      return this;
    }
    private run(): Result {
      const rows = tables[this.table];
      const matches = rows.filter((row) => this.filters.every((f) => f(row)));
      if (this.op === "insert") {
        for (const row of Array.isArray(this.payload) ? this.payload : [this.payload]) {
          rows.push({ id: `id-${nextId++}`, ...row });
        }
        return { data: null, error: null };
      }
      if (this.op === "update") {
        for (const row of matches) Object.assign(row, this.payload);
        return { data: null, error: null };
      }
      if (this.op === "delete") {
        tables[this.table] = rows.filter((row) => !matches.includes(row));
        return { data: null, error: null };
      }
      if (this.op === "upsert") {
        const payload = this.payload as Row;
        const existing = rows.find((row) => this.conflict.every((c) => row[c] === payload[c]));
        if (existing) Object.assign(existing, payload);
        else rows.push({ id: `id-${nextId++}`, ...payload });
        return { data: null, error: null };
      }
      if (this.headCount) return { data: null, error: null, count: matches.length };
      if (this.one) return { data: matches[0] ?? null, error: null };
      return { data: matches.map((row) => ({ ...row })), error: null };
    }
    then<T1 = Result, T2 = never>(
      resolve?: ((value: Result) => T1 | PromiseLike<T1>) | null,
      reject?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
    ): PromiseLike<T1 | T2> {
      return Promise.resolve(this.run()).then(resolve, reject);
    }
  }
  return { from: (table: string) => new Query(table) } as unknown as Db;
}

// ---------------------------------------------------------------------------

const html = (articles: string) =>
  `<p>ÖRNEK KANUNU</p><p>Kanun Numarası : 9999</p>${articles}`;

const OFFICIAL = html(`
<p>Amaç</p><p>MADDE 1- (1) Amaç örnektir.</p>
<p>Süre</p><p>MADDE 2- (1) Süre iki haftadır.</p>
<p>Yeni hüküm</p><p>MADDE 3- (1) Yeni bir hüküm.</p>`);

function seed(): Tables {
  return {
    kanunlar: [
      {
        kanun_no: "9999",
        kanun_adi: "Örnek Kanunu",
        mevzuat_tur: 1,
        mevzuat_tertip: 5,
        guncellik_tarihi: null,
        son_kontrol: null,
        son_kontrol_hatasi: null,
      },
    ],
    kanun_maddeleri: [
      { id: "a1", kanun_no: "9999", kanun_adi: "Örnek Kanunu", madde_no: "1", baslik: "Amaç", icerik: "(1) Amaç örnektir." },
      { id: "a2", kanun_no: "9999", kanun_adi: "Örnek Kanunu", madde_no: "2", baslik: "Süre", icerik: "(1) Süre bir haftadır." },
    ],
    kanun_degisiklikleri: [],
    kanun_madde_arsivi: [],
  };
}

describe("statute updates", () => {
  let tables: Tables;
  let db: Db;
  const fetchHtml = vi.fn(async () => OFFICIAL);

  beforeEach(() => {
    tables = seed();
    db = fakeDb(tables);
    createTextEmbeddings.mockReset();
    createTextEmbeddings.mockImplementation(async () => [[0.1, 0.2]]);
    process.env.EMBEDDING_PROVIDER = "bge-m3";
  });

  it("records differences as pending changes without touching the index", async () => {
    const [result] = await runStatuteCheck(db, { fetchHtml, delayMs: 0 });

    expect(result).toEqual({ kanun_no: "9999", bekleyen: 2, yeni_bulunan: 2 });
    expect(tables.kanun_degisiklikleri.map((c) => [c.tur, c.madde_no, c.durum])).toEqual([
      ["degisti", "2", "beklemede"],
      ["yeni", "3", "beklemede"],
    ]);
    expect(tables.kanun_maddeleri.find((m) => m.madde_no === "2")?.icerik).toBe(
      "(1) Süre bir haftadır.",
    );
    // Not current while changes wait for review.
    expect(tables.kanunlar[0].guncellik_tarihi).toBeNull();
    expect(tables.kanunlar[0].son_kontrol).toEqual(expect.any(String));
  });

  it("does not propose the same change twice", async () => {
    await runStatuteCheck(db, { fetchHtml, delayMs: 0 });
    const [again] = await runStatuteCheck(db, { fetchHtml, delayMs: 0 });
    expect(again.yeni_bulunan).toBe(0);
    expect(tables.kanun_degisiklikleri).toHaveLength(2);
  });

  it("applies an approved change, archives the old text and embeds the article", async () => {
    await runStatuteCheck(db, { fetchHtml, delayMs: 0 });
    const change = tables.kanun_degisiklikleri.find((c) => c.madde_no === "2")!;

    const result = await decideStatuteUpdate(db, {
      id: change.id as string,
      decision: "approve",
      actorEmail: "admin@test.local",
    });

    expect(result).toEqual({ ok: true, data: { durum: "onaylandi", aranabilir: true } });
    const article = tables.kanun_maddeleri.find((m) => m.madde_no === "2")!;
    expect(article.icerik).toBe("(1) Süre iki haftadır.");
    expect(article.embedding_bge_m3).toEqual([0.1, 0.2]);
    expect(tables.kanun_madde_arsivi).toEqual([
      expect.objectContaining({ madde_no: "2", icerik: "(1) Süre bir haftadır.", degisiklik_id: change.id }),
    ]);
    expect(change).toMatchObject({ durum: "onaylandi", karar_veren: "admin@test.local" });
  });

  it("marks the law current once every change is decided, and remembers rejections", async () => {
    await runStatuteCheck(db, { fetchHtml, delayMs: 0 });
    for (const change of [...tables.kanun_degisiklikleri]) {
      await decideStatuteUpdate(db, {
        id: change.id as string,
        decision: change.madde_no === "3" ? "reject" : "approve",
        actorEmail: "admin@test.local",
      });
    }
    expect(tables.kanunlar[0].guncellik_tarihi).toBe(tables.kanunlar[0].son_kontrol);

    const [again] = await runStatuteCheck(db, { fetchHtml, delayMs: 0 });
    expect(again).toEqual({ kanun_no: "9999", bekleyen: 0, yeni_bulunan: 0 });
  });

  it("refuses a change computed against text that has moved since", async () => {
    await runStatuteCheck(db, { fetchHtml, delayMs: 0 });
    tables.kanun_maddeleri.find((m) => m.madde_no === "2")!.icerik = "(1) Elle düzeltildi.";
    const change = tables.kanun_degisiklikleri.find((c) => c.madde_no === "2")!;

    const result = await decideStatuteUpdate(db, {
      id: change.id as string,
      decision: "approve",
      actorEmail: "admin@test.local",
    });
    expect(result).toMatchObject({ ok: false, kind: "conflict" });
    expect(tables.kanun_madde_arsivi).toHaveLength(0);
  });

  it("keeps the article when embedding fails, and says it is not searchable yet", async () => {
    await runStatuteCheck(db, { fetchHtml, delayMs: 0 });
    createTextEmbeddings.mockImplementation(async () => {
      throw new Error("ollama down");
    });
    const change = tables.kanun_degisiklikleri.find((c) => c.madde_no === "3")!;
    const result = await decideStatuteUpdate(db, {
      id: change.id as string,
      decision: "approve",
      actorEmail: "admin@test.local",
    });
    expect(result).toEqual({ ok: true, data: { durum: "onaylandi", aranabilir: false } });
    expect(tables.kanun_maddeleri.find((m) => m.madde_no === "3")?.icerik).toBe("(1) Yeni bir hüküm.");
  });

  it("records a failed fetch on the law instead of throwing", async () => {
    const [result] = await runStatuteCheck(db, {
      fetchHtml: async () => {
        throw new Error("mevzuat.gov.tr returned 503 for law 9999");
      },
      delayMs: 0,
    });
    expect(result.hata).toMatch(/503/);
    expect(tables.kanunlar[0].son_kontrol_hatasi).toMatch(/503/);
    expect(tables.kanun_degisiklikleri).toHaveLength(0);
  });
});
