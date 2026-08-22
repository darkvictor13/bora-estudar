import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Página de diagnóstico da arquitetura.
 *
 * Existe para provar, sem depender de login, que o app alcança o Supabase e
 * que a RLS está ligada: sem sessão, o catálogo (leitura liberada para
 * autenticado) responde vazio ou nega. Será substituída pela landing real.
 */
export default async function Home() {
  const supabase = await criarClienteServidor();

  // Sem `head: true`: uma resposta sem corpo faz o supabase-js montar um erro
  // com code e message vazios, e o diagnóstico não diria nada.
  const [{ data: blocos, error: erroBlocos }, { data: { user } }] = await Promise.all([
    supabase.from("catalogo_blocos").select("id,nome"),
    supabase.auth.getUser(),
  ]);

  return (
    <main style={{ fontFamily: "var(--font-geist-sans)", padding: "3rem", lineHeight: 1.7 }}>
      <h1>Bora Estudar</h1>
      <p>Monorepo montado. Frontend, extensão e Supabase no mesmo repositório.</p>

      <h2>Diagnóstico</h2>
      <ul>
        <li>
          Sessão: <strong>{user ? user.email : "anônima"}</strong>
        </li>
        <li>
          Catálogo:{" "}
          <strong>
            {erroBlocos
              ? `sem acesso — ${erroBlocos.code}: ${erroBlocos.message}`
              : `${blocos?.length ?? 0} bloco(s) visíveis`}
          </strong>
        </li>
      </ul>
      <p>
        Sem sessão o catálogo deve aparecer bloqueado ou vazio. É a RLS
        funcionando, não um defeito.
      </p>
    </main>
  );
}
