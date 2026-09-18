#!/usr/bin/env bash
#
# Teste de fumaça de um ambiente publicado. Roda depois do deploy, no CI, e
# serve para rodar à mão contra staging ou produção:
#
#   scripts/fumaca.sh https://<dominio> https://<ref>.supabase.co
#
# Verifica CONTEÚDO, nunca status de erro: o fallback de SPA devolve 200 para
# qualquer caminho, então um monitor que espere 404 reporta 200 para sempre.
set -euo pipefail

URL="${1:?uso: fumaca.sh <url-do-site> <url-do-supabase>}"
API="${2:?uso: fumaca.sh <url-do-site> <url-do-supabase>}"

URL="${URL%/}"
HOST="${API#https://}"; HOST="${HOST%/}"

falhas=0
erro() { echo "  ✗ $1"; echo "::error::$1"; falhas=$((falhas + 1)); }
ok()   { echo "  ✓ $1"; }

codigo() { curl -sS -o /dev/null -w '%{http_code}' --max-time 30 "$1"; }

echo "→ fallback de SPA"
# Acesso direto a rota funda e ao caminho que chega do e-mail de recuperação.
# Sem o rewrite, o primeiro sintoma não é "o site caiu": é o link de senha
# morrendo, que manda o time investigar o Supabase.
for caminho in "/aluno/revisoes" "/professor/metas" "/confirmar?next=/redefinir-senha"; do
  c=$(codigo "$URL$caminho")
  [ "$c" = 200 ] && ok "$caminho → 200" || erro "$caminho → $c (esperado 200)"
done

echo "→ bundle"
# O caminho do bundle sai do index.html. Um glob no curl não expande remoto: o
# servidor receberia `index-*.js` literal, o fallback devolveria o index.html
# com 200, e a checagem falharia acusando a chave que está lá.
# O `|| true` não é descuido: sob `set -o pipefail`, um `grep` sem casamento
# aborta o script aqui e as verificações seguintes nunca rodam — o CI falharia
# sem dizer o que estava errado, que é o modo de falhar mais caro.
asset=$(curl -sS --max-time 30 "$URL/" | grep -o '/assets/index-[^"]*\.js' | head -1 || true)
if [ -z "$asset" ]; then
  erro "não achei /assets/index-*.js no index.html"
else
  ok "asset: $asset"

  # O bundle vai para ARQUIVO, e o grep lê o arquivo. A forma óbvia,
  # `printf '%s' "$corpo" | grep -q ...`, parece equivalente e não é: o
  # `grep -q` sai no primeiro casamento e fecha o pipe enquanto o `printf`
  # ainda escreve, o `printf` morre de SIGPIPE (141), e sob `pipefail` o
  # pipeline inteiro vira falha. A checagem reprovava exatamente quando ACHAVA
  # o que procurava, e só a partir do bundle grande o bastante para a escrita
  # não caber de uma vez — deploy vermelho com o bundle certo no ar.
  bundle=$(mktemp)
  trap 'rm -f "$bundle"' EXIT

  # E o que chega precisa SER o bundle. A publicação no Cloudflare não fica
  # visível de uma vez: o index.html pode vir da versão nova enquanto o pedido
  # do asset, noutra conexão, ainda cai onde o manifesto ainda é o antigo. Ali
  # o hash novo não existe, o `not_found_handling: single-page-application`
  # responde com o index.html, e 200 é o que chega nos dois casos.
  #
  # Sem esta espera, TODA checagem de conteúdo daqui para baixo lê a casca em
  # HTML: a URL do Supabase "não está no bundle" com o bundle certo no ar, e
  # "nenhum segredo" é dito sobre um arquivo que nunca foi o bundle. É
  # diagnóstico errado do problema certo — deploy vermelho mandando o time
  # procurar VITE_* que estão configuradas. Medido em 18/09/2026, onze segundos
  # depois do deploy.
  #
  # Quem distingue é o content-type: `text/javascript` no asset, `text/html` no
  # fallback. Se depois das tentativas ainda vier HTML, aí é falha de verdade —
  # o deploy não publicou o asset que o index.html promete.
  tipo=""
  for tentativa in 1 2 3 4 5 6; do
    tipo=$(curl -sS --max-time 60 -o "$bundle" -w '%{content_type}' "$URL$asset" || true)
    case "$tipo" in *javascript*) break ;; esac
    [ "$tentativa" = 6 ] || sleep 5
  done

  case "$tipo" in
    *javascript*) baixou=sim ;;
    *)            baixou=nao ;;
  esac

  if [ "$baixou" = nao ]; then
    erro "$asset respondeu ${tipo:-<sem content-type>} em vez de JavaScript — o fallback de SPA atendeu no lugar do bundle, e nada abaixo tem o que ler"
  else
    # A chave é assada no bundle pelo Vite. Se ela não está aqui, o build rodou
    # sem as VITE_*, e o produto sobe com tela branca.
    if grep -q "$HOST" "$bundle"; then
      ok "a URL do Supabase do ambiente está no bundle"
    else
      erro "o bundle não cita $HOST — build sem as VITE_* do ambiente?"
    fi

    # Nenhum segredo pode ter entrado no bundle. O padrão exige material de
    # chave DEPOIS do prefixo: `@supabase/supabase-js` carrega o literal
    # `sb_secret_` num validador de formato, e um grep pelo prefixo sozinho
    # reprova todo deploy. Medido contra o bundle publicado.
    #
    # Esta é a checagem que mais precisava sair do pipe: sem casamento o
    # `printf` terminava inteiro e ela passava, então ela só funcionava no caso
    # em que não acusava nada — um segredo vazado cairia no mesmo SIGPIPE e
    # seria reportado como "nenhum segredo".
    if grep -qE 'sb_secret_[A-Za-z0-9_-]{10,}|service_role' "$bundle"; then
      erro "chave secreta no bundle"
    else
      ok "nenhum segredo no bundle"
    fi

    # O relato de erro está ligado? Sem o DSN assado aqui, o `init` não é
    # chamado e o SDK inteiro é REMOVIDO do bundle na compilação — o ambiente
    # sobe sem relatar nada, e o sintoma é silêncio: nada quebra, nada aparece,
    # e ninguém nota até o dia em que faz falta.
    if grep -q 'ingest\.sentry\.io' "$bundle"; then
      ok "o relato de erro está no bundle"
    else
      erro "o bundle não cita ingest.sentry.io — build sem VITE_SENTRY_DSN?"
    fi
  fi

  # E o sourcemap NÃO pode estar no ar: ele entrega o código-fonte a qualquer
  # um. `wrangler` publica o `dist` inteiro, sem filtro, e há três coisas
  # impedindo — o plugin apaga depois de enviar, o workflow apaga de novo, e
  # esta checagem confere no ar. As duas primeiras são intenção; esta é medida.
  #
  # Não dá para conferir por status: o fallback de SPA devolve 200 com o
  # index.html para qualquer caminho. O que distingue é o CONTEÚDO — um
  # sourcemap de verdade começa com `{"version":3`.
  mapa=$(curl -sS --max-time 30 "$URL$asset.map" | head -c 200 || true)
  case "$mapa" in
    '{"version":3'*) erro "SOURCEMAP PUBLICADO em $asset.map — o código-fonte está no ar" ;;
    *)               ok "nenhum sourcemap publicado" ;;
  esac
fi

echo "→ cache"
# A casca não pode ser cacheada longo: é ela que aponta para o hash novo a cada
# deploy. E o asset precisa sair SÓ com immutable — regras do _headers que
# casam o mesmo caminho concatenam valores em vez de substituir, e
# `immutable, no-cache` no mesmo asset é o pior dos dois mundos.
cc_casca=$(curl -sS -I --max-time 30 "$URL/" | grep -i '^cache-control:' | tr -d '\r' || true)
case "$cc_casca" in
  *no-cache*) ok "casca: $cc_casca" ;;
  *)          erro "casca sem no-cache: ${cc_casca:-<ausente>}" ;;
esac

if [ -n "$asset" ]; then
  cc_asset=$(curl -sS -I --max-time 30 "$URL$asset" | grep -i '^cache-control:' | tr -d '\r' || true)
  case "$cc_asset" in
    *immutable*no-cache*|*no-cache*immutable*) erro "no-cache concatenado no asset hasheado: $cc_asset" ;;
    *immutable*)                               ok "asset: $cc_asset" ;;
    *)                                         erro "asset sem immutable: ${cc_asset:-<ausente>}" ;;
  esac
fi

echo
if [ "$falhas" -gt 0 ]; then
  echo "✗ $falhas verificação(ões) falharam"
  exit 1
fi
echo "✓ fumaça passou"
