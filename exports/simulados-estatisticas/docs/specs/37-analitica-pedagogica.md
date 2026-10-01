# Analítica pedagógica — Simulados e Estatísticas

## Objetivo

Transformar registros de estudo e simulados presenciais em quatro leituras independentes:

1. **Cobertura:** quanto do programa aplicável o aluno percorreu.
2. **Desempenho:** como respondeu às questões.
3. **Execução:** quanto do planejamento realizou.
4. **Evolução:** como essas medidas mudam ao longo do tempo.

Não haverá uma “nota geral” que esconda as causas. Horas representam esforço; acertos representam domínio. Esses dados aparecem juntos no painel, mas não são somados em um único score.

## Três visões

A tela **Simulados** concentra cadastro, lançamento de notas, ranking e análise de cada prova presencial (média, percentil e distribuição das notas). A tela **Estatísticas** concentra questões resolvidas, acertos e erros, tempo de estudo, constância e comparações desses indicadores. A visão do professor exibe percentis 25, 50 e 75 e boxplot de aproveitamento da turma nas questões por ano. Resultados de simulados não entram nas séries de questões ou de tempo.

### Aluno

Indicadores principais:

- questões realizadas;
- acertos e erros;
- aproveitamento, sempre acompanhado do tamanho da amostra;
- cobertura do edital;
- metas concluídas e cumprimento do planejamento;
- horas líquidas;
- ritmo de questões, quando houver tempo de resolução válido.

Detalhes:

- desempenho por disciplina, tópico e subtópico;
- evolução semanal;
- comparação com grupo realmente comparável;
- mapa de calor por disciplina e semana;
- distribuição planejada versus realizada;
- histórico interno separado de importações externas.

### Turma

- mediana, quartis e distribuição por disciplina/bloco;
- assuntos com maior dificuldade;
- quantidade de alunos e de questões em cada cálculo;
- lista de alunos com lacuna somente para o professor responsável;
- aviso de amostra insuficiente.

### Professor e coordenação

- comparação entre turmas e semanas;
- dificuldades coletivas por assunto;
- diferenças entre planejamento e execução;
- alunos que precisam de acompanhamento;
- sugestões de reforço coletivo ou individual.

## Regras estatísticas

### Percentual sempre com amostra

Todo percentual deve exibir quantidade de questões. `90% em 10 questões` não tem a mesma confiabilidade de `78% em 300 questões`.

### Grupo comparável

Comparações entre alunos usam, no mínimo:

- turma;
- planejamento;
- disciplina;
- tópico ou bloco/meta;
- período;
- mesma bateria, quando disponível.

O boxplot geral por `turma + ano` serve apenas como visão exploratória até que essas dimensões estejam registradas. Ele não pode gerar diagnóstico individual nem reforço automático.

### Privacidade e linguagem

O painel individual prefere percentil e faixa da turma a uma posição nominal. Ranking nominal permanece restrito aos simulados presenciais publicados pelo professor.

### Amostra mínima

Sem quantidade suficiente de alunos ou questões, mostrar `Amostra insuficiente para comparação`. O limite deve ser configurável e aparecer ao usuário.

### Fontes separadas

Dados importados do TEC/QConcursos recebem `source = imported` e um lote de importação. O painel permite escolher `Todo histórico`, `Fronteira Concursos` ou `Histórico importado`. As fontes nunca são misturadas silenciosamente.

## Modelo de dados necessário

### Hierarquia de conteúdo

`subject_id -> topic_id -> parent_topic_id -> lesson_id`

O mesmo `topic_id` deve ligar:

- aula;
- Resumo Flash;
- flashcards;
- questões;
- estatísticas;
- reforço.

### Tentativas de questões

Os totais atuais em `goal_entries` atendem o resumo diário, mas não permitem diagnóstico por assunto. A evolução exige uma entidade de tentativa ou lote com:

- aluno, turma e professor;
- planejamento e meta/bloco;
- disciplina, tópico e subtópico;
- questão ou bateria de origem;
- data;
- acerto/erro;
- tempo de resposta, quando confiável;
- fonte (`fronteira`, `tec_import`, `qc_import`);
- lote de importação.

### Simulados

Além da nota total, incluir:

- quantidade total de questões;
- seções ou disciplinas da prova;
- acertos e erros por seção;
- tópicos avaliados, quando disponíveis;
- tempo total opcional.

O resultado oficial presencial continua sendo a nota lançada pelo professor. O detalhamento serve à análise pedagógica.

## Fases

### Fase 1 — Base estatística

- questões, acertos, erros e amostra;
- horas líquidas separadas do desempenho;
- cobertura do edital;
- cumprimento do planejamento;
- evolução semanal;
- disciplina, tópico e subtópico;
- dashboard individual;
- simulados com detalhamento por disciplina.

### Fase 2 — Inteligência coletiva

- mediana e quartis;
- boxplot e percentil por grupo comparável;
- linha aluno versus mediana da turma;
- mapas de calor;
- painel de lacunas coletivas;
- filtros por turma, período, disciplina e planejamento.

### Fase 3 — Automação pedagógica

- lacuna persistente por tópico;
- reforço recomendado;
- vínculo automático com Resumo Flash, flashcards e bateria de questões;
- alertas ao professor;
- acompanhamento de recuperação após reforço.

## Critérios para reforço

Um reforço não nasce apenas de um percentual baixo. A decisão considera:

- quantidade mínima de questões;
- diferença para a mediana do grupo comparável;
- tendência das últimas baterias;
- persistência da dificuldade;
- existência de material relacionado ao mesmo `topic_id`.

Exemplo: `38 questões`, `52% do aluno`, `71% da mediana` e sequência `61% -> 50% -> 47%` caracteriza uma lacuna persistente e permite sugerir material de reforço.

## Fora deste módulo

Perfil de estilo do professor não pertence às estatísticas acadêmicas. Caso seja criado, ficará em `Equipe -> Perfil dos professores`.
