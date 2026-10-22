import { describe, expect, it } from "vitest";
import { HarcHesabiHatasi, harcHesapla } from "../harcHesap";

describe("harcHesapla", () => {
  it("charges the application fee and a quarter of the proportional fee on a money claim", () => {
    const r = harcHesapla({ mahkeme: "asliye", deger: 1_000_000 });
    // 1.000.000 × binde 68,31 = 68.310; dörtte biri 17.077,50.
    expect(r.kalemler.map((k) => k.tutar)).toEqual([732, 17077.5]);
    expect(r.acilistaOdenecek).toBe(17809.5);
    expect(r.kalanKararHarci).toBe(51232.5);
  });

  it("applies the minimum proportional fee to small claims", () => {
    const r = harcHesapla({ mahkeme: "sulh", deger: 5_000 });
    // 341,55 < 427,60: asgari harç; dörtte biri 106,90.
    expect(r.kalemler.map((k) => k.tutar)).toEqual([335.2, 106.9]);
    expect(r.kalemler[1].dayanak).toContain("asgari tutar");
  });

  it("takes a twentieth in advance for death and bodily injury claims (md. 28/a)", () => {
    expect(harcHesapla({ mahkeme: "asliye", deger: 1_000_000, olumCismaniZarar: true }).kalemler[1].tutar).toBe(3415.5);
  });

  it("charges the fixed fee when the claim has no money value", () => {
    const r = harcHesapla({ mahkeme: "asliye" });
    expect(r.acilistaOdenecek).toBe(1464);
    expect(r.kalanKararHarci).toBe(0);
  });

  it("rejects bad input", () => {
    expect(() => harcHesapla({ mahkeme: "yargitay" as never })).toThrow(HarcHesabiHatasi);
    expect(() => harcHesapla({ mahkeme: "asliye", deger: -5 })).toThrow(HarcHesabiHatasi);
  });
});

describe("calculate_court_fees tool", () => {
  it("returns the items and totals, and an error instead of throwing", async () => {
    const { runHarcHesabi } = await import("../../modules/chat/engine/tools/hesapTools");
    expect(JSON.parse(runHarcHesabi({ mahkeme: "asliye", deger: 1000000 }))).toMatchObject({ acilista_odenecek: 17809.5 });
    expect(JSON.parse(runHarcHesabi({ mahkeme: "ağır ceza" }))).toHaveProperty("hata");
  });
});
