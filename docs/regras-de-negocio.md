# Regras de negócio — Bora Estudar Concursos

Este documento é o contrato funcional para implementação de novos frontends do Bora Estudar Concursos.

As regras abaixo devem ser aplicadas independentemente de framework, biblioteca visual ou dispositivo. Regras críticas de segurança, integridade e autorização também devem ser validadas pelo Supabase/PostgreSQL; o frontend não é uma fonte confiável para aplicá-las sozinho.

## 1. Perfis e autenticação

### RN-AUT-001 — Tipos de perfil

O sistema possui três tipos de perfil:

- `admin`;
- `professor`;
- `aluno`.

### RN-AUT-002 — Perfil de novo usuário

Todo usuário cadastrado pelo fluxo público deve receber inicialmente um perfil do tipo `aluno`.

Um usuário não pode se cadastrar diretamente como professor ou administrador. Essa promoção deve ser feita por operação administrativa protegida.

### RN-AUT-003 — Dados mínimos do perfil

O perfil deve possuir:

- nome com pelo menos dois caracteres;
- fuso horário, usando `America/Sao_Paulo` como padrão;
- indicador de perfil ativo.

### RN-AUT-004 — Redirecionamento por perfil

Após autenticar:

- aluno deve acessar o frontend de aluno;
- professor deve acessar o frontend de professor;
- administrador deve acessar a área administrativa.

Um perfil não deve conseguir operar funções de outro perfil apenas alterando a URL.

### RN-AUT-005 — Fonte da identidade

O ID do usuário autenticado deve vir de `auth.uid()`/sessão do Supabase. IDs recebidos de campos do frontend não devem ser usados como prova de identidade.

## 2. Relação entre professor e aluno

### RN-VIN-001 — Vínculo obrigatório

Um professor somente pode administrar um aluno quando existir vínculo ativo entre os dois.

### RN-VIN-002 — Um professor ativo por aluno

Um aluno pode possuir apenas um vínculo ativo com professor por vez.

Vínculos encerrados devem ser mantidos para histórico.

### RN-VIN-003 — Tipos compatíveis

No vínculo:

- `professor_id` deve apontar para perfil ativo do tipo professor;
- `aluno_id` deve apontar para perfil ativo do tipo aluno;
- professor e aluno não podem ser a mesma pessoa.

### RN-VIN-004 — Encerramento

Ao encerrar um vínculo, os planejamentos e resultados históricos devem ser preservados. O encerramento apenas retira a autorização do professor para novas operações sobre o aluno.

## 3. Acesso do aluno

### RN-ACE-001 — Acesso separado do planejamento

Liberação comercial de acesso e existência de planejamento são conceitos independentes.

Um planejamento ativo não libera automaticamente um aluno bloqueado, pendente, expirado ou cancelado.

### RN-ACE-002 — Estados de acesso

O acesso pode estar em um dos estados:

- `pendente`;
- `ativo`;
- `bloqueado`;
- `expirado`;
- `cancelado`.

### RN-ACE-003 — Condição de acesso liberado

O aluno possui acesso liberado quando todas as condições forem verdadeiras:

1. o estado é `ativo`;
2. a data inicial é nula ou menor/igual à data atual;
3. a data de expiração é nula ou maior/igual à data atual.

### RN-ACE-004 — Cadastro inicial

Novo aluno deve receber acesso `pendente`.

### RN-ACE-005 — Liberação

Professor vinculado ou administrador pode liberar o acesso:

- por uma quantidade positiva de meses; ou
- sem data de expiração.

### RN-ACE-006 — Renovação

Ao renovar um acesso com vencimento:

- se ainda estiver válido, os meses são adicionados à expiração atual;
- se já estiver vencido, os meses são contados a partir da data atual.

### RN-ACE-007 — Bloqueio

Bloqueio deve registrar data e pode registrar motivo.

### RN-ACE-008 — Ausência de cupons

O sistema não possui regras, tabelas, campos ou fluxos de cupons.

## 4. Catálogo acadêmico

### RN-CAT-001 — Curso identificado por ID

Curso deve ser identificado por `curso_id`/código cadastrado. O frontend não deve detectar o curso procurando palavras no nome do planejamento.

### RN-CAT-002 — Modelos de estudo

Um curso pode usar:

- `teoria_blocos`: aceita metas de teoria e de blocos;
- `somente_blocos`: aceita apenas metas de blocos, reforço e estudo extra.

### RN-CAT-003 — Metas semanais padrão

O curso pode definir uma quantidade padrão de metas semanais entre 1 e 100.

Esse valor é apenas o padrão inicial e pode ser substituído no planejamento.

### RN-CAT-004 — Disciplinas do curso

Cada disciplina do curso deve definir:

- modalidade: `blocos`, `teoria` ou `ambos`;
- meta percentual entre 0% e 100%;
- peso maior que zero;
- ordem de apresentação;
- indicador de atividade.

### RN-CAT-005 — Cadernos

Caderno do catálogo pode possuir:

- nome;
- link TEC;
- quantidade total de questões;
- ordem;
- situação ativa/inativa.

Quantidades não podem ser negativas.

### RN-CAT-006 — Aulas e materiais

Aula pode possuir materiais dos tipos:

- PDF;
- vídeo;
- link;
- outro.

Uma aula pode ter vários materiais ordenados.

## 5. Planejamentos

### RN-PLA-001 — Responsáveis

Todo planejamento deve pertencer a:

- um aluno;
- um professor vinculado ao aluno;
- um curso.

### RN-PLA-002 — Estados do planejamento

O planejamento pode estar:

- `ativo`;
- `pausado`;
- `arquivado`.

### RN-PLA-003 — Planejamento ativo único

Um aluno pode possuir apenas um planejamento ativo por vez.

### RN-PLA-004 — Ativação

Ao ativar um planejamento, qualquer outro planejamento ativo do aluno deve ser arquivado na mesma transação.

### RN-PLA-005 — Nome único por aluno

Um aluno não pode possuir dois planejamentos com o mesmo nome.

Se o professor selecionar novamente o mesmo nome, deve editar/reaproveitar o planejamento existente ou escolher outro nome.

### RN-PLA-006 — Quantidade semanal

A quantidade configurada de metas semanais deve ficar entre 1 e 100.

### RN-PLA-007 — Arquivamento

Arquivar um planejamento:

- retira-o da área ativa;
- preserva disciplinas, cadernos, metas, resultados e revisões.

### RN-PLA-008 — Exclusão

Excluir um planejamento é uma operação excepcional e destrutiva.

O frontend deve:

1. informar quantas metas serão apagadas;
2. destacar quantas estão concluídas;
3. exigir confirmação explícita adicional quando houver histórico concluído.

### RN-PLA-009 — Configuração congelada

Disciplinas, cadernos e aulas usados pelo planejamento devem ser copiados/configurados para o próprio planejamento.

Mudanças posteriores no catálogo não podem alterar silenciosamente o histórico de um planejamento existente.

## 6. Disciplinas do planejamento

### RN-PDI-001 — Fonte das regras da disciplina

Meta percentual, peso, limites e modalidade usados na execução devem vir de `planejamento_disciplinas`.

O frontend não deve usar valores fixos ou valores do catálogo quando existir configuração no planejamento.

### RN-PDI-002 — Meta percentual

A meta da disciplina deve ficar entre 0% e 100%.

### RN-PDI-003 — Peso

O peso deve ser maior que zero.

### RN-PDI-004 — Limites de metas

- mínimo deve ser maior ou igual a zero;
- máximo deve ser maior ou igual ao mínimo.

### RN-PDI-005 — Disciplina inativa

Disciplina inativa no planejamento não deve receber novas metas automáticas.

O histórico já criado deve ser preservado.

## 7. Cadernos do planejamento

### RN-CAD-001 — Fonte dos cadernos

O frontend deve exibir e utilizar `planejamento_cadernos`, não o catálogo global.

### RN-CAD-002 — Personalização

Professor pode:

- editar nome, link e total de questões;
- adicionar caderno personalizado;
- ativar/desativar caderno;
- excluir/restaurar caderno.

### RN-CAD-003 — Exclusão lógica

Excluir caderno deve ser uma exclusão lógica.

O registro e as metas históricas continuam no banco, mas o caderno deixa de participar de novas gerações.

### RN-CAD-004 — Restauração

Caderno excluído pode ser restaurado e voltar a participar de novas metas.

### RN-CAD-005 — Cadernos elegíveis

Somente cadernos ativos e não excluídos podem ser escolhidos para novas metas.

## 8. Tipos e estados de metas

### RN-MET-001 — Tipos de meta

Uma meta deve possuir exatamente um dos tipos:

- `bloco`;
- `teoria`;
- `reforco`;
- `extra`.

Não devem ser usados marcadores como `TIPO_REFORCO:1` ou `TIPO_EXTRA:1` dentro da descrição.

### RN-MET-002 — Estados de meta

Uma meta pode estar:

- `pendente`;
- `em_andamento`;
- `concluida`;
- `pulada`;
- `cancelada`.

### RN-MET-003 — Agenda obrigatória

Toda meta deve possuir:

- semana maior ou igual a 1;
- dia da semana entre 1 e 7;
- ordem do dia maior ou igual a 1;
- tempo previsto entre 1 e 240 minutos.

### RN-MET-004 — Ordem única

Não pode haver duas metas com a mesma combinação de:

- planejamento;
- semana;
- dia;
- ordem do dia.

### RN-MET-005 — Meta de bloco

Meta de bloco deve possuir:

- disciplina do planejamento;
- caderno do planejamento;
- nenhuma meta de origem.

### RN-MET-006 — Meta de teoria

Meta de teoria deve possuir disciplina, mas não exige caderno nem questões.

Planejamento `somente_blocos` não pode receber novas metas de teoria.

### RN-MET-007 — Meta de reforço

Meta de reforço deve:

- possuir disciplina;
- apontar diretamente para a meta original por `origem_meta_id`;
- usar o tipo `reforco`.

### RN-MET-008 — Estudo extra

Estudo extra:

- usa o tipo `extra`;
- não possui disciplina ou caderno obrigatórios;
- exige descrição da atividade;
- pode nascer concluído;
- não registra questões ou acertos.

### RN-MET-009 — Relações do mesmo planejamento

Disciplina, caderno e meta de origem devem pertencer ao mesmo planejamento da meta.

## 9. Geração e substituição de metas

### RN-GER-001 — Autor da geração

Metas normais de teoria e blocos devem ser criadas pelo professor vinculado ou por administrador.

Aluno não pode gerar metas normais diretamente.

### RN-GER-002 — Total exato

Quando o professor informar um total semanal, a soma das quantidades por disciplina deve ser exatamente igual ao total.

### RN-GER-003 — Dias obrigatórios

Toda disciplina selecionada para geração deve possuir pelo menos um dia permitido.

### RN-GER-004 — Distribuição por peso

A distribuição automática deve:

1. atender primeiro o mínimo de cada disciplina;
2. distribuir o restante proporcionalmente aos pesos;
3. respeitar o máximo de cada disciplina;
4. usar os maiores restos proporcionais para resolver arredondamentos.

### RN-GER-005 — Alternância de disciplinas

As metas devem ser intercaladas entre disciplinas sempre que possível, evitando concentração desnecessária de uma única matéria.

### RN-GER-006 — Seleção de cadernos

Ao escolher cadernos automaticamente, o sistema deve priorizar os menos usados no planejamento.

Um caderno não deve ser repetido na mesma semana enquanto houver outro caderno elegível.

### RN-GER-007 — Continuidade circular

Depois que todos os cadernos elegíveis tiverem sido usados, a seleção pode retornar ao primeiro caderno e continuar de forma circular.

### RN-GER-008 — Substituição comum

Substituir uma semana deve apagar apenas metas com estado:

- `pendente`;
- `em_andamento`;
- `pulada`.

Metas concluídas devem ser preservadas.

### RN-GER-009 — Replanejamento completo

Replanejamento completo pode apagar todas as metas da semana, inclusive concluídas, mas exige confirmação destacada.

### RN-GER-010 — Transação obrigatória

Exclusão das metas antigas e inserção das novas devem ocorrer na mesma transação.

Se qualquer etapa falhar, nenhuma alteração da substituição deve permanecer.

### RN-GER-011 — Cópia da semana anterior

Ao copiar a semana anterior, o frontend pode preencher:

- quantidade por disciplina;
- dias utilizados;
- tempo previsto predominante.

A cópia é uma prévia editável e não deve salvar automaticamente.

## 10. Conclusão e edição de metas

### RN-CON-001 — Quem conclui

Somente o próprio aluno pode concluir ou desfazer a conclusão de sua meta. Administrador pode atuar apenas em operação excepcional auditável.

### RN-CON-002 — Acesso necessário

Aluno somente pode concluir meta enquanto possuir acesso liberado.

### RN-CON-003 — Tempo realizado

Tempo realizado deve ficar entre 1 e 1.440 minutos.

O frontend pode aceitar formatos amigáveis, mas deve enviar ao banco o total inteiro em minutos.

### RN-CON-004 — Questões e acertos

- questões não podem ser negativas;
- acertos não podem ser negativos;
- acertos não podem superar questões;
- erros são calculados como `questões - acertos`.

### RN-CON-005 — Conclusão de bloco e reforço

Meta de bloco ou reforço exige pelo menos uma questão realizada para ser concluída.

### RN-CON-006 — Conclusão de teoria

Meta de teoria pode ser concluída sem questões.

### RN-CON-007 — Estado concluído

Meta concluída deve possuir:

- `status = concluida`;
- data/hora de conclusão;
- tempo realizado.

### RN-CON-008 — Desfazer conclusão

Ao desfazer:

- status volta para `pendente`;
- data de conclusão é removida;
- tempo realizado é removido;
- questões voltam para zero;
- acertos voltam para zero.

### RN-CON-009 — Atualização confirmada pelo servidor

O frontend só deve exibir uma operação como definitivamente salva depois da confirmação do Supabase.

Em caso de erro, deve restaurar o estado anterior ou recarregar o registro do servidor.

## 11. Desempenho

### RN-DES-001 — Cálculo do aproveitamento

```text
aproveitamento = acertos / questões × 100
```

Sem questões, o aproveitamento é zero.

### RN-DES-002 — Fonte da meta percentual

A comparação deve usar `planejamento_disciplinas.meta_percentual`.

### RN-DES-003 — Meta atingida

Meta é atingida quando o aproveitamento é maior ou igual ao percentual configurado para a disciplina.

### RN-DES-004 — Faixas de atenção

- atingida: aproveitamento maior ou igual à meta;
- atenção: aproveitamento entre 75% da meta e a meta;
- prioridade alta: aproveitamento abaixo de 75% da meta.

Exemplo: com meta de 80%, prioridade alta é desempenho abaixo de 60%.

### RN-DES-005 — Estatísticas de questões

Estatísticas de questões e aproveitamento devem considerar metas concluídas de bloco e reforço.

Teoria e estudo extra não entram no aproveitamento de questões.

### RN-DES-006 — Estatísticas de tempo

Tempo de estudo deve considerar todas as atividades concluídas:

- bloco;
- teoria;
- reforço;
- estudo extra.

### RN-DES-007 — Períodos

O frontend pode apresentar tempo por:

- hoje;
- semana iniciada na segunda-feira;
- mês;
- ano;
- total.

### RN-DES-008 — Sequência de estudos

Um dia entra na sequência quando existe pelo menos uma atividade concluída naquele dia.

A sequência atual pode começar hoje ou ontem e continua retrocedendo enquanto houver dias consecutivos com estudo.

## 12. Reforços

### RN-REF-001 — Origem elegível

Somente meta original do tipo `bloco`, concluída e com questões realizadas pode originar reforço.

Teoria, estudo extra e outro reforço não podem ser origem direta de um novo reforço.

### RN-REF-002 — Necessidade de reforço

Reforço é necessário quando o aproveitamento da meta original fica abaixo da meta percentual da disciplina no planejamento.

### RN-REF-003 — Prioridade

Reforço é prioridade alta quando o desempenho da meta original fica abaixo de 75% da meta da disciplina.

### RN-REF-004 — Preservação da origem

Agendar reforço cria uma nova meta e nunca apaga ou altera o resultado histórico da meta original.

### RN-REF-005 — Identificação única

Todo reforço deve usar:

- `tipo = reforco`;
- `origem_meta_id` apontando para a meta original.

### RN-REF-006 — Duplicidade

Não pode existir mais de um reforço `pendente` ou `em_andamento` para a mesma origem.

### RN-REF-007 — Semana e dia

O frontend deve sugerir:

- semana seguinte à meta original;
- mesmo dia da semana da meta original.

Professor ou aluno podem ajustar a sugestão antes de confirmar.

### RN-REF-008 — Ordem

O reforço deve receber a próxima ordem disponível no dia escolhido.

### RN-REF-009 — Reforço resolvido

Uma necessidade de reforço só é considerada resolvida quando existir reforço concluído cujo desempenho alcance a meta percentual da disciplina.

Reforço concluído abaixo da meta não resolve a deficiência e permite novo agendamento.

### RN-REF-010 — Ignorar sugestão

Aluno pode ignorar uma sugestão. Isso registra `reforco_ignorado_em` na meta original.

Ignorar não altera o resultado acadêmico original.

### RN-REF-011 — Reativação

Ao agendar um reforço para uma origem ignorada, a marca de ignorado deve ser removida.

### RN-REF-012 — Cancelamento

Somente reforço `pendente` ou `em_andamento` pode ser cancelado.

Reforço concluído deve permanecer no histórico.

## 13. Estudo extra

### RN-EXT-001 — Criação pelo aluno

Aluno pode registrar estudo extra somente em seu planejamento ativo.

### RN-EXT-002 — Dados obrigatórios

Estudo extra exige:

- atividade;
- semana;
- dia;
- tempo realizado.

### RN-EXT-003 — Conclusão imediata

Novo estudo extra é criado como concluído, usando o tempo informado como previsto e realizado.

### RN-EXT-004 — Sem questões

Estudo extra deve possuir zero questões e zero acertos.

### RN-EXT-005 — Estatísticas

O tempo de estudo extra entra nas estatísticas de tempo, mas não no aproveitamento por questões.

### RN-EXT-006 — Reforço

Estudo extra nunca gera reforço.

## 14. Aulas e revisões

### RN-REV-001 — Progresso independente

Para cada aula, o aluno pode registrar separadamente:

- teoria concluída;
- caderno concluído.

### RN-REV-002 — Pertencimento

Progresso e revisão devem pertencer ao mesmo aluno e planejamento da aula.

### RN-REV-003 — Configuração única

Cada disciplina do planejamento possui no máximo uma configuração de revisão.

### RN-REV-004 — Intervalos

Primeira e segunda revisão usam intervalos entre 0 e 60 aulas.

Valor zero desativa a respectiva etapa.

### RN-REV-005 — Fonte única

Professor e aluno devem consultar a mesma configuração salva no banco.

Não devem existir intervalos automáticos diferentes em cada frontend.

### RN-REV-006 — Estados da revisão

Revisão pode estar:

- `pendente`;
- `concluida`;
- `cancelada`.

### RN-REV-007 — Conclusão

Revisão concluída deve possuir data/hora de conclusão. Ao desfazer, essa data deve ser removida.

### RN-REV-008 — Criação manual pelo professor

Professor vinculado ou administrador pode criar uma revisão pendente para o aluno.

A revisão manual deve informar duas aulas distintas, ativas e da mesma disciplina no mesmo planejamento, além da etapa e da data prevista. O aluno deve ser derivado do planejamento pelo banco, e planejamentos arquivados não podem receber novas revisões.

## 15. Lista de espera

### RN-LIS-001 — Registro único

Cada aluno pode possuir apenas um registro na lista de espera.

### RN-LIS-002 — Campos obrigatórios

Para entrar na lista de espera, o aluno deve informar:

- WhatsApp;
- área de interesse;
- concurso em foco.

### RN-LIS-003 — Estados

O registro pode estar:

- `aguardando`;
- `contatado`;
- `convertido`;
- `cancelado`.

### RN-LIS-004 — Dados pessoais

Nome e e-mail devem ser lidos do perfil/auth do aluno e não duplicados na lista de espera.

## 16. Permissões do frontend

### RN-PER-001 — Aluno

Aluno pode:

- consultar seus dados, acesso e planejamento;
- consultar suas disciplinas, cadernos, aulas e metas;
- concluir e desfazer suas metas pelas RPCs permitidas;
- agendar, ignorar e cancelar reforço dentro das regras;
- registrar estudo extra;
- atualizar seu progresso em aulas;
- concluir revisões;
- gerenciar seu registro na lista de espera.

Aluno não pode:

- criar metas normais de bloco ou teoria;
- mudar disciplina, semana ou ordem de meta normal;
- editar catálogo;
- liberar o próprio acesso;
- ativar planejamento;
- alterar sua meta percentual.

### RN-PER-002 — Professor

Professor pode, somente para alunos vinculados:

- consultar progresso;
- liberar, renovar, bloquear ou cancelar acesso;
- criar, editar, ativar, pausar, arquivar e excluir planejamentos;
- configurar disciplinas e cadernos;
- gerar e substituir metas;
- agendar reforços;
- criar e configurar revisões;
- acompanhar lista de espera.

### RN-PER-003 — Administrador

Administrador pode:

- gerenciar catálogo;
- criar e encerrar vínculos;
- promover perfis;
- executar operações excepcionais de suporte.

Operações administrativas destrutivas devem ser auditáveis.

## 17. Comportamento esperado do frontend

### RN-FRO-001 — Servidor como fonte da verdade

Depois de salvar, excluir ou alterar um registro, o frontend deve utilizar a resposta do Supabase ou recarregar o registro.

O estado local não deve substituir o estado confirmado pelo banco.

### RN-FRO-002 — Operações otimistas

Atualização otimista é permitida somente quando o frontend consegue restaurar o estado anterior em caso de falha.

### RN-FRO-003 — Operações destrutivas

Exclusão de planejamento, replanejamento completo e limpeza de histórico devem exigir confirmação proporcional ao impacto.

### RN-FRO-004 — Validação duplicada

O frontend deve validar os campos para boa experiência do usuário, mas o banco deve repetir as validações críticas.

### RN-FRO-005 — Chamadas transacionais

Fluxos com várias alterações dependentes devem usar uma RPC transacional, especialmente:

- ativação de planejamento;
- substituição de semana;
- replanejamento completo;
- agendamento de reforço;
- conclusão/desfazer de meta;
- liberação e renovação de acesso.

### RN-FRO-006 — Mensagens de erro

O frontend deve distinguir:

- validação de entrada;
- falta de permissão;
- acesso bloqueado/expirado;
- conflito de unicidade;
- falha de conexão;
- falha interna do servidor.

Não deve apresentar uma falha de constraint como se fosse erro de permissão.

## 18. RPCs esperadas

O frontend deve preferir as seguintes funções do banco:

| Operação | RPC |
|---|---|
| Atualizar o próprio perfil | `atualizar_meu_perfil` |
| Liberar acesso | `liberar_acesso` |
| Renovar acesso | `renovar_acesso` |
| Bloquear acesso | `bloquear_acesso` |
| Cancelar acesso | `cancelar_acesso` |
| Concluir meta | `concluir_meta` |
| Desfazer conclusão | `desfazer_conclusao_meta` |
| Agendar reforço | `agendar_reforco` |
| Cancelar reforço | `cancelar_reforco` |
| Ignorar sugestão de reforço | `ignorar_reforco` |
| Registrar estudo extra | `registrar_estudo_extra` |
| Substituir/replanejar semana | `substituir_metas_semana` |
| Criar revisão | `criar_revisao` |
| Concluir/desfazer revisão | `concluir_revisao` |

## 19. Critérios gerais de integridade

1. IDs devem ser UUIDs gerados pelo banco.
2. Datas de criação e atualização devem ser geradas pelo banco.
3. Exclusões históricas devem preferir arquivamento ou exclusão lógica.
4. Registros filhos devem pertencer ao mesmo planejamento de seus pais.
5. O frontend nunca deve confiar em IDs de professor ou aluno enviados pelo usuário.
6. RLS deve permanecer habilitada em todas as tabelas expostas pela API.
7. Operações de domínio devem falhar por inteiro quando uma etapa dependente falhar.
8. O banco é a fonte definitiva para acesso, meta percentual, estado e permissões.
