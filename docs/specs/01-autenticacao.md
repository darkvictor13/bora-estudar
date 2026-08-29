# 01 — Autenticação

**Situação:** implementada · **Fluxos e2e:** F-AUTH-01 a F-AUTH-12

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
| R-AUTH-01 | Toda rota protegida decide o acesso **antes** de renderizar, no loader. Sem sessão, o destino é `/entrar`. |
| R-AUTH-02 | O papel vem de `profiles.role`, lido do banco a cada navegação. Nunca de metadata do token nem de estado do cliente. |
| R-AUTH-03 | Sem perfil correspondente ao usuário autenticado, a sessão é tratada como inexistente. Assumir um papel padrão seria pior do que recusar. |
| R-AUTH-04 | `admin` satisfaz toda exigência de `teacher`, espelhando `is_teacher()` no banco (`role in ('teacher','admin')`). |
| R-AUTH-05 | Papel errado é devolvido para a home do próprio papel, nunca para a rota que acabou de recusá-lo — é assim que nasce laço de redirecionamento. |
| R-AUTH-06 | O redirecionamento para `/entrar` **concatena `location.hash`**. O fragmento é a única cópia do resultado da bateria no navegador; ver [05](05-bateria-inteligente.md). |
| R-AUTH-07 | Cadastro público cria **somente aluno**. O papel vai em `options.data.role` e é o gatilho `tg_create_profile_for_new_user` que o materializa em `profiles`. |
| R-AUTH-08 | A resposta da recuperação de senha é idêntica exista ou não a conta. Confirmar a existência de um e-mail é vazamento. |
| R-AUTH-09 | Erro do GoTrue nunca chega cru à tela. `translateAuthError` traduz, e "credencial inválida" cobre senha errada **e** e-mail inexistente com a mesma frase. |
| R-AUTH-10 | O contexto da sessão é memoizado **apenas enquanto a consulta está em voo**, e liberado ao terminar. Guardá-lo entre navegações deixaria `hasAccess` velho: o professor libera o acesso e o aluno continuaria barrado até recarregar. |
| R-AUTH-11 | Toda action que muda a identidade — entrar, sair, cadastrar, trocar senha — chama `invalidateSession()`. Sem isso um loader que pediu o contexto antes do login termina recebendo `null` e manda de volta para a tela de login. |
| R-AUTH-12 | Validação de formulário é da action, não do navegador: o `<form>` tem `noValidate` para que a mensagem seja a nossa, em português e no mesmo lugar. |
| R-AUTH-13 | O link do e-mail cai em `/confirmar`, que troca o código por sessão e só então navega para o destino em `?next=`. A troca é rota própria para que convite e confirmação de e-mail possam reusá-la. |
| R-AUTH-14 | **O link do e-mail precisa abrir no mesmo navegador que o pediu.** `exchangeCodeForSession` é fluxo PKCE: o verifier fica num cookie do domínio, gravado quando o pedido foi feito. Abrir o link em outro navegador — ou numa janela anônima — falha, e a tela lê a falha como "Este link expirou ou já foi usado.". |
| R-AUTH-15 | A hospedagem precisa de fallback de SPA: rewrite de `/*` para `/index.html` com status 200. Sem isso `/confirmar?next=/redefinir-senha`, que chega do e-mail como acesso direto, devolve 404 — e a recuperação de senha morre exatamente como morria pelo `site_url` errado. |

---

## Fluxo

```
  /entrar ──signIn──► GoTrue ──ok──► invalidateSession()
                                          │
                                          ▼
                                 getSessionContext()
                                          │
                             homeForRole(role) ──► /aluno ou /professor

  qualquer rota protegida
        │
        ├─ requireSession()        sem sessão  → /entrar + location.hash
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
| Constantes | `ROUTES`, `homeForRole` — `lib/routes.ts` |

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Anônimo em qualquer das 13 rotas protegidas termina em `/entrar` | F-AUTH-01 |
| CA-02 | Credencial errada e e-mail inexistente produzem a **mesma** mensagem: "E-mail ou senha incorretos." | F-AUTH-02 |
| CA-03 | Campos vazios: "Informe e-mail e senha." — validado pela action, não pelo navegador | F-AUTH-03 |
| CA-04 | Aluno entra em `/aluno`; professor e admin em `/professor` | F-AUTH-04 |
| CA-05 | Aluno em qualquer `/professor/*` vai para `/aluno`, e vice-versa, sem laço | F-AUTH-05 |
| CA-06 | Com sessão ativa, `/entrar` e `/cadastro` redirecionam para a home do papel | F-AUTH-06 |
| CA-07 | Logout remove o cookie `sb-*-auth-token` e `/aluno` volta a barrar | F-AUTH-07 |
| CA-08 | Cadastro cria `auth.users` + `profiles` com papel `student`, e termina em `/aluno/lista-espera` | F-AUTH-08 |
| CA-09 | Nome com menos de 3 caracteres, senha com menos de 6 e e-mail repetido têm mensagem própria | F-AUTH-09 |
| CA-10 | Recuperação devolve resposta neutra; o link do e-mail chega em `/redefinir-senha` com sessão de recuperação; a senha antiga deixa de funcionar | F-AUTH-10 |
| CA-11 | `/redefinir-senha` sem sessão: "Este link expirou ou já foi usado." | F-AUTH-11 |
| CA-12 | Senhas diferentes: "As senhas não conferem." | F-AUTH-12 |
| CA-13 | Redirecionamento para `/entrar` a partir de `/aluno#boraQuizResult=…` **preserva o fragmento** | **sem cobertura** — o efeito é testado só de forma indireta em F-BAT-09 |
| CA-14 | Abrir o link de recuperação num navegador diferente do que o pediu mostra "Este link expirou ou já foi usado.", e não uma tela quebrada | **sem cobertura** — exige dois contextos de navegador |
| CA-15 | Acesso direto a `/confirmar?next=/redefinir-senha` numa hospedagem estática devolve 200 com a casca da SPA, não 404 | coberto pelo smoke de HTTP do deploy, não pela suíte |

---

## Fora de escopo

- **Cadastro de professor e de admin.** Criados por dentro do banco. Abrir isso
  ao cadastro público daria a qualquer pessoa a permissão de escrita em
  planejamento.
- **Confirmação de e-mail obrigatória.** `translateAuthError` já trata a
  mensagem, mas o projeto local não exige confirmação.
- **Segundo fator.** Não há.
- **Vincular o aluno recém-cadastrado a um professor.** Não acontece aqui e não
  acontece em lugar nenhum — ver [02](02-acesso-e-assinatura.md), "O que falta".
