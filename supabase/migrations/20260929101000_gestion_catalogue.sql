-- =====================================================================
-- SkanEcom — 11 · BACKOFFICE : LE CATALOGUE ET LE STOCK (PRD §6.2 B1, B2)
-- =====================================================================
-- L'équipe d'une boutique tient son catalogue au quotidien : corriger un
-- texte, changer un prix, publier ou retirer un produit, recevoir un
-- arrivage, faire l'inventaire, noter une casse, ajouter une couleur. Le
-- gros du catalogue arrive par l'import de la console (migration 07).
--
-- Comme pour les commandes (migration 09), chaque geste passe par une
-- fonction qui revérifie le rôle :
--   · lire : toute l'équipe ;
--   · modifier la fiche, les prix, les déclinaisons : propriétaire, admin ;
--   · le stock (réception, inventaire, casse) : propriétaire, admin,
--     préparation — le stock ne change que par public.mouvement_stock, qui
--     journalise (migration 03).
-- Une fiche modifiée entre-temps par un collègue n'est pas écrasée à
-- l'aveugle (version = updated_at, erreur « change »). Jamais de code 40001 :
-- PostgREST rejouerait la transaction sans fin (migration 09).
-- =====================================================================


create function private.catalogue_exige(p_boutique_id uuid, p_roles text[] default null)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.est_membre(p_boutique_id, p_roles) then
    raise exception 'Action réservée à l''équipe de la boutique (%)', coalesce(array_to_string(p_roles, ', '), 'membres')
      using errcode = 'insufficient_privilege', hint = 'role';
  end if;
end;
$$;

-- Le prix « à partir de » d'un produit suit ses déclinaisons actives.
create function private.rafraichit_prix_min(p_boutique_id uuid, p_produit_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.produits p
     set prix_min_millimes = (select min(v.prix_millimes) from public.variantes v
                               where v.boutique_id = p_boutique_id and v.produit_id = p_produit_id and v.actif)
   where p.boutique_id = p_boutique_id and p.id = p_produit_id;
$$;

-- Le libellé d'une déclinaison, dans l'ordre des axes : « Grande 75 cm · Noir ».
create function private.libelle_variante(p_boutique_id uuid, p_produit_id uuid, p_options jsonb)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(string_agg(p_options ->> o.cle, ' · ' order by o.position, o.cle), '')
  from public.produit_options o
  where o.boutique_id = p_boutique_id and o.produit_id = p_produit_id and p_options ? o.cle;
$$;


-- ---------------------------------------------------------------------
-- Lire
-- ---------------------------------------------------------------------

-- La liste : tous, publiés, brouillons, stock bas, en rupture. Le stock bas :
-- une déclinaison active sous son seuil d'alerte (et pas à zéro) ; la
-- rupture : plus rien d'actif en stock.
create function public.gestion_liste_produits(
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
           (select min(v.prix_millimes) from public.variantes v where v.boutique_id = pr.boutique_id and v.produit_id = pr.id and v.actif) as prix_min,
           (select max(v.prix_millimes) from public.variantes v where v.boutique_id = pr.boutique_id and v.produit_id = pr.id and v.actif) as prix_max
    from public.produits pr
    where pr.boutique_id = p_boutique_id
      and (v_q is null
           or coalesce(pr.nom_fr, '') || ' ' || coalesce(pr.nom_ar, '') || ' ' || coalesce(pr.marque, '') ilike '%' || v_q || '%'
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
               'prix_min', f.prix_min, 'prix_max', f.prix_max, 'modifie_le', f.updated_at)
             order by f.position, lower(f.nom), f.id)
      from (select * from f order by position, lower(nom), id limit greatest(1, least(coalesce(p_limite, 60), 200)) offset greatest(0, coalesce(p_decalage, 0))) f
    ), '[]'::jsonb)
  ) into v_sortie;
  return v_sortie;
end;
$$;

-- La fiche : le produit, ses axes, ses déclinaisons (stock compris), ses
-- photos, les rayons où le ranger, et les derniers mouvements de stock.
create function public.gestion_produit(p_boutique_id uuid, p_produit_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_p      public.produits;
  v_sortie jsonb;
begin
  perform private.catalogue_exige(p_boutique_id);
  select * into v_p from public.produits p where p.boutique_id = p_boutique_id and p.id = p_produit_id;
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'id', v_p.id, 'slug', v_p.slug, 'nom', coalesce(v_p.nom_fr, v_p.nom_ar), 'description', v_p.description_fr,
    'marque', v_p.marque, 'categorie_id', v_p.categorie_id, 'publie', v_p.publie, 'mis_en_avant', v_p.mis_en_avant,
    'version', v_p.updated_at, 'cree_le', v_p.created_at,
    'axes', coalesce((select jsonb_agg(jsonb_build_object('cle', o.cle, 'label', coalesce(o.label_fr, o.label_ar),
                                         'valeurs', (select coalesce(jsonb_agg(distinct v.options ->> o.cle), '[]'::jsonb)
                                                       from public.variantes v
                                                      where v.boutique_id = p_boutique_id and v.produit_id = v_p.id and v.options ? o.cle))
                                       order by o.position, o.cle)
                        from public.produit_options o where o.boutique_id = p_boutique_id and o.produit_id = v_p.id), '[]'::jsonb),
    'variantes', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', v.id, 'sku', v.sku, 'options', v.options,
                             'libelle', private.libelle_variante(p_boutique_id, v_p.id, v.options),
                             'prix', v.prix_millimes, 'prix_barre', v.prix_barre_millimes, 'stock', v.stock,
                             'seuil', v.seuil_alerte_stock, 'actif', v.actif, 'poids', v.poids_grammes)
                           order by v.position, v.sku)
                           from public.variantes v where v.boutique_id = p_boutique_id and v.produit_id = v_p.id), '[]'::jsonb),
    'images', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'chemin', i.chemin, 'variante_id', i.variante_id, 'alt', i.alt_fr)
                        order by i.position, i.created_at)
                        from public.produit_images i where i.boutique_id = p_boutique_id and i.produit_id = v_p.id), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id,
                              'nom', case when par.id is null then coalesce(c.nom_fr, c.nom_ar)
                                          else coalesce(par.nom_fr, par.nom_ar) || ' › ' || coalesce(c.nom_fr, c.nom_ar) end)
                            order by coalesce(par.position, c.position), coalesce(par.nom_fr, c.nom_fr), par.id nulls first, c.position, c.nom_fr)
                            from public.categories c
                            left join public.categories par on par.boutique_id = c.boutique_id and par.id = c.parent_id
                           where c.boutique_id = p_boutique_id), '[]'::jsonb),
    'mouvements', coalesce((select jsonb_agg(m order by m ->> 'le' desc)
                            from (select jsonb_build_object(
                                           'le', s.created_at, 'sku', v.sku,
                                           'libelle', private.libelle_variante(p_boutique_id, v_p.id, v.options),
                                           'delta', s.delta, 'stock_apres', s.stock_apres, 'motif', s.motif, 'commentaire', s.commentaire,
                                           'commande', (select c.numero from public.commandes c where c.boutique_id = s.boutique_id and c.id = s.commande_id),
                                           'auteur', (select u.email from auth.users u where u.id = s.auteur_id)) as m
                                    from public.stock_mouvements s
                                    join public.variantes v on v.boutique_id = s.boutique_id and v.id = s.variante_id
                                   where s.boutique_id = p_boutique_id and v.produit_id = v_p.id
                                   order by s.created_at desc
                                   limit 30) derniers), '[]'::jsonb)
  ) into v_sortie;
  return v_sortie;
end;
$$;


-- ---------------------------------------------------------------------
-- La fiche : textes, rayon, publication
-- ---------------------------------------------------------------------
create function public.gestion_enregistrer_produit(
  p_boutique_id uuid,
  p_produit_id  uuid,
  p_version     timestamptz,
  p_champs      jsonb
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p   public.produits;
  v_nom text := btrim(coalesce(p_champs ->> 'nom', ''));
  v_pub boolean := coalesce((p_champs ->> 'publie')::boolean, false);
  v_cat uuid := nullif(p_champs ->> 'categorie_id', '')::uuid;
  v_maj timestamptz;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  select * into v_p from public.produits p where p.boutique_id = p_boutique_id and p.id = p_produit_id for update;
  if not found then
    raise exception 'Produit introuvable' using errcode = 'no_data_found', hint = 'produit';
  end if;
  if p_version is not null and v_p.updated_at <> p_version then
    raise exception 'La fiche a été modifiée entre-temps' using errcode = 'check_violation', hint = 'change';
  end if;
  if v_nom = '' or length(v_nom) > 200 then
    raise exception 'Le nom est obligatoire (200 caractères au plus)' using errcode = 'check_violation', hint = 'nom';
  end if;
  if length(coalesce(p_champs ->> 'description', '')) > 5000 then
    raise exception 'La description dépasse 5 000 caractères' using errcode = 'check_violation', hint = 'description';
  end if;
  if v_cat is not null and not exists (select 1 from public.categories c where c.boutique_id = p_boutique_id and c.id = v_cat) then
    raise exception 'Rayon inconnu' using errcode = 'check_violation', hint = 'categorie';
  end if;
  -- Publier un produit qu'on ne peut pas acheter : non.
  if v_pub and not exists (select 1 from public.variantes v where v.boutique_id = p_boutique_id and v.produit_id = p_produit_id and v.actif) then
    raise exception 'Aucune déclinaison active : le produit ne peut pas être publié' using errcode = 'check_violation', hint = 'variante';
  end if;

  update public.produits set
    nom_fr         = v_nom,
    description_fr = nullif(btrim(coalesce(p_champs ->> 'description', '')), ''),
    marque         = nullif(btrim(coalesce(p_champs ->> 'marque', '')), ''),
    categorie_id   = v_cat,
    publie         = v_pub,
    mis_en_avant   = coalesce((p_champs ->> 'mis_en_avant')::boolean, false)
  where boutique_id = p_boutique_id and id = p_produit_id
  returning updated_at into v_maj;
  return v_maj;
end;
$$;


-- ---------------------------------------------------------------------
-- Une déclinaison : prix, prix barré, seuil d'alerte, active ou non
-- ---------------------------------------------------------------------
create function public.gestion_enregistrer_variante(
  p_boutique_id uuid,
  p_variante_id uuid,
  p_prix        bigint,
  p_prix_barre  bigint,
  p_seuil       integer,
  p_actif       boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_produit uuid;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if p_prix is null or p_prix <= 0 then
    raise exception 'Le prix doit être supérieur à zéro' using errcode = 'check_violation', hint = 'prix';
  end if;
  if p_prix_barre is not null and p_prix_barre <= p_prix then
    raise exception 'Le prix barré doit être supérieur au prix' using errcode = 'check_violation', hint = 'prix_barre';
  end if;
  if p_seuil is null or p_seuil < 0 or p_seuil > 10000 then
    raise exception 'Seuil d''alerte invalide' using errcode = 'check_violation', hint = 'seuil';
  end if;

  select v.produit_id into v_produit from public.variantes v
   where v.boutique_id = p_boutique_id and v.id = p_variante_id for update;
  if v_produit is null then
    raise exception 'Déclinaison introuvable' using errcode = 'no_data_found', hint = 'variante';
  end if;
  -- Un produit publié garde au moins une déclinaison en vente.
  if not coalesce(p_actif, true)
     and exists (select 1 from public.produits p where p.boutique_id = p_boutique_id and p.id = v_produit and p.publie)
     and not exists (select 1 from public.variantes v where v.boutique_id = p_boutique_id and v.produit_id = v_produit
                     and v.actif and v.id <> p_variante_id) then
    raise exception 'C''est la dernière déclinaison en vente : retirez d''abord le produit de la vitrine'
      using errcode = 'check_violation', hint = 'dernier';
  end if;

  update public.variantes set
    prix_millimes = p_prix, prix_barre_millimes = p_prix_barre, seuil_alerte_stock = p_seuil, actif = coalesce(p_actif, true)
  where boutique_id = p_boutique_id and id = p_variante_id;
  perform private.rafraichit_prix_min(p_boutique_id, v_produit);
end;
$$;


-- ---------------------------------------------------------------------
-- Le stock : réception (+), inventaire (=), casse (−)
-- ---------------------------------------------------------------------
create function public.gestion_mouvement_stock(
  p_boutique_id uuid,
  p_variante_id uuid,
  p_mode        text,
  p_quantite    integer,
  p_commentaire text default null
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_stock integer;
  v_delta integer;
  v_note  text := nullif(btrim(coalesce(p_commentaire, '')), '');
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,preparateur}');
  if p_mode is null or p_mode not in ('reception', 'inventaire', 'casse') then
    raise exception 'Mouvement inconnu : %', p_mode using errcode = 'check_violation', hint = 'mode';
  end if;
  if p_quantite is null or p_quantite < 0 or p_quantite > 100000
     or (p_mode <> 'inventaire' and p_quantite = 0) then
    raise exception 'Quantité invalide' using errcode = 'check_violation', hint = 'quantite';
  end if;
  if length(coalesce(v_note, '')) > 300 then
    raise exception 'Commentaire trop long' using errcode = 'check_violation', hint = 'commentaire';
  end if;

  select v.stock into v_stock from public.variantes v
   where v.boutique_id = p_boutique_id and v.id = p_variante_id for update;
  if not found then
    raise exception 'Déclinaison introuvable' using errcode = 'no_data_found', hint = 'variante';
  end if;

  v_delta := case p_mode when 'reception' then p_quantite when 'casse' then -p_quantite else p_quantite - v_stock end;
  if v_delta = 0 then
    return v_stock;  -- l'inventaire confirme le stock : rien à journaliser
  end if;
  if v_stock + v_delta < 0 then
    raise exception 'Il ne reste que % pièce(s) : impossible d''en retirer %', v_stock, -v_delta
      using errcode = 'check_violation', hint = 'stock';
  end if;

  return public.mouvement_stock(p_boutique_id, p_variante_id, v_delta,
    (case p_mode when 'reception' then 'reception' when 'casse' then 'casse' else 'correction' end)::public.motif_mouvement_stock,
    coalesce(v_note, case p_mode when 'inventaire' then 'Inventaire' when 'casse' then 'Casse' else 'Réception' end));
end;
$$;


-- ---------------------------------------------------------------------
-- Une déclinaison de plus (une couleur, une taille) sur les axes du produit
-- ---------------------------------------------------------------------
create function public.gestion_ajouter_variante(
  p_boutique_id uuid,
  p_produit_id  uuid,
  p_options     jsonb,
  p_sku         text,
  p_prix        bigint
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cles_axes text[];
  v_cles      text[];
  v_sku       text := upper(btrim(coalesce(p_sku, '')));
  v_id        uuid;
  v_position  smallint;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  perform 1 from public.produits p where p.boutique_id = p_boutique_id and p.id = p_produit_id for update;
  if not found then
    raise exception 'Produit introuvable' using errcode = 'no_data_found', hint = 'produit';
  end if;

  select coalesce(array_agg(o.cle order by o.cle), '{}') into v_cles_axes
  from public.produit_options o where o.boutique_id = p_boutique_id and o.produit_id = p_produit_id;
  if jsonb_typeof(coalesce(p_options, '{}'::jsonb)) <> 'object' then
    raise exception 'Options invalides' using errcode = 'check_violation', hint = 'options';
  end if;
  select coalesce(array_agg(k order by k), '{}') into v_cles from jsonb_object_keys(coalesce(p_options, '{}'::jsonb)) k;
  if v_cles_axes = '{}' then
    raise exception 'Ce produit n''a pas d''axes (taille, couleur…) : il n''a qu''une déclinaison'
      using errcode = 'check_violation', hint = 'axes';
  end if;
  if v_cles <> v_cles_axes then
    raise exception 'Chaque axe du produit doit recevoir une valeur' using errcode = 'check_violation', hint = 'options';
  end if;
  if exists (select 1 from jsonb_each(p_options) e
             where jsonb_typeof(e.value) <> 'string' or btrim(e.value #>> '{}') = '' or length(e.value #>> '{}') > 60) then
    raise exception 'Une valeur d''axe est vide ou trop longue' using errcode = 'check_violation', hint = 'options';
  end if;
  if v_sku !~ '^[A-Z0-9][A-Z0-9._/-]{0,59}$' then
    raise exception 'Référence invalide : lettres, chiffres, tirets (60 au plus)' using errcode = 'check_violation', hint = 'sku';
  end if;
  if p_prix is null or p_prix <= 0 then
    raise exception 'Le prix doit être supérieur à zéro' using errcode = 'check_violation', hint = 'prix';
  end if;
  if exists (select 1 from public.variantes v where v.boutique_id = p_boutique_id and v.sku = v_sku) then
    raise exception 'La référence % existe déjà dans la boutique', v_sku using errcode = 'unique_violation', hint = 'sku';
  end if;
  if exists (select 1 from public.variantes v where v.boutique_id = p_boutique_id and v.produit_id = p_produit_id
             and v.options = (select jsonb_object_agg(e.key, btrim(e.value #>> '{}')) from jsonb_each(p_options) e)) then
    raise exception 'Cette déclinaison existe déjà' using errcode = 'unique_violation', hint = 'combinaison';
  end if;

  select coalesce(max(v.position), 0) + 1 into v_position from public.variantes v
   where v.boutique_id = p_boutique_id and v.produit_id = p_produit_id;
  insert into public.variantes (boutique_id, produit_id, sku, options, prix_millimes, stock, position)
  values (p_boutique_id, p_produit_id, v_sku,
          (select jsonb_object_agg(e.key, btrim(e.value #>> '{}')) from jsonb_each(p_options) e), p_prix, 0, v_position)
  returning id into v_id;
  perform private.rafraichit_prix_min(p_boutique_id, p_produit_id);
  return v_id;
end;
$$;


-- ---------------------------------------------------------------------
-- Un nouveau produit : son nom, son rayon, son prix, ses axes et toutes
-- leurs combinaisons (références proposées par l'écran). Il naît en
-- brouillon, sans stock : on reçoit le stock, puis on publie.
-- ---------------------------------------------------------------------
create function public.gestion_creer_produit(
  p_boutique_id  uuid,
  p_nom          text,
  p_slug         text,
  p_categorie_id uuid,
  p_prix         bigint,
  p_axes         jsonb,
  p_variantes    jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nom   text := btrim(coalesce(p_nom, ''));
  v_base  text := lower(btrim(coalesce(p_slug, '')));
  v_slug  text;
  v_n     integer := 1;
  v_id    uuid;
  v_axe   jsonb;
  v_var   jsonb;
  v_cles  text[];
  v_pos   smallint := 0;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if v_nom = '' or length(v_nom) > 200 then
    raise exception 'Le nom est obligatoire (200 caractères au plus)' using errcode = 'check_violation', hint = 'nom';
  end if;
  if v_base !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_base) > 80 then
    raise exception 'Adresse du produit invalide' using errcode = 'check_violation', hint = 'slug';
  end if;
  if p_prix is null or p_prix <= 0 then
    raise exception 'Le prix doit être supérieur à zéro' using errcode = 'check_violation', hint = 'prix';
  end if;
  if p_categorie_id is not null and not exists (select 1 from public.categories c where c.boutique_id = p_boutique_id and c.id = p_categorie_id) then
    raise exception 'Rayon inconnu' using errcode = 'check_violation', hint = 'categorie';
  end if;
  if jsonb_typeof(coalesce(p_axes, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_axes, '[]'::jsonb)) > 3 then
    raise exception 'Trois axes au plus (taille, couleur…)' using errcode = 'check_violation', hint = 'axes';
  end if;
  if jsonb_typeof(coalesce(p_variantes, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_variantes, '[]'::jsonb)) not between 1 and 100 then
    raise exception 'Entre 1 et 100 déclinaisons' using errcode = 'check_violation', hint = 'variantes';
  end if;
  select coalesce(array_agg(a ->> 'cle' order by a ->> 'cle'), '{}') into v_cles from jsonb_array_elements(coalesce(p_axes, '[]'::jsonb)) a;
  if exists (select 1 from jsonb_array_elements(coalesce(p_axes, '[]'::jsonb)) a
             where coalesce(a ->> 'cle', '') !~ '^[a-z0-9_]{1,40}$' or btrim(coalesce(a ->> 'label', '')) = '') then
    raise exception 'Un axe est mal nommé' using errcode = 'check_violation', hint = 'axes';
  end if;
  if (select count(distinct x) from unnest(v_cles) x) <> cardinality(v_cles) then
    raise exception 'Deux axes portent le même nom' using errcode = 'check_violation', hint = 'axes';
  end if;

  -- Une adresse libre : « valise-cabine », sinon « valise-cabine-2 »…
  v_slug := v_base;
  while exists (select 1 from public.produits p where p.boutique_id = p_boutique_id and p.slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := left(v_base, 76) || '-' || v_n;
  end loop;

  insert into public.produits (boutique_id, slug, nom_fr, categorie_id, prix_min_millimes, publie)
  values (p_boutique_id, v_slug, v_nom, p_categorie_id, p_prix, false)
  returning id into v_id;

  for v_axe in select * from jsonb_array_elements(coalesce(p_axes, '[]'::jsonb)) loop
    insert into public.produit_options (boutique_id, produit_id, cle, label_fr, position)
    values (p_boutique_id, v_id, v_axe ->> 'cle', btrim(v_axe ->> 'label'), v_pos);
    v_pos := v_pos + 1;
  end loop;

  v_pos := 0;
  for v_var in select * from jsonb_array_elements(p_variantes) loop
    if (select coalesce(array_agg(k order by k), '{}') from jsonb_object_keys(coalesce(v_var -> 'options', '{}'::jsonb)) k) <> v_cles then
      raise exception 'Une déclinaison ne donne pas une valeur à chaque axe' using errcode = 'check_violation', hint = 'options';
    end if;
    if upper(btrim(coalesce(v_var ->> 'sku', ''))) !~ '^[A-Z0-9][A-Z0-9._/-]{0,59}$' then
      raise exception 'Référence invalide : %', v_var ->> 'sku' using errcode = 'check_violation', hint = 'sku';
    end if;
    if exists (select 1 from public.variantes v where v.boutique_id = p_boutique_id and v.sku = upper(btrim(v_var ->> 'sku'))) then
      raise exception 'La référence % existe déjà dans la boutique', upper(btrim(v_var ->> 'sku')) using errcode = 'unique_violation', hint = 'sku';
    end if;
    insert into public.variantes (boutique_id, produit_id, sku, options, prix_millimes, stock, position)
    values (p_boutique_id, v_id, upper(btrim(v_var ->> 'sku')), coalesce(v_var -> 'options', '{}'::jsonb), p_prix, 0, v_pos);
    v_pos := v_pos + 1;
  end loop;

  return jsonb_build_object('id', v_id, 'slug', v_slug);
end;
$$;


revoke execute on function private.catalogue_exige(uuid, text[])                 from public, anon, authenticated;
revoke execute on function private.rafraichit_prix_min(uuid, uuid)                from public, anon, authenticated;
revoke execute on function private.libelle_variante(uuid, uuid, jsonb)            from public, anon, authenticated;
revoke execute on function public.gestion_liste_produits(uuid, text, text, integer, integer)            from public, anon;
revoke execute on function public.gestion_produit(uuid, uuid)                                          from public, anon;
revoke execute on function public.gestion_enregistrer_produit(uuid, uuid, timestamptz, jsonb)          from public, anon;
revoke execute on function public.gestion_enregistrer_variante(uuid, uuid, bigint, bigint, integer, boolean) from public, anon;
revoke execute on function public.gestion_mouvement_stock(uuid, uuid, text, integer, text)            from public, anon;
revoke execute on function public.gestion_ajouter_variante(uuid, uuid, jsonb, text, bigint)           from public, anon;
revoke execute on function public.gestion_creer_produit(uuid, text, text, uuid, bigint, jsonb, jsonb) from public, anon;
grant  execute on function public.gestion_liste_produits(uuid, text, text, integer, integer)            to authenticated;
grant  execute on function public.gestion_produit(uuid, uuid)                                          to authenticated;
grant  execute on function public.gestion_enregistrer_produit(uuid, uuid, timestamptz, jsonb)          to authenticated;
grant  execute on function public.gestion_enregistrer_variante(uuid, uuid, bigint, bigint, integer, boolean) to authenticated;
grant  execute on function public.gestion_mouvement_stock(uuid, uuid, text, integer, text)            to authenticated;
grant  execute on function public.gestion_ajouter_variante(uuid, uuid, jsonb, text, bigint)           to authenticated;
grant  execute on function public.gestion_creer_produit(uuid, text, text, uuid, bigint, jsonb, jsonb) to authenticated;
