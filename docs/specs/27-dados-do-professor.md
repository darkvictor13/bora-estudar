# 27 — Dados do próprio professor

**Situação:** não implementada · **Comparativo:** §12 item 12 · **Inventário:** [`inventario-v96.md`](../inventario-v96.md) §9 · **Fluxos e2e:** F-CONTA-01 a F-CONTA-05

---

## Problema

O professor não tem como corrigir o próprio nome.

`/aluno/conta` existe e funciona: nome e WhatsApp, gravados em `profiles`. O
professor não tem rota equivalente, e a action **recusa** — `updateProfile`
começa com `requireRole("student")`. Um professor que se cadastrou com o nome
errado convive com ele em toda tela do aluno, porque é o nome do professor que
aparece na ficha e na sidebar.

Está registrado na §7 de [`fluxos-e2e.md`](../fluxos-e2e.md) como fluxo que não
existe, e no inventário como 🟡 — **não é resgate da v96**: lá o professor
também não editava os próprios dados. É a assimetria que a reescrita criou ao
dar conta ao aluno e não ao professor.

E há um segundo problema, no banco. `grant select, insert, update on
public.profiles to authenticated` concede **todas as colunas**. A tela do aluno
diz "Para trocar o e-mail, fale com o professor", mas nada na fronteira impede
que ele o troque — a promessa da tela não é sustentada por nenhuma defesa.

---

## Regras

| Id | Regra |
|---|---|
| R-CONTA-01 | `/professor/conta` existe, com os mesmos campos de `/aluno/conta`: nome e telefone. Não é tela nova — é a **mesma** tela, servida às duas rotas. |
| R-CONTA-02 | `updateProfile` deixa de exigir papel e passa a exigir apenas **sessão**. Quem decide o que pode ser escrito é a RLS, que já limita a linha a `id = auth.uid()`; o papel nunca foi o que protegia isto. |
| R-CONTA-03 | O `grant update` em `profiles` passa a ser **por coluna**: `name`, `phone` e `updated_at`. `role` e `contact_email` saem. É a segunda das três defesas do `CLAUDE.md`, e é o que faz a frase "para trocar o e-mail, fale com o professor" virar verdade em vez de convenção de tela. |
| R-CONTA-04 | `role` continua protegido **também** pelo `with check` da policy. Duas defesas para a mesma coisa é o que já existe em `study_plan_blocks`, e por bom motivo: um `grant` esquecido numa migration futura não reabre o buraco sozinho. |
| R-CONTA-05 | O nome tem no mínimo **3 caracteres** na tela, e a `check` da tabela exige 2. A tela é mais estrita de propósito — "Ana" passa, "An" não —, e o banco continua sendo quem garante o mínimo absoluto. |
| R-CONTA-06 | Salvar revalida os loaders, e o nome muda **na sidebar** no mesmo instante. É o que o `success` do `useFormActionState` já faz; não há redirecionamento porque o formulário não some. |
| R-CONTA-07 | A tela do professor **não** oferece campos que não são dele: nada de área de interesse, concurso em foco ou fuso — isso é a lista de espera, que é do aluno. |
| R-CONTA-08 | Nenhuma tela permite trocar o **papel**. Aluno não vira professor pela interface, e a tentativa direta na API é recusada pelo grant e pela policy. |

---

## Fluxo

```
/aluno/conta      ─┐
                   ├─ a MESMA tela, o MESMO action
/professor/conta  ─┘
      │
      └─ updateProfile: exige sessão, não papel
             └─ update profiles set name, phone where id = auth.uid()
                    ├─ policy: id = auth.uid() e role inalterado
                    └─ grant por coluna: só name, phone, updated_at
      ▼
 revalida os loaders → o nome muda na sidebar
```

---

## Superfície

| Camada | Item |
|---|---|
| Rota | `/professor/conta`, nova; `/aluno/conta`, inalterada |
| Componentes | `Account.tsx`, generalizado |
| Actions | `updateProfile`, sem `requireRole` |
| Leitura | a mesma consulta a `profiles` |
| RPCs | **nenhuma nova** |
| Migration | **uma:** troca o `grant update` de `profiles` por um grant de colunas |
| Testes | `supabase/tests/14_profile_grants.sql`, `apps/e2e` |

**A migration é compatível com o bundle no ar.** O único caminho que escreve em
`profiles` hoje é `updateProfile`, e ele escreve exatamente `name` e `phone` —
as duas colunas que continuam concedidas. Nenhuma tela publicada escreve
`role` ou `contact_email`.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Depois do grant por coluna, `role` e `contact_email` são recusados com `42501` | `14_profile_grants.sql` |
| CA-02 | `name` e `phone` continuam graváveis pelo dono | `14_profile_grants.sql` |
| CA-03 | Ninguém escreve o perfil de outro, e a tentativa afeta zero linhas | `14_profile_grants.sql` |
| CA-04 | O professor abre `/professor/conta` e vê os próprios dados | F-CONTA-01 |
| CA-05 | O professor salva um nome novo e ele aparece na sidebar | F-CONTA-02 |
| CA-06 | Nome curto demais é recusado com mensagem | F-CONTA-03 |
| CA-07 | O e-mail aparece bloqueado nas duas telas | F-CONTA-04 |
| CA-08 | A tela do aluno continua funcionando igual | F-CONTA-05 |

---

## Fora de escopo

- **Trocar o e-mail de acesso.** É `auth.users`, e mexer nisso exige fluxo de
  confirmação por e-mail que o produto não tem.
- **Trocar a senha.** Mesma razão: é do Supabase Auth, não de `profiles`.
- **Foto de perfil.** Não existe coluna, nem armazenamento configurado.
- **O professor editar os dados do aluno.** O professor lê o perfil do aluno
  (`profiles_read` passa por `is_teacher_of`), e não escreve. Quem corrige o
  nome do aluno é o aluno.
- **Excluir a própria conta.** `DELETE` não é concedido em lugar nenhum, e
  encerramento de conta é decisão de produto com efeito no histórico.
