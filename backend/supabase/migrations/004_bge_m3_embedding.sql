-- Açık kaynak BGE-M3 (1024 boyut) embedding'leri için ikinci sütun.
-- Mevcut OpenAI sütunu (embedding, 1536) karşılaştırma için yerinde bırakılır.
alter table public.kanun_maddeleri
  add column if not exists embedding_bge_m3 vector(1024);

-- HNSW, ivfflat'ten farklı olarak eğitim gerektirmez ve küçük tablolarda
-- probes ayarı olmadan yüksek recall verir.
create index if not exists idx_kanun_maddeleri_embedding_bge_m3
  on public.kanun_maddeleri using hnsw (embedding_bge_m3 vector_cosine_ops);

-- Vektörün kendisi istemciye gönderilmez; arayüz yalnızca metni ve skoru kullanır.
create or replace function public.match_kanun_maddeleri_bge_m3(
  query_embedding vector(1024),
  match_count integer,
  match_threshold double precision default 0.5
)
returns table (
  id uuid,
  madde_no text,
  icerik text,
  created_at timestamptz,
  similarity double precision
)
language sql
stable
as $$
  select
    km.id,
    km.madde_no,
    km.icerik,
    km.created_at,
    1 - (km.embedding_bge_m3 <=> query_embedding) as similarity
  from public.kanun_maddeleri as km
  where km.embedding_bge_m3 is not null
    and 1 - (km.embedding_bge_m3 <=> query_embedding) >= match_threshold
  order by km.embedding_bge_m3 <=> query_embedding
  limit match_count;
$$;
