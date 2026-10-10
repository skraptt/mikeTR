create extension if not exists pgcrypto;
create extension if not exists vector;

create table if not exists public.kanun_maddeleri (
  id uuid primary key default gen_random_uuid(),
  madde_no text not null,
  icerik text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create index if not exists idx_kanun_maddeleri_madde_no
  on public.kanun_maddeleri(madde_no);

create index if not exists idx_kanun_maddeleri_embedding
  on public.kanun_maddeleri using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);