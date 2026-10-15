# mikeTR

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
- **Mevzuat araması:** 13 kanunun tam metninde anlam araması yapar. "Kiracının
  temerrüdü" gibi bir konu yazabilir ya da "HMK 107", "TBK md. 49" gibi doğrudan
  madde atfıyla arayabilirsiniz.
- **İçtihat araması:** Yargıtay, Danıştay, Anayasa Mahkemesi (bireysel başvuru
  ve norm denetimi) kararlarında ve UYAP Emsal'deki bölge adliye ve ilk derece
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
- **Mike'ın özellikleri:** belgelerle sohbet, önerilen düzenlemeleri uygulama,
  tablo hâlinde belge inceleme, hazır iş akışları, proje ve klasörler.
- **Türkçe iş akışları:** sözleşme incelemeleri, tablo incelemeleri, hukuki
  araştırma notu ve ihtarname taslağı Türk hukukuna uyarlanmıştır
  ([skraptt/mike-workflows-tr](https://github.com/skraptt/mike-workflows-tr)).
- **Kendi anahtarınızla:** Anthropic (Claude), Google (Gemini) ya da OpenAI
  anahtarınızı Ayarlar'dan eklersiniz. İsterseniz Ollama ile modelleri tamamen
  kendi bilgisayarınızda da çalıştırabilirsiniz.

### Kapsanan kanunlar

| Kanun | No |
|---|---|
| Türk Medeni Kanunu (TMK) ve Yürürlük Kanunu | 4721, 4722 |
| Türk Borçlar Kanunu (TBK) ve Yürürlük Kanunu | 6098, 6101 |
| Türk Ticaret Kanunu (TTK) ve Yürürlük Kanunu | 6102, 6103 |
| Hukuk Muhakemeleri Kanunu (HMK) | 6100 |
| Fikir ve Sanat Eserleri Kanunu (FSEK) | 5846 |
| Çek Kanunu | 5941 |
| Sermaye Piyasası Kanunu (SPK) | 6362 |
| Tüketicinin Korunması Hakkında Kanun (TKHK) | 6502 |
| Kişisel Verilerin Korunması Kanunu (KVKK) | 6698 |
| Sınai Mülkiyet Kanunu (SMK) | 6769 |

Kapsam dışındaki bir konuda (ör. İş Kanunu, İcra ve İflas Kanunu) asistan,
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

- Kanun metinlerini yeniden içe aktarmak, vektörleri hesaplamak ve
  mevzuat.gov.tr ile karşılaştırmak için `backend/` içinde `npm run kanun:import`,
  `npm run kanun:embed` ve `npm run kanun:check` komutları vardır.
- Projeyle gelen veri paketini (`backend/setup-data/kanun-maddeleri.csv.gz`)
  güncel veritabanından yeniden üretmek için: `npm run kanun:snapshot`.
- Mike'ın kendi belgeleri (İngilizce): [README.en.md](README.en.md) ve
  [docs/](docs/README.md).

## Lisans

mikeTR, Mike gibi [GNU Affero General Public License v3.0](LICENSE) ile
lisanslanmıştır. Değiştirilmiş bir sürümü başkalarının kullanımına sunarsanız
kaynak kodunu da paylaşmanız gerekir. Kanun metinleri resmî metinlerdir ve
FSEK md. 31 uyarınca serbestçe kullanılabilir. Mike'a ve kullanılan açık kaynak
projelere teşekkürler: [CREDITS.md](CREDITS.md).
