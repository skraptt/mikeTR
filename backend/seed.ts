import "dotenv/config";
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { uploadFile, storageKey } from './src/lib/storage'; 

// Belirtilen klasördeki dosyaları tarayan yardımcı fonksiyon
function getFilesRecursively(dir: string): { name: string; fullPath: string; isKvkk: boolean }[] {
  let results: { name: string; fullPath: string; isKvkk: boolean }[] = [];
  const list = fs.readdirSync(dir);

  list.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat && stat.isDirectory()) {
      // Eğer klasör kvkk_ozel ise içindekileri isKvkk = true olarak işaretle
      const isKvkkFolder = file === 'kvkk_ozel';
      const subResults = getFilesRecursively(fullPath);
      subResults.forEach(r => {
        if (isKvkkFolder) r.isKvkk = true;
      });
      results = results.concat(subResults);
    } else if (file.endsWith('.txt')) {
      results.push({ name: file, fullPath: fullPath, isKvkk: false });
    }
  });

  return results;
}

async function processLaws() {
  console.log("🚀 Otomatik Kurulum Başlıyor: Kanunlar ve KVKK Verileri İşleniyor...");
  console.log(`[seed] __dirname = ${__dirname}`);
  console.log(`[seed] ENV check -> SUPABASE_URL=${Boolean(process.env.SUPABASE_URL)}, SUPABASE_SECRET_KEY=${Boolean(process.env.SUPABASE_SECRET_KEY)}, ADMIN_USER_ID=${Boolean(process.env.ADMIN_USER_ID)}`);
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const adminUserId = process.env.ADMIN_USER_ID;

  if (!supabaseUrl || !supabaseKey || !adminUserId) {
    console.error("[seed] Çevre değişkeni doğrulaması başarısız.");
    throw new Error("HATA: .env dosyasında SUPABASE_URL, SUPABASE_SECRET_KEY veya ADMIN_USER_ID eksik!");
  }

  console.log("[seed] Supabase client oluşturuluyor...");
  const supabase = createClient(supabaseUrl, supabaseKey);

  const dataDir = path.join(__dirname, 'setup-data');
  console.log(`[seed] setup-data yolu kontrol ediliyor: ${dataDir}`);
  if (!fs.existsSync(dataDir)) {
    console.warn("⚠️ setup-data klasörü bulunamadı, tohumlama atlanıyor.");
    return;
  }

  console.log("[seed] setup-data klasörü bulundu, dosyalar taranıyor...");
  let allFiles: { name: string; fullPath: string; isKvkk: boolean }[] = [];
  try {
    // Tüm dosyaları (alt klasörler dahil) tarıyoruz
    allFiles = getFilesRecursively(dataDir);
    console.log(`[seed] Toplam ${allFiles.length} .txt dosyası bulundu.`);
  } catch (error) {
    console.error("[seed] Dosya tarama aşamasında hata:", error);
    throw error;
  }

  if (allFiles.length === 0) {
    console.warn("[seed] İşlenecek dosya bulunamadı, seed sonlandırılıyor.");
    return;
  }

  let processedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const fileInfo of allFiles) {
    const file = fileInfo.name;
    console.log(`\n📄 İnceleniyor: ${file} ${fileInfo.isKvkk ? '[KVKK ÖZEL]' : '[GENEL HUKUK]'}`);

    try {
      console.log(`[seed:${file}] Veritabanında mevcut kayıt aranıyor...`);
      // 1. Veritabanı Kontrolü
      const { data: existingDoc, error: existingError } = await supabase
        .from('documents')
        .select('id')
        .eq('filename', file)
        .eq('user_id', adminUserId)
        .maybeSingle();

      if (existingError) {
        console.error(`[seed:${file}] Mevcut kayıt sorgusunda hata:`, existingError.message);
        errorCount += 1;
        continue;
      }

      if (existingDoc) {
        console.log(`✅ ${file} zaten sistemde kayıtlı, atlanıyor.`);
        skippedCount += 1;
        continue;
      }

      console.log(`⚙️ ${file} sisteme işleniyor. Dosya okunuyor...`);
      const fileBuffer = fs.readFileSync(fileInfo.fullPath);
      console.log(`[seed:${file}] Dosya boyutu: ${fileBuffer.length} byte`);

      // 2. Belgenin Kimlik Kartını Oluşturma
      // metadata alanına projenin ileride filtreleme yapabilmesi için is_kvkk bilgisini gömüyoruz
      console.log(`[seed:${file}] documents tablosuna kayıt ekleniyor...`);
      const { data: doc, error: docError } = await supabase
        .from('documents')
        .insert({ 
          user_id: adminUserId,
          filename: file,
          file_type: 'text/plain',
          size_bytes: fileBuffer.length,
          status: 'pending',
          metadata: { is_kvkk: fileInfo.isKvkk } // 3. YÖNTEM İÇİN BURASI ÇOK KRİTİK!
        })
        .select()
        .single();

      if (docError || !doc) {
        console.error(`[seed:${file}] documents insert hatası:`, docError?.message ?? 'doc bulunamadı');
        errorCount += 1;
        continue;
      }

      // 3. Buluta (Cloudflare R2) Yükleme
      const r2Key = storageKey(adminUserId, doc.id, file);
      console.log(`[seed:${file}] R2 yükleme hazırlanıyor -> ${r2Key}`);
      await uploadFile(r2Key, fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength), 'text/plain');
      console.log(`[seed:${file}] R2 yükleme tamamlandı.`);

      // 4. Versiyon Kaydı
      console.log(`[seed:${file}] document_versions kaydı ekleniyor...`);
      const { data: version, error: versionError } = await supabase
        .from('document_versions')
        .insert({
          document_id: doc.id,
          storage_path: r2Key,
          source: 'upload',
          version_number: 1,
          display_name: fileInfo.isKvkk ? 'KVKK Özel Metni' : 'Orijinal Kanun Metni'
        })
        .select()
        .single();

      if (versionError || !version) {
        console.error(`[seed:${file}] document_versions insert hatası:`, versionError?.message ?? 'version bulunamadı');
        throw new Error(versionError?.message || "Versiyon oluşturulamadı.");
      }

      // 5. Güncel Versiyon Damgası
      console.log(`[seed:${file}] documents.current_version_id güncelleniyor...`);
      await supabase
        .from('documents')
        .update({ 
          current_version_id: version.id,
          status: 'ready'
        })
        .eq('id', doc.id);

      console.log(`🎉 Başarılı: ${file} yapay zekanın bulut hafızasına eklendi!`);
      processedCount += 1;

    } catch (err: any) {
      errorCount += 1;
      console.error(`❌ [seed:${file}] İşlem sırasında hata oluştu:`, err?.message ?? err);
      console.error(err);
    }
  }

  console.log(`\n✅ Tüm kanun ve KVKK yükleme işlemleri tamamlandı! processed=${processedCount}, skipped=${skippedCount}, errors=${errorCount}\n`);
}

async function main() {
  try {
    console.log("[seed] main() başladı.");
    await processLaws();
    console.log("[seed] processLaws() tamamlandı, process.exit(0) çağrılıyor.");
    process.exit(0);
  } catch (error) {
    console.error("[seed] main() içinde yakalanan hata:");
    console.error(error);
    console.log("[seed] process.exit(1) çağrılıyor.");
    process.exit(1);
  }
}

void main();