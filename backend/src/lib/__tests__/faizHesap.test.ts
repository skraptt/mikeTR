import { describe, expect, it } from "vitest";
import { FaizHesabiHatasi, faizHesapla } from "../faizHesap";

const oranlar = (r: ReturnType<typeof faizHesapla>) => r.donemler.map((d) => [d.baslangic, d.bitis, d.gun, d.oran]);

describe("faizHesapla", () => {
  it("splits statutory interest at the 1 June 2024 rise from 9% to 24%", () => {
    const r = faizHesapla({ anapara: 100_000, baslangic: "2024-01-01", bitis: "2024-12-31", tur: "kanuni" });
    expect(oranlar(r)).toEqual([
      ["2024-01-01", "2024-06-01", 152, 9],
      ["2024-06-01", "2024-12-31", 213, 24],
    ]);
    // 100.000 × %9 × 152/365 + 100.000 × %24 × 213/365
    expect(r.donemler.map((d) => d.faiz)).toEqual([3747.95, 14005.48]);
    expect(r.toplamFaiz).toBe(17753.43);
    expect(r.toplam).toBe(117753.43);
  });

  it("applies 80% of the rediscount rate from 31 July 2026 (Law 7589)", () => {
    const r = faizHesapla({ anapara: 100_000, baslangic: "2026-07-01", bitis: "2026-09-01", tur: "kanuni" });
    expect(oranlar(r)).toEqual([
      ["2026-07-01", "2026-07-31", 30, 24],
      ["2026-07-31", "2026-09-01", 32, 31],
    ]);
    expect(r.donemler[1].dayanak).toContain("%38,75");
  });

  it("uses the advance rate for commercial default, switching mid-year on a five-point change", () => {
    const r = faizHesapla({ anapara: 100_000, baslangic: "2024-01-01", bitis: "2025-01-01", tur: "ticari" });
    // 31.12.2023 avans %44,25; 30.06.2024 %51,75 (7,5 puan fark).
    expect(oranlar(r)).toEqual([
      ["2024-01-01", "2024-07-01", 182, 44.25],
      ["2024-07-01", "2025-01-01", 184, 51.75],
    ]);
  });

  it("treats exactly five points as enough for the second half (2025)", () => {
    // 31.12.2024 avans %49,25; 30.06.2025 %44,25.
    const r = faizHesapla({ anapara: 1000, baslangic: "2025-06-01", bitis: "2025-08-01", tur: "ticari" });
    expect(r.donemler.map((d) => d.oran)).toEqual([49.25, 44.25]);
  });

  it("warns past the date the TCMB table was checked", () => {
    const r = faizHesapla({ anapara: 1000, baslangic: "2026-10-01", bitis: "2027-03-01", tur: "kanuni" });
    expect(r.uyarilar.join(" ")).toContain("TCMB oranlarında değişiklik");
  });

  it("rejects bad input", () => {
    expect(() => faizHesapla({ anapara: 0, baslangic: "2024-01-01", bitis: "2024-02-01", tur: "kanuni" })).toThrow(FaizHesabiHatasi);
    expect(() => faizHesapla({ anapara: 10, baslangic: "2024-02-01", bitis: "2024-01-01", tur: "kanuni" })).toThrow(FaizHesabiHatasi);
    expect(() => faizHesapla({ anapara: 10, baslangic: "2005-01-01", bitis: "2024-01-01", tur: "kanuni" })).toThrow(FaizHesabiHatasi);
  });
});

describe("calculate_interest tool", () => {
  it("returns the total and periods, and an error instead of throwing", async () => {
    const { runFaizHesabi, HESAP_TOOLS } = await import("../../modules/chat/engine/tools/hesapTools");
    expect(HESAP_TOOLS.map((t) => t.function.name)).toEqual(["calculate_deadline", "calculate_interest"]);
    const ok = JSON.parse(runFaizHesabi({ anapara: 100000, baslangic: "2024-01-01", bitis: "2024-12-31", tur: "kanuni" }));
    expect(ok).toMatchObject({ toplam_faiz: 17753.43, toplam: 117753.43 });
    expect(JSON.parse(runFaizHesabi({ anapara: -1, baslangic: "2024-01-01", bitis: "2024-12-31", tur: "kanuni" }))).toHaveProperty("hata");
  });
});
