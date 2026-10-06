-- =====================================================================
-- LA RÉDACTION — un module (coupé par défaut, ouvert par la console).
--
-- « Rédiger la description » sur la fiche d'un produit, au backoffice : un
-- modèle de langue (Workers AI, application/src/lib/gestion/redaction.ts)
-- écrit un brouillon à partir de ce que la fiche sait déjà — nom, rayon,
-- marque, déclinaisons, caractéristiques, et les notes du commerçant. Le
-- brouillon remplit le champ ; rien n'est enregistré avant « Enregistrer la
-- fiche » : le commerçant relit, corrige, décide.
--
-- La base dit seulement si la boutique a le module ; la fiche s'enregistre
-- par gestion_modifier_fiche, comme avant.
-- =====================================================================

insert into plateforme.modules (code, libelle_fr, description_fr, position, disponible) values
  ('redaction', 'Rédaction',
   'La description d''un produit rédigée en un geste, à partir de sa fiche : un brouillon que le commerçant relit avant de l''enregistrer.',
   11, true);

-- Le droit que les formules ouvrent ; la formule « complète » ouvre tout.
insert into plateforme.droits (code, genre, module, groupe, libelle_fr, description_fr, position)
select 'module.redaction', 'module', 'redaction', 'modules', m.libelle_fr, m.description_fr, 110
  from plateforme.modules m where m.code = 'redaction'
on conflict do nothing;

insert into plateforme.formule_droits (formule, droit)
select 'complete', 'module.redaction' where exists (select 1 from plateforme.formules where code = 'complete')
on conflict do nothing;

create function private.redaction_active(p_boutique_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from plateforme.modules_actifs ma
                  where ma.boutique_id = p_boutique_id and ma.module = 'redaction' and ma.actif)
$$;

-- Le module, pour l'équipe : le bouton « Rédiger la description » de la fiche.
create function public.gestion_redaction_etat(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object('actif', private.redaction_active(p_boutique_id));
end;
$$;

comment on function public.gestion_redaction_etat(uuid) is
  'La rédaction des descriptions est-elle ouverte pour la boutique (module redaction) ? Toute l''équipe lit.';

revoke execute on function private.redaction_active(uuid) from public, anon, authenticated;
revoke execute on function public.gestion_redaction_etat(uuid) from public, anon;
grant  execute on function public.gestion_redaction_etat(uuid) to authenticated;
