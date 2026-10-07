# 10 — Conta e lista de espera

**Situação:** implementada · **Fluxos e2e:** F-CONTA-01, F-ESP-01

---

## Problema

Entre criar a conta e ter acesso liberado existe um intervalo que pode durar
semanas. Nele o aluno precisa conseguir **duas** coisas: manter os próprios
dados corretos, e dizer ao professor quem é e para qual concurso estuda — que é
a informação com que o professor decide a quem oferecer acesso.

São as únicas duas telas que abrem sem assinatura ativa (R-ACC-05), e por isso
não podem depender de planejamento, de meta nem de bateria.

---

## Regras

### Meus dados

| Id | Regra |
|---|---|
| R-CTA-01 | O aluno edita `name` e `phone` do próprio perfil. |
| R-CTA-02 | O e-mail é `readOnly` na tela: trocá-lo é operação de autenticação, não de perfil. |
| R-CTA-03 | O nome tem de 3 a 120 caracteres, medidos sem os espaços das pontas. Abaixo de 3, a action recusa: "Informe seu nome completo."; acima de 120, "O nome pode ter até 120 caracteres.". O teto também mora no banco (`profiles_name_check`), e o campo tem `maxlength` (QA-15, D-06). |
| R-CTA-04 | O `UPDATE` é filtrado por `session.profileId`, e a RLS de `profiles` confirma. Um aluno não edita o perfil de outro. |
| R-CTA-05 | Ao salvar com sucesso, a revalidação re-roda os loaders de **todas** as rotas casadas, incluindo o do layout — que é quem alimenta o nome na sidebar. É por isso que o nome novo aparece lá sem recarregar. |
| R-CTA-06 | O rótulo do e-mail usa `<label htmlFor>` de verdade. Um `<span>` solto não é anunciado por leitor de tela. |
| R-CTA-15 | O cartão Acesso mostra o professor do aluno **pelo nome**, lido por `my_teacher()`. A policy `profiles_select` só abre a própria linha e as dos próprios alunos, então um `select` direto na linha do professor volta vazio — e era isso que fazia o aluno vinculado ler "Ainda sem professor" (QA-08). A leitura que falha é erro, não ausência: o adaptador lança. |
| R-CTA-16 | "Válido até" é um **instante** (`timestamptz`), mostrado no fuso do aparelho (D-11): um vencimento às 22h de Brasília aparece no dia dele, não no seguinte (N-04, QA-20). |

### Lista de espera

| Id | Regra |
|---|---|
| R-CTA-07 | Três campos são obrigatórios, validados na action: WhatsApp, área de interesse e concurso em foco. Data de nascimento e fuso são opcionais. As faixas são UMA só, em `checkWaitlist` e nas CHECKs de `waitlist` (QA-19, D-08): WhatsApp só com dígitos, espaço, `()`, `+` e `-`, e de 10 a 13 dígitos ("Informe o WhatsApp com DDD, como (11) 90000-0000."); área de interesse de 2 a 120 ("Informe sua área de interesse."); concurso de 2 a 200 ("Informe para qual concurso você estuda."); nascimento, quando informado, entre 01/01/1900 e hoje, sem idade mínima ("A data de nascimento precisa ser entre 01/01/1900 e hoje."). Antes o banco pedia 8 a 30 caracteres, o adaptador só "não vazio" e a fixture 10 dígitos. |
| R-CTA-08 | A gravação é **upsert por `student_id`**, que é a chave primária de `waitlist`. Salvar duas vezes atualiza, nunca duplica. |
| R-CTA-09 | `name` e `email` não vêm do formulário: são copiados da sessão. O aluno não escolhe com que nome entra na lista. |
| R-CTA-10 | Campo opcional vazio grava `null`, não string vazia. |
| R-CTA-11 | Com acesso já liberado, a tela mostra "Seu acesso já está liberado. Bons estudos." em vez do aviso de espera — e o formulário continua editável. |
| R-CTA-12 | `waitlist.status` é texto, padrão `aguardando`, e é escrito por fora do produto. A tela apenas o exibe. |

### Preferências

| Id | Regra |
|---|---|
| R-CTA-13 | `student_preferences` tem grant de `select, insert, update` para `authenticated` e guarda `cycle_config` e `review_config`. **Nenhuma tela a lê ou escreve hoje.** A coluna `theme` saiu daqui em 29/08/2026: preferência de interface é da conta, não do aluno, e mora em `user_preferences` — ver [11](11-tema-claro-escuro.md). |
| R-CTA-14 | `cycle_config` e `review_config` são `jsonb` de propósito: preferência de interface, sem relacionamento e sem necessidade de agregação. O critério não é "jsonb é ruim", é se o conteúdo tem estrutura relacional que precisa de integridade ou consulta. |

---

## Fluxo

```
cadastro público [01] ──► /aluno/lista-espera
                              │  "Seu acesso ainda não foi liberado"
                              ▼
                  preenche WhatsApp · área · concurso
                              │
                              ▼
                  upsert waitlist (chave: student_id)
                              │
                              ▼
                  professor decide  ── (sem tela hoje) ──► subscriptions.status = 'active'
                              │
                              ▼
                  próxima navegação do aluno já entra nas telas de estudo  [02, R-ACC-08]
```

---

## Superfície

| Camada | Item |
|---|---|
| Rotas | `/aluno/conta`, `/aluno/lista-espera` |
| Telas | `routes/student/Account.tsx`, `routes/student/Waitlist.tsx` |
| Actions | `updateProfile`, `saveWaitlistEntry` — `lib/data/account-actions.ts` |
| Leitura | `getWaitlistEntry` — `lib/data/student.ts` |
| Componentes | `components/ui.tsx` (`Field`, `Card`, `Alert`, `Badge`), `components/auth/AuthForm.tsx` |
| Banco | `profiles`, `waitlist`, `student_preferences` |

Campos: `#field-name`, `#field-phone` em Meus dados; `#field-whatsapp`,
`#field-interestArea`, `#field-focusExam`, `#field-birthDate`, `#field-timezone`
na Lista de espera.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Salvar os dados responde "Dados atualizados."; o nome novo aparece na sidebar e persiste depois de recarregar | F-ALU-04 |
| CA-02 | Nome com menos de 3 caracteres: "Informe seu nome completo." | F-ALU-04 |
| CA-03 | O campo de e-mail é `readOnly` | F-ALU-04 |
| CA-04 | Salvar a inscrição responde "Cadastro salvo. Você está na lista de espera." | F-ALU-05 |
| CA-05 | Salvar duas vezes **não** duplica: é upsert por `student_id` | F-ALU-05 |
| CA-06 | Faltando qualquer um dos três obrigatórios, a action recusa com mensagem única | F-ALU-05 |
| CA-07 | Com acesso liberado, a tela mostra "Seu acesso já está liberado." | F-ALU-05 |
| CA-08 | As duas telas abrem com assinatura `suspended` | F-ALU-07 |
| CA-10 | Aluno vinculado vê o nome do professor no cartão Acesso; sem vínculo, "Ainda sem professor" | F-CONTA-01 |
| CA-09 | Um aluno não consegue alterar o perfil de outro | **sem cobertura** na suíte de telas; coberto por RLS em `supabase/tests/02_rls.sql` |

---

## Fora de escopo

- **Professor editando os próprios dados.** `updateProfile` exige
  `requireRole("student")`. O professor não tem tela de conta.
- **Trocar o e-mail e trocar a senha estando logado.** A troca de senha só
  acontece pelo fluxo de recuperação — ver [01](01-autenticacao.md).
- **Excluir a conta.**
- **Foto de perfil.**
- **Tema claro/escuro.** Deixou de ser fora de escopo: está em
  [11](11-tema-claro-escuro.md), implementado. A preferência é da conta e vale
  para os três papéis, então não mora nas preferências do aluno.
- **Preferências de ciclo e de revisão.** As duas colunas `jsonb` estão
  reservadas para quando a revisão espaçada existir — ver [09](09-reforco-e-revisoes.md).
