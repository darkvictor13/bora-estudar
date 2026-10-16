# 30 — Cupom de acesso

**Situação:** especificada em 15/10/2026 · **Comparativo:** §12 item 15 · **Inventário:** [`inventario-v96.md`](../inventario-v96.md) §1 · **Fluxos e2e:** F-CUP-01 a F-CUP-03

> **Reescrita em 15/10/2026.** A versão anterior descrevia um schema que não existe mais (`subscriptions`,
> `reserve_operation`, `coupons.max_uses`). O que vale hoje é `coupons` com
> `code`, `months_granted` e `active`, mais duas colunas e uma tabela de
> resgates criadas pela migration desta spec. O princípio não mudou: **o código
> nunca é validado no cliente**.

---

## Problema

Um aluno que se cadastra fica na lista de espera até um professor liberar o
acesso à mão. Não existe caminho para experimentar o produto sozinho, e a tabela
`coupons` — que existe desde a migration inicial — não é lida por tela nenhuma.

Na v96 o cupom era um objeto **no JavaScript do navegador**, e aplicá-lo era um
`upsert` direto em `profiles` gravando o acesso: quem abrisse o console liberava
o próprio acesso pelo tempo que quisesse. Este schema fecha essa escrita de
propósito (`profiles.access_status` e `access_expires_at` estão fora de todo
grant), e `coupons` tem RLS ligada, zero policy e zero grant: validar o código no
cliente entregaria a lista de códigos a quem pedisse.

O resgate, portanto, **é uma RPC** que valida, concede e registra numa
transação só — e é o único caminho em que o próprio aluno altera o próprio
acesso.

---

## Regras

| Id | Regra |
|---|---|
| R-CUP-01 | O resgate é `redeem_coupon(p_code text)`, `SECURITY DEFINER`, revogada de `public` e `anon`. O aluno **não** ganha grant de escrita em `profiles` nem em `coupons`: o acesso concedido é execução. |
| R-CUP-02 | O código é comparado **normalizado**: sem espaços e em maiúsculas. "cupom 3meses" e "CUPOM3MESES" são o mesmo cupom, porque a pessoa digita o que está no papel. Código vazio recebe "Informe o código do cupom." |
| R-CUP-03 | Um cupom só vale se estiver `active`, dentro de `valid_until` (quando houver) e abaixo de `max_uses` (quando houver). As três condições são lidas **com a linha do cupom travada** (`for update`), então dois resgates simultâneos do último uso não passam os dois. |
| R-CUP-04 | Código inexistente, inativo, vencido ou esgotado recebem **a mesma resposta**: "Cupom inválido ou expirado." Distinguir os casos entregaria um oráculo para adivinhar códigos. **O estado do aluno vem ANTES do código** (R-CUP-06, R-CUP-15): quem tem acesso vigente recebe "Seu acesso já está liberado." para qualquer código, válido ou não — se a checagem de acesso viesse depois da validade, as duas frases diriam ao aluno com acesso quais códigos existem. |
| R-CUP-05 | O resgate concede `months_granted` meses **a partir de agora**: `access_status = 'active'`, `access_expires_at = now() + months_granted meses`, `coupon_used = <código>` e `access_origin = 'coupon'`. |
| R-CUP-06 | **Aluno com acesso vigente não resgata**: "Seu acesso já está liberado." Empilhar cupons viraria renovação automática para sempre, e renovar é decisão do professor. A resposta não depende do código. |
| R-CUP-07 | **Um aluno resgata um cupom uma vez.** A PK `(coupon_id, student_id)` de `coupon_redemptions` é quem garante, e a segunda tentativa recebe "Você já usou este cupom." |
| R-CUP-08 | **Naturalmente idempotente**, e quem sustenta é a PK de R-CUP-07 mais `profiles.coupon_used`: a retentativa de quem acabou de resgatar (a resposta se perdeu na rede) encontra o resgate gravado, o acesso ainda vigente e o mesmo código, e **devolve o resultado anterior** em vez de acusar "já usou". Só recusa quando o acesso desse cupom já acabou. |
| R-CUP-09 | Só aluno resgata, e conta excluída não: professor recebe `42501`, e `deleted_at` preenchido também. |
| R-CUP-10 | O resgate **não cria vínculo com professor nem planejamento**. Resolve o acesso; o aluno liberado sem professor continua na fila para ser reivindicado (`link_student`). |
| R-CUP-11 | `coupon_redemptions` **fica** quando a conta é excluída (spec 46): é histórico de liberação, e a FK para `profiles` é `RESTRICT` como a de `access_grants`. Depois da exclusão ela aponta para um perfil sem nome, e-mail nem vínculo. |
| R-CUP-12 | O aluno lê os próprios resgates (`coupon_redemptions_select`). **Ninguém escreve direto**: a escrita é da RPC. |
| R-CUP-13 | O resgate mora em `/aluno/lista-espera`, a tela de quem ainda não tem acesso, e some quando o acesso é liberado. Não há tela nova. O campo se chama `coupon`, e o erro de código marca esse campo. |
| R-CUP-14 | **Cadastrar cupom não tem tela.** É operação de quem administra o produto, por SQL com `service_role`, como a carga das bibliotecas. |
| R-CUP-15 | **Aluno bloqueado pelo professor não se reativa com cupom**: `access_status = 'suspended'` recebe "Seu acesso está bloqueado. Fale com seu professor.", **antes** de o código ser olhado, então a frase também não é oráculo. O cupom é para quem ainda não tem acesso (pendente) ou o deixou vencer; sem esta regra o bloqueio durava até o próximo cupom, e `access_grants` não registrava a reativação (QA2-A01). |

---

## Fluxo

```
/aluno/lista-espera  →  [código]  Resgatar
      ▼
redeem_coupon(code)
      ├─ aluno autenticado, não professor, não excluído?     ─ não → 42501
      ├─ código normalizado vazio?                           ─ sim → "Informe o código…"
      ├─ já resgatou ESTE cupom?
      │        ├─ acesso ainda vigente, do mesmo código      → devolve o resultado anterior
      │        └─ senão                                      → "Você já usou este cupom."
      ├─ já tem acesso vigente?                              ─ sim → "Seu acesso já está liberado."
      ├─ suspenso pelo professor?                            ─ sim → "Seu acesso está bloqueado. Fale com seu professor."
      ├─ trava o cupom: ativo? vigente? abaixo do limite?    ─ não → "Cupom inválido ou expirado."
      └─ na MESMA transação:
             coupon_redemptions: (cupom, aluno, meses, validade)
             profiles: active, validade, coupon_used, access_origin = 'coupon'
      ▼
 a sessão é relida, e o aluno passa a ver as telas de estudo
```

---

## Superfície

| Camada | Item |
|---|---|
| Migration | `20261015160000_coupon_redemption.sql`: `coupons.valid_until` e `max_uses`, `coupon_redemptions`, a RPC |
| RPC | `redeem_coupon` — a décima terceira. Revogada de `public` e `anon`, concedida a `authenticated` |
| Contrato | `redeemCoupon(code): Promise<Result<Session>>`, já existente |
| Telas | `/aluno/lista-espera` — `CouponForm` |
| Testes | `supabase/tests/23_coupon_redemption.sql`, `07_schema.sql`, `apps/e2e/tests/student-analysis.spec.ts` |

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Código válido libera o acesso pelo prazo do cupom, grava o resgate, e o aluno passa a ver as telas de estudo | `23_coupon_redemption.sql`, F-CUP-01 |
| CA-02 | Código inexistente, inativo, vencido e esgotado dão a mesma mensagem | `23_coupon_redemption.sql`, F-CUP-02 |
| CA-03 | O código é normalizado (espaços e caixa) | `23_coupon_redemption.sql` |
| CA-04 | Aluno com acesso vigente não resgata, qualquer que seja o código, e aluno suspenso pelo professor também não; quem já usou o cupom e perdeu o acesso não resgata de novo | `23_coupon_redemption.sql` |
| CA-05 | A retentativa de quem acabou de resgatar devolve o resultado anterior, sem segundo resgate | `23_coupon_redemption.sql` |
| CA-06 | O último uso de um cupom com `max_uses` não passa duas vezes | `23_coupon_redemption.sql` |
| CA-07 | Professor, anônimo e conta excluída são recusados; o aluno não escreve em `coupons`, `coupon_redemptions` nem no próprio acesso | `23_coupon_redemption.sql`, `01_grants.sql` |
| CA-08 | O resgate sobrevive à exclusão da conta, sem identificar ninguém | `22_account_deletion.sql`, `07_schema.sql` |
| CA-09 | Cupom inválido mostra o erro no campo e não libera nada | F-CUP-02 |
| CA-10 | Com o acesso liberado a tela não oferece o resgate | F-CUP-03 |

---

## Fora de escopo

- **Tela para cadastrar e desativar cupom** (R-CUP-14).
- **Cupom de desconto ou de venda.** Este cupom concede tempo de acesso, e só isso.
- **Resgate com professor atribuído.** O cupom não vincula (R-CUP-10).
- **Registrar em `access_grants`.** A tabela exige `teacher_id`, e o resgate não tem professor; o histórico do cupom é `coupon_redemptions`.
