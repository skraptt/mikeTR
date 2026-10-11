# mikeTR canlı ortam kurulumu

Tek bir Linux sunucu üzerinde çalışan, yönetilen Supabase ve S3 uyumlu
depolama kullanan kurulum. Upstream Mike'ın genel dağıtım belgesi
[docs/deployment.md](../docs/deployment.md) dosyasındadır; bu belge mikeTR'ye
özgü adımları sırasıyla verir.

```
İnternet ──443──> Caddy (HTTPS) ──> frontend (Next.js, /api ağ geçidi)
                                        └──> backend (API + worker'lar) ──> Supabase
                                                  ├──> Ollama (BGE-M3)       └──> Cloudflare R2
                                                  └──> yapay zekâ sağlayıcıları, mevzuat.gov.tr
```

## 0. Hukuki ön koşul

Müvekkil belgeleri kişisel veri içerir ve avukatın sır saklama yükümlülüğü
kapsamındadır. Supabase (AB) ve yapay zekâ sağlayıcıları (ABD) yurt dışındadır.
Gerçek müvekkil verisiyle açmadan önce KVKK md. 9 kapsamındaki aktarım
koşullarını (standart sözleşme ve bildirim), aydınlatma metnini ve
sağlayıcılarla veri işleme sözleşmelerini bir uzmana kontrol ettirin.
mevzuat.gov.tr'nin kullanım koşullarını da otomatik günlük kontrol açısından
gözden geçirin.

## 1. Hesaplar

| Hizmet | Gerekli | Not |
|---|---|---|
| Sunucu | 4 vCPU, 8 GB RAM, 40 GB disk, Ubuntu 24.04 | Docker ve Docker Compose kurulu |
| Supabase | Canlı için ayrı proje, Pro plan | Ücretsiz plan kullanılmayan projeyi duraklatır ve yedek almaz |
| Cloudflare R2 | Bir bucket ve API anahtarı | Belgeler burada saklanır |
| Alan adı | Sunucuya A kaydı | Caddy sertifikayı kendisi alır |
| SMTP (Resend, Brevo vb.) | Supabase > Authentication > Emails | Kayıt ve şifre e-postaları için |

## 2. Supabase

1. SQL Editor'da `backend/schema.sql` dosyasının tamamını çalıştırın. Tüm
   tabloları, kanun tablolarını ve migration kaydını oluşturur.
2. Authentication > Sign In / Providers:
   - **Allow new users to sign up: kapalı** (yalnızca davetle kullanım).
   - **Confirm email: açık**.
   - Minimum password length: **10**.
3. Authentication > URL Configuration: Site URL `https://DOMAIN`, Redirect URL
   `https://DOMAIN/auth/callback`.
4. Authentication > Emails: SMTP ayarlarını girin.
5. Project Settings > API: URL ile publishable ve secret anahtarları
   `deploy/production.env` dosyasına yazın.

## 3. Cloudflare R2

1. Bir bucket oluşturun (örn. `miketr`).
2. Bucket ayarlarında CORS politikası olarak `docker/storage-cors.json`
   dosyasındaki kuralı, `AllowedOrigins` alanına `https://DOMAIN` yazarak ekleyin.
3. R2 > Manage API tokens ile bu bucket'a "Object Read & Write" yetkili bir
   anahtar oluşturun; değerleri `production.env` dosyasına yazın.

## 4. Sunucu

```bash
# Güvenlik duvarı: yalnızca SSH, HTTP ve HTTPS
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable

git clone https://github.com/skraptt/mikeTR.git && cd mikeTR
cp deploy/production.env.example deploy/production.env
nano deploy/production.env          # tüm değerleri doldurun

docker compose -f deploy/docker-compose.prod.yml --env-file deploy/production.env up -d --build
```

İlk açılışta BGE-M3 modeli (~1,2 GB) indirilir; backend bundan sonra başlar.

## 5. Veriler

```bash
C="docker compose -f deploy/docker-compose.prod.yml --env-file deploy/production.env"

# Mike iş akışı kataloğu
$C run --rm workflow-sync

# Kanun metinleri, vektörler ve ilk güncellik kontrolü
$C exec backend npm run kanun:import
$C exec backend npm run kanun:embed
$C exec backend npm run kanun:check
```

Kontrolün bulduğu farkları uygulamada **Mevzuat > Güncellemeler** sayfasından
onaylayın (yalnızca `KANUN_ADMIN_EMAILS` içindeki hesaplar görür).

## 6. Kullanıcı eklemek

Kayıt kapalı olduğu için kullanıcıları yönetici ekler:

1. Supabase > Authentication > Users > **Add user > Create new user**.
2. E-postayı girin, rastgele bir şifre verin, **Auto Confirm User** işaretli olsun.
3. Kullanıcıya adresi bildirin; ilk girişte **Şifremi unuttum** ile kendi
   şifresini belirlesin.

## 7. Güncelleme

```bash
git pull
$C up -d --build
$C run --rm workflow-sync
```

Yeni bir dosya `backend/migrations/` altına geldiyse önce onu SQL Editor'da
çalıştırın ya da `backend/scripts/migrate.sh up` kullanın
([docs/deployment.md](../docs/deployment.md#upgrading-an-existing-deployment)).

## 8. Kontrol listesi

- [ ] `https://DOMAIN` açılıyor, sertifika geçerli
- [ ] Giriş, belge yükleme, sohbet ve Mevzuat araması çalışıyor
- [ ] Mevzuat > Güncellemeler sayfası açılıyor, kanunlar "güncel" görünüyor
- [ ] Supabase'de günlük yedek açık, yönetici hesaplarında iki adımlı doğrulama var
- [ ] `docker compose logs backend` içinde hata yok; Sentry kapalı
- [ ] Bir erişilebilirlik izleyicisi (örn. UptimeRobot) `https://DOMAIN` adresini izliyor
