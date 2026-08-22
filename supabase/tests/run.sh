#!/usr/bin/env bash
# Roda as suítes de verificação do schema contra o Supabase local.
#
# Recria a base antes, para que cada execução parta de um estado conhecido.
# Qualquer erro aborta: as suítes usam `raise exception` quando um invariante
# que deveria ser impossível é aceito pelo banco.
set -euo pipefail

cd "$(dirname "$0")/../.."

echo "→ recriando a base"
supabase db reset >/dev/null

CONTAINER="supabase_db_$(grep -m1 '^project_id' supabase/config.toml | cut -d'"' -f2)"

echo "→ limpando o seed para as suítes partirem do zero"
docker exec "$CONTAINER" psql -U postgres -q \
  -c "set client_min_messages = warning;
      truncate auth.users cascade;
      truncate public.catalogs cascade;
      truncate public.audit_log;"

for suite in supabase/tests/0*.sql; do
  echo
  echo "══ $(basename "$suite")"
  docker cp "$suite" "$CONTAINER:/tmp/suite.sql" >/dev/null
  docker exec "$CONTAINER" psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/suite.sql 2>&1 \
    | grep -vE "^(INSERT|SELECT [0-9]|CREATE|SET|DO|RESET|-{3,}|\(1 row\))" \
    | grep -v "^ *item *| *valor *$" \
    | grep -vE "^ *set_config *$|^ [0-9a-f]{8}-[0-9a-f]{4}" \
    | grep -v "^$"
done

echo
echo "✓ todas as suítes passaram"
