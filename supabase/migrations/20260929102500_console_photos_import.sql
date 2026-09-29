-- =====================================================================
-- SkanEcom — 26 · CONSOLE C5 : LES PHOTOS DES PRODUITS À L'IMPORT
-- 29/09/2026 — étape 1, tâche « console » (PRD §6.1 C5 : « produits,
-- variantes, prix, stock, photos »)
-- =====================================================================
--
-- Un fournisseur livre son catalogue avec un dossier de photos, nommées
-- d'après ses références : DCD791-KIT.jpg, DCD791-KIT-2.jpg… La console les
-- range d'un coup : le navigateur lit le dossier (ou le .zip), rapproche
-- chaque fichier d'un produit par sa référence (ou son nom), montre le
-- rapport, réduit chaque photo, puis l'envoie ; le serveur la dépose sous
-- `<slug>/produits/<produit>/` et public.console_ajouter_photo l'inscrit.
--
-- Chaque envoi forme un LOT (plateforme.lots_photos) : tracé une fois au
-- journal d'audit, compté (photos, produits), et qu'on retire d'un geste si
-- le rapprochement s'est trompé (public.console_retirer_lot_photos) — les
-- photos ajoutées au backoffice n'en font jamais partie.

alter table public.produit_images add column lot_import uuid;

comment on column public.produit_images.lot_import is
  'Le lot d''import de la console qui a déposé cette photo (plateforme.lots_photos) ; null pour une photo ajoutée au backoffice.';

create index produit_images_lot_idx on public.produit_images (boutique_id, lot_import) where lot_import is not null;

create table plateforme.lots_photos (
  id          uuid primary key,
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  acteur      uuid references auth.users (id) on delete set null,
  cree_le     timestamptz not null default now(),
  retire_le   timestamptz,
  retire_par  uuid references auth.users (id) on delete set null
);

create index lots_photos_boutique_idx on plateforme.lots_photos (boutique_id, cree_le desc);

comment on table plateforme.lots_photos is
  'Les envois de photos de la console (un lot par envoi) : tracés au journal, retirables d''un geste.';

alter table plateforme.lots_photos enable row level security;
revoke all on plateforme.lots_photos from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- Le catalogue à rapprocher : chaque produit, son nom, son identifiant
-- d'adresse, ses photos, et ses déclinaisons avec leur référence.
-- ---------------------------------------------------------------------
create function public.console_references(p_boutique_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'nom', p.nom_fr, 'slug', p.slug, 'publie', p.publie,
           'photos', (select count(*) from public.produit_images i where i.boutique_id = p.boutique_id and i.produit_id = p.id),
           'variantes', coalesce((select jsonb_agg(jsonb_build_object(
                                           'id', v.id, 'sku', v.sku,
                                           'libelle', private.libelle_variante(p.boutique_id, p.id, v.options))
                                         order by v.position, v.sku)
                                    from public.variantes v where v.boutique_id = p.boutique_id and v.produit_id = p.id), '[]'::jsonb))
         order by p.nom_fr, p.id), '[]'::jsonb)
    from public.produits p
   where p.boutique_id = p_boutique_id;
$$;


-- ---------------------------------------------------------------------
-- Inscrire une photo déposée, dans son lot
-- ---------------------------------------------------------------------
create function public.console_ajouter_photo(
  p_acteur      uuid,
  p_boutique_id uuid,
  p_lot         uuid,
  p_produit_id  uuid,
  p_variante_id uuid,
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
  v_slug    text;
  v_nouveau uuid;
  v_lot     plateforme.lots_photos;
  v_id      uuid;
begin
  perform private.console_exige_admin(p_acteur);
  if p_lot is null then
    raise exception 'Envoi sans lot : rechargez la page' using errcode = 'check_violation', hint = 'lot';
  end if;
  perform private.photos_produit(p_boutique_id, p_produit_id);
  select b.slug into v_slug from plateforme.boutiques b where b.id = p_boutique_id;
  if p_chemin is null or p_chemin not like v_slug || '/produits/' || p_produit_id::text || '/%' then
    raise exception 'Une photo de ce produit se range sous %/produits/%/', v_slug, p_produit_id
      using errcode = 'check_violation', hint = 'chemin';
  end if;
  if p_variante_id is not null and not exists (
    select 1 from public.variantes v
     where v.boutique_id = p_boutique_id and v.produit_id = p_produit_id and v.id = p_variante_id) then
    raise exception 'Cette déclinaison n''est pas celle du produit' using errcode = 'check_violation', hint = 'variante';
  end if;
  if (select count(*) from public.produit_images i where i.boutique_id = p_boutique_id and i.produit_id = p_produit_id) >= private.photos_max() then
    raise exception 'Ce produit a déjà % photos', private.photos_max() using errcode = 'check_violation', hint = 'photos';
  end if;

  insert into plateforme.lots_photos (id, boutique_id, acteur) values (p_lot, p_boutique_id, p_acteur)
  on conflict (id) do nothing
  returning id into v_nouveau;
  if v_nouveau is not null then
    perform private.console_trace(p_acteur, p_boutique_id, 'catalogue.photos', p_lot::text, null, jsonb_build_object('lot', p_lot));
  end if;
  select * into v_lot from plateforme.lots_photos l where l.id = p_lot;
  if v_lot.boutique_id <> p_boutique_id or v_lot.retire_le is not null then
    raise exception 'Ce lot de photos est clos : rechargez la page' using errcode = 'check_violation', hint = 'lot';
  end if;

  insert into public.produit_images (boutique_id, produit_id, variante_id, chemin, alt_fr, position, lot_import)
  values (p_boutique_id, p_produit_id, p_variante_id, p_chemin, nullif(left(btrim(coalesce(p_alt, '')), 200), ''),
          (select coalesce(max(i.position) + 1, 0) from public.produit_images i
            where i.boutique_id = p_boutique_id and i.produit_id = p_produit_id),
          p_lot)
  returning id into v_id;
  return v_id;
end;
$$;


-- ---------------------------------------------------------------------
-- Les derniers lots d'une boutique, comptés
-- ---------------------------------------------------------------------
create function public.console_lots_photos(p_boutique_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x.ligne order by x.cree_le desc), '[]'::jsonb)
    from (select l.cree_le, jsonb_build_object(
                   'id', l.id, 'cree_le', l.cree_le,
                   'qui', (select u.email from auth.users u where u.id = l.acteur),
                   'photos', (select count(*) from public.produit_images i where i.boutique_id = l.boutique_id and i.lot_import = l.id),
                   'produits', (select count(distinct i.produit_id) from public.produit_images i
                                 where i.boutique_id = l.boutique_id and i.lot_import = l.id),
                   'retire_le', l.retire_le,
                   'retire_par', (select u.email from auth.users u where u.id = l.retire_par)) as ligne
            from plateforme.lots_photos l
           where l.boutique_id = p_boutique_id
           order by l.cree_le desc
           limit 10) x;
$$;


-- ---------------------------------------------------------------------
-- Retirer un lot : ses photos quittent les produits (les autres photos se
-- resserrent), et la base rend les fichiers que plus rien n'emploie.
-- ---------------------------------------------------------------------
create function public.console_retirer_lot_photos(p_acteur uuid, p_boutique_id uuid, p_lot uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lot       plateforme.lots_photos;
  v_produit   uuid;
  v_chemins   text[];
  v_produits  uuid[];
  v_orphelins text[];
begin
  perform private.console_exige_admin(p_acteur);
  select * into v_lot from plateforme.lots_photos l where l.id = p_lot and l.boutique_id = p_boutique_id for update;
  if v_lot.id is null then
    raise exception 'Lot de photos introuvable' using errcode = 'no_data_found', hint = 'lot';
  end if;
  if v_lot.retire_le is not null then
    raise exception 'Ces photos sont déjà retirées' using errcode = 'check_violation', hint = 'lot';
  end if;

  with retirees as (
    delete from public.produit_images i
     where i.boutique_id = p_boutique_id and i.lot_import = p_lot
    returning i.chemin, i.produit_id
  )
  select coalesce(array_agg(r.chemin), '{}'), coalesce(array_agg(distinct r.produit_id), '{}')
    into v_chemins, v_produits
    from retirees r;

  foreach v_produit in array v_produits loop
    perform private.photos_produit(p_boutique_id, v_produit);
    perform private.photos_ranger(p_boutique_id, v_produit);
  end loop;

  select coalesce(array_agg(distinct c), '{}') into v_orphelins
    from unnest(v_chemins) c
   where not exists (select 1 from public.produit_images i where i.chemin = c);

  update plateforme.lots_photos set retire_le = now(), retire_par = p_acteur where id = p_lot;
  perform private.console_trace(p_acteur, p_boutique_id, 'catalogue.photos_retirees', p_lot::text,
    jsonb_build_object('photos', cardinality(v_chemins), 'produits', cardinality(v_produits)), null);

  return jsonb_build_object('retirees', cardinality(v_chemins), 'produits', cardinality(v_produits), 'orphelins', to_jsonb(v_orphelins));
end;
$$;

revoke execute on function public.console_references(uuid)                                          from public, anon, authenticated;
revoke execute on function public.console_ajouter_photo(uuid, uuid, uuid, uuid, uuid, text, text)   from public, anon, authenticated;
revoke execute on function public.console_lots_photos(uuid)                                         from public, anon, authenticated;
revoke execute on function public.console_retirer_lot_photos(uuid, uuid, uuid)                      from public, anon, authenticated;
grant  execute on function public.console_references(uuid)                                          to service_role;
grant  execute on function public.console_ajouter_photo(uuid, uuid, uuid, uuid, uuid, text, text)   to service_role;
grant  execute on function public.console_lots_photos(uuid)                                         to service_role;
grant  execute on function public.console_retirer_lot_photos(uuid, uuid, uuid)                      to service_role;
