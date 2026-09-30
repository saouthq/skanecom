-- =====================================================================
-- SkanEcom — 28 · L'IMPORT DES FICHES TECHNIQUES (B9 avec C5)
-- 30/09/2026
-- =====================================================================
--
-- Le fichier du fournisseur porte souvent la fiche technique en colonnes :
-- « Puissance (W) », « Tension », « Couple (Nm) ». Une colonne qui nomme une
-- caractéristique de la boutique (public.attributs, migration 27) ne crée
-- plus un axe de variante : la console la lit comme une valeur du produit
-- (lib/console/import.ts, nombre vérifié, unité ôtée), et la base
--   · vérifie au rapport que les lignes d'un même produit concordent, et que
--     chaque caractéristique existe toujours ;
--   · annonce les caractéristiques reconnues et le nombre de fiches
--     techniques touchées ;
--   · à l'application, ajoute les valeurs à la fiche technique de chaque
--     produit (une cellule vide ne remplace rien ; la base revérifie chaque
--     valeur, private.valide_caracteristiques).
--
-- Reprise des deux fonctions de la migration 06, mêmes signatures.

create or replace function public.console_preparer_import(
  p_acteur      uuid,
  p_boutique_id uuid,
  p_fichier     text,
  p_axes        jsonb,
  p_lignes      jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rapport jsonb;
  v_id      uuid;
begin
  perform private.console_exige_admin(p_acteur);
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id) then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  if jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Aucune ligne à importer' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_lignes) > 5000 then
    raise exception 'Plus de 5000 lignes : découpez le fichier' using errcode = 'check_violation';
  end if;

  with l as (
    select (x ->> 'ligne')::integer                as ligne,
           btrim(coalesce(x ->> 'produit', ''))    as produit,
           coalesce(x ->> 'produit_slug', '')      as pslug,
           btrim(coalesce(x ->> 'reference', ''))  as ref,
           (x ->> 'prix_millimes')::bigint         as prix,
           (x ->> 'prix_barre_millimes')::bigint   as pbarre,
           (x ->> 'stock')::integer                as stock,
           coalesce(x -> 'rayon', '[]'::jsonb)     as rayon,
           coalesce(x -> 'options', '{}'::jsonb)   as options,
           coalesce(x -> 'caracteristiques', '{}'::jsonb) as car,
           coalesce(x -> 'erreurs', '[]'::jsonb)   as erreurs_app,
           (select coalesce(string_agg(k, ', ' order by k), '') from jsonb_object_keys(coalesce(x -> 'options', '{}'::jsonb)) k) as cles
    from jsonb_array_elements(p_lignes) x
  ),
  existantes as (
    select l.ligne, v.id as variante_id, v.prix_millimes, v.prix_barre_millimes, v.stock, p.slug as pslug_existant,
           coalesce(p.nom_fr, p.nom_ar) as produit_existant
    from l
    join public.variantes v on v.boutique_id = p_boutique_id and v.sku = l.ref
    join public.produits p on p.boutique_id = v.boutique_id and p.id = v.produit_id
  ),
  rayons as (
    select l.ligne, e.val ->> 'slug' as slug, e.val ->> 'nom' as nom,
           case when e.ord > 1 then l.rayon -> (e.ord::integer - 2) ->> 'slug' end as parent
    from l, jsonb_array_elements(l.rayon) with ordinality as e(val, ord)
  ),
  e as (
    -- lues par la console : prix illisible, champ obligatoire vide…
    select l.ligne, m #>> '{}' as message from l, jsonb_array_elements(l.erreurs_app) m
    union all
    select l.ligne, format('Référence « %s » en double (déjà ligne %s)', l.ref, d.premiere)
    from l join (select ref, min(ligne) as premiere from l where ref <> '' group by ref having count(*) > 1) d
      on d.ref = l.ref and l.ligne <> d.premiere
    union all
    select x.ligne, format('La référence appartient déjà au produit « %s » : un autre nom de produit ne peut pas la reprendre', x.produit_existant)
    from existantes x join l on l.ligne = x.ligne
    where x.pslug_existant <> l.pslug
    union all
    select l.ligne, 'Le prix barré doit être supérieur au prix'
    from l left join existantes x on x.ligne = l.ligne
    where coalesce(l.pbarre, x.prix_barre_millimes) is not null
      and coalesce(l.pbarre, x.prix_barre_millimes) <= coalesce(l.prix, x.prix_millimes, 0)
    union all
    select l.ligne, format('Même combinaison (%s) que la ligne %s pour ce produit', nullif(l.cles, ''), d.premiere)
    from l join (select pslug, options, min(ligne) as premiere from l group by pslug, options having count(*) > 1) d
      on d.pslug = l.pslug and d.options = l.options and l.ligne <> d.premiere
    union all
    select l.ligne, format('Les variantes d''un même produit renseignent les mêmes colonnes : « %s » ici, « %s » ligne %s',
                           nullif(l.cles, ''), nullif(d.cles, ''), d.ligne)
    from l join (select distinct on (pslug) pslug, cles, ligne from l order by pslug, ligne) d
      on d.pslug = l.pslug and d.cles <> l.cles
    union all
    select l.ligne, format('Cette combinaison est déjà celle de la référence « %s » : changez-la aussi dans le fichier', v.sku)
    from l
    join public.produits p on p.boutique_id = p_boutique_id and p.slug = l.pslug
    join public.variantes v on v.boutique_id = p.boutique_id and v.produit_id = p.id and v.options = l.options and v.sku <> l.ref
    where not exists (select 1 from l l2 where l2.ref = v.sku)
    union all
    -- Une caractéristique décrit le PRODUIT : ses lignes ne peuvent pas se contredire.
    select l.ligne, format('Les variantes d''un même produit ont la même %s : « %s » ici, « %s » ligne %s',
                           coalesce((select a.label_fr from public.attributs a where a.boutique_id = p_boutique_id and a.cle = c.key), c.key),
                           c.value, d.valeur, d.ligne)
    from l cross join lateral jsonb_each_text(l.car) c
    join (select distinct on (l2.pslug, c2.key) l2.pslug, c2.key, c2.value as valeur, l2.ligne
            from l l2 cross join lateral jsonb_each_text(l2.car) c2
           order by l2.pslug, c2.key, l2.ligne) d
      on d.pslug = l.pslug and d.key = c.key and d.valeur <> c.value
    union all
    select l.ligne, format('Caractéristique inconnue de la boutique : « %s »', c.key)
    from l cross join lateral jsonb_object_keys(l.car) c(key)
    where not exists (select 1 from public.attributs a where a.boutique_id = p_boutique_id and a.cle = c.key)
    union all
    select r.ligne, format('Le rayon « %s » apparaît sous deux rayons différents : donnez-leur des noms distincts', r.nom)
    from rayons r
    join (select slug from rayons group by slug having count(distinct coalesce(parent, '')) > 1) d on d.slug = r.slug
  )
  select jsonb_build_object(
    'lignes',              (select count(*) from l),
    'produits',            (select count(distinct pslug) from l),
    'produits_nouveaux',   (select count(distinct l.pslug) from l
                             where not exists (select 1 from public.produits p where p.boutique_id = p_boutique_id and p.slug = l.pslug)),
    'variantes_nouvelles', (select count(*) from l where not exists (select 1 from existantes x where x.ligne = l.ligne)),
    'variantes_modifiees', (select count(*) from existantes),
    'stocks_ajustes',      (select count(*) from existantes x join l on l.ligne = x.ligne where l.stock is not null and l.stock <> x.stock),
    'caracteristiques',    (select coalesce(jsonb_agg(jsonb_build_object('cle', a.cle, 'label', a.label_fr, 'unite', a.unite, 'type', a.type)
                                                      order by a.position, a.label_fr), '[]'::jsonb)
                              from public.attributs a
                             where a.boutique_id = p_boutique_id and exists (select 1 from l where l.car ? a.cle)),
    'fiches_techniques',   (select count(distinct l.pslug) from l where l.car <> '{}'::jsonb),
    'rayons_nouveaux',     (select coalesce(jsonb_agg(distinct r.nom), '[]'::jsonb) from rayons r
                             where not exists (select 1 from public.categories c where c.boutique_id = p_boutique_id and c.slug = r.slug)),
    'erreurs',             (select coalesce(jsonb_agg(jsonb_build_object('ligne', x.ligne, 'message', x.message) order by x.ligne, x.message), '[]'::jsonb)
                              from (select * from e order by ligne, message limit 500) x),
    'erreurs_total',       (select count(*) from e)
  )
  into v_rapport;

  insert into plateforme.imports (boutique_id, acteur, fichier, axes, lignes, rapport)
  values (p_boutique_id, p_acteur, left(coalesce(nullif(btrim(p_fichier), ''), 'catalogue'), 200), coalesce(p_axes, '[]'::jsonb), p_lignes, v_rapport)
  returning id into v_id;
  return v_id;
end;
$$;


create or replace function public.console_appliquer_import(p_acteur uuid, p_import_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_imp      plateforme.imports;
  v_b        uuid;
  v_chemins  jsonb := '{}'::jsonb;   -- chemin de rayons (texte) → id du rayon feuille
  v_chemin   jsonb;
  v_parent   uuid;
  v_cat      uuid;
  v_elem     jsonb;
  v_prod     uuid;
  v_var      uuid;
  v_stock    integer;
  v_position integer;
  p          record;
  v_l        jsonb;
  v_ajustes  integer := 0;
  v_car      jsonb;
begin
  perform private.console_exige_admin(p_acteur);
  select * into v_imp from plateforme.imports i where i.id = p_import_id for update;
  if not found then
    raise exception 'Import introuvable' using errcode = 'no_data_found';
  end if;
  if v_imp.statut <> 'pret' then
    raise exception 'Cet import a déjà été appliqué' using errcode = 'check_violation';
  end if;
  if (v_imp.rapport ->> 'erreurs_total')::integer > 0 then
    raise exception 'Le fichier comporte % erreur(s) : corrigez-le et préparez un nouvel import', v_imp.rapport ->> 'erreurs_total'
      using errcode = 'check_violation';
  end if;
  v_b := v_imp.boutique_id;

  -- Rayons : chaque chemin est retrouvé (par identifiant) ou créé, du plus
  -- général au plus précis. Un rayon existant n'est jamais déplacé.
  for v_chemin in
    select distinct x -> 'rayon' from jsonb_array_elements(v_imp.lignes) x where jsonb_array_length(coalesce(x -> 'rayon', '[]')) > 0
  loop
    v_parent := null;
    for v_elem in select e from jsonb_array_elements(v_chemin) e loop
      select c.id into v_cat from public.categories c where c.boutique_id = v_b and c.slug = v_elem ->> 'slug';
      if v_cat is null then
        insert into public.categories (boutique_id, parent_id, slug, nom_fr)
        values (v_b, v_parent, v_elem ->> 'slug', v_elem ->> 'nom')
        returning id into v_cat;
      end if;
      v_parent := v_cat;
    end loop;
    v_chemins := v_chemins || jsonb_build_object(v_chemin::text, v_parent);
  end loop;

  -- Produits : une fois chacun, avec les premières valeurs non vides de ses
  -- lignes.
  for p in
    select x ->> 'produit_slug' as slug,
           (array_agg(x ->> 'produit' order by (x ->> 'ligne')::integer))[1] as nom,
           (array_agg(x ->> 'description' order by (x ->> 'ligne')::integer) filter (where x ->> 'description' is not null))[1] as description,
           (array_agg(x ->> 'marque' order by (x ->> 'ligne')::integer) filter (where x ->> 'marque' is not null))[1] as marque,
           (array_agg(x -> 'rayon' order by (x ->> 'ligne')::integer) filter (where jsonb_array_length(coalesce(x -> 'rayon', '[]')) > 0))[1] as rayon,
           (array_agg((x ->> 'publie')::boolean order by (x ->> 'ligne')::integer) filter (where x ->> 'publie' is not null))[1] as publie,
           jsonb_agg(x order by (x ->> 'ligne')::integer) as lignes
    from jsonb_array_elements(v_imp.lignes) x
    group by x ->> 'produit_slug'
  loop
    v_cat := case when p.rayon is not null then (v_chemins ->> p.rayon::text)::uuid end;
    -- La fiche technique (B9) : la première valeur de chaque caractéristique
    -- parmi ses lignes (le rapport a vérifié qu'elles concordent).
    select coalesce(jsonb_object_agg(x.cle, x.valeur), '{}'::jsonb) into v_car
      from (select distinct on (c.key) c.key as cle, c.value as valeur
              from jsonb_array_elements(p.lignes) l
             cross join lateral jsonb_each(coalesce(l -> 'caracteristiques', '{}'::jsonb)) c
             order by c.key, (l ->> 'ligne')::integer) x;
    select pr.id into v_prod from public.produits pr where pr.boutique_id = v_b and pr.slug = p.slug;
    if v_prod is null then
      insert into public.produits (boutique_id, slug, nom_fr, description_fr, marque, categorie_id, publie, caracteristiques)
      values (v_b, p.slug, p.nom, p.description, p.marque, v_cat, coalesce(p.publie, true), v_car)
      returning id into v_prod;
    else
      -- Une cellule vide ne remplace rien : les valeurs du fichier s'ajoutent
      -- à la fiche technique, ou remplacent celles du même nom.
      update public.produits pr set
        nom_fr           = coalesce(nullif(btrim(p.nom), ''), pr.nom_fr),
        description_fr   = coalesce(p.description, pr.description_fr),
        marque           = coalesce(p.marque, pr.marque),
        categorie_id     = coalesce(v_cat, pr.categorie_id),
        publie           = coalesce(p.publie, pr.publie),
        caracteristiques = pr.caracteristiques || v_car
      where pr.boutique_id = v_b and pr.id = v_prod;
    end if;

    -- Les axes du produit (couleur, taille…), avec le libellé de la colonne.
    insert into public.produit_options (boutique_id, produit_id, cle, label_fr, position)
    select v_b, v_prod, a ->> 'cle', a ->> 'label', (a ->> 'position')::smallint
    from jsonb_array_elements(v_imp.axes) a
    where exists (select 1 from jsonb_array_elements(p.lignes) l where l -> 'options' ? (a ->> 'cle'))
    on conflict (boutique_id, produit_id, cle) do update set label_fr = excluded.label_fr, position = excluded.position;

    -- Les variantes, dans l'ordre du fichier.
    v_position := 0;
    for v_l in select e from jsonb_array_elements(p.lignes) e loop
      select v.id, v.stock into v_var, v_stock from public.variantes v where v.boutique_id = v_b and v.sku = btrim(v_l ->> 'reference');
      if v_var is null then
        insert into public.variantes (boutique_id, produit_id, sku, options, prix_millimes, prix_barre_millimes, stock, poids_grammes, position)
        values (v_b, v_prod, btrim(v_l ->> 'reference'), coalesce(v_l -> 'options', '{}'::jsonb), (v_l ->> 'prix_millimes')::bigint,
                (v_l ->> 'prix_barre_millimes')::bigint, coalesce((v_l ->> 'stock')::integer, 0), (v_l ->> 'poids_grammes')::integer, v_position);
      else
        update public.variantes v set
          options             = coalesce(v_l -> 'options', v.options),
          prix_millimes       = coalesce((v_l ->> 'prix_millimes')::bigint, v.prix_millimes),
          prix_barre_millimes = coalesce((v_l ->> 'prix_barre_millimes')::bigint, v.prix_barre_millimes),
          poids_grammes       = coalesce((v_l ->> 'poids_grammes')::integer, v.poids_grammes),
          position            = v_position,
          actif               = true
        where v.boutique_id = v_b and v.id = v_var;
        if v_l ->> 'stock' is not null and (v_l ->> 'stock')::integer <> v_stock then
          perform public.mouvement_stock(v_b, v_var, (v_l ->> 'stock')::integer - v_stock, 'correction', 'Import ' || v_imp.fichier);
          v_ajustes := v_ajustes + 1;
        end if;
      end if;
      v_position := v_position + 1;
    end loop;

    update public.produits pr
       set prix_min_millimes = (select min(v.prix_millimes) from public.variantes v
                                 where v.boutique_id = v_b and v.produit_id = v_prod and v.actif)
     where pr.boutique_id = v_b and pr.id = v_prod;
  end loop;

  update plateforme.imports set statut = 'applique', applique_le = now() where id = p_import_id;
  perform private.console_trace(p_acteur, v_b, 'catalogue.importer', v_imp.fichier, null,
    (v_imp.rapport - 'erreurs' - 'erreurs_total') || jsonb_build_object('import', p_import_id, 'stocks_ajustes', v_ajustes));
  return v_imp.rapport - 'erreurs';
end;
$$;
