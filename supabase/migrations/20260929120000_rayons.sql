-- =====================================================================
-- LES RAYONS AU BACKOFFICE — l'équipe gère ses rayons et sous-rayons en
-- entier : les créer (à la racine ou dans un autre), les renommer, changer
-- leur adresse, les décrire, leur donner une image, les imbriquer, les
-- ordonner, les masquer, les retirer.
--
-- Trois niveaux au plus (Valises › Cabine › Rigides) : au-delà, le menu
-- du téléphone et les filtres ne se lisent plus.
--
-- Une adresse changée (« /categorie/valises » → « /categorie/bagages »)
-- est gardée : les liens déjà posés (accueil, bannières, réseaux, moteurs de
-- recherche) mènent toujours au rayon (public.rayon_par_ancienne_adresse,
-- lue par la vitrine).
--
-- Retirer un rayon ne perd rien : ses produits vont où l'on dit (un autre
-- rayon, un de ses sous-rayons, ou « sans rayon »), ses sous-rayons montent
-- d'un niveau, et son adresse mène au rayon qui reçoit ses produits.
--
-- Écrire : propriétaire et administrateur (comme les fiches produit). Lire :
-- toute l'équipe. Chaque geste est au journal.
-- =====================================================================

create table public.rayons_anciennes_adresses (
  boutique_id  uuid not null references plateforme.boutiques (id) on delete cascade,
  slug         text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  categorie_id uuid not null,
  quitte_le    timestamptz not null default now(),
  primary key (boutique_id, slug),
  foreign key (boutique_id, categorie_id) references public.categories (boutique_id, id) on delete cascade
);

comment on table public.rayons_anciennes_adresses is
  'Les adresses qu''un rayon a quittées : la vitrine y redirige (public.rayon_par_ancienne_adresse).';

alter table public.rayons_anciennes_adresses enable row level security;
-- Aucune politique : la table ne se lit que par les fonctions ci-dessous.
create trigger rayons_anciennes_adresses_boutique_immuable before update of boutique_id on public.rayons_anciennes_adresses
  for each row execute function private.boutique_immuable();

-- La profondeur d'un rayon (1 = racine) et la hauteur de ce qu'il porte (1 = sans sous-rayon).
create function private.rayon_profondeur(p_boutique_id uuid, p_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with recursive montee(id, parent_id, n) as (
    select c.id, c.parent_id, 1 from public.categories c where c.boutique_id = p_boutique_id and c.id = p_id
    union all
    select c.id, c.parent_id, m.n + 1 from public.categories c join montee m on c.id = m.parent_id
     where c.boutique_id = p_boutique_id and m.n < 20
  )
  select coalesce(max(n), 0) from montee
$$;

create function private.rayon_descendants(p_boutique_id uuid, p_id uuid)
returns table (id uuid, n integer)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive descente(id, n) as (
    select c.id, 1 from public.categories c where c.boutique_id = p_boutique_id and c.id = p_id
    union all
    select c.id, d.n + 1 from public.categories c join descente d on c.parent_id = d.id
     where c.boutique_id = p_boutique_id and d.n < 20
  )
  select id, n from descente
$$;

-- ---------------------------------------------------------------------
-- La liste : tous les rayons, avec ce que chacun contient.
-- ---------------------------------------------------------------------
create function public.gestion_rayons(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'parent_id', c.parent_id, 'slug', c.slug,
             'nom', coalesce(c.nom_fr, c.nom_ar), 'description', c.description_fr,
             'image_chemin', c.image_chemin, 'position', c.position, 'actif', c.actif,
             'version', c.updated_at,
             'produits', (select count(*) from public.produits p where p.boutique_id = c.boutique_id and p.categorie_id = c.id),
             'publies', (select count(*) from public.produits p where p.boutique_id = c.boutique_id and p.categorie_id = c.id and p.publie),
             'sous_rayons', (select count(*) from public.categories e where e.boutique_id = c.boutique_id and e.parent_id = c.id),
             'caracteristiques', (select count(*) from public.rayon_attributs ra where ra.boutique_id = c.boutique_id and ra.categorie_id = c.id),
             'anciennes_adresses', coalesce((select jsonb_agg(a.slug order by a.quitte_le desc) from public.rayons_anciennes_adresses a
                                              where a.boutique_id = c.boutique_id and a.categorie_id = c.id), '[]'::jsonb))
           order by c.position, coalesce(c.nom_fr, c.nom_ar))
      from public.categories c where c.boutique_id = p_boutique_id), '[]'::jsonb);
end;
$$;

-- Une adresse libre pour un rayon : « valises », sinon « valises-2 »…
create function private.rayon_adresse_libre(p_boutique_id uuid, p_base text, p_sauf uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_slug text := p_base;
  v_n    integer := 1;
begin
  while exists (select 1 from public.categories c where c.boutique_id = p_boutique_id and c.slug = v_slug and c.id is distinct from p_sauf)
     or exists (select 1 from public.rayons_anciennes_adresses a where a.boutique_id = p_boutique_id and a.slug = v_slug and a.categorie_id is distinct from p_sauf) loop
    v_n := v_n + 1;
    v_slug := left(p_base, 76) || '-' || v_n;
  end loop;
  return v_slug;
end;
$$;

-- ---------------------------------------------------------------------
-- Créer un rayon, à la racine ou dans un autre ; il prend la dernière place.
-- ---------------------------------------------------------------------
create function public.gestion_creer_rayon(p_boutique_id uuid, p_nom text, p_slug text, p_parent_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nom  text := btrim(coalesce(p_nom, ''));
  v_base text := lower(btrim(coalesce(p_slug, '')));
  v_slug text;
  v_id   uuid;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if v_nom = '' or length(v_nom) > 80 then
    raise exception 'Le nom du rayon est obligatoire (80 caractères au plus)' using errcode = 'check_violation', hint = 'nom';
  end if;
  if v_base !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_base) > 80 then
    raise exception 'Adresse du rayon illisible : des minuscules, des chiffres et des tirets' using errcode = 'check_violation', hint = 'slug';
  end if;
  if p_parent_id is not null then
    if not exists (select 1 from public.categories c where c.boutique_id = p_boutique_id and c.id = p_parent_id) then
      raise exception 'Rayon parent inconnu' using errcode = 'check_violation', hint = 'parent';
    end if;
    if private.rayon_profondeur(p_boutique_id, p_parent_id) >= 3 then
      raise exception 'Trois niveaux au plus : ce rayon est déjà un sous-sous-rayon' using errcode = 'check_violation', hint = 'profondeur';
    end if;
  end if;
  v_slug := private.rayon_adresse_libre(p_boutique_id, v_base, null);
  insert into public.categories (boutique_id, parent_id, slug, nom_fr, position)
  values (p_boutique_id, p_parent_id, v_slug, v_nom,
          coalesce((select max(c.position) + 1 from public.categories c
                     where c.boutique_id = p_boutique_id and c.parent_id is not distinct from p_parent_id), 0))
  returning id into v_id;
  perform private.console_trace(auth.uid(), p_boutique_id, 'rayon.creer', v_id::text, null,
    jsonb_build_object('nom', v_nom, 'slug', v_slug, 'parent_id', p_parent_id));
  return jsonb_build_object('id', v_id, 'slug', v_slug);
end;
$$;

-- ---------------------------------------------------------------------
-- La fiche d'un rayon : nom, adresse, description, parent, visible.
-- ---------------------------------------------------------------------
create function public.gestion_modifier_rayon(p_boutique_id uuid, p_rayon_id uuid, p_version timestamptz, p_champs jsonb)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant  public.categories;
  v_nom    text := btrim(coalesce(p_champs ->> 'nom', ''));
  v_slug   text := lower(btrim(coalesce(p_champs ->> 'slug', '')));
  v_desc   text := nullif(btrim(coalesce(p_champs ->> 'description', '')), '');
  v_parent uuid := nullif(p_champs ->> 'parent_id', '')::uuid;
  v_actif  boolean := coalesce((p_champs ->> 'actif')::boolean, true);
  v_hauteur integer;
  v_maj    timestamptz;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  select * into v_avant from public.categories c where c.boutique_id = p_boutique_id and c.id = p_rayon_id for update;
  if not found then
    raise exception 'Rayon introuvable' using errcode = 'no_data_found', hint = 'rayon';
  end if;
  if p_version is not null and v_avant.updated_at <> p_version then
    raise exception 'Le rayon a été modifié entre-temps' using errcode = 'check_violation', hint = 'change';
  end if;
  if v_nom = '' or length(v_nom) > 80 then
    raise exception 'Le nom du rayon est obligatoire (80 caractères au plus)' using errcode = 'check_violation', hint = 'nom';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) > 80 then
    raise exception 'Adresse du rayon illisible : des minuscules, des chiffres et des tirets' using errcode = 'check_violation', hint = 'slug';
  end if;
  if v_slug <> v_avant.slug and (
       exists (select 1 from public.categories c where c.boutique_id = p_boutique_id and c.slug = v_slug and c.id <> p_rayon_id)
    or exists (select 1 from public.rayons_anciennes_adresses a where a.boutique_id = p_boutique_id and a.slug = v_slug and a.categorie_id <> p_rayon_id)) then
    raise exception 'Cette adresse est déjà celle d''un autre rayon' using errcode = 'check_violation', hint = 'slug_pris';
  end if;
  if length(coalesce(v_desc, '')) > 2000 then
    raise exception 'La description dépasse 2 000 caractères' using errcode = 'check_violation', hint = 'description';
  end if;
  if v_parent is not null then
    if not exists (select 1 from public.categories c where c.boutique_id = p_boutique_id and c.id = v_parent) then
      raise exception 'Rayon parent inconnu' using errcode = 'check_violation', hint = 'parent';
    end if;
    if exists (select 1 from private.rayon_descendants(p_boutique_id, p_rayon_id) d where d.id = v_parent) then
      raise exception 'Un rayon ne peut pas aller dans lui-même ni dans un de ses sous-rayons' using errcode = 'check_violation', hint = 'boucle';
    end if;
    select max(d.n) into v_hauteur from private.rayon_descendants(p_boutique_id, p_rayon_id) d;
    if private.rayon_profondeur(p_boutique_id, v_parent) + v_hauteur > 3 then
      raise exception 'Trois niveaux au plus : avec ses sous-rayons, ce rayon n''y tient pas' using errcode = 'check_violation', hint = 'profondeur';
    end if;
  end if;

  -- L'ancienne adresse reste : les liens déjà posés mènent toujours au rayon.
  if v_slug <> v_avant.slug then
    delete from public.rayons_anciennes_adresses a where a.boutique_id = p_boutique_id and a.slug = v_slug;
    insert into public.rayons_anciennes_adresses (boutique_id, slug, categorie_id)
    values (p_boutique_id, v_avant.slug, p_rayon_id)
    on conflict (boutique_id, slug) do update set categorie_id = excluded.categorie_id, quitte_le = now();
  end if;

  update public.categories c set
    nom_fr         = v_nom,
    slug           = v_slug,
    description_fr = v_desc,
    actif          = v_actif,
    parent_id      = v_parent,
    -- Changé de parent : la dernière place parmi ses nouveaux voisins.
    position       = case when v_parent is distinct from v_avant.parent_id
                          then coalesce((select max(x.position) + 1 from public.categories x
                                          where x.boutique_id = p_boutique_id and x.parent_id is not distinct from v_parent and x.id <> p_rayon_id), 0)
                          else c.position end
  where c.boutique_id = p_boutique_id and c.id = p_rayon_id
  returning c.updated_at into v_maj;

  perform private.console_trace(auth.uid(), p_boutique_id, 'rayon.modifier', p_rayon_id::text,
    jsonb_build_object('nom', v_avant.nom_fr, 'slug', v_avant.slug, 'parent_id', v_avant.parent_id, 'actif', v_avant.actif),
    jsonb_build_object('nom', v_nom, 'slug', v_slug, 'parent_id', v_parent, 'actif', v_actif));
  return v_maj;
end;
$$;

-- ---------------------------------------------------------------------
-- Monter ou descendre un rayon parmi ses voisins (même parent).
-- ---------------------------------------------------------------------
create function public.gestion_deplacer_rayon(p_boutique_id uuid, p_rayon_id uuid, p_sens text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_parent uuid;
  v_ids    uuid[];
  v_i      integer;
  v_j      integer;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if p_sens not in ('haut', 'bas') then
    raise exception 'Sens inconnu' using errcode = 'check_violation', hint = 'sens';
  end if;
  select c.parent_id into v_parent from public.categories c where c.boutique_id = p_boutique_id and c.id = p_rayon_id;
  if not found then
    raise exception 'Rayon introuvable' using errcode = 'no_data_found', hint = 'rayon';
  end if;
  -- Les voisins dans l'ordre de la vitrine, renumérotés 0, 1, 2… puis l'échange.
  select array_agg(c.id order by c.position, coalesce(c.nom_fr, c.nom_ar)) into v_ids
    from public.categories c where c.boutique_id = p_boutique_id and c.parent_id is not distinct from v_parent;
  v_i := array_position(v_ids, p_rayon_id);
  v_j := case p_sens when 'haut' then v_i - 1 else v_i + 1 end;
  if v_j < 1 or v_j > cardinality(v_ids) then
    return;  -- déjà premier (ou dernier) : rien à faire
  end if;
  v_ids[v_i] := v_ids[v_j];
  v_ids[v_j] := p_rayon_id;
  update public.categories c set position = (o.n - 1)::smallint
    from unnest(v_ids) with ordinality as o(id, n)
   where c.boutique_id = p_boutique_id and c.id = o.id and c.position is distinct from (o.n - 1)::smallint;
  perform private.console_trace(auth.uid(), p_boutique_id, 'rayon.ordonner', p_rayon_id::text, null, jsonb_build_object('sens', p_sens));
end;
$$;

-- ---------------------------------------------------------------------
-- L'image d'un rayon (tuiles de l'accueil, menu du téléphone) : le chemin
-- d'un fichier déjà déposé, ou null pour la retirer. Rend l'ancien chemin,
-- que l'application retire du dépôt.
-- ---------------------------------------------------------------------
create function public.gestion_image_rayon(p_boutique_id uuid, p_rayon_id uuid, p_chemin text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ancien text;
  v_slug   text;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  select b.slug into v_slug from plateforme.boutiques b where b.id = p_boutique_id;
  if p_chemin is not null and (p_chemin !~ '^[a-z0-9-]+/rayons/[0-9a-f-]{36}/[a-z0-9]{12}\.(webp|jpe?g|png)$' or split_part(p_chemin, '/', 1) <> v_slug) then
    raise exception 'Chemin d''image refusé' using errcode = 'check_violation', hint = 'chemin';
  end if;
  select c.image_chemin into v_ancien from public.categories c where c.boutique_id = p_boutique_id and c.id = p_rayon_id for update;
  if not found then
    raise exception 'Rayon introuvable' using errcode = 'no_data_found', hint = 'rayon';
  end if;
  update public.categories c set image_chemin = p_chemin where c.boutique_id = p_boutique_id and c.id = p_rayon_id;
  perform private.console_trace(auth.uid(), p_boutique_id, 'rayon.image', p_rayon_id::text,
    jsonb_build_object('image', v_ancien), jsonb_build_object('image', p_chemin));
  return v_ancien;
end;
$$;

-- ---------------------------------------------------------------------
-- Retirer un rayon : ses produits vont dans p_vers (null : sans rayon), ses
-- sous-rayons montent d'un niveau. Rend ce qui a bougé, et l'image à retirer.
-- ---------------------------------------------------------------------
create function public.gestion_retirer_rayon(p_boutique_id uuid, p_rayon_id uuid, p_vers uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r          public.categories;
  v_produits   integer;
  v_sous       integer;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  select * into v_r from public.categories c where c.boutique_id = p_boutique_id and c.id = p_rayon_id for update;
  if not found then
    raise exception 'Rayon introuvable' using errcode = 'no_data_found', hint = 'rayon';
  end if;
  if p_vers is not null then
    if not exists (select 1 from public.categories c where c.boutique_id = p_boutique_id and c.id = p_vers) then
      raise exception 'Rayon de destination inconnu' using errcode = 'check_violation', hint = 'vers';
    end if;
    -- Un de ses sous-rayons, oui : il reste (monté d'un niveau).
    if p_vers = p_rayon_id then
      raise exception 'Les produits ne peuvent pas rester dans le rayon retiré' using errcode = 'check_violation', hint = 'vers';
    end if;
  end if;

  update public.produits p set categorie_id = p_vers where p.boutique_id = p_boutique_id and p.categorie_id = p_rayon_id;
  get diagnostics v_produits = row_count;
  -- Les sous-rayons montent d'un niveau, à la suite de leurs nouveaux voisins.
  update public.categories c set parent_id = v_r.parent_id,
         position = (c.position + coalesce((select max(x.position) + 1 from public.categories x
                                            where x.boutique_id = p_boutique_id and x.parent_id is not distinct from v_r.parent_id), 0))::smallint
   where c.boutique_id = p_boutique_id and c.parent_id = p_rayon_id;
  get diagnostics v_sous = row_count;
  -- Son adresse (et celles qu'il avait quittées) mène au rayon qui reçoit
  -- ses produits : les liens déjà posés ne tombent pas dans le vide.
  if p_vers is not null then
    update public.rayons_anciennes_adresses a set categorie_id = p_vers
     where a.boutique_id = p_boutique_id and a.categorie_id = p_rayon_id;
    insert into public.rayons_anciennes_adresses (boutique_id, slug, categorie_id)
    values (p_boutique_id, v_r.slug, p_vers)
    on conflict (boutique_id, slug) do update set categorie_id = excluded.categorie_id, quitte_le = now();
  end if;
  delete from public.categories c where c.boutique_id = p_boutique_id and c.id = p_rayon_id;

  perform private.console_trace(auth.uid(), p_boutique_id, 'rayon.retirer', p_rayon_id::text,
    jsonb_build_object('nom', v_r.nom_fr, 'slug', v_r.slug, 'parent_id', v_r.parent_id),
    jsonb_build_object('produits', v_produits, 'vers', p_vers, 'sous_rayons', v_sous));
  return jsonb_build_object('produits', v_produits, 'sous_rayons', v_sous, 'image', v_r.image_chemin);
end;
$$;

-- ---------------------------------------------------------------------
-- La vitrine : une adresse qu'un rayon a quittée mène à son adresse d'aujourd'hui.
-- ---------------------------------------------------------------------
create function public.rayon_par_ancienne_adresse(p_boutique_id uuid, p_slug text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.slug
    from public.rayons_anciennes_adresses a
    join public.categories c on c.boutique_id = a.boutique_id and c.id = a.categorie_id and c.actif
   where a.boutique_id = p_boutique_id and a.slug = p_slug
$$;

comment on function public.gestion_rayons(uuid) is 'Les rayons de la boutique (arbre, contenus). Toute l''équipe lit.';
comment on function public.rayon_par_ancienne_adresse(uuid, text) is 'L''adresse d''aujourd''hui d''un rayon, à partir d''une adresse qu''il a quittée (vitrine).';

revoke execute on function private.rayon_profondeur(uuid, uuid)                 from public, anon, authenticated;
revoke execute on function private.rayon_descendants(uuid, uuid)                from public, anon, authenticated;
revoke execute on function private.rayon_adresse_libre(uuid, text, uuid)        from public, anon, authenticated;
revoke execute on function public.gestion_rayons(uuid)                          from public, anon;
revoke execute on function public.gestion_creer_rayon(uuid, text, text, uuid)   from public, anon;
revoke execute on function public.gestion_modifier_rayon(uuid, uuid, timestamptz, jsonb) from public, anon;
revoke execute on function public.gestion_deplacer_rayon(uuid, uuid, text)      from public, anon;
revoke execute on function public.gestion_image_rayon(uuid, uuid, text)         from public, anon;
revoke execute on function public.gestion_retirer_rayon(uuid, uuid, uuid)       from public, anon;
grant  execute on function public.gestion_rayons(uuid)                          to authenticated;
grant  execute on function public.gestion_creer_rayon(uuid, text, text, uuid)   to authenticated;
grant  execute on function public.gestion_modifier_rayon(uuid, uuid, timestamptz, jsonb) to authenticated;
grant  execute on function public.gestion_deplacer_rayon(uuid, uuid, text)      to authenticated;
grant  execute on function public.gestion_image_rayon(uuid, uuid, text)         to authenticated;
grant  execute on function public.gestion_retirer_rayon(uuid, uuid, uuid)       to authenticated;
grant  execute on function public.rayon_par_ancienne_adresse(uuid, text)        to anon, authenticated;
