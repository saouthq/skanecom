-- =====================================================================
-- LA RECHERCHE SANS ACCENTS, ET UNE FAUTE DE FRAPPE PARDONNÉE (09/11)
-- =====================================================================
-- Parcours en vrai, au téléphone : on tape « serum », « eclat », « tete
-- fraisee » — sans accents, comme sur la plupart des claviers. La recherche
-- (public.liste_produits : la page et les suggestions pendant la frappe)
-- ne trouvait rien : « sérum » seul trouvait le sérum. Désormais le texte
-- du produit et la saisie sont comparés sans accents ni majuscules, des
-- deux côtés ; les valeurs des déclinaisons comptent (« terracotta »
-- trouve la robe terracotta) ; et une faute dans un mot (« terracota »,
-- « percuseuse ») trouve le mot le plus proche (pg_trgm, similarité par
-- mot, au seuil ordinaire : une lettre inversée, « valsie », reste hors de
-- portée — l'abaisser ferait trouver la rose pour la robe).
--
-- public.sans_accents est immuable et publique : liste_produits tourne
-- sous les droits du visiteur, qui n'exécute rien de private.
-- =====================================================================

create function public.sans_accents(p_texte text)
returns text
language sql
immutable
parallel safe
returns null on null input
as $f$
  select replace(replace(replace(replace(lower(translate(p_texte,
    'ÀÂÄÁÃÅàâäáãåÇçÉÈÊËéèêëÎÏÍÌîïíìÔÖÓÒÕôöóòõÙÛÜÚùûüúŸÿÑñ',
    'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuYyNn')),
    'œ', 'oe'), 'æ', 'ae'), '’', ''''), 'ß', 'ss')
$f$;
comment on function public.sans_accents(text) is
  'Le texte en minuscules, sans accents (« Sérum éclat » → « serum eclat ») : la recherche compare ainsi la saisie et le catalogue.';
grant execute on function public.sans_accents(text) to anon, authenticated;

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
  v_qa       text;
  v_motif_a  text;
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
  -- Sans accents, des deux côtés : « serum » trouve le sérum, « tete
  -- fraisee » la vis à tête fraisée (au téléphone, on tape sans accents).
  v_qa := public.sans_accents(v_q);
  v_motif_a := case when v_qa is null then null
                    else '%' || replace(replace(replace(v_qa, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;

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
                       extensions.similarity(public.sans_accents(coalesce(p.nom_fr, '') || ' ' || coalesce(p.nom_ar, '')), v_qa),
                       extensions.word_similarity(v_qa, public.sans_accents(coalesce(p.nom_fr, '') || ' ' || coalesce(p.nom_ar, ''))) * 0.9,
                       case when exists (select 1 from public.variantes v
                                          where v.boutique_id = p.boutique_id and v.produit_id = p.id
                                            and v.actif and v.sku ilike v_motif) then 1 else 0 end)
           end as pertinence
      from public.produits p
     where p.boutique_id = p_boutique_id and p.publie
       and (v_q is null
            or public.sans_accents(coalesce(p.nom_fr, '') || ' ' || coalesce(p.nom_ar, '') || ' ' || coalesce(p.marque, '')) ilike v_motif_a
            or public.sans_accents(coalesce(p.nom_fr, '') || ' ' || coalesce(p.nom_ar, '')) operator(extensions.%) v_qa
            -- Une faute de frappe dans un mot (« percuseuse ») : le mot le plus proche du nom.
            or v_qa operator(extensions.<%) public.sans_accents(coalesce(p.nom_fr, '') || ' ' || coalesce(p.nom_ar, ''))
            or to_tsvector('french', public.sans_accents(coalesce(p.nom_fr, '') || ' ' || coalesce(p.marque, '') || ' ' || coalesce(p.description_fr, '')))
               @@ websearch_to_tsquery('french', v_qa)
            or exists (select 1 from jsonb_each_text(p.caracteristiques) c where public.sans_accents(c.value) ilike v_motif_a)
            -- La valeur d'une déclinaison : « terracotta » trouve la robe terracotta (et « terracota » aussi).
            or exists (select 1 from public.variantes v cross join lateral jsonb_each_text(v.options) o
                        where v.boutique_id = p.boutique_id and v.produit_id = p.id and v.actif
                          and (public.sans_accents(o.value) ilike v_motif_a
                               or v_qa operator(extensions.<%) public.sans_accents(o.value)))
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

-- Le catalogue du backoffice : le gérant tape « serum » comme ses clients.
create or replace function public.gestion_liste_produits(
  p_boutique_id uuid,
  p_filtre      text default 'tous',
  p_recherche   text default null,
  p_limite      integer default 60,
  p_decalage    integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q      text := nullif(btrim(coalesce(p_recherche, '')), '');
  v_filtre text := coalesce(p_filtre, 'tous');
  v_sortie jsonb;
begin
  perform private.catalogue_exige(p_boutique_id);
  if v_filtre not in ('tous', 'publies', 'brouillons', 'stock_bas', 'rupture') then
    raise exception 'Filtre inconnu : %', v_filtre using errcode = 'check_violation', hint = 'filtre';
  end if;

  with p as (
    select pr.*,
           coalesce(pr.nom_fr, pr.nom_ar) as nom,
           (select count(*) from public.variantes v where v.boutique_id = pr.boutique_id and v.produit_id = pr.id and v.actif) as nb_variantes,
           (select coalesce(sum(v.stock), 0) from public.variantes v where v.boutique_id = pr.boutique_id and v.produit_id = pr.id and v.actif) as stock_total,
           (select count(*) from public.variantes v where v.boutique_id = pr.boutique_id and v.produit_id = pr.id and v.actif
              and v.stock > 0 and v.stock <= v.seuil_alerte_stock) as variantes_bas,
           (select count(*) from public.variantes v where v.boutique_id = pr.boutique_id and v.produit_id = pr.id and v.actif
              and v.stock <= 0) as variantes_epuisees,
           (select min(v.prix_millimes) from public.variantes v where v.boutique_id = pr.boutique_id and v.produit_id = pr.id and v.actif) as prix_min,
           (select max(v.prix_millimes) from public.variantes v where v.boutique_id = pr.boutique_id and v.produit_id = pr.id and v.actif) as prix_max
    from public.produits pr
    where pr.boutique_id = p_boutique_id
      and (v_q is null
           or public.sans_accents(coalesce(pr.nom_fr, '') || ' ' || coalesce(pr.nom_ar, '') || ' ' || coalesce(pr.marque, '')) ilike '%' || public.sans_accents(v_q) || '%'
           or exists (select 1 from public.variantes v where v.boutique_id = pr.boutique_id and v.produit_id = pr.id and v.sku ilike '%' || v_q || '%'))
  ),
  f as (
    select * from p
    where case v_filtre
            when 'publies'    then publie
            when 'brouillons' then not publie
            when 'stock_bas'  then variantes_bas > 0
            when 'rupture'    then stock_total = 0
            else true
          end
  )
  select jsonb_build_object(
    'filtre', v_filtre,
    'total', (select count(*) from f),
    'compteurs', jsonb_build_object(
      'tous',       (select count(*) from p),
      'publies',    (select count(*) from p where publie),
      'brouillons', (select count(*) from p where not publie),
      'stock_bas',  (select count(*) from p where variantes_bas > 0),
      'rupture',    (select count(*) from p where stock_total = 0)),
    'produits', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'slug', f.slug, 'nom', f.nom, 'marque', f.marque, 'publie', f.publie, 'mis_en_avant', f.mis_en_avant,
               'categorie', (select coalesce(c.nom_fr, c.nom_ar) from public.categories c where c.boutique_id = f.boutique_id and c.id = f.categorie_id),
               'image', (select i.chemin from public.produit_images i where i.boutique_id = f.boutique_id and i.produit_id = f.id
                          order by i.position, i.created_at limit 1),
               'nb_variantes', f.nb_variantes, 'stock_total', f.stock_total, 'variantes_bas', f.variantes_bas,
               'variantes_epuisees', f.variantes_epuisees,
               'prix_min', f.prix_min, 'prix_max', f.prix_max, 'modifie_le', f.updated_at)
             order by f.position, lower(f.nom), f.id)
      from (select * from f order by position, lower(nom), id limit greatest(1, least(coalesce(p_limite, 60), 200)) offset greatest(0, coalesce(p_decalage, 0))) f
    ), '[]'::jsonb)
  ) into v_sortie;
  return v_sortie;
end;
$$;
