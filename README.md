# mikeTR

**Türkçe** | [English](README.en.md)

Türk hukukçular için açık kaynak yapay zekâ asistanı. Belgelerinizi inceler,
taslak hazırlar ve Türk mevzuatında araştırma yapar. Kendi bilgisayarınızda
çalışır.

mikeTR, açık kaynak hukuk asistanı [Mike](https://github.com/willchen96/mike)
üzerine kuruludur. Mike'ın belge inceleme, düzenleme, tablo hâlinde inceleme ve
iş akışı özelliklerine Türkçe arayüz ve Türk mevzuatı araması eklenmiştir.

> **Önemli:** mikeTR hukuki danışmanlık yerine geçmez. Kanun metinlerinin
> güncelliğini ve asistanın cevaplarını her zaman resmî kaynaktan kontrol edin.

![Mevzuat araması: "kiracının temerrüdü" için TBK md. 315 ve ilgili maddeler](docs/assets/miketr-mevzuat.jpg)

![Güncellemeler: her kanunun mevzuat.gov.tr ile son karşılaştırılma tarihi](docs/assets/miketr-guncellemeler.jpg)

![İçtihat araması: Yargıtay 3. Hukuk Dairesi, "kiracının temerrüdü", en yeni kararlar](docs/assets/miketr-ictihat.jpg)

![İş akışları: Türk hukukuna uyarlanmış hazır iş akışları](docs/assets/miketr-is-akislari.jpg)

## Özellikler

- **Türkçe arayüz:** Mike'ın tüm ekranları Türkçeye çevrildi.
- **Mevzuat araması:** 42 kanunun tam metninde anlam araması yapar. "Kiracının
  temerrüdü" gibi bir konu yazabilir ya da "HMK 107", "TBK md. 49" gibi doğrudan
  madde atfıyla arayabilirsiniz.
- **İçtihat araması:** Yargıtay (kanun yararına bozma kararları dahil), Danıştay,
  Anayasa Mahkemesi (bireysel başvuru ve norm denetimi) kararlarında ve UYAP Emsal'deki bölge adliye ve ilk derece
  mahkemesi kararlarında arama yapar. Daireye, karar tarihine ve kesinleşme
  durumuna göre süzer; kararın tam metnini açar ve resmî sayfasına bağlantı
  verir. Asistan, bir karara atıf yapmadan önce kararı
  bulur ve okur; künyeyi (daire, esas/karar no, tarih) hafızasından değil resmî
  kaynaktan alır.
- **Kanuna dayalı cevaplar:** Asistan, hukuki bir kural söylemeden önce ilgili
  maddeyi arar. Cevaptaki her kanun atfı, gerçekten okunan maddelerle
  karşılaştırılıp işaretlenir.
- **Güncellik kontrolü:** Kanun metinleri her gün mevzuat.gov.tr ile
  karşılaştırılır. Bulunan değişiklikler, siz onaylayınca uygulanır; eski metin
  arşivde saklanır.
- **Hesaplamalar:** HMK/İİK/CMK/TBK süre hesabı (tatiller ve adli tatil dahil),
  kanuni ve ticari temerrüt faizi (3095 s. K.), dava açılışı harçları ve kıdem
  ve ihbar tazminatı (tavan ve vergi kesintileriyle); hem
  Hesaplamalar sayfasında hem asistanın araçları olarak.
- **Dilekçe şablonları:** Kütüphane > Hazır şablonlar > mikeTR altında ihtarname,
  ödeme emrine itiraz, itirazın iptali, kira tespiti, tahliye, cevap ve istinaf
  dilekçesi taslakları (doldurulacak alanlar vurgulu; avukat kontrolü gerekir).
- **UYAP UDF:** .udf dosyalarını yükleyebilir, Word belgelerini UYAP'a
  yüklenebilir .udf olarak indirebilirsiniz (metin, biçim, hizalama ve tablolar).
- **Mike'ın özellikleri:** belgelerle sohbet, önerilen düzenlemeleri uygulama,
  tablo hâlinde belge inceleme, hazır iş akışları, proje ve klasörler.
- **Türkçe iş akışları:** sözleşme incelemeleri, tablo incelemeleri, hukuki
  araştırma notu ve ihtarname taslağı Türk hukukuna uyarlanmıştır
  ([skraptt/mike-workflows-tr](https://github.com/skraptt/mike-workflows-tr)).
- **Kendi anahtarınızla:** Anthropic (Claude), Google (Gemini) ya da OpenAI
  anahtarınızı Ayarlar'dan eklersiniz. İsterseniz Ollama ile modelleri tamamen
  kendi bilgisayarınızda da çalıştırabilirsiniz.

### Kapsanan kanunlar

42 kanun, yaklaşık 9.000 madde:

| Alan | Kanunlar |
|---|---|
| Medeni hukuk ve borçlar | Türk Medeni Kanunu (4721) ve Yürürlük Kanunu (4722), Türk Borçlar Kanunu (6098) ve Yürürlük Kanunu (6101), Kat Mülkiyeti Kanunu (634), Tapu Kanunu (2644) |
| Ticaret ve fikrî mülkiyet | Türk Ticaret Kanunu (6102) ve Yürürlük Kanunu (6103), Çek Kanunu (5941), Sermaye Piyasası Kanunu (6362), Rekabetin Korunması Hakkında Kanun (4054), Fikir ve Sanat Eserleri Kanunu (5846), Sınai Mülkiyet Kanunu (6769) |
| Tüketici ve veri | Tüketicinin Korunması Hakkında Kanun (6502), Kişisel Verilerin Korunması Kanunu (6698), 5651 sayılı İnternet Kanunu |
| Yargılama, icra ve meslek | Hukuk Muhakemeleri Kanunu (6100), İcra ve İflas Kanunu (2004), Hukuk Uyuşmazlıklarında Arabuluculuk Kanunu (6325), Tebligat Kanunu (7201), Avukatlık Kanunu (1136), Noterlik Kanunu (1512) |
| İş ve sosyal güvenlik | İş Kanunu (4857), 1475 sayılı İş Kanunu (yürürlükteki 14. madde: kıdem tazminatı), İş Mahkemeleri Kanunu (7036), Sosyal Sigortalar ve Genel Sağlık Sigortası Kanunu (5510) |
| Ceza | Türk Ceza Kanunu (5237), Ceza Muhakemesi Kanunu (5271), Ceza ve Güvenlik Tedbirlerinin İnfazı Hakkında Kanun (5275), Kabahatler Kanunu (5326), 6284 sayılı Kanun, Karayolları Trafik Kanunu (2918) |
| Kamu hukuku | Anayasa (2709), İdari Yargılama Usulü Kanunu (2577), Devlet Memurları Kanunu (657), Kamulaştırma Kanunu (2942), İmar Kanunu (3194), Kamu İhale Kanunu (4734) |
| Vergi | Vergi Usul Kanunu (213), Gelir Vergisi Kanunu (193), Katma Değer Vergisi Kanunu (3065), Amme Alacaklarının Tahsil Usulü Hakkında Kanun (6183) |

Kapsam dışındaki bir konuda (ör. Harçlar Kanunu, yönetmelikler) asistan,
cevabının veritabanıyla doğrulanmadığını açıkça belirtir.

## Kurulum

### Gerekenler

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Mac,
  Windows ya da Linux)
- En az 8 GB bellek ve 20 GB boş disk alanı
- Bir yapay zekâ sağlayıcısının API anahtarı (Anthropic, Google ya da OpenAI),
  ya da yerel modeller için [Ollama](https://ollama.com)

### Adımlar

1. Projeyi indirin ve klasörüne girin:

   ```bash
   git clone https://github.com/skraptt/mikeTR.git
   cd mikeTR
   ```

2. Ayar dosyalarını oluşturun:

   ```bash
   cp .env.example .env
   cp backend/.env.example backend/.env
   ```

3. `backend/.env` dosyasını bir metin düzenleyiciyle açın:
   - `DOWNLOAD_SIGNING_SECRET` ve `USER_API_KEYS_ENCRYPTION_SECRET` satırlarına
     iki ayrı rastgele değer yazın. Her biri için şu komutun çıktısını kullanın:

     ```bash
     openssl rand -hex 32
     ```

   - `KANUN_ADMIN_EMAILS` satırına kendi e-posta adresinizi yazın. Mevzuat
     güncellemelerini bu adresle giriş yapan hesap onaylar.

4. Başlatın:

   ```bash
   docker compose up --build
   ```

   İlk açılış 10–20 dakika sürer: uygulama derlenir ve arama modeli (BGE-M3,
   yaklaşık 1,2 GB) indirilir. Kanun metinleri ve vektörleri projeyle birlikte
   gelir; ayrıca hesaplanmaz. Sonraki açılışlar birkaç saniye sürer.

5. Tarayıcıda <http://localhost:3000> adresini açın ve **Kayıt ol** ile hesap
   oluşturun.

6. Onay e-postası gerçek posta kutunuza gitmez; bilgisayarınızdaki test posta
   kutusuna düşer. <http://localhost:8025> adresini açın ve e-postadaki
   bağlantıya tıklayın.

7. Giriş yapın ve **Ayarlar** bölümünden yapay zekâ sağlayıcınızın API
   anahtarını ekleyin.

Durdurmak için terminalde **Ctrl + C**'ye basın ya da `docker compose down`
çalıştırın. Verileriniz silinmez; `docker compose up` ile kaldığınız yerden
devam edersiniz.

### Güncelleme

```bash
git pull
docker compose up --build
```

## Kullanım

- **Asistan:** Ana ekrandan soru sorun ya da belge yükleyin. Türk hukukuna
  ilişkin sorularda asistan, ilgili maddeleri arar ve cevabında atıf yapar.
- **Mevzuat:** Kenar çubuğundaki **Mevzuat** sayfasından ya da ana ekrandaki
  arama kutusundan kanun maddelerini doğrudan arayın.
- **İçtihat:** Kenar çubuğundaki **İçtihat** sayfasından birkaç belirleyici
  terimle karar arayın (ör. `"ihtiyaç nedeniyle tahliye" konut`). Her sözcük
  kararda geçmelidir; kalıp ifadeleri çift tırnak içine alın.
- **Güncellemeler:** Uygulama çalışırken kanunları günde bir kez
  mevzuat.gov.tr ile karşılaştırır. Fark bulunursa **Mevzuat > Güncellemeler**
  sayfasında eski ve yeni metni yan yana görür, onaylar ya da reddedersiniz.

## Verileriniz nerede?

Yerel kurulumda belgeleriniz, sohbetleriniz ve hesabınız yalnızca kendi
bilgisayarınızdaki Docker içinde saklanır. Dışarıya giden tek şey, asistana
gönderdiğiniz metin ve belgelerin seçtiğiniz yapay zekâ sağlayıcısına
iletilmesidir.

Müvekkil verisiyle çalışacaksanız, sağlayıcının verileri eğitimde
kullanmadığından ve sözleşmesinin KVKK md. 9 (yurt dışına aktarım) ile avukatın
sır saklama yükümlülüğüne uygun olduğundan emin olun. Verinin bilgisayardan hiç
çıkmamasını istiyorsanız Ollama ile yerel bir model kullanın.

### Telemetri (hata raporları)

mikeTR varsayılan olarak hiçbir hata raporu göndermez. Kendi Sentry
projenize rapor göndermek isterseniz `SENTRY_DSN` (sunucu) ve
`FRONTEND_SENTRY_DSN` (web uygulaması) değişkenlerini ayarlayın.
`SENTRY_DISABLED=false` ayarlarsanız raporlar, mikeTR'nin üzerine kurulduğu
Mike projesinin ABD'de barındırılan Sentry hesabına gider. Bu raporlar belge
içeriği ve kimlik bilgisi içermez; ayrıntılar
[observability.md](docs/observability.md) dosyasındadır. Bu seçeneği açmadan
önce KVKK md. 9 kapsamındaki yurt dışına aktarım şartlarını değerlendirin.

## Sunucuya kurulum

mikeTR'yi bir sunucuda, ekibinizle birlikte kullanmak için
[deploy/README.md](deploy/README.md) dosyasındaki adımları izleyin.

## Geliştirme

- Listeye yeni bir kanun eklemek için `backend/src/lib/kanunList.ts` dosyasına
  ekleyip `npm run kanun:fetch` ve `npm run kanun:embed` çalıştırın.
- Kanun metinlerini yeniden içe aktarmak, vektörleri hesaplamak ve
  mevzuat.gov.tr ile karşılaştırmak için `backend/` içinde `npm run kanun:import`,
  `npm run kanun:embed` ve `npm run kanun:check` komutları vardır.
- Projeyle gelen veri paketini (`backend/setup-data/kanun-maddeleri.csv.gz`)
  güncel veritabanından yeniden üretmek için: `npm run kanun:snapshot`.
- Mike'ın kendi belgeleri (İngilizce): [README.mike.md](README.mike.md) ve
  [docs/](docs/README.md).

## Lisans

mikeTR, Mike gibi [GNU Affero General Public License v3.0](LICENSE) ile
lisanslanmıştır. Değiştirilmiş bir sürümü başkalarının kullanımına sunarsanız
kaynak kodunu da paylaşmanız gerekir. Kanun metinleri resmî metinlerdir ve
FSEK md. 31 uyarınca serbestçe kullanılabilir. Mike'a ve kullanılan açık kaynak
projelere teşekkürler: [CREDITS.md](CREDITS.md).
