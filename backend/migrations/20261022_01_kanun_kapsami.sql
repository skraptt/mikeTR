-- Migration date: 2026-10-22
-- mikeTR: 29 more laws in the statute index (lib/kanunList.ts), from the
-- Constitution and the codes of criminal and administrative law to labour,
-- enforcement, tax and professional laws. Their articles are loaded with
-- `npm run kanun:fetch` (or the bundled snapshot on a new install), and the
-- daily check keeps them current like the first thirteen.

insert into public.kanunlar (kanun_no, kanun_adi, mevzuat_tertip) values
  ('634', 'Kat Mülkiyeti Kanunu', 5),
  ('2644', 'Tapu Kanunu', 3),
  ('4054', 'Rekabetin Korunması hakkında Kanun', 5),
  ('5651', 'İnternet Ortamında Yapılan Yayınların Düzenlenmesi ve Bu Yayınlar Yoluyla İşlenen Suçlarla Mücadele Edilmesi Hakkında Kanun', 5),
  ('2004', 'İcra ve İflas Kanunu', 3),
  ('6325', 'Hukuk Uyuşmazlıklarında Arabuluculuk Kanunu', 5),
  ('7201', 'Tebligat Kanunu', 3),
  ('1136', 'Avukatlık Kanunu', 5),
  ('1512', 'Noterlik Kanunu', 5),
  ('4857', 'İş Kanunu', 5),
  ('1475', '1475 sayılı İş Kanunu', 5),
  ('7036', 'İş Mahkemeleri Kanunu', 5),
  ('5510', 'Sosyal Sigortalar ve Genel Sağlık Sigortası Kanunu', 5),
  ('5237', 'Türk Ceza Kanunu', 5),
  ('5271', 'Ceza Muhakemesi Kanunu', 5),
  ('5275', 'Ceza ve Güvenlik Tedbirlerinin İnfazı Hakkında Kanun', 5),
  ('5326', 'Kabahatler Kanunu', 5),
  ('6284', 'Ailenin Korunması ve Kadına Karşı Şiddetin Önlenmesine Dair Kanun', 5),
  ('2918', 'Karayolları Trafik Kanunu', 5),
  ('2709', 'Türkiye Cumhuriyeti Anayasası', 5),
  ('2577', 'İdari Yargılama Usulü Kanunu', 5),
  ('657', 'Devlet Memurları Kanunu', 5),
  ('2942', 'Kamulaştırma Kanunu', 5),
  ('3194', 'İmar Kanunu', 5),
  ('4734', 'Kamu İhale Kanunu', 5),
  ('213', 'Vergi Usul Kanunu', 4),
  ('193', 'Gelir Vergisi Kanunu', 4),
  ('3065', 'Katma Değer Vergisi Kanunu', 5),
  ('6183', 'Amme Alacaklarının Tahsil Usulü hakkında Kanun', 3)
on conflict (kanun_no) do nothing;
