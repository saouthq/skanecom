-- =====================================================================
-- SkanEcom · jeu de démonstration : L'OBJECTIF DU MOIS (migration 57)
-- =====================================================================
-- Maison Selma s'est fixé un objectif chaque mois depuis six mois — tenu
-- un mois sur deux (visé un peu sous le livré, puis un peu au-dessus) — et
-- celui du mois en cours : le livré du mois dernier, plus dix pour cent,
-- arrondi à la centaine de dinars. Maymar et la quincaillerie n'en ont pas.
--
-- Un fichier à part : l'aperçu en ligne joue chaque jeu une fois
-- (supabase/functions/apercu-installer). Rejouable sans dommage.
-- =====================================================================

do $$
declare
  b      constant uuid := '00000000-0000-4000-8000-000000000003';
  v_mois constant date := date_trunc('month', (now() at time zone 'Africa/Tunis'))::date;
  m      date;
  n      integer;
  v_livre bigint;
begin
  for n in 1 .. 6 loop
    m := (v_mois - make_interval(months => n))::date;
    v_livre := private.livre_du_mois(b, m);
    if v_livre > 0 then
      insert into public.objectifs_mois (boutique_id, mois, montant_millimes, fixe_le)
      values (b, m, greatest(100000, round(v_livre * case when n % 2 = 0 then 0.9 else 1.2 end / 100000) * 100000)::bigint,
              (m::timestamp at time zone 'Africa/Tunis'))
      on conflict (boutique_id, mois) do nothing;
    end if;
  end loop;
  v_livre := private.livre_du_mois(b, (v_mois - interval '1 month')::date);
  insert into public.objectifs_mois (boutique_id, mois, montant_millimes)
  values (b, v_mois, greatest(500000, ceil(v_livre * 1.1 / 100000) * 100000)::bigint)
  on conflict (boutique_id, mois) do nothing;
end;
$$;
