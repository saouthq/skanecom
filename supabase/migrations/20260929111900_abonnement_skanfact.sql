-- =====================================================================
-- SkanEcom — 80 · L'ABONNEMENT D'UNE BOUTIQUE, UN CONTRAT DANS SKANFACT
-- =====================================================================
--
-- L'abonnement mensuel d'une boutique est un contrat de « Facturation
-- récurrente » dans SkanFact (brique 130 de la plateforme), au nom de son
-- client, souvent « Émise seule » : SkanFact émet chaque facture à sa date
-- (brique 129), la console la reçoit par l'avis facture.emise.
--
-- La console crée le contrat par l'API, ou reprend celui qu'une personne a
-- créé à l'écran ; elle ne garde ici que son identifiant (le contrat vit
-- dans SkanFact : son prix, sa prochaine date, ses refus se relisent là).
-- =====================================================================

alter table plateforme.facturation_liens add column contrat uuid;

comment on column plateforme.facturation_liens.contrat is
  'Le contrat d''abonnement de la boutique dans SkanFact (Facturation récurrente), créé par la console ou repris.';

-- Garder (ou oublier, p_contrat null) le contrat d'abonnement d'une boutique reliée.
create function public.console_garder_contrat(p_acteur uuid, p_boutique_id uuid, p_contrat uuid, p_objet text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant uuid;
begin
  perform private.console_exige_admin(p_acteur);
  select l.contrat into v_avant from plateforme.facturation_liens l where l.boutique_id = p_boutique_id for update;
  if not found then
    raise exception 'La boutique n''est reliée à aucun client SkanFact' using errcode = 'check_violation', hint = 'lien';
  end if;
  if v_avant is not distinct from p_contrat then
    return;
  end if;
  update plateforme.facturation_liens l set contrat = p_contrat where l.boutique_id = p_boutique_id;
  perform private.console_trace(p_acteur, p_boutique_id,
    case when p_contrat is null then 'facturation.abonnement_oublie' else 'facturation.abonnement' end,
    nullif(btrim(coalesce(p_objet, '')), ''),
    case when v_avant is null then null else jsonb_build_object('contrat', v_avant) end,
    case when p_contrat is null then null else jsonb_build_object('contrat', p_contrat) end);
end;
$$;

-- Un geste fait sur le contrat dans SkanFact (suspendre, reprendre), noté au journal.
create function public.console_noter_abonnement(p_acteur uuid, p_boutique_id uuid, p_geste text, p_objet text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  if p_geste not in ('suspendu', 'repris') then
    raise exception 'Geste inconnu : %', p_geste using errcode = 'check_violation';
  end if;
  if not exists (select 1 from plateforme.facturation_liens l where l.boutique_id = p_boutique_id and l.contrat is not null) then
    raise exception 'La boutique n''a pas d''abonnement suivi' using errcode = 'check_violation', hint = 'lien';
  end if;
  perform private.console_trace(p_acteur, p_boutique_id, 'facturation.abonnement_' || p_geste, nullif(btrim(coalesce(p_objet, '')), ''), null, null);
end;
$$;

revoke execute on function public.console_garder_contrat(uuid, uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.console_garder_contrat(uuid, uuid, uuid, text) to service_role;
revoke execute on function public.console_noter_abonnement(uuid, uuid, text, text) from public, anon, authenticated;
grant  execute on function public.console_noter_abonnement(uuid, uuid, text, text) to service_role;

-- Le lien porte aussi le contrat.
create or replace function public.console_facturation(p_boutique_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'lien', (select jsonb_build_object('client', l.client, 'raison_sociale', l.raison_sociale, 'identifiant', l.identifiant,
                                       'lie_le', l.lie_le, 'lie_par', u.email, 'contrat', l.contrat)
               from plateforme.facturation_liens l left join auth.users u on u.id = l.lie_par
              where l.boutique_id = p_boutique_id),
    'situation', (select s.situation from plateforme.facturation_situations s where s.boutique_id = p_boutique_id),
    'factures', (select s.factures from plateforme.facturation_situations s where s.boutique_id = p_boutique_id),
    'lue_le', (select s.lue_le from plateforme.facturation_situations s where s.boutique_id = p_boutique_id),
    'matricule', (select nullif(btrim(r.valeur #>> '{}'), '') from public.reglages r
                   where r.boutique_id = p_boutique_id and r.cle = 'legal.matricule_fiscal'),
    'dernier_avis', (select jsonb_build_object('evenement', a.evenement, 'recu_le', a.recu_le)
                       from plateforme.facturation_avis a order by a.recu_le desc limit 1));
$$;

-- Changer de client : l'abonnement de l'ancien ne vaut plus.
create or replace function public.console_lier_skanfact(
  p_acteur uuid, p_boutique_id uuid, p_client uuid, p_raison_sociale text, p_identifiant text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_demo  boolean;
  v_avant plateforme.facturation_liens;
begin
  perform private.console_exige_admin(p_acteur);
  select b.demonstration into v_demo from plateforme.boutiques b where b.id = p_boutique_id;
  if not found then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  if v_demo then
    raise exception 'Une boutique de démonstration n''a pas de client à facturer' using errcode = 'check_violation', hint = 'demonstration';
  end if;
  if p_client is null or nullif(btrim(coalesce(p_raison_sociale, '')), '') is null then
    raise exception 'Le client SkanFact et sa raison sociale sont attendus' using errcode = 'check_violation';
  end if;
  select * into v_avant from plateforme.facturation_liens l where l.boutique_id = p_boutique_id;
  if v_avant.client = p_client then
    return;
  end if;
  insert into plateforme.facturation_liens (boutique_id, client, raison_sociale, identifiant, lie_par)
  values (p_boutique_id, p_client, btrim(p_raison_sociale), nullif(btrim(coalesce(p_identifiant, '')), ''), p_acteur)
  on conflict (boutique_id) do update
    set client = excluded.client, raison_sociale = excluded.raison_sociale, identifiant = excluded.identifiant,
        lie_le = now(), lie_par = excluded.lie_par, contrat = null;
  -- La situation d'un autre client ne vaut plus.
  delete from plateforme.facturation_situations s where s.boutique_id = p_boutique_id;
  perform private.console_trace(p_acteur, p_boutique_id, 'facturation.lier', btrim(p_raison_sociale),
    case when v_avant.boutique_id is null then null else jsonb_build_object('client', v_avant.client, 'raison_sociale', v_avant.raison_sociale) end,
    jsonb_build_object('client', p_client, 'raison_sociale', btrim(p_raison_sociale)));
end;
$$;
