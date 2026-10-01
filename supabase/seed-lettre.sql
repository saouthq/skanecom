-- =====================================================================
-- SkanEcom · jeu de démonstration : LE PIED DE PAGE ENRICHI (migration 55)
-- =====================================================================
-- Maison Selma a une lettre d'information : son accroche, trente-huit
-- inscrits sur douze semaines (de plus en plus nombreux), trois demandes
-- pas encore confirmées, quatre départs (adresses effacées). Adresses
-- inventées (exemple.tn). La quincaillerie dit qui livre ses colis.
-- Maymar : ni l'un ni l'autre (réglages coupés par défaut).
--
-- Un fichier à part : l'aperçu en ligne joue chaque jeu une fois
-- (supabase/functions/apercu-installer). Rejouable sans dommage.
-- =====================================================================

insert into public.reglages (boutique_id, cle, valeur) values
  ('00000000-0000-4000-8000-000000000003', 'vitrine.lettre', 'true'),
  ('00000000-0000-4000-8000-000000000003', 'vitrine.lettre_accroche',
     to_jsonb('Les nouvelles pièces et les retours en stock, une lettre par mois — jamais plus.'::text)),
  ('00000000-0000-4000-8000-000000000002', 'livraison.transporteur', to_jsonb('Aramex'::text))
on conflict (boutique_id, cle) do nothing;

do $$
declare
  b       constant uuid := '00000000-0000-4000-8000-000000000003';
  prenoms constant text[] := array[
    'amira', 'yassine', 'salma', 'mehdi', 'ines', 'karim', 'nour', 'sami', 'rania', 'walid',
    'hiba', 'omar', 'emna', 'fares', 'lina', 'aziz', 'sarra', 'anis', 'maha', 'bilel',
    'yosra', 'hamza', 'molka', 'skander', 'asma', 'nizar', 'ons', 'ghassen', 'dorra', 'rami',
    'imen', 'zied', 'chaima', 'khalil', 'meriem', 'firas', 'nesrine', 'achraf'];
  pages   constant text[] := array['/', '/produit/robe-bretelles-terracotta', '/categorie/robes', '/', '/produit/sac-voyage-cuir', '/catalogue'];
  texte   constant text := 'J''accepte de recevoir la lettre de Maison Selma par e-mail. Je peux me désinscrire à tout moment, d''un clic.';
  i       integer;
  v_jours numeric;
  v_le    timestamptz;
begin
  if exists (select 1 from public.lettre_abonnes where boutique_id = b) then
    return;
  end if;
  for i in 1 .. array_length(prenoms, 1) loop
    -- Un tirage sans hasard (la suite de Weyl du nombre d'or), tassé vers
    -- aujourd'hui : la lettre prend, semaine après semaine.
    v_jours := 1 + 82 * power((i * 0.6180339887) - floor(i * 0.6180339887), 1.7);
    v_le := now() - make_interval(days => floor(v_jours)::integer, hours => (i * 7) % 11, mins => (i * 13) % 60);
    insert into public.lettre_abonnes (boutique_id, email, statut, jeton_hash, consentement, page, demande_le, inscrit_le)
    values (b, prenoms[i] || '.' || (100 + i * 17) || '@exemple.tn', 'inscrit',
            sha256(convert_to(gen_random_uuid()::text, 'UTF8')), texte, pages[1 + i % array_length(pages, 1)],
            v_le - interval '6 minutes', v_le);
  end loop;
  -- Pas encore confirmées.
  insert into public.lettre_abonnes (boutique_id, email, statut, jeton_hash, consentement, page, demande_le)
  select b, x || '@exemple.tn', 'a_confirmer', sha256(convert_to(gen_random_uuid()::text, 'UTF8')), texte, '/',
         now() - make_interval(hours => n::integer * 9)
    from unnest(array['jihene.204', 'wassim.371', 'kenza.418']) with ordinality as t(x, n);
  -- Partis : la date reste, l'adresse est effacée.
  insert into public.lettre_abonnes (boutique_id, statut, consentement, page, demande_le, inscrit_le, desinscrit_le, desinscrit_par)
  select b, 'desinscrit', texte, '/', now() - make_interval(days => 40 + n * 6), now() - make_interval(days => 40 + n * 6),
         now() - make_interval(days => n * 9), case when n = 4 then 'equipe' else 'abonne' end
    from generate_series(1, 4) n;
end;
$$;
