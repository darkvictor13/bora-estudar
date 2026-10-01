# Aulas PRF e desempenho diário

As aulas seguem a sequência presencial definida pelo professor. Cada aula do
catálogo pode guardar blocos por tópico, cada um com PDF e cadernos próprios
no TEC e QConcursos, além de flashcards e resumo flash da aula. Esses recursos apoiam o estudo; o
aproveitamento vem das respostas registradas pelo aluno.

## Comportamento

- O professor cria até 30 blocos por aula, edita os links de cada tópico e
  controla se a aula está publicada. Uma aula em
  rascunho não aparece ao aluno. Aulas novas importadas começam em rascunho;
  aulas que já estavam ativas antes da mudança permanecem publicadas.
- A próxima aula aparece quando o professor a publica, independentemente do
  número de questões, dos acertos ou da leitura da aula anterior.
- O aluno pode voltar aos links de qualquer aula publicada na página Aulas.
  O modal da meta abre a aula publicada mais recente da disciplina.
- O registro de questões pede total e acertos; erros são a diferença. A meta
  de prática da aula é atingida pelo número mínimo configurado, mas não libera
  nem bloqueia outras aulas.
- Estatísticas e cronograma somam questões, acertos, erros e aproveitamento
  pela data em que a resposta foi registrada. Ler PDF, flashcards e resumo
  não aumenta o indicador de aprendizagem.
- Se não há páginas mapeadas, a aula e seus links continuam disponíveis;
  apenas o controle de leitura por página não aparece.
- Links externos exigem HTTPS e não aceitam parâmetros usuais de tokens de
  sessão. PDFs publicados no próprio site usam `/materials/prf/...`.

## Materiais conferidos para a demonstração

- **Português PT-01:** dois blocos, Acentuação Gráfica e Ortografia/Hífen,
  com cadernos TEC/QConcursos separados. Ambos apontam para o PDF integrado
  de Português aberto pelo usuário, cujo índice cobre os dois tópicos.
- **Informática INFO-01:** PDF de Conceitos de Proteção e Segurança, já
  disponível no computador do usuário e copiado para os materiais do site;
  cadernos TEC/QConcursos do mesmo tópico.
- **Direito Constitucional DC-01:** cadernos separados para Direitos
  Individuais e Coletivos e Remédios Constitucionais; os PDFs aguardam cópias
  permanentes. **DC-02:** o tópico está preparado em bloco, sem vincular
  material de outro assunto.

Os links temporários `media.curseduca.pro` incluem credenciais e não entram
no catálogo. O professor pode anexar as cópias permanentes nos blocos.

## Verificação

Os testes de domínio e fixtures cobrem publicação, recursos, ausência de
páginas e cálculo diário de acertos e erros. A suíte SQL `09_lesson_resource_links.sql`
cobre acesso do professor e do aluno e validação dos links. A migration
`20260925033641_lesson_resource_links.sql` ainda precisa ser aplicada ao banco
do ambiente antes de usar essas colunas fora das fixtures.
