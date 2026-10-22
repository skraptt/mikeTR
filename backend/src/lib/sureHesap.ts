// mikeTR: yasal sürelerin son gününü hesaplar.
//
// Kurallar kanun metinlerinden alınmıştır ve her adım dayandığı maddeyle
// açıklanır: HMK md. 92-93 ve 102-104, İİK md. 19, CMK md. 39 ve 331, TBK
// md. 92-93. Resmî tatiller 2429 sayılı Kanun'a, dini bayram tarihleri
// Diyanet takvimine göredir (aşağıdaki tablo). Hesap bir yardımcıdır;
// sonucu kullanmadan önce kontrol edilmelidir.

export type SureBirimi = "gun" | "hafta" | "ay" | "yil";
export type SureRejimi = "hmk" | "iik" | "cmk" | "tbk";

export type SureHesabiGirdisi = {
  /** Sürenin başladığı gün (tebliğ, tefhim veya sözleşme tarihi), YYYY-MM-DD. */
  baslangic: string;
  sure: number;
  birim: SureBirimi;
  rejim: SureRejimi;
  /**
   * Dava veya iş adli tatile tabi mi (HMK md. 103'te sayılanlar ve tutuklu
   * işler tabi değildir). Yalnızca HMK ve CMK için; varsayılan: tabi.
   */
  adliTatileTabi?: boolean;
};

export type SureHesabiSonucu = {
  baslangic: string;
  /** Sürenin son günü, YYYY-MM-DD. */
  sonGun: string;
  sonGunAdi: string;
  adimlar: string[];
  uyarilar: string[];
};

export class SureHesabiHatasi extends Error {}

// ---------------------------------------------------------------------------
// Takvim

// Dini bayramlar (Diyanet takvimi). Arife günü öğleden sonra yarım gün tatildir.
const DINI_BAYRAMLAR: Record<number, { ad: string; arife: string; gunler: string[] }[]> = {
  2024: [
    { ad: "Ramazan Bayramı", arife: "2024-04-09", gunler: ["2024-04-10", "2024-04-11", "2024-04-12"] },
    { ad: "Kurban Bayramı", arife: "2024-06-15", gunler: ["2024-06-16", "2024-06-17", "2024-06-18", "2024-06-19"] },
  ],
  2025: [
    { ad: "Ramazan Bayramı", arife: "2025-03-29", gunler: ["2025-03-30", "2025-03-31", "2025-04-01"] },
    { ad: "Kurban Bayramı", arife: "2025-06-05", gunler: ["2025-06-06", "2025-06-07", "2025-06-08", "2025-06-09"] },
  ],
  2026: [
    { ad: "Ramazan Bayramı", arife: "2026-03-19", gunler: ["2026-03-20", "2026-03-21", "2026-03-22"] },
    { ad: "Kurban Bayramı", arife: "2026-05-26", gunler: ["2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30"] },
  ],
  2027: [
    { ad: "Ramazan Bayramı", arife: "2027-03-08", gunler: ["2027-03-09", "2027-03-10", "2027-03-11"] },
    { ad: "Kurban Bayramı", arife: "2027-05-15", gunler: ["2027-05-16", "2027-05-17", "2027-05-18", "2027-05-19"] },
  ],
};
export const BAYRAM_TABLOSU_YILLARI = Object.keys(DINI_BAYRAMLAR).map(Number);

// 2429 sayılı Kanun md. 1-2: ulusal bayram ve genel tatiller (ay-gün).
const SABIT_TATILLER: Record<string, string> = {
  "01-01": "Yılbaşı",
  "04-23": "Ulusal Egemenlik ve Çocuk Bayramı",
  "05-01": "Emek ve Dayanışma Günü",
  "05-19": "Atatürk'ü Anma, Gençlik ve Spor Bayramı",
  "07-15": "Demokrasi ve Millî Birlik Günü",
  "08-30": "Zafer Bayramı",
  "10-29": "Cumhuriyet Bayramı",
};

const GUN_ADLARI = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const AY_ADLARI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

type Gun = { y: number; m: number; d: number }; // m: 1-12

function parse(text: string): Gun {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!m) throw new SureHesabiHatasi("Tarih YYYY-AA-GG biçiminde olmalı.");
  const g = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  if (g.m < 1 || g.m > 12 || g.d < 1 || g.d > ayinGunSayisi(g.y, g.m)) {
    throw new SureHesabiHatasi(`Geçersiz tarih: ${text}`);
  }
  return g;
}

function iso(g: Gun): string {
  return `${g.y}-${String(g.m).padStart(2, "0")}-${String(g.d).padStart(2, "0")}`;
}

function ayinGunSayisi(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function gunEkle(g: Gun, n: number): Gun {
  const t = new Date(Date.UTC(g.y, g.m - 1, g.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** Ay veya yıl ekler; karşılık gelen gün yoksa ayın son günü. */
function ayEkle(g: Gun, ay: number): Gun {
  const toplam = g.m - 1 + ay;
  const y = g.y + Math.floor(toplam / 12);
  const m = (toplam % 12) + 1;
  return { y, m, d: Math.min(g.d, ayinGunSayisi(y, m)) };
}

function haftaGunu(g: Gun): number {
  return new Date(Date.UTC(g.y, g.m - 1, g.d)).getUTCDay();
}

export function tarihYazisi(text: string): string {
  const g = parse(text);
  return `${g.d} ${AY_ADLARI[g.m - 1]} ${g.y} ${GUN_ADLARI[haftaGunu(g)]}`;
}

/** Günün tatil olup olmadığı ve nedeni; arife ve 28 Ekim yarım gündür. */
function tatil(g: Gun): { tam?: string; yarim?: string } {
  const key = iso(g);
  const md = key.slice(5);
  if (SABIT_TATILLER[md]) return { tam: SABIT_TATILLER[md] };
  for (const bayram of DINI_BAYRAMLAR[g.y] ?? []) {
    if (bayram.gunler.includes(key)) return { tam: bayram.ad };
    if (bayram.arife === key) return { yarim: `${bayram.ad} arifesi` };
  }
  const gun = haftaGunu(g);
  if (gun === 0 || gun === 6) return { tam: GUN_ADLARI[gun] };
  if (md === "10-28") return { yarim: "Cumhuriyet Bayramı arifesi" };
  return {};
}

// ---------------------------------------------------------------------------
// Hesap

const MADDE = {
  hmk: { baslangic: "HMK md. 92", tatil: "HMK md. 93", adliTatil: "HMK md. 104" },
  iik: { baslangic: "İİK md. 19", tatil: "İİK md. 19", adliTatil: null },
  cmk: { baslangic: "CMK md. 39", tatil: "CMK md. 39/4", adliTatil: "CMK md. 331/4" },
  tbk: { baslangic: "TBK md. 92", tatil: "TBK md. 93", adliTatil: null },
} as const;

const BIRIM_ADI: Record<SureBirimi, string> = { gun: "gün", hafta: "hafta", ay: "ay", yil: "yıl" };

export function sureHesapla(girdi: SureHesabiGirdisi): SureHesabiSonucu {
  const baslangic = parse(girdi.baslangic);
  if (!Number.isInteger(girdi.sure) || girdi.sure < 1 || girdi.sure > 3650) {
    throw new SureHesabiHatasi("Süre 1 ile 3650 arasında bir tam sayı olmalı.");
  }
  if (!(girdi.birim in BIRIM_ADI)) throw new SureHesabiHatasi("Birim gün, hafta, ay veya yıl olmalı.");
  if (!(girdi.rejim in MADDE)) throw new SureHesabiHatasi("Kanun HMK, İİK, CMK veya TBK olmalı.");
  const madde = MADDE[girdi.rejim];
  const adimlar: string[] = [];
  const uyarilar: string[] = [];
  const ad = (g: Gun) => tarihYazisi(iso(g));

  // 1. Sürenin ham bitişi
  let son: Gun;
  if (girdi.birim === "gun") {
    son = gunEkle(baslangic, girdi.sure);
    adimlar.push(
      `${girdi.sure} günlük süre: başlangıç günü (${ad(baslangic)}) hesaba katılmaz; süre ${ad(son)} günü biter (${madde.baslangic}).`,
    );
  } else if (girdi.birim === "hafta") {
    son = gunEkle(baslangic, 7 * girdi.sure);
    adimlar.push(
      `${girdi.sure} haftalık süre: son haftada başlangıç gününe ismen karşılık gelen gün, ${ad(son)} (${madde.baslangic}).`,
    );
  } else {
    const ay = girdi.birim === "ay" ? girdi.sure : 12 * girdi.sure;
    son = ayEkle(baslangic, ay);
    const kirpildi = son.d !== baslangic.d;
    adimlar.push(
      `${girdi.sure} ${BIRIM_ADI[girdi.birim]}lık süre: son ${girdi.birim === "ay" ? "ayda" : "yılda"} başlangıç gününe sayıca karşılık gelen gün, ${ad(son)}` +
        (kirpildi ? "; o ayda karşılık gelen gün olmadığından ayın son günü" : "") +
        ` (${madde.baslangic}).`,
    );
  }

  // 2. Son gün tatile rastlarsa izleyen ilk iş günü
  let haftaSonu = false;
  const isGunune = (neden: string) => {
    const kayan: string[] = [];
    for (let i = 0; i < 30; i++) {
      const t = tatil(son);
      if (!t.tam) break;
      if (/^(Cumartesi|Pazar)$/.test(t.tam)) haftaSonu = true;
      kayan.push(`${ad(son)} (${t.tam})`);
      son = gunEkle(son, 1);
    }
    if (kayan.length) {
      adimlar.push(
        `${neden} tatile rastlıyor: ${kayan.join(", ")}. Süre izleyen ilk iş günü, ${ad(son)} biter (${madde.tatil}).`,
      );
    }
  };
  isGunune("Son gün");

  // 3. Adli tatil (20 Temmuz - 31 Ağustos)
  const adliTatilde = (g: Gun) => (g.m === 7 && g.d >= 20) || g.m === 8;
  const tabi = girdi.adliTatileTabi ?? true;
  if (adliTatilde(son)) {
    if (madde.adliTatil && tabi) {
      const uzatma = girdi.rejim === "hmk" ? 7 : 3;
      const yeni = gunEkle({ y: son.y, m: 8, d: 31 }, uzatma);
      adimlar.push(
        `Süre adli tatilde (20 Temmuz - 31 Ağustos) bitiyor; adli tatilin bittiği günden itibaren ${uzatma === 7 ? "bir hafta" : "üç gün"} uzar: ${ad(yeni)} (${madde.adliTatil}).`,
      );
      son = yeni;
      isGunune("Uzayan sürenin son günü");
      if (girdi.rejim === "cmk") {
        uyarilar.push(
          "CMK md. 331/4'e göre adli tatile rastlayan süreler işlemez ve tatilin bittiği günden itibaren üç gün uzatılmış sayılır; tutuklu işler ve ivedi işler için HSK kararını kontrol edin.",
        );
      }
    } else if (madde.adliTatil) {
      adimlar.push(
        `Süre adli tatilde bitiyor, ancak iş adli tatile tabi olmadığından uzamaz (${girdi.rejim === "hmk" ? "HMK md. 103" : "CMK md. 331"}).`,
      );
    } else {
      adimlar.push(
        girdi.rejim === "iik"
          ? "Süre adli tatil dönemine denk geliyor; İİK'daki süreler adli tatilden etkilenmez."
          : "Süre adli tatil dönemine denk geliyor; sözleşmeye dayalı süreler adli tatilden etkilenmez.",
      );
    }
  }
  if (haftaSonu) {
    uyarilar.push(
      "Cumartesi ve Pazar, adliye ve icra daireleri kapalı olduğundan uygulamada tatil günü sayılır.",
    );
  }

  // 4. Yarım günler
  const yarim = tatil(son).yarim;
  if (yarim) {
    uyarilar.push(
      `Son gün ${yarim}; öğleden sonra resmî tatildir. Sürenin bu yarım güne rastlamasının etkisi uygulamada tartışmalıdır; işlemi bu günün sabahına bırakmayın.`,
    );
  }

  // 5. Bayram tablosunun kapsamı
  const yillar = new Set([baslangic.y, son.y]);
  for (let y = baslangic.y; y <= son.y; y++) yillar.add(y);
  const eksik = [...yillar].filter((y) => !DINI_BAYRAMLAR[y]);
  if (eksik.length) {
    uyarilar.push(
      `${eksik.join(", ")} yılının dini bayram tarihleri tabloda yok; bu yıllardaki Ramazan ve Kurban bayramları hesaba katılmadı.`,
    );
  }
  uyarilar.push(
    "Hükümetin ilan ettiği idari izin günleri resmî tatil değildir ve hesaba katılmaz. Hesap bir yardımcıdır; süreyi tebliğ belgesi ve güncel mevzuatla kontrol edin.",
  );

  return {
    baslangic: iso(baslangic),
    sonGun: iso(son),
    sonGunAdi: ad(son),
    adimlar,
    uyarilar,
  };
}
