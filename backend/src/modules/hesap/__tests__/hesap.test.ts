import { describe, expect, it } from "vitest";
import { faizHesabi, harcHesabi, sureHesabi } from "../hesap.service";
import { runHesapAraci } from "../../chat/engine/tools/hesapTools";

describe("hesap service", () => {
  it("calculates a deadline and reports bad input as a validation failure", () => {
    const r = sureHesabi({ baslangic: "2026-07-10", sure: 2, birim: "hafta", rejim: "hmk" });
    expect(r).toMatchObject({ ok: true, data: { sonGun: "2026-09-07" } });
    expect(sureHesabi({ baslangic: "dün", sure: 2, birim: "hafta", rejim: "hmk" })).toMatchObject({ ok: false, kind: "validation" });
    expect(sureHesabi(null)).toMatchObject({ ok: false, kind: "validation" });
  });

  it("calculates interest with the date the rate table was checked", () => {
    const r = faizHesabi({ anapara: 100000, baslangic: "2024-01-01", bitis: "2024-12-31", tur: "kanuni" });
    expect(r).toMatchObject({ ok: true, data: { toplamFaiz: 17753.43 } });
    expect(r.ok && r.data.tabloTarihi).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(faizHesabi({ anapara: "x", baslangic: "2024-01-01", bitis: "2024-12-31", tur: "kanuni" })).toMatchObject({ ok: false });
  });

  it("calculates court fees, treating an empty value as a claim without money value", () => {
    expect(harcHesabi({ mahkeme: "asliye", deger: 1000000 })).toMatchObject({ ok: true, data: { acilistaOdenecek: 17809.5, tarifeYili: 2026 } });
    expect(harcHesabi({ mahkeme: "asliye", deger: "" })).toMatchObject({ ok: true, data: { acilistaOdenecek: 1464 } });
    expect(harcHesabi({ mahkeme: "ağır ceza" })).toMatchObject({ ok: false, kind: "validation" });
  });
});

describe("runHesapAraci", () => {
  it("returns the model's JSON and a result card", () => {
    const sure = runHesapAraci("calculate_deadline", { baslangic: "2026-07-10", sure: 2, birim: "hafta", rejim: "hmk", adli_tatile_tabi: false });
    expect(JSON.parse(sure.content)).toMatchObject({ son_gun: "2026-07-24" });
    expect(sure.event).toMatchObject({ type: "hesap_sonucu", arac: "sure", sonuc: { sonGun: "2026-07-24" } });
    const harc = runHesapAraci("calculate_court_fees", { mahkeme: "asliye", deger: 1000000, olum_cismani_zarar: true });
    expect(harc.event).toMatchObject({ arac: "harc", sonuc: { kalemler: [{ tutar: 732 }, { tutar: 3415.5 }] } });
  });

  it("shows no card for invalid input", () => {
    const r = runHesapAraci("calculate_interest", { anapara: -1, baslangic: "2024-01-01", bitis: "2024-02-01", tur: "kanuni" });
    expect(r.event).toBeNull();
    expect(JSON.parse(r.content)).toHaveProperty("hata");
  });
});
