-- =====================================================================
-- SkanEcom — 21 · CONSOLE C3 : LES MODULES D'UNE BOUTIQUE
-- Activer ou couper un module (paiement en ligne, retrait en magasin,
-- conseil par WhatsApp…) depuis la console
-- 29/09/2026 — étape 1, tâche « console » (docs/SUITE-DEV.md, PRD §6.1 C3)
-- =====================================================================
--
-- Un module fait partie de l'offre vendue : c'est nous qui l'activons, depuis
-- la console, jamais la boutique elle-même. Les réglages d'un module
-- (plateforme.reglages_catalogue.module) n'ont d'effet — et ne se changent
-- au backoffice — que tant qu'il est actif (migrations 02 et 13).
--
-- Un module pas encore construit reste « à venir » : la base refuse de
-- l'activer, sinon la vitrine annoncerait un service qu'elle ne sait pas
-- rendre. Le couper reste toujours possible.

alter table plateforme.modules add column disponible boolean not null default false;
comment on column plateforme.modules.disponible is
  'true = le module est construit : la console peut l''activer. false = à venir.';

-- Le conseil par WhatsApp est construit (bouton de la fiche produit, accueil
-- du gabarit technique). Le retrait en magasin le devient avec sa migration.
update plateforme.modules set disponible = true where code = 'conseil_whatsapp';


-- Les modules, pour l'onglet « Modules » d'une boutique : chacun avec son
-- état pour elle, et qui l'a changé en dernier.
create function public.console_modules(p_boutique_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'code', m.code, 'libelle', m.libelle_fr, 'description', m.description_fr, 'disponible', m.disponible,
      'actif', coalesce(ma.actif, false), 'change_le', ma.active_le, 'change_par', u.email,
      'reglages', (select count(*) from plateforme.reglages_catalogue c where c.module = m.code))
    order by m.position, m.code), '[]'::jsonb)
  from plateforme.modules m
  left join plateforme.modules_actifs ma on ma.boutique_id = p_boutique_id and ma.module = m.code
  left join auth.users u on u.id = ma.active_par;
$$;

create function public.console_changer_module(p_acteur uuid, p_boutique_id uuid, p_module text, p_actif boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_module plateforme.modules;
  v_avant  boolean;
begin
  perform private.console_exige_admin(p_acteur);
  if p_actif is null then
    raise exception 'Module : activer ou couper ?' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id) then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  select * into v_module from plateforme.modules m where m.code = p_module;
  if not found then
    raise exception 'Module inconnu « % »', p_module using errcode = 'no_data_found', hint = 'module';
  end if;

  select ma.actif into v_avant from plateforme.modules_actifs ma
   where ma.boutique_id = p_boutique_id and ma.module = p_module for update;
  v_avant := coalesce(v_avant, false);
  if v_avant = p_actif then
    return;
  end if;
  if p_actif and not v_module.disponible then
    raise exception 'Le module « % » est à venir : il ne s''active pas encore', v_module.libelle_fr
      using errcode = 'check_violation', hint = 'a_venir';
  end if;

  insert into plateforme.modules_actifs as ma (boutique_id, module, actif, active_le, active_par)
  values (p_boutique_id, p_module, p_actif, now(), p_acteur)
  on conflict (boutique_id, module) do update
    set actif = excluded.actif, active_le = excluded.active_le, active_par = excluded.active_par;

  perform private.console_trace(p_acteur, p_boutique_id, case when p_actif then 'module.activer' else 'module.couper' end,
    p_module, jsonb_build_object('actif', v_avant), jsonb_build_object('actif', p_actif));
end;
$$;

revoke execute on function public.console_modules(uuid)                           from public, anon, authenticated;
revoke execute on function public.console_changer_module(uuid, uuid, text, boolean) from public, anon, authenticated;
grant  execute on function public.console_modules(uuid)                           to service_role;
grant  execute on function public.console_changer_module(uuid, uuid, text, boolean) to service_role;
