# 46 — Exclusão de conta e documentos legais

**Situação:** especificada em 15/10/2026 · **Fluxos e2e:** F-LGPD-01 a F-LGPD-05

Nasce da auditoria de prontidão para produção (`chore/prod-readiness`). O produto coleta nome, e-mail, WhatsApp e data de nascimento, e até aqui não tinha política de privacidade, termos de uso nem caminho para a pessoa apagar a própria conta — três obrigações da LGPD.

---

## Problema

O aluno precisa poder **apagar a conta e tudo o que fez nela**, sem pedir a ninguém, e precisa ler **antes** o que será apagado e o que, mesmo assim, fica.

O banco foi desenhado para NÃO apagar certas coisas: `access_grants`, `mock_exam_results`, `mock_exam_subject_results`, `mock_exams` e o ledger de baterias referenciam `profiles` com `ON DELETE RESTRICT`, porque "quem liberou este aluno" e "qual nota saiu neste simulado" são histórico. Resultado: `delete from auth.users` falha para qualquer aluno que já teve acesso liberado. A exclusão, portanto, não é um `DELETE` — é uma operação com regra própria sobre o que sai e o que fica sem identificar ninguém.

E a pessoa precisa de um documento que diga, em português, quem trata os dados, quais, para quê, com quem se compartilha e como exercer os direitos.

---

## Regras

### O que a exclusão apaga

| Id | Regra |
|---|---|
| R-LGPD-01 | Excluir a conta apaga **tudo o que o aluno fez e escreveu**: planejamentos, cadernos, metas e registros de estudo, progresso e revisões de teoria, baterias e ciclos de reforço, marcações de leis e de cartões, anotações dos resumos, baralhos e cartões pessoais, revisões de cartões, inscrição na lista de espera e a matrícula em turma. |
| R-LGPD-02 | O login deixa de existir: e-mail, telefone, senha, metadados, identidades, sessões e fatores são removidos ou invalidados, e o e-mail fica livre para um novo cadastro, que não tem ligação com a conta apagada. |
| R-LGPD-03 | O nome do perfil vira "Conta excluída". O aluno deixa de aparecer na lista do professor (`teacher_id` nulo) e perde o acesso (`access_status = 'suspended'`, plano, cupom, origem e validade nulos). |

### O que fica, sem identificar ninguém

| Id | Regra |
|---|---|
| R-LGPD-04 | Ficam só três registros históricos, para métrica: **as liberações e bloqueios de acesso** (`access_grants`: ação, meses, validade, data), **os resgates de cupom** (`coupon_redemptions`: cupom, meses, validade, data) e **as notas de simulados presenciais** (`mock_exam_results`, `mock_exam_subject_results`), que sustentam a média e a distribuição da turma. Eles apontam para um perfil que já não tem nome, e-mail, telefone nem vínculo. |
| R-LGPD-05 | Uma tabela nova que referencie `profiles` não pode entrar sem decisão: `07_schema.sql` compara o catálogo de FKs com a lista "apagada" e a lista "retida" da função, e falha com a tabela que não está em nenhuma. |

### Como a operação se comporta

| Id | Regra |
|---|---|
| R-LGPD-06 | É a RPC `delete_my_account()`, sem parâmetro: o alvo é sempre `auth.uid()`. Só `authenticated`. É `SECURITY DEFINER` porque apaga o que o cliente não tem grant para apagar e escreve em `auth`. |
| R-LGPD-07 | **Naturalmente idempotente**, e quem sustenta é `profiles.deleted_at`: com a coluna preenchida, a retentativa devolve sem tocar em nada. O JWT de quem excluiu ainda vale até expirar (até uma hora); a segunda chamada, ou uma aba esquecida, não reexecuta nem acusa erro. |
| R-LGPD-08 | Vale **sem acesso vigente**: pendente, vencido e suspenso também excluem a conta. A tela de Meus dados é a que abre sem assinatura (R-ACC-05), e a LGPD não pede assinatura. |
| R-LGPD-09 | **Conta de professor não se exclui por aqui.** Apagar um professor apaga os planejamentos dos alunos dele, e isso é decisão de operação, não de autoatendimento. A RPC recusa com `42501` e a tela nem mostra o botão. |
| R-LGPD-10 | Depois de excluída, a conta não escreve mais: `profiles_update_own` e `waitlist_insert_student` exigem `deleted_at is null`, e `has_active_access()` é falso. É o que impede um JWT ainda válido de recriar o nome ou a inscrição que acabaram de ser apagados. |
| R-LGPD-11 | `profiles.deleted_at` é coluna nova, `timestamptz` nulável, fora do grant de qualquer papel. |

### O que a pessoa lê e confirma

| Id | Regra |
|---|---|
| R-LGPD-12 | A tela Meus dados do aluno tem o cartão **Excluir conta**, que diz as duas listas (R-LGPD-01 e R-LGPD-04) **antes** do botão, e diz que não há como desfazer. |
| R-LGPD-13 | Confirmar exige **digitar `EXCLUIR`**, num diálogo que repete as duas listas. Sem a palavra, o botão fica desabilitado. Sucesso encerra a sessão e leva a `/entrar` com a mensagem "Sua conta foi excluída." |
| R-LGPD-14 | Falha mostra o erro no próprio diálogo e **não encerra a sessão**: quem não sabe se excluiu precisa conseguir tentar de novo, e a RPC é segura para isso (R-LGPD-07). |

### Documentos

| Id | Regra |
|---|---|
| R-LGPD-15 | `/privacidade` e `/termos` são telas **públicas**, sem login, sem `ErrorBoundary` de área e com título próprio. |
| R-LGPD-16 | A política diz: quem trata os dados e como contatá-lo; os dados coletados (conta, lista de espera, estudo); a finalidade; com quem se compartilha (Supabase, Cloudflare e Sentry, este só com o identificador interno da conta); a retenção; os direitos do art. 18; e **o mesmo que R-LGPD-01 a R-LGPD-04** sobre exclusão. |
| R-LGPD-17 | Controlador e e-mail de contato moram **num lugar só**, `lib/legal.ts`, e as duas páginas leem de lá. |
| R-LGPD-18 | O cadastro, o login e Meus dados linkam as duas páginas. O cadastro diz "Ao criar a conta você concorda com os Termos de uso e a Política de privacidade". |

---

## Fluxo

```
Meus dados (aluno) ─ cartão "Excluir conta" ─ diálogo ─ digita EXCLUIR
   └─ deleteAccount → delete_my_account()
         ├─ já excluída (deleted_at)? → devolve
         ├─ professor? → 42501
         ├─ apaga o que o aluno fez (R-LGPD-01)
         ├─ perfil → "Conta excluída", sem vínculo e sem acesso (R-LGPD-03)
         └─ auth: identidades, sessões e fatores saem; e-mail e senha são anulados (R-LGPD-02)
   └─ signOut → /entrar?conta=excluida
```

---

## Superfície

| Camada | Item |
|---|---|
| Migration | `20261015150000_delete_my_account.sql`: `profiles.deleted_at`, a RPC, e `deleted_at is null` em duas policies |
| RPC | `delete_my_account` — a décima terceira. Revogada de `public` e `anon`, concedida a `authenticated` |
| Contrato | `deleteAccount(): Promise<Result<void>>` |
| Telas | Meus dados (cartão e diálogo), `/privacidade`, `/termos`, mensagem em `/entrar` |
| Domínio | `lib/legal.ts` |
| Testes | `supabase/tests/22_account_deletion.sql`, `07_schema.sql`, `apps/e2e/tests/legal.spec.ts` |

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Depois de `delete_my_account`, nenhuma tabela apagada guarda linha do aluno; o perfil é "Conta excluída", sem professor, sem acesso e com `deleted_at`; a linha de `auth.users` não tem o e-mail original, nem identidades ou sessões. | `22_account_deletion.sql` |
| CA-02 | `access_grants`, `coupon_redemptions` e as notas de simulado do aluno continuam, e o outro aluno do mesmo professor não perde nada. | `22_account_deletion.sql` |
| CA-03 | A segunda chamada não falha nem altera nada. Professor e anônimo são recusados. Aluno vencido exclui. | `22_account_deletion.sql` |
| CA-04 | Excluída a conta, um JWT ainda válido não consegue renomear o perfil nem criar inscrição. | `22_account_deletion.sql` |
| CA-05 | Toda tabela com FK para `profiles` está na lista apagada ou na retida. | `07_schema.sql` |
| CA-06 | O cartão aparece só para o aluno, com as duas listas; o botão só habilita com `EXCLUIR`; excluir encerra a sessão, e o login seguinte falha. | F-LGPD-01, F-LGPD-02, F-LGPD-05 |
| CA-07 | O cadastro pode ser refeito com o mesmo e-mail e nasce vazio. | F-LGPD-01 |
| CA-08 | `/privacidade` e `/termos` abrem sem login e são linkadas do cadastro, do login e de Meus dados. | F-LGPD-03 |
| CA-09 | Aluno com acesso vencido exclui a conta. | F-LGPD-04 |

---

## Fora de escopo

- **Excluir conta de professor.** Exige decidir o destino dos planejamentos dos alunos; é spec própria.
- **Apagar as cópias de segurança do provedor.** Elas expiram no ciclo de retenção do Supabase; a política diz isso, em vez de prometer o contrário.
- **Texto jurídico.** `/privacidade` e `/termos` descrevem o que o produto faz, a partir do código; a revisão do texto é de quem responde juridicamente pelo produto.
- **Exportar os dados** (portabilidade, LGPD art. 18, V). Não existe tela nem RPC.
- **Registro de consentimento no cadastro.** O aceite é textual; guardar versão e data do aceite é outra decisão.
