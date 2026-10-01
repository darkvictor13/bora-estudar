# Simulados presenciais e ranking

O professor cadastra o simulado para uma turma existente e lança as notas dos
alunos. O aluno consulta o ranking; não responde à prova nem altera notas pelo site.

## Critérios de aceitação

- Cadastro exige título, turma, data e pontuação máxima positiva (até 100.000,
  com até duas casas decimais). A turma e a pontuação máxima são fixas após criar.
- O simulado começa em rascunho. O professor salva notas por aluno e publica
  o resultado quando estiver pronto; pode retirar a publicação para corrigir.
- Uma nota vazia significa não lançada e não participa do ranking. Zero é uma
  nota válida. Não são aceitas notas negativas ou maiores que o máximo.
- O ranking ordena por nota decrescente, com empate na mesma colocação (1, 1, 3).
  A ordem alfabética apenas organiza os nomes empatados (na visão do professor),
  sem desempatar.
- Alunos com acesso ativo veem apenas simulados publicados da própria turma e
  professor, enquanto estiverem matriculados nela.
- **O aluno não vê nome nem identificador de colega.** O ranking dele mostra a
  própria linha com o nome e a de cada colega como "Colega", com nota e
  colocação. O professor vê o ranking com os nomes. No banco, o aluno lê só a
  própria linha de `mock_exam_results` e `mock_exam_subject_results`; a turma
  chega a ele pela função `mock_exam_scoreboard`, cujo identificador de
  participante é sorteado a cada chamada e só serve para casar a nota geral com
  os acertos por matéria da mesma pessoa. Decisão da revisão do PR 10, que
  substitui "o ranking mostra nome e nota".
- O professor só cadastra e altera simulados próprios, para suas turmas, e só
  lança notas de alunos vinculados a ele e à turma do simulado.
- O professor cadastra as matérias de cada simulado com o total de questões e
  lança os acertos inteiros de cada aluno por matéria. Matéria e acertos só
  podem ser alterados em rascunho; zero é válido e campo vazio remove o
  lançamento. Não se reduz o total de questões abaixo de acertos já lançados.
- Cada matéria publicada tem seu próprio ranking por acertos, com os mesmos
  critérios de empate do ranking geral. O aluno vê seu percentual, posição,
  média dos colegas que têm acertos lançados e diferença em pontos percentuais.
  Comparações usam apenas a mesma prova e matéria, excluem o próprio aluno da
  média dos colegas e não tratam ausência como zero. Um gráfico de barras
  mostra percentuais do aluno em azul e média dos colegas em verde; diferenças
  negativas apontam prioridades de revisão.
- A nota geral continua independente dos acertos por matéria. Somente alunos
  com nota geral lançada entram nos rankings específicos. Esta análise fica
  em Simulados e não alimenta questões ou tempo da tela Estatísticas.
- As notas não são contadores de questões nem substituem o histórico de metas.
- Cada par simulado/aluno tem uma linha; salvar novamente substitui a nota.
  Repetir cadastro com o mesmo identificador não duplica o simulado.
- O menu do aluno agrupa rotina, materiais e desempenho. Leis e Flashcards
  mantêm o indicador “Em breve”. Simulados tem acesso próprio para os dois papéis.

## Verificação

Regras de nota e empate têm testes unitários. A suíte SQL verifica isolamento
entre professores e turmas, rascunhos invisíveis, notas inválidas e tentativas
de escrita por aluno. A interface foi conferida com dados de demonstração:
cadastro, lançamento, empate, publicação e bloqueio de edição após publicar.

Validação local: 82 testes de aplicação e nove suítes SQL aprovados, além de
TypeScript, ESLint e build. Sem Docker disponível, as migrations e suítes SQL
foram executadas em PostgreSQL embarcado (PGlite), com os papéis e funções de
autenticação simulados. Isso não substitui a integração com GoTrue e PostgREST.
Os tipos das duas tabelas novas foram gerados a partir desse catálogo local.

Para repetir a verificação SQL, instale `@electric-sql/pglite@0.3.14` em uma
pasta temporária e execute, na raiz do repositório:

```text
node scripts/check-mock-exams.mjs <caminho-para-pglite/dist/index.js>
```

A migration `20260924210319_classroom_mock_exams.sql` está preparada, mas não
foi aplicada ao ambiente remoto. As prévias usam fixtures em memória, sem
persistência entre recarregamentos e sem sincronização entre abas.

A extensão por matéria está em `20260930120000_mock_exam_subject_results.sql`,
com `mock_exam_subjects` (matéria e total da prova) e
`mock_exam_subject_results` (acertos por aluno). As duas tabelas herdam a
visibilidade do simulado: professor responsável lê rascunhos; o aluno da turma
só lê a própria linha, e só após a publicação. Apagar uma matéria com acertos
lançados é recusado pela FK (`ON DELETE RESTRICT`), e "Português" e
"português" são a mesma matéria (`mock_exam_subjects_name_uidx`). A suíte `15_mock_exam_subject_results.sql` cobre
isolamento, limites e bloqueio de edição publicada. Essa migration também
precisa ser aplicada ao ambiente remoto antes de usar o novo lançamento lá.
