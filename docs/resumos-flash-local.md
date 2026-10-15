# Biblioteca local de Resumos Flash PF 2029

O arquivo pessoal `Resumo PF 2029.docx` alimenta uma biblioteca independente
das aulas: disciplina, tópico e conteúdo original. O leitor renderiza texto,
subtítulos, tabelas e imagens; não interpreta HTML do documento. O DOCX original
também fica no bucket privado para preservar a fonte e sua formatação.

## Importação

Com Docker e Supabase local ativos (`npm run db:start`), execute na raiz do
repositório. Funciona em Linux, macOS e Windows; o carregador usa o CLI do
`node_modules` e lê as credenciais de `supabase status`.

```bash
node scripts/import-flash-summaries.mjs "/caminho/Resumo PF 2029.docx"
npx supabase migration up --local
node scripts/load-flash-summaries.mjs "/caminho/Resumo PF 2029.docx"
```

No Windows, entre o primeiro e o terceiro passo, converta as ilustrações EMF do
Word em PNG (no Linux e no macOS não há conversor: elas são ignoradas):

```powershell
powershell -File scripts/convert-summary-metafiles.ps1
```

Use o Node (24) disponível na sua máquina. O importador reconhece os
títulos pelo nome do estilo do Word (`Título 1`, `Heading 1`…), mantém tabelas
dentro de tabelas, e recusa DOCX com DTD/entidades XML ou partes que
descomprimem além do teto. O conteúdo extraído fica em
`content/summaries/local/pf2029`, ignorado pelo Git. O carregador só escreve no
Supabase local; não publica nada no projeto hospedado. Pode ser repetido sem
duplicar tópicos. Tópicos que desaparecem da fonte não são apagados automaticamente.

Os dados ficam em `public.summary_topics` e no bucket privado `flash-summaries`.
Alunos com acesso vigente e professores podem ler o texto; usuários anônimos e
alunos sem acesso não podem ler texto nem assinar URLs de imagens. **O DOCX
original fica guardado no bucket mas não é legível por nenhum usuário do site**:
a policy só libera `pf2029/<sha256>.<imagem>`, e o bucket só aceita PNG, JPEG e
DOCX. Ambiente sem a carga mostra a biblioteca vazia, com uma frase que diz isso. O catálogo carrega
só títulos; o conteúdo e as URLs com validade de uma hora são lidos ao abrir
um tópico. Recarregar o tópico renova as URLs.

## Persistência

Os containers usam os volumes gerenciados pelo Supabase. Reiniciar Docker ou
parar/iniciar o stack preserva os dados. `db reset`, remoção de volumes e
`supabase stop --no-backup` exigem reimportação. Esta carga pessoal é manual,
pois o arquivo original não é distribuído no repositório.

O texto é uma importação do material recebido, sem revisão de atualização
jurídica ou transformação automática em resumos menores. Formatação rica de
Word (cores, grifos, fontes) permanece no original, enquanto o leitor usa o tema
do site. Imagens EMF são convertidas para PNG para abrir no navegador.
