import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
// Az önce bulduğun dosyadan orijinal fonksiyonları çağırıyoruz!
import { uploadFile, storageKey } from './src/lib/storage'; 

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY; 
const adminUserId = process.env.ADMIN_USER_ID; 

if (!supabaseUrl || !supabaseKey || !adminUserId) {
  throw new Error("HATA: .env dosyasında SUPABASE_URL, SUPABASE_SECRET_KEY veya ADMIN_USER_ID eksik!");
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function processLaws() {
  console.log("🚀 Otomatik Kurulum Başlıyor: Kanunlar R2 Bulutuna ve Supabase'e yükleniyor...");
  
  const dataDir = path.join(__dirname, 'setup-data');
  if (!fs.existsSync(dataDir)) {
    console.log("⚠️ setup-data klasörü bulunamadı, tohumlama atlanıyor.");
    return;
  }

  const files = fs.readdirSync(dataDir);

  for (const file of files) {
    if (!file.endsWith('.txt')) continue;
    console.log(`\n📄 İnceleniyor: ${file}`);

    // 1. Veritabanı Kontrolü: Belge zaten var mı?
    const { data: existingDoc } = await supabase
      .from('documents')
      .select('id')
      .eq('filename', file)
      .eq('user_id', adminUserId)
      .maybeSingle();

    if (existingDoc) {
      console.log(`✅ ${file} zaten sistemde kayıtlı, atlanıyor.`);
      continue;
    }

    console.log(`⚙️ ${file} sisteme işleniyor. Lütfen bekleyin...`);

    const filePath = path.join(dataDir, file);
    const fileBuffer = fs.readFileSync(filePath);

    // 2. Belgenin "Kimlik Kartını" Oluşturma
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .insert({ 
        user_id: adminUserId,
        filename: file,
        file_type: 'text/plain',
        size_bytes: fileBuffer.length,
        status: 'pending' 
      })
      .select()
      .single();

    if (docError || !doc) {
      console.error(`❌ ${file} kimlik kaydı oluşturulurken hata:`, docError?.message);
      continue;
    }

    try {
      // 3. Buluta (Cloudflare R2) Gerçek Dosyayı Yükleme
      const r2Key = storageKey(adminUserId, doc.id, file);
      // ArrayBuffer formatına çevirip yüklüyoruz
      await uploadFile(r2Key, fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength), 'text/plain');

      // 4. Versiyon Kaydını Oluşturma
      const { data: version, error: versionError } = await supabase
        .from('document_versions')
        .insert({
          document_id: doc.id,
          storage_path: r2Key,
          source: 'upload',
          version_number: 1,
          display_name: 'Orijinal Kanun Metni'
        })
        .select()
        .single();

      if (versionError || !version) {
        throw new Error(versionError?.message || "Versiyon oluşturulamadı.");
      }

      // 5. Kimlik Kartına "Güncel Versiyon" Damgasını Vurma
      await supabase
        .from('documents')
        .update({ 
          current_version_id: version.id,
          status: 'ready' // Artık okunmaya hazır!
        })
        .eq('id', doc.id);

      console.log(`🎉 Başarılı: ${file} yapay zekanın bulut hafızasına eklendi!`);

    } catch (err: any) {
      console.error(`❌ ${file} buluta yüklenirken hata oluştu:`, err.message);
    }
  }

  console.log("\n✅ Tüm kanun kurulum işlemleri tamamlandı! Ana sunucu başlatılıyor...\n");
}

processLaws().catch(console.error);