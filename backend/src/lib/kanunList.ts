// mikeTR: the laws in the statute index, in one place. The citation check,
// the assistant's instructions and `npm run kanun:fetch` read this list; the
// kanunlar table holds the same laws (migrations) with their check dates.
//
// `short` is how a citation names the law ("TBK md. 315"); `abbrs` are the
// abbreviations recognised in text (case-sensitive, no dots); `names` are
// lower-case names without Turkish suffixes. `tertip` is mevzuat.gov.tr's
// MevzuatTertip for the law's page.

export type KanunInfo = {
  no: string;
  adi: string;
  short: string;
  abbrs: string[];
  names: string[];
  tertip: number;
};

export const KANUNLAR: readonly KanunInfo[] = [
  // Özel hukuk
  { no: "4721", adi: "Türk Medeni Kanunu", short: "TMK", abbrs: ["TMK", "MK"], names: ["türk medeni kanunu", "türk medenî kanunu", "medeni kanun"], tertip: 5 },
  { no: "4722", adi: "Türk Medenî Kanununun Yürürlüğü ve Uygulama Şekli hakkında Kanun", short: "4722 s. K.", abbrs: [], names: [], tertip: 5 },
  { no: "6098", adi: "Türk Borçlar Kanunu", short: "TBK", abbrs: ["TBK"], names: ["türk borçlar kanunu", "borçlar kanunu"], tertip: 5 },
  { no: "6101", adi: "Türk Borçlar Kanununun Yürürlüğü ve Uygulama Şekli hakkında Kanun", short: "6101 s. K.", abbrs: [], names: [], tertip: 5 },
  { no: "6102", adi: "Türk Ticaret Kanunu", short: "TTK", abbrs: ["TTK"], names: ["türk ticaret kanunu"], tertip: 5 },
  { no: "6103", adi: "Türk Ticaret Kanununun Yürürlüğü ve Uygulama Şekli hakkında Kanun", short: "6103 s. K.", abbrs: [], names: [], tertip: 5 },
  { no: "5941", adi: "Çek Kanunu", short: "Çek K.", abbrs: ["ÇK"], names: ["çek kanunu", "çek k."], tertip: 5 },
  { no: "6502", adi: "Tüketicinin Korunması hakkında Kanun", short: "TKHK", abbrs: ["TKHK"], names: ["tüketicinin korunması hakkında kanun"], tertip: 5 },
  { no: "634", adi: "Kat Mülkiyeti Kanunu", short: "KMK", abbrs: ["KMK"], names: ["kat mülkiyeti kanunu"], tertip: 5 },
  { no: "2644", adi: "Tapu Kanunu", short: "Tapu K.", abbrs: [], names: ["tapu kanunu"], tertip: 3 },
  { no: "5846", adi: "Fikir ve Sanat Eserleri Kanunu", short: "FSEK", abbrs: ["FSEK"], names: ["fikir ve sanat eserleri kanunu"], tertip: 3 },
  { no: "6769", adi: "Sınai Mülkiyet Kanunu", short: "SMK", abbrs: ["SMK"], names: ["sınai mülkiyet kanunu"], tertip: 5 },
  { no: "6362", adi: "Sermaye Piyasası Kanunu", short: "SPK", abbrs: ["SPK", "SPKn"], names: ["sermaye piyasası kanunu"], tertip: 5 },
  { no: "4054", adi: "Rekabetin Korunması hakkında Kanun", short: "RKHK", abbrs: ["RKHK"], names: ["rekabetin korunması hakkında kanun"], tertip: 5 },
  { no: "6698", adi: "Kişisel Verilerin Korunması Kanunu", short: "KVKK", abbrs: ["KVKK"], names: ["kişisel verilerin korunması kanunu"], tertip: 5 },
  { no: "5651", adi: "İnternet Ortamında Yapılan Yayınların Düzenlenmesi ve Bu Yayınlar Yoluyla İşlenen Suçlarla Mücadele Edilmesi Hakkında Kanun", short: "5651 s. K.", abbrs: [], names: [], tertip: 5 },
  // Yargılama, icra ve meslek
  { no: "6100", adi: "Hukuk Muhakemeleri Kanunu", short: "HMK", abbrs: ["HMK"], names: ["hukuk muhakemeleri kanunu"], tertip: 5 },
  { no: "2004", adi: "İcra ve İflas Kanunu", short: "İİK", abbrs: ["İİK"], names: ["icra ve iflas kanunu"], tertip: 3 },
  { no: "6325", adi: "Hukuk Uyuşmazlıklarında Arabuluculuk Kanunu", short: "HUAK", abbrs: ["HUAK"], names: ["hukuk uyuşmazlıklarında arabuluculuk kanunu"], tertip: 5 },
  { no: "7201", adi: "Tebligat Kanunu", short: "Tebligat K.", abbrs: [], names: ["tebligat kanunu"], tertip: 3 },
  { no: "1136", adi: "Avukatlık Kanunu", short: "Av. K.", abbrs: ["AvK"], names: ["avukatlık kanunu"], tertip: 5 },
  { no: "1512", adi: "Noterlik Kanunu", short: "Noterlik K.", abbrs: [], names: ["noterlik kanunu"], tertip: 5 },
  // İş ve sosyal güvenlik
  { no: "4857", adi: "İş Kanunu", short: "İş K.", abbrs: ["İşK", "İK"], names: ["iş kanunu"], tertip: 5 },
  // Eski İş Kanunu; yalnızca kıdem tazminatına ilişkin 14. maddesi yürürlükte.
  { no: "1475", adi: "1475 sayılı İş Kanunu", short: "1475 s. K.", abbrs: [], names: [], tertip: 5 },
  { no: "7036", adi: "İş Mahkemeleri Kanunu", short: "İş Mah. K.", abbrs: ["İMK"], names: ["iş mahkemeleri kanunu"], tertip: 5 },
  { no: "5510", adi: "Sosyal Sigortalar ve Genel Sağlık Sigortası Kanunu", short: "5510 s. K.", abbrs: [], names: ["sosyal sigortalar ve genel sağlık sigortası kanunu"], tertip: 5 },
  // Ceza
  { no: "5237", adi: "Türk Ceza Kanunu", short: "TCK", abbrs: ["TCK"], names: ["türk ceza kanunu"], tertip: 5 },
  { no: "5271", adi: "Ceza Muhakemesi Kanunu", short: "CMK", abbrs: ["CMK"], names: ["ceza muhakemesi kanunu"], tertip: 5 },
  { no: "5275", adi: "Ceza ve Güvenlik Tedbirlerinin İnfazı Hakkında Kanun", short: "5275 s. K.", abbrs: [], names: ["ceza ve güvenlik tedbirlerinin infazı hakkında kanun"], tertip: 5 },
  { no: "5326", adi: "Kabahatler Kanunu", short: "Kabahatler K.", abbrs: [], names: ["kabahatler kanunu"], tertip: 5 },
  { no: "6284", adi: "Ailenin Korunması ve Kadına Karşı Şiddetin Önlenmesine Dair Kanun", short: "6284 s. K.", abbrs: [], names: [], tertip: 5 },
  { no: "2918", adi: "Karayolları Trafik Kanunu", short: "KTK", abbrs: ["KTK"], names: ["karayolları trafik kanunu"], tertip: 5 },
  // Kamu hukuku
  { no: "2709", adi: "Türkiye Cumhuriyeti Anayasası", short: "AY", abbrs: ["AY"], names: ["türkiye cumhuriyeti anayasası", "anayasa"], tertip: 5 },
  { no: "2577", adi: "İdari Yargılama Usulü Kanunu", short: "İYUK", abbrs: ["İYUK"], names: ["idari yargılama usulü kanunu"], tertip: 5 },
  { no: "657", adi: "Devlet Memurları Kanunu", short: "DMK", abbrs: ["DMK"], names: ["devlet memurları kanunu"], tertip: 5 },
  { no: "2942", adi: "Kamulaştırma Kanunu", short: "Kamulaştırma K.", abbrs: [], names: ["kamulaştırma kanunu"], tertip: 5 },
  { no: "3194", adi: "İmar Kanunu", short: "İmar K.", abbrs: [], names: ["imar kanunu"], tertip: 5 },
  { no: "4734", adi: "Kamu İhale Kanunu", short: "KİK", abbrs: ["KİK"], names: ["kamu ihale kanunu"], tertip: 5 },
  // Vergi
  { no: "213", adi: "Vergi Usul Kanunu", short: "VUK", abbrs: ["VUK"], names: ["vergi usul kanunu"], tertip: 4 },
  { no: "193", adi: "Gelir Vergisi Kanunu", short: "GVK", abbrs: ["GVK"], names: ["gelir vergisi kanunu"], tertip: 4 },
  { no: "3065", adi: "Katma Değer Vergisi Kanunu", short: "KDVK", abbrs: ["KDVK"], names: ["katma değer vergisi kanunu"], tertip: 5 },
  { no: "6183", adi: "Amme Alacaklarının Tahsil Usulü hakkında Kanun", short: "6183 s. K.", abbrs: [], names: ["amme alacaklarının tahsil usulü hakkında kanun"], tertip: 3 },
];

export function kanunByNo(no: string): KanunInfo | undefined {
  return KANUNLAR.find((k) => k.no === no);
}

/** "Türk Medeni Kanunu (TMK, 4721), ..." for the assistant's instructions. */
export function kanunListForPrompt(): string {
  return KANUNLAR.map((k) =>
    k.short.endsWith("s. K.") ? `${k.adi} (${k.no})` : `${k.adi} (${k.short}, ${k.no})`,
  ).join("; ");
}
