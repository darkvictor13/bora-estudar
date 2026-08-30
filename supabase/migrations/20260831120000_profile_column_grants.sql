-- Grant por coluna em profiles — spec docs/specs/27-dados-do-professor.md
--
-- `grant select, insert, update on public.profiles to authenticated` concedia
-- TODAS as colunas. A tela de conta diz "Para trocar o e-mail, fale com o
-- professor", e nada na fronteira sustentava a frase: `contact_email` estava
-- concedido, e a promessa era só convenção de tela.
--
-- `role` já era protegido pelo `with check` de `profiles_update_own`, que
-- compara o papel novo com o atual. Fica protegido pelas duas coisas — é o que
-- study_plan_blocks faz, e por bom motivo: um grant esquecido numa migration
-- futura não reabre o buraco sozinho.
--
-- Compatível com o bundle no ar: o único caminho que escreve em `profiles` é
-- `updateProfile`, e ele escreve exatamente `name` e `phone`.

revoke update on public.profiles from authenticated;

grant update (name, phone, updated_at) on public.profiles to authenticated;

comment on column public.profiles.contact_email is
  'E-mail de contato, copiado de auth.users na criação. Fora do grant update: trocar e-mail exige fluxo de confirmação que o produto não tem.';
