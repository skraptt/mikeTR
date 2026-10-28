import { describe, expect, it } from "vitest";
import { hizmetSuresi, tazminatHesapla } from "../tazminatHesap";
import { runHesapAraci } from "../../modules/chat/engine/tools/hesapTools";

const gun = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("hizmetSuresi", () => {
  it("counts both the start and the end day", () => {
    expect(hizmetSuresi(gun("2020-01-01"), gun("2020-12-31"))).toEqual({ yil: 1, ay: 0, gun: 0 });
    expect(hizmetSuresi(gun("2021-03-15"), gun("2026-08-20"))).toEqual({ yil: 5, ay: 5, gun: 6 });
    expect(hizmetSuresi(gun("2024-02-10"), gun("2024-03-09"))).toEqual({ yil: 0, ay: 1, gun: 0 });
  });
});

describe("tazminatHesapla", () => {
  it("calculates severance below the ceiling with stamp duty, and notice pay", () => {
    const r = tazminatHesapla({ giris: "2021-03-15", cikis: "2026-08-20", brutUcret: 60000 });
    // 60.000 × 5 + 60.000/12 × 5 + 60.000/365 × 6
    expect(r.kalemler[0]).toMatchObject({ kalem: "Kıdem tazminatı", brut: 325986.3, gelirVergisi: 0, damgaVergisi: 2474.24, net: 323512.06 });
    expect(r.ihbarSuresiHafta).toBe(8);
    // 60.000 / 30 × 56 gün = 112.000; %15 gelir vergisi, binde 7,59 damga
    expect(r.kalemler[1]).toMatchObject({ kalem: "İhbar tazminatı", brut: 112000, gelirVergisi: 16800, damgaVergisi: 850.08, net: 94349.92 });
    expect(r.toplamNet).toBe(417861.98);
  });

  it("caps the wage at the ceiling in force on the end date", () => {
    const temmuz = tazminatHesapla({ giris: "2020-01-01", cikis: "2026-07-01", brutUcret: 100000, ihbar: false });
    expect(temmuz).toMatchObject({ tavan: 73729.87, tavanBaslangici: "2026-07-01", esasUcret: 73729.87 });
    const haziran = tazminatHesapla({ giris: "2020-01-01", cikis: "2026-06-30", brutUcret: 100000, ihbar: false });
    expect(haziran).toMatchObject({ tavan: 64948.77, esasUcret: 64948.77 });
    expect(haziran.kalemler).toHaveLength(1);
    expect(haziran.kalemler[0].brut).toBe(422167.01);
  });

  it("gives no severance under one year and applies the notice period scale", () => {
    const r = tazminatHesapla({ giris: "2026-01-01", cikis: "2026-05-31", brutUcret: 30000 });
    expect(r.kalemler.map((k) => k.kalem)).toEqual(["İhbar tazminatı"]);
    expect(r.ihbarSuresiHafta).toBe(2);
    expect(r.adimlar.join(" ")).toContain("bir yıldan az");
    const hafta = (giris: string, cikis: string) => tazminatHesapla({ giris, cikis, brutUcret: 30000 }).ihbarSuresiHafta;
    expect(hafta("2026-01-01", "2026-06-30")).toBe(4);
    expect(hafta("2024-01-01", "2025-06-30")).toBe(6);
    expect(hafta("2023-01-01", "2025-12-31")).toBe(6);
    expect(hafta("2023-01-01", "2026-01-01")).toBe(8);
  });

  it("rejects bad input", () => {
    expect(() => tazminatHesapla({ giris: "2026-02-30", cikis: "2026-03-01", brutUcret: 1 })).toThrow("geçerli bir tarih");
    expect(() => tazminatHesapla({ giris: "2026-03-01", cikis: "2026-01-01", brutUcret: 1 })).toThrow("önce olamaz");
    expect(() => tazminatHesapla({ giris: "2020-01-01", cikis: "2021-06-01", brutUcret: 1 })).toThrow("tavan tablosu");
    expect(() => tazminatHesapla({ giris: "2025-01-01", cikis: "2026-01-01", brutUcret: 0 })).toThrow("Brüt ücret");
  });
});

describe("calculate_severance tool", () => {
  it("returns the model's JSON and a result card", () => {
    const r = runHesapAraci("calculate_severance", { giris: "2021-03-15", cikis: "2026-08-20", brut_ucret: 60000, ihbar: false });
    expect(JSON.parse(r.content)).toMatchObject({ hizmet_suresi: "5 yıl 5 ay 6 gün", toplam_brut: 325986.3 });
    expect(r.event).toMatchObject({ type: "hesap_sonucu", arac: "kidem", sonuc: { toplamBrut: 325986.3 } });
    expect(JSON.parse(runHesapAraci("calculate_severance", { giris: "x", cikis: "2026-01-01", brut_ucret: 1 }).content)).toHaveProperty("hata");
  });
});
