# Importação do pacote policial — 29/09/2026

Fonte recebida: `PF2029_PACOTE_PRINCIPAL_FLASHCARDS.zip`.
Os Markdown e relatórios originais estão preservados em `FLASHCARDS/` e `AUDITORIAS/`.

- 5.108 cartões, 14 matérias, 101 decks por tópico.
- Informática: 1.175 cartões em nove decks; os links dos decks antigos continuam válidos.
- Os complementos sem classificação no arquivo foram reunidos aos tópicos correspondentes. As faixas de origem estão explícitas no importador.
- Os status de auditoria são declarações dos arquivos recebidos, não uma nova auditoria jurídica ou normativa da plataforma.
- Conteúdo histórico/revogado, pendências de conferência e aplicação futura mantêm seus avisos no leitor.

## Compatibilidade das revisões

Dos 1.128 cartões antigos de Informática, 1.120 conservam exatamente seu ID e deck.
Os outros oito foram consolidados pelo material V2. `previousReviews` relaciona cada referência antiga à equivalente atual, inclusive quando mudou de deck.

O adaptador busca essas referências e usa o estado de memória mais recente. Nenhuma linha antiga de revisão é apagada e a importação não reinicia os intervalos. As respostas seguintes são gravadas na referência atual.

O JSON antigo `pf2029-informatica-flashcards.json` permanece como base de compatibilidade: a carga tira dele os oito cartões consolidados. Desde a spec 39 o site lê o catálogo do banco, e desde a 41 os dois JSON moram aqui em `content/flashcards/` e são só a fonte da carga: a implementação `fixtures` usa uma amostra sintética, e o `dist` não leva cartão nenhum.

## Reprodução e verificação

Na raiz do projeto:

```powershell
node scripts/import-police-flashcards.mjs
node --test scripts/police-flashcards.test.mjs apps/web/src/lib/domain/library-flashcards.test.ts apps/web/src/lib/api/fixtures.test.ts
```

O importador recusa cartões incompletos, IDs duplicados, contagens divergentes e referências antigas sem destino. O relatório `import-report.json` registra a contagem por matéria.

## Banco real

A migração `20260929205400_police_flashcard_decks.sql` amplia os decks aceitos na tabela `library_flashcard_reviews`, preservando as linhas, permissões e políticas de acesso existentes. Ela depende das migrações anteriores de revisões e FSRS. A atualização do código não aplica a migração automaticamente.

Desde 01/10/2026 (spec 38) o conteúdo também vai para o banco: `scripts/load-library-flashcards.mjs` lê o JSON gerado acima e o carrega em `library_flashcards`, numa transação só e sem reescrever o que não mudou. Corrigir frente ou verso mantém o id e a memória dos alunos; mover cartão de deck é recusado, e o caminho é retirar o antigo, criar o novo e registrar o par em `previousReviews`. O deploy roda a carga depois das migrations; localmente, `npm run db:reset`.

Os ZIPs de Vade Mecum e de propostas de arquitetura não fazem parte desta importação.
