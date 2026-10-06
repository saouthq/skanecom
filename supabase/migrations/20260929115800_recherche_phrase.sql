-- =====================================================================
-- LA RECHERCHE EN PHRASE — un réglage de la vitrine (coupé par défaut).
--
-- « valise cabine noire à moins de 200 dinars » : la vitrine en tire le
-- rayon, la taille, la couleur, la borne de prix (« en stock » aussi), les
-- montre comme compris, et cherche le reste en texte
-- (application/src/lib/recherche-phrase.ts). Sans le réglage, la recherche
-- cherche la phrase mot pour mot, comme avant.
--
-- Aucun modèle de langue : ce qui est compris vient des rayons et des
-- déclinaisons de la boutique elle-même ; rien n'est inventé, rien ne sort.
-- =====================================================================

insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('catalogue.recherche_phrase', 'booleen', null, 'false', 'catalogue', null, true,
   'Recherche en phrase',
   'Oui = la recherche comprend une phrase comme « valise cabine noire à moins de 200 dinars » : le rayon, la taille, la couleur et le prix deviennent des filtres. Non = elle cherche les mots tels quels.', 35);

insert into plateforme.droits (code, genre, reglage, module, groupe, libelle_fr, description_fr, position) values
  ('catalogue.recherche_phrase', 'reglage', 'catalogue.recherche_phrase', null, 'vendre', 'Recherche en phrase',
   'Le rayon, la taille, la couleur et le prix compris dans une phrase.', 80)
on conflict do nothing;

insert into plateforme.formule_droits (formule, droit)
select f, 'catalogue.recherche_phrase' from unnest(array['pro', 'complete']) f
where exists (select 1 from plateforme.formules x where x.code = f)
on conflict do nothing;
