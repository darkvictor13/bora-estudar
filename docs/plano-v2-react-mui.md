# Plano — reconstruir a v2 em React + Material UI

A pasta `~/Documentos/Repos/pessoal/bora estudar site v2` (v108.5, HTML/CSS/JS
puro) passa a ser **a especificação do produto final**. Este plano descreve como
reconstruí-la dentro de `apps/web` como React + MUI, usando o tema já pronto em
`~/Documentos/Repos/pessoal/design-system`.

O front atual de `apps/web` **não é o ponto de partida**: telas e componentes
são reescritos a partir da v2. O que sobrevive é a infraestrutura — router em
modo data, `lib/auth`, `lib/domain`, o build e a suíte e2e.

---

## Fronteira com a frente do banco

O banco está sendo reescrito em outra frente e chegará **compatível com a v2**.
Este plano não escreve migration nem RPC. A consequência de projeto é uma só, e
é a decisão estrutural mais importante daqui:

> **A UI não fala com o Supabase. Ela fala com um contrato.**

`apps/web/src/lib/api/` expõe funções tipadas por caso de uso
(`loadWeeklyGoals`, `saveTheoryProgress`, `generateWeek`, …). A UI importa só
daí. Duas implementações vivem atrás do contrato:

| Implementação | Quando | Para quê |
|---|---|---|
| `fixtures` | agora | construir e testar toda a UI antes de o banco existir |
| `supabase` | quando a frente do banco entregar | trocada por variável de ambiente, sem tocar em componente |

Sem essa camada, cada tela nasce acoplada a um schema que ainda vai mudar, e a
integração vira um segundo reescrever. Com ela, a integração é preencher
funções cujo formato de entrada e saída já está travado por tipo e por teste.

**Entregável que a frente do banco consome:** `lib/api/contract.ts` — a lista de
operações que a UI precisa, com tipos. É o pedido formal ao banco, e deve
existir no fim da Fase 1.

---

## O que existe hoje dos dois lados

**v2 (origem):** 3 páginas HTML (`index`, `aluno`, `professor`), 2.121 linhas de
HTML, 2.757 de CSS em 44 arquivos e 15.353 de JS em 7 arquivos — 863 funções de
topo, DOM montado por `innerHTML` e handlers `onclick` globais.

`index.html` é **só autenticação**: `index.js:2254` redireciona todo usuário
logado para `aluno.html` ou `professor.html`. Os painéis que existem dentro dele
são resíduo de uma versão anterior e **não devem ser portados**.

**Repo (destino):** React 19.2, react-router 8 em modo data, Vite 8, React
Compiler via oxc, CSS próprio em `globals.css` (429 linhas), sem MUI. 142 testes
e2e em Playwright.

**Design system:** tema MUI com `cssVariables` + `colorSchemes`, claro e escuro,
tokens `surface`/`accent`/`fill`/`elevation`, overrides de ~37 componentes,
contraste WCAG medido. Hoje é um projeto solto em React 18 / MUI 6.

---

## Decisões já tomadas

1. **A v2 é o resultado final.** Divergência entre v2 e tela atual resolve-se a
   favor da v2.
2. **Paleta âmbar/petróleo do design system**, não o azul `#1A56DB` da v2. Do
   design system vem a cor, que já resolve modo escuro e contraste — coisas que
   a v2 não tinha. Da v2 vêm o layout, os fluxos, a densidade e a tipografia.
3. **`data-testid` nos seletores de teste.** As classes CSS da v2 e as do repo
   atual desaparecem junto com o CSS; a suíte não pode depender do que o MUI
   gera.
4. **Tipografia da v2: DM Sans no texto, DM Mono no número**, na densidade da
   v2. A cor vem do design system; a fonte e a escala vêm da v2. O detalhe está
   em [Tipografia](#tipografia), e é trabalho da Fase 1.

---

## Arquitetura alvo

```
packages/
  ui/                     ← design-system vira workspace (@bora/ui)
    src/{tokens,palette,typography,components,theme}.ts
    src/primitives/       ← Card, PageHeader, Metric, Empty, Badge…
apps/web/src/
  lib/api/                ← contrato + fixtures + supabase
  lib/domain/             ← regras puras portadas da v2, com teste
  components/             ← reescritos a partir da v2, em MUI
  routes/                 ← uma tela por arquivo, como hoje
```

`packages/ui` é pacote próprio e não pasta dentro de `web` por dois motivos: o
tema tem `npm run typecheck` e página de preview que valem por si, e o
playground permite revisar componente sem subir o app inteiro.

### Três armadilhas conhecidas antes de começar

**O tema está em MUI 6 / React 18; o repo está em React 19.2.** Subir para MUI 7
é parte da Fase 1, não um detalhe: `cssVariables`, `colorSchemes` e
`theme.vars` mudaram de superfície entre as versões. Verificar também o React
Compiler (`react({ compiler: true })`, transform oxc) contra o Emotion — a
combinação não está exercitada neste repo.

**Fonte nunca sai por rede.** A v2 puxa DM Sans e DM Mono de
`fonts.googleapis.com`, e a suíte e2e proíbe requisição externa. As duas são
auto-hospedadas por `@fontsource`, importadas no `main.tsx` como o Geist é hoje.
O resto da decisão está em [Tipografia](#tipografia).

**O tema precisa vir da conta, não do `localStorage`.** `useColorScheme` do MUI
persiste em `mui-mode` no aparelho; este produto guarda a preferência no banco
(`theme_preference`) e pinta antes do primeiro paint por script embutido em
`index.html` (`lib/theme.ts` explica o porquê das duas chaves). O ponte é: o
script embutido continua mandando na classe do `<html>`, `colorSchemeSelector:
'class'` já é o que o tema usa, e a action que grava no banco atualiza as duas
cópias. Escrever isso **na Fase 1**, antes de qualquer tela: é a parte do tema
que parece funcionar e pisca só em produção.

### Tipografia

**DM Sans no texto, DM Mono no número.** É o par da v2, e a troca custa dois
tokens em `packages/ui/src/tokens.ts` (`fontFamily.sans` e `fontFamily.mono`) —
o README do design system já trata a fonte como opcional. Nada vem do Google:

| Papel | Pacote | Peso latin (woff2) |
|---|---|---|
| texto | `@fontsource-variable/dm-sans` — eixo wght 100-1000 | 37 KB |
| número | `@fontsource/dm-mono` — importar `400.css` e `500.css` | 15 KB cada |

DM Sans publica só `latin` e `latin-ext`, com `unicode-range`: em pt-BR o
navegador baixa apenas o latin, e toda a acentuação portuguesa cabe nele.

**O mono não é enfeite, é a face dos números.** A v2 o usa em 56 lugares, em 20
arquivos de CSS — `.badge`, `.pct-pill`, `.time-pill`, `.stats-rank-val`,
`.study-time-value`, `.day-group-count`, `.disc-performance-questions`. É o que
faz coluna de porcentagem e de tempo alinhar. O design system declara
`fontFamily.mono` e nenhum override aponta para ele; na Fase 1 os componentes de
número passam a apontar. Sem isso as tabelas e os KPIs perdem o alinhamento que
a v2 tem, e é o tipo de perda que ninguém consegue nomear olhando a tela.

**DM Mono não tem negrito.** Publica 300, 400 e 500, e nada além. A v2 pede 700
em `.logo-text` e em `.cad-summary-value{font:700 24px 'DM Mono'}` — o navegador
estava sintetizando um falso-negrito, que engorda o traço de forma irregular e
estraga justamente o que precisa ser lido com precisão: algarismo. Ao portar,
esses dois viram 500, e a ênfase passa a vir do tamanho e da cor.

**A escala desce junto com a fonte.** `html,body{font-size:14px}` é metade do
motivo de a v2 parecer densa; a outra metade são os paddings. O
`typography.ts` do design system está calibrado em 16px — `body1: 1rem`,
`h1: 3rem` — enquanto o `.page-title` da v2 é 20px e o `.nav-item`, 13px.
Reescrever a escala inteira é trabalho da Fase 1: fazer depois significa
reajustar cada tela já pronta.

**Uma sans só, desde o primeiro commit.** O risco real da migração é rodar Inter
nos componentes MUI e DM Sans no que foi portado da v2 — as duas convivem sem
erro nenhum e ficam visivelmente erradas. Por isso a troca em `tokens.ts` é a
primeira coisa da Fase 1, antes de qualquer componente.

---

## Fases

Cada fase termina com `npm run check` verde e é mergeável sozinha.

### Fase 1 — Fundação (sem tela nova)

- Mover `design-system` para `packages/ui` como `@bora/ui`; subir para MUI 7 e
  React 19; `npm run typecheck` do pacote passando.
- Instalar `@mui/material`, `@mui/icons-material`, `@emotion/react`,
  `@emotion/styled` em `apps/web`; `ThemeProvider` + `CssBaseline` no
  `RootLayout`.
- Tipografia: `fontFamily.sans` e `.mono` apontando para DM Sans e DM Mono,
  escala reescrita na densidade da v2, imports de `@fontsource` no `main.tsx` e
  `@fontsource-variable/geist` removido. Ver [Tipografia](#tipografia).
- Ponte de tema conta ↔ `mui-mode` ↔ script anti-flash.
- `lib/api/contract.ts` com os tipos de todas as operações que as fases 2-6
  usam, mais o `fixtures` inicial. **É a entrega que destrava a frente do
  banco.**
- Convenção de `data-testid` escrita em `CLAUDE.md`, e helper em
  `apps/e2e/support/ui.ts`.

*Pronto quando:* o app atual sobe com o tema aplicado, claro e escuro, sem
flash; nenhuma requisição sai para `fonts.googleapis.com`; e os testes de
contraste de `theme.spec.ts` passam contra os tokens novos.

### Fase 2 — Casca: layout, navegação e autenticação — **entregue**

Origem: `index.html` inteiro (só a parte de auth), `aluno.html`/`professor.html`
linhas 1-170, `foundation.css` das três áreas.

- ✅ `AppShell`: sidebar 220px colapsável para 64px, rótulos de grupo, item
  ativo, rodapé com chip de usuário — `Drawer` + `List` do MUI, estado
  persistido em `lib/ui/sidebar-state.ts`.
- ✅ `PageHeader`, `Card`, `Metric`, `Empty`, `Badge`, `DayChip`, `Alert` e
  `Field` em `packages/ui/src/primitives`.
- ✅ Telas de auth com o layout de duas colunas da v2 (`auth-story` +
  `auth-card`): entrar, cadastro, recuperar, redefinir.
- ✅ Responsivo: os três cortes de `mobile-tablet.css` (1024, 820, 560) viram
  breakpoints do tema, e abaixo de 820px a barra recolhe à força.
- ✅ Adaptador `supabase` do contrato, na fatia de sessão, conta e tema. As
  operações das fases 3 a 6 lançam com o número da fase em vez de delegar em
  silêncio para as fixtures.

**A tela de BOAS-VINDAS não foi portada, e a ausência é decisão.** Na v2 ela
oferecia dois caminhos, "Continuar com Google" e "Entrar com e-mail e senha".
O login com Google está bloqueado neste produto — não há provedor configurado,
e `docs/inventario-v96.md` registra o porquê —, então aquela tela seria um passo
a mais cujo único botão leva ao formulário. O texto dela ("Bem-vindo de volta")
ficou; o passo extra, não.

*Pronto quando:* login, cadastro e recuperação funcionam ponta a ponta e a
suíte `auth.spec.ts`, já convertida para `data-testid`, passa.
→ `auth.spec.ts` 50 ✓ / 1 `fixme`, `shell.spec.ts` 9 ✓, `theme.spec.ts` 10 ✓ /
2 `fixme`.

#### O que a Fase 2 não conseguiu entregar, e por quê

Os três dependem da frente do banco, e os três estão marcados no código para
não sumirem de vista:

1. ~~**Cadastro público não cria perfil.**~~ **RESOLVIDO** pela migration
   `20260914190000`, depois de o defeito aparecer em staging: quem se cadastrava
   confirmava o e-mail e lia "Entramos, mas seu perfil não foi encontrado." no
   login. `app_private.create_profile_for_new_user` repõe o gatilho,
   `F-AUTH-08` saiu do `fixme` e as fixtures do e2e deixaram de inserir perfil
   à mão. A decisão de produto que faltava foi tomada: **o perfil nasce sem
   professor** — a regra de origem, que anexava ao professor mais antigo da
   base, não foi copiada.
2. **O tema não tem onde morar na conta.** `user_preferences` saiu e nada a
   substituiu; a escolha vale por aparelho. `F-TEMA-02` e `F-TEMA-04` estão
   `fixme`. O pedido é uma coluna `theme_preference` em `profiles`.
3. **Liberar acesso e resgatar cupom precisam nascer como RPC.** O grant por
   coluna em `profiles` — que é a defesa certa — deixa `access_status` fora do
   alcance de `authenticated`. É trabalho das fases 5 e 6, e o de-para já o
   lista.

Fora isso, `npm run check` continua vermelho nas telas das fases 3 a 6 e em
`lib/data/*`: 488 erros de tipo, todos por o schema ter mudado debaixo delas.
É a decisão registrada no início da reimplementação — consertar na fase em que
cada tela é reescrita, em vez de traduzir código que vai ser apagado. Nenhum
arquivo que a Fase 2 toca está nessa lista.

### Fase 3 — Aluno, núcleo de estudo — **entregue**

Origem: `aluno.html` painéis `p-dashboard`, `p-planejamento`, `p-metas`;
`aluno.js`.

| Tela | Rota | Origem na v2 |
|---|---|---|
| Metas da semana | `/aluno` | `p-dashboard`, `renderWeekHero`, abas Metas/Reforço |
| Planejamento | `/aluno/planejamento` | `p-planejamento` |
| Disciplinas e blocos | `/aluno/disciplinas` | `p-disciplinas` (só leitura) |

- Hero da semana completo: desempenho, tempo, questões e sequência de dias.
- Agrupamento por dia, seletor de semana, estados de meta (pendente, em
  andamento, pulada, concluída).
- Modais `registro-modal` (tempo, questões, acertos, observação) e
  `extra-modal` (Lei seca, Anki, Simulado, Revisão, Questões extras) como
  `Dialog`.
- Regras puras — distribuição por dia, cálculo de sequência, agregação do hero
  — vão para `lib/domain` **com teste**, não para dentro do componente.

*Pronto quando:* o aluno abre a semana, conclui meta de qualquer tipo, registra
estudo extra e desfaz registro.

### Fase 4 — Aluno, fluxo inteligente da teoria — **entregue**

É o maior bloco novo e o que a v2 tem de mais recente (v108 → v108.5). Origem:
`assets/js/pages/aluno-theory.js` (374), `assets/js/shared/theory-engine.js`
(216), `p-aulas`, e os LEIA-ME v108.2 e v108.5.

- Modal de meta de teoria com abas **Teoria / Questões iniciais / Revisões**.
- Progresso real por página de PDF, com "Salvar progresso e continuar" e
  "Salvar e encerrar sessão" — encerrar sessão **não** conclui a aula.
- Liberação da próxima aula só após o mínimo de questões iniciais.
- Fila de revisões vencidas, que não bloqueia o avanço.
- Diagnóstico explícito quando a disciplina não está no catálogo auditado
  (Matemática Financeira e TI não estão — a v2 recusa inventar página, e a
  reconstrução mantém isso).
- Tela `/aluno/teoria` com o controle por disciplina.

*Atenção:* `theory-engine.js` concentra a regra e é o melhor candidato a virar
`lib/domain/theory.ts` quase inteiro, com testes cobrindo os oito passos do
teste piloto do LEIA-ME v108.2.

### Fase 5 — Aluno, revisão, reforço e análise — **entregue**

Origem: `p-controleRevisoes`, `p-revisao`, `p-estatisticas`, `p-meusDados`,
`p-listaEspera`, `p-bloqueio`.

- **Revisão espaçada** (calendário de releitura) e **reforço** (reação a
  desempenho baixo) como telas separadas — a v2 já os separava.
- Grade de revisões por matéria, espaçamento configurável, 1ª e 2ª revisão,
  ações rápidas ("Selecionar 6 básicas", "Selecionar matérias do ciclo atual").
- Estatísticas: KPIs, desempenho semanal, questões por semana, radar por
  disciplina, rosca de resultado, tempo de estudo por dia/mês, filtros por plano
  e por ano. Antes da primeira linha de gráfico, ler a skill `dataviz`.
- ~~`share-post-modal`: post de tempo de estudo em canvas + `navigator.share`.~~
  **Não foi portado, e a ausência é decisão.** O inventário já o listava em
  "Fora de escopo desta reconstrução" — conforto que depende de
  `navigator.share`, indisponível em parte dos navegadores de desktop, para
  produzir uma imagem que ninguém consegue reabrir depois. Entrou nesta lista
  por engano quando a fase foi escrita.
- Meus dados, lista de espera, cupom de acesso e a tela de bloqueio sem acesso.

### Fase 6 — Professor — **entregue**

Origem: `professor.html` e `professor.js` (6.044 linhas).

| Tela | Rota | Origem |
|---|---|---|
| Meus alunos | `/professor` | `p-meusAlunos`, cards com KPI, barra de progresso, classificação Em ritmo/Atenção/Atrasado, busca e filtros |
| Ficha do aluno | `/professor/alunos/:id` | `aluno-modal` → vira rota, com histórico de baterias, anulação, dificuldades por tópico, liberar e bloquear acesso |
| Planejamentos | `/professor/planejamentos` | criar, substituir, ativar, editar, arquivar |
| Catálogo de teoria | `/professor/teoria` | `p-disciplinas` do professor: importar MASTER, ordem e páginas, associação com caderno TEC, questões iniciais por matéria, 0 a 5 revisões configuráveis, vínculo com o planejamento |
| Cadernos TEC | `/professor/cadernos` | `p-aulas` + `p-cadernos`: ativar, desativar, editar, incluir, excluir, restaurar |
| Gerar metas | `/professor/metas` | `p-montarMetas`: prévia antes de salvar, peso por matéria, copiar semana anterior, substituição segura |
| Revisões | `/professor/revisoes` | controle manual e reforços sugeridos |
| Estatísticas | `/professor/estatisticas` | `renderEstatisticas` |

A **substituição segura** do LEIA-ME v108.3 é regra de produto, não detalhe de
implementação: o modo normal só substitui meta pendente, em andamento ou pulada;
"Replanejar semana inteira" é caminho separado e exige confirmação. Vale para a
UI mesmo que o banco também garanta.

### Fase 7 — Remoção do CSS antigo e fechamento — **entregue**

- Apagar `globals.css` e o que sobrou de `components/ui.tsx`.
- Converter os últimos seletores da suíte e2e; `grep -c 'locator("\.'` em
  `apps/e2e` deve dar zero.
- Rodar `scripts/fumaca.sh` contra staging.

---

## Suíte e2e

Os 142 testes são a rede de segurança desta migração e ao mesmo tempo o que mais
sofre com ela: cerca de 150 usos casam por classe CSS (`.alert--success` 52×,
`.content` 36×, `.badge` 31×, `.card__sub` 11×).

A conversão acontece **na fase em que a tela é reescrita**, nunca antes nem
depois — converter cedo deixa a suíte testando o que vai sumir; converter tarde
deixa a fase sem rede.

Convenção sugerida, para não virar `data-testid` inventado por tela:

```
data-testid="alert"          + data-status="success|error|info|warning"
data-testid="content"
data-testid="badge"
data-testid="goal-row"       + data-goal-id
```

`theme.spec.ts` e `support/contrast.ts` mudam na Fase 1: os valores esperados
passam a ser os tokens de `packages/ui`, e o README do design system já traz a
tabela de contraste medida para servir de referência.

---

## O que **não** entra

- Os painéis de `index.html` — código morto, ninguém os alcança.
- A extensão de navegador. Saiu do repo no commit `8569f1a` e a v2 aqui não a
  inclui. As telas que a pressupõem (iniciar bateria) permanecem como estão.
- `data/BORA_TOPICOS_CATALOGO_v1.json` (1,9 MB) e o MASTER v16 (152 KB) **não
  vão para o bundle**. São carga de banco, importados pela tela de catálogo do
  professor ou por script de seed.
- Qualquer escrita direta do navegador que a v2 fazia em execução (`PATCH` e
  `DELETE` em metas, contadores por bloco no `localStorage`). O contrato de
  `lib/api` é o lugar de negociar isso com a frente do banco.

---

## Ordem de execução e pontos de verificação

| Fase | Depende de | Verificação |
|---|---|---|
| 1 Fundação | — | tema aplicado, sem flash, contraste medido |
| 2 Casca | 1 | `auth.spec.ts` verde com testid |
| 3 Aluno núcleo | 2 | conclui meta de teoria, bateria e estudo extra |
| 4 Teoria | 3 | os 8 passos do piloto do LEIA-ME v108.2 |
| 5 Revisão e análise | 3 | grade de revisões e estatísticas completas |
| 6 Professor | 2 | professor cria planejamento e gera semana do zero |
| 7 Limpeza | 3-6 | zero seletor de classe na suíte; fumaça em staging |

Fases 4, 5 e 6 são independentes entre si e podem ir em paralelo depois da 3.

A integração com o banco real entra como uma troca de implementação de
`lib/api`, em qualquer ponto depois que a outra frente entregar — e é aí que
aparece o primeiro risco que este plano não consegue eliminar: se o contrato da
Fase 1 divergir do que o banco entregar, o custo é reescrever adaptadores, não
telas. É o motivo de o contrato ser a primeira entrega e não a última.

---

## Onde a reconstrução parou

Todas as sete fases estão entregues. O estado, medido e não afirmado:

| | |
|---|---|
| `npm run check` | verde — typecheck, lint e 74 testes de unidade (exige Node 24) |
| `npm run e2e` | **171 verdes**, 8 `fixme` documentados, zero falhas |
| `npm run db:test` | verde — **86 asserções** em 8 suítes, reescritas em 14/09 contra o schema novo |
| Seletor de classe CSS na suíte | zero (`grep -c 'locator("\.'` em `apps/e2e`) |
| `globals.css` | apagado; não existe mais CSS próprio |
| `lib/data/` | apagado; toda tela fala com `lib/api` |
| Contraste AA nos dois temas | medido em cada tela por `F-TEMA-07` |

### O que o banco ainda não permite

São **seis** — a sexta é `setSelectedSubjects`, no fim da lista — e todas
**lançam com o motivo** em vez de recusar educadamente —
uma tela que finge ter tentado é pior do que uma que explica. Nenhuma é decisão
da interface: em todas, a defesa do banco é a certa, e afrouxá-la para a tela
funcionar abriria o buraco que ela fecha.

1. **Liberar e bloquear acesso.** `profiles` concede `UPDATE (name)` e mais
   nada — `access_status`, `access_expires_at` e `teacher_id` ficam fora do
   grant para que ninguém se promova nem estenda o próprio acesso. Precisa
   nascer como RPC. (`F-VINC-*`)
2. **Anular bateria.** `quiz_sessions` é SELECT; `void_quiz_session` não foi
   portada. (`F-ANUL-*`)
3. **Resgatar cupom.** `coupons` está com RLS ligada, zero policy e zero grant,
   de propósito: validar o código no cliente entregaria a lista de códigos.
   (`F-CUP-*`)
4. **Cadastro público não cria perfil.** O gatilho em `auth.users` não foi
   portado, e embute uma decisão de produto que falta: a qual professor um aluno
   sem metadado é anexado. (`F-AUTH-08`)
5. **Tema na conta.** `user_preferences` saiu; a escolha vale por aparelho até
   existir uma coluna `theme_preference` em `profiles`. (`F-TEMA-02`, `F-TEMA-04`)
6. **Selecionar as matérias do ciclo.** A v2 guardava a seleção; o schema de
   14/09 não tem onde. Hoje "estar no ciclo" é DERIVADO — está no ciclo a
   disciplina com regra de revisão configurada —, e derivado não se escreve.
   (`lib/api/supabase/review.ts`)

Além delas, **a execução de bateria** continua fora — saiu com a extensão, e o
motor novo ainda vai ser desenhado. As telas que a pressupõem dizem isso: a meta
de bateria não oferece botão, o reforço mostra o vazio como resposta, e as
dificuldades por tópico explicam que o catálogo de tópicos não voltou.

### Duas coisas que a reconstrução decidiu diferente da v2

- **A rosca de acerto e erro virou um número**, e o radar por disciplina virou
  barra horizontal. Uma rosca de duas fatias é um número desenhado de forma
  difícil de ler; num radar a área cresce com o quadrado do valor, e a ordem
  dos eixos muda o formato da figura. As duas trocas vêm do método de
  visualização, e a pergunta que os gráficos respondem é a mesma.
- **A tela de boas-vindas não foi portada.** Ela existia para oferecer o login
  com Google, que está bloqueado neste produto; sem ele, é um passo a mais cujo
  único botão leva ao formulário.
