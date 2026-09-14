# 28 — Painel arrastável e resumo por tópicos

> **Histórico.** Esta spec descreve o fluxo conduzido pela extensão de
> navegador, que foi removida do repositório. O que ela diz do banco continua
> valendo; o que diz da execução, não — não existe hoje caminho por onde o aluno
> responda uma bateria.

**Situação:** implementada · **Comparativo:** §12 item 13 · **Inventário:** [`inventario-v96.md`](../inventario-v96.md) §10 · **Fluxos e2e:** F-PAIN-01 a F-PAIN-06

---

## Problema

O painel fica sempre no mesmo canto, e às vezes é justamente ali que está a
alternativa da questão.

`panel.ts` monta um `aside` fixo em `right:16px; bottom:16px`, 274 px de largura,
`z-index` máximo. O TEC não é uma página nossa: layout de terceiro muda, e num
enunciado longo com imagem o painel cobre conteúdo. O aluno não tem o que fazer
— não dá para mover, nem para minimizar.

A v96 resolvia as duas coisas (`content.js:516`): cabeçalho arrastável, posição
guardada em `chrome.storage.local` sob `bora_smart_panel_pos_v3`, e um botão de
minimizar que reduzia o painel a um ícone flutuante.

E falta a outra metade do painel: **o resumo por tópicos**. `topicSummary`
(content.js:542) mostrava "TÓPICOS ESTUDADOS" ao concluir, com feitas, acertos e
erros por tópico. A spec [26](26-topicos-do-bloco-e-da-bateria.md) trouxe esse
resumo para o site, mas o momento em que ele mais importa é **antes de sair do
TEC** — é ali que o aluno acabou de responder e ainda lembra das questões.

O painel **não fala com o Supabase**, e não precisa: `QueueItem.topic` chega no
payload desde a spec [21](21-fases-na-extensao.md), e as respostas estão na
sessão. O resumo é computável localmente, sem uma linha de rede.

---

## Regras

### Arrastar e minimizar

| Id | Regra |
|---|---|
| R-PAIN-01 | O painel ganha um **cabeçalho** que serve de alça. Arrastar move; o resto do painel não arrasta, senão clicar num botão viraria arrasto de um pixel. |
| R-PAIN-02 | A posição é **presa à janela**: nunca sai da tela, nem por cima nem pelos lados. É o `Math.max(0, Math.min(...))` da v96, e existe porque um painel arrastado para fora não tem como voltar. |
| R-PAIN-03 | A posição vive em `chrome.storage.local`, sob **chave própria**, e é lida na montagem. Não entra no envelope da sessão: é preferência de quem usa, não dado de bateria — misturar as duas faria a preferência morrer junto com a bateria. |
| R-PAIN-04 | Posição gravada é **validada na leitura**. Número fora da tela, `NaN` ou objeto de outro formato caem no canto padrão. A tela do usuário muda de tamanho entre sessões, e o `storage` é dado que sobreviveu a versões anteriores. |
| R-PAIN-05 | **Minimizar** reduz o painel a um botão pequeno, e restaurar o traz de volta. O estado minimizado também persiste — quem minimizou não quer o painel de volta a cada questão. |
| R-PAIN-06 | Arrastar usa **ponteiro**, não mouse e toque separados. `pointerdown`/`pointermove`/`pointerup` cobrem os dois com um caminho só; a v96 duplicava tudo para `touch`. |
| R-PAIN-07 | O `pointermove` fica no **documento**, e é removido no `pointerup`. Ouvinte de movimento vivo o tempo todo numa página de terceiro é custo por questão respondida, não por arrasto. |

### Resumo por tópicos

| Id | Regra |
|---|---|
| R-PAIN-08 | Com pelo menos uma resposta, o painel mostra **feitas, acertos e erros por tópico**, do mais respondido para o menos. É `topicSummary` da v96, com a mesma ordenação. |
| R-PAIN-09 | O tópico vem do **item da fila**, que o traz do payload. O painel não consulta nada: é a mesma razão pela qual a extensão não fala com o Supabase. |
| R-PAIN-10 | Questão sem tópico entra como **"Tópico não identificado"**, o mesmo rótulo de `vw_topic_difficulty` e `vw_session_topics`. Três lugares, um rótulo. |
| R-PAIN-11 | O resumo conta **o que será enviado**, e não o que está na fila. Numa finalização antecipada, correlatas e extras são descartadas (`R-FASE-18`) — mostrá-las no resumo prometeria um número que o site não vai receber. |
| R-PAIN-12 | O resumo é **recolhível**, e começa recolhido enquanto a bateria corre. Durante a bateria o que importa é "quantas faltam"; ao terminar, o painel o abre sozinho. |

---

## Fluxo

```
painel monta
   ├─ lê a posição salva → valida → aplica, ou canto padrão
   └─ lê o estado minimizado → aplica

cabeçalho: pointerdown → pointermove (no documento) → pointerup
   │            └─ preso à janela: nunca sai da tela
   └─ ao soltar: grava a posição

respostas → resumo por tópico (feitas · acertos · erros)
   └─ conta o QUE SERÁ ENVIADO: na finalização antecipada,
      correlata e extra não entram
```

---

## Superfície

| Camada | Item |
|---|---|
| Extensão | `panel.ts` — alça, minimizar, resumo; `panel-position.ts`, novo |
| Domínio | `engine.ts` ganha `topicSummary`, ao lado de `answersForResult` |
| Protocolo | **nada muda** — o tópico já viaja desde a spec 21 |
| Site | **nada muda** |
| RPCs | **nenhuma** |
| Migration | **nenhuma** |
| Testes | `apps/extension/src/content/engine.test.ts`, `panel-position.test.ts`, `apps/e2e/tests/extension.spec.ts` |

**A largura usada para prender o painel é MEDIDA, não a constante.**
`width:274px` mais `padding:0 16px` dá 306px de caixa, e prender pela constante
deixava o painel passar 32px da borda direita. *Corrigido em 31/08/2026, ao
implementar: quem pegou foi o `F-PAIN-02`.*

**A posição e o estado minimizado ficam em chave separada da sessão.** É o que
permite `writeSession` continuar sendo a única coisa que a segunda das três
ordenações do `CLAUDE.md` protege: preferência perdida é irritação, bateria
perdida é uma hora de estudo.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Posição inválida, fora da tela ou de outro formato cai no canto padrão | `panel-position.test.ts` |
| CA-02 | A posição é presa à janela nos quatro lados | `panel-position.test.ts` |
| CA-03 | `topicSummary` agrupa por tópico, ordena por feitas e usa o rótulo padrão | `engine.test.ts` |
| CA-04 | Na finalização antecipada, o resumo conta só o que será enviado | `engine.test.ts` |
| CA-05 | Arrastar o cabeçalho move o painel, e a posição sobrevive à navegação | F-PAIN-01 |
| CA-06 | O painel não sai da tela, mesmo arrastado para fora | F-PAIN-02 |
| CA-07 | Minimizar reduz a um botão, e restaurar traz de volta | F-PAIN-03 |
| CA-08 | O estado minimizado sobrevive à navegação entre questões | F-PAIN-04 |
| CA-09 | O resumo por tópicos aparece com as respostas e conta certo | F-PAIN-05 |
| CA-10 | Clicar num botão do painel não vira arrasto | F-PAIN-06 |

---

## Fora de escopo

- **Redimensionar o painel.** A v96 não tinha, e largura variável exigiria
  repensar todo o conteúdo.
- **Encaixe nas bordas.** Conforto, e a v96 não tem.
- **Posição por site.** O painel só existe no TEC.
- **Tema claro no painel.** Ele é escuro de propósito, para se distinguir da
  página que o hospeda.
- **Resumo por tópicos no popup da extensão.** O popup não conhece a sessão em
  andamento, e dar a ele esse conhecimento é a duplicação que
  `packages/protocol` existe para impedir.
