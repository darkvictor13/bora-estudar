# Recorte — Simulados e Estatísticas

Este pacote contém somente o código relacionado aos simulados presenciais e aos painéis de desempenho da Fronteira Concursos.

## Telas principais

- `apps/web/src/routes/student/MockExams.tsx`: resultados e ranking publicados para o aluno.
- `apps/web/src/routes/teacher/MockExams.tsx`: cadastro do simulado, lançamento de notas e publicação.
- `apps/web/src/routes/student/Statistics.tsx`: desempenho diário, semanal, por disciplina, tempo e constância.
- `apps/web/src/routes/teacher/Statistics.tsx`: análise por planejamento e distribuição anual dos acertos da turma.

## Componentes visuais

- `MockExamRanking.tsx`: ranking com empates e destaque do aluno atual.
- `MockExamOverview.tsx`: média, mediana, maior nota, participantes, percentil e distribuição; aparece em Simulados.
- `QuestionAccuracyCard.tsx`: acertos em verde e erros em vermelho.
- `BoxPlotCard.tsx`: distribuição de desempenho da turma.
- `packages/ui/src/charts`: gráficos de linha, barras e ranking.
- `StudyCalendar.tsx` e `StudyStreakDialog.tsx`: calendário de constância.

## Regras e cálculos

- `mock-exams.ts`: validação de nota e classificação `1, 1, 3` nos empates.
- `question-performance.ts`: acertos, erros e desempenho por dia.
- `class-question-distribution.ts`: um percentual por aluno antes do boxplot.
- `boxplot.ts`: mínimo, quartis, mediana, máximo e valores atípicos.
- `week.ts`: sequência e formatação de tempo.

## Banco e APIs

- `supabase/migrations/20260924210319_classroom_mock_exams.sql`: tabelas, segurança, validações e permissões.
- `supabase/tests/08_mock_exams.sql`: testes de segurança e regras de publicação.
- `apps/web/src/lib/api/supabase/mock-exams.ts`: escrita e leitura dos simulados.
- `apps/web/src/lib/api/supabase/statistics.ts`: agregações das estatísticas.
- `types/analytics-types.ts`: recorte dos contratos usados nesta área.
- `docs/specs/37-analitica-pedagogica.md`: arquitetura das três fases de evolução.

## Comportamento atual

O professor cria um simulado presencial, lança a nota total de cada aluno e publica o ranking. A área **Simulados** mostra a prova, nota, ranking, percentil, média, mediana e boxplot da própria prova. A área **Estatísticas** analisa questões do planejamento, acertos, erros, tempo e constância; o professor também vê a distribuição de acertos da turma com percentis 25, 50 e 75. O aluno só enxerga simulados publicados da própria turma. Leitura, PDF e flashcards não alteram o percentual de conhecimento.

## Pontos indicados para a próxima melhoria

1. Cadastrar quantidade de questões, acertos, erros e nota por disciplina no simulado.
2. Comparar o aluno com mediana, quartis e posição percentual da turma sem expor colegas quando não houver ranking publicado.
3. Mostrar evolução entre simulados e variação desde a prova anterior.
4. Permitir filtros por período, disciplina, turma e tipo de atividade.
5. Criar diagnóstico por assunto usando os erros das questões, mantendo a nota total como resultado oficial do simulado presencial.

Este recorte preserva os caminhos originais. Para executá-lo isoladamente ainda são necessários React, React Router, Material UI, os componentes de `@bora/ui`, autenticação e o cliente Supabase do projeto principal.
