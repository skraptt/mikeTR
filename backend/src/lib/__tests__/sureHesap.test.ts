import { describe, expect, it } from "vitest";
import { SureHesabiHatasi, sureHesapla, tarihYazisi } from "../sureHesap";

const son = (args: Parameters<typeof sureHesapla>[0]) => sureHesapla(args).sonGun;

describe("sureHesapla", () => {
  it("counts days from the day after notification (HMK md. 92)", () => {
    // Cuma tebliğ, 10 gün: Pazartesi.
    expect(son({ baslangic: "2026-10-16", sure: 10, birim: "gun", rejim: "hmk" })).toBe("2026-10-26");
  });

  it("moves a last day on a weekend to the next working day (HMK md. 93)", () => {
    const r = sureHesapla({ baslangic: "2026-10-14", sure: 3, birim: "gun", rejim: "hmk" });
    expect(r.sonGun).toBe("2026-10-19");
    expect(r.adimlar.join(" ")).toContain("HMK md. 93");
    expect(r.uyarilar.join(" ")).toContain("Cumartesi ve Pazar");
  });

  it("ends a week-based period on the same weekday and flags the 28 Ekim half day", () => {
    const r = sureHesapla({ baslangic: "2026-10-14", sure: 2, birim: "hafta", rejim: "hmk" });
    expect(r.sonGun).toBe("2026-10-28");
    expect(r.uyarilar.join(" ")).toContain("Cumhuriyet Bayramı arifesi");
  });

  it("extends a period ending in the judicial recess by a week (HMK md. 104)", () => {
    const r = sureHesapla({ baslangic: "2026-07-10", sure: 2, birim: "hafta", rejim: "hmk" });
    expect(r.sonGun).toBe("2026-09-07");
    expect(r.adimlar.join(" ")).toContain("HMK md. 104");
  });

  it("moves the extended day off a weekend too", () => {
    // 7 Eylül 2024 Cumartesi.
    expect(son({ baslangic: "2024-07-15", sure: 2, birim: "hafta", rejim: "hmk" })).toBe("2024-09-09");
  });

  it("extends when the move off a weekend lands in the recess", () => {
    // 18 Temmuz 2026 Cumartesi -> 20 Temmuz Pazartesi, adli tatilde.
    expect(son({ baslangic: "2026-07-08", sure: 10, birim: "gun", rejim: "hmk" })).toBe("2026-09-07");
    // Adli tatile tabi olmayan işte uzamaz.
    expect(son({ baslangic: "2026-07-08", sure: 10, birim: "gun", rejim: "hmk", adliTatileTabi: false })).toBe("2026-07-20");
  });

  it("extends criminal procedure periods by three days (CMK md. 331/4)", () => {
    const r = sureHesapla({ baslangic: "2026-07-10", sure: 2, birim: "hafta", rejim: "cmk" });
    expect(r.sonGun).toBe("2026-09-03");
    expect(r.adimlar.join(" ")).toContain("CMK md. 331/4");
  });

  it("does not apply the recess to enforcement periods and skips religious holidays (İİK md. 19)", () => {
    // 27 Mayıs 2026 Kurban Bayramı'nın ilk günü; bayram Cumartesi biter, ardından Pazar.
    const r = sureHesapla({ baslangic: "2026-05-20", sure: 7, birim: "gun", rejim: "iik" });
    expect(r.sonGun).toBe("2026-06-01");
    expect(r.adimlar.join(" ")).toContain("Kurban Bayramı");
    expect(son({ baslangic: "2026-07-20", sure: 7, birim: "gun", rejim: "iik" })).toBe("2026-07-27");
  });

  it("ends a month-based period on the last day of a shorter month", () => {
    // 31 Ocak + 1 ay -> 28 Şubat 2026 Cumartesi -> 2 Mart Pazartesi.
    const r = sureHesapla({ baslangic: "2026-01-31", sure: 1, birim: "ay", rejim: "tbk" });
    expect(r.sonGun).toBe("2026-03-02");
    expect(r.adimlar[0]).toContain("ayın son günü");
  });

  it("flags a religious holiday eve and years without holiday dates", () => {
    expect(sureHesapla({ baslangic: "2026-03-05", sure: 2, birim: "hafta", rejim: "hmk" }).uyarilar.join(" ")).toContain(
      "Ramazan Bayramı arifesi",
    );
    expect(sureHesapla({ baslangic: "2027-12-20", sure: 1, birim: "ay", rejim: "hmk" }).uyarilar.join(" ")).toContain(
      "2028 yılının",
    );
  });

  it("rejects invalid input", () => {
    expect(() => sureHesapla({ baslangic: "2026-02-30", sure: 1, birim: "gun", rejim: "hmk" })).toThrow(SureHesabiHatasi);
    expect(() => sureHesapla({ baslangic: "2026-02-01", sure: 0, birim: "gun", rejim: "hmk" })).toThrow(SureHesabiHatasi);
  });

  it("names dates in Turkish", () => {
    expect(tarihYazisi("2026-09-07")).toBe("7 Eylül 2026 Pazartesi");
  });
});

describe("calculate_deadline tool", () => {
  it("returns the last day with steps, and an error instead of throwing on bad input", async () => {
    const { runSureHesabi } = await import("../../modules/chat/engine/tools/hesapTools");
    const ok = JSON.parse(runSureHesabi({ baslangic: "2026-07-10", sure: 2, birim: "hafta", rejim: "hmk" }));
    expect(ok).toMatchObject({ son_gun: "2026-09-07", son_gun_yazili: "7 Eylül 2026 Pazartesi" });
    expect(ok.adimlar.length).toBeGreaterThan(1);
    expect(JSON.parse(runSureHesabi({ baslangic: "dün", sure: 2, birim: "hafta", rejim: "hmk" }))).toHaveProperty("hata");
  });
});
