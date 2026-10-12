#!/usr/bin/env bash
# mikeTR: loads the bundled statute snapshot into a new database — the article
# texts as last approved against mevzuat.gov.tr plus their BGE-M3 vectors, so
# statute search works without embedding 4,000+ articles on first start.
# Regenerate the snapshot with `npm run kanun:snapshot` in backend/.
set -euo pipefail

count=$(psql "$DB" -tAc "select count(*) from public.kanun_maddeleri")
if [ "$count" != "0" ]; then
  echo "kanun_maddeleri already has $count articles; snapshot not loaded."
  exit 0
fi

echo "Loading the statute snapshot..."
gunzip -c /setup-data/kanun-maddeleri.csv.gz | psql "$DB" -v ON_ERROR_STOP=1 -c \
  "\copy public.kanun_maddeleri (kanun_no, kanun_adi, madde_no, baslik, icerik, embedding_bge_m3) from stdin with (format csv)"

# When each law was last confirmed current; the daily check moves these on.
psql "$DB" -v ON_ERROR_STOP=1 <<'SQL'
create temp table snapshot_dates (kanun_no text, guncellik_tarihi timestamptz, son_kontrol timestamptz);
\copy snapshot_dates from '/setup-data/kanunlar-guncellik.csv' with (format csv)
update public.kanunlar k
   set guncellik_tarihi = s.guncellik_tarihi, son_kontrol = s.son_kontrol
  from snapshot_dates s
 where s.kanun_no = k.kanun_no;
SQL

psql "$DB" -tAc "select count(*) || ' articles loaded' from public.kanun_maddeleri"
