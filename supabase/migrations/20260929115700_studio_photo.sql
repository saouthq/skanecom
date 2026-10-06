-- =====================================================================
-- LE STUDIO PHOTO — un module (coupé par défaut, ouvert par la console).
--
-- Une photo prise au téléphone, sur n'importe quel fond, devient une photo
-- de catalogue : l'objet est détouré par Cloudflare Images (segment =
-- foreground, un modèle de Workers AI) puis posé, entier, sur le fond des
-- cartes de la vitrine (application/src/lib/gestion/studio.ts). La photo
-- d'origine reste : la nouvelle s'ajoute à côté, le commerçant choisit.
--
-- La base dit seulement si la boutique a le module ; le dépôt de la photo
-- passe par gestion_ajouter_photo, comme les autres.
-- =====================================================================

insert into plateforme.modules (code, libelle_fr, description_fr, position, disponible) values
  ('studio_photo', 'Studio photo',
   'Les photos prises au téléphone deviennent des photos de catalogue : l''objet détouré, posé sur le fond de la vitrine.',
   10, true);

-- Le droit que les formules ouvrent ; la formule « complète » ouvre tout.
insert into plateforme.droits (code, genre, module, groupe, libelle_fr, description_fr, position)
select 'module.studio_photo', 'module', 'studio_photo', 'modules', m.libelle_fr, m.description_fr, 100
  from plateforme.modules m where m.code = 'studio_photo'
on conflict do nothing;

insert into plateforme.formule_droits (formule, droit)
select 'complete', 'module.studio_photo' where exists (select 1 from plateforme.formules where code = 'complete')
on conflict do nothing;

create function private.studio_actif(p_boutique_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from plateforme.modules_actifs ma
                  where ma.boutique_id = p_boutique_id and ma.module = 'studio_photo' and ma.actif)
$$;

-- Le module, pour l'équipe : le bouton « Passer au studio » des photos.
create function public.gestion_studio_etat(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object('actif', private.studio_actif(p_boutique_id));
end;
$$;

comment on function public.gestion_studio_etat(uuid) is
  'Le studio photo de la boutique est-il ouvert (module studio_photo) ? Toute l''équipe lit.';

revoke execute on function private.studio_actif(uuid) from public, anon, authenticated;
revoke execute on function public.gestion_studio_etat(uuid) from public, anon;
grant  execute on function public.gestion_studio_etat(uuid) to authenticated;
