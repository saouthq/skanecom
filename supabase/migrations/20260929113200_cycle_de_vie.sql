-- =====================================================================
-- LE CYCLE DE VIE D'UNE BOUTIQUE, DEPUIS LA CONSOLE
--
-- · Renommer (le nom seulement : l'identifiant d'adresse reste, les liens
--   déjà partagés aussi).
-- · Un domaine : le rendre principal, ou le retirer (jamais le principal,
--   jamais le dernier, jamais l'adresse de la plateforme).
-- · Cloner la configuration d'une boutique dans une boutique neuve, vide :
--   son apparence (sans ses images, qui restent les siennes), ses réglages
--   (sans son identité : légal, contact, pixels, retrait), sa livraison
--   (zones, gouvernorats, tranches de poids), ses rayons et leurs
--   caractéristiques. Ni le catalogue, ni les clients, ni les commandes.
-- La fermeture (« archiver ») est le statut « fermee », déjà connu.
-- =====================================================================

create function public.console_renommer_boutique(p_acteur uuid, p_boutique_id uuid, p_nom text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant text;
  v_nom   text := btrim(coalesce(p_nom, ''));
begin
  perform private.console_exige_admin(p_acteur);
  select b.nom into v_avant from plateforme.boutiques b where b.id = p_boutique_id for update;
  if v_avant is null then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  if length(v_nom) < 2 or length(v_nom) > 80 then
    raise exception 'Le nom fait de 2 à 80 caractères' using errcode = 'check_violation', hint = 'nom';
  end if;
  if v_nom = v_avant then
    return false;
  end if;
  update plateforme.boutiques set nom = v_nom, updated_at = now() where id = p_boutique_id;
  perform private.console_trace(p_acteur, p_boutique_id, 'boutique.renommer', v_nom,
    jsonb_build_object('nom', v_avant), jsonb_build_object('nom', v_nom));
  return true;
end;
$$;

create function public.console_domaine_principal(p_acteur uuid, p_boutique_id uuid, p_hote text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  if not exists (select 1 from plateforme.domaines d where d.boutique_id = p_boutique_id and d.hote = lower(p_hote)) then
    raise exception 'Domaine introuvable pour cette boutique' using errcode = 'no_data_found';
  end if;
  -- En deux temps : l'index « un seul principal » est vérifié ligne à ligne.
  update plateforme.domaines set principal = false where boutique_id = p_boutique_id and principal and hote <> lower(p_hote);
  update plateforme.domaines set principal = true where boutique_id = p_boutique_id and hote = lower(p_hote);
  perform private.console_trace(p_acteur, p_boutique_id, 'domaine.principal', lower(p_hote), null, null);
end;
$$;

create function public.console_retirer_domaine(p_acteur uuid, p_boutique_id uuid, p_hote text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  d plateforme.domaines;
begin
  if private.console_exige_admin(p_acteur) <> 'super_admin' then
    raise exception 'Seul un super-administrateur peut le faire : le rôle support aide, sans engager la boutique'
      using errcode = 'insufficient_privilege';
  end if;
  select * into d from plateforme.domaines x where x.boutique_id = p_boutique_id and x.hote = lower(p_hote) for update;
  if not found then
    raise exception 'Domaine introuvable pour cette boutique' using errcode = 'no_data_found';
  end if;
  if d.type = 'sous_domaine' then
    raise exception 'L''adresse de la plateforme ne se retire pas : elle mène toujours à la vitrine' using errcode = 'check_violation', hint = 'domaine';
  end if;
  if d.principal then
    raise exception 'Le domaine principal ne se retire pas : rendez d''abord un autre domaine principal' using errcode = 'check_violation', hint = 'domaine';
  end if;
  delete from plateforme.domaines where boutique_id = p_boutique_id and hote = d.hote;
  perform private.console_trace(p_acteur, p_boutique_id, 'domaine.retirer', d.hote, jsonb_build_object('type', d.type), null);
end;
$$;

create function public.console_cloner_configuration(p_acteur uuid, p_source uuid, p_cible uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t        public.themes;
  v_map    jsonb := '{}'::jsonb;
  v_zones  jsonb := '{}'::jsonb;
  v_attrs  jsonb := '{}'::jsonb;
  r        record;
  v_id     uuid;
  n_reg    integer := 0;
  n_cat    integer := 0;
  n_zon    integer := 0;
  n_att    integer := 0;
begin
  perform private.console_exige_admin(p_acteur);
  if p_source = p_cible then
    raise exception 'Une boutique ne se clone pas dans elle-même' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from plateforme.boutiques b where b.id = p_source)
     or not exists (select 1 from plateforme.boutiques b where b.id = p_cible) then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.produits p where p.boutique_id = p_cible)
     or exists (select 1 from public.categories c where c.boutique_id = p_cible) then
    raise exception 'La boutique d''arrivée n''est pas vide : la configuration ne se clone que dans une boutique neuve'
      using errcode = 'check_violation', hint = 'non_vide';
  end if;

  -- L'apparence, sans images : celles de la source restent les siennes.
  select * into t from public.themes x where x.boutique_id = p_source;
  if found then
    update public.themes set code = t.code, couleurs = t.couleurs, polices = t.polices, style = t.style, textes = t.textes
     where boutique_id = p_cible;
  end if;

  -- Les réglages, sans l'identité de la source.
  insert into public.reglages (boutique_id, cle, valeur)
  select p_cible, r2.cle, r2.valeur from public.reglages r2
   where r2.boutique_id = p_source
     and r2.cle !~ '^(legal|contact|pub|retrait)\.'
  on conflict (boutique_id, cle) do update set valeur = excluded.valeur;
  get diagnostics n_reg = row_count;

  -- La livraison.
  for r in select * from public.zones_livraison z where z.boutique_id = p_source order by z.position, z.created_at loop
    insert into public.zones_livraison (boutique_id, nom_fr, nom_ar, frais_millimes, delai_jours_min, delai_jours_max, actif, position)
    values (p_cible, r.nom_fr, r.nom_ar, r.frais_millimes, r.delai_jours_min, r.delai_jours_max, r.actif, r.position)
    returning id into v_id;
    v_zones := v_zones || jsonb_build_object(r.id::text, v_id);
    n_zon := n_zon + 1;
  end loop;
  insert into public.zones_gouvernorats (boutique_id, gouvernorat_code, zone_id)
  select p_cible, zg.gouvernorat_code, (v_zones ->> zg.zone_id::text)::uuid
    from public.zones_gouvernorats zg where zg.boutique_id = p_source and v_zones ? zg.zone_id::text;
  insert into public.tranches_poids (boutique_id, jusqu_a_grammes, supplement_millimes)
  select p_cible, tp.jusqu_a_grammes, tp.supplement_millimes from public.tranches_poids tp where tp.boutique_id = p_source;

  -- Les rayons, les parents d'abord (sans leurs images).
  for r in
    with recursive arbre as (
      select c.*, 0 as profondeur from public.categories c where c.boutique_id = p_source and c.parent_id is null
      union all
      select c.*, a.profondeur + 1 from public.categories c join arbre a on c.parent_id = a.id where c.boutique_id = p_source
    )
    select * from arbre order by profondeur, position
  loop
    insert into public.categories (boutique_id, parent_id, slug, nom_fr, nom_ar, description_fr, description_ar, position, actif)
    values (p_cible, case when r.parent_id is null then null else (v_map ->> r.parent_id::text)::uuid end,
            r.slug, r.nom_fr, r.nom_ar, r.description_fr, r.description_ar, r.position, r.actif)
    returning id into v_id;
    v_map := v_map || jsonb_build_object(r.id::text, v_id);
    n_cat := n_cat + 1;
  end loop;

  -- Les caractéristiques, et leurs rayons.
  for r in select * from public.attributs a where a.boutique_id = p_source order by a.position, a.created_at loop
    insert into public.attributs (boutique_id, cle, label_fr, label_ar, unite, type, filtrable, en_carte, position)
    values (p_cible, r.cle, r.label_fr, r.label_ar, r.unite, r.type, r.filtrable, r.en_carte, r.position)
    returning id into v_id;
    v_attrs := v_attrs || jsonb_build_object(r.id::text, v_id);
    n_att := n_att + 1;
  end loop;
  insert into public.rayon_attributs (boutique_id, categorie_id, attribut_id)
  select p_cible, (v_map ->> ra.categorie_id::text)::uuid, (v_attrs ->> ra.attribut_id::text)::uuid
    from public.rayon_attributs ra
   where ra.boutique_id = p_source and v_map ? ra.categorie_id::text and v_attrs ? ra.attribut_id::text;

  perform private.console_trace(p_acteur, p_cible, 'boutique.cloner', p_source::text, null,
    jsonb_build_object('source', (select b.slug from plateforme.boutiques b where b.id = p_source),
                       'reglages', n_reg, 'rayons', n_cat, 'zones', n_zon, 'caracteristiques', n_att));
  return jsonb_build_object('reglages', n_reg, 'rayons', n_cat, 'zones', n_zon, 'caracteristiques', n_att);
end;
$$;

revoke execute on function public.console_renommer_boutique(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.console_domaine_principal(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.console_retirer_domaine(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.console_cloner_configuration(uuid, uuid, uuid) from public, anon, authenticated;
grant  execute on function public.console_renommer_boutique(uuid, uuid, text) to service_role;
grant  execute on function public.console_domaine_principal(uuid, uuid, text) to service_role;
grant  execute on function public.console_retirer_domaine(uuid, uuid, text) to service_role;
grant  execute on function public.console_cloner_configuration(uuid, uuid, uuid) to service_role;
