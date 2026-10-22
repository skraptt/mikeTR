// mikeTR: kanuni faiz ve ticari temerrüt faizi hesabı (3095 sayılı Kanun).
//
// Oranlar:
// - Kanuni faiz (3095 s. K. md. 1): 1.1.2006-31.5.2024 %9; 1.6.2024'ten
//   itibaren %24 (8485 sayılı Cumhurbaşkanı Kararı, RG 21.5.2024); 31.7.2026'dan
//   itibaren TCMB'nin önceki yılın 31 Aralık reeskont oranının %80'i, 30 Haziran
//   oranı beş puan veya daha çok farklıysa yılın ikinci yarısında onun %80'i
//   (7589 sayılı Kanun md. 10, RG 31.7.2026).
// - Ticari temerrüt faizi (md. 2/2): TCMB'nin önceki yılın 31 Aralık avans
//   oranı, aynı beş puan kuralıyla; kanuni faizden düşükse kanuni faiz.
// - Mürekkep faiz yürütülmez (md. 3): basit faiz, yıl 365 gün.
// TCMB oranları: tcmb.gov.tr "Reeskont ve Avans Faiz Oranları" tablosu.

export type FaizTuru = "kanuni" | "ticari";

export type FaizHesabiGirdisi = {
  anapara: number;
  /** Faizin işlemeye başladığı gün (temerrüt, dava veya takip tarihi), YYYY-MM-DD. */
  baslangic: string;
  /** Faizin hesaplandığı son gün, YYYY-MM-DD. */
  bitis: string;
  tur: FaizTuru;
};

export type FaizDonemi = {
  baslangic: string;
  bitis: string;
  gun: number;
  oran: number;
  faiz: number;
  dayanak: string;
};

export type FaizHesabiSonucu = {
  anapara: number;
  toplamFaiz: number;
  toplam: number;
  donemler: FaizDonemi[];
  uyarilar: string[];
};

export class FaizHesabiHatasi extends Error {}

/** TCMB reeskont ve avans faiz oranları: yürürlük tarihi, reeskont %, avans %. */
const TCMB: [string, number, number][] = [
  ["2005-12-20", 23, 25],
  ["2006-12-20", 27, 29],
  ["2007-12-28", 25, 27],
  ["2009-04-09", 19, 20],
  ["2009-06-12", 18, 19],
  ["2009-12-22", 15, 16],
  ["2010-12-30", 14, 15],
  ["2011-12-29", 17, 17.75],
  ["2012-06-19", 16, 16.5],
  ["2012-12-20", 13.5, 13.75],
  ["2013-06-21", 9.5, 11],
  ["2013-12-27", 10.25, 11.75],
  ["2014-12-14", 9, 10.5],
  ["2016-12-31", 8.75, 9.75],
  ["2018-06-29", 18.5, 19.5],
  ["2019-10-11", 17.25, 18.25],
  ["2019-12-21", 12.75, 13.75],
  ["2020-06-13", 9, 10],
  ["2020-12-19", 15.75, 16.75],
  ["2021-12-31", 14.75, 15.75],
  ["2022-12-31", 9.75, 10.75],
  ["2023-06-24", 15.75, 16.75],
  ["2023-09-01", 25.75, 26.75],
  ["2023-09-28", 30.75, 31.75],
  ["2023-11-01", 35.75, 36.75],
  ["2023-12-01", 40.75, 41.75],
  ["2023-12-23", 43.25, 44.25],
  ["2024-04-01", 50.75, 51.75],
  ["2024-12-28", 48.25, 49.25],
  ["2025-03-08", 43.25, 44.25],
  ["2025-09-17", 41.25, 42.25],
  ["2025-12-20", 38.75, 39.75],
];
/** The TCMB table above was last checked on this day. */
export const TCMB_TABLO_TARIHI = "2026-10-22";

const ILK_TARIH = "2006-01-01";
const YENI_KANUNI_FAIZ = "2026-07-31";

function parse(text: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!m) throw new FaizHesabiHatasi("Tarih YYYY-AA-GG biçiminde olmalı.");
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (new Date(t).getUTCDate() !== Number(m[3])) throw new FaizHesabiHatasi(`Geçersiz tarih: ${text}`);
  return t / 86_400_000;
}

function iso(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

function tcmbOn(date: string): { reeskont: number; avans: number } {
  let row = TCMB[0];
  for (const r of TCMB) if (r[0] <= date) row = r;
  return { reeskont: row[1], avans: row[2] };
}

/** md. 1 ve 2'deki yarıyıl kuralı: önceki 31 Aralık, 5 puan fark varsa 30 Haziran. */
function yariyilOrani(yil: number, ikinciYari: boolean, sec: (o: { reeskont: number; avans: number }) => number) {
  const aralik = sec(tcmbOn(`${yil - 1}-12-31`));
  if (!ikinciYari) return { oran: aralik, kaynak: `${yil - 1} yılı 31 Aralık` };
  const haziran = sec(tcmbOn(`${yil}-06-30`));
  return Math.abs(haziran - aralik) >= 5
    ? { oran: haziran, kaynak: `${yil} yılı 30 Haziran (31 Aralık oranından en az beş puan farklı)` }
    : { oran: aralik, kaynak: `${yil - 1} yılı 31 Aralık` };
}

/** Türkçe ondalık: 38.75 -> "38,75". */
const yuzde = (n: number) => `%${String(n).replace(".", ",")}`;

function kanuniOran(gun: string): { oran: number; dayanak: string } {
  if (gun < "2024-06-01") return { oran: 9, dayanak: "kanuni faiz %9 (3095 s. K. md. 1)" };
  if (gun < YENI_KANUNI_FAIZ) return { oran: 24, dayanak: "kanuni faiz %24 (3095 s. K. md. 1; 8485 s. CBK)" };
  const yil = Number(gun.slice(0, 4));
  const { oran, kaynak } = yariyilOrani(yil, gun.slice(5) >= "07-01", (o) => o.reeskont);
  const yuvarlak = Math.round(oran * 80) / 100;
  return {
    oran: yuvarlak,
    dayanak: `kanuni faiz: TCMB reeskont oranı ${yuzde(oran)} (${kaynak}) × %80 = ${yuzde(yuvarlak)} (3095 s. K. md. 1)`,
  };
}

function ticariOran(gun: string): { oran: number; dayanak: string } {
  const yil = Number(gun.slice(0, 4));
  const { oran, kaynak } = yariyilOrani(yil, gun.slice(5) >= "07-01", (o) => o.avans);
  const kanuni = kanuniOran(gun);
  if (kanuni.oran >= oran) {
    return { oran: kanuni.oran, dayanak: `${kanuni.dayanak}; avans oranı (${yuzde(oran)}) bundan yüksek olmadığından` };
  }
  return { oran, dayanak: `ticari temerrüt faizi: TCMB avans oranı ${yuzde(oran)} (${kaynak}) (3095 s. K. md. 2/2)` };
}

/** Faiz oranının değişebileceği günler: yarıyıl başları ve kanuni faiz değişiklikleri. */
function sinirlar(bas: string, son: string): string[] {
  const out = new Set<string>(["2024-06-01", YENI_KANUNI_FAIZ]);
  for (let y = Number(bas.slice(0, 4)); y <= Number(son.slice(0, 4)) + 1; y++) {
    out.add(`${y}-01-01`);
    out.add(`${y}-07-01`);
  }
  return [...out].filter((d) => d > bas && d < son).sort();
}

const yuvarla = (n: number) => Math.round(n * 100) / 100;


export function faizHesapla(girdi: FaizHesabiGirdisi): FaizHesabiSonucu {
  if (!(girdi.anapara > 0) || girdi.anapara > 1e13) throw new FaizHesabiHatasi("Anapara pozitif bir tutar olmalı.");
  if (girdi.tur !== "kanuni" && girdi.tur !== "ticari") throw new FaizHesabiHatasi("Faiz türü kanuni veya ticari olmalı.");
  const bas = iso(parse(girdi.baslangic));
  const son = iso(parse(girdi.bitis));
  if (son <= bas) throw new FaizHesabiHatasi("Bitiş tarihi başlangıçtan sonra olmalı.");
  if (bas < ILK_TARIH) throw new FaizHesabiHatasi(`Hesap ${ILK_TARIH} ve sonrası için yapılabilir.`);

  const oranFn = girdi.tur === "kanuni" ? kanuniOran : ticariOran;
  const noktalar = [bas, ...sinirlar(bas, son), son];
  const donemler: FaizDonemi[] = [];
  for (let i = 0; i < noktalar.length - 1; i++) {
    const gun = parse(noktalar[i + 1]) - parse(noktalar[i]);
    const { oran, dayanak } = oranFn(noktalar[i]);
    const onceki = donemler[donemler.length - 1];
    // Aynı oranla süren yarıyılları tek dönemde göster.
    if (onceki && onceki.oran === oran && onceki.dayanak === dayanak) {
      onceki.bitis = noktalar[i + 1];
      onceki.gun += gun;
      continue;
    }
    donemler.push({ baslangic: noktalar[i], bitis: noktalar[i + 1], gun, oran, faiz: 0, dayanak });
  }
  for (const d of donemler) d.faiz = yuvarla((girdi.anapara * d.oran * d.gun) / 36_500);
  const toplamFaiz = yuvarla(donemler.reduce((t, d) => t + d.faiz, 0));

  const uyarilar = [
    "Basit faiz uygulanmıştır, faize faiz yürütülmez (3095 s. K. md. 3); yıl 365 gün sayılmıştır. Sözleşmede başka bir faiz oranı kararlaştırılmışsa o oran uygulanır.",
  ];
  if (son > TCMB_TABLO_TARIHI) {
    uyarilar.push(
      `Hesap ${TCMB_TABLO_TARIHI} sonrasına uzanıyor; o tarihten sonra TCMB oranlarında değişiklik olduysa sonuç farklı olabilir.`,
    );
  }
  if (girdi.tur === "ticari") {
    uyarilar.push("Ticari temerrüt faizi yalnızca ticari işlerde, temerrüt hâlinde istenebilir (3095 s. K. md. 2/2).");
  }
  return { anapara: girdi.anapara, toplamFaiz, toplam: yuvarla(girdi.anapara + toplamFaiz), donemler, uyarilar };
}
