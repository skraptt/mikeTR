-- Birden fazla kanunu aynı tabloda tutabilmek için madde numarası kanunla birlikte tekil olur.
alter table public.kanun_maddeleri
  add column if not exists kanun_no text,
  add column if not exists kanun_adi text,
  add column if not exists baslik text;

-- Mevcut satırların hepsi Türk Medeni Kanunu'na ait.
update public.kanun_maddeleri
  set kanun_no = '4721', kanun_adi = 'Türk Medeni Kanunu'
  where kanun_no is null;

alter table public.kanun_maddeleri
  alter column kanun_no set not null,
  alter column kanun_adi set not null;

alter table public.kanun_maddeleri
  drop constraint if exists kanun_maddeleri_madde_no_key;
drop index if exists public.idx_kanun_maddeleri_madde_no_unique;

create unique index if not exists idx_kanun_maddeleri_kanun_madde_unique
  on public.kanun_maddeleri(kanun_no, madde_no);

-- Dönüş tipi değiştiği için fonksiyonlar yeniden oluşturulur.
drop function if exists public.match_kanun_maddeleri_bge_m3(vector, integer, double precision);
create function public.match_kanun_maddeleri_bge_m3(
  query_embedding vector(1024),
  match_count integer,
  match_threshold double precision default 0.5
)
returns table (
  id uuid,
  kanun_no text,
  kanun_adi text,
  madde_no text,
  baslik text,
  icerik text,
  created_at timestamptz,
  similarity double precision
)
language sql
stable
as $$
  select
    km.id,
    km.kanun_no,
    km.kanun_adi,
    km.madde_no,
    km.baslik,
    km.icerik,
    km.created_at,
    1 - (km.embedding_bge_m3 <=> query_embedding) as similarity
  from public.kanun_maddeleri as km
  where km.embedding_bge_m3 is not null
    and 1 - (km.embedding_bge_m3 <=> query_embedding) >= match_threshold
  order by km.embedding_bge_m3 <=> query_embedding
  limit match_count;
$$;

drop function if exists public.match_kanun_maddeleri(vector, integer, double precision);
create function public.match_kanun_maddeleri(
  query_embedding vector(1536),
  match_count integer,
  match_threshold double precision default 0.5
)
returns table (
  id uuid,
  kanun_no text,
  kanun_adi text,
  madde_no text,
  baslik text,
  icerik text,
  created_at timestamptz,
  similarity double precision
)
language sql
stable
as $$
  select
    km.id,
    km.kanun_no,
    km.kanun_adi,
    km.madde_no,
    km.baslik,
    km.icerik,
    km.created_at,
    1 - (km.embedding <=> query_embedding) as similarity
  from public.kanun_maddeleri as km
  where km.embedding is not null
    and 1 - (km.embedding <=> query_embedding) >= match_threshold
  order by km.embedding <=> query_embedding
  limit match_count;
$$;
