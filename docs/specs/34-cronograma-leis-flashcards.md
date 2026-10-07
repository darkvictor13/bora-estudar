# Cronograma interativo, leis e flashcards

## Escopo

O aluno precisa escolher o que estudar em cada dia e acompanhar a semana sem
duplicar os registros da tela de metas. O cronograma usa o mesmo planejamento,
metas, registros, conclusão e reabertura já existentes.

Leis e Flashcards começaram como páginas com aviso **Em breve**. Em 28/09/2026,
o primeiro lote de 15 leis foi recebido e a página de Leis passou a oferecer
biblioteca por matéria e leitura por artigo. Flashcards têm fluxo próprio por
aula. Os recortes de edital e a incidência continuam sem dados homologados.

## Comportamento

- `/aluno/cronograma` mostra sete dias a partir do início da semana do plano,
  incluindo dias livres. O início não é necessariamente uma segunda-feira.
- A seleção de semana, dia, disciplina e situação fica na URL, preservando
  recarregamento e navegação de voltar/avançar.
- Sem dia válido na URL, seleciona hoje quando estiver na semana exibida;
  caso contrário, seleciona o primeiro dia da semana. “Semana inteira” mostra todos.
- “Hoje” retorna à semana corrente e limpa os filtros. Os controles anterior
  e próxima percorrem as semanas disponíveis do planejamento.
- Pendentes inclui metas pendentes e em andamento; exclui concluídas e puladas.
  Revisões inclui metas de revisão e reforço, respeitando a disciplina selecionada.
- Os cartões de dias e o resumo exibem o progresso completo da semana;
  os filtros se aplicam à lista de metas abaixo da agenda.
- Registrar estudo, concluir, reabrir e registrar estudo extra usam as ações
  existentes. O estudo extra usa o dia selecionado; na visão de semana inteira,
  usa inicialmente o primeiro dia da semana.
- Metas de bateria continuam com execução indisponível, conforme a regra atual.
- O deck pessoal tem disciplina de 2 a 120 caracteres e assunto de 2 a 160. O
  par disciplina + assunto é único por aluno, ignorando maiúsculas e espaços
  nas pontas (`personal_flashcard_decks_name_per_student_uidx`), e a recusa é
  "Você já tem um deck com essa disciplina e esse assunto." (QA-16, D-07).
- As três rotas exigem aluno com acesso ativo, como as demais áreas de estudo.
- `/aluno/leis` usa uma cópia canônica por norma. O leitor mantém a lei e o
  artigo na URL; a fonte oficial acompanha cada norma. Os artigos aparecem em
  leitura contínua, com biblioteca, índice e barra de marcação fixos durante a
  rolagem. O aluno pode selecionar trechos e aplicar marca-texto, sublinhado,
  tachado, contorno ou apagar a marcação, escolhendo entre sete cores e desfazendo
  ações da sessão. As marcações ficam na conta do aluno, por lei, e
  acompanham o trecho quando o texto é corrigido — *atualizado em 01/10/2026
  pela spec [40](40-leis-editais-e-marcacoes-no-banco.md); antes ficavam no
  navegador*. Nenhum artigo é marcado como cobrado em
  PMPR, PPPR ou PRF sem recorte de edital conferido.

## Referência

Foram observadas as telas de cronograma, biblioteca/leitor de leis e entrada de
flashcards do Caveira em 24/09/2026. A implementação usa os componentes e dados
do Bora Estudar. Não importa materiais da plataforma de referência.

O lote de leis vem de `VADE_MECUM_POLICIAL_ORGANIZADO_V2.zip`, fornecido pelo
responsável em 28/09/2026. Os 15 arquivos originais ficam em
`content/laws/source`; `scripts/build-law-library.mjs` gera os documentos
carregados sob demanda e o índice exibido ao aluno. A transcrição pode conter
referências históricas e dispositivos vetados; o link oficial permite conferir
a redação vigente.

O leitor do Normio foi analisado em 28/09/2026 como referência de interação:
texto contínuo, índice de artigos e ferramentas que permanecem acessíveis ao
rolar. A interface usa os componentes e as cores da Fronteira Concursos.

## Validação

`schedule.test.ts` cobre semana começando na quarta, virada de mês, dias livres,
combinação de filtros, exclusão de metas puladas das pendências e data local.
`law-markings.test.ts` cobre substituição e exclusão parcial das marcações e
validação dos dados guardados no navegador.
