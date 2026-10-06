-- =====================================================================
-- SkanEcom — LA SURVEILLANCE, CHAQUE HEURE
-- =====================================================================
-- Demandée par Skander (« la surveillance ») : sans attendre qu'un client
-- se plaigne, chaque heure (le déclencheur planifié du Worker), ou d'un
-- geste dans la console (État technique → Vérifier maintenant) :
--   · chaque vitrine en ligne répond-elle, et en combien de temps ?
--     (et donc son certificat : une page qui s'ouvre en https l'a) ;
--   · les e-mails de commande partent-ils, ou s'entassent-ils ?
--   · les factures attendues par SkanFact partent-elles ?
--   · le domaine d'envoi propre à une boutique est-il toujours vérifié chez
--     le fournisseur (une fois par jour) ?
-- L'application fait les appels (HTTP, fournisseur) ; la base dit quoi
-- vérifier, range les relevés, et compte ce qui ne passe que par elle (les
-- files). Les relevés vivent quatorze jours. L'accueil de la console en
-- tire ses signaux (À surveiller) ; État technique en montre le détail.
-- =====================================================================

create table plateforme.surveillance_passages (
  id          bigint generated always as identity primary key,
  debut       timestamptz not null default now(),
  fin         timestamptz,
  declencheur text not null check (declencheur in ('heure', 'console')),
  acteur      uuid references auth.users (id) on delete set null,
  verifies    integer not null default 0,
  defauts     integer not null default 0,
  -- Parmi les défauts, les vitrines qui ne s'ouvrent pas (le plus grave).
  pannes      integer not null default 0
);

create table plateforme.surveillance_releves (
  id          bigint generated always as identity primary key,
  passage_id  bigint not null references plateforme.surveillance_passages (id) on delete cascade,
  boutique_id uuid references plateforme.boutiques (id) on delete cascade,
  genre       text not null check (genre in ('page', 'courriels', 'skanfact', 'domaine_envoi')),
  cible       text not null,
  ok          boolean not null,
  lent        boolean not null default false,
  duree_ms    integer,
  statut_http integer,
  detail      text,
  le          timestamptz not null default now()
);
create index surveillance_releves_passage_idx on plateforme.surveillance_releves (passage_id);
create index surveillance_releves_boutique_idx on plateforme.surveillance_releves (boutique_id, le desc);
create index surveillance_passages_debut_idx on plateforme.surveillance_passages (debut desc);

alter table plateforme.surveillance_passages enable row level security;
alter table plateforme.surveillance_releves enable row level security;
-- Aucune politique : seules les fonctions ci-dessous (clé de service) y touchent.

comment on table plateforme.surveillance_passages is
  'Un passage de la surveillance (chaque heure, ou demandé dans la console) : quand, combien de vérifications, combien de défauts.';
comment on table plateforme.surveillance_releves is
  'Ce qu''un passage a relevé : une vitrine (page, temps, statut HTTP), une file d''e-mails ou de factures, un domaine d''envoi.';


-- ---------------------------------------------------------------------
-- Ce qu'il y a à vérifier : les hôtes des boutiques ouvertes, et les
-- domaines d'envoi pas vérifiés depuis un jour.
-- ---------------------------------------------------------------------
create function public.surveillance_a_verifier()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'hotes', coalesce((select jsonb_agg(jsonb_build_object('boutique_id', d.boutique_id, 'hote', d.hote, 'principal', d.principal)
                                        order by b.nom, d.principal desc, d.hote)
                         from plateforme.domaines d join plateforme.boutiques b on b.id = d.boutique_id
                        where b.statut = 'active'), '[]'::jsonb),
    'domaines_envoi', coalesce((select jsonb_agg(jsonb_build_object('boutique_id', c.boutique_id, 'domaine', c.domaine,
                                                                     'fournisseur', c.fournisseur, 'ref', c.ref_fournisseur))
                                  from plateforme.courriels_boutique c join plateforme.boutiques b on b.id = c.boutique_id
                                 where b.statut = 'active' and c.domaine_actif and c.ref_fournisseur is not null
                                   and (c.derniere_verif is null or c.derniere_verif < now() - interval '20 hours')), '[]'::jsonb));
$$;


-- ---------------------------------------------------------------------
-- Noter un passage : ce que l'application a relevé, plus les files que la
-- base compte elle-même. p_acteur : l'administrateur qui l'a demandé, ou
-- NULL pour le passage de l'heure (le Worker, sans personne derrière).
-- ---------------------------------------------------------------------
create function public.surveillance_noter(p_acteur uuid, p_declencheur text, p_debut timestamptz, p_releves jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_passage bigint;
  v_r jsonb;
  v_boutique uuid;
  v_ok boolean;
  v_verifies integer := 0;
  v_defauts integer := 0;
  v_pannes integer := 0;
  v_file record;
begin
  if p_acteur is not null then
    perform private.console_exige_admin(p_acteur);
  end if;
  if p_declencheur not in ('heure', 'console') then
    raise exception 'Déclencheur inconnu' using errcode = '22023';
  end if;
  if jsonb_typeof(p_releves) is distinct from 'array' then
    raise exception 'Relevés attendus en liste' using errcode = '22023', hint = 'releves';
  end if;
  insert into plateforme.surveillance_passages (debut, declencheur, acteur)
  values (least(coalesce(p_debut, now()), now()), p_declencheur, p_acteur) returning id into v_passage;

  -- Ce que l'application a vu : les vitrines, les domaines d'envoi.
  for v_r in select * from jsonb_array_elements(p_releves) loop
    if v_r ->> 'genre' not in ('page', 'domaine_envoi') then
      continue;
    end if;
    v_boutique := nullif(v_r ->> 'boutique_id', '')::uuid;
    v_ok := coalesce((v_r ->> 'ok')::boolean, false);
    insert into plateforme.surveillance_releves (passage_id, boutique_id, genre, cible, ok, lent, duree_ms, statut_http, detail)
    values (v_passage, v_boutique, v_r ->> 'genre', left(coalesce(v_r ->> 'cible', '?'), 200), v_ok,
            coalesce((v_r ->> 'lent')::boolean, false), nullif(v_r ->> 'duree_ms', '')::integer,
            nullif(v_r ->> 'statut_http', '')::integer, left(nullif(btrim(coalesce(v_r ->> 'detail', '')), ''), 300));
    v_verifies := v_verifies + 1;
    if not v_ok then
      v_defauts := v_defauts + 1;
      if v_r ->> 'genre' = 'page' then
        v_pannes := v_pannes + 1;
      end if;
    end if;
    -- Une vitrine qui s'ouvre en https a son certificat ; une erreur de
    -- certificat le dit. Le reste (lenteur, 500) ne touche pas au certificat.
    if v_r ->> 'genre' = 'page' and (v_ok or coalesce((v_r ->> 'certificat')::boolean, false)) then
      update plateforme.domaines d
         set statut_certificat = case when v_ok then 'actif' else 'erreur' end,
             certificat_verifie_le = now(),
             certificat_erreur = case when v_ok then null else left(nullif(btrim(coalesce(v_r ->> 'detail', '')), ''), 300) end
       where d.hote = lower(v_r ->> 'cible');
    end if;
    -- Un domaine d'envoi qui n'est plus vérifié chez le fournisseur s'éteint
    -- (l'e-mail repart de l'adresse de la plateforme) : comme à la main.
    if v_r ->> 'genre' = 'domaine_envoi' and v_boutique is not null then
      update plateforme.courriels_boutique c
         set derniere_verif = now(),
             statut = case when v_ok then 'verifie' when v_r ->> 'statut' = 'en_attente' then 'en_attente' else 'echec' end,
             domaine_actif = c.domaine_actif and v_ok
       where c.boutique_id = v_boutique and c.domaine = lower(v_r ->> 'cible');
      if not v_ok then
        perform private.console_trace(p_acteur, v_boutique, 'boutique.domaine_envoi', lower(v_r ->> 'cible'),
          jsonb_build_object('actif', true), jsonb_build_object('actif', false, 'par', 'surveillance'));
      end if;
    end if;
  end loop;

  -- Les e-mails de commande qui s'entassent : en retard d'une demi-heure, ou
  -- déjà essayés trois fois sans partir.
  for v_file in
    select k.boutique_id, count(*) as n, min(k.cree_le) as depuis
      from public.courriels_commandes k
     where k.etat = 'a_envoyer' and (k.prochain_essai < now() - interval '30 minutes' or k.essais >= 3)
     group by k.boutique_id
  loop
    insert into plateforme.surveillance_releves (passage_id, boutique_id, genre, cible, ok, detail)
    values (v_passage, v_file.boutique_id, 'courriels', 'e-mails de commande', false,
            format('%s en attente depuis le %s', case when v_file.n > 1 then v_file.n || ' e-mails' else '1 e-mail' end, to_char(v_file.depuis at time zone 'Africa/Tunis', 'DD/MM à HH24:MI')));
    v_verifies := v_verifies + 1;
    v_defauts := v_defauts + 1;
  end loop;
  -- Les factures attendues par SkanFact, coincées (trois essais, ou plus d'un jour).
  for v_file in
    select e.boutique_id, count(*) as n, min(e.cree_le) as depuis
      from public.skanfact_envois e
     where e.etat = 'a_envoyer' and (e.essais >= 3 or e.cree_le < now() - interval '1 day')
     group by e.boutique_id
  loop
    insert into plateforme.surveillance_releves (passage_id, boutique_id, genre, cible, ok, detail)
    values (v_passage, v_file.boutique_id, 'skanfact', 'envois à SkanFact', false,
            format('%s en attente depuis le %s', case when v_file.n > 1 then v_file.n || ' envois' else '1 envoi' end, to_char(v_file.depuis at time zone 'Africa/Tunis', 'DD/MM à HH24:MI')));
    v_verifies := v_verifies + 1;
    v_defauts := v_defauts + 1;
  end loop;

  update plateforme.surveillance_passages p set fin = now(), verifies = v_verifies, defauts = v_defauts, pannes = v_pannes
   where p.id = v_passage;
  -- Quatorze jours d'histoire.
  delete from plateforme.surveillance_passages p where p.debut < now() - interval '14 days';
  return jsonb_build_object('passage', v_passage, 'verifies', v_verifies, 'defauts', v_defauts, 'pannes', v_pannes);
end;
$$;


-- ---------------------------------------------------------------------
-- Ce que la console en montre : le dernier passage et ses relevés (les
-- défauts d'abord), la disponibilité de chaque vitrine sur 24 heures, et
-- les 24 derniers passages.
-- ---------------------------------------------------------------------
create function public.console_surveillance(p_acteur uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dernier plateforme.surveillance_passages;
begin
  perform private.console_exige_admin(p_acteur);
  select * into v_dernier from plateforme.surveillance_passages p order by p.debut desc limit 1;
  return jsonb_build_object(
    'dernier', case when v_dernier.id is null then null else jsonb_build_object(
      'id', v_dernier.id, 'debut', v_dernier.debut, 'fin', v_dernier.fin, 'declencheur', v_dernier.declencheur,
      'verifies', v_dernier.verifies, 'defauts', v_dernier.defauts,
      'releves', coalesce((select jsonb_agg(jsonb_build_object(
          'boutique_id', r.boutique_id, 'boutique', b.nom, 'slug', b.slug, 'genre', r.genre, 'cible', r.cible, 'ok', r.ok, 'lent', r.lent,
          'duree_ms', r.duree_ms, 'statut_http', r.statut_http, 'detail', r.detail)
          order by r.ok, r.lent desc, b.nom, r.genre, r.cible)
        from plateforme.surveillance_releves r left join plateforme.boutiques b on b.id = r.boutique_id
       where r.passage_id = v_dernier.id), '[]'::jsonb)) end,
    -- Le dernier passage de l'heure : s'il date, le déclencheur ne tourne plus.
    'derniere_heure', (select max(p.debut) from plateforme.surveillance_passages p where p.declencheur = 'heure'),
    'disponibilite', coalesce((select jsonb_agg(jsonb_build_object('cible', x.cible, 'boutique', x.nom, 'slug', x.slug,
                                                                   'releves', x.n, 'ok', x.ok, 'duree_mediane', x.mediane)
                                                order by x.ok::numeric / x.n, x.nom, x.cible)
        -- (le temps de réponse : celui des pages qui se sont ouvertes ; la moins disponible d'abord)
        from (select r.cible, b.nom, b.slug, count(*) as n, count(*) filter (where r.ok) as ok,
                     (percentile_cont(0.5) within group (order by r.duree_ms) filter (where r.ok))::integer as mediane
                from plateforme.surveillance_releves r join plateforme.boutiques b on b.id = r.boutique_id
               where r.genre = 'page' and r.le > now() - interval '24 hours'
               group by r.cible, b.nom, b.slug) x), '[]'::jsonb),
    'passages', coalesce((select jsonb_agg(jsonb_build_object('debut', p.debut, 'declencheur', p.declencheur,
                                                              'verifies', p.verifies, 'defauts', p.defauts, 'pannes', p.pannes) order by p.debut desc)
        from (select * from plateforme.surveillance_passages order by debut desc limit 24) p), '[]'::jsonb));
end;
$$;


revoke execute on function public.surveillance_a_verifier() from public, anon, authenticated;
revoke execute on function public.surveillance_noter(uuid, text, timestamptz, jsonb) from public, anon, authenticated;
revoke execute on function public.console_surveillance(uuid) from public, anon, authenticated;
grant  execute on function public.surveillance_a_verifier() to service_role;
grant  execute on function public.surveillance_noter(uuid, text, timestamptz, jsonb) to service_role;
grant  execute on function public.console_surveillance(uuid) to service_role;
