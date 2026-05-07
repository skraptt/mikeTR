# Türk Hukuku Yapay Zeka Asistanı

**Turkish Legal AI Assistant** — Açık kaynaklı [Mike](https://github.com/willchen96/mike) RAG (Retrieval-Augmented Generation) projesinin, Türk hukuk sistemi için özelleştirilmiş bir fork'udur.

Bu proje, kullanıcıların Türk kanunları ve mevzuatı hakkında sorular sorabilecekleri, yapay zeka destekli bir asistan sağlar. Sistem, halüsinasyonları minimize etmek ve yabancı hukuk örneklerinden kaçınmak için, sıkı bir System Prompt ile yalnızca Türk mevzuatına sadık kalması için tasarlanmıştır.

## Özellikler

### 1. Türk Mevzuatı Kütüphanesi
`setup-data/` klasörüne entegre edilen güncel Türk kanunları (.txt formatı):
- Türk Medeni Kanunu
- Türk Borçlar Kanunu
- Türk Ticaret Kanunu
- Diğer ilgili kanun ve yönetmelikler

### 2. RAG Mimarisi ile Halüsinasyon Kontrolü
- **System Prompt**: Modelin yalnızca sağlanan Türk mevzuatı belgelerine dayalı olarak yanıt vermesini sağlayan katı talimatlar.
- **Belge Arama**: Kullanıcı sorularına en uygun kanun maddelerini ve belgeler otomatik olarak bulur.
- **Bağlamsal Yanıtlar**: Modelin yanıtları her zaman kaynak belgelerine bağlanır.

### 3. Türkçe Kullanıcı Arayüzü
Frontend tüm arayüz metinleri Türkçeye çevrilmiş olup, Türk kullanıcılar için optimize edilmiştir.

## İçindekiler

- `frontend/` — Next.js uygulaması (React, TypeScript, Tailwind CSS)
- `backend/` — Express API, Supabase entegrasyonu, belge işleme, veritabanı migrationları
- `backend/migrations/000_one_shot_schema.sql` — Yeni Supabase veritabanları için SQL şeması
- `setup-data/` — Türk mevzuatı kütüphanesi (.txt formatında)

## Kurulum

### 1. Bağımlılıkları yükle

```bash
npm install --prefix backend
npm install --prefix frontend
```

### 2. Ortam değişkenlerini hazırla

Örnek dosyalardan kopyalayarak `.env` dosyalarını oluştur:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

Gerekli API anahtarlarını doldur:
- Supabase URL ve anahtarları
- Supabase Auth konfigürasyonu
- Claude veya Gemini API anahtarları (model seçimine göre)
- S3/R2 depolama kimlik bilgileri

### 3. Veritabanını hazırla

Supabase SQL editöründe `backend/migrations/000_one_shot_schema.sql` dosyasını çalıştır.

### 4. Backend'i başlat

```bash
npm run dev --prefix backend
```

Backend, Supabase'e bağlanacak ve Türk mevzuatı kütüphanesini yükleyecektir.

### 5. Frontend'i başlat

```bash
npm run dev --prefix frontend
```

Uygulamaya erişmek için tarayıcında şu adresi aç:

```
http://localhost:3000
```

## Gerekli Hizmetler

- **Supabase** — Veritabanı (PostgreSQL) ve Kimlik Doğrulama (Auth)
- **S3-Uyumlu Depolama** — Cloudflare R2, AWS S3, vb. (belgeler için)
- **Model Sağlayıcı API Anahtarı** — Claude (Anthropic) veya Gemini (Google) API anahtarı
- **LibreOffice** — DOC/DOCX → PDF dönüşümleri için (opsiyonel, bazı dağıtımlarda ön yüklü)

## Kontroller ve Derleme

```bash
npm run build --prefix backend
npm run build --prefix frontend
npm run lint --prefix frontend
```

## Geliştirme Notları

- Frontend ve Backend bağımsız olarak çalışabilir, ancak birlikte kullanılması için API bağlantısı gerekir.
- Türk mevzuatı belgelerine yeni kanunlar eklemek için `setup-data/` klasörüne `.txt` dosyaları ekle.
- System Prompt'u özelleştirmek için backend kodundaki ilgili LLM konfigürasyonunu düzenle.

## Lisans

AGPL-3.0-only. Detaylar için `LICENSE` dosyasına bak.

---

# Turkish Legal AI Assistant

**English Version** — This is a fork of the open-source [Mike](https://github.com/willchen96/mike) RAG (Retrieval-Augmented Generation) project, customized for the Turkish legal system.

This project provides an AI-powered assistant that allows users to ask questions about Turkish laws and regulations. The system is designed to remain faithful to Turkish legislation only, using strict System Prompts to minimize hallucinations and avoid foreign law examples.

## Features

### 1. Turkish Legislation Library
Integrated Turkish laws in `setup-data/` directory (.txt format):
- Turkish Civil Code (Türk Medeni Kanunu)
- Turkish Law of Obligations (Türk Borçlar Kanunu)
- Turkish Commercial Code (Türk Ticaret Kanunu)
- Other relevant laws and regulations

### 2. RAG Architecture with Hallucination Control
- **System Prompt**: Strict instructions ensuring the model responds only based on provided Turkish legislation documents.
- **Document Retrieval**: Automatically finds the most relevant law articles and documents for user queries.
- **Contextual Responses**: Model responses are always grounded in source documents.

### 3. Turkish User Interface
All frontend UI text has been translated to Turkish for optimal user experience.

## Contents

- `frontend/` — Next.js application (React, TypeScript, Tailwind CSS)
- `backend/` — Express API, Supabase integration, document processing, database migrations
- `backend/migrations/000_one_shot_schema.sql` — SQL schema for fresh Supabase databases
- `setup-data/` — Turkish legislation library (.txt format)

## Setup

### 1. Install dependencies

```bash
npm install --prefix backend
npm install --prefix frontend
```

### 2. Create environment files

Copy from examples:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

Fill in the required credentials:
- Supabase URL and API keys
- Supabase Auth configuration
- Claude or Gemini API keys (depending on model choice)
- S3/R2 storage credentials

### 3. Initialize database

Run `backend/migrations/000_one_shot_schema.sql` in the Supabase SQL editor.

### 4. Start the backend

```bash
npm run dev --prefix backend
```

The backend will connect to Supabase and load the Turkish legislation library.

### 5. Start the frontend

```bash
npm run dev --prefix frontend
```

Open your browser to:

```
http://localhost:3000
```

## Required Services

- **Supabase** — Database (PostgreSQL) and Authentication
- **S3-Compatible Storage** — Cloudflare R2, AWS S3, etc. (for document storage)
- **Model Provider API Key** — Claude (Anthropic) or Gemini (Google) API key
- **LibreOffice** — For DOC/DOCX to PDF conversion (optional, pre-installed on some systems)

## Build and Checks

```bash
npm run build --prefix backend
npm run build --prefix frontend
npm run lint --prefix frontend
```

## Development Notes

- Frontend and Backend can run independently, but require API connection for full functionality.
- To add new Turkish laws to the legislation library, add `.txt` files to `setup-data/` directory.
- To customize the System Prompt, edit the LLM configuration in the backend code.

## License

AGPL-3.0-only. See `LICENSE` for details.