# 01 — Autenticação

**Situação:** implementada · **Fluxos e2e:** F-AUTH-01 a F-AUTH-14

---

## Problema

O produto tem três papéis com poderes muito diferentes — aluno, professor,
admin — e a separação entre eles é a primeira linha de defesa dos dados de
estudo. Na versão anterior o papel era decidido no navegador, depois do
carregamento: `carregarPerfilSupabase()` lia o perfil e só então redirecionava.
Quem soubesse abrir `professor.html` via a estrutura da tela do professor antes
de ser mandado embora, e a decisão dependia de um JavaScript que podia
simplesmente não rodar.

Além disso, dois pontos custavam sessão de estudo:

- a resposta da recuperação de senha confirmava se o e-mail existia;
- um redirecionamento para o login **descartava o fragmento da URL**, e é no
  fragmento que volta o resultado de uma bateria já respondida.

---

## Regras

| Id | Regra |
|---|---|
| R-AUTH-01 | Toda rota protegida decide o acesso **antes** de renderizar, no loader. Sem sessão, o destino é `/entrar?next=…` (R-AUTH-06). |
| R-AUTH-02 | O papel vem de `profiles.role`, lido do banco a cada navegação. Nunca de metadata do token nem de estado do cliente. |
| R-AUTH-03 | Sem perfil correspondente ao usuário autenticado, a sessão é tratada como inexistente. Assumir um papel padrão seria pior do que recusar. |
| R-AUTH-04 | `admin` satisfaz toda exigência de `teacher`, espelhando `is_teacher()` no banco (`role in ('teacher','admin')`). |
| R-AUTH-05 | Papel errado é devolvido para a home do próprio papel, nunca para a rota que acabou de recusá-lo — é assim que nasce laço de redirecionamento. |
| R-AUTH-06 | O redirecionamento para `/entrar` leva o destino em `?next=`, com o **fragmento dentro dele** — `/entrar?next=%2Faluno%23x`. O fragmento só entra na PRIMEIRA carga: `request.url` nunca traz `#`, e numa navegação do cliente `location` ainda é a tela anterior, cujo fragmento não é deste destino. Antes ele ia colado em `/entrar#…` e morria no login (QA-25). O destino é `pathname + search` do pedido; `next` vai sempre, inclusive para `/aluno` — omitir "quando for a casa" exigiria saber o papel de quem não tem sessão. |
| R-AUTH-07 | Cadastro público cria **somente aluno**. O gatilho `app_private.create_profile_for_new_user` cria sempre aluno e **ignora `role`** do metadado, desde a migration `20260914190000`: `raw_user_meta_data` é escrito pelo cliente, e quem mandasse `{"role":"teacher"}` nasceria professor. Só o nome vai no metadado, e o gatilho o grava APARADO e cortado em 120 caracteres, ou nulo quando tem menos de 3: a CHECK `profiles_name_check` recusaria o nome longo, e o cadastro inteiro cairia em "Database error saving new user" por causa de um nome (QA-15). |
| R-AUTH-08 | A resposta da recuperação de senha é idêntica exista ou não a conta. Confirmar a existência de um e-mail é vazamento. |
| R-AUTH-09 | Erro do GoTrue nunca chega cru à tela. `translateAuthError` traduz, e "credencial inválida" cobre senha errada **e** e-mail inexistente com a mesma frase. |
| R-AUTH-10 | O contexto da sessão é memoizado **apenas enquanto a consulta está em voo**, e liberado ao terminar. Guardá-lo entre navegações deixaria `hasAccess` velho: o professor libera o acesso e o aluno continuaria barrado até recarregar. |
| R-AUTH-11 | Toda action que muda a identidade — entrar, sair, cadastrar, trocar senha — chama `invalidateSession()`. Sem isso um loader que pediu o contexto antes do login termina recebendo `null` e manda de volta para a tela de login. |
| R-AUTH-12 | Validação de formulário é da action, não do navegador: o `<form>` tem `noValidate` para que a mensagem seja a nossa, em português e no mesmo lugar. |
| R-AUTH-13 | O link do e-mail cai em `/confirmar`, que troca o código por sessão e só então navega para o destino em `?next=`. A troca é rota própria para que convite e confirmação de e-mail possam reusá-la. |
| R-AUTH-14 | **O link do e-mail precisa abrir no mesmo navegador que o pediu.** `exchangeCodeForSession` é fluxo PKCE: o verifier fica num cookie do domínio, gravado quando o pedido foi feito. Abrir o link em outro navegador — ou numa janela anônima — falha, e a tela lê a falha como "Este link expirou ou já foi usado.". |
| R-AUTH-15 | A hospedagem precisa de fallback de SPA: rewrite de `/*` para `/index.html` com status 200. Sem isso `/confirmar?next=/redefinir-senha`, que chega do e-mail como acesso direto, devolve 404 — e a recuperação de senha morre exatamente como morria pelo `site_url` errado. |
| R-AUTH-16 | `?next=` só aceita caminho interno de tela que exige sessão. Ele passa por `safeInternalPath` (`lib/routes.ts`), que resolve contra uma origem fictícia e recusa outra origem, caminho que depois de normalizado começa com duas barras, e as telas públicas. Recusado, vale o destino padrão de quem chama. Conferir só `startsWith("/")` e `!startsWith("//")` deixava passar `/\host` e `/<TAB>/host`, que o navegador lê como outro site: QA-02. |
| R-AUTH-17 | **O login devolve ao `next`.** `signIn` lê o campo `next` do formulário e `landAfterAuth` o passa por `safeInternalPath` com a casa do papel real como fallback: `next` de outro papel termina na casa do papel real, sem laço (o guarda do outro papel o devolveria de qualquer jeito), e `next` externo ou malformado também. Com sessão já aberta, `/entrar?next=…` redireciona pelo mesmo filtro. O filtro fica na origem, em `landAfterAuth`, e não em `useFormActionState`: `updatePassword` devolve `/entrar` legitimamente quando não há sessão, e o validador recusa rotas públicas (QA-25, D-15). |
| R-AUTH-18 | **O cadastro diz "Já existe uma conta com este e-mail." DE PROPÓSITO** (QA-29, D-14). Com a confirmação de e-mail desligada (`enable_confirmations = false`), o GoTrue responde 422 `user_already_exists` a QUALQUER chamador: esconder a frase na tela não tira a informação de quem chama a API direto, e só ligar a confirmação corrige. Mitigação: `sign_in_sign_ups = 30` por 5 min por IP (`config.toml`). Revisitar quando staging entregar e-mail ([`../plano-email-staging.md`](../plano-email-staging.md)). Em troca, a tela oferece "Entrar" e "Esqueci minha senha" ali mesmo — quem errou o e-mail ou esqueceu que tinha conta não fica num beco. A decisão da tela é pelo CÓDIGO (`conflict` no campo `email`), nunca pela frase. |
| R-AUTH-19 | **Senha formada só por espaços é recusada no cadastro e na redefinição:** "A senha não pode ser formada só por espaços." (`field: "password"`, QA-18). O LOGIN não recusa — `checkCredentials` não muda —, para a conta criada antes desta regra continuar entrando. A senha que segue para o GoTrue não é aparada, e a política do GoTrue não muda (D-10): quem chama a API direto ainda cria uma conta assim, e o contrato é a única barreira. |

---

## Fluxo

```
  /entrar?next=… ──signIn──► GoTrue ──ok──► invalidateSession()
                                          │
                                          ▼
                                 getSessionContext()
                                          │
                             next (safeInternalPath) ou homeForRole(role)

  qualquer rota protegida
        │
        ├─ requireSession(request) sem sessão  → /entrar?next=<destino + #fragmento na 1ª carga>
        ├─ requireRole(papel)      papel errado → home do papel real
        └─ requireStudentAccess()  sem acesso   → /aluno/lista-espera   [02]
```

Recuperação de senha:

```
/recuperar-senha → resetPasswordForEmail(redirectTo: /confirmar?next=/redefinir-senha)
                 → resposta neutra na tela
e-mail → /confirmar → troca o código por sessão → /redefinir-senha → updatePassword
```

---

## Superfície

| Camada | Item |
|---|---|
| Rotas | `/entrar`, `/cadastro`, `/recuperar-senha`, `/redefinir-senha`, `/confirmar`, `/` |
| Actions | `signIn`, `signUp`, `requestPasswordReset`, `updatePassword`, `signOut` — `lib/auth/actions.ts` |
| Guardas | `requireSession`, `requireRole`, `requireStudentAccess`, `getSessionContext`, `invalidateSession` — `lib/auth/session.ts` |
| Rotas (arquivos) | `routes/public/{SignIn,SignUp,ForgotPassword,ResetPassword}.tsx`, `routes/{Home,AuthCallback}.tsx` |
| Componente | `components/auth/AuthForm.tsx` |
| Banco | `profiles`, gatilho `tg_create_profile_for_new_user`, enum `user_role` |
| Constantes | `ROUTES`, `homeForRole`, `safeInternalPath` — `lib/routes.ts` |

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Anônimo em qualquer das 13 rotas protegidas termina em `/entrar?next=<a rota>` | F-AUTH-01 |
| CA-02 | Credencial errada e e-mail inexistente produzem a **mesma** mensagem: "E-mail ou senha incorretos." | F-AUTH-02 |
| CA-03 | Campos vazios: "Informe e-mail e senha." — validado pela action, não pelo navegador | F-AUTH-03 |
| CA-04 | Aluno entra em `/aluno`; professor e admin em `/professor` | F-AUTH-04 |
| CA-05 | Aluno em qualquer `/professor/*` vai para `/aluno`, e vice-versa, sem laço | F-AUTH-05 |
| CA-06 | Com sessão ativa, `/entrar` e `/cadastro` redirecionam para a home do papel | F-AUTH-06 |
| CA-07 | Logout remove o cookie `sb-*-auth-token` e `/aluno` volta a barrar | F-AUTH-07 |
| CA-08 | Cadastro cria `auth.users` + `profiles` com papel `student`, e termina em `/aluno/lista-espera` | F-AUTH-08 |
| CA-09 | Nome com menos de 3 caracteres, senha com menos de 6, senha só de espaços e e-mail repetido têm mensagem própria; a do e-mail repetido traz os links "Entrar" e "Esqueci minha senha" | F-AUTH-09 |
| CA-10 | Recuperação devolve resposta neutra; o link do e-mail chega em `/redefinir-senha` com sessão de recuperação; a senha antiga deixa de funcionar | F-AUTH-10 |
| CA-11 | `/redefinir-senha` sem sessão: "Este link expirou ou já foi usado." | F-AUTH-11 |
| CA-12 | Senhas diferentes: "As senhas não conferem."; senha só de espaços na redefinição: "A senha não pode ser formada só por espaços." | F-AUTH-12 |
| CA-13 | Redirecionamento para `/entrar` a partir de `/aluno#x` leva o fragmento junto com o destino, dentro do `next`, e só na primeira carga | **sem cobertura de fragmento** — F-AUTH-13 cobre o `next`, não o `#` |
| CA-14 | Abrir o link de recuperação num navegador diferente do que o pediu mostra "Este link expirou ou já foi usado.", e não uma tela quebrada | **sem cobertura** — exige dois contextos de navegador |
| CA-15 | Acesso direto a `/confirmar?next=/redefinir-senha` numa hospedagem estática devolve 200 com a casca da SPA, não 404 | coberto pelo smoke de HTTP do deploy, não pela suíte |
| CA-16 | `/confirmar?next=` com `/\host`, `/<TAB>/host`, `/\\host` ou `/.//host` termina em `/redefinir-senha`, e nenhuma requisição sai para o host | F-AUTH-14 |
| CA-17 | Anônimo em `/professor/alunos/<id>` vai a `/entrar?next=…`, e o login termina na ficha; `next` de outro papel termina na casa do papel real, sem laço; `next` externo termina na casa; numa navegação do cliente o `next` é o destino, não a tela de onde a pessoa saiu | F-AUTH-13 |

---

## Fora de escopo

- **Cadastro de professor e de admin.** Criados por dentro do banco. Abrir isso
  ao cadastro público daria a qualquer pessoa a permissão de escrita em
  planejamento.
- **Confirmação de e-mail obrigatória.** `translateAuthError` já trata a
  mensagem, mas o projeto local não exige confirmação. É o que sustenta a
  R-AUTH-18; o plano está em [`../plano-email-staging.md`](../plano-email-staging.md).
- **Segundo fator.** Não há.
- **Vincular o aluno recém-cadastrado a um professor.** Não acontece aqui e não
  acontece em lugar nenhum — ver [02](02-acesso-e-assinatura.md), "O que falta".
