-- =====================================================================
-- LA CONSOMMATION — ce que chaque boutique envoie (e-mails, SMS), ce à
-- quoi elle a droit, et la main de SkanEcom dessus (demande de Skander,
-- 05/10 : « avoir toujours la main sur ces quotas, voir en temps réel
-- combien chaque boutique consomme et à combien elle a droit ») :
--
--   · le journal des envois dit désormais POUR QUI part chaque envoi (la
--     boutique, ou SkanEcom) et sa nature (code de connexion, suivi de
--     commande, accès de l'équipe, lettre d'information) ;
--   · plateforme.consommations : un compteur par boutique, mois, canal et
--     nature, tenu à chaque envoi — gardé au-delà des 90 jours du journal ;
--   · les quotas : un nombre d'e-mails et de SMS par mois sur la formule
--     (vide tant que SkanEcom ne l'a pas décidé : c'est commercial), une
--     exception par boutique, des crédits ponctuels pour un mois ;
--   · au dépassement, par boutique : compter seulement (par défaut : rien
--     ne bloque jamais une commande ni un code), ou faire passer les codes
--     de connexion par e-mail une fois les SMS épuisés. Un prix unitaire
--     sur la formule chiffre le dépassement (rien n'est facturé seul) ;
--   · le forfait du fournisseur (Resend gratuit : 3 000 par mois, 100 par
--     jour) : SkanEcom l'écrit, la console compare.
-- Les SMS : Supabase Auth les confie au crochet « Send SMS » de
-- l'application (/crochets/sms) ; la vitrine annonce le numéro avant de
-- demander le code (plateforme.sms_annonces, une empreinte, jamais le
-- numéro), le crochet y lit la boutique.
-- Le mois est celui de Tunis.
-- =====================================================================

create function private.mois_tunis(p timestamptz)
returns date
language sql
stable
set search_path = ''
as $$ select date_trunc('month', p at time zone 'Africa/Tunis')::date $$;
revoke execute on function private.mois_tunis(timestamptz) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- Pour qui, et quoi
-- ---------------------------------------------------------------------
alter table plateforme.envois
  add column boutique_id uuid references plateforme.boutiques (id) on delete set null,
  add column nature text check (nature is null or nature in ('code', 'commande', 'equipe', 'lettre'));
create index envois_boutique on plateforme.envois (boutique_id, le desc) where boutique_id is not null;

create table plateforme.consommations (
  -- null : SkanEcom elle-même (la console), et les envois d'avant ce comptage.
  boutique_id uuid references plateforme.boutiques (id) on delete cascade,
  mois        date not null check (mois = date_trunc('month', mois)::date),
  canal       text not null check (canal in ('email', 'sms')),
  nature      text not null check (nature in ('code', 'commande', 'equipe', 'lettre', 'autre')),
  envoyes     integer not null default 0 check (envoyes >= 0),
  refuses     integer not null default 0 check (refuses >= 0),
  dernier_le  timestamptz not null default now(),
  constraint consommations_cle unique nulls not distinct (boutique_id, mois, canal, nature)
);
create index consommations_mois on plateforme.consommations (mois, canal);
alter table plateforme.consommations enable row level security;

comment on table plateforme.consommations is
  'Les envois comptés par boutique (null : SkanEcom), mois de Tunis, canal et nature ; tenus par console_noter_envoi.';

-- Ce qui est déjà parti ce mois-ci compte (le fournisseur l'a compté) : sans boutique, faute de savoir.
insert into plateforme.consommations (boutique_id, mois, canal, nature, envoyes, refuses)
select null, private.mois_tunis(e.le), e.canal, 'autre', count(*) filter (where e.ok), count(*) filter (where not e.ok)
  from plateforme.envois e
 where e.le >= private.mois_tunis(now())::timestamp at time zone 'Africa/Tunis'
 group by 2, 3;


-- ---------------------------------------------------------------------
-- Les quotas
-- ---------------------------------------------------------------------
alter table plateforme.formules
  add column quota_emails_mois integer check (quota_emails_mois is null or quota_emails_mois between 0 and 10000000),
  add column quota_sms_mois    integer check (quota_sms_mois is null or quota_sms_mois between 0 and 1000000),
  -- Le prix d'un SMS, et de 1 000 e-mails, au-delà du quota : vides tant que SkanEcom ne les a pas fixés.
  add column prix_sms_sup_millimes    integer check (prix_sms_sup_millimes is null or prix_sms_sup_millimes between 0 and 100000),
  add column prix_emails_sup_millimes integer check (prix_emails_sup_millimes is null or prix_emails_sup_millimes between 0 and 10000000);

comment on column plateforme.formules.quota_emails_mois is 'E-mails compris par mois. NULL : pas encore décidé (rien n''est limité).';

create table plateforme.quotas_boutique (
  boutique_id uuid primary key references plateforme.boutiques (id) on delete cascade,
  -- null : celui de la formule.
  emails_mois integer check (emails_mois is null or emails_mois between 0 and 10000000),
  sms_mois    integer check (sms_mois is null or sms_mois between 0 and 1000000),
  depassement text not null default 'compter' check (depassement in ('compter', 'codes_par_email')),
  modifie_le  timestamptz not null default now(),
  modifie_par uuid references auth.users (id) on delete set null
);
alter table plateforme.quotas_boutique enable row level security;

create table plateforme.credits_envoi (
  id          bigint generated always as identity primary key,
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  mois        date not null check (mois = date_trunc('month', mois)::date),
  canal       text not null check (canal in ('email', 'sms')),
  quantite    integer not null check (quantite between 1 and 1000000),
  motif       text check (motif is null or char_length(motif) <= 200),
  cree_le     timestamptz not null default now(),
  cree_par    uuid references auth.users (id) on delete set null
);
create index credits_envoi_boutique on plateforme.credits_envoi (boutique_id, mois);
alter table plateforme.credits_envoi enable row level security;

/** Le quota d'une boutique pour un canal et un mois : l'exception de la
 *  boutique, sinon celui de sa formule, plus les crédits du mois.
 *  null : pas de limite fixée. */
create function private.quota_envois(p_boutique_id uuid, p_canal text, p_mois date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when x.base is null then null
              else x.base + coalesce((select sum(k.quantite) from plateforme.credits_envoi k
                                       where k.boutique_id = p_boutique_id and k.canal = p_canal and k.mois = p_mois), 0)::integer end
    from (select coalesce(case p_canal when 'sms' then q.sms_mois else q.emails_mois end,
                          case p_canal when 'sms' then f.quota_sms_mois else f.quota_emails_mois end) as base
            from plateforme.boutiques b
            left join plateforme.quotas_boutique q on q.boutique_id = b.id
            left join plateforme.formules f on f.code = b.formule
           where b.id = p_boutique_id) x
$$;

/** Ce qu'une boutique (null : SkanEcom) a envoyé sur un canal, un mois. */
create function private.conso_canal(p_boutique_id uuid, p_canal text, p_mois date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'envoyes', coalesce(sum(c.envoyes), 0),
    'refuses', coalesce(sum(c.refuses), 0),
    'par_nature', coalesce(jsonb_object_agg(c.nature, c.envoyes) filter (where c.envoyes > 0), '{}'::jsonb),
    'dernier_le', max(c.dernier_le),
    'quota', private.quota_envois(p_boutique_id, p_canal, p_mois),
    'credits', coalesce((select sum(k.quantite) from plateforme.credits_envoi k
                          where k.boutique_id = p_boutique_id and k.canal = p_canal and k.mois = p_mois), 0),
    -- Les six derniers mois, du plus ancien au mois lu.
    'historique', (select jsonb_agg(coalesce((select sum(h.envoyes) from plateforme.consommations h
                                               where h.boutique_id is not distinct from p_boutique_id and h.canal = p_canal and h.mois = m.mois), 0)
                                    order by m.mois)
                     from (select (p_mois - make_interval(months => g))::date as mois from generate_series(5, 0, -1) g) m))
    from plateforme.consommations c
   where c.boutique_id is not distinct from p_boutique_id and c.canal = p_canal and c.mois = p_mois
$$;

revoke execute on function private.quota_envois(uuid, text, date) from public, anon, authenticated;
revoke execute on function private.conso_canal(uuid, text, date) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- Noter un envoi : le journal, et le compteur
-- ---------------------------------------------------------------------
drop function public.console_noter_envoi(text, text, text, text, text, boolean, text);
create function public.console_noter_envoi(p_canal text, p_destinataire text, p_expediteur text, p_sujet text,
                                           p_fournisseur text, p_ok boolean, p_raison text,
                                           p_boutique_id uuid default null, p_nature text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_canal    text := case when p_canal = 'sms' then 'sms' else 'email' end;
  v_boutique uuid := (select b.id from plateforme.boutiques b where b.id = p_boutique_id);
  v_nature   text := case when p_nature in ('code', 'commande', 'equipe', 'lettre') then p_nature end;
  v_ok       boolean := coalesce(p_ok, false);
begin
  insert into plateforme.envois (canal, destinataire, expediteur, sujet, fournisseur, ok, raison, boutique_id, nature)
  values (v_canal, private.masquer_adresse(coalesce(p_destinataire, '')), left(p_expediteur, 120), left(p_sujet, 200),
          left(coalesce(nullif(p_fournisseur, ''), 'aucun'), 20), v_ok, left(p_raison, 300), v_boutique, v_nature);
  insert into plateforme.consommations as c (boutique_id, mois, canal, nature, envoyes, refuses)
  values (v_boutique, private.mois_tunis(now()), v_canal, coalesce(v_nature, 'autre'),
          case when v_ok then 1 else 0 end, case when v_ok then 0 else 1 end)
  on conflict on constraint consommations_cle do update
    set envoyes = c.envoyes + excluded.envoyes, refuses = c.refuses + excluded.refuses, dernier_le = now();
  -- Trois mois suffisent pour savoir ce qui part et ce qui casse (les compteurs, eux, restent).
  delete from plateforme.envois where le < now() - interval '90 days';
end;
$$;


-- ---------------------------------------------------------------------
-- Les SMS : la vitrine annonce le numéro, le crochet y lit la boutique
-- ---------------------------------------------------------------------
create table plateforme.sms_annonces (
  -- L'empreinte des chiffres du numéro (sha256) : jamais le numéro.
  empreinte   text primary key check (empreinte ~ '^[0-9a-f]{64}$'),
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  le          timestamptz not null default now()
);
alter table plateforme.sms_annonces enable row level security;

create function private.empreinte_telephone(p_telephone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when length(regexp_replace(coalesce(p_telephone, ''), '\D', '', 'g')) between 8 and 15
              then encode(sha256(convert_to(regexp_replace(p_telephone, '\D', '', 'g'), 'UTF8')), 'hex') end
$$;
revoke execute on function private.empreinte_telephone(text) from public, anon, authenticated;

create function public.vitrine_annoncer_sms(p_boutique_id uuid, p_telephone text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_empreinte text := private.empreinte_telephone(p_telephone);
begin
  if v_empreinte is null or not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut <> 'fermee') then
    return;
  end if;
  insert into plateforme.sms_annonces (empreinte, boutique_id) values (v_empreinte, p_boutique_id)
  on conflict (empreinte) do update set boutique_id = excluded.boutique_id, le = now();
  delete from plateforme.sms_annonces where le < now() - interval '15 minutes';
end;
$$;

/** La boutique qui a demandé un code pour ce numéro dans le quart d'heure
 *  ({ id, nom }, ou null) ; l'annonce est consommée. */
create function public.console_boutique_du_sms(p_telephone text)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  with lue as (
    delete from plateforme.sms_annonces a
     where a.empreinte = private.empreinte_telephone(p_telephone) and a.le >= now() - interval '15 minutes'
    returning a.boutique_id
  )
  select jsonb_build_object('id', b.id, 'nom', b.nom) from lue join plateforme.boutiques b on b.id = lue.boutique_id
$$;

/** Les codes de connexion de cette boutique doivent-ils passer par e-mail ?
 *  Oui quand elle l'a choisi au dépassement et que ses SMS du mois sont épuisés. */
create function public.vitrine_codes_par_email(p_boutique_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select q.depassement = 'codes_par_email'
           and private.quota_envois(p_boutique_id, 'sms', private.mois_tunis(now())) is not null
           and coalesce((select sum(c.envoyes) from plateforme.consommations c
                          where c.boutique_id = p_boutique_id and c.canal = 'sms' and c.mois = private.mois_tunis(now())), 0)
               >= private.quota_envois(p_boutique_id, 'sms', private.mois_tunis(now()))
      from plateforme.quotas_boutique q where q.boutique_id = p_boutique_id), false)
$$;


-- ---------------------------------------------------------------------
-- La console : lire
-- ---------------------------------------------------------------------
create function public.console_consommation(p_acteur uuid, p_mois date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_courant date := private.mois_tunis(now());
  v_mois    date := least(date_trunc('month', coalesce(p_mois, v_courant))::date, v_courant);
  v_fin     date := (v_mois + interval '1 month - 1 day')::date;
  v_jour    timestamptz := date_trunc('day', now() at time zone 'Africa/Tunis') at time zone 'Africa/Tunis';
begin
  perform private.console_exige_admin(p_acteur);
  return jsonb_build_object(
    'mois', v_mois,
    'courant', v_mois = v_courant,
    'jours_mois', extract(day from v_fin)::int,
    'jours_ecoules', case when v_mois = v_courant then extract(day from now() at time zone 'Africa/Tunis')::int else extract(day from v_fin)::int end,
    'mois_disponibles', (select jsonb_agg(x.m order by x.m desc)
                           from (select distinct c.mois as m from plateforme.consommations c union select v_courant) x),
    'forfaits', jsonb_build_object(
      'email', (select r.valeur from plateforme.reglages_plateforme r where r.cle = 'envois.forfait_email'),
      'sms', (select r.valeur from plateforme.reglages_plateforme r where r.cle = 'envois.forfait_sms')),
    'aujourdhui', jsonb_build_object(
      'email', (select count(*) from plateforme.envois e where e.canal = 'email' and e.ok and e.le >= v_jour),
      'sms', (select count(*) from plateforme.envois e where e.canal = 'sms' and e.ok and e.le >= v_jour)),
    'totaux', jsonb_build_object(
      'email', (select jsonb_build_object('envoyes', coalesce(sum(c.envoyes), 0), 'refuses', coalesce(sum(c.refuses), 0),
                                          'par_nature', coalesce((select jsonb_object_agg(n.nature, n.envoyes) from (
                                              select c2.nature, sum(c2.envoyes)::int as envoyes from plateforme.consommations c2
                                               where c2.mois = v_mois and c2.canal = 'email' group by c2.nature having sum(c2.envoyes) > 0) n), '{}'::jsonb))
                  from plateforme.consommations c where c.mois = v_mois and c.canal = 'email'),
      'sms', (select jsonb_build_object('envoyes', coalesce(sum(c.envoyes), 0), 'refuses', coalesce(sum(c.refuses), 0),
                                        'par_nature', coalesce((select jsonb_object_agg(n.nature, n.envoyes) from (
                                            select c2.nature, sum(c2.envoyes)::int as envoyes from plateforme.consommations c2
                                             where c2.mois = v_mois and c2.canal = 'sms' group by c2.nature having sum(c2.envoyes) > 0) n), '{}'::jsonb))
                from plateforme.consommations c where c.mois = v_mois and c.canal = 'sms')),
    'skanecom', jsonb_build_object('email', private.conso_canal(null, 'email', v_mois), 'sms', private.conso_canal(null, 'sms', v_mois)),
    'boutiques', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'slug', b.slug, 'nom', b.nom, 'statut', b.statut, 'demonstration', b.demonstration,
               'formule', b.formule, 'formule_nom', f.nom,
               'depassement', coalesce(q.depassement, 'compter'),
               'exception', jsonb_build_object('emails', q.emails_mois, 'sms', q.sms_mois),
               'email', private.conso_canal(b.id, 'email', v_mois),
               'sms', private.conso_canal(b.id, 'sms', v_mois),
               'credits', coalesce((
                 select jsonb_agg(jsonb_build_object('id', k.id, 'canal', k.canal, 'quantite', k.quantite, 'motif', k.motif,
                                                     'le', k.cree_le, 'par', u.email) order by k.id)
                   from plateforme.credits_envoi k left join auth.users u on u.id = k.cree_par
                  where k.boutique_id = b.id and k.mois = v_mois), '[]'::jsonb))
             order by b.nom)
        from plateforme.boutiques b
        left join plateforme.formules f on f.code = b.formule
        left join plateforme.quotas_boutique q on q.boutique_id = b.id
       where b.statut <> 'fermee'
          or exists (select 1 from plateforme.consommations c where c.boutique_id = b.id and c.mois = v_mois)), '[]'::jsonb),
    'formules', coalesce((
      select jsonb_agg(jsonb_build_object('code', f.code, 'nom', f.nom, 'prix', f.prix_mensuel_millimes,
                                          'emails', f.quota_emails_mois, 'sms', f.quota_sms_mois,
                                          'prix_sms', f.prix_sms_sup_millimes, 'prix_emails', f.prix_emails_sup_millimes,
                                          'boutiques', (select count(*) from plateforme.boutiques b where b.formule = f.code and b.statut <> 'fermee'))
             order by f.position, f.code)
        from plateforme.formules f), '[]'::jsonb)
  );
end;
$$;

/** Le léger, pour « À surveiller » (lu sur chaque page de la console) : les
 *  boutiques clientes ouvertes qui ont un quota, et le forfait du fournisseur. */
create function public.console_quotas(p_acteur uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mois date := private.mois_tunis(now());
  v_jour timestamptz := date_trunc('day', now() at time zone 'Africa/Tunis') at time zone 'Africa/Tunis';
begin
  perform private.console_exige_admin(p_acteur);
  return jsonb_build_object(
    'boutiques', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'canal', x.canal, 'envoyes', x.envoyes, 'quota', x.quota))
        from (select b.id, k.canal, private.quota_envois(b.id, k.canal, v_mois) as quota,
                     coalesce((select sum(c.envoyes) from plateforme.consommations c
                                where c.boutique_id = b.id and c.canal = k.canal and c.mois = v_mois), 0)::int as envoyes
                from plateforme.boutiques b cross join (values ('email'), ('sms')) k (canal)
               where b.statut = 'active' and not b.demonstration) x
       where x.quota is not null), '[]'::jsonb),
    'forfaits', jsonb_build_object(
      'email', (select r.valeur from plateforme.reglages_plateforme r where r.cle = 'envois.forfait_email'),
      'sms', (select r.valeur from plateforme.reglages_plateforme r where r.cle = 'envois.forfait_sms')),
    'mois', jsonb_build_object(
      'email', (select coalesce(sum(c.envoyes), 0) from plateforme.consommations c where c.mois = v_mois and c.canal = 'email'),
      'sms', (select coalesce(sum(c.envoyes), 0) from plateforme.consommations c where c.mois = v_mois and c.canal = 'sms')),
    'jour', jsonb_build_object(
      'email', (select count(*) from plateforme.envois e where e.canal = 'email' and e.ok and e.le >= v_jour),
      'sms', (select count(*) from plateforme.envois e where e.canal = 'sms' and e.ok and e.le >= v_jour))
  );
end;
$$;


-- ---------------------------------------------------------------------
-- La console : régler (super-administrateur, tracé au journal)
-- ---------------------------------------------------------------------
create function public.console_regler_quota_boutique(p_acteur uuid, p_boutique_id uuid, p_emails_mois integer,
                                                     p_sms_mois integer, p_depassement text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_depassement text := coalesce(nullif(p_depassement, ''), 'compter');
  v_avant jsonb;
  v_apres jsonb;
begin
  perform private.console_exige_super_admin(p_acteur);
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id) then
    raise exception 'Boutique introuvable' using errcode = 'P0002';
  end if;
  if v_depassement not in ('compter', 'codes_par_email') then
    raise exception 'Au dépassement : « compter » ou « codes_par_email »' using errcode = '22023';
  end if;
  if p_emails_mois not between 0 and 10000000 or p_sms_mois not between 0 and 1000000 then
    raise exception 'Un quota est un nombre positif (au plus 10 000 000 e-mails, 1 000 000 SMS)' using errcode = '22023';
  end if;
  v_avant := coalesce((select jsonb_build_object('emails', q.emails_mois, 'sms', q.sms_mois, 'depassement', q.depassement)
                         from plateforme.quotas_boutique q where q.boutique_id = p_boutique_id),
                      jsonb_build_object('emails', null, 'sms', null, 'depassement', 'compter'));
  v_apres := jsonb_build_object('emails', p_emails_mois, 'sms', p_sms_mois, 'depassement', v_depassement);
  if v_avant = v_apres then
    return false;
  end if;
  if p_emails_mois is null and p_sms_mois is null and v_depassement = 'compter' then
    delete from plateforme.quotas_boutique where boutique_id = p_boutique_id;
  else
    insert into plateforme.quotas_boutique (boutique_id, emails_mois, sms_mois, depassement, modifie_par)
    values (p_boutique_id, p_emails_mois, p_sms_mois, v_depassement, p_acteur)
    on conflict (boutique_id) do update
      set emails_mois = excluded.emails_mois, sms_mois = excluded.sms_mois, depassement = excluded.depassement,
          modifie_le = now(), modifie_par = p_acteur;
  end if;
  perform private.console_trace(p_acteur, p_boutique_id, 'boutique.quotas', null, v_avant, v_apres);
  return true;
end;
$$;

create function public.console_crediter_envois(p_acteur uuid, p_boutique_id uuid, p_canal text, p_quantite integer, p_motif text)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform private.console_exige_super_admin(p_acteur);
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id) then
    raise exception 'Boutique introuvable' using errcode = 'P0002';
  end if;
  if p_canal not in ('email', 'sms') then
    raise exception 'Canal : « email » ou « sms »' using errcode = '22023';
  end if;
  if p_quantite is null or p_quantite not between 1 and 1000000 then
    raise exception 'Un crédit va de 1 à 1 000 000 envois' using errcode = '22023';
  end if;
  insert into plateforme.credits_envoi (boutique_id, mois, canal, quantite, motif, cree_par)
  values (p_boutique_id, private.mois_tunis(now()), p_canal, p_quantite, nullif(left(btrim(coalesce(p_motif, '')), 200), ''), p_acteur)
  returning id into v_id;
  perform private.console_trace(p_acteur, p_boutique_id, 'boutique.credit_envois', p_canal, null,
    jsonb_build_object('canal', p_canal, 'quantite', p_quantite, 'motif', nullif(btrim(coalesce(p_motif, '')), ''), 'mois', private.mois_tunis(now())));
  return v_id;
end;
$$;

create function public.console_retirer_credit_envois(p_acteur uuid, p_credit_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c plateforme.credits_envoi;
begin
  perform private.console_exige_super_admin(p_acteur);
  select * into v_c from plateforme.credits_envoi k where k.id = p_credit_id;
  if not found then
    raise exception 'Crédit introuvable' using errcode = 'P0002';
  end if;
  if v_c.mois <> private.mois_tunis(now()) then
    raise exception 'Un crédit d''un mois passé reste : il a servi' using errcode = '22023';
  end if;
  delete from plateforme.credits_envoi where id = p_credit_id;
  perform private.console_trace(p_acteur, v_c.boutique_id, 'boutique.credit_envois_retire', v_c.canal,
    jsonb_build_object('canal', v_c.canal, 'quantite', v_c.quantite, 'motif', v_c.motif), null);
end;
$$;

create function public.console_regler_quotas_formule(p_acteur uuid, p_code text, p_emails_mois integer, p_sms_mois integer,
                                                     p_prix_sms_millimes integer, p_prix_emails_millimes integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_f     plateforme.formules;
  v_avant jsonb;
  v_apres jsonb := jsonb_build_object('emails', p_emails_mois, 'sms', p_sms_mois,
                                      'prix_sms', p_prix_sms_millimes, 'prix_emails', p_prix_emails_millimes);
begin
  perform private.console_exige_super_admin(p_acteur);
  select * into v_f from plateforme.formules f where f.code = p_code;
  if not found then
    raise exception 'Formule introuvable' using errcode = 'P0002';
  end if;
  v_avant := jsonb_build_object('emails', v_f.quota_emails_mois, 'sms', v_f.quota_sms_mois,
                                'prix_sms', v_f.prix_sms_sup_millimes, 'prix_emails', v_f.prix_emails_sup_millimes);
  if v_avant = v_apres then
    return false;
  end if;
  -- (les bornes : celles des colonnes, qui refusent en 23514)
  update plateforme.formules
     set quota_emails_mois = p_emails_mois, quota_sms_mois = p_sms_mois,
         prix_sms_sup_millimes = p_prix_sms_millimes, prix_emails_sup_millimes = p_prix_emails_millimes, updated_at = now()
   where code = p_code;
  perform private.console_trace(p_acteur, null, 'formule.quotas', p_code, v_avant, v_apres);
  return true;
end;
$$;

create function public.console_regler_forfait_envoi(p_acteur uuid, p_canal text, p_fournisseur text, p_par_mois integer, p_par_jour integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cle   text := 'envois.forfait_' || p_canal;
  v_avant jsonb;
  v_apres jsonb;
begin
  perform private.console_exige_super_admin(p_acteur);
  if p_canal not in ('email', 'sms') then
    raise exception 'Canal : « email » ou « sms »' using errcode = '22023';
  end if;
  if p_par_mois not between 1 and 100000000 or p_par_jour not between 1 and 10000000 then
    raise exception 'Un forfait est un nombre d''envois positif' using errcode = '22023';
  end if;
  select r.valeur into v_avant from plateforme.reglages_plateforme r where r.cle = v_cle;
  if p_par_mois is null and p_par_jour is null then
    if v_avant is null then
      return false;
    end if;
    delete from plateforme.reglages_plateforme where cle = v_cle;
  else
    v_apres := jsonb_build_object('fournisseur', nullif(left(btrim(coalesce(p_fournisseur, '')), 40), ''), 'mois', p_par_mois, 'jour', p_par_jour);
    if v_avant = v_apres then
      return false;
    end if;
    insert into plateforme.reglages_plateforme (cle, valeur, modifie_par) values (v_cle, v_apres, p_acteur)
    on conflict (cle) do update set valeur = excluded.valeur, modifie_le = now(), modifie_par = p_acteur;
  end if;
  perform private.console_trace(p_acteur, null, 'plateforme.forfait_envoi', p_canal, v_avant, v_apres);
  return true;
end;
$$;


-- ---------------------------------------------------------------------
-- Les formules disent leurs quotas (le reste comme au lot A : une boutique
-- fermée ne compte plus parmi celles d'une formule, chacune dit son statut)
-- ---------------------------------------------------------------------
create or replace function public.console_formules(p_acteur uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  return jsonb_build_object(
    'formules', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', f.code, 'nom', f.nom, 'description', f.description, 'prix', f.prix_mensuel_millimes,
               'position', f.position,
               'droits', coalesce((select jsonb_agg(fd.droit order by fd.droit) from plateforme.formule_droits fd where fd.formule = f.code), '[]'::jsonb),
               'boutiques', (select count(*) from plateforme.boutiques b where b.formule = f.code and b.statut <> 'fermee'),
               'quotas', jsonb_build_object('emails', f.quota_emails_mois, 'sms', f.quota_sms_mois,
                                            'prix_sms', f.prix_sms_sup_millimes, 'prix_emails', f.prix_emails_sup_millimes))
             order by f.position, f.code)
        from plateforme.formules f), '[]'::jsonb),
    'droits', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', d.code, 'genre', d.genre, 'groupe', d.groupe, 'libelle', d.libelle_fr, 'description', d.description_fr,
               'disponible', d.module is null or (select m.disponible from plateforme.modules m where m.code = d.module))
             order by d.groupe, d.position, d.code)
        from plateforme.droits d), '[]'::jsonb),
    'boutiques', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'slug', b.slug, 'nom', b.nom, 'formule', b.formule,
                                          'demonstration', b.demonstration, 'statut', b.statut)
             order by b.nom)
        from plateforme.boutiques b), '[]'::jsonb)
  );
end;
$$;


revoke execute on function public.console_noter_envoi(text, text, text, text, text, boolean, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.vitrine_annoncer_sms(uuid, text) from public, anon, authenticated;
revoke execute on function public.console_boutique_du_sms(text) from public, anon, authenticated;
revoke execute on function public.vitrine_codes_par_email(uuid) from public;
revoke execute on function public.console_consommation(uuid, date) from public, anon, authenticated;
revoke execute on function public.console_quotas(uuid) from public, anon, authenticated;
revoke execute on function public.console_regler_quota_boutique(uuid, uuid, integer, integer, text) from public, anon, authenticated;
revoke execute on function public.console_crediter_envois(uuid, uuid, text, integer, text) from public, anon, authenticated;
revoke execute on function public.console_retirer_credit_envois(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.console_regler_quotas_formule(uuid, text, integer, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.console_regler_forfait_envoi(uuid, text, text, integer, integer) from public, anon, authenticated;
grant  execute on function public.console_noter_envoi(text, text, text, text, text, boolean, text, uuid, text) to service_role;
grant  execute on function public.vitrine_annoncer_sms(uuid, text) to service_role;
grant  execute on function public.console_boutique_du_sms(text) to service_role;
-- (oui ou non, rien d'autre : la vitrine en a besoin pour proposer le bon canal)
grant  execute on function public.vitrine_codes_par_email(uuid) to anon, authenticated, service_role;
grant  execute on function public.console_consommation(uuid, date) to service_role;
grant  execute on function public.console_quotas(uuid) to service_role;
grant  execute on function public.console_regler_quota_boutique(uuid, uuid, integer, integer, text) to service_role;
grant  execute on function public.console_crediter_envois(uuid, uuid, text, integer, text) to service_role;
grant  execute on function public.console_retirer_credit_envois(uuid, bigint) to service_role;
grant  execute on function public.console_regler_quotas_formule(uuid, text, integer, integer, integer, integer) to service_role;
grant  execute on function public.console_regler_forfait_envoi(uuid, text, text, integer, integer) to service_role;
