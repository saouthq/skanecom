-- =====================================================================
-- SkanEcom — 77 · UN AXE ET UNE CARACTÉRISTIQUE DE MÊME NOM, UN SEUL FILTRE
-- =====================================================================
--
-- Chez Yasmine Beauté, la contenance est une caractéristique (un nombre,
-- en ml : la crème de 30 ml) et, pour les pièces vendues en plusieurs
-- formats, un axe de variante (le parfum en 50 et 100 ml). Les filtres du
-- catalogue les réunissent sous la même clé (migration 28) ; mais l'axe
-- s'écrit comme on le lit, « 50 ml », et la caractéristique comme un
-- nombre, « 50 ». Le tiroir de filtres montrait donc « 50 ml » (la
-- caractéristique, son unité ajoutée) ET « 50 ml ml » (l'axe, l'unité
-- ajoutée une seconde fois), deux cases pour la même contenance.
--
-- La valeur d'un tel axe est maintenant lue comme celle de la
-- caractéristique — la règle de public.gestion_enregistrer_caracteristiques :
-- l'unité saisie par habitude ôtée, un nombre écrit 2,5 ou 2.5. Une valeur
-- qui n'est pas un nombre reste telle quelle. La règle est écrite dans la
-- requête : la fonction tourne sous les droits du visiteur, qui n'exécute
-- rien de private (01_structure.sql). La fiche, le panier et la
-- commande gardent la valeur de la déclinaison (« 50 ml ») : seuls les
-- filtres et leurs comptes la lisent ainsi.
-- =====================================================================

create or replace function public.liste_produits(
  p_boutique_id uuid,
  p_filtres     jsonb   default '{}'::jsonb,
  p_tri         text    default 'nouveautes',
  p_page        integer default 1,
  p_par_page    integer default 24
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_options  jsonb   := coalesce(p_filtres -> 'options', '{}'::jsonb);
  v_en_stock boolean := coalesce((p_filtres ->> 'en_stock')::boolean, false);
  v_min      bigint  := (p_filtres ->> 'prix_min')::bigint;
  v_max      bigint  := (p_filtres ->> 'prix_max')::bigint;
  v_rayon    text    := nullif(btrim(p_filtres ->> 'rayon'), '');
  v_q        text    := nullif(left(btrim(coalesce(p_filtres ->> 'q', '')), 80), '');
  v_tri      text    := case when p_tri in ('nouveautes', 'selection', 'prix-asc', 'prix-desc', 'nom', 'pertinence')
                             then p_tri else 'nouveautes' end;
  v_par_page integer := least(greatest(coalesce(p_par_page, 24), 1), 100);
  v_page     integer := greatest(coalesce(p_page, 1), 1);
  v_motif    text;
  v_resultat jsonb;
begin
  if jsonb_typeof(v_options) <> 'object' then
    raise exception 'filtres.options : un objet {"axe": ["valeur", …]} est attendu'
      using errcode = 'invalid_parameter_value';
  end if;
  -- Une valeur seule vaut une liste d'une valeur.
  select coalesce(jsonb_object_agg(e.key, case jsonb_typeof(e.value) when 'array' then e.value
                                                                      else jsonb_build_array(e.value) end), '{}'::jsonb)
    into v_options
    from jsonb_each(v_options) e;
  -- Les jokers de LIKE saisis par le visiteur sont pris au pied de la lettre.
  v_motif := case when v_q is null then null
                  else '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;

  with recursive
  rayon as (
    select c.id from public.categories c
     where c.boutique_id = p_boutique_id and c.slug = v_rayon and c.actif
    union
    select c.id from public.categories c join rayon r on c.parent_id = r.id
     where c.boutique_id = p_boutique_id and c.actif
  ),
  filtrables as (
    select a.cle, a.label_fr, a.label_ar, a.unite, a.type, a.position
      from public.attributs a
     where a.boutique_id = p_boutique_id and a.filtrable
  ),
  produits_q as (
    select p.id, p.categorie_id, p.created_at, p.position, p.mis_en_avant,
           lower(coalesce(p.nom_fr, p.nom_ar)) as nom,
           coalesce((select jsonb_object_agg(f.cle, p.caracteristiques -> f.cle)
                       from filtrables f where p.caracteristiques ? f.cle), '{}'::jsonb) as herite,
           case when v_q is null then 0::real
                else greatest(
                       extensions.similarity(coalesce(p.nom_fr, '') || ' ' || coalesce(p.nom_ar, ''), v_q),
                       case when exists (select 1 from public.variantes v
                                          where v.boutique_id = p.boutique_id and v.produit_id = p.id
                                            and v.actif and v.sku ilike v_motif) then 1 else 0 end)
           end as pertinence
      from public.produits p
     where p.boutique_id = p_boutique_id and p.publie
       and (v_q is null
            or (coalesce(p.nom_fr, '') || ' ' || coalesce(p.nom_ar, '')) ilike v_motif
            or (coalesce(p.nom_fr, '') || ' ' || coalesce(p.nom_ar, '')) operator(extensions.%) v_q
            or to_tsvector('french', coalesce(p.nom_fr, '') || ' ' || coalesce(p.marque, '') || ' ' || coalesce(p.description_fr, ''))
               @@ websearch_to_tsquery('french', v_q)
            or exists (select 1 from jsonb_each_text(p.caracteristiques) c where c.value ilike v_motif)
            or exists (select 1 from public.variantes v
                        where v.boutique_id = p.boutique_id and v.produit_id = p.id
                          and v.actif and v.sku ilike v_motif))
  ),
  dans_rayon as (
    select * from produits_q where v_rayon is null or categorie_id in (select id from rayon)
  ),
  -- Un axe de variante qui porte le nom d'une caractéristique filtrable
  -- (la contenance d'un parfum en 50 et 100 ml, celle d'une crème en
  -- caractéristique) : sa valeur est lue comme la caractéristique — « 50 ml »
  -- devient « 50 » —, pour une seule liste de valeurs, et un seul filtre.
  variantes_q as (
    select v.produit_id,
           pq.herite || coalesce((
             select jsonb_object_agg(o.key, case when f.type = 'nombre' and n.v ~ '^-?[0-9]{1,9}(\.[0-9]{1,4})?$'
                                                 then n.v else o.value end)
               from jsonb_each_text(v.options) o
               left join filtrables f on f.cle = o.key
              cross join lateral (
                select replace(replace(btrim(regexp_replace(regexp_replace(btrim(o.value), '\s+', ' ', 'g'),
                         '\s*' || regexp_replace(coalesce(f.unite, ''), '([^[:alnum:]])', '\\\1', 'g') || '$', '', 'i')),
                         ' ', ''), ',', '.') as v) n), '{}'::jsonb) as options,
           v.prix_millimes, v.position,
           (not v_en_stock or v.stock > 0)
           and (v_min is null or v.prix_millimes >= v_min)
           and (v_max is null or v.prix_millimes <= v_max) as ok_base
      from public.variantes v
      join produits_q pq on pq.id = v.produit_id
     where v.boutique_id = p_boutique_id and v.actif
  ),
  -- Produits retenus par les critères de variante, rayon non compris (il
  -- sert à la facette des rayons).
  retenus_tous as (
    select distinct vq.produit_id
      from variantes_q vq
     where vq.ok_base
       and not exists (select 1 from jsonb_each(v_options) f
                        where not coalesce(f.value ? (vq.options ->> f.key), false))
  ),
  retenus as (
    select d.* from dans_rayon d where d.id in (select produit_id from retenus_tous)
  ),
  ordonnes as (
    select r.id,
           row_number() over (order by
             case when v_tri = 'selection'  then r.mis_en_avant end desc nulls last,
             case when v_tri = 'prix-asc'   then pp.prix end asc  nulls last,
             case when v_tri = 'prix-desc'  then pp.prix end desc nulls last,
             case when v_tri = 'nom'        then r.nom end asc,
             case when v_tri = 'pertinence' then r.pertinence end desc,
             case when v_tri in ('nouveautes', 'selection', 'pertinence') then r.created_at end desc,
             r.position, r.id) as n
      from retenus r
      left join (select produit_id, min(prix_millimes) as prix from variantes_q group by produit_id) pp
        on pp.produit_id = r.id
  ),
  page as (
    select id, n from ordonnes
     where n > (v_page - 1) * v_par_page and n <= v_page * v_par_page
  ),
  valeurs as (
    select o.key as cle, o.value as valeur, min(vq.position) as rang
      from variantes_q vq
      join dans_rayon d on d.id = vq.produit_id
     cross join lateral jsonb_each_text(vq.options) o
     group by o.key, o.value
  ),
  comptes as (
    select o.key as cle, o.value as valeur, count(distinct vq.produit_id) as compte
      from variantes_q vq
      join dans_rayon d on d.id = vq.produit_id
     cross join lateral jsonb_each_text(vq.options) o
     where vq.ok_base
       and not exists (select 1 from jsonb_each(v_options) f
                        where f.key <> o.key and not coalesce(f.value ? (vq.options ->> f.key), false))
     group by o.key, o.value
  ),
  facette_rayons as (
    select c.slug, c.nom_fr, c.nom_ar, min(c.position) as position, count(*) as compte
      from produits_q p
      join retenus_tous rt on rt.produit_id = p.id
      join public.categories c on c.boutique_id = p_boutique_id and c.id = p.categorie_id and c.actif
     group by c.slug, c.nom_fr, c.nom_ar
  ),
  -- Les axes présents dans le rayon : les caractéristiques filtrables (dans
  -- l'ordre de la boutique), puis ceux des variantes (dans l'ordre des
  -- fiches). Un nom porté par les deux n'apparaît qu'une fois, en
  -- caractéristique.
  axes as (
    select distinct on (x.cle) x.*
      from (select o.cle, min(o.label_fr) as label_fr, min(o.label_ar) as label_ar,
                   null::text as unite, null::text as type, 1 as groupe, min(o.position)::integer as position
              from public.produit_options o
             where o.boutique_id = p_boutique_id and o.produit_id in (select id from dans_rayon)
             group by o.cle
            union all
            select f.cle, f.label_fr, f.label_ar, f.unite, f.type, 0, f.position
              from filtrables f
             where exists (select 1 from dans_rayon d where d.herite ? f.cle)) x
     order by x.cle, x.groupe
  )
  select jsonb_build_object(
    'total', (select count(*) from retenus),
    'page', v_page,
    'par_page', v_par_page,
    'produits', coalesce((
      select jsonb_agg(to_jsonb(vp) - 'boutique_id' order by pg.n)
        from page pg
        join public.vitrine_produits vp on vp.boutique_id = p_boutique_id and vp.id = pg.id), '[]'::jsonb),
    'facettes', jsonb_build_object(
      'axes', coalesce((
        select jsonb_agg(jsonb_build_object('cle', a.cle, 'label_fr', a.label_fr, 'label_ar', a.label_ar,
                                            'unite', a.unite, 'type', a.type)
                         order by a.groupe, a.position, a.cle)
          from axes a), '[]'::jsonb),
      'options', coalesce((
        select jsonb_object_agg(x.cle, x.valeurs)
          from (select v.cle,
                       jsonb_agg(jsonb_build_object('valeur', v.valeur, 'compte', coalesce(c.compte, 0))
                                 order by case when a.type = 'nombre' and v.valeur ~ '^-?[0-9]{1,9}(\.[0-9]{1,4})?$'
                                               then v.valeur::numeric end nulls last,
                                          v.rang, v.valeur) as valeurs
                  from valeurs v
                  left join comptes c using (cle, valeur)
                  left join axes a on a.cle = v.cle
                 group by v.cle) x), '{}'::jsonb),
      'rayons', coalesce((
        select jsonb_agg(jsonb_build_object('slug', slug, 'nom_fr', nom_fr, 'nom_ar', nom_ar, 'compte', compte)
                         order by position, slug)
          from facette_rayons), '[]'::jsonb),
      'prix', (select case when count(*) = 0 then null
                           else jsonb_build_object('min', min(vq.prix_millimes), 'max', max(vq.prix_millimes)) end
                 from variantes_q vq where vq.produit_id in (select id from dans_rayon))
    )
  ) into v_resultat;

  return v_resultat;
end;
$$;
