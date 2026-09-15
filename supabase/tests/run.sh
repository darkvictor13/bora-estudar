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

# `catalogs` e `audit_log` saíram do schema em 14/09/2026, e o truncate delas
# abortava este script antes da primeira suíte. O que resta a limpar é o que o
# seed cria (tudo pende de `auth.users`) mais as duas tabelas que não pendem de
# usuário nenhum: o catálogo comum e os cupons.
echo "→ limpando o seed para as suítes partirem do zero"
docker exec "$CONTAINER" psql -U postgres -q \
  -c "set client_min_messages = warning;
      drop schema if exists app_test cascade;
      truncate auth.users cascade;
      truncate public.catalog_blocks cascade;
      truncate public.coupons cascade;"

# O glob é [0-9]*, e não 0*: com a décima suíte, `0*.sql` passou a PULAR
# silenciosamente tudo a partir de 10_. Suíte que não roda é pior que suíte que
# não existe — ela dá a impressão de cobertura.
for suite in supabase/tests/[0-9]*.sql; do
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
