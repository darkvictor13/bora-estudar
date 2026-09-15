# 30 — Cupom de acesso

**Situação:** implementada · **Comparativo:** §12 item 15 · **Inventário:** [`inventario-v96.md`](../inventario-v96.md) §1 · **Fluxos e2e:** F-CUP-01 (em `fixme`)

> **Atualizada em 14/09/2026.** `coupons` está no schema de 14/09/2026 com RLS ligada, zero policy e zero
> grant, de propósito: validar o código no cliente entregaria a lista de
> códigos. O resgate **precisa nascer como RPC**, e `F-CUP-01` está `fixme`.

---

## Problema

A tabela existe, e ninguém a lê.

`coupons` está no schema desde a migration inicial — `code`, `months`,
`max_uses`, `current_uses`, `valid_until`, `active` —, com policy de leitura que
só mostra cupom vigente. `subscriptions.coupon_id` aponta para ela. E **nenhuma
tela do produto lê ou escreve qualquer uma das duas colunas**.

O efeito prático: um aluno que se cadastra fica na lista de espera até um
professor liberar o acesso à mão. Não existe caminho para experimentar o produto
sozinho.

Na v96 existia, e era o caso mais claro de escrita que este schema foi desenhado
para impedir: `CUPONS_ACESSO_TESTE` era um objeto **no JavaScript do
navegador** com um código, e aplicá-lo era um `upsert` direto em `profiles`
gravando `status_acesso: 'ativo'` e `plano_expira_em` (aluno.js:3905). Quem
abrisse o console liberava o próprio acesso pelo tempo que quisesse.

O inventário já registrou a decisão: *"se o cupom voltar, é como RPC que valida
o código e cria a assinatura, nunca como escrita do aluno"*.

---

## Regras

| Id | Regra |
|---|---|
| R-CUP-01 | O cupom é resgatado por **RPC**, `redeem_coupon`. O aluno **não** tem grant de escrita em `subscriptions`, e não passa a ter: liberar acesso é execução, e a validade e a contagem de usos são invariantes que uma tela não respeita sozinha. |
| R-CUP-02 | O código é comparado **normalizado**: sem espaços e em maiúsculas, como `normalizarCupomAcesso` da v96. "cupom 3meses" e "CUPOM3MESES" são o mesmo cupom, porque a pessoa digita o que está no papel. |
| R-CUP-03 | Um cupom só vale se estiver **ativo**, **dentro da validade** e **abaixo do limite de usos**. As três condições são checadas dentro da RPC, e a de usos é reconferida na gravação — a `check` `coupon_uses_within_limit` é quem garante sob concorrência. |
| R-CUP-04 | O resgate concede `months` meses **a partir de hoje**, gravando `validity` como `daterange`. É `subscriptions`, não `profiles`: a v96 escrevia data solta no perfil, e por isso não tinha como ter histórico. |
| R-CUP-05 | **Um aluno não resgata o mesmo cupom duas vezes.** A segunda tentativa é recusada com mensagem própria, e o critério é `subscriptions.coupon_id` — não é preciso tabela nova para saber quem usou o quê. |
| R-CUP-06 | **Aluno com acesso ativo não resgata.** Empilhar cupons viraria uma forma de renovar sozinho para sempre; renovar é decisão do professor. |
| R-CUP-07 | A RPC recebe `request_id` e passa por `reserve_operation`. Ela grava e tem payload, então entra na primeira das duas formas do `CLAUDE.md`: mesmo id e mesmo código devolvem o resultado anterior sem consumir um segundo uso. |
| R-CUP-08 | O `request_id` é gerado **uma vez, na carga da tela**, e reusado em todo reenvio. Gerá-lo no ponto de uso transformaria a proteção do servidor em decoração — é a terceira das três ordenações do `CLAUDE.md`. |
| R-CUP-09 | Código inexistente, expirado, esgotado ou inativo recebem **a mesma resposta**: "Cupom inválido ou expirado." Distinguir os casos entregaria um oráculo para adivinhar códigos válidos. |
| R-CUP-10 | O aluno resgata em `/aluno/lista-espera`, que é a tela de quem ainda não tem acesso. Não há tela nova. |
| R-CUP-11 | O cupom **não cria vínculo com professor** e não cria planejamento. Ele resolve o acesso; o aluno liberado sem professor vê "Nenhum planejamento ativo" e continua na fila para ser reivindicado, exatamente como a spec [13](13-vinculo-e-liberacao-de-acesso.md) descreve. |
| R-CUP-12 | `current_uses` é incrementado **na mesma transação** que cria a assinatura. Duas gravações separadas dariam um cupom consumido sem acesso concedido, ou o contrário. |

---

## Fluxo

```
/aluno/lista-espera  →  [resgatar cupom]  request_id gerado na CARGA da tela
      ▼
redeem_coupon(code, request_id)
      ├─ reserve_operation: mesmo id + mesmo código → devolve o anterior
      ├─ normaliza o código: sem espaço, maiúsculas
      ├─ ativo? dentro da validade? abaixo do limite?   ─ não → "inválido ou expirado"
      ├─ já tem acesso ativo?                            ─ sim → recusa
      ├─ já usou ESTE cupom?                             ─ sim → recusa
      └─ na MESMA transação:
             subscriptions: active, validity = [hoje, hoje + months)
             coupons: current_uses + 1        ← a check garante o teto
      ▼
 o aluno passa a ver as telas de estudo, sem planejamento até um professor o pegar
```

---

## Superfície

| Camada | Item |
|---|---|
| Rota | `/aluno/lista-espera` |
| Componentes | `CouponForm.tsx`, em `components/student/` |
| Actions | `redeemCoupon`, em `lib/data/account-actions.ts` |
| Leitura | nenhuma nova — a tela já sabe se o aluno tem acesso |
| RPCs | **uma nova:** `redeem_coupon(text, uuid)` |
| Migration | **uma:** só a RPC — `select` em `coupons` já era concedido desde a migration inicial |
| Banco | `coupons` e `subscriptions`, escrita só pela RPC |
| Testes | `supabase/tests/01_grants.sql` (a tabela sem grant), `apps/e2e/tests/student-analysis.spec.ts` |

**O campo do código é controlado.** O React 19 reseta o formulário quando a
action termina, **inclusive quando ela devolve erro**: com o campo solto, quem
errasse o código perderia o que digitou. *Ajustado em 31/08/2026, ao
implementar: foi o `F-CUP-02` que expôs isso, submetendo o mesmo formulário
quatro vezes seguidas.*

**Cada teste cria o próprio cupom.** `current_uses` é um contador
compartilhado, e dois testes resgatando o mesmo código em paralelo leem um do
outro. O seed ganha cupons também, mas só para uso à mão no navegador.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Cupom válido cria assinatura ativa com a validade certa e incrementa o uso | `15_coupon.sql` |
| CA-02 | O código é comparado normalizado | `15_coupon.sql` |
| CA-03 | Inativo, expirado e esgotado são recusados, os três com a mesma mensagem | `15_coupon.sql` |
| CA-04 | Aluno com acesso ativo é recusado | `15_coupon.sql` |
| CA-05 | O mesmo aluno não resgata o mesmo cupom duas vezes | `15_coupon.sql` |
| CA-06 | Mesmo `request_id` e mesmo código devolvem o anterior sem consumir outro uso | `15_coupon.sql` |
| CA-07 | O aluno continua sem grant de escrita em `subscriptions` | `15_coupon.sql` |
| CA-08 | O aluno resgata pela tela e passa a ver as telas de estudo | F-CUP-01 |
| CA-09 | Código inválido mostra a mensagem única | F-CUP-02 |
| CA-10 | Resgatar duas vezes pela tela não concede dois acessos | F-CUP-03 |
| CA-11 | O aluno liberado por cupom continua sem planejamento e sem professor | F-CUP-04 |

---

## Fora de escopo

- **Criar e editar cupons pela interface.** É administração, e o `admin` do
  schema não tem tela nenhuma ainda.
- **Cupom que já vincula a um professor.** Vínculo é ato do professor, spec
  [13](13-vinculo-e-liberacao-de-acesso.md), e um cupom que empurra aluno para
  a lista de alguém inverte isso.
- **Renovar com cupom.** Ver `R-CUP-06`.
- **Cupom de desconto em pagamento.** Não há pagamento no produto.
- **Cupom por link.** Um código no `?cupom=` que se aplica sozinho concede
  acesso sem ato deliberado do aluno.
