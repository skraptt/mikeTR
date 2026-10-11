-- Migration date: 2026-10-11
-- mikeTR: Türk mevzuatı semantik araması. Kanun maddeleri ve embedding'leri
-- yalnızca backend tarafından (service_role) okunur; tarayıcıya açık değildir.

create extension if not exists vector with schema extensions;

create table if not exists public.kanun_maddeleri (
  id uuid primary key default gen_random_uuid(),
  kanun_no text not null,
  kanun_adi text not null,
  madde_no text not null,
  baslik text,
  icerik text not null,
  -- OpenAI text-embedding-3-small (EMBEDDING_PROVIDER=openai)
  embedding extensions.vector(1536),
  -- BGE-M3 (EMBEDDING_PROVIDER=bge-m3, varsayılan)
  embedding_bge_m3 extensions.vector(1024),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_kanun_maddeleri_kanun_madde_unique
  on public.kanun_maddeleri(kanun_no, madde_no);

-- HNSW, ivfflat'ten farklı olarak eğitim gerektirmez ve küçük tablolarda
-- probes ayarı olmadan yüksek recall verir.
create index if not exists idx_kanun_maddeleri_embedding_bge_m3
  on public.kanun_maddeleri
  using hnsw (embedding_bge_m3 extensions.vector_cosine_ops);

create index if not exists idx_kanun_maddeleri_embedding
  on public.kanun_maddeleri
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.kanun_maddeleri enable row level security;

create or replace function public.match_kanun_maddeleri_bge_m3(
  query_embedding extensions.vector(1024),
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
set search_path = public, extensions
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

revoke all on function public.match_kanun_maddeleri_bge_m3(extensions.vector, integer, double precision)
  from public, anon, authenticated;
grant execute on function public.match_kanun_maddeleri_bge_m3(extensions.vector, integer, double precision)
  to service_role;

create or replace function public.match_kanun_maddeleri(
  query_embedding extensions.vector(1536),
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
set search_path = public, extensions
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

revoke all on function public.match_kanun_maddeleri(extensions.vector, integer, double precision)
  from public, anon, authenticated;
grant execute on function public.match_kanun_maddeleri(extensions.vector, integer, double precision)
  to service_role;
