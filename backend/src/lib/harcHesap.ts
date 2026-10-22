// mikeTR: dava açılışında ödenecek yargı harçları (492 sayılı Harçlar Kanunu).
//
// Tutarlar (1) sayılı tarifenin 2026 yılı için uygulanan miktarlarıdır
// (mevzuat.gov.tr'deki işlenmiş metin, HARC_TARIFE_TARIHI'nde kontrol edildi):
// başvurma harcı, nispi karar ve ilam harcı (binde 68,31, en az 427,60 TL),
// maktu karar ve ilam harcı. Peşin harç md. 28/a'ya göre karar ve ilam
// harcının dörtte biri, ölüm ve cismani zarar tazminatında yirmide biridir.
// Gider avansı, vekâlet harcı ve baro pulu harç değildir; hesaba katılmaz.

export const HARC_TARIFE_YILI = 2026;
export const HARC_TARIFE_TARIHI = "2026-10-22";

const BASVURMA = { sulh: 335.2, asliye: 732.0 } as const;
const NISPI_ORAN = 68.31 / 1000;
const NISPI_ASGARI = 427.6;
const MAKTU_KARAR = 732.0;

export type HarcMahkemesi = keyof typeof BASVURMA;

export type HarcHesabiGirdisi = {
  mahkeme: HarcMahkemesi;
  /** Dava değeri (TL); parayla ölçülemeyen davalarda verilmez. */
  deger?: number;
  /** Ölüm veya cismani zarar sebebiyle maddi ve manevi tazminat davası. */
  olumCismaniZarar?: boolean;
};

export type HarcKalemi = { kalem: string; tutar: number; dayanak: string };

export type HarcHesabiSonucu = {
  kalemler: HarcKalemi[];
  /** Dava açılırken ödenecek toplam. */
  acilistaOdenecek: number;
  /** Davanın sonunda tamamlanacak kalan karar ve ilam harcı (nispi davalarda). */
  kalanKararHarci: number;
  uyarilar: string[];
};

export class HarcHesabiHatasi extends Error {}

const yuvarla = (n: number) => Math.round(n * 100) / 100;
const tl = (n: number) =>
  `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;

export function harcHesapla(girdi: HarcHesabiGirdisi): HarcHesabiSonucu {
  if (!(girdi.mahkeme in BASVURMA)) throw new HarcHesabiHatasi("Mahkeme sulh veya asliye olmalı.");
  if (girdi.deger !== undefined && !(girdi.deger > 0 && girdi.deger < 1e13)) {
    throw new HarcHesabiHatasi("Dava değeri pozitif bir tutar olmalı.");
  }
  const basvurma = BASVURMA[girdi.mahkeme];
  const kalemler: HarcKalemi[] = [
    {
      kalem: "Başvurma harcı",
      tutar: basvurma,
      dayanak: `492 s. K. (1) sayılı tarife A-I-${girdi.mahkeme === "sulh" ? "1" : "2"}: ${girdi.mahkeme === "sulh" ? "sulh mahkemeleri ve icra mahkemeleri" : "asliye ve idare mahkemeleri"} için ${tl(basvurma)}`,
    },
  ];
  const uyarilar = [
    `Tutarlar ${HARC_TARIFE_YILI} yılı tarifesine göredir (${HARC_TARIFE_TARIHI} tarihinde mevzuat.gov.tr'den kontrol edildi); harçlar her yıl yeniden değerlenir.`,
    "Gider avansı, vekâlet harcı ve baro pulu bu hesaba dahil değildir. Harç muafiyeti olan taraflar için harç alınmaz.",
  ];

  if (girdi.deger === undefined) {
    kalemler.push({
      kalem: "Maktu karar ve ilam harcı (peşin)",
      tutar: MAKTU_KARAR,
      dayanak: `492 s. K. (1) sayılı tarife A-III-2-a: parayla ölçülemeyen davalarda ${tl(MAKTU_KARAR)}`,
    });
    return {
      kalemler,
      acilistaOdenecek: yuvarla(basvurma + MAKTU_KARAR),
      kalanKararHarci: 0,
      uyarilar,
    };
  }

  const hesaplanan = girdi.deger * NISPI_ORAN;
  const kararHarci = yuvarla(Math.max(hesaplanan, NISPI_ASGARI));
  const pay = girdi.olumCismaniZarar ? 20 : 4;
  const pesin = yuvarla(kararHarci / pay);
  kalemler.push({
    kalem: "Peşin karar ve ilam harcı",
    tutar: pesin,
    dayanak:
      `Nispi karar ve ilam harcı: ${tl(girdi.deger)} × binde 68,31 = ${tl(yuvarla(hesaplanan))}` +
      (hesaplanan < NISPI_ASGARI ? `; asgari tutar ${tl(NISPI_ASGARI)} uygulanır` : "") +
      ` (492 s. K. (1) sayılı tarife A-III-1-a). Bunun ${pay === 4 ? "dörtte biri" : "yirmide biri"} peşin alınır (492 s. K. md. 28/a).`,
  });
  if (girdi.olumCismaniZarar) {
    uyarilar.push("Ölüm ve cismani zarar sebebiyle açılan tazminat davalarında peşin harç yirmide birdir (492 s. K. md. 28/a).");
  }
  uyarilar.push(
    "Kalan karar ve ilam harcı, hüküm altına alınan değer üzerinden hesaplanır ve kararın tebliğinden itibaren bir ay içinde ödenir (492 s. K. md. 28/a); burada dava değeri üzerinden tahmin edilmiştir.",
  );
  return {
    kalemler,
    acilistaOdenecek: yuvarla(basvurma + pesin),
    kalanKararHarci: yuvarla(kararHarci - pesin),
    uyarilar,
  };
}
