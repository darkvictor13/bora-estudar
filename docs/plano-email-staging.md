# Plano — e-mail de staging

Objetivo: staging entregar e-mail de verdade (recuperação de senha) para
qualquer endereço. Hoje o remetente embutido do Supabase só entrega para
membros da org, 2 por hora. Upgrade do Supabase não resolve: precisa de
domínio próprio e SMTP de um provedor (Resend).

## 1. Domínio

- [ ] Resolver a marca antes de comprar. "Bora Estudar!" é marca registrada
      no INPI na classe 41 (educação), em vigor até 05/11/2029, em nome de
      Israel Matos Batista (processo 916779033).
- [ ] Comprar um `.com.br` no Registro.br (R$ 40/ano). O preferido,
      `bora-estudar-concursos.com.br`, está em processo de liberação (não dá
      para comprar direto). Livres em 06/10/2026: `bora-estudar-concurso`,
      `concursos-bora-estudar`, `vem-bora-estudar-concursos`.
- [ ] Trocar os nameservers para o Cloudflare, na conta do Worker.

Um domínio para tudo: a raiz é a página de vendas, `app.` é produção,
`staging.` é staging e `mail.` é o envio de e-mail.

## 2. Resend

- [ ] Criar a conta.
- [ ] Adicionar o domínio de envio `mail.<dominio>` e usar a configuração
      automática de DNS pelo Cloudflare.
- [ ] Criar o TXT `_dmarc.<dominio>` com `v=DMARC1; p=none`.
- [ ] Esperar o domínio ficar "Verified".
- [ ] Criar uma API key com permissão **só de envio**, restrita ao domínio.
      Guardar no gerenciador de senhas — nunca no repositório.

## 3. Supabase

- [ ] Acrescentar em `supabase/config.toml`:

```toml
[remotes.staging.auth.email]
max_frequency = "60s"

[remotes.staging.auth.email.smtp]
enabled = true
host = "smtp.resend.com"
port = 465
user = "resend"
pass = "env(STAGING_SMTP_PASSWORD)"
admin_email = "nao-responda@mail.<dominio>"
sender_name = "Bora Estudar (staging)"

[remotes.staging.auth.rate_limit]
email_sent = 30
```

- [ ] Empurrar à mão, **sem `--yes`**, e ler o diff do prompt antes de
      confirmar:

```bash
export STAGING_SMTP_PASSWORD='<api-key-do-resend>'
npx supabase config push --project-ref gumvfizrjexbygrbceei
```

## 4. Conferir em staging

- [ ] `/recuperar-senha` com o seu e-mail: chega em português, o link abre
      `/redefinir-senha` e a senha troca.
- [ ] No Gmail, "Mostrar original": SPF e DKIM com `PASS`.
- [ ] Três pedidos seguidos passam (o limite de 2/hora saiu).

Teste com `voce+t1@gmail.com`, `voce+t2@…` — nunca com endereço inventado:
bounce derruba a reputação da conta no Resend.

## 5. Depois

- [ ] Atualizar o parágrafo dos "2 por hora" em `docs/deploy-staging.md`.
- [ ] (Opcional) Ligar a confirmação de cadastro — é mudança da spec 01, e o
      código vai ao ar antes da config.
- [ ] Produção: o plano grátis do Resend aceita um domínio só; decidir quando
      produção existir.
