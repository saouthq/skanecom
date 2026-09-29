-- =====================================================================
-- SkanEcom — 12 · BACKOFFICE : LES PHOTOS DES PRODUITS (PRD §6.2 B1)
-- =====================================================================
-- Les fichiers eux-mêmes vivent sur R2, sous le dossier de la boutique
-- (`<slug>/produits/…`) : l'application les dépose, la base n'en garde que
-- le chemin (public.produit_images, migration 03 ; chemin vérifié par
-- private.valide_chemin, migration 05).
--
-- Chaque geste passe par une fonction qui revérifie le rôle (propriétaire,
-- admin) et tient l'ordre des photos sans trou (0, 1, 2…) : la première est
-- celle des listes de la vitrine. Une photo peut être attitrée à une
-- déclinaison (la couleur Noir) ; sinon elle vaut pour tout le produit.
-- Le produit est verrouillé le temps du geste : deux personnes qui rangent
-- les mêmes photos passent l'une après l'autre.
-- =====================================================================

-- Au plus douze photos par produit : au-delà, personne ne les regarde, et la
-- page se charge moins vite.
create function private.photos_max()
returns integer
language sql
immutable
set search_path = ''
as $$ select 12 $$;

-- Verrouille le produit (dans sa boutique) et rend son identifiant, ou
-- refuse s'il n'existe pas ici.
create function private.photos_produit(p_boutique_id uuid, p_produit_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select p.id into v_id from public.produits p
   where p.boutique_id = p_boutique_id and p.id = p_produit_id
   for no key update;
  if v_id is null then
    raise exception 'Produit introuvable' using errcode = 'no_data_found', hint = 'produit';
  end if;
  return v_id;
end;
$$;

-- Range les photos d'un produit dans l'ordre donné (les autres suivent,
-- dans leur ordre actuel), positions 0, 1, 2… sans trou.
create function private.photos_ranger(p_boutique_id uuid, p_produit_id uuid, p_ordre uuid[] default '{}')
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.produit_images i set position = o.rang - 1
    from (select x.id, row_number() over (order by coalesce(array_position(p_ordre, x.id), 100000), x.position, x.created_at, x.id) as rang
            from public.produit_images x
           where x.boutique_id = p_boutique_id and x.produit_id = p_produit_id) o
   where i.boutique_id = p_boutique_id and i.id = o.id and i.position <> o.rang - 1;
$$;


-- ---------------------------------------------------------------------
-- Ajouter une photo (le fichier est déjà déposé)
-- ---------------------------------------------------------------------
create function public.gestion_ajouter_photo(
  p_boutique_id uuid,
  p_produit_id  uuid,
  p_chemin      text,
  p_alt         text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_slug text;
  v_id   uuid;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  perform private.photos_produit(p_boutique_id, p_produit_id);
  select b.slug into v_slug from plateforme.boutiques b where b.id = p_boutique_id;
  if p_chemin is null or p_chemin not like v_slug || '/produits/%' then
    raise exception 'Une photo de produit se range sous %/produits/', v_slug using errcode = 'check_violation', hint = 'chemin';
  end if;
  if (select count(*) from public.produit_images i where i.boutique_id = p_boutique_id and i.produit_id = p_produit_id) >= private.photos_max() then
    raise exception 'Ce produit a déjà % photos : retirez-en une avant d''en ajouter', private.photos_max()
      using errcode = 'check_violation', hint = 'photos';
  end if;

  insert into public.produit_images (boutique_id, produit_id, chemin, alt_fr, position)
  values (p_boutique_id, p_produit_id, p_chemin, nullif(btrim(coalesce(p_alt, '')), ''),
          (select coalesce(max(i.position) + 1, 0) from public.produit_images i
            where i.boutique_id = p_boutique_id and i.produit_id = p_produit_id))
  returning id into v_id;
  return v_id;
end;
$$;


-- ---------------------------------------------------------------------
-- Légender une photo, l'attitrer à une déclinaison (ou à tout le produit)
-- ---------------------------------------------------------------------
create function public.gestion_modifier_photo(
  p_boutique_id uuid,
  p_image_id    uuid,
  p_alt         text,
  p_variante_id uuid default null
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
  select i.produit_id into v_produit from public.produit_images i
   where i.boutique_id = p_boutique_id and i.id = p_image_id;
  if v_produit is null then
    raise exception 'Photo introuvable' using errcode = 'no_data_found', hint = 'photo';
  end if;
  perform private.photos_produit(p_boutique_id, v_produit);
  if p_variante_id is not null and not exists (
       select 1 from public.variantes v
        where v.boutique_id = p_boutique_id and v.id = p_variante_id and v.produit_id = v_produit) then
    raise exception 'Cette déclinaison n''est pas celle de ce produit' using errcode = 'check_violation', hint = 'variante';
  end if;
  if length(coalesce(p_alt, '')) > 200 then
    raise exception 'Description trop longue (200 caractères au plus)' using errcode = 'check_violation', hint = 'alt';
  end if;

  update public.produit_images set
    alt_fr = nullif(btrim(coalesce(p_alt, '')), ''), variante_id = p_variante_id
  where boutique_id = p_boutique_id and id = p_image_id;
end;
$$;


-- ---------------------------------------------------------------------
-- Déplacer une photo : avant, après, en première
-- ---------------------------------------------------------------------
create function public.gestion_deplacer_photo(
  p_boutique_id uuid,
  p_image_id    uuid,
  p_vers        text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_produit uuid;
  v_ordre   uuid[];
  v_rang    integer;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if p_vers is null or p_vers not in ('avant', 'apres', 'premiere') then
    raise exception 'Déplacement inconnu : %', p_vers using errcode = 'check_violation', hint = 'vers';
  end if;
  select i.produit_id into v_produit from public.produit_images i
   where i.boutique_id = p_boutique_id and i.id = p_image_id;
  if v_produit is null then
    raise exception 'Photo introuvable' using errcode = 'no_data_found', hint = 'photo';
  end if;
  perform private.photos_produit(p_boutique_id, v_produit);

  select array_agg(i.id order by i.position, i.created_at, i.id) into v_ordre
    from public.produit_images i where i.boutique_id = p_boutique_id and i.produit_id = v_produit;
  v_rang := array_position(v_ordre, p_image_id);

  if p_vers = 'premiere' then
    v_ordre := array_prepend(p_image_id, array_remove(v_ordre, p_image_id));
  elsif p_vers = 'avant' and v_rang > 1 then
    v_ordre[v_rang] := v_ordre[v_rang - 1];
    v_ordre[v_rang - 1] := p_image_id;
  elsif p_vers = 'apres' and v_rang < cardinality(v_ordre) then
    v_ordre[v_rang] := v_ordre[v_rang + 1];
    v_ordre[v_rang + 1] := p_image_id;
  end if;
  perform private.photos_ranger(p_boutique_id, v_produit, v_ordre);
end;
$$;


-- ---------------------------------------------------------------------
-- Retirer une photo. Rend son chemin, et si plus rien d'autre dans la
-- boutique ne s'en sert (le fichier peut alors quitter R2).
-- ---------------------------------------------------------------------
create function public.gestion_retirer_photo(
  p_boutique_id uuid,
  p_image_id    uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_produit uuid;
  v_chemin  text;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  select i.produit_id, i.chemin into v_produit, v_chemin from public.produit_images i
   where i.boutique_id = p_boutique_id and i.id = p_image_id;
  if v_produit is null then
    raise exception 'Photo introuvable' using errcode = 'no_data_found', hint = 'photo';
  end if;
  perform private.photos_produit(p_boutique_id, v_produit);

  delete from public.produit_images where boutique_id = p_boutique_id and id = p_image_id;
  perform private.photos_ranger(p_boutique_id, v_produit);

  return jsonb_build_object(
    'chemin', v_chemin,
    'orphelin', not exists (select 1 from public.produit_images i where i.boutique_id = p_boutique_id and i.chemin = v_chemin)
            and not exists (select 1 from public.variantes v where v.boutique_id = p_boutique_id and v.image_chemin = v_chemin)
            and not exists (select 1 from public.categories c where c.boutique_id = p_boutique_id and c.image_chemin = v_chemin));
end;
$$;


revoke execute on function private.photos_max()                                   from public, anon, authenticated;
revoke execute on function private.photos_produit(uuid, uuid)                      from public, anon, authenticated;
revoke execute on function private.photos_ranger(uuid, uuid, uuid[])               from public, anon, authenticated;
revoke execute on function public.gestion_ajouter_photo(uuid, uuid, text, text)     from public, anon;
revoke execute on function public.gestion_modifier_photo(uuid, uuid, text, uuid)    from public, anon;
revoke execute on function public.gestion_deplacer_photo(uuid, uuid, text)          from public, anon;
revoke execute on function public.gestion_retirer_photo(uuid, uuid)                 from public, anon;
grant  execute on function public.gestion_ajouter_photo(uuid, uuid, text, text)     to authenticated;
grant  execute on function public.gestion_modifier_photo(uuid, uuid, text, uuid)    to authenticated;
grant  execute on function public.gestion_deplacer_photo(uuid, uuid, text)          to authenticated;
grant  execute on function public.gestion_retirer_photo(uuid, uuid)                 to authenticated;
