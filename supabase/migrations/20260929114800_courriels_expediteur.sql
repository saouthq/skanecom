-- =====================================================================
-- Les e-mails, réglés depuis la console : au nom de qui, où vont les
-- réponses, et depuis quel domaine (demande de Skander, 05/10).
--
--   · par boutique : le nom affiché (vide : celui de la boutique), l'adresse
--     où vont les réponses de ses clients (vide : aucune, la réponse va à
--     l'expéditeur de la plateforme) ;
--   · son propre domaine d'envoi (commandes@maymar.tn), coupé par défaut :
--     ajouté chez le fournisseur d'e-mails, les enregistrements DNS à poser,
--     vérifié, puis allumé — jamais allumé sans être vérifié ; une
--     vérification perdue le coupe ;
--   · pour la plateforme : l'adresse où vont les réponses de l'équipe
--     (invitations, mots de passe) ;
--   · l'envoi d'essai depuis la console, compté à SkanEcom (nature
--     « essai »), jamais au quota d'une boutique.
--
-- L'appel au fournisseur (sa clé est un secret du Worker) se fait dans
-- l'application ; la base garde ce qu'il a répondu, et l'état.
-- Tout réglage : super-administrateur, tracé au journal ; le support lit.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Une nature de plus : l'essai
-- ---------------------------------------------------------------------
alter table plateforme.envois drop constraint envois_nature_check;
alter table plateforme.envois add constraint envois_nature_check
  check (nature is null or nature in ('code', 'commande', 'equipe', 'lettre', 'essai'));
alter table plateforme.consommations drop constraint consommations_nature_check;
alter table plateforme.consommations add constraint consommations_nature_check
  check (nature in ('code', 'commande', 'equipe', 'lettre', 'essai', 'autre'));

create or replace function public.console_noter_envoi(p_canal text, p_destinataire text, p_expediteur text, p_sujet text,
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
  v_nature   text := case when p_nature in ('code', 'commande', 'equipe', 'lettre', 'essai') then p_nature end;
  v_ok       boolean := coalesce(p_ok, false);
begin
  -- Le journal dit aux couleurs de quelle boutique l'essai est parti…
  insert into plateforme.envois (canal, destinataire, expediteur, sujet, fournisseur, ok, raison, boutique_id, nature)
  values (v_canal, private.masquer_adresse(coalesce(p_destinataire, '')), left(p_expediteur, 120), left(p_sujet, 200),
          left(coalesce(nullif(p_fournisseur, ''), 'aucun'), 20), v_ok, left(p_raison, 300), v_boutique, v_nature);
  -- … mais un essai se compte à SkanEcom, jamais au quota de la boutique.
  insert into plateforme.consommations as c (boutique_id, mois, canal, nature, envoyes, refuses)
  values (case when v_nature = 'essai' then null else v_boutique end, private.mois_tunis(now()), v_canal, coalesce(v_nature, 'autre'),
          case when v_ok then 1 else 0 end, case when v_ok then 0 else 1 end)
  on conflict on constraint consommations_cle do update
    set envoyes = c.envoyes + excluded.envoyes, refuses = c.refuses + excluded.refuses, dernier_le = now();
  -- Trois mois suffisent pour savoir ce qui part et ce qui casse (les compteurs, eux, restent).
  delete from plateforme.envois where le < now() - interval '90 days';
end;
$$;

-- ---------------------------------------------------------------------
-- Les réglages d'envoi d'une boutique
-- ---------------------------------------------------------------------
create table plateforme.courriels_boutique (
  boutique_id     uuid primary key references plateforme.boutiques (id) on delete cascade,
  -- Vide : le nom de la boutique.
  nom_expediteur  text check (nom_expediteur is null or char_length(nom_expediteur) between 1 and 60),
  -- Vide : pas d'adresse de réponse (la réponse va à l'expéditeur).
  reponse_a       text check (reponse_a is null or reponse_a ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'),
  -- Son domaine d'envoi : l'adresse est <adresse_locale>@<domaine>.
  domaine         text check (domaine is null or (char_length(domaine) <= 200
                    and domaine ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$')),
  adresse_locale  text not null default 'commandes' check (adresse_locale ~ '^[a-z0-9]([a-z0-9._-]{0,38}[a-z0-9])?$'),
  fournisseur     text check (fournisseur is null or fournisseur in ('resend', 'brevo', 'apercu', 'relais')),
  -- L'identifiant du domaine chez le fournisseur.
  ref_fournisseur text check (ref_fournisseur is null or char_length(ref_fournisseur) <= 120),
  statut          text check (statut is null or statut in ('en_attente', 'verifie', 'echec')),
  -- Les enregistrements DNS que le fournisseur demande, et leur état.
  enregistrements jsonb not null default '[]'::jsonb check (jsonb_typeof(enregistrements) = 'array'),
  ajoute_le       timestamptz,
  verifie_le      timestamptz,
  derniere_verif  timestamptz,
  -- Coupé par défaut ; jamais allumé sans un domaine vérifié.
  domaine_actif   boolean not null default false,
  modifie_le      timestamptz not null default now(),
  modifie_par     uuid references auth.users (id) on delete set null,
  constraint courriels_domaine_verifie check (not domaine_actif or (domaine is not null and statut = 'verifie'))
);
-- Un domaine d'envoi n'appartient qu'à une boutique.
create unique index courriels_boutique_domaine on plateforme.courriels_boutique (domaine) where domaine is not null;
alter table plateforme.courriels_boutique enable row level security;
comment on table plateforme.courriels_boutique is
  'Les réglages d''envoi des e-mails d''une boutique (nom affiché, réponses, domaine d''envoi) ; réglés depuis la console.';

-- ---------------------------------------------------------------------
-- Qui écrit, au nom de qui, où vont les réponses (l'application, à chaque envoi)
-- ---------------------------------------------------------------------
create function public.courriels_expediteur(p_boutique_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'nom',      c.nom_expediteur,
    'reponse_a', c.reponse_a,
    'adresse',  case when c.domaine_actif and c.statut = 'verifie' then c.adresse_locale || '@' || c.domaine end,
    'reponse_plateforme', (select r.valeur #>> '{}' from plateforme.reglages_plateforme r where r.cle = 'courriels.reponse_a'))
  from (select 1) x
  left join plateforme.courriels_boutique c on c.boutique_id = p_boutique_id;
$$;

-- ---------------------------------------------------------------------
-- Lire (la console : la page E-mails, l'onglet d'une boutique)
-- ---------------------------------------------------------------------
create function private.courriels_de(p_boutique_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id, 'slug', b.slug, 'nom', b.nom, 'statut', b.statut, 'demonstration', b.demonstration,
    'email_boutique', nullif(btrim(private.reglage(b.id, 'legal.email') #>> '{}'), ''),
    'hote_principal', (select d.hote from plateforme.domaines d where d.boutique_id = b.id and d.principal limit 1),
    'nom_expediteur', c.nom_expediteur, 'reponse_a', c.reponse_a,
    'domaine', c.domaine, 'adresse_locale', coalesce(c.adresse_locale, 'commandes'),
    'fournisseur', c.fournisseur, 'ref_fournisseur', c.ref_fournisseur, 'statut_domaine', c.statut,
    'enregistrements', coalesce(c.enregistrements, '[]'::jsonb),
    'ajoute_le', c.ajoute_le, 'verifie_le', c.verifie_le, 'derniere_verif', c.derniere_verif,
    'domaine_actif', coalesce(c.domaine_actif, false))
  from plateforme.boutiques b
  left join plateforme.courriels_boutique c on c.boutique_id = b.id
  where b.id = p_boutique_id;
$$;

create function public.console_courriels(p_acteur uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mois date := private.mois_tunis(now());
begin
  perform private.console_exige_admin(p_acteur);
  return jsonb_build_object(
    'reponse_plateforme', (select r.valeur #>> '{}' from plateforme.reglages_plateforme r where r.cle = 'courriels.reponse_a'),
    'mois', jsonb_build_object(
      'envoyes', coalesce((select sum(c.envoyes) from plateforme.consommations c where c.mois = v_mois and c.canal = 'email'), 0),
      'refuses', coalesce((select sum(c.refuses) from plateforme.consommations c where c.mois = v_mois and c.canal = 'email'), 0)),
    'dernier_refus', (select jsonb_build_object('le', e.le, 'raison', e.raison, 'sujet', e.sujet)
                        from plateforme.envois e where e.canal = 'email' and not e.ok order by e.le desc limit 1),
    'dernier_envoi', (select max(e.le) from plateforme.envois e where e.canal = 'email' and e.ok),
    'boutiques', coalesce((select jsonb_agg(private.courriels_de(b.id) order by b.demonstration, lower(b.nom))
                             from plateforme.boutiques b where b.statut <> 'fermee'), '[]'::jsonb));
end;
$$;

create function public.console_courriels_boutique(p_acteur uuid, p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id) then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  return private.courriels_de(p_boutique_id)
    || jsonb_build_object('reponse_plateforme',
         (select r.valeur #>> '{}' from plateforme.reglages_plateforme r where r.cle = 'courriels.reponse_a'));
end;
$$;

-- ---------------------------------------------------------------------
-- Régler : le nom affiché, l'adresse de réponse
-- ---------------------------------------------------------------------
create function private.adresse_lisible(p text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(lower(btrim(coalesce(p, ''))), '');
begin
  if v is not null and (char_length(v) > 200 or v !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$') then
    raise exception 'Adresse e-mail illisible : « % » (écrivez-la entière, par exemple contact@boutique.tn)', left(v, 80) using errcode = '22023';
  end if;
  return v;
end;
$$;

create function public.console_regler_courriels_boutique(p_acteur uuid, p_boutique_id uuid, p_nom text, p_reponse_a text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nom     text := nullif(left(btrim(regexp_replace(coalesce(p_nom, ''), '[[:cntrl:]"<>]', '', 'g')), 60), '');
  v_reponse text := private.adresse_lisible(p_reponse_a);
  v_avant   plateforme.courriels_boutique;
begin
  perform private.console_exige_super_admin(p_acteur);
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id) then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  select * into v_avant from plateforme.courriels_boutique c where c.boutique_id = p_boutique_id;
  if v_avant.nom_expediteur is not distinct from v_nom and v_avant.reponse_a is not distinct from v_reponse then
    return jsonb_build_object('change', false);
  end if;
  insert into plateforme.courriels_boutique (boutique_id, nom_expediteur, reponse_a, modifie_par)
  values (p_boutique_id, v_nom, v_reponse, p_acteur)
  on conflict (boutique_id) do update
    set nom_expediteur = excluded.nom_expediteur, reponse_a = excluded.reponse_a, modifie_le = now(), modifie_par = p_acteur;
  perform private.console_trace(p_acteur, p_boutique_id, 'boutique.courriels', null,
    jsonb_build_object('nom', v_avant.nom_expediteur, 'reponse_a', v_avant.reponse_a),
    jsonb_build_object('nom', v_nom, 'reponse_a', v_reponse));
  return jsonb_build_object('change', true, 'nom', v_nom, 'reponse_a', v_reponse);
end;
$$;

create function public.console_regler_reponse_plateforme(p_acteur uuid, p_reponse_a text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reponse text := private.adresse_lisible(p_reponse_a);
  v_avant   text;
begin
  perform private.console_exige_super_admin(p_acteur);
  select r.valeur #>> '{}' into v_avant from plateforme.reglages_plateforme r where r.cle = 'courriels.reponse_a';
  if v_avant is not distinct from v_reponse then
    return false;
  end if;
  if v_reponse is null then
    delete from plateforme.reglages_plateforme where cle = 'courriels.reponse_a';
  else
    insert into plateforme.reglages_plateforme (cle, valeur, modifie_par) values ('courriels.reponse_a', to_jsonb(v_reponse), p_acteur)
    on conflict (cle) do update set valeur = excluded.valeur, modifie_le = now(), modifie_par = p_acteur;
  end if;
  perform private.console_trace(p_acteur, null, 'plateforme.courriels', 'courriels.reponse_a',
    jsonb_build_object('reponse_a', v_avant), jsonb_build_object('reponse_a', v_reponse));
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- Le domaine d'envoi : ajouté, vérifié, allumé, retiré
-- ---------------------------------------------------------------------
create function private.enregistrements_lisibles(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 20 or octet_length(p::text) > 20000 then
    raise exception 'Enregistrements DNS illisibles' using errcode = '22023';
  end if;
  return p;
end;
$$;

create function public.console_poser_domaine_envoi(p_acteur uuid, p_boutique_id uuid, p_domaine text, p_adresse_locale text,
                                                   p_fournisseur text, p_ref text, p_statut text, p_enregistrements jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_domaine text := lower(btrim(regexp_replace(coalesce(p_domaine, ''), '^(https?://)?(www\.)?', '')));
  v_locale  text := lower(btrim(coalesce(nullif(p_adresse_locale, ''), 'commandes')));
  v_avant   plateforme.courriels_boutique;
begin
  perform private.console_exige_super_admin(p_acteur);
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id) then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  v_domaine := rtrim(split_part(v_domaine, '/', 1), '.');
  if v_domaine !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$' or char_length(v_domaine) > 200 then
    raise exception 'Domaine illisible : écrivez par exemple maymar.tn' using errcode = '22023';
  end if;
  if v_locale !~ '^[a-z0-9]([a-z0-9._-]{0,38}[a-z0-9])?$' then
    raise exception 'Adresse illisible : des lettres, des chiffres, un point ou un tiret (par exemple commandes)' using errcode = '22023';
  end if;
  if exists (select 1 from plateforme.courriels_boutique c where c.domaine = v_domaine and c.boutique_id <> p_boutique_id) then
    raise exception 'Le domaine % envoie déjà pour une autre boutique', v_domaine using errcode = '23505';
  end if;
  if p_fournisseur not in ('resend', 'brevo', 'apercu', 'relais') or p_statut not in ('en_attente', 'verifie', 'echec') then
    raise exception 'Fournisseur ou état inconnu' using errcode = '22023';
  end if;
  select * into v_avant from plateforme.courriels_boutique c where c.boutique_id = p_boutique_id;
  insert into plateforme.courriels_boutique as c (boutique_id, domaine, adresse_locale, fournisseur, ref_fournisseur, statut,
                                                  enregistrements, ajoute_le, verifie_le, derniere_verif, domaine_actif, modifie_par)
  values (p_boutique_id, v_domaine, v_locale, p_fournisseur, nullif(left(p_ref, 120), ''), p_statut,
          private.enregistrements_lisibles(p_enregistrements), now(),
          case when p_statut = 'verifie' then now() end, null, false, p_acteur)
  on conflict (boutique_id) do update
    set domaine = excluded.domaine, adresse_locale = excluded.adresse_locale, fournisseur = excluded.fournisseur,
        ref_fournisseur = excluded.ref_fournisseur, statut = excluded.statut, enregistrements = excluded.enregistrements,
        ajoute_le = now(), verifie_le = excluded.verifie_le, derniere_verif = null, domaine_actif = false,
        modifie_le = now(), modifie_par = p_acteur;
  perform private.console_trace(p_acteur, p_boutique_id, 'boutique.domaine_envoi', v_domaine,
    case when v_avant.domaine is null then null else jsonb_build_object('domaine', v_avant.domaine, 'actif', v_avant.domaine_actif) end,
    jsonb_build_object('domaine', v_domaine, 'adresse', v_locale || '@' || v_domaine, 'fournisseur', p_fournisseur, 'statut', p_statut));
  return jsonb_build_object('domaine', v_domaine, 'adresse', v_locale || '@' || v_domaine, 'statut', p_statut);
end;
$$;

-- Ce que le fournisseur répond à une vérification. Un domaine qui n'est plus
-- vérifié cesse aussitôt d'envoyer (la plateforme reprend).
create function public.console_noter_verification_domaine(p_acteur uuid, p_boutique_id uuid, p_statut text, p_enregistrements jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant plateforme.courriels_boutique;
  v_coupe boolean;
begin
  perform private.console_exige_admin(p_acteur);
  if p_statut not in ('en_attente', 'verifie', 'echec') then
    raise exception 'État inconnu' using errcode = '22023';
  end if;
  select * into v_avant from plateforme.courriels_boutique c where c.boutique_id = p_boutique_id for update;
  if v_avant.domaine is null then
    raise exception 'Aucun domaine d''envoi à vérifier' using errcode = 'no_data_found';
  end if;
  v_coupe := v_avant.domaine_actif and p_statut <> 'verifie';
  update plateforme.courriels_boutique c
     set statut = p_statut,
         enregistrements = case when p_enregistrements is null then c.enregistrements
                                else private.enregistrements_lisibles(p_enregistrements) end,
         derniere_verif = now(),
         verifie_le = case when p_statut = 'verifie' then coalesce(case when c.statut = 'verifie' then c.verifie_le end, now()) end,
         domaine_actif = c.domaine_actif and p_statut = 'verifie'
   where c.boutique_id = p_boutique_id;
  if v_avant.statut is distinct from p_statut then
    perform private.console_trace(p_acteur, p_boutique_id, 'boutique.domaine_envoi', v_avant.domaine,
      jsonb_build_object('statut', v_avant.statut, 'actif', v_avant.domaine_actif),
      jsonb_build_object('statut', p_statut, 'actif', v_avant.domaine_actif and p_statut = 'verifie'));
  end if;
  return jsonb_build_object('statut', p_statut, 'avant', v_avant.statut, 'coupe', v_coupe);
end;
$$;

create function public.console_activer_domaine_envoi(p_acteur uuid, p_boutique_id uuid, p_actif boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant plateforme.courriels_boutique;
begin
  perform private.console_exige_super_admin(p_acteur);
  select * into v_avant from plateforme.courriels_boutique c where c.boutique_id = p_boutique_id for update;
  if v_avant.domaine is null then
    raise exception 'Aucun domaine d''envoi pour cette boutique' using errcode = 'no_data_found';
  end if;
  if coalesce(p_actif, false) and v_avant.statut is distinct from 'verifie' then
    raise exception 'Le domaine % n''est pas encore vérifié : posez ses enregistrements DNS, puis « Vérifier »', v_avant.domaine
      using errcode = '22023';
  end if;
  if v_avant.domaine_actif = coalesce(p_actif, false) then
    return false;
  end if;
  update plateforme.courriels_boutique c set domaine_actif = coalesce(p_actif, false), modifie_le = now(), modifie_par = p_acteur
   where c.boutique_id = p_boutique_id;
  perform private.console_trace(p_acteur, p_boutique_id, 'boutique.domaine_envoi', v_avant.domaine,
    jsonb_build_object('actif', v_avant.domaine_actif), jsonb_build_object('actif', coalesce(p_actif, false),
      'adresse', v_avant.adresse_locale || '@' || v_avant.domaine));
  return true;
end;
$$;

create function public.console_retirer_domaine_envoi(p_acteur uuid, p_boutique_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant plateforme.courriels_boutique;
begin
  perform private.console_exige_super_admin(p_acteur);
  select * into v_avant from plateforme.courriels_boutique c where c.boutique_id = p_boutique_id for update;
  if v_avant.domaine is null then
    return null;
  end if;
  update plateforme.courriels_boutique c
     set domaine = null, fournisseur = null, ref_fournisseur = null, statut = null, enregistrements = '[]'::jsonb,
         ajoute_le = null, verifie_le = null, derniere_verif = null, domaine_actif = false, modifie_le = now(), modifie_par = p_acteur
   where c.boutique_id = p_boutique_id;
  perform private.console_trace(p_acteur, p_boutique_id, 'boutique.domaine_envoi', v_avant.domaine,
    jsonb_build_object('domaine', v_avant.domaine, 'actif', v_avant.domaine_actif), jsonb_build_object('domaine', null));
  return v_avant.domaine;
end;
$$;

-- ---------------------------------------------------------------------
-- Droits : la clé de service seule (la console, l'application)
-- ---------------------------------------------------------------------
revoke execute on function private.courriels_de(uuid) from public, anon, authenticated;
revoke execute on function private.adresse_lisible(text) from public, anon, authenticated;
revoke execute on function private.enregistrements_lisibles(jsonb) from public, anon, authenticated;
revoke execute on function public.courriels_expediteur(uuid) from public, anon, authenticated;
revoke execute on function public.console_courriels(uuid) from public, anon, authenticated;
revoke execute on function public.console_courriels_boutique(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.console_regler_courriels_boutique(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.console_regler_reponse_plateforme(uuid, text) from public, anon, authenticated;
revoke execute on function public.console_poser_domaine_envoi(uuid, uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.console_noter_verification_domaine(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.console_activer_domaine_envoi(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.console_retirer_domaine_envoi(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.courriels_expediteur(uuid) to service_role;
grant  execute on function public.console_courriels(uuid) to service_role;
grant  execute on function public.console_courriels_boutique(uuid, uuid) to service_role;
grant  execute on function public.console_regler_courriels_boutique(uuid, uuid, text, text) to service_role;
grant  execute on function public.console_regler_reponse_plateforme(uuid, text) to service_role;
grant  execute on function public.console_poser_domaine_envoi(uuid, uuid, text, text, text, text, text, jsonb) to service_role;
grant  execute on function public.console_noter_verification_domaine(uuid, uuid, text, jsonb) to service_role;
grant  execute on function public.console_activer_domaine_envoi(uuid, uuid, boolean) to service_role;
grant  execute on function public.console_retirer_domaine_envoi(uuid, uuid) to service_role;
