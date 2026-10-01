-- =====================================================================
-- SkanEcom · jeu de démonstration : LES VISITES DE LA VITRINE (migration 53)
-- =====================================================================
-- Maison Selma mesure son audience ; Maymar et la quincaillerie non (le
-- réglage est coupé par défaut). Soixante jours de visites inventées,
-- jusqu'à hier : plus nombreuses le week-end, venues surtout d'Instagram,
-- de Facebook et de Google, sur téléphone pour les trois quarts. Les
-- empreintes sont tirées au hasard (aucune ne correspond à personne).
-- Aujourd'hui reste vide : la vitrine le remplit en vrai.
--
-- Un fichier à part : l'aperçu en ligne joue chaque jeu une fois
-- (supabase/functions/apercu-installer). Rejouable sans dommage.
-- =====================================================================

insert into public.reglages (boutique_id, cle, valeur) values
  ('00000000-0000-4000-8000-000000000003', 'vitrine.statistiques', 'true')
on conflict (boutique_id, cle) do nothing;

do $$
declare
  s constant uuid := '00000000-0000-4000-8000-000000000003';
  aujourd date := (now() at time zone 'Africa/Tunis')::date;
  pages_demo constant text[] := array[
    '/', '/', '/', '/categorie/robes', '/categorie/robes', '/categorie/maille', '/categorie/chemises', '/categorie/homme',
    '/categorie/chaussures-et-sacs', '/catalogue', '/produit/robe-bretelles-terracotta', '/produit/robe-bretelles-terracotta',
    '/produit/robe-longue-boheme', '/produit/robe-midi-jersey', '/produit/robe-chemise-vichy', '/produit/sac-voyage-cuir',
    '/produit/sac-voyage-cuir', '/produit/chemise-lin-ample', '/produit/blazer-laine-froide', '/produit/pull-merinos',
    '/produit/derbies-cuir', '/produit/robe-a-pois', '/recherche', '/commande', '/a-propos', '/contact'];
  entrees_demo constant text[] := array[
    '/', '/', '/', '/', '/categorie/robes', '/produit/robe-bretelles-terracotta', '/produit/robe-bretelles-terracotta',
    '/produit/sac-voyage-cuir', '/produit/robe-longue-boheme', '/categorie/maille', '/produit/blazer-laine-froide'];
  d integer;
  v_jour date;
  n integer;
  i integer;
  k integer;
  tirage double precision;
  v_source text;
  v_appareil text;
  v_pages integer;
  v_entree text;
begin
  if exists (select 1 from public.vitrine_visites where boutique_id = s) then
    return;
  end if;
  perform setseed(0.42);
  for d in 1..60 loop
    v_jour := aujourd - d;
    -- Une boutique qui grandit, plus visitée le week-end.
    n := 30 + floor((60 - d) * 0.8)::integer + case when extract(isodow from v_jour) in (6, 7) then 22 else 0 end + floor(random() * 24)::integer;
    for i in 1..n loop
      tirage := random();
      v_source := case when tirage < 0.34 then null when tirage < 0.60 then 'instagram.com' when tirage < 0.75 then 'facebook.com'
                       when tirage < 0.90 then 'google.com' when tirage < 0.96 then 'tiktok.com' else 'linktr.ee' end;
      tirage := random();
      v_appareil := case when tirage < 0.73 then 'telephone' when tirage < 0.94 then 'ordinateur' else 'tablette' end;
      v_pages := 1 + floor(random() * random() * 7)::integer;
      v_entree := entrees_demo[1 + floor(random() * array_length(entrees_demo, 1))::integer];
      insert into public.vitrine_visites (boutique_id, jour, empreinte, entree, source, appareil, pages)
      values (s, v_jour, decode(md5(random()::text || clock_timestamp()::text), 'hex'), v_entree, v_source, v_appareil, v_pages);
      insert into public.vitrine_pages as x (boutique_id, jour, chemin) values (s, v_jour, v_entree)
      on conflict (boutique_id, jour, chemin) do update set vues = x.vues + 1;
      for k in 2..v_pages loop
        insert into public.vitrine_pages as x (boutique_id, jour, chemin)
        values (s, v_jour, pages_demo[1 + floor(random() * array_length(pages_demo, 1))::integer])
        on conflict (boutique_id, jour, chemin) do update set vues = x.vues + 1;
      end loop;
    end loop;
  end loop;
end
$$;
