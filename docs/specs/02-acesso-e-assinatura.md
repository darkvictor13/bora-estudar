# 02 — Acesso e assinatura

**Situação:** implementada · **Fluxos e2e:** F-ALU-05, F-ALU-06, F-ALU-07

---

## Problema

Autenticar não é autorizar. Uma conta de aluno existe a partir do cadastro
público, mas o produto só faz sentido quando um professor montou um
planejamento — e quando o acesso foi pago ou liberado. Entre esses dois momentos
existe uma pessoa logada que não pode ver tela de estudo nenhuma e, mesmo
assim, precisa conseguir se apresentar.

Na versão anterior isso era decidido no cliente: `aplicarRestricaoAcessoAluno()`
marcava os itens do menu com uma classe e o `nav()` desviava para um painel de
bloqueio. Quem chamasse `nav('dashboard')` pelo console entrava.

---

## Regras

| Id | Regra |
|---|---|
| R-ACC-01 | Aluno tem acesso quando existe uma linha em `subscriptions` com `status = 'active'` e `student_id` igual ao dele. Professor e admin sempre têm. |
| R-ACC-02 | **Uma assinatura ativa por aluno**, garantido pelo índice parcial `active_subscription_uidx`. O estado "duas vigentes" é inexprimível. |
| R-ACC-03 | Assinatura `active` exige `validity` preenchido — constraint `active_subscription_has_validity`. Acesso sem data de fim não existe. |
| R-ACC-04 | A verificação é feita **no loader de cada tela de estudo**, por `requireStudentAccess()`. Não fica no layout: o layout precisa continuar renderizando a sidebar e as duas telas livres. |
| R-ACC-05 | Duas rotas são alcançáveis sem acesso liberado: `/aluno/conta` e `/aluno/lista-espera`, listadas em `STUDENT_ROUTES_WITHOUT_ACCESS`. |
| R-ACC-06 | Sem acesso, as cinco telas de estudo redirecionam para `/aluno/lista-espera`. |
| R-ACC-07 | Na sidebar, item sem acesso vira `<span aria-disabled="true">` **sem destino** — não um `<Link>` desabilitado. Um Link continua navegando no clique, o loader redireciona de volta, e a pessoa dá a volta inteira para não sair do lugar. |
| R-ACC-08 | `hasAccess` é recalculado a cada navegação (ver R-AUTH-10). Quando o professor libera o acesso, a próxima navegação do aluno já entra. |
| R-ACC-09 | O aluno pode **ler** `subscriptions` (a própria) e não pode inseri-la nem ativá-la: a tentativa é `42501`. O `GRANT UPDATE` existe para o professor; a RLS é quem restringe a quem. |
| R-ACC-10 | Sem planejamento ativo, as telas de estudo abrem e mostram "Nenhum planejamento ativo." — acesso liberado e planejamento ativo são condições independentes. |

---

## Os quatro estados de `access_status`

| Estado | Significado | Efeito na tela |
|---|---|---|
| `pending` | conta criada, acesso ainda não liberado | telas de estudo redirecionam; badge "Aguardando liberação" |
| `active` | vigente | acesso normal |
| `suspended` | interrompido pelo professor | mesmo efeito de `pending`; badge "Suspenso" |
| `expired` | `validity` passou | mesmo efeito; badge "Expirado" |

Só `active` libera. Os outros três são distinguidos para o professor entender o
motivo, não para mudar o comportamento do aluno.

---

## Fluxo

```
loader de tela de estudo
        │
        ▼
requireStudentAccess()
        │
        ├─ requireRole("student")          → papel errado: home do papel [01]
        └─ session.hasAccess === false     → /aluno/lista-espera
                                              │
                                              ▼
                              /aluno/conta e /aluno/lista-espera continuam abrindo
                              itens de estudo da sidebar: aria-disabled="true"
```

---

## Superfície

| Camada | Item |
|---|---|
| Guarda | `requireStudentAccess` — `lib/auth/session.ts` |
| Constante | `STUDENT_ROUTES_WITHOUT_ACCESS` — `lib/routes.ts` |
| Layout | `routes/StudentLayout.tsx` (monta a sidebar com `enabled`) |
| Componente | `components/Sidebar.tsx` |
| Banco | `subscriptions`, `active_subscription_uidx`, enum `access_status`, `coupons` |
| Leitura | `SessionContext.hasAccess` |

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Com `subscriptions.status = 'suspended'`, as cinco telas de estudo redirecionam para `/aluno/lista-espera` | F-ALU-07 |
| CA-02 | `/aluno/conta` e `/aluno/lista-espera` continuam abrindo sem acesso | F-ALU-07 |
| CA-03 | Os itens de estudo da sidebar vêm com `aria-disabled="true"` e sem `href` | F-ALU-07 |
| CA-04 | Liberar o acesso e navegar de novo entra sem recarregar a página | **sem cobertura** — depende do fluxo de liberação, que não existe |
| CA-05 | Aluno inserindo a própria assinatura ativa recebe `42501` | F-ISO-02, `supabase/tests/02_rls.sql` |
| CA-06 | Aluno com acesso e sem planejamento ativo vê "Nenhum planejamento ativo." nas cinco telas, e nenhum dado de outro aluno | F-ALU-06 |
| CA-07 | Tentar gravar uma segunda assinatura `active` para o mesmo aluno viola `active_subscription_uidx` | `supabase/tests/` |

---

## O que falta

Esta é a feature com a maior lacuna do produto, e ela é de tela, não de banco —
a RLS e o `GRANT UPDATE (status, plan, validity, coupon_id)` já autorizam o
professor a escrever em `subscriptions`.

- **Vincular aluno a professor.** `student_teacher_links` só é escrita por
  `service_role`. Sem vínculo, o aluno não aparece para nenhum professor e a
  assinatura nunca é liberada: quem se cadastra fica na lista de espera para
  sempre.
- **Liberar e suspender acesso.** Sem tela.
- **Cupom.** A tabela `coupons` existe, com FK a partir de `subscriptions`, e
  nenhuma tela a lê.

Ver [`../comparativo-fluxos-v2.md`](../comparativo-fluxos-v2.md) §12, itens 2 e 7.

---

## Fora de escopo

- **Cobrança.** Não há integração de pagamento; `subscriptions.plan` é texto
  livre e a liberação é ato do professor.
- **Expiração automática.** Nada move `active` para `expired` quando `validity`
  passa; a leitura usa `status`, não a data. É consciente: um job noturno teria
  de existir, e ainda não existe.
- **Acesso parcial por tela.** A granularidade é "todas as telas de estudo" ou
  nenhuma.
