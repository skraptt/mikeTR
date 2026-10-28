// mikeTR: kıdem tazminatı (1475 s. K. md. 14) ve ihbar tazminatı
// (4857 s. K. md. 17) hesabı.
//
// Kıdem tazminatı her tam yıl için 30 günlük giydirilmiş brüt ücrettir; yıldan
// artan süre orantılı eklenir. Esas alınan ücret, iş sözleşmesinin sona erdiği
// tarihte geçerli kıdem tazminatı tavanını aşamaz. Tavanlar Hazine ve Maliye
// Bakanlığı'nın Ocak ve Temmuz'da yayımladığı mali ve sosyal haklar
// genelgelerinden alınmıştır (KIDEM_TAVAN_TABLO_TARIHI'nde kontrol edildi).
// Kıdem tazminatı tavan dahilinde gelir vergisinden istisnadır (GVK md. 25/7);
// yalnız damga vergisi (binde 7,59) kesilir. İhbar tazminatı gelir ve damga
// vergisine tabidir.

export const KIDEM_TAVAN_TABLO_TARIHI = "2026-10-28";

/** [geçerlilik başlangıcı, tavan (TL)] — yeni dönem sona eklenir. */
const KIDEM_TAVANLARI: readonly (readonly [string, number])[] = [
  ["2022-01-01", 10848.59],
  ["2022-07-01", 15371.4],
  ["2023-01-01", 19982.83],
  ["2023-07-01", 23489.83],
  ["2024-01-01", 35058.58],
  ["2024-07-01", 41828.42],
  ["2025-01-01", 46655.43],
  ["2025-07-01", 53919.68],
  ["2026-01-01", 64948.77],
  ["2026-07-01", 73729.87],
];

const DAMGA_ORANI = 7.59 / 1000;
const VARSAYILAN_GELIR_VERGISI = 15;

export type TazminatHesabiGirdisi = {
  /** İşe giriş tarihi, YYYY-MM-DD. */
  giris: string;
  /** İş sözleşmesinin sona erdiği tarih, YYYY-MM-DD. */
  cikis: string;
  /** Son aylık giydirilmiş brüt ücret (düzenli yan ödemeler dahil), TL. */
  brutUcret: number;
  /** İhbar tazminatı da hesaplansın mı (varsayılan evet). */
  ihbar?: boolean;
  /** İhbar tazminatına uygulanacak gelir vergisi oranı, yüzde (varsayılan 15). */
  gelirVergisiOrani?: number;
};

export type TazminatKalemi = {
  kalem: string;
  brut: number;
  gelirVergisi: number;
  damgaVergisi: number;
  net: number;
  dayanak: string;
};

export type TazminatHesabiSonucu = {
  hizmetSuresi: { yil: number; ay: number; gun: number };
  hizmetSuresiYazili: string;
  brutUcret: number;
  /** Sona erme tarihindeki kıdem tazminatı tavanı. */
  tavan: number;
  tavanBaslangici: string;
  /** Kıdem tazminatında esas alınan ücret (tavanla sınırlı). */
  esasUcret: number;
  ihbarSuresiHafta: number;
  kalemler: TazminatKalemi[];
  toplamBrut: number;
  toplamNet: number;
  adimlar: string[];
  uyarilar: string[];
};

export class TazminatHesabiHatasi extends Error {}

const yuvarla = (n: number) => Math.round(n * 100) / 100;
const tl = (n: number) =>
  `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;

function tarihOku(iso: string, ad: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  if (!m || !d || d.getUTCDate() !== +m[3]) {
    throw new TazminatHesabiHatasi(`${ad} YYYY-AA-GG biçiminde geçerli bir tarih olmalı.`);
  }
  return d;
}

const gunlerAyda = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** Giriş ve çıkış günü dahil hizmet süresi: yıl, ay, gün. */
export function hizmetSuresi(giris: Date, cikis: Date): { yil: number; ay: number; gun: number } {
  // Çıkış günü de çalışılmış sayılır: süre, çıkışın ertesi gününe kadar ölçülür.
  const son = new Date(cikis.getTime() + 86_400_000);
  let yil = son.getUTCFullYear() - giris.getUTCFullYear();
  let ay = son.getUTCMonth() - giris.getUTCMonth();
  let gun = son.getUTCDate() - giris.getUTCDate();
  if (gun < 0) {
    ay -= 1;
    const oncekiAy = (son.getUTCMonth() + 11) % 12;
    const oncekiYil = oncekiAy === 11 ? son.getUTCFullYear() - 1 : son.getUTCFullYear();
    gun += gunlerAyda(oncekiYil, oncekiAy);
  }
  if (ay < 0) {
    yil -= 1;
    ay += 12;
  }
  return { yil, ay, gun };
}

function sureYazili(s: { yil: number; ay: number; gun: number }): string {
  const parca = [
    s.yil ? `${s.yil} yıl` : "",
    s.ay ? `${s.ay} ay` : "",
    s.gun ? `${s.gun} gün` : "",
  ].filter(Boolean);
  return parca.length ? parca.join(" ") : "0 gün";
}

/** 4857 md. 17: hizmet süresine göre bildirim süresi (hafta). */
function ihbarHaftasi(s: { yil: number; ay: number; gun: number }): number {
  // "Üç yıldan fazla" kesin üç yılı kapsamaz; artan günler ayın kesri sayılır.
  const ay = s.yil * 12 + s.ay + s.gun / 31;
  if (ay < 6) return 2;
  if (ay < 18) return 4;
  if (ay <= 36) return 6;
  return 8;
}

export function tazminatHesapla(girdi: TazminatHesabiGirdisi): TazminatHesabiSonucu {
  const giris = tarihOku(girdi.giris, "İşe giriş tarihi");
  const cikis = tarihOku(girdi.cikis, "Çıkış tarihi");
  if (cikis < giris) throw new TazminatHesabiHatasi("Çıkış tarihi işe giriş tarihinden önce olamaz.");
  if (!(girdi.brutUcret > 0 && girdi.brutUcret < 1e9)) {
    throw new TazminatHesabiHatasi("Brüt ücret pozitif bir tutar olmalı.");
  }
  const gvOrani = girdi.gelirVergisiOrani ?? VARSAYILAN_GELIR_VERGISI;
  if (!(gvOrani >= 0 && gvOrani <= 40)) {
    throw new TazminatHesabiHatasi("Gelir vergisi oranı yüzde 0 ile 40 arasında olmalı.");
  }
  const ilkDonem = KIDEM_TAVANLARI[0][0];
  if (girdi.cikis < ilkDonem) {
    throw new TazminatHesabiHatasi(`Kıdem tazminatı tavan tablosu ${ilkDonem.split("-").reverse().join(".")} tarihinden başlıyor.`);
  }

  const [tavanBaslangici, tavan] = [...KIDEM_TAVANLARI].reverse().find(([t]) => t <= girdi.cikis)!;
  const sure = hizmetSuresi(giris, cikis);
  const yazili = sureYazili(sure);
  const brut = girdi.brutUcret;
  const esasUcret = Math.min(brut, tavan);
  const adimlar: string[] = [
    `Hizmet süresi: ${girdi.giris.split("-").reverse().join(".")} – ${girdi.cikis.split("-").reverse().join(".")}, giriş ve çıkış günü dahil ${yazili}.`,
  ];
  const uyarilar: string[] = [
    "Ücret, giydirilmiş brüt ücret olmalıdır: çıplak brüt ücrete yol, yemek, ikramiye gibi düzenli ve sürekli ödemelerin aylık karşılığı eklenir (1475 s. K. md. 14/11).",
  ];
  const kalemler: TazminatKalemi[] = [];

  if (sure.yil < 1) {
    adimlar.push("Hizmet süresi bir yıldan az olduğu için kıdem tazminatı hakkı doğmaz (1475 s. K. md. 14/1).");
  } else {
    const tavanYazisi = `${tavanBaslangici.split("-").reverse().join(".")} döneminde ${tl(tavan)}`;
    adimlar.push(
      brut > tavan
        ? `Brüt ücret (${tl(brut)}) kıdem tazminatı tavanını aşıyor; tavan esas alınır (${tavanYazisi}).`
        : `Esas ücret ${tl(brut)}; tavanın altında (${tavanYazisi}).`,
    );
    const yillik = esasUcret * sure.yil;
    const aylik = (esasUcret / 12) * sure.ay;
    const gunluk = (esasUcret / 365) * sure.gun;
    const kidemBrut = yuvarla(yillik + aylik + gunluk);
    adimlar.push(
      `Kıdem tazminatı: ${tl(esasUcret)} × ${sure.yil} yıl` +
        (sure.ay ? ` + ${tl(esasUcret)} / 12 × ${sure.ay} ay` : "") +
        (sure.gun ? ` + ${tl(esasUcret)} / 365 × ${sure.gun} gün` : "") +
        ` = ${tl(kidemBrut)} brüt.`,
    );
    const damga = yuvarla(kidemBrut * DAMGA_ORANI);
    kalemler.push({
      kalem: "Kıdem tazminatı",
      brut: kidemBrut,
      gelirVergisi: 0,
      damgaVergisi: damga,
      net: yuvarla(kidemBrut - damga),
      dayanak:
        "1475 s. K. md. 14: her tam yıl için 30 günlük ücret; gelir vergisinden istisna (GVK md. 25/7), damga vergisi binde 7,59.",
    });
    uyarilar.push(
      "Kıdem tazminatı yalnız md. 14'te sayılan hallerde doğar: işverenin haklı neden dışında feshi, işçinin haklı nedenle feshi, askerlik, emeklilik, kadın işçinin evlilikten itibaren bir yıl içinde ayrılması, ölüm. İşçinin istifası ve işçinin ahlak ve iyi niyet kurallarına aykırı davranışı nedeniyle fesih (4857 md. 25/II) kıdem hakkı vermez.",
    );
  }

  const hafta = ihbarHaftasi(sure);
  if (girdi.ihbar !== false) {
    const ihbarBrut = yuvarla((brut / 30) * 7 * hafta);
    const gv = yuvarla(ihbarBrut * (gvOrani / 100));
    const damga = yuvarla(ihbarBrut * DAMGA_ORANI);
    adimlar.push(
      `İhbar süresi ${hafta} hafta (${hafta * 7} gün); ihbar tazminatı: ${tl(brut)} / 30 × ${hafta * 7} gün = ${tl(ihbarBrut)} brüt.`,
    );
    kalemler.push({
      kalem: "İhbar tazminatı",
      brut: ihbarBrut,
      gelirVergisi: gv,
      damgaVergisi: damga,
      net: yuvarla(ihbarBrut - gv - damga),
      dayanak: `4857 s. K. md. 17: ${hafta} haftalık ücret; tavan uygulanmaz, gelir vergisi (%${gvOrani}) ve damga vergisi (binde 7,59) kesilir.`,
    });
    uyarilar.push(
      `İhbar tazminatı, sözleşmeyi bildirim süresine uymadan fesheden tarafça ödenir; haklı nedenle fesihte (4857 md. 24, 25) doğmaz. Gelir vergisi %${gvOrani} varsayıldı; gerçek oran işçinin yıl içindeki kümülatif matrahına göre değişir.`,
    );
  }

  if (girdi.cikis > "2026-12-31") {
    uyarilar.push(
      `Çıkış tarihi için yeni kıdem tazminatı tavanı tabloda olmayabilir; ${tavanBaslangici.split("-").reverse().join(".")} dönemi tavanı kullanıldı (tablo ${KIDEM_TAVAN_TABLO_TARIHI.split("-").reverse().join(".")} tarihinde kontrol edildi).`,
    );
  }

  const toplamBrut = yuvarla(kalemler.reduce((t, k) => t + k.brut, 0));
  const toplamNet = yuvarla(kalemler.reduce((t, k) => t + k.net, 0));
  return {
    hizmetSuresi: sure,
    hizmetSuresiYazili: yazili,
    brutUcret: brut,
    tavan,
    tavanBaslangici,
    esasUcret,
    ihbarSuresiHafta: hafta,
    kalemler,
    toplamBrut,
    toplamNet,
    adimlar,
    uyarilar,
  };
}
