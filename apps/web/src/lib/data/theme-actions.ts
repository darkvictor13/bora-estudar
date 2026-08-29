import { supabase } from "@/lib/supabase/client";
import type { Theme } from "@/lib/theme";

/**
 * Grava a preferência na conta. Devolve a mensagem de erro, ou `null`.
 *
 * **Não é `upsert`, e isso foi medido.** O `upsert` do PostgREST
 * (`Prefer: resolution=merge-duplicates`) exige `UPDATE` na TABELA inteira, e o
 * grant desta tabela cobre só a coluna `theme` — `profile_id` fica de fora de
 * propósito, para ninguém mover a linha para outro perfil. Contra o Supabase
 * local, o upsert devolve `42501 permission denied for table user_preferences`
 * mesmo quando a linha ainda não existe. UPDATE primeiro, INSERT se não houver
 * linha: os dois passam pelo grant como ele é.
 */
export async function saveTheme(profileId: string, theme: Theme): Promise<string | null> {
  const { error, count } = await supabase
    .from("user_preferences")
    .update({ theme }, { count: "exact" })
    .eq("profile_id", profileId);

  if (error) return error.message;
  if (count !== null && count > 0) return null;

  const { error: insertError } = await supabase
    .from("user_preferences")
    .insert({ profile_id: profileId, theme });

  // Duas abas trocando o tema no mesmo instante: a segunda encontra a linha que
  // a primeira acabou de criar. É corrida, não falha — o UPDATE agora acha.
  if (insertError?.code === "23505") {
    const { error: retry } = await supabase
      .from("user_preferences")
      .update({ theme })
      .eq("profile_id", profileId);
    return retry?.message ?? null;
  }

  return insertError?.message ?? null;
}
