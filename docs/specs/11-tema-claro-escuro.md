# 11 — Tema claro e escuro

**Situação:** implementada · **Comparativo:** §12 item 14 · **Fluxos e2e:** F-TEMA-01 a F-TEMA-08

---

## Problema

Ninguém reclamou. Isto está registrado aqui de propósito, porque muda como a
feature deve ser julgada: ela não sai de uma dor observada, sai da expectativa
de que um produto de estudo tenha tema escuro. O §12 a coloca no item 14, a
última faixa, enquanto os itens 1 a 3 ainda travam o uso real — três das cinco
metas semanais do seed são impossíveis de fechar hoje.

O que **é** verificável: quem usa o sistema passa hora seguida na mesma tela —
uma bateria custa cerca de uma hora — e não tem como reduzir o brilho da
interface. A v2 tinha `toggleTheme` nas três páginas e a reescrita não trouxe.

E existe um custo já pago sem contrapartida. A migration inicial reservou
`student_preferences.theme` (`text not null default 'claro'`) em agosto de 2026
e **nenhuma tela jamais leu ou escreveu essa coluna** — está registrado em
`R-CTA-13`. Uma coluna que nunca foi lida não é feature adiantada, é decisão
adiada: ela ficou como `text` em vez de enum, com valor em português, contra a
regra do repositório de que tipo e flag são enum ou FK e de que valor de enum é
escrito em inglês. Enquanto ninguém a lê, corrigir custa uma migration e zero
dado. Depois de existir tela, custa migração de dado.

---

## Regras

### Onde a preferência mora

| Id | Regra |
|---|---|
| R-TEMA-01 | A preferência é **da conta, não do aluno**. Vive em `user_preferences`, chaveada por `profile_id`, e vale para os três valores de `user_role` — `student`, `teacher` e `admin`. |
| R-TEMA-02 | A escrita é **direta pelo dono**, com RLS: `using (profile_id = auth.uid())` e `with check (profile_id = auth.uid())`. Não há RPC. Preferência de interface não é execução: não tem máquina de estados, não tem ledger, não tem o que replayar. |
| R-TEMA-03 | Os grants são `select, insert` na tabela e **`update (theme)` por coluna**. `profile_id` fica fora do grant de UPDATE — é a terceira defesa aplicada a uma tabela nova, e sem ela a RLS sozinha deixaria mover a linha de um perfil para outro. |
| R-TEMA-04 | `delete` não é concedido, como em nenhuma tabela do schema. Não há o que apagar: a linha só muda de valor. |
| R-TEMA-05 | O valor é o enum `theme_preference`, com exatamente dois valores: `light` e `dark`. O default da coluna é `light`. |
| R-TEMA-06 | **Não existe "seguir o sistema".** `prefers-color-scheme` não é lido em lugar nenhum do site. Quem nunca escolheu vê o tema claro, mesmo com o sistema operacional no escuro. |
| R-TEMA-07 | Quem nunca escolheu **não tem linha** em `user_preferences`. A ausência de linha equivale a `light`; a primeira escolha insere a linha (upsert pela chave `profile_id`). |
| R-TEMA-08 | `student_preferences.theme` **deixa de existir**. A migration remove a coluna. É compatível com o bundle que já está no ar porque nenhum arquivo do site ou da extensão a referencia — só o tipo gerado em `packages/database`. |
| R-TEMA-09 | `user_preferences` **não entra no `audit_log`**. Troca de tema não é evento de estudo, e um log que registra tudo deixa de ser lido. `updated_at` é mantido pelo mesmo gatilho `tg_set_updated_at` das outras tabelas. |

### Aplicação, e a ordenação que não pode inverter

| Id | Regra |
|---|---|
| R-TEMA-10 | **O tema é aplicado ao documento antes do primeiro paint**, a partir da cópia local. O site é uma SPA em modo data: o documento pinta antes de os loaders da rota resolverem. Aplicar depois do loader significa pintar claro e trocar na frente de quem escolheu escuro, em toda carga de página. Esta é a ordenação que a feature inteira existe para respeitar. |
| R-TEMA-11 | **A conta é a fonte da verdade; o aparelho é cache.** Quando o loader responde, o valor da conta prevalece sobre a cópia local e a atualiza. Divergência entre os dois se resolve sempre a favor da conta. |
| R-TEMA-12 | A troca é **otimista com aviso**: aplica na tela, grava na conta. Se a gravação falhar, a escolha continua valendo neste aparelho e aparece uma mensagem dizendo que ela não foi salva na conta. Nunca falha em silêncio — o caso ruim é o aluno achar que escolheu e o outro aparelho voltar ao claro sem explicação. |
| R-TEMA-13 | A cópia local é **chaveada pelo id do perfil e apagada no logout**. Ninguém herda o tema de quem usou o computador antes. O custo aceito: no primeiro login em um aparelho há uma carga sem cópia local, e nela o tema vem do loader. |
| R-TEMA-14 | **Sem sessão o tema é `light`** — login, cadastro, recuperação de senha e lista de espera. Não há cópia local a consultar, porque o logout a apagou. |

### Contraste

| Id | Regra |
|---|---|
| R-TEMA-15 | Os dois temas cumprem **WCAG AA**: 4.5:1 para texto normal, 3:1 para texto grande e para o limite visível de **campo e de botão**. Cartão fica de fora: contêiner não interativo não é componente na acepção da 1.4.11, e o tema claro que já está no ar nunca cumpriu 3:1 ali — a redação anterior desta regra dizia "campo, botão e cartão" e reprovava o design existente por uma exigência que ele não precisa cumprir. Corrigida em 29/08/2026, ao implementar. |
| R-TEMA-17 | Cumprir a regra acima **mudou o tema claro também**: a borda de campo e de botão saiu de `--ink-300` para `--ink-500`. `--ink-300` sobre branco dá 1,5:1, e o limite do controle é informação necessária para identificá-lo. O mesmo valeu para o botão da sidebar, que passou de 22% para 40% de branco. |
| R-TEMA-16 | Os tokens de cor passam a ter **nome de papel** (`--surface`, `--text`, `--border`, …) definidos **sobre** a escala existente. O tema escuro redefine papéis, nunca a escala: `--ink-900` continua sendo o tom mais escuro nos dois temas. Sem essa camada, o tema escuro inverte `--ink-900` e o nome do token passa a mentir — e é assim que o terceiro tema, se existir um dia, nasce ilegível. |

---

## Fluxo

```
carga da página
      │
      ├─ lê a cópia local (chave = id do perfil)
      │        │
      │        └─► aplica ao documento  ◄── ANTES do primeiro paint
      │
      ├─ React monta, loaders da rota resolvem
      │        │
      │        └─► valor da conta prevalece; atualiza a cópia local
      ▼
   [troca de tema]
      │
      ├─ aplica ao documento e grava na cópia local
      ├─ grava em user_preferences (upsert por profile_id)
      │        │
      │        ├─ ok    → nada mais acontece
      │        └─ falha → aviso: vale neste aparelho, não foi salvo na conta
      ▼
   [logout] ──► apaga a cópia local ──► telas públicas em light
```

---

## Superfície

| Camada | Item |
|---|---|
| Rotas | todas — o tema é do documento, não de uma tela |
| Componentes | o controle de troca, na navegação; a aplicação ao documento antes do paint |
| Actions | `updateTheme` |
| Leitura | o loader da raiz autenticada, junto do perfil já carregado |
| RPCs | **nenhuma** |
| Migration | uma: `create type theme_preference`, `create table user_preferences`, policy, grants, gatilho de `updated_at`, e `alter table student_preferences drop column theme` |
| Banco | `user_preferences` (nova), `student_preferences` (perde `theme`), `profiles` (só leitura, para o `profile_id`) |
| CSS | `apps/web/src/styles/globals.css` — camada de papéis sobre a escala de `:root` |
| Extensão | nada muda |
| Testes | `apps/e2e/tests/theme.spec.ts`, `apps/e2e/support/contrast.ts`, `supabase/tests/06_preferences.sql` |

**Por que não é `upsert`.** O grant de UPDATE cobre só `theme`, e o upsert do
PostgREST (`Prefer: resolution=merge-duplicates`) exige UPDATE na tabela
inteira: contra o Supabase local ele devolve `42501 permission denied for table
user_preferences` mesmo quando a linha ainda não existe. `saveTheme` faz UPDATE
e, se nenhuma linha respondeu, INSERT.

**A conta vence, inclusive contra a escolha ainda não gravada.** Trocar o tema e
navegar no mesmo instante pode fazer o loader devolver o valor antigo e desfazer
a escolha na tela. É `R-TEMA-11` funcionando, não defeito — a janela é o tempo
de uma gravação, e a próxima troca grava de novo.

**Consequência em outra spec.** Quando isto for implementado, a spec
[10](10-conta-e-lista-de-espera.md) muda em dois pontos: `R-CTA-13` deixa de
citar `theme` entre as colunas de `student_preferences`, e a linha "Tema
claro/escuro" sai do Fora de escopo dela.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Escolher escuro aplica na tela imediatamente, grava em `user_preferences`, e recarregar mantém o escuro | F-TEMA-01 |
| CA-02 | A escolha aparece em outra sessão do mesmo usuário, em contexto de navegador novo, sem tocar na cópia local | F-TEMA-02 |
| CA-03 | Na segunda carga o documento já está escuro **antes** de o conteúdo da rota aparecer — nenhum instante em claro | F-TEMA-03 |
| CA-04 | Com a gravação falhando, a tela troca, aparece o aviso de que não foi salvo na conta, e a escolha vale até a próxima carga | F-TEMA-04 |
| CA-05 | Logout apaga a cópia local: as telas públicas ficam claras e o login de outro usuário no mesmo navegador não herda o tema anterior | F-TEMA-05 |
| CA-06 | Os três papéis têm o controle e a preferência persistida — aluno, professor e admin | F-TEMA-06 |
| CA-07 | Texto sobre fundo cumpre 4.5:1 (3:1 se grande), e o limite de campo e de botão cumpre 3:1, nos dois temas, nas telas de aluno e de professor | F-TEMA-07 |
| CA-08 | Sem nenhuma escolha feita, e sem linha em `user_preferences`, o site abre em claro mesmo com o sistema operacional no escuro | F-TEMA-08 |
| CA-09 | Um perfil não escreve a linha de outro: o `INSERT` levanta `42501` e o `UPDATE` afeta **zero linhas** (contadas com `row_count`, porque UPDATE filtra em silêncio) | `supabase/tests/06_preferences.sql` |
| CA-10 | `theme` recusa qualquer valor fora de `light` e `dark` | `supabase/tests/06_preferences.sql` |
| CA-11 | `profile_id` não é atualizável pelo grant por coluna, e `delete` é recusado | `supabase/tests/06_preferences.sql` |
| CA-12 | `student_preferences` não tem mais a coluna `theme`, e as demais colunas continuam intactas | `supabase/tests/06_preferences.sql` |

---

## Fora de escopo

- **O painel da extensão no TEC.** Continua escuro fixo. A extensão nunca fala
  com o Supabase — recebe um payload e devolve outro — então seguir o tema da
  conta exigiria mandá-lo no envelope e incrementar `PROTOCOL_VERSION`, com as
  duas pontas versionadas separadamente. É spec própria, se um dia valer a pena.
- **"Seguir o sistema" como terceiro valor.** Dois valores, escolha explícita.
  Ver `R-TEMA-06`.
- **Temas além de claro e escuro** — alto contraste, sépia, cor por concurso.
  Cada um multiplica a superfície do teste de contraste de `CA-07`.
- **Densidade e tamanho de fonte.** `user_preferences` nasce com lugar para
  outras preferências de interface; esta spec entrega só o tema.
- **Tema por tela ou por planejamento.** A preferência é da conta inteira.
