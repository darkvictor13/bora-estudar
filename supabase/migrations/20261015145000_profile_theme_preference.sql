-- A preferência de tema volta a morar na CONTA (spec 11, R-TEMA-19 a 22).
--
-- `user_preferences` saiu do schema de 14/09/2026 e nada a substituiu: durante
-- um mês a escolha valeu só por aparelho, e quem escolhia escuro no computador
-- via claro no celular. Uma coluna em `profiles` basta — preferência de
-- interface não tem relacionamento, não tem máquina de estados e não é execução.
--
-- ENUM, e não `text`: tipo e flag são enum ou FK. Dois valores, sem "seguir o
-- sistema" (R-TEMA-06).
--
-- NULÁVEL E SEM DEFAULT, de propósito: `null` é "nunca escolheu". A ausência
-- equivale a claro, mas gravar `light` na primeira visita transformaria toda
-- abertura numa escolha que ninguém fez. Compatível com o bundle que já está
-- no ar: nenhum código lê a coluna.
--
-- A ESCRITA é direta pelo dono, com o mesmo grant por coluna que protege o resto
-- de `profiles`: `UPDATE (theme_preference)` além do `UPDATE (name)` que já
-- existia. `role`, `teacher_id` e o acesso continuam fora de todo grant, e a
-- policy `profiles_update_own` segue decidindo QUAL LINHA. O gatilho
-- `protect_profile_admin_fields` não precisa saber da coluna.
create type public.theme_preference as enum ('light', 'dark');

alter table public.profiles add column theme_preference public.theme_preference;

grant update (theme_preference) on public.profiles to authenticated;

comment on column public.profiles.theme_preference is
  'Tema escolhido pela pessoa. Nulo = nunca escolheu (equivale a claro).';
