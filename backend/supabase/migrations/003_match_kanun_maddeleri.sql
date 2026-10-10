create or replace function public.match_kanun_maddeleri(
  query_embedding vector(1536),
  match_count integer,
  match_threshold double precision default 0.5
)
returns table (
  id uuid,
  madde_no text,
  icerik text,
  embedding vector(1536),
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
    km.embedding,
    km.created_at,
    1 - (km.embedding <=> query_embedding) as similarity
  from public.kanun_maddeleri as km
  where km.embedding is not null
    and 1 - (km.embedding <=> query_embedding) >= match_threshold
  order by km.embedding <=> query_embedding
  limit match_count;
$$;