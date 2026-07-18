<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Backend e acesso a dados

Foi tomada a decisão arquitetural de usar o Supabase como backend do projeto.

Sempre que for necessário buscar, criar, atualizar ou remover dados, ou realizar chamadas de API relacionadas ao backend, use o SDK oficial do Supabase. Não implemente integrações paralelas por chamadas HTTP diretas quando a operação estiver disponível pelo SDK.
