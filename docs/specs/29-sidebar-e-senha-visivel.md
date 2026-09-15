# 29 — Sidebar recolhível e senha visível

**Situação:** implementada · **Comparativo:** §12 item 14 · **Inventário:** [`inventario-v96.md`](../inventario-v96.md) §1 · **Fluxos e2e:** F-UI-01 a F-UI-06

---

## Problema

Duas asperezas pequenas, e as duas custam o mesmo: alguém desiste.

**A sidebar não recolhe.** Ela ocupa largura fixa em toda tela, e as telas que
mais precisam de espaço são justamente as de tabela larga — prévia da semana,
grade de revisão, série semanal. Num laptop de 13" a tabela rola na horizontal
com a sidebar mostrando sete links que o aluno já decorou. A v96 recolhia
(`toggleSidebar`, index.js:261), guardava o estado, e começava recolhida em tela
estreita.

**A senha não tem como ser vista.** Quatro campos de senha no produto — entrar,
cadastrar (senha e confirmação), redefinir —, e nenhum deles pode ser
conferido. Errar a senha ao cadastrar é errar duas vezes o mesmo texto invisível
e descobrir só na mensagem de erro. A v96 tinha o botão
(`alternarVisibilidadeSenha`, index.js:2008).

---

## Regras

### A sidebar

| Id | Regra |
|---|---|
| R-UI-01 | Um botão recolhe e expande a sidebar. Recolhida, ela some da tela e o conteúdo ocupa a largura toda; o botão continua acessível. |
| R-UI-02 | O estado vive em **`localStorage`**, e não em `user_preferences`. Diferente do tema, recolher é preferência **do aparelho**: a mesma pessoa quer a sidebar aberta no monitor grande e recolhida no laptop. Guardar na conta imporia uma escolha à outra tela. |
| R-UI-03 | Sem estado guardado, a sidebar começa **recolhida abaixo de 700 px** de largura e aberta acima. É o limiar da v96, e é o único caso em que a largura da janela decide. |
| R-UI-04 | `localStorage` indisponível — janela privada, dados bloqueados — não quebra nada: cai no padrão por largura. Toda leitura vai dentro de `try/catch`. |
| R-UI-05 | O botão diz o que **vai** fazer, e o `aria-expanded` diz o que **é**. Leitor de tela anuncia o estado; o rótulo visível anuncia a ação. |
| R-UI-06 | Recolher é **CSS**, não desmontagem. A sidebar continua no DOM, e os testes que a leem — nome na barra, F-CONTA-02 — continuam valendo. |

### A senha

| Id | Regra |
|---|---|
| R-UI-07 | Todo campo de senha ganha um botão de mostrar e ocultar, **dentro do campo**. São quatro: entrar, cadastrar, confirmar e redefinir. |
| R-UI-08 | O botão é `type="button"`. Um `<button>` sem tipo dentro de `<form>` **submete** — e aqui submeteria o login ao tentar ver a senha. |
| R-UI-09 | Alternar troca `type` entre `password` e `text`, e nada mais. Nenhum valor é copiado para outro elemento: a senha nunca existe em dois lugares. |
| R-UI-10 | Começa **oculto**, sempre. Nada de lembrar "estava visível": o próximo a abrir a tela pode ser outra pessoa. |
| R-UI-11 | O botão tem `aria-label` que diz a ação — "Mostrar senha" / "Ocultar senha" — e `aria-pressed` que diz o estado. |
| R-UI-12 | O campo mantém o `autoComplete` que já tinha. Trocar `type` para `text` não pode fazer o gerenciador de senhas perder o campo. |

---

## Fluxo

```
sidebar
   ├─ monta: lê localStorage → válido? aplica
   │                          → ausente? recolhe abaixo de 700px
   └─ botão: alterna a classe no shell, grava, atualiza aria-expanded

campo de senha
   └─ botão (type=button!) alterna input.type entre password e text
          └─ começa sempre oculto; o valor nunca sai do input
```

---

## Superfície

| Camada | Item |
|---|---|
| Rota | todas — o layout é comum |
| Componentes | `Sidebar.tsx`, `ui.tsx` (`Field` ganha `type="password"` com botão) |
| Domínio | `lib/ui/sidebar-state.ts` — ler, validar e decidir o padrão |
| Actions | **nenhuma** |
| RPCs | **nenhuma** |
| Migration | **nenhuma** |
| Testes | `apps/web/src/lib/ui/sidebar-state.test.ts`, `apps/e2e/tests/shell.spec.ts` e `auth.spec.ts` |

**Nada disto vai ao banco**, e é decisão, não economia: ver `R-UI-02`.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Estado ausente decide pela largura, com 700 px de limiar | `sidebar-state.test.ts` |
| CA-02 | Estado guardado vence a largura; valor inválido cai no padrão | `sidebar-state.test.ts` |
| CA-03 | `localStorage` que lança não quebra a leitura | `sidebar-state.test.ts` |
| CA-04 | O botão recolhe e expande, e o conteúdo ganha a largura | F-UI-01 |
| CA-05 | O estado sobrevive à navegação e ao recarregamento | F-UI-02 |
| CA-06 | `aria-expanded` acompanha o estado | F-UI-03 |
| CA-07 | O botão de senha revela e volta a ocultar | F-UI-04 |
| CA-08 | Clicar no botão de senha **não** submete o formulário | F-UI-05 |
| CA-09 | A senha começa sempre oculta, mesmo depois de revelada antes | F-UI-06 |

---

## Fora de escopo

- **Sidebar em gaveta no celular.** O produto não tem layout móvel próprio, e
  inventar um aqui é redesenho, não ajuste.
- **Recolher só os grupos.** A v96 recolhe a barra inteira.
- **Medidor de força da senha.** É outra decisão de produto, e o Supabase já
  impõe o mínimo.
- **Lembrar a senha visível entre sessões.** Ver `R-UI-10`.
- **Atalho de teclado para recolher.** Sem convenção estabelecida no produto.
