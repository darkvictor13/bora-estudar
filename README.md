# Bora Estudar

Aplicação web em Next.js 16 com autenticação, banco de dados e APIs fornecidos
pelo Supabase.

## Pré-requisitos

Antes de começar, instale e inicie:

- [Node.js](https://nodejs.org/) 20.9 ou superior;
- npm;
- [Docker Desktop](https://www.docker.com/products/docker-desktop/).

## Executar o projeto localmente

Execute os comandos abaixo na raiz do repositório.

### 1. Instale as dependências

```bash
npm ci
```

### 2. Inicie o backend Supabase

Confirme que o Docker Desktop está em execução e rode:

```bash
npx supabase start
```

Na primeira execução, a CLI pode levar alguns minutos para baixar as imagens do
Docker e preparar o banco. As migrations em `supabase/migrations/` são aplicadas
automaticamente ao criar o ambiente local.

Consulte as URLs e credenciais geradas para o ambiente local com:

```bash
npx supabase status
```

### 3. Configure as variáveis de ambiente

Crie um arquivo `.env.local` na raiz do projeto:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY>
SESSION_SECRET=<SESSION_SECRET>
```

Substitua `PUBLISHABLE_KEY` pelo valor exibido no resultado de
`npx supabase status`.

Para gerar um valor seguro para `SESSION_SECRET`, execute:

```bash
openssl rand -base64 32
```

Copie o valor retornado para o `.env.local`. Esse arquivo é ignorado pelo Git e
não deve ser versionado.

Se o ambiente fornecer apenas uma chave anônima, use
`NEXT_PUBLIC_SUPABASE_ANON_KEY` no lugar de
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

### 4. Inicie o frontend

```bash
npm run dev
```

Acesse os serviços no navegador:

- aplicação: [http://localhost:3000](http://localhost:3000);
- Supabase Studio: [http://localhost:54323](http://localhost:54323);
- API do Supabase: [http://localhost:54321](http://localhost:54321);
- caixa de e-mails local: [http://localhost:54324](http://localhost:54324).

## Encerrar o ambiente

Interrompa o frontend com `Ctrl+C` no terminal em que ele está sendo executado.
Depois, pare o backend preservando os dados locais:

```bash
npx supabase stop
```

Evite a opção `--no-backup`, pois ela remove os volumes e os dados locais.

## Comandos úteis

```bash
npm run lint       # Verifica o código com ESLint
npm run typecheck  # Verifica os tipos TypeScript
npm test           # Executa os testes automatizados
npm run build      # Gera a build de produção
```

Para executar a build de produção depois de gerá-la:

```bash
npm start
```

## Navegação e sessão

O frontend usa o App Router do Next.js 16 e separa as áreas pública, aluno,
professor e administração. As verificações otimistas de navegação leem o cookie
HTTP-only `be-session`, assinado com HMAC SHA-256. Sem uma `SESSION_SECRET`
válida, o frontend trata toda requisição como não autenticada.

A autenticação pública usa `@supabase/supabase-js` para login com e-mail e
senha, Google OAuth, cadastro de aluno e recuperação de senha. Depois de validar
o token no Supabase, `POST /api/auth/session` carrega o perfil, o estado do
acesso acadêmico e, para professor, os IDs de alunos com vínculo ativo antes de
emitir o cookie de navegação. Esses dados servem para a experiência de navegação
e não substituem RLS, autorização no banco nem a revalidação dos vínculos antes
de operações ou leituras protegidas.
