# Biblioteca local de Resumos Flash PF 2029

O arquivo pessoal `Resumo PF 2029.docx` alimenta uma biblioteca independente
das aulas: disciplina, tópico e conteúdo original. O leitor renderiza texto,
subtítulos, tabelas e imagens; não interpreta HTML do documento. O DOCX original
também fica no bucket privado para preservar a fonte e sua formatação.

## Importação no Windows

Com Docker e Supabase local ativos, execute na raiz do repositório:

```powershell
python scripts/import-flash-summaries.py "C:\caminho\Resumo PF 2029.docx"
powershell -File scripts/convert-summary-metafiles.ps1
supabase migration up --local
node scripts/load-flash-summaries.mjs "C:\caminho\Resumo PF 2029.docx"
```

Use Python e Node disponíveis na sua máquina. O conteúdo extraído fica em
`content/summaries/local/pf2029`, ignorado pelo Git. O carregador só escreve no
Supabase local; não publica nada no projeto hospedado. Pode ser repetido sem
duplicar tópicos. Tópicos que desaparecem da fonte não são apagados automaticamente.

Os dados ficam em `public.summary_topics` e no bucket privado `flash-summaries`.
Alunos com acesso vigente e professores podem ler; usuários anônimos e alunos
sem acesso não podem ler texto nem assinar URLs de imagens. O catálogo carrega
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
