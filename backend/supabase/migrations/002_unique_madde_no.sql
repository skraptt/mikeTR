DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kanun_maddeleri_madde_no_key'
  ) THEN
    ALTER TABLE public.kanun_maddeleri ADD CONSTRAINT kanun_maddeleri_madde_no_key UNIQUE (madde_no);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  -- constraint already exists concurrently
  NULL;
END$$;

-- Also create a unique index if not present (useful if constraint creation above was skipped)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_kanun_maddeleri_madde_no_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_kanun_maddeleri_madde_no_unique ON public.kanun_maddeleri(madde_no);
  END IF;
EXCEPTION WHEN duplicate_table THEN
  NULL;
END$$;
