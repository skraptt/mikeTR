-- Migration date: 2026-10-12
-- mikeTR: keeping the statute index current.
--
-- A daily check reads each law's consolidated text from mevzuat.gov.tr and
-- compares it with kanun_maddeleri. Differences are never written directly:
-- they become pending rows in kanun_degisiklikleri, which a statute admin
-- approves or rejects. An approved change archives the previous text in
-- kanun_madde_arsivi before replacing it. All three tables are read and
-- written only by the backend (service_role).

create table if not exists public.kanunlar (
  kanun_no text primary key,
  kanun_adi text not null,
  -- mevzuat.gov.tr address parameters (MevzuatTur / MevzuatTertip).
  mevzuat_tur integer not null default 1,
  mevzuat_tertip integer not null default 5,
  -- Last time the stored text was confirmed identical to mevzuat.gov.tr.
  guncellik_tarihi timestamptz,
  son_kontrol timestamptz,
  son_kontrol_hatasi text,
  created_at timestamptz not null default now()
);

alter table public.kanunlar enable row level security;

insert into public.kanunlar (kanun_no, kanun_adi, mevzuat_tertip) values
  ('4721', 'Türk Medeni Kanunu', 5),
  ('4722', 'Türk Medenî Kanununun Yürürlüğü ve Uygulama Şekli hakkında Kanun', 5),
  ('5846', 'Fikir ve Sanat Eserleri Kanunu', 3),
  ('5941', 'Çek Kanunu', 5),
  ('6098', 'Türk Borçlar Kanunu', 5),
  ('6100', 'Hukuk Muhakemeleri Kanunu', 5),
  ('6101', 'Türk Borçlar Kanununun Yürürlüğü ve Uygulama Şekli hakkında Kanun', 5),
  ('6102', 'Türk Ticaret Kanunu', 5),
  ('6103', 'Türk Ticaret Kanununun Yürürlüğü ve Uygulama Şekli hakkında Kanun', 5),
  ('6362', 'Sermaye Piyasası Kanunu', 5),
  ('6502', 'Tüketicinin Korunması hakkında Kanun', 5),
  ('6698', 'Kişisel Verilerin Korunması Kanunu', 5),
  ('6769', 'Sınai Mülkiyet Kanunu', 5)
on conflict (kanun_no) do nothing;

create table if not exists public.kanun_degisiklikleri (
  id uuid primary key default gen_random_uuid(),
  kanun_no text not null references public.kanunlar(kanun_no) on delete cascade,
  madde_no text not null,
  -- yeni: article not in the index; degisti: text or title changed;
  -- kaldirildi: article no longer in the official text.
  tur text not null check (tur in ('yeni', 'degisti', 'kaldirildi')),
  eski_baslik text,
  eski_icerik text,
  yeni_baslik text,
  yeni_icerik text,
  -- Hash of the normalized new text, so a rejected change is not proposed again.
  yeni_ozet text not null,
  durum text not null default 'beklemede'
    check (durum in ('beklemede', 'onaylandi', 'reddedildi')),
  tespit_tarihi timestamptz not null default now(),
  karar_tarihi timestamptz,
  karar_veren text
);

-- At most one pending change per article.
create unique index if not exists idx_kanun_degisiklikleri_beklemede
  on public.kanun_degisiklikleri(kanun_no, madde_no)
  where durum = 'beklemede';

create index if not exists idx_kanun_degisiklikleri_karar
  on public.kanun_degisiklikleri(kanun_no, madde_no, yeni_ozet);

alter table public.kanun_degisiklikleri enable row level security;

create table if not exists public.kanun_madde_arsivi (
  id uuid primary key default gen_random_uuid(),
  kanun_no text not null,
  madde_no text not null,
  baslik text,
  icerik text not null,
  -- The text was current until this approved change replaced it.
  gecerlilik_bitis timestamptz not null default now(),
  degisiklik_id uuid references public.kanun_degisiklikleri(id) on delete set null
);

create index if not exists idx_kanun_madde_arsivi_madde
  on public.kanun_madde_arsivi(kanun_no, madde_no, gecerlilik_bitis desc);

alter table public.kanun_madde_arsivi enable row level security;
