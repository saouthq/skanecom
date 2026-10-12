-- =====================================================================
-- SkanEcom — LES ALERTES DE LA SURVEILLANCE : un e-mail quand ça casse
-- =====================================================================
--
-- La surveillance (migration …_surveillance) relève chaque heure ce qui
-- casse — une vitrine qui ne répond plus, des e-mails de commande qui
-- s'entassent, des factures qui n'arrivent pas à SkanFact, un domaine
-- d'envoi qui perd sa vérification — mais il faut ouvrir la console pour
-- le voir. Avant le lancement, l'équipe SkanEcom doit l'apprendre sans
-- regarder : par e-mail, une fois quand ça casse, une fois quand c'est
-- rétabli, jamais à chaque passage.
--
-- 1. Les incidents : ce qui casse, d'un passage à l'autre. Un relevé en
--    défaut ouvre un incident (ou le prolonge : un de plus à son compte
--    d'échecs) ; il se clôt quand la chose répond de nouveau, ou n'est plus
--    à surveiller (boutique fermée, domaine retiré).
-- 2. L'alerte : une vitrine qui ne répond pas DEUX passages de suite (un
--    raté isolé ne réveille personne) ; le reste — files, SkanFact, domaine
--    d'envoi — dès le premier relevé : ces relevés-là ont déjà attendu
--    (une demi-heure, trois essais, un jour). Un incident clos sans avoir
--    été annoncé ne s'annonce pas non plus « rétabli ».
-- 3. Le réglage (Console → État technique) : coupé par défaut, et à qui
--    écrire (une à cinq adresses). Super-administrateur seulement, au
--    journal. Un e-mail d'alerte qui ne part pas se retente au passage
--    suivant, un jour durant.
-- L'application fait l'envoi (lib/console/surveillance.ts) ; la base tient
-- les incidents, dit quoi annoncer, et note ce qui est parti.
-- =====================================================================

create table plateforme.incidents (
  id                  bigint generated always as identity primary key,
  -- genre:boutique:cible — une même chose qui casse n'ouvre qu'un incident à la fois.
  cle                 text not null,
  genre               text not null check (genre in ('page', 'courriels', 'skanfact', 'domaine_envoi')),
  boutique_id         uuid references plateforme.boutiques (id) on delete cascade,
  cible               text not null,
  detail              text,
  echecs              integer not null default 1 check (echecs > 0),
  ouvert_le           timestamptz not null default now(),
  dernier_le          timestamptz not null default now(),
  clos_le             timestamptz,
  alerte_ouverture_le timestamptz,
  alerte_cloture_le   timestamptz,
  alerte_essais       integer not null default 0,
  alerte_erreur       text
);
create unique index incidents_ouvert_idx on plateforme.incidents (cle) where clos_le is null;
create index incidents_recents_idx on plateforme.incidents (ouvert_le desc);
alter table plateforme.incidents enable row level security;
-- Aucune politique : seules les fonctions ci-dessous (clé de service) y touchent.

comment on table plateforme.incidents is
  'Ce qui casse d''un passage de la surveillance à l''autre : ouvert au premier défaut, clos quand cela répond de nouveau ; l''alerte par e-mail, envoyée une fois à l''ouverture et une fois au rétablissement.';

-- Le nombre de passages en défaut qui déclenche l'alerte.
create function private.incident_seuil(p_genre text)
returns integer
language sql
immutable
set search_path = ''
as $$ select case when p_genre = 'page' then 2 else 1 end $$;
revoke execute on function private.incident_seuil(text) from public, anon, authenticated;

create function private.incident_cle(p_genre text, p_boutique uuid, p_cible text)
returns text
language sql
immutable
set search_path = ''
as $$ select p_genre || ':' || coalesce(p_boutique::text, '-') || ':' || lower(coalesce(p_cible, '?')) $$;
revoke execute on function private.incident_cle(text, uuid, text) from public, anon, authenticated;

-- Le réglage : actives (absent : non) et destinataires (absent : aucun).
create function private.alertes_reglage()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'actives', coalesce((select r.valeur = 'true'::jsonb from plateforme.reglages_plateforme r where r.cle = 'alertes.actives'), false),
    'destinataires', coalesce((select r.valeur from plateforme.reglages_plateforme r where r.cle = 'alertes.destinataires'), '[]'::jsonb),
    'modifie_le', (select max(r.modifie_le) from plateforme.reglages_plateforme r where r.cle in ('alertes.actives', 'alertes.destinataires')))
$$;
revoke execute on function private.alertes_reglage() from public, anon, authenticated;

-- Un incident, tel que la console et l'e-mail le lisent.
create function private.incident_json(i plateforme.incidents)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', i.id, 'genre', i.genre, 'cible', i.cible, 'detail', i.detail, 'echecs', i.echecs,
    'ouvert_le', i.ouvert_le, 'dernier_le', i.dernier_le, 'clos_le', i.clos_le,
    'alerte_ouverture_le', i.alerte_ouverture_le, 'alerte_cloture_le', i.alerte_cloture_le,
    'alerte_erreur', i.alerte_erreur, 'seuil', private.incident_seuil(i.genre),
    'boutique', (select jsonb_build_object('nom', b.nom, 'slug', b.slug) from plateforme.boutiques b where b.id = i.boutique_id))
$$;
revoke execute on function private.incident_json(plateforme.incidents) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 1. Après chaque passage : ouvrir, prolonger, clore ; dire quoi annoncer
-- ---------------------------------------------------------------------
create function public.surveillance_incidents(p_passage bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  v_cle text;
  v_reglage jsonb := private.alertes_reglage();
begin
  if not exists (select 1 from plateforme.surveillance_passages p where p.id = p_passage) then
    raise exception 'Passage inconnu' using errcode = 'no_data_found';
  end if;

  -- Ce qui casse à ce passage : ouvrir, ou prolonger.
  for r in
    select distinct on (private.incident_cle(x.genre, x.boutique_id, x.cible)) x.genre, x.boutique_id, x.cible, x.detail
      from plateforme.surveillance_releves x
     where x.passage_id = p_passage and not x.ok
     order by private.incident_cle(x.genre, x.boutique_id, x.cible), x.id
  loop
    v_cle := private.incident_cle(r.genre, r.boutique_id, r.cible);
    update plateforme.incidents i
       set echecs = i.echecs + 1, dernier_le = now(), detail = coalesce(r.detail, i.detail)
     where i.cle = v_cle and i.clos_le is null;
    if not found then
      insert into plateforme.incidents (cle, genre, boutique_id, cible, detail)
      values (v_cle, r.genre, r.boutique_id, lower(r.cible), r.detail);
    end if;
  end loop;

  -- Ce qui ne casse plus : clore. Une vitrine, quand elle a répondu à ce
  -- passage (ou n'est plus surveillée : boutique fermée, domaine retiré) ;
  -- un domaine d'envoi, quand il est de nouveau vérifié (ou retiré) — il ne
  -- se vérifie qu'une fois par jour ; une file, dès qu'elle ne bloque plus.
  update plateforme.incidents i
     set clos_le = now()
   where i.clos_le is null
     and not exists (select 1 from plateforme.surveillance_releves x
                      where x.passage_id = p_passage and not x.ok
                        and private.incident_cle(x.genre, x.boutique_id, x.cible) = i.cle)
     and case i.genre
           when 'page' then
             exists (select 1 from plateforme.surveillance_releves x
                      where x.passage_id = p_passage and x.ok and x.genre = 'page' and lower(x.cible) = i.cible)
             or not exists (select 1 from plateforme.domaines d join plateforme.boutiques b on b.id = d.boutique_id
                             where d.hote = i.cible and b.statut = 'active')
           when 'domaine_envoi' then
             not exists (select 1 from plateforme.courriels_boutique c
                          where c.boutique_id = i.boutique_id and c.domaine = i.cible and c.statut is distinct from 'verifie')
           else true
         end;

  -- Quatre-vingt-dix jours d'histoire.
  delete from plateforme.incidents i where i.clos_le < now() - interval '90 days';

  return jsonb_build_object(
    'actives', v_reglage -> 'actives',
    'destinataires', v_reglage -> 'destinataires',
    -- À annoncer : ouvert, au seuil, pas encore annoncé (un jour d'essais au plus).
    'ouverts', coalesce((select jsonb_agg(private.incident_json(i) order by i.genre <> 'page', i.ouvert_le)
                           from plateforme.incidents i
                          where i.clos_le is null and i.alerte_ouverture_le is null
                            and i.echecs >= private.incident_seuil(i.genre) and i.alerte_essais < 24), '[]'::jsonb),
    -- Rétabli, après avoir été annoncé.
    'retablis', coalesce((select jsonb_agg(private.incident_json(i) order by i.clos_le)
                            from plateforme.incidents i
                           where i.clos_le is not null and i.alerte_ouverture_le is not null
                             and i.alerte_cloture_le is null and i.alerte_essais < 24), '[]'::jsonb));
end;
$$;

-- L'e-mail est parti (ou non) : noter, pour ne pas annoncer deux fois.
create function public.surveillance_alertes_notees(p_ouverts bigint[], p_retablis bigint[], p_ok boolean, p_raison text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_ok then
    update plateforme.incidents i set alerte_ouverture_le = now(), alerte_essais = 0, alerte_erreur = null
     where i.id = any (coalesce(p_ouverts, '{}')) and i.alerte_ouverture_le is null;
    update plateforme.incidents i set alerte_cloture_le = now(), alerte_essais = 0, alerte_erreur = null
     where i.id = any (coalesce(p_retablis, '{}')) and i.alerte_cloture_le is null;
  else
    update plateforme.incidents i
       set alerte_essais = i.alerte_essais + 1, alerte_erreur = left(coalesce(nullif(btrim(p_raison), ''), 'Envoi refusé'), 300)
     where i.id = any (coalesce(p_ouverts, '{}') || coalesce(p_retablis, '{}'));
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. La console : lire, régler
-- ---------------------------------------------------------------------
create function public.console_alertes(p_acteur uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  return private.alertes_reglage() || jsonb_build_object(
    -- Les ouverts d'abord, puis les quatorze derniers jours.
    'incidents', coalesce((select jsonb_agg(private.incident_json(i) order by i.clos_le is not null, coalesce(i.clos_le, i.ouvert_le) desc)
                             from plateforme.incidents i
                            where i.id in (select x.id from plateforme.incidents x
                                            where x.clos_le is null or x.clos_le > now() - interval '14 days'
                                            order by x.clos_le is not null, coalesce(x.clos_le, x.ouvert_le) desc limit 30)), '[]'::jsonb),
    'ouverts', (select count(*) from plateforme.incidents i where i.clos_le is null));
end;
$$;

create function public.console_regler_alertes(p_acteur uuid, p_actives boolean, p_destinataires text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant jsonb := private.alertes_reglage();
  v_liste text[];
  v_adresse text;
begin
  perform private.console_exige_super_admin(p_acteur);
  -- Les adresses : en minuscules, sans doublon, une à cinq, chacune lisible.
  select coalesce(array_agg(distinct lower(btrim(a))) filter (where btrim(a) <> ''), '{}')
    into v_liste from unnest(coalesce(p_destinataires, '{}')) a;
  foreach v_adresse in array v_liste loop
    if char_length(v_adresse) > 200 or v_adresse !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Adresse illisible : « % »', v_adresse using errcode = 'check_violation', hint = 'adresse';
    end if;
  end loop;
  if cardinality(v_liste) > 5 then
    raise exception 'Cinq adresses au plus' using errcode = 'check_violation', hint = 'adresse';
  end if;
  if coalesce(p_actives, false) and cardinality(v_liste) = 0 then
    raise exception 'Une adresse au moins, pour savoir à qui écrire' using errcode = 'check_violation', hint = 'adresse';
  end if;
  insert into plateforme.reglages_plateforme (cle, valeur, modifie_par)
  values ('alertes.actives', to_jsonb(coalesce(p_actives, false)), p_acteur),
         ('alertes.destinataires', to_jsonb(v_liste), p_acteur)
  on conflict (cle) do update set valeur = excluded.valeur, modifie_le = now(), modifie_par = p_acteur;
  perform private.console_trace(p_acteur, null, 'plateforme.alertes', null,
    v_avant - 'modifie_le', jsonb_build_object('actives', coalesce(p_actives, false), 'destinataires', to_jsonb(v_liste)));
  return private.alertes_reglage();
end;
$$;

revoke execute on function public.surveillance_incidents(bigint) from public, anon, authenticated;
revoke execute on function public.surveillance_alertes_notees(bigint[], bigint[], boolean, text) from public, anon, authenticated;
revoke execute on function public.console_alertes(uuid) from public, anon, authenticated;
revoke execute on function public.console_regler_alertes(uuid, boolean, text[]) from public, anon, authenticated;
grant  execute on function public.surveillance_incidents(bigint) to service_role;
grant  execute on function public.surveillance_alertes_notees(bigint[], bigint[], boolean, text) to service_role;
grant  execute on function public.console_alertes(uuid) to service_role;
grant  execute on function public.console_regler_alertes(uuid, boolean, text[]) to service_role;
