-- =====================================================================
-- SkanEcom — 79 · LA FACTURATION DES CLIENTS, LUE DANS SKANFACT (D20)
-- =====================================================================
--
-- Les factures des clients de SkanEcom vivent dans SkanFact (cadrage 06) ;
-- la console les lit par l'API de SkanFact (brique 127 de la plateforme) :
-- le client par son matricule, ses factures à payer, sa situation (reste
-- dû, échu, retard, dernier règlement), le lien vers l'écran de SkanFact.
--
-- Ici, seulement ce que la console doit garder :
--   · le lien d'une boutique à son client SkanFact (posé par un
--     administrateur, tracé ; jamais pour une boutique de démonstration) ;
--   · la dernière situation lue, avec son heure : la console reste lisible
--     quand SkanFact ne répond pas, et l'accueil dit un retard sans appeler
--     SkanFact pour chaque boutique ;
--   · les avis reçus de SkanFact (leur identifiant) : un avis rejoué
--     n'agit pas deux fois.
-- Aucun montant n'est calculé ici : la situation est celle de SkanFact,
-- gardée telle quelle.
-- =====================================================================

create table plateforme.facturation_liens (
  boutique_id    uuid primary key references plateforme.boutiques (id) on delete cascade,
  client         uuid not null,
  raison_sociale text not null check (char_length(raison_sociale) between 1 and 300),
  identifiant    text check (char_length(identifiant) <= 40),
  lie_le         timestamptz not null default now(),
  lie_par        uuid references auth.users (id) on delete set null
);
create index facturation_liens_client_idx on plateforme.facturation_liens (client);

comment on table plateforme.facturation_liens is
  'Le client SkanFact d''une boutique (cadrage 06) : son identifiant dans SkanFact, sa raison sociale et son matricule tels que SkanFact les donne.';

create table plateforme.facturation_situations (
  boutique_id uuid primary key references plateforme.facturation_liens (boutique_id) on delete cascade,
  situation   jsonb not null check (jsonb_typeof(situation) = 'object'),
  factures    jsonb not null default '[]'::jsonb check (jsonb_typeof(factures) = 'array'),
  lue_le      timestamptz not null default now()
);

comment on table plateforme.facturation_situations is
  'La dernière situation d''un client lue dans SkanFact (GET …/clients/:client/situation) et ses factures à payer, telles quelles, avec l''heure de la lecture.';

create table plateforme.facturation_avis (
  id        text primary key check (char_length(id) between 1 and 100),
  evenement text not null check (char_length(evenement) between 1 and 60),
  recu_le   timestamptz not null default now()
);

comment on table plateforme.facturation_avis is
  'Les avis de SkanFact déjà reçus (leur identifiant) : un avis rejoué n''agit pas deux fois.';

alter table plateforme.facturation_liens      enable row level security;
alter table plateforme.facturation_situations enable row level security;
alter table plateforme.facturation_avis       enable row level security;
revoke all on plateforme.facturation_liens, plateforme.facturation_situations, plateforme.facturation_avis from public, anon, authenticated;

-- Relier une boutique à son client SkanFact (ou en changer).
create function public.console_lier_skanfact(
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
        lie_le = now(), lie_par = excluded.lie_par;
  -- La situation d'un autre client ne vaut plus.
  delete from plateforme.facturation_situations s where s.boutique_id = p_boutique_id;
  perform private.console_trace(p_acteur, p_boutique_id, 'facturation.lier', btrim(p_raison_sociale),
    case when v_avant.boutique_id is null then null else jsonb_build_object('client', v_avant.client, 'raison_sociale', v_avant.raison_sociale) end,
    jsonb_build_object('client', p_client, 'raison_sociale', btrim(p_raison_sociale)));
end;
$$;

create function public.console_delier_skanfact(p_acteur uuid, p_boutique_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant plateforme.facturation_liens;
begin
  perform private.console_exige_admin(p_acteur);
  delete from plateforme.facturation_liens l where l.boutique_id = p_boutique_id returning * into v_avant;
  if v_avant.boutique_id is null then
    return;
  end if;
  perform private.console_trace(p_acteur, p_boutique_id, 'facturation.delier', v_avant.raison_sociale,
    jsonb_build_object('client', v_avant.client, 'raison_sociale', v_avant.raison_sociale), null);
end;
$$;

-- Garder ce que SkanFact vient de dire d'un client (le serveur de la console,
-- après sa lecture). Une boutique déliée entre-temps : rien n'est gardé.
create function public.console_garder_situation(p_boutique_id uuid, p_client uuid, p_situation jsonb, p_factures jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from plateforme.facturation_liens l where l.boutique_id = p_boutique_id and l.client = p_client) then
    return false;
  end if;
  insert into plateforme.facturation_situations (boutique_id, situation, factures, lue_le)
  values (p_boutique_id, p_situation, coalesce(p_factures, '[]'::jsonb), now())
  on conflict (boutique_id) do update set situation = excluded.situation, factures = excluded.factures, lue_le = excluded.lue_le;
  return true;
end;
$$;

-- Le lien et la dernière situation d'une boutique ; le matricule fiscal que
-- la boutique a déclaré (ses mentions légales), pour retrouver son client ;
-- et le dernier avis reçu de SkanFact, qui dit que les avis arrivent.
create function public.console_facturation(p_boutique_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'lien', (select jsonb_build_object('client', l.client, 'raison_sociale', l.raison_sociale, 'identifiant', l.identifiant,
                                       'lie_le', l.lie_le, 'lie_par', u.email)
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

-- Les boutiques d'un client SkanFact (un avis porte le client).
create function public.console_boutiques_du_client(p_client uuid)
returns table (boutique_id uuid, client uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select l.boutique_id, l.client from plateforme.facturation_liens l where p_client is null or l.client = p_client;
$$;

-- Un avis de SkanFact : vrai la première fois, faux s'il a déjà été reçu.
create function public.console_avis_skanfact(p_id text, p_evenement text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into plateforme.facturation_avis (id, evenement) values (p_id, p_evenement) on conflict (id) do nothing;
  return found;
end;
$$;

revoke execute on function public.console_lier_skanfact(uuid, uuid, uuid, text, text)        from public, anon, authenticated;
revoke execute on function public.console_delier_skanfact(uuid, uuid)                        from public, anon, authenticated;
revoke execute on function public.console_garder_situation(uuid, uuid, jsonb, jsonb)         from public, anon, authenticated;
revoke execute on function public.console_facturation(uuid)                                  from public, anon, authenticated;
revoke execute on function public.console_boutiques_du_client(uuid)                          from public, anon, authenticated;
revoke execute on function public.console_avis_skanfact(text, text)                          from public, anon, authenticated;
grant  execute on function public.console_lier_skanfact(uuid, uuid, uuid, text, text)        to service_role;
grant  execute on function public.console_delier_skanfact(uuid, uuid)                        to service_role;
grant  execute on function public.console_garder_situation(uuid, uuid, jsonb, jsonb)         to service_role;
grant  execute on function public.console_facturation(uuid)                                  to service_role;
grant  execute on function public.console_boutiques_du_client(uuid)                          to service_role;
grant  execute on function public.console_avis_skanfact(text, text)                          to service_role;

-- Le poste de pilotage dit aussi la facturation de chaque boutique.
create or replace function public.console_pilotage()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with bornes as (
    select (now() at time zone 'Africa/Tunis')::date as aujourdhui,
           (((now() at time zone 'Africa/Tunis')::date - 6)::timestamp at time zone 'Africa/Tunis') as debut
  ),
  jours as (
    select (b.aujourdhui - k) as jour from bornes b, generate_series(6, 0, -1) k
  )
  select coalesce(jsonb_agg(ligne order by cree_le, nom), '[]'::jsonb)
  from (
    select b.created_at as cree_le, b.nom,
      jsonb_build_object(
        'id', b.id, 'slug', b.slug, 'nom', b.nom, 'statut', b.statut, 'creee_le', b.created_at,
        'demonstration', b.demonstration,
        'hote', (select d.hote from plateforme.domaines d where d.boutique_id = b.id and d.principal),

        -- La marque, telle que la vitrine la pose (les couleurs absentes
        -- sont celles du gabarit : l'application les complète).
        'marque', jsonb_build_object(
          'code', t.code,
          'couleurs', coalesce(t.couleurs, '{}'::jsonb),
          'logo_chemin', t.logo_chemin,
          'logo_mode', t.logo_mode,
          'logo_ratio', t.logo_ratio,
          'monogramme_chemin', t.monogramme_chemin,
          'image', (select s -> 'image' ->> 'chemin'
                      from jsonb_array_elements(coalesce(t.sections, '[]'::jsonb)) s
                     where s ->> 'type' = 'hero' and s -> 'image' ->> 'chemin' is not null
                     limit 1)),

        -- La mise en place (C6) : ce qui est fait, et la première étape qui
        -- ne l'est pas, dans l'ordre de la liste.
        'mise_en_place', (
          select jsonb_build_object(
            'faites', count(*) filter (where (e ->> 'fait')::boolean),
            'total', count(*),
            'prochaine', (array_agg(e ->> 'cle' order by n) filter (where not (e ->> 'fait')::boolean))[1])
            from jsonb_array_elements(public.console_mise_en_place(b.id) -> 'etapes') with ordinality as x(e, n)),

        -- Ce qui attend, et la semaine.
        'commandes', (
          select jsonb_build_object(
            'a_confirmer', count(*) filter (where c.statut in ('a_arbitrer', 'recue')),
            'attente_depuis', min(c.created_at) filter (where c.statut in ('a_arbitrer', 'recue')),
            'semaine', count(*) filter (where c.created_at >= bo.debut and c.statut not in ('a_arbitrer', 'annulee')),
            'encaisse_semaine', coalesce(sum(c.total_millimes) filter (where c.statut = 'livree' and c.livree_at >= bo.debut), 0))
            from public.commandes c, bornes bo
           where c.boutique_id = b.id),

        -- Les commandes reçues chaque jour, du plus ancien à aujourd'hui.
        'jours', (
          select jsonb_agg(coalesce(k.n, 0) order by j.jour)
            from jours j
            left join (
              select (c.created_at at time zone 'Africa/Tunis')::date as jour, count(*) as n
                from public.commandes c, bornes bo
               where c.boutique_id = b.id and c.created_at >= bo.debut and c.statut not in ('a_arbitrer', 'annulee')
               group by 1) k on k.jour = j.jour),

        'produits', (select count(*) from public.produits p where p.boutique_id = b.id),
        'publies', (select count(*) from public.produits p where p.boutique_id = b.id and p.publie),
        'equipe', (select count(*) from plateforme.membres m where m.boutique_id = b.id and m.actif),

        -- La facturation (cadrage 06) : le client SkanFact lié, et la dernière
        -- situation lue (le retard, ce qui reste à payer), sans appeler SkanFact ;
        -- avec la plus ancienne échéance des factures qui restaient à payer :
        -- une facture qui vient d'échoir se voit sans attendre une relecture.
        'facturation', (
          select jsonb_build_object('client', l.client, 'raison_sociale', l.raison_sociale,
                                    'situation', s.situation, 'lue_le', s.lue_le,
                                    'echeance', (select min(f ->> 'echeance') from jsonb_array_elements(s.factures) f
                                                  where f ->> 'echeance' is not null),
                                    'numero', (select f ->> 'numero' from jsonb_array_elements(s.factures) f
                                                where f ->> 'echeance' is not null order by f ->> 'echeance' limit 1))
            from plateforme.facturation_liens l
            left join plateforme.facturation_situations s on s.boutique_id = l.boutique_id
           where l.boutique_id = b.id),

        -- Un accès support ouvert (C7), le plus lointain s'il y en a deux.
        'support', (
          select jsonb_build_object('jusqua', a.expire_le, 'role', a.role)
            from plateforme.acces_support a
           where a.boutique_id = b.id and a.ferme_le is null and a.expire_le > now()
           order by a.expire_le desc
           limit 1)
      ) as ligne
    from plateforme.boutiques b
    left join public.themes t on t.boutique_id = b.id
  ) x;
$$;
