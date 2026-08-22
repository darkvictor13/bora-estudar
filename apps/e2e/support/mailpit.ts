/**
 * Caixa de entrada local (Mailpit), para o fluxo de recuperação de senha.
 *
 * É a única parte do produto que sai do site: o link chega por e-mail, e sem
 * ler o e-mail de verdade o teste do F-AUTH-10 provaria apenas que a tela diz
 * "enviamos um link" — que é exatamente o que ela dizia quando o link estava
 * quebrado (BUG-02).
 */
const MAILPIT_URL = process.env["E2E_MAILPIT_URL"] ?? "http://127.0.0.1:54324";

interface MessageSummary {
  readonly ID: string;
  readonly Created: string;
  readonly Subject: string;
  readonly To: readonly { readonly Address: string }[];
}

interface Message {
  readonly Text: string;
  readonly HTML: string;
}

async function json<T>(path: string): Promise<T> {
  const response = await fetch(`${MAILPIT_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Mailpit respondeu ${response.status} em ${path}. O stack local está no ar?`);
  }
  return (await response.json()) as T;
}

/** Descarta tudo, para o teste não achar o e-mail de uma execução anterior. */
export async function clearMailbox(): Promise<void> {
  const response = await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: "DELETE" });
  if (!response.ok) throw new Error(`não foi possível limpar o Mailpit: ${response.status}`);
}

/**
 * Espera o e-mail mais recente endereçado a alguém.
 *
 * O envio do GoTrue é assíncrono: a action já respondeu quando a mensagem
 * ainda está a caminho. Daí a sondagem em vez de uma leitura única.
 */
export async function waitForEmail(
  to: string,
  { timeout = 15_000, interval = 250 } = {},
): Promise<Message & { subject: string }> {
  const deadline = Date.now() + timeout;

  for (;;) {
    const { messages } = await json<{ messages: readonly MessageSummary[] }>(
      "/api/v1/messages?limit=50",
    );
    const found = messages
      .filter((message) => message.To.some((recipient) => recipient.Address === to))
      .sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0];

    if (found) {
      const body = await json<Message>(`/api/v1/message/${found.ID}`);
      return { ...body, subject: found.Subject };
    }

    if (Date.now() >= deadline) throw new Error(`nenhum e-mail para ${to} em ${timeout} ms`);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/**
 * O link que a pessoa clicaria.
 *
 * Não é um link para o site: é o `/auth/v1/verify` do GoTrue, no host do
 * Supabase, que consome o token e só então redireciona para o `redirect_to`.
 * Procurar direto pelo host da aplicação não acha nada — e pular o verify
 * deixaria o token sem ser consumido, que é justamente o passo que o BUG-02
 * tinha quebrado.
 *
 * O `&amp;` do HTML precisa ser desfeito, senão o `redirect_to` chega
 * truncado no primeiro parâmetro.
 */
export function actionLink(body: Message, baseURL: string): string {
  const host = new URL(baseURL).host;
  const source = `${body.HTML}\n${body.Text}`;
  const links = [...source.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((match) =>
    match[0].replace(/&amp;/g, "&"),
  );

  const leadsToApp = (link: string): boolean => {
    try {
      const url = new URL(link);
      if (url.host === host) return true;
      const target = url.searchParams.get("redirect_to");
      return !!target && new URL(target).host === host;
    } catch {
      return false;
    }
  };

  const found = links.find(leadsToApp);
  if (!found) {
    throw new Error(
      `nenhum link levando a ${host} no e-mail. Links encontrados: ${links.join(", ") || "nenhum"}`,
    );
  }
  return found;
}
