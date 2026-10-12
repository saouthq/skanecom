-- =====================================================================
-- SkanEcom — LES CONDITIONS DE SERVICE, ACCEPTÉES PAR LE COMMERÇANT
-- =====================================================================
--
-- Avant le premier vrai client, ce qui lie SkanEcom à chaque commerçant
-- doit être écrit, daté et accepté : ce que fait la plateforme, ce que fait
-- la boutique, ce que deviennent ses données — et, parce que SkanEcom
-- garde pour lui les données des acheteurs, l'accord de traitement des
-- données personnelles (loi organique n° 2004-63 du 27 juillet 2004 : le
-- commerçant est responsable du traitement, SkanEcom le fait pour son
-- compte).
--
-- 1. Les versions (plateforme.conditions_service) : un brouillon à la fois,
--    écrit dans la console (super-administrateur) ; une fois publiée, une
--    version ne change plus — la suivante la remplace. La publication est
--    refusée tant qu'il reste un champ à compléter, écrit entre crochets
--    (« [Raison sociale de SkanEcom] ») : un modèle ne part jamais tel quel.
--    La version 1 est posée ici en BROUILLON : rien n'est demandé aux
--    commerçants avant que Skander l'ait complétée, fait relire, publiée.
-- 2. L'acceptation (plateforme.conditions_acceptations) : par le
--    propriétaire de la boutique, et lui seul (jamais un accès support),
--    une fois par version, avec son nom, l'entreprise au nom de qui il
--    accepte, la date et l'adresse IP. Au journal.
-- 3. Le backoffice le demande au propriétaire (un bandeau sur chaque page,
--    jamais un blocage : une boutique ne s'arrête pas de vendre) ; la
--    console le suit — une étape de la mise en place, et la page
--    Conditions de service.
-- =====================================================================

create table plateforme.conditions_service (
  version     integer primary key check (version > 0),
  titre       text not null check (char_length(btrim(titre)) between 3 and 120),
  texte       text not null check (char_length(texte) between 200 and 60000),
  -- Ce qui change par rapport à la version d'avant, dit au commerçant.
  changements text check (changements is null or char_length(changements) between 1 and 600),
  publie_le   timestamptz,
  publie_par  uuid references auth.users (id) on delete set null,
  modifie_le  timestamptz not null default now(),
  modifie_par uuid references auth.users (id) on delete set null
);
-- Un seul brouillon à la fois.
create unique index conditions_service_brouillon_idx on plateforme.conditions_service ((true)) where publie_le is null;
alter table plateforme.conditions_service enable row level security;

create table plateforme.conditions_acceptations (
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  version     integer not null references plateforme.conditions_service (version),
  user_id     uuid references auth.users (id) on delete set null,
  -- Qui, et au nom de qui : gardés tels qu'au moment de l'accord, même si
  -- le compte ou la raison sociale changent ensuite.
  qui         text not null check (char_length(qui) between 1 and 200),
  au_nom_de   text not null check (char_length(au_nom_de) between 1 and 200),
  accepte_le  timestamptz not null default now(),
  ip          inet,
  primary key (boutique_id, version)
);
alter table plateforme.conditions_acceptations enable row level security;
-- Aucune politique sur l'une ou l'autre : seules les fonctions ci-dessous y touchent.

comment on table plateforme.conditions_service is
  'Les conditions de service de SkanEcom, par version : un brouillon à la fois (publie_le vide), les versions publiées ne changent plus.';
comment on table plateforme.conditions_acceptations is
  'L''accord de chaque boutique à chaque version des conditions de service : le propriétaire, au nom de son entreprise, daté, son adresse IP.';

-- Une version publiée ne se réécrit pas (la suivante la remplace).
create function private.conditions_figees()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.publie_le is not null then
    raise exception 'Une version publiée des conditions ne change plus : écrivez la suivante' using errcode = 'check_violation', hint = 'publiee';
  end if;
  return new;
end;
$$;
create trigger conditions_figees before update or delete on plateforme.conditions_service
  for each row execute function private.conditions_figees();
revoke execute on function private.conditions_figees() from public, anon, authenticated;

-- La version en vigueur : la dernière publiée (aucune : rien n'est demandé).
create function private.conditions_en_vigueur()
returns integer
language sql
stable
security definer
set search_path = ''
as $$ select max(c.version) from plateforme.conditions_service c where c.publie_le is not null $$;
revoke execute on function private.conditions_en_vigueur() from public, anon, authenticated;

-- Au nom de qui le propriétaire accepte : la raison sociale, sinon le nom de la boutique.
create function private.conditions_au_nom_de(p_boutique_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(private.reglage(p_boutique_id, 'legal.raison_sociale') #>> '{}'), ''), b.nom)
    from plateforme.boutiques b where b.id = p_boutique_id
$$;
revoke execute on function private.conditions_au_nom_de(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 1. Le backoffice : lire, accepter
-- ---------------------------------------------------------------------
-- L'état, pour le bandeau (chaque page) : y a-t-il une version à accepter ?
create function public.gestion_conditions_etat(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_version integer := private.conditions_en_vigueur();
begin
  if not private.est_membre(p_boutique_id) then
    raise exception 'Accès refusé' using errcode = 'insufficient_privilege';
  end if;
  if v_version is null then
    return jsonb_build_object('version', null, 'a_accepter', false);
  end if;
  return jsonb_build_object(
    'version', v_version,
    'a_accepter', not exists (select 1 from plateforme.conditions_acceptations a where a.boutique_id = p_boutique_id and a.version = v_version),
    -- Le propriétaire lui-même (un accès support ne compte pas).
    'peut_accepter', exists (select 1 from plateforme.membres m where m.boutique_id = p_boutique_id and m.user_id = auth.uid()
                                                                  and m.actif and m.role = 'proprietaire'),
    'proprietaire', (select u.email from plateforme.membres m join auth.users u on u.id = m.user_id
                      where m.boutique_id = p_boutique_id and m.actif and m.role = 'proprietaire' order by m.created_at limit 1));
end;
$$;

-- La page : le texte en vigueur, ce qui a changé, et les accords de la boutique.
create function public.gestion_conditions(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c plateforme.conditions_service;
begin
  if not private.est_membre(p_boutique_id) then
    raise exception 'Accès refusé' using errcode = 'insufficient_privilege';
  end if;
  select * into c from plateforme.conditions_service x where x.version = private.conditions_en_vigueur();
  return public.gestion_conditions_etat(p_boutique_id) || jsonb_build_object(
    'conditions', case when c.version is null then null else jsonb_build_object(
      'version', c.version, 'titre', c.titre, 'texte', c.texte, 'changements', c.changements, 'publie_le', c.publie_le) end,
    'au_nom_de', private.conditions_au_nom_de(p_boutique_id),
    'accords', coalesce((select jsonb_agg(jsonb_build_object('version', a.version, 'qui', a.qui, 'au_nom_de', a.au_nom_de, 'le', a.accepte_le)
                                          order by a.version desc)
                           from plateforme.conditions_acceptations a where a.boutique_id = p_boutique_id), '[]'::jsonb));
end;
$$;

create function public.gestion_accepter_conditions(p_boutique_id uuid, p_version integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_version integer := private.conditions_en_vigueur();
  v_qui text;
  v_ip inet;
begin
  if not exists (select 1 from plateforme.membres m where m.boutique_id = p_boutique_id and m.user_id = auth.uid()
                                                     and m.actif and m.role = 'proprietaire') then
    raise exception 'Seul le propriétaire de la boutique accepte les conditions, au nom de son entreprise'
      using errcode = 'insufficient_privilege', hint = 'proprietaire';
  end if;
  if v_version is null or p_version is distinct from v_version then
    raise exception 'Ces conditions ne sont plus celles en vigueur : rechargez la page pour lire la dernière version'
      using errcode = 'check_violation', hint = 'version';
  end if;
  select coalesce(u.email, 'propriétaire') into v_qui from auth.users u where u.id = auth.uid();
  begin
    v_ip := nullif(current_setting('request.headers', true)::jsonb ->> 'x-console-ip', '')::inet;
  exception when others then
    v_ip := null;
  end;
  insert into plateforme.conditions_acceptations (boutique_id, version, user_id, qui, au_nom_de, ip)
  values (p_boutique_id, v_version, auth.uid(), v_qui, private.conditions_au_nom_de(p_boutique_id), v_ip)
  on conflict (boutique_id, version) do nothing;
  if found then
    perform private.console_trace(auth.uid(), p_boutique_id, 'boutique.conditions_acceptees', 'version ' || v_version,
      null, jsonb_build_object('version', v_version, 'au_nom_de', private.conditions_au_nom_de(p_boutique_id)));
  end if;
  return public.gestion_conditions_etat(p_boutique_id);
end;
$$;


-- ---------------------------------------------------------------------
-- 2. La console : suivre, écrire, publier
-- ---------------------------------------------------------------------
create function public.console_conditions(p_acteur uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_version integer := private.conditions_en_vigueur();
begin
  perform private.console_exige_admin(p_acteur);
  return jsonb_build_object(
    'en_vigueur', v_version,
    'texte_en_vigueur', (select c.texte from plateforme.conditions_service c where c.version = v_version),
    'versions', coalesce((select jsonb_agg(jsonb_build_object(
        'version', c.version, 'titre', c.titre, 'changements', c.changements, 'publie_le', c.publie_le,
        'publie_par', (select u.email from auth.users u where u.id = c.publie_par),
        'acceptations', (select count(*) from plateforme.conditions_acceptations a where a.version = c.version))
        order by c.version desc)
      from plateforme.conditions_service c where c.publie_le is not null), '[]'::jsonb),
    'brouillon', (select jsonb_build_object('version', c.version, 'titre', c.titre, 'texte', c.texte, 'changements', c.changements,
                                            'modifie_le', c.modifie_le, 'modifie_par', (select u.email from auth.users u where u.id = c.modifie_par),
                                            -- Les champs à compléter, écrits entre crochets.
                                            'a_completer', coalesce((select jsonb_agg(distinct m[1]) from regexp_matches(c.texte, '\[([^\]\n]{1,80})\]', 'g') m), '[]'::jsonb))
                    from plateforme.conditions_service c where c.publie_le is null),
    -- Les boutiques qui comptent (pas les démonstrations, ni les fermées) : leur accord.
    'boutiques', coalesce((select jsonb_agg(jsonb_build_object(
        'slug', b.slug, 'nom', b.nom, 'statut', b.statut,
        'accord', (select jsonb_build_object('version', a.version, 'qui', a.qui, 'au_nom_de', a.au_nom_de, 'le', a.accepte_le)
                     from plateforme.conditions_acceptations a where a.boutique_id = b.id order by a.version desc limit 1))
        order by (v_version is not null and not exists (select 1 from plateforme.conditions_acceptations a
                                                          where a.boutique_id = b.id and a.version = v_version)) desc, b.nom)
      from plateforme.boutiques b where not b.demonstration and b.statut <> 'fermee'), '[]'::jsonb));
end;
$$;

-- Pour « À surveiller » (chaque page de la console) : léger, sans les textes.
create function public.console_conditions_etat(p_acteur uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_version integer := private.conditions_en_vigueur();
begin
  perform private.console_exige_admin(p_acteur);
  return jsonb_build_object(
    'en_vigueur', v_version,
    'brouillon', exists (select 1 from plateforme.conditions_service c where c.publie_le is null),
    -- Les boutiques clientes ouvertes qui n'ont pas accepté la version en vigueur.
    'manquantes', coalesce((select jsonb_agg(b.id) from plateforme.boutiques b
                             where v_version is not null and not b.demonstration and b.statut = 'active'
                               and not exists (select 1 from plateforme.conditions_acceptations a
                                                where a.boutique_id = b.id and a.version = v_version)), '[]'::jsonb));
end;
$$;

create function public.console_enregistrer_conditions(p_acteur uuid, p_titre text, p_texte text, p_changements text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  perform private.console_exige_super_admin(p_acteur);
  select c.version into v_version from plateforme.conditions_service c where c.publie_le is null;
  if v_version is null then
    select coalesce(max(c.version), 0) + 1 into v_version from plateforme.conditions_service c;
    insert into plateforme.conditions_service (version, titre, texte, changements, modifie_par)
    values (v_version, btrim(p_titre), replace(p_texte, E'\r\n', E'\n'), nullif(btrim(coalesce(p_changements, '')), ''), p_acteur);
  else
    update plateforme.conditions_service
       set titre = btrim(p_titre), texte = replace(p_texte, E'\r\n', E'\n'),
           changements = nullif(btrim(coalesce(p_changements, '')), ''), modifie_le = now(), modifie_par = p_acteur
     where version = v_version;
  end if;
  perform private.console_trace(p_acteur, null, 'plateforme.conditions_brouillon', 'version ' || v_version, null,
    jsonb_build_object('version', v_version, 'titre', btrim(p_titre)));
  return v_version;
end;
$$;

create function public.console_publier_conditions(p_acteur uuid, p_version integer)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c plateforme.conditions_service;
  v_champs text;
begin
  perform private.console_exige_super_admin(p_acteur);
  select * into c from plateforme.conditions_service x where x.publie_le is null;
  if c.version is null or c.version is distinct from p_version then
    raise exception 'Aucun brouillon à publier (ou il a changé entre-temps : rechargez la page)' using errcode = 'check_violation', hint = 'version';
  end if;
  select string_agg(distinct '[' || m[1] || ']', ', ') into v_champs from regexp_matches(c.texte, '\[([^\]\n]{1,80})\]', 'g') m;
  if v_champs is not null then
    raise exception 'Il reste à compléter : %', v_champs using errcode = 'check_violation', hint = 'a_completer';
  end if;
  if c.version > 1 and c.changements is null then
    raise exception 'Dites ce qui change par rapport à la version d''avant : le commerçant le lit avant d''accepter'
      using errcode = 'check_violation', hint = 'changements';
  end if;
  -- (le déclencheur laisse passer : la version n'était pas encore publiée)
  update plateforme.conditions_service set publie_le = now(), publie_par = p_acteur where version = c.version;
  perform private.console_trace(p_acteur, null, 'plateforme.conditions_publiees', 'version ' || c.version, null,
    jsonb_build_object('version', c.version, 'titre', c.titre));
  return c.version;
end;
$$;

revoke execute on function public.gestion_conditions_etat(uuid) from public, anon;
revoke execute on function public.gestion_conditions(uuid) from public, anon;
revoke execute on function public.gestion_accepter_conditions(uuid, integer) from public, anon;
grant  execute on function public.gestion_conditions_etat(uuid) to authenticated;
grant  execute on function public.gestion_conditions(uuid) to authenticated;
grant  execute on function public.gestion_accepter_conditions(uuid, integer) to authenticated;
revoke execute on function public.console_conditions(uuid) from public, anon, authenticated;
revoke execute on function public.console_conditions_etat(uuid) from public, anon, authenticated;
grant  execute on function public.console_conditions_etat(uuid) to service_role;
revoke execute on function public.console_enregistrer_conditions(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.console_publier_conditions(uuid, integer) from public, anon, authenticated;
grant  execute on function public.console_conditions(uuid) to service_role;
grant  execute on function public.console_enregistrer_conditions(uuid, text, text, text) to service_role;
grant  execute on function public.console_publier_conditions(uuid, integer) to service_role;


-- ---------------------------------------------------------------------
-- 3. La mise en place : une onzième étape, après les informations légales
-- ---------------------------------------------------------------------
create or replace function public.console_mise_en_place(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b             plateforme.boutiques;
  t             public.themes;
  v_manuelles   jsonb;
  v_produits    integer;
  v_publies     integer;
  v_sans_photo  integer;
  v_premier     timestamptz;
  v_domaine     plateforme.domaines;
  v_transp      text;
  v_whatsapp    text;
  v_branche_le  timestamptz;
  v_legal_manque text[];
  v_legal_le    timestamptz;
  v_membres     integer;
  v_proprio_le  timestamptz;
  v_commandes   integer;
  v_livrees     integer;
  v_refusees    integer;
  v_ouverte_le  timestamptz;
  v_conditions  integer := private.conditions_en_vigueur();
  v_accord      plateforme.conditions_acceptations;
begin
  select * into b from plateforme.boutiques pb where pb.id = p_boutique_id;
  if not found then
    return null;
  end if;
  select * into t from public.themes th where th.boutique_id = p_boutique_id;

  select coalesce(jsonb_object_agg(m.etape, jsonb_build_object('le', m.faite_le, 'par', u.email)), '{}'::jsonb)
    into v_manuelles
    from plateforme.mise_en_place m
    left join auth.users u on u.id = m.faite_par
   where m.boutique_id = p_boutique_id;

  select count(*), count(*) filter (where p.publie),
         count(*) filter (where p.publie and not exists (
           select 1 from public.produit_images i where i.boutique_id = p.boutique_id and i.produit_id = p.id)),
         min(p.created_at) filter (where p.publie)
    into v_produits, v_publies, v_sans_photo, v_premier
    from public.produits p where p.boutique_id = p_boutique_id;

  select * into v_domaine from plateforme.domaines d
   where d.boutique_id = p_boutique_id and d.type = 'personnalise'
   order by d.principal desc, d.created_at
   limit 1;

  v_transp   := nullif(btrim(private.reglage(p_boutique_id, 'livraison.transporteur') #>> '{}'), '');
  v_whatsapp := nullif(btrim(private.reglage(p_boutique_id, 'contact.whatsapp') #>> '{}'), '');
  select max(r.updated_at) into v_branche_le from public.reglages r
   where r.boutique_id = p_boutique_id and r.cle in ('livraison.transporteur', 'contact.whatsapp');

  select coalesce(array_agg(c order by c) filter (where nullif(btrim(private.reglage(p_boutique_id, c) #>> '{}'), '') is null), '{}')
    into v_legal_manque
    from unnest(array['legal.raison_sociale', 'legal.adresse', 'legal.identifiant_rne', 'legal.matricule_fiscal', 'legal.email']) c;
  select max(r.updated_at) into v_legal_le from public.reglages r
   where r.boutique_id = p_boutique_id and r.cle like 'legal.%';

  select count(*) filter (where m.actif), min(m.created_at) filter (where m.actif and m.role = 'proprietaire')
    into v_membres, v_proprio_le
    from plateforme.membres m where m.boutique_id = p_boutique_id;

  select count(*), count(*) filter (where c.statut = 'livree'), count(*) filter (where c.statut = 'refusee')
    into v_commandes, v_livrees, v_refusees
    from public.commandes c where c.boutique_id = p_boutique_id;

  select max(j.at) into v_ouverte_le from plateforme.journal_audit j
   where j.boutique_id = p_boutique_id and j.action = 'boutique.statut' and j.cible = 'active';

  select * into v_accord from plateforme.conditions_acceptations a
   where a.boutique_id = p_boutique_id order by a.version desc limit 1;

  return jsonb_build_object(
    'creee_le', b.created_at,
    'etapes', jsonb_build_array(
      jsonb_build_object('cle', 'recueil', 'manuelle', true, 'fait', v_manuelles ? 'recueil',
        'le', v_manuelles -> 'recueil' -> 'le', 'par', v_manuelles -> 'recueil' -> 'par'),
      jsonb_build_object('cle', 'marque', 'manuelle', false,
        'fait', coalesce(t.version > 1 or t.logo_chemin is not null, false),
        'le', case when t.version > 1 or t.logo_chemin is not null then t.updated_at end,
        'detail', jsonb_build_object('gabarit', t.code, 'logo', t.logo_chemin is not null)),
      jsonb_build_object('cle', 'catalogue', 'manuelle', false, 'fait', v_publies > 0, 'le', v_premier,
        'detail', jsonb_build_object('produits', v_produits, 'publies', v_publies, 'sans_photo', v_sans_photo)),
      jsonb_build_object('cle', 'domaine', 'manuelle', false, 'fait', v_domaine.hote is not null, 'le', v_domaine.created_at,
        'detail', jsonb_build_object('hote', v_domaine.hote, 'certificat', v_domaine.statut_certificat)),
      jsonb_build_object('cle', 'branchements', 'manuelle', false, 'fait', v_transp is not null and v_whatsapp is not null,
        'le', case when v_transp is not null and v_whatsapp is not null then v_branche_le end,
        'detail', jsonb_build_object('transporteur', v_transp, 'whatsapp', v_whatsapp is not null,
          'konnect', exists (select 1 from plateforme.modules_actifs ma
                              where ma.boutique_id = p_boutique_id and ma.module = 'paiement_en_ligne' and ma.actif))),
      jsonb_build_object('cle', 'legal', 'manuelle', false, 'fait', cardinality(v_legal_manque) = 0,
        'le', case when cardinality(v_legal_manque) = 0 then v_legal_le end,
        'detail', jsonb_build_object('manquants', to_jsonb(v_legal_manque))),
      -- Les conditions de service : la version en vigueur, acceptée par le propriétaire.
      jsonb_build_object('cle', 'conditions', 'manuelle', false,
        'fait', v_conditions is not null and v_accord.version = v_conditions,
        'le', case when v_conditions is not null and v_accord.version = v_conditions then v_accord.accepte_le end,
        'par', case when v_conditions is not null and v_accord.version = v_conditions then v_accord.qui end,
        'detail', jsonb_build_object('en_vigueur', v_conditions, 'acceptee', v_accord.version)),
      jsonb_build_object('cle', 'equipe', 'manuelle', false, 'fait', v_proprio_le is not null, 'le', v_proprio_le,
        'detail', jsonb_build_object('membres', v_membres)),
      jsonb_build_object('cle', 'commande_test', 'manuelle', true, 'fait', v_manuelles ? 'commande_test',
        'le', v_manuelles -> 'commande_test' -> 'le', 'par', v_manuelles -> 'commande_test' -> 'par',
        'detail', jsonb_build_object('commandes', v_commandes, 'livrees', v_livrees, 'refusees', v_refusees)),
      jsonb_build_object('cle', 'formation', 'manuelle', true, 'fait', v_manuelles ? 'formation',
        'le', v_manuelles -> 'formation' -> 'le', 'par', v_manuelles -> 'formation' -> 'par'),
      jsonb_build_object('cle', 'mise_en_ligne', 'manuelle', false, 'fait', b.statut = 'active',
        'le', case when b.statut = 'active' then v_ouverte_le end)
    ));
end;
$$;


-- ---------------------------------------------------------------------
-- 4. La version 1, en brouillon : un modèle à compléter et à faire relire
-- ---------------------------------------------------------------------
insert into plateforme.conditions_service (version, titre, texte) values (1, 'Conditions de service de SkanEcom', $texte$
Ces conditions lient SkanEcom, édité par [Raison sociale de SkanEcom], [forme juridique], matricule fiscal [matricule fiscal de SkanEcom], dont le siège est [adresse du siège de SkanEcom] (« SkanEcom »), et l'entreprise qui exploite la boutique (« le commerçant »). Elles s'appliquent dès leur acceptation par le propriétaire de la boutique, au nom du commerçant.

## 1. Ce que fournit SkanEcom
- Une boutique en ligne : la vitrine, son adresse (le domaine du commerçant ou celui fourni), le backoffice, et la console qui les met en place.
- L'hébergement, les sauvegardes, les mises à jour, la sécurité et la surveillance de la plateforme.
- Les e-mails et, s'ils sont prévus par la formule, les SMS envoyés au nom de la boutique.
- Une aide en jours ouvrables, par [moyens de contact du support].
SkanEcom fait de son mieux pour que la boutique reste disponible, sans garantie de disponibilité chiffrée sauf accord écrit.

## 2. La formule et son prix
L'abonnement suit la formule de la boutique, telle que le backoffice la montre (Réglages → Abonnement), au prix convenu. Les factures sont émises par SkanEcom et payables [délai de paiement]. Un retard de paiement, après une relance restée sans réponse, permet de suspendre la boutique : la vitrine se ferme, les données sont gardées, et tout reprend au règlement.

## 3. Ce que fait le commerçant
- Il répond de son catalogue, de ses prix, de ses stocks, de ses ventes, de ses livraisons et de ses retours.
- Il publie ses conditions de vente, ses mentions légales et sa politique de confidentialité ; SkanEcom fournit des modèles, que le commerçant vérifie et assume.
- Il respecte les règles du commerce électronique (loi n° 2000-83 du 9 août 2000) et de la protection du consommateur.
- Il garde secrets les accès de son équipe, active la double authentification quand elle lui est proposée, et retire l'accès d'une personne qui quitte l'entreprise.
- Il ne publie que des contenus licites, dont il détient les droits (photos, textes, marques).

## 4. Les données de la boutique
Le commerçant reste propriétaire de ses données : catalogue, clients, commandes, statistiques. Il peut les exporter à tout moment, en entier (Réglages → Export). À la fin du contrat, SkanEcom lui remet un dernier export, puis efface les données dans les [nombre de jours avant l'effacement] jours, sauf ce que la loi oblige à garder.

## 5. Le traitement des données personnelles pour le compte du commerçant
Pour les données des acheteurs de la boutique, le commerçant est responsable du traitement au sens de la loi organique n° 2004-63 du 27 juillet 2004 ; SkanEcom les traite pour son compte, et seulement pour faire fonctionner la boutique. SkanEcom s'engage à :
- ne les utiliser pour rien d'autre, et ne jamais les vendre ni les céder ;
- n'y donner accès qu'aux personnes qui en ont besoin, tenues au secret ;
- les protéger : connexions chiffrées, double authentification de l'équipe SkanEcom, journal des accès, accès de support ouvert seulement à la demande ou pour un incident, pour une durée limitée et inscrit au journal de la boutique ;
- n'en confier une partie qu'aux prestataires nécessaires, dont la liste est tenue à jour : l'hébergement de la base de données (Supabase, dans l'Union européenne), l'application et les fichiers (Cloudflare), l'envoi des e-mails ([fournisseur d'e-mails]) et des SMS ([fournisseur de SMS]) ;
- aider le commerçant à répondre aux demandes des personnes (accès, rectification, opposition, effacement) ;
- prévenir le commerçant de toute violation de ces données, sans retard et au plus tard [délai de notification] après l'avoir constatée ;
- à la fin du contrat, rendre puis effacer ces données, comme dit au point 4.
Les formalités auprès de l'Instance nationale de protection des données personnelles (INPDP) sont à la charge du commerçant, responsable du traitement ; SkanEcom lui fournit ce dont il a besoin pour les accomplir.

## 6. Suspension et fin du contrat
Chacun peut mettre fin au contrat, par écrit, avec un préavis de [durée du préavis]. SkanEcom peut suspendre la boutique sans attendre en cas d'impayé après relance, de contenu manifestement illicite, ou de risque pour la sécurité des données ; il en dit la raison au commerçant.

## 7. Responsabilité
SkanEcom répond des manquements qui lui sont imputables, dans la limite des sommes payées par le commerçant au cours des [nombre de mois retenus] derniers mois. Il ne répond pas des pertes indirectes, ni de ce qui dépend du commerçant, de ses prestataires (livreur, paiement en ligne) ou d'une cause qu'il ne maîtrise pas.

## 8. Les versions de ces conditions
Une nouvelle version est annoncée dans le backoffice, avec ce qui change ; elle s'applique une fois acceptée par le propriétaire. Les versions acceptées restent consultables.

## 9. Droit applicable
Ces conditions sont soumises au droit tunisien. À défaut d'accord amiable, les tribunaux de [ville du tribunal compétent] sont seuls compétents.

Pour toute question : [courriel de contact de SkanEcom].
$texte$);
