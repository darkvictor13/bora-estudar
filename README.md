This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Navegação e sessão

O frontend usa o App Router do Next.js 16 e separa as áreas pública, aluno,
professor e administração. As verificações otimistas de navegação leem o cookie
HTTP-only `be-session`, assinado com HMAC SHA-256. Defina `SESSION_SECRET` com
pelo menos 32 caracteres no ambiente do servidor; sem uma chave válida, o
frontend trata toda requisição como não autenticada.

A autenticação pública usa `@supabase/supabase-js` para login com e-mail e
senha, Google OAuth, cadastro de aluno e recuperação de senha. Depois de validar
o token no Supabase, `POST /api/auth/session` carrega o perfil, o estado do
acesso acadêmico e, para professor, os IDs de alunos com vínculo ativo antes de
emitir o cookie de navegação. Esses dados servem para a experiência de navegação
e não substituem RLS, autorização no banco nem a revalidação dos vínculos antes
de operações ou leituras protegidas.

As credenciais públicas do projeto de referência são usadas como fallback. Para
outro ambiente, defina `NEXT_PUBLIC_SUPABASE_URL` e
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (ou `NEXT_PUBLIC_SUPABASE_ANON_KEY`), além
de `SESSION_SECRET` no servidor.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
