-- =====================================================================
-- LES TÂCHES DE FOND — ce qui tourne sans qu'on le voie, vu.
--
-- Jusqu'ici, les files d'envoi ne partaient qu'à l'occasion : un e-mail de
-- commande à la commande suivante ou à l'ouverture du backoffice, un envoi
-- à SkanFact au geste suivant. Une boutique calme gardait donc un e-mail
-- retenté des heures, et la surveillance le signalait sans le faire partir.
-- Désormais, chaque heure, avant de vérifier, le passage vide les files de
-- toutes les boutiques (dans un temps borné), et chaque tour est noté ici :
-- quand, combien de partis, combien en échec, ce qui reste. La console le
-- montre (État technique → Tâches de fond) et peut lancer un tour.
-- =====================================================================

create table plateforme.taches_tours (
  id          bigint generated always as identity primary key,
  tache       text not null check (tache in ('courriels', 'skanfact')),
  declencheur text not null check (declencheur in ('heure', 'console')),
  debut       timestamptz not null,
  fin         timestamptz not null default now(),
  ok          boolean not null,
  faits       integer not null default 0 check (faits >= 0),
  echecs      integer not null default 0 check (echecs >= 0),
  restants    integer not null default 0 check (restants >= 0),
  detail      text check (char_length(detail) <= 300)
);
create index taches_tours_idx on plateforme.taches_tours (tache, debut desc);
alter table plateforme.taches_tours enable row level security;
-- Aucune politique : seules les fonctions ci-dessous y touchent.

comment on table plateforme.taches_tours is
  'Les tours des tâches de fond (vider les files d''e-mails de commande et d''envois à SkanFact) : quand, ce qui est parti, ce qui reste. 14 jours.';


-- Ce qui reste dû dans une file, maintenant.
create function private.taches_restants(p_tache text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case p_tache
    when 'courriels' then (select count(*)::int from public.courriels_commandes c where c.etat = 'a_envoyer')
    when 'skanfact' then (select count(*)::int from public.skanfact_envois e where e.etat = 'a_envoyer')
                       + (select count(*)::int from plateforme.skanfact_coupures k)
    else 0 end
$$;
revoke execute on function private.taches_restants(text) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 1. L'application note chaque tour (clé service_role)
-- ---------------------------------------------------------------------
create function public.taches_noter(p_tache text, p_declencheur text, p_debut timestamptz, p_ok boolean,
                                    p_faits integer, p_echecs integer, p_detail text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into plateforme.taches_tours (tache, declencheur, debut, ok, faits, echecs, restants, detail)
  values (p_tache, coalesce(p_declencheur, 'heure'), coalesce(p_debut, now()), coalesce(p_ok, false),
          greatest(coalesce(p_faits, 0), 0), greatest(coalesce(p_echecs, 0), 0), private.taches_restants(p_tache),
          left(nullif(btrim(coalesce(p_detail, '')), ''), 300));
  delete from plateforme.taches_tours t where t.debut < now() - interval '14 days';
end;
$$;

-- Les boutiques dont un envoi à SkanFact (ou une clé à couper) est dû maintenant.
create function public.taches_skanfact_dues(p_limite integer)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(x.boutique_id), '{}') from (
    select d.boutique_id from (
      select e.boutique_id, min(e.prochain_essai) as quand from public.skanfact_envois e
       where e.etat = 'a_envoyer' and e.prochain_essai <= now() group by e.boutique_id
      union all
      select k.boutique_id, min(k.prochain_essai) from plateforme.skanfact_coupures k
       where k.prochain_essai <= now() group by k.boutique_id
    ) d group by d.boutique_id order by min(d.quand) limit least(greatest(coalesce(p_limite, 30), 1), 100)
  ) x
$$;

revoke execute on function public.taches_noter(text, text, timestamptz, boolean, integer, integer, text) from public, anon, authenticated;
revoke execute on function public.taches_skanfact_dues(integer) from public, anon, authenticated;
grant  execute on function public.taches_noter(text, text, timestamptz, boolean, integer, integer, text) to service_role;
grant  execute on function public.taches_skanfact_dues(integer) to service_role;


-- ---------------------------------------------------------------------
-- 2. La console : chaque tâche, son dernier tour, sa journée, sa file
-- ---------------------------------------------------------------------
create function public.console_taches(p_acteur uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_tache text;
begin
  perform private.console_exige_admin(p_acteur);
  foreach v_tache in array array['courriels', 'skanfact'] loop
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'tache', v_tache,
      'dernier', (select jsonb_build_object('debut', t.debut, 'fin', t.fin, 'ok', t.ok, 'faits', t.faits, 'echecs', t.echecs,
                                            'restants', t.restants, 'detail', t.detail, 'declencheur', t.declencheur)
                    from plateforme.taches_tours t where t.tache = v_tache order by t.debut desc limit 1),
      'derniere_heure', (select max(t.debut) from plateforme.taches_tours t where t.tache = v_tache and t.declencheur = 'heure'),
      'tours_24h', (select count(*) from plateforme.taches_tours t where t.tache = v_tache and t.debut >= now() - interval '24 hours'),
      'faits_24h', (select coalesce(sum(t.faits), 0) from plateforme.taches_tours t where t.tache = v_tache and t.debut >= now() - interval '24 hours'),
      'echecs_24h', (select coalesce(sum(t.echecs), 0) from plateforme.taches_tours t where t.tache = v_tache and t.debut >= now() - interval '24 hours'),
      'en_file', private.taches_restants(v_tache),
      'dus', case v_tache
               when 'courriels' then (select count(*) from public.courriels_commandes c where c.etat = 'a_envoyer' and c.prochain_essai <= now())
               else (select count(*) from public.skanfact_envois e where e.etat = 'a_envoyer' and e.prochain_essai <= now()) end
    ));
  end loop;
  return jsonb_build_object('taches', v_out, 'surveillance', (
    select jsonb_build_object('debut', p.debut, 'fin', p.fin, 'declencheur', p.declencheur, 'verifies', p.verifies, 'defauts', p.defauts)
      from plateforme.surveillance_passages p order by p.debut desc limit 1));
end;
$$;
revoke execute on function public.console_taches(uuid) from public, anon, authenticated;
grant  execute on function public.console_taches(uuid) to service_role;

-- Un tour lancé depuis la console : au journal.
create function public.console_tracer_taches(p_acteur uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_super_admin(p_acteur);
  perform private.console_trace(p_acteur, null, 'plateforme.taches_lancees', null, null, null);
end;
$$;
revoke execute on function public.console_tracer_taches(uuid) from public, anon, authenticated;
grant  execute on function public.console_tracer_taches(uuid) to service_role;
