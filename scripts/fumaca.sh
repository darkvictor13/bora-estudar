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
  curl -sS --max-time 60 "$URL$asset" -o "$bundle" || true

  # A chave é assada no bundle pelo Vite. Se ela não está aqui, o build rodou
  # sem as VITE_*, e o produto sobe com tela branca.
  if grep -q "$HOST" "$bundle"; then
    ok "a URL do Supabase do ambiente está no bundle"
  else
    erro "o bundle não cita $HOST — build sem as VITE_* do ambiente?"
  fi

  # Nenhum segredo pode ter entrado no bundle. O padrão exige material de chave
  # DEPOIS do prefixo: `@supabase/supabase-js` carrega o literal `sb_secret_`
  # num validador de formato, e um grep pelo prefixo sozinho reprova todo
  # deploy. Medido contra o bundle publicado.
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
