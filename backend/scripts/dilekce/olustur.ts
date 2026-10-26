// mikeTR dilekçe ve ihtarname şablonlarını üretir:
//   frontend/public/preset-templates/mikeTR/Dilekçeler/*.docx
// ve frontend/src/app/components/library/presetTemplates.json kataloğunu
// (boyut ve SHA-256 ile) günceller.
//
//   npx tsx scripts/dilekce/olustur.ts
//
// Şablonlar mikeTR'nin taslaklarıdır ve CC0 ile serbestçe kullanılabilir.
// Doldurulacak alanlar köşeli parantez içinde ve sarı vurguludur. Dayanılan
// maddeler ve süreler mikeTR'nin mevzuat veritabanından kontrol edilmiştir;
// şablonlar bir avukatın incelemesi yerine geçmez.
import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
  type IRunOptions,
} from "docx";

type Blok =
  | { tur: "not"; metin: string }
  | { tur: "baslik"; metin: string }
  | { tur: "bos" }
  | { tur: "taraf"; etiket: string; metin: string }
  | { tur: "bolum"; metin: string }
  | { tur: "madde"; metin: string }
  | { tur: "paragraf"; metin: string }
  | { tur: "imza"; satirlar: string[] };

type Sablon = { dosya: string; baslik: string; bloklar: Blok[] };

const FONT = "Times New Roman";
const PUNTO = 24; // yarım punto
const SEKME = 2835; // 5 cm, twip: etiketten sonraki ":" bu hizadan başlar
const METIN = SEKME + 284; // ": " sonrasında satır kayınca metnin hizası

// "[...]" alanları sarı vurgulanır.
function parcalar(metin: string, ek: IRunOptions = {}): TextRun[] {
  return metin
    .split(/(\[[^\]]+\])/)
    .filter(Boolean)
    .map((p) => new TextRun({ text: p, font: FONT, size: PUNTO, ...ek, ...(p.startsWith("[") ? { highlight: "yellow" } : {}) }));
}

function paragraf(b: Blok): Paragraph {
  switch (b.tur) {
    case "not":
      return new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({ text: `[Şablon notu: ${b.metin} Dilekçeyi vermeden önce bu notu silin.]`, font: FONT, size: 20, italics: true, color: "666666", highlight: "lightGray" })],
      });
    case "baslik":
      return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: parcalar(b.metin, { bold: true }) });
    case "bos":
      return new Paragraph({ children: [] });
    case "taraf":
      return new Paragraph({
        tabStops: [
          { type: TabStopType.LEFT, position: SEKME },
          { type: TabStopType.LEFT, position: METIN },
        ],
        indent: { left: METIN, hanging: METIN },
        spacing: { after: 60 },
        children: [
          new TextRun({ text: b.etiket, font: FONT, size: PUNTO, bold: true }),
          new TextRun({ text: "\t:\t", font: FONT, size: PUNTO, bold: true }),
          ...parcalar(b.metin),
        ],
      });
    case "bolum":
      return new Paragraph({
        spacing: { before: 240, after: 120 },
        tabStops: [{ type: TabStopType.LEFT, position: SEKME }],
        children: [new TextRun({ text: `${b.metin}\t:`, font: FONT, size: PUNTO, bold: true })],
      });
    case "madde":
    case "paragraf":
      return new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        indent: b.tur === "madde" ? { firstLine: 567 } : undefined,
        spacing: { after: 120, line: 300 },
        children: parcalar(b.metin),
      });
    case "imza":
      return new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 360 },
        children: b.satirlar.flatMap((s, i) => [...(i ? [new TextRun({ break: 1 })] : []), ...parcalar(s)]),
      });
  }
}

function belge(s: Sablon): Document {
  return new Document({
    creator: "mikeTR",
    title: s.baslik,
    styles: { default: { document: { run: { font: FONT, size: PUNTO } } } },
    sections: [{ properties: { page: { margin: { top: 1418, bottom: 1418, left: 1418, right: 1418 } } }, children: s.bloklar.map(paragraf) }],
  });
}

const taraflarDava = (davaci = "DAVACI", davali = "DAVALI"): Blok[] => [
  { tur: "taraf", etiket: davaci, metin: "[Ad Soyad / Unvan], T.C. Kimlik No: [...], [Adres]" },
  { tur: "taraf", etiket: "VEKİLİ", metin: "[Av. Ad Soyad], [Baro, sicil no], [Adres, UETS adresi]" },
  { tur: "taraf", etiket: davali, metin: "[Ad Soyad / Unvan], [T.C. Kimlik No / MERSİS No], [Adres]" },
];

const imza = (sifat = "Davacı Vekili"): Blok => ({ tur: "imza", satirlar: [`${sifat}`, "[Av. Ad Soyad]", "[e-imzalıdır / imza]"] });

const SABLONLAR: Sablon[] = [
  {
    dosya: "Genel İhtarname (Temerrüt).docx",
    baslik: "Genel İhtarname (Temerrüt)",
    bloklar: [
      { tur: "not", metin: "Muaccel bir para borcu için borçluyu temerrüde düşürmek amacıyla noter aracılığıyla gönderilecek ihtarname taslağıdır (TBK md. 117)." },
      { tur: "baslik", metin: "İHTARNAME" },
      { tur: "taraf", etiket: "KEŞİDECİ", metin: "[Ad Soyad / Unvan], T.C. Kimlik No / Vergi No: [...], [Adres]" },
      { tur: "taraf", etiket: "VEKİLİ", metin: "[Av. Ad Soyad], [Adres]" },
      { tur: "taraf", etiket: "MUHATAP", metin: "[Ad Soyad / Unvan], [Adres]" },
      { tur: "taraf", etiket: "KONU", metin: "[Tutar] TL alacağın ödenmesi için süre verilmesi ve temerrüt ihtarıdır." },
      { tur: "bolum", metin: "AÇIKLAMALAR" },
      { tur: "madde", metin: "1. Müvekkilim ile tarafınız arasında [tarih] tarihli [sözleşme / fatura / ilişkinin türü] bulunmaktadır. Buna göre tarafınızın [vade tarihi] tarihinde ödemesi gereken [tutar] TL borcu muaccel hâle gelmiştir." },
      { tur: "madde", metin: "2. Tüm sözlü taleplere rağmen borç bugüne kadar ödenmemiştir. Muaccel bir borcun borçlusu, alacaklının ihtarıyla temerrüde düşer (TBK md. 117/1)." },
      { tur: "madde", metin: "3. İşbu ihtarnamenin tebliğinden itibaren [süre] gün içinde [tutar] TL'nin [IBAN / ödeme yeri] hesabına ödenmesini; aksi hâlde alacağın, temerrüt tarihinden itibaren işleyecek [kanuni / ticari temerrüt] faizi, yargılama giderleri ve vekâlet ücretiyle birlikte yasal yollarla tahsili için icra takibi ve dava yoluna başvurulacağını ihtar ederiz." },
      { tur: "paragraf", metin: "Sayın Noter; işbu ihtarnamenin bir suretinin muhataba tebliğini, bir suretinin dairenizde saklanmasını ve tebliğ şerhli bir suretinin tarafımıza verilmesini rica ederiz. [Tarih]" },
      imza("Keşideci Vekili"),
    ],
  },
  {
    dosya: "Kira Bedeli İhtarnamesi (TBK 315).docx",
    baslik: "Kira Bedeli İhtarnamesi (TBK 315)",
    bloklar: [
      { tur: "not", metin: "Ödenmeyen kira bedeli veya yan gider için TBK md. 315'e göre süre verip fesih uyarısı yapan ihtarname taslağıdır. Konut ve çatılı işyeri kiralarında süre en az otuz gün, diğer kiralarda en az on gündür; süre bildirimi izleyen günden işler." },
      { tur: "baslik", metin: "İHTARNAME" },
      { tur: "taraf", etiket: "KEŞİDECİ", metin: "[Kiraya verenin ad soyadı / unvanı], T.C. Kimlik No: [...], [Adres]" },
      { tur: "taraf", etiket: "VEKİLİ", metin: "[Av. Ad Soyad], [Adres]" },
      { tur: "taraf", etiket: "MUHATAP", metin: "[Kiracının ad soyadı / unvanı], [Kiralananın adresi]" },
      { tur: "taraf", etiket: "KONU", metin: "Ödenmeyen kira bedellerinin otuz gün içinde ödenmesi, aksi hâlde kira sözleşmesinin feshedileceği ihtarıdır." },
      { tur: "bolum", metin: "AÇIKLAMALAR" },
      { tur: "madde", metin: "1. Tarafınız, müvekkilime ait [adres] adresindeki [konut / çatılı işyeri] nitelikli taşınmazı [tarih] başlangıç tarihli kira sözleşmesiyle aylık [tutar] TL bedelle kiralamıştır." },
      { tur: "madde", metin: "2. Tarafınız [ay/yıl - ay/yıl] dönemlerine ait toplam [tutar] TL kira bedelini [ve yan giderleri] vadesinde ödememiştir." },
      { tur: "madde", metin: "3. TBK md. 315 uyarınca, işbu ihtarnamenin tebliğini izleyen günden itibaren otuz gün içinde birikmiş [tutar] TL kira bedelini [IBAN / ödeme yeri] ödemeniz gerektiğini; bu süre içinde ödeme yapılmaması hâlinde kira sözleşmesinin feshedileceğini ve kiralananın tahliyesi için yasal yollara başvurulacağını ihtar ederiz." },
      { tur: "paragraf", metin: "Sayın Noter; işbu ihtarnamenin bir suretinin muhataba tebliğini, bir suretinin dairenizde saklanmasını ve tebliğ şerhli bir suretinin tarafımıza verilmesini rica ederiz. [Tarih]" },
      imza("Keşideci Vekili"),
    ],
  },
  {
    dosya: "Ödeme Emrine İtiraz Dilekçesi (İİK 62).docx",
    baslik: "Ödeme Emrine İtiraz Dilekçesi (İİK 62)",
    bloklar: [
      { tur: "not", metin: "İlamsız takipte ödeme emrine itiraz dilekçesi taslağıdır. İtiraz, ödeme emrinin tebliğinden itibaren yedi gün içinde icra dairesine bildirilir; borcun bir kısmına itiraz ediliyorsa kısım ve miktar açıkça gösterilir, yurt içi adres bildirilir (İİK md. 62)." },
      { tur: "baslik", metin: "[İL] [NUMARA]. İCRA DAİRESİ MÜDÜRLÜĞÜ'NE" },
      { tur: "taraf", etiket: "DOSYA NO", metin: "[YYYY/NNNN] Esas" },
      { tur: "taraf", etiket: "İTİRAZ EDEN (BORÇLU)", metin: "[Ad Soyad / Unvan], T.C. Kimlik No: [...], [Yurt içi adres]" },
      { tur: "taraf", etiket: "VEKİLİ", metin: "[Av. Ad Soyad], [Adres]" },
      { tur: "taraf", etiket: "ALACAKLI", metin: "[Ad Soyad / Unvan], [Adres]" },
      { tur: "taraf", etiket: "KONU", metin: "[Tarih] tarihinde tebliğ edilen ödeme emrine süresi içinde itirazlarımızın sunulmasıdır." },
      { tur: "bolum", metin: "AÇIKLAMALAR" },
      { tur: "madde", metin: "1. Alacaklı tarafından aleyhimize yukarıda numarası yazılı dosyada [tutar] TL asıl alacak ve fer'ileri için ilamsız icra takibi başlatılmış, ödeme emri [tarih] tarihinde tebliğ edilmiştir." },
      { tur: "madde", metin: "2. Müvekkilimin alacaklıya böyle bir borcu bulunmamaktadır. [Borcun neden bulunmadığının kısa açıklaması: ödeme, takas, sözleşmenin yokluğu, zamanaşımı vb.]" },
      { tur: "madde", metin: "3. Bu nedenle borcun tamamına, faize, faiz oranına, fer'ilere ve tüm takip giderlerine itiraz ediyoruz. [Kısmi itiraz hâlinde: Borcun [tutar] TL'lik kısmına itiraz ediyor, [tutar] TL'lik kısmını kabul ediyoruz.] [Takip dayanağı belgedeki imzaya itiraz ediliyorsa bu açıkça belirtilmelidir.]" },
      { tur: "bolum", metin: "HUKUKİ SEBEPLER" },
      { tur: "paragraf", metin: "İİK md. 62 ve ilgili mevzuat." },
      { tur: "bolum", metin: "SONUÇ VE İSTEM" },
      { tur: "paragraf", metin: "Süresi içinde yaptığımız itirazımızın kabulü ile takibin durdurulmasına karar verilmesini saygıyla arz ve talep ederiz. [Tarih]" },
      imza("İtiraz Eden Vekili"),
    ],
  },
  {
    dosya: "İtirazın İptali Dava Dilekçesi (İİK 67).docx",
    baslik: "İtirazın İptali Dava Dilekçesi (İİK 67)",
    bloklar: [
      { tur: "not", metin: "İlamsız takibe yapılan itirazın iptali ve icra inkâr tazminatı için dava dilekçesi taslağıdır. Dava, itirazın tebliğinden itibaren bir yıl içinde açılır (İİK md. 67). Ticari davalarda dava açmadan önce arabulucuya başvurmak dava şartıdır (TTK md. 5/A); arabuluculuk son tutanağı dilekçeye eklenir (HUAK md. 18/A). Görevli mahkemeyi uyuşmazlığın niteliğine göre belirleyin." },
      { tur: "baslik", metin: "[İL] NÖBETÇİ [ASLİYE HUKUK / ASLİYE TİCARET] MAHKEMESİ'NE" },
      ...taraflarDava(),
      { tur: "taraf", etiket: "KONU", metin: "[İl] [No]. İcra Dairesi'nin [YYYY/NNNN] Esas sayılı dosyasına yapılan itirazın iptali, takibin devamı ve %20'den aşağı olmamak üzere icra inkâr tazminatına hükmedilmesi talebidir." },
      { tur: "taraf", etiket: "DAVA DEĞERİ", metin: "[Tutar] TL" },
      { tur: "bolum", metin: "AÇIKLAMALAR" },
      { tur: "madde", metin: "1. Müvekkilim ile davalı arasında [tarih] tarihli [sözleşme / ticari ilişki] bulunmaktadır. Bu ilişkiden doğan [tutar] TL alacak, [vade] tarihinde muaccel olmasına rağmen ödenmemiştir." },
      { tur: "madde", metin: "2. Alacağın tahsili için [İl] [No]. İcra Dairesi'nin [YYYY/NNNN] Esas sayılı dosyasıyla ilamsız takip başlatılmış; davalı ödeme emrine [tarih] tarihinde itiraz etmiş ve takip durmuştur. İtiraz müvekkilime [tarih] tarihinde tebliğ edilmiştir." },
      { tur: "madde", metin: "3. Davalının itirazı haksızdır. [Alacağın varlığını gösteren olgular: faturalar, teslim belgeleri, cari hesap, yazışmalar.]" },
      { tur: "madde", metin: "4. [Ticari dava ise:] Dava açılmadan önce arabulucuya başvurulmuş, [tarih] tarihli son tutanakla anlaşma sağlanamamıştır." },
      { tur: "madde", metin: "5. Alacak likit ve belirlenebilir olduğundan, itirazı haksız çıkan borçlunun, hükmolunan miktarın %20'sinden aşağı olmamak üzere icra inkâr tazminatına mahkûm edilmesi gerekir (İİK md. 67/2)." },
      { tur: "bolum", metin: "HUKUKİ SEBEPLER" },
      { tur: "paragraf", metin: "İİK md. 67, TBK, [TTK md. 5/A, HUAK md. 18/A], HMK ve ilgili mevzuat." },
      { tur: "bolum", metin: "DELİLLER" },
      { tur: "paragraf", metin: "[İcra dosyası], [sözleşme], [faturalar], [cari hesap ekstresi], [yazışmalar], [arabuluculuk son tutanağı], ticari defter ve kayıtlar, bilirkişi incelemesi, tanık, yemin ve her türlü yasal delil." },
      { tur: "bolum", metin: "SONUÇ VE İSTEM" },
      { tur: "paragraf", metin: "Yukarıda açıklanan nedenlerle; davalının [İl] [No]. İcra Dairesi'nin [YYYY/NNNN] Esas sayılı dosyasına yaptığı itirazın iptaline, takibin devamına, asıl alacağın %20'sinden aşağı olmamak üzere icra inkâr tazminatının davalıdan tahsiline, yargılama giderleri ve vekâlet ücretinin davalıya yükletilmesine karar verilmesini saygıyla arz ve talep ederiz. [Tarih]" },
      imza(),
      { tur: "paragraf", metin: "EKLER: 1- Vekâletname 2- [İcra dosyası sureti] 3- [Arabuluculuk son tutanağı] 4- [Deliller]" },
    ],
  },
  {
    dosya: "Kira Bedelinin Tespiti Dava Dilekçesi (TBK 344).docx",
    baslik: "Kira Bedelinin Tespiti Dava Dilekçesi (TBK 344)",
    bloklar: [
      { tur: "not", metin: "Yenilenen kira döneminde uygulanacak kira bedelinin tespiti için dava dilekçesi taslağıdır (TBK md. 344). Kira ilişkisinden doğan uyuşmazlıklarda dava açmadan önce arabulucuya başvurmak dava şartıdır (HUAK md. 18/B); son tutanak dilekçeye eklenir. Görevli mahkeme sulh hukuk mahkemesidir." },
      { tur: "baslik", metin: "[İL] NÖBETÇİ SULH HUKUK MAHKEMESİ'NE" },
      ...taraflarDava(),
      { tur: "taraf", etiket: "KONU", metin: "[Tarih] tarihinde başlayan kira döneminden itibaren aylık kira bedelinin [tutar] TL olarak tespiti talebidir." },
      { tur: "taraf", etiket: "DAVA DEĞERİ", metin: "[Tespiti istenen ile mevcut aylık kira arasındaki farkın on iki aylık tutarı] TL" },
      { tur: "bolum", metin: "AÇIKLAMALAR" },
      { tur: "madde", metin: "1. Davalı, müvekkilime ait [adres] adresindeki taşınmazı [tarih] başlangıç tarihli kira sözleşmesiyle kiralamıştır. Hâlen ödenen aylık kira bedeli [tutar] TL'dir." },
      { tur: "madde", metin: "2. Taraflar yeni kira döneminde uygulanacak kira bedeli konusunda anlaşamamıştır. Dava açılmadan önce arabulucuya başvurulmuş, [tarih] tarihli son tutanakla anlaşma sağlanamamıştır." },
      { tur: "madde", metin: "3. [Kira ilişkisi beş yıldan kısa ise:] Yeni kira bedeli, bir önceki kira yılında tüketici fiyat endeksindeki on iki aylık ortalamalara göre değişim oranını geçmemek koşuluyla, kiralananın durumu göz önüne alınarak hakkaniyete göre belirlenmelidir (TBK md. 344/2)." },
      { tur: "madde", metin: "4. [Kira ilişkisi beş yılı aşmışsa:] Beş yıldan uzun süreli veya beş yıldan sonra yenilenen kira sözleşmelerinde yeni kira bedeli; TÜFE'deki on iki aylık ortalamalara göre değişim oranı, kiralananın durumu ve emsal kira bedelleri göz önünde tutularak hakkaniyete uygun biçimde belirlenir (TBK md. 344/3). Bölgedeki emsal kiralar [tutar aralığı] TL'dir." },
      { tur: "madde", metin: "5. [Dava yeni kira döneminin başlangıcından en geç otuz gün önce açılmıştır / Kiracıya bu süre içinde [tarih] tarihli yazılı bildirimle kiranın artırılacağı bildirilmiştir.] Bu nedenle belirlenecek kira bedeli, yeni kira döneminin başlangıcı olan [tarih] tarihinden itibaren davalıyı bağlar (TBK md. 345/2). [Sözleşmede artış hükmü varsa TBK md. 345/3'e dayanın; tarihleri kontrol edin.]" },
      { tur: "bolum", metin: "HUKUKİ SEBEPLER" },
      { tur: "paragraf", metin: "TBK md. 344, 345; HUAK md. 18/B; HMK ve ilgili mevzuat." },
      { tur: "bolum", metin: "DELİLLER" },
      { tur: "paragraf", metin: "[Kira sözleşmesi], [arabuluculuk son tutanağı], [ihtarname / bildirim], [emsal kira sözleşmeleri ve ilanlar], keşif, bilirkişi incelemesi, tanık ve her türlü yasal delil." },
      { tur: "bolum", metin: "SONUÇ VE İSTEM" },
      { tur: "paragraf", metin: "Yukarıda açıklanan nedenlerle; [tarih] tarihinden itibaren başlayan kira döneminde aylık kira bedelinin [tutar] TL olarak tespitine, yargılama giderleri ve vekâlet ücretinin davalıya yükletilmesine karar verilmesini saygıyla arz ve talep ederiz. [Tarih]" },
      imza(),
      { tur: "paragraf", metin: "EKLER: 1- Vekâletname 2- [Kira sözleşmesi] 3- [Arabuluculuk son tutanağı] 4- [Deliller]" },
    ],
  },
  {
    dosya: "Kiracının Temerrüdü Nedeniyle Tahliye Dava Dilekçesi (TBK 315).docx",
    baslik: "Kiracının Temerrüdü Nedeniyle Tahliye Dava Dilekçesi (TBK 315)",
    bloklar: [
      { tur: "not", metin: "TBK md. 315'e göre süre verilip fesih uyarısı yapıldıktan sonra kira bedeli ödenmediğinde tahliye davası taslağıdır. Dava yoluyla tahliyede dava açmadan önce arabulucuya başvurmak dava şartıdır (HUAK md. 18/B; ilamsız icra yoluyla tahliye bunun dışındadır). Görevli mahkeme sulh hukuk mahkemesidir." },
      { tur: "baslik", metin: "[İL] NÖBETÇİ SULH HUKUK MAHKEMESİ'NE" },
      ...taraflarDava(),
      { tur: "taraf", etiket: "KONU", metin: "Kira bedelinin ödenmemesi nedeniyle feshedilen kira sözleşmesine dayanılarak kiralananın tahliyesi talebidir." },
      { tur: "taraf", etiket: "DAVA DEĞERİ", metin: "[Yıllık kira bedeli] TL" },
      { tur: "bolum", metin: "AÇIKLAMALAR" },
      { tur: "madde", metin: "1. Davalı, müvekkilime ait [adres] adresindeki [konut / çatılı işyeri] nitelikli taşınmazı [tarih] başlangıç tarihli kira sözleşmesiyle aylık [tutar] TL bedelle kiralamıştır." },
      { tur: "madde", metin: "2. Davalı, kiralananın tesliminden sonra muaccel olan [ay/yıl - ay/yıl] dönemlerine ait [tutar] TL kira bedelini ödememiştir." },
      { tur: "madde", metin: "3. Davalıya [noter, tarih, yevmiye no] ihtarname ile, tebliğini izleyen günden itibaren otuz gün içinde ödeme yapmaması hâlinde sözleşmenin feshedileceği bildirilmiştir. İhtarname [tebliğ tarihi] tarihinde tebliğ edilmiş, verilen süre [sürenin son günü] tarihinde dolmuş, ancak ödeme yapılmamıştır (TBK md. 315)." },
      { tur: "madde", metin: "4. Dava açılmadan önce arabulucuya başvurulmuş, [tarih] tarihli son tutanakla anlaşma sağlanamamıştır (HUAK md. 18/B)." },
      { tur: "bolum", metin: "HUKUKİ SEBEPLER" },
      { tur: "paragraf", metin: "TBK md. 315; HUAK md. 18/B; HMK ve ilgili mevzuat." },
      { tur: "bolum", metin: "DELİLLER" },
      { tur: "paragraf", metin: "[Kira sözleşmesi], [ihtarname ve tebliğ şerhi], [ödeme kayıtları / banka dökümleri], [arabuluculuk son tutanağı], tanık ve her türlü yasal delil." },
      { tur: "bolum", metin: "SONUÇ VE İSTEM" },
      { tur: "paragraf", metin: "Yukarıda açıklanan nedenlerle; kiralananın davalıdan tahliyesine, yargılama giderleri ve vekâlet ücretinin davalıya yükletilmesine karar verilmesini saygıyla arz ve talep ederiz. [Tarih]" },
      imza(),
      { tur: "paragraf", metin: "EKLER: 1- Vekâletname 2- [Kira sözleşmesi] 3- [İhtarname ve tebliğ şerhi] 4- [Arabuluculuk son tutanağı]" },
    ],
  },
  {
    dosya: "Cevap Dilekçesi (HMK 127-129).docx",
    baslik: "Cevap Dilekçesi (HMK 127-129)",
    bloklar: [
      { tur: "not", metin: "Yazılı yargılama usulünde cevap dilekçesi taslağıdır. Süre, dava dilekçesinin tebliğinden itibaren iki haftadır; zorunlu hâllerde bu süre içinde başvurularak bir defaya mahsus ve bir ayı geçmemek üzere ek süre istenebilir (HMK md. 127). Dilekçe HMK md. 129'daki unsurları içermelidir." },
      { tur: "baslik", metin: "[İL] [NUMARA]. [MAHKEME ADI] MAHKEMESİ'NE" },
      { tur: "taraf", etiket: "DOSYA NO", metin: "[YYYY/NNNN] Esas" },
      ...taraflarDava("DAVALI", "DAVACI").map((b, i) => (i === 1 && b.tur === "taraf" ? { ...b, etiket: "VEKİLİ" } : b)),
      { tur: "taraf", etiket: "KONU", metin: "[Tarih] tarihinde tebliğ edilen dava dilekçesine karşı cevaplarımızın sunulmasıdır." },
      { tur: "bolum", metin: "USULE İLİŞKİN İTİRAZLAR" },
      { tur: "madde", metin: "1. [Varsa: görev, yetki, dava şartı (ör. zorunlu arabuluculuk) ve zamanaşımı itirazları. Yetki itirazı cevap dilekçesinde ileri sürülmelidir.]" },
      { tur: "bolum", metin: "ESASA İLİŞKİN CEVAPLAR" },
      { tur: "madde", metin: "1. Davacının iddiaları kabul edilmemektedir. [Savunmanın dayanağı olan vakıaların sıra numarası altında açık özetleri.]" },
      { tur: "madde", metin: "2. [Her bir vakıanın hangi delillerle ispat edileceği.]" },
      { tur: "bolum", metin: "HUKUKİ SEBEPLER" },
      { tur: "paragraf", metin: "HMK md. 127, 129; [dayanılan diğer maddeler]." },
      { tur: "bolum", metin: "DELİLLER" },
      { tur: "paragraf", metin: "[Belgeler], [tanık], [bilirkişi], [keşif], yemin ve her türlü yasal delil." },
      { tur: "bolum", metin: "SONUÇ VE İSTEM" },
      { tur: "paragraf", metin: "Yukarıda açıklanan nedenlerle; [usulden / esastan] davanın reddine, yargılama giderleri ve vekâlet ücretinin davacıya yükletilmesine karar verilmesini saygıyla arz ve talep ederiz. [Tarih]" },
      imza("Davalı Vekili"),
    ],
  },
  {
    dosya: "İstinaf Başvuru Dilekçesi (HMK 342-345).docx",
    baslik: "İstinaf Başvuru Dilekçesi (HMK 342-345)",
    bloklar: [
      { tur: "not", metin: "İlk derece mahkemesi kararına karşı istinaf dilekçesi taslağıdır. Süre, kararın usulen tebliğinden itibaren iki haftadır (HMK md. 345). Dilekçe kararı veren mahkemeye verilir ve HMK md. 342'deki unsurları içermelidir; karşı taraf sayısı kadar örnek eklenir. Süre hesabı için mikeTR'nin süre hesaplama aracını kullanabilirsiniz." },
      { tur: "baslik", metin: "[BÖLGE ADLİYE MAHKEMESİ] İLGİLİ HUKUK DAİRESİ'NE" },
      { tur: "paragraf", metin: "Gönderilmek üzere: [İL] [NUMARA]. [MAHKEME ADI] MAHKEMESİ'NE" },
      { tur: "taraf", etiket: "DOSYA NO", metin: "[YYYY/NNNN] Esas, [YYYY/NNNN] Karar" },
      { tur: "taraf", etiket: "İSTİNAF EDEN", metin: "[Davadaki sıfatı], [Ad Soyad / Unvan], T.C. Kimlik No: [...], [Adres]" },
      { tur: "taraf", etiket: "VEKİLİ", metin: "[Av. Ad Soyad], [Adres]" },
      { tur: "taraf", etiket: "KARŞI TARAF", metin: "[Davadaki sıfatı], [Ad Soyad / Unvan], T.C. Kimlik No: [...], [Adres]" },
      { tur: "taraf", etiket: "KARAR TARİHİ", metin: "[Tarih]" },
      { tur: "taraf", etiket: "TEBLİĞ TARİHİ", metin: "[Kararın başvurana tebliğ edildiği tarih]" },
      { tur: "taraf", etiket: "KONU", metin: "Yukarıda numarası yazılı kararın [kaldırılması / düzeltilmesi] istemiyle istinaf başvurusudur." },
      { tur: "bolum", metin: "KARARIN ÖZETİ" },
      { tur: "paragraf", metin: "[İlk derece mahkemesinin verdiği kararın kısa özeti.]" },
      { tur: "bolum", metin: "İSTİNAF SEBEPLERİ" },
      { tur: "madde", metin: "1. [Usule aykırılıklar: ör. delillerin toplanmaması, savunma hakkının kısıtlanması, gerekçesiz karar.]" },
      { tur: "madde", metin: "2. [Esasa ilişkin hatalar: maddi olguların ve delillerin yanlış değerlendirilmesi, hukukun yanlış uygulanması.]" },
      { tur: "bolum", metin: "HUKUKİ SEBEPLER" },
      { tur: "paragraf", metin: "HMK md. 341 vd., md. 342, 345, 353 ve 355; [dayanılan diğer maddeler]." },
      { tur: "bolum", metin: "SONUÇ VE İSTEM" },
      { tur: "paragraf", metin: "Yukarıda açıklanan ve re'sen gözetilecek nedenlerle; ilk derece mahkemesi kararının kaldırılarak [davanın kabulüne / reddine] veya dosyanın yeniden görülmek üzere ilk derece mahkemesine gönderilmesine karar verilmesini saygıyla arz ve talep ederiz. [Tarih]" },
      imza("İstinaf Eden Vekili"),
    ],
  },
];

async function main() {
  const repo = path.join(__dirname, "..", "..", "..");
  const grup = "mikeTR/Dilekçeler";
  const dir = path.join(repo, "frontend/public/preset-templates", grup);
  fs.mkdirSync(dir, { recursive: true });
  const katalogYolu = path.join(repo, "frontend/src/app/components/library/presetTemplates.json");
  const katalog = (JSON.parse(fs.readFileSync(katalogYolu, "utf8")) as { id: string; publisher: string }[]).filter(
    (k) => k.publisher !== "mikeTR",
  );
  // Türkçe şablonlar katalogda en başta görünür.
  const yeni: unknown[] = [];
  for (const s of SABLONLAR) {
    const bytes = Buffer.from(await Packer.toBuffer(belge(s)));
    fs.writeFileSync(path.join(dir, s.dosya), bytes);
    yeni.push({
      id: `${grup}/${s.dosya}`,
      filename: s.dosya,
      title: s.baslik,
      publisher: "mikeTR",
      group: grup,
      format: "docx",
      sourceUrl: "https://github.com/skraptt/mikeTR",
      license: "CC0 1.0 (mikeTR taslağı; avukat kontrolü gerekir)",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      size: bytes.byteLength,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    });
    console.log(`${s.dosya} (${bytes.byteLength} bayt)`);
  }
  fs.writeFileSync(katalogYolu, `${JSON.stringify([...yeni, ...katalog], null, 2)}\n`);
  console.log(`${SABLONLAR.length} şablon yazıldı; katalog güncellendi.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
