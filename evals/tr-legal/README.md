# mikeTR Türk hukuku değerlendirme seti

> **Durum: taslak.** Soruların ve beklenen cevapların bir hukukçu tarafından
> gözden geçirilmesi gerekir. `incelendi: false` olan sorular henüz
> onaylanmamıştır.

Bu set, mikeTR'yi farklı modellerle (Gemini, Claude, GPT, Qwen, GLM-Legal vb.)
aynı sorularla karşılaştırmak için hazırlandı. Amaç modelin genel hukuk
bilgisini değil, **mikeTR'nin araçlarını doğru kullanarak doğru ve dürüst
cevap verip vermediğini** ölçmektir:

- Doğru kanun maddesini bulup ona dayanıyor mu?
- Maddeyi doğru aktarıyor mu, başka bir maddeyle karıştırıyor mu?
- Yürürlükten kalkmış ya da değişmiş hükümleri fark ediyor mu?
- Veritabanında olmayan bir kanun sorulduğunda bunu açıkça söylüyor mu,
  yoksa madde numarası mı uyduruyor?
- İçtihat gerektiğinde doğru mahkemede arıyor, kararı okuyor ve künyeyi
  resmî kaynaktan mı alıyor?

Sorular [`sorular.yaml`](sorular.yaml) dosyasındadır. Beklenen maddeler, 13
Ekim 2026 itibarıyla mikeTR veritabanındaki (mevzuat.gov.tr ile karşılaştırılmış)
metinlerden kontrol edilmiştir.

## Soru alanları

| Alan | Ne ölçer |
|---|---|
| `beklenen_maddeler` | Cevabın dayanması gereken maddeler (kanun no + madde no). |
| `beklenen_noktalar` | Doğru bir cevabın içermesi gereken hukuki noktalar. |
| `tuzaklar` | Sık yapılan hatalar; bunlardan biri cevaptaysa puan düşer. |
| `kapsam_disi` | Veritabanında olmayan bir kanun gerekiyorsa `true`. Model bunu açıkça belirtmeli ve o kanun için madde numarası vermemeli. |
| `ictihat` | İçtihat araması beklenen sorularda hangi mahkemede ve hangi filtrelerle aranması gerektiği. |
| `guncellik` | Değişiklik ya da yürürlükten kalkma bilgisini ölçen sorular. |

## Puanlama

Her soru 0–10 puan üzerinden değerlendirilir:

| Ölçüt | Puan |
|---|---|
| Beklenen maddeleri buldu ve atıf yaptı | 0–3 |
| Maddelerin içeriğini doğru aktardı (`beklenen_noktalar`) | 0–3 |
| `tuzaklar`dan hiçbirine düşmedi | 0–2 |
| Kapsam dışı / güncellik / içtihat gereği doğru karşılandı (soruda yoksa tam puan) | 0–2 |

**Sıfırlayan hata:** Veritabanında olmayan bir madde numarası ya da var olmayan
bir karar künyesi uydurmak, o sorunun puanını 0 yapar. mikeTR'nin atıf kontrolü
(`kanun_citations`) bunu kısmen otomatik yakalar: `bulunamadi` durumu uydurma,
`okunmadi` ise okunmadan yapılmış atıf demektir.

## Nasıl çalıştırılır

Şimdilik elle:

1. mikeTR'de değerlendirilecek modeli seçin ve her soruyu **yeni bir sohbette**
   sorun.
2. Cevabı, atıf kontrolü kutusunu ve hangi araçların kullanıldığını (mevzuat
   araması, içtihat araması, karar okuma) kaydedin.
3. Yukarıdaki ölçütlere göre puanlayın.

İleride bu adımları otomatik çalıştıran bir betik eklenebilir; atıf kontrolü ve
araç kullanımı zaten sohbet olaylarında kayıtlı.

## Uyarı

Bu set gerçek müvekkil verisi içermez ve içermemelidir. Sorular genel
niteliktedir. Ücretsiz katman API anahtarlarıyla yapılan testlerde gönderilen
metinler sağlayıcının ürün geliştirmesinde kullanılabilir.
