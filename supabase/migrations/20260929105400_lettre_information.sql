-- =====================================================================
-- SkanEcom — 55 · LA LETTRE D'INFORMATION
-- =====================================================================
--
-- Au pied de chaque page, une inscription à la lettre de la boutique.
-- Un réglage (vitrine.lettre), coupé par défaut : il faut un expéditeur
-- d'e-mails branché, et une équipe qui écrira.
--
-- Le consentement se prouve :
-- · la personne coche une phrase (jamais cochée d'avance) ; la base garde
--   cette phrase telle qu'elle était écrite, la page, l'heure ;
-- · l'inscription ne vaut qu'une fois confirmée par le lien reçu dans la
--   boîte (double opt-in) : taper l'adresse d'un autre n'inscrit personne.
--   Le jeton du lien ne passe jamais par le navigateur de qui s'inscrit :
--   lettre_inscrire n'est ouverte qu'au serveur (service_role), qui écrit
--   l'e-mail. La base n'en garde que l'empreinte ;
-- · le même lien désinscrit, d'un geste, sans compte. Une adresse
--   désinscrite est EFFACÉE : il reste la date, jamais l'adresse.
-- Une demande jamais confirmée s'efface au bout de sept jours.
--
-- Garde-fous : trois e-mails de confirmation par adresse et par jour ;
-- cent inscriptions par heure pour une boutique.
--
-- Au passage : les adresses que la vitrine sert et qu'une page de la
-- boutique ne peut pas prendre (pages_slug_libre) reçoivent celles venues
-- depuis (panier, favoris, stats, alerte-retour) et la lettre.
-- =====================================================================

insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('vitrine.lettre', 'booleen', null, 'false', 'vitrine', null, true,
     'Lettre d''information',
     'Oui = au pied de chaque page, l''inscription à la lettre de la boutique : la personne coche son accord, puis confirme par le lien reçu par e-mail ; l''écran Lettre liste les inscrits. Il faut un expéditeur d''e-mails branché. Non = rien au pied de page.', 36),
  ('vitrine.lettre_accroche', 'texte', null, '""', 'vitrine', null, true,
     'Accroche de la lettre',
     'La phrase sous « La lettre » : ce qu''elle apporte, et à quel rythme. Vide = « Les nouveautés et les arrivages, dans votre boîte. »', 37);

alter table public.pages_boutique drop constraint pages_slug_libre;
alter table public.pages_boutique add constraint pages_slug_libre check (slug not in (
  'catalogue', 'categorie', 'produit', 'recherche', 'commande', 'compte', 'devis', 'filtrer',
  'conditions-de-vente', 'mentions-legales', 'confidentialite', 'garantie-et-sav',
  'contact', 'suivi', 'pages', 'api', 'crochets',
  'panier', 'favoris', 'stats', 'alerte-retour', 'lettre'));


create table public.lettre_abonnes (
  id             uuid primary key default gen_random_uuid(),
  boutique_id    uuid not null references plateforme.boutiques (id) on delete cascade,
  email          text check (char_length(email) <= 200 and email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  statut         text not null default 'a_confirmer' check (statut in ('a_confirmer', 'inscrit', 'desinscrit')),
  -- L'empreinte SHA-256 du jeton du lien (confirmer, se désinscrire).
  jeton_hash     bytea,
  -- La phrase cochée, telle qu'elle était écrite, et la page où elle l'a été.
  consentement   text not null check (char_length(consentement) between 10 and 600),
  page           text check (char_length(page) <= 300),
  demande_le     timestamptz not null default now(),
  -- Les e-mails de confirmation envoyés depuis demande_le (trois par jour).
  envois         integer not null default 1,
  -- Le dernier « vous êtes déjà inscrit » (un par jour : personne ne fait
  -- pleuvoir des e-mails sur un inscrit en retapant son adresse).
  rappel_le      timestamptz,
  inscrit_le     timestamptz,
  desinscrit_le  timestamptz,
  desinscrit_par text check (desinscrit_par in ('abonne', 'equipe')),
  unique (boutique_id, id),
  -- Désinscrite, l'adresse s'efface, et le lien avec elle.
  constraint lettre_abonnes_efface check ((statut = 'desinscrit') = (email is null and jeton_hash is null)),
  constraint lettre_abonnes_inscrit check (statut <> 'inscrit' or inscrit_le is not null),
  constraint lettre_abonnes_desinscrit check ((statut = 'desinscrit') = (desinscrit_le is not null and desinscrit_par is not null))
);

comment on table public.lettre_abonnes is
  'Les inscrits à la lettre d''une boutique : la phrase acceptée, la confirmation par e-mail ; une adresse désinscrite est effacée.';

create unique index lettre_abonnes_email_unique on public.lettre_abonnes (boutique_id, email) where email is not null;
create unique index lettre_abonnes_jeton_unique on public.lettre_abonnes (jeton_hash) where jeton_hash is not null;
create index lettre_abonnes_statut_idx on public.lettre_abonnes (boutique_id, statut, inscrit_le);
create index lettre_abonnes_recents_idx on public.lettre_abonnes (boutique_id, demande_le);

create trigger lettre_abonnes_boutique_immuable before update of boutique_id on public.lettre_abonnes
  for each row execute function private.boutique_immuable();

-- Aucune policy : personne ne lit la table, pas même l'équipe ; les
-- adresses passent par les fonctions, qui vérifient le rôle.
alter table public.lettre_abonnes enable row level security;
revoke insert, update, delete, truncate on public.lettre_abonnes from anon, authenticated;


-- ---------------------------------------------------------------------
-- La vitrine : s'inscrire (le serveur seul), confirmer, se désinscrire
-- ---------------------------------------------------------------------
-- Rend le jeton à mettre dans l'e-mail de confirmation (etat
-- « a_confirmer »), ou rien si l'adresse est déjà inscrite (etat
-- « deja » : un e-mail le dira, sans lien, une fois par jour au plus
-- — courriel : false sinon ; la page, elle, répond pareil dans tous les
-- cas : on n'apprend pas qui est inscrit).
create function public.lettre_inscrire(p_boutique_id uuid, p_email text, p_consentement text, p_page text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_texte text := nullif(btrim(coalesce(p_consentement, '')), '');
  v_page  text := left(nullif(btrim(coalesce(p_page, '')), ''), 300);
  v_jeton text;
  v_a     record;
begin
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut = 'active') then
    raise exception 'Boutique introuvable' using errcode = 'check_violation', hint = 'boutique';
  end if;
  if not coalesce((private.reglage(p_boutique_id, 'vitrine.lettre'))::boolean, false) then
    raise exception 'Cette boutique n''a pas de lettre d''information' using errcode = 'check_violation', hint = 'reglage';
  end if;
  if v_email is null or char_length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Cette adresse e-mail est illisible : vérifiez-la' using errcode = 'check_violation', hint = 'email';
  end if;
  if v_texte is null or char_length(v_texte) not between 10 and 600 then
    raise exception 'Cochez la case pour accepter de recevoir la lettre' using errcode = 'check_violation', hint = 'consentement';
  end if;
  if v_page is not null and v_page !~ '^/' then
    v_page := null;
  end if;

  -- Les demandes jamais confirmées s'effacent au bout de sept jours.
  delete from public.lettre_abonnes a
   where a.boutique_id = p_boutique_id and a.statut = 'a_confirmer' and a.demande_le < now() - interval '7 days';

  if (select count(*) from public.lettre_abonnes a
       where a.boutique_id = p_boutique_id and a.demande_le > now() - interval '1 hour') >= 100 then
    raise exception 'Beaucoup d''inscriptions en ce moment : réessayez dans une heure' using errcode = 'check_violation', hint = 'essais';
  end if;

  select * into v_a from public.lettre_abonnes a
   where a.boutique_id = p_boutique_id and a.email = v_email
   for update;

  if found and v_a.statut = 'inscrit' then
    if v_a.rappel_le > now() - interval '1 day' then
      return jsonb_build_object('etat', 'deja', 'courriel', false);
    end if;
    update public.lettre_abonnes a set rappel_le = now() where a.id = v_a.id;
    return jsonb_build_object('etat', 'deja', 'courriel', true);
  end if;

  v_jeton := private.nouveau_jeton();
  if found then
    -- Une demande en attente : un nouveau lien (l'ancien ne sert plus),
    -- trois par jour au plus.
    if v_a.demande_le > now() - interval '1 day' and v_a.envois >= 3 then
      raise exception 'Trois e-mails de confirmation sont déjà partis aujourd''hui : regardez dans vos courriers indésirables, ou réessayez demain'
        using errcode = 'check_violation', hint = 'essais';
    end if;
    update public.lettre_abonnes a
       set jeton_hash = sha256(convert_to(v_jeton, 'UTF8')), consentement = v_texte, page = v_page,
           envois = case when a.demande_le > now() - interval '1 day' then a.envois + 1 else 1 end,
           demande_le = case when a.demande_le > now() - interval '1 day' then a.demande_le else now() end
     where a.id = v_a.id;
  else
    insert into public.lettre_abonnes (boutique_id, email, jeton_hash, consentement, page)
    values (p_boutique_id, v_email, sha256(convert_to(v_jeton, 'UTF8')), v_texte, v_page);
  end if;
  return jsonb_build_object('etat', 'a_confirmer', 'jeton', v_jeton);
end;
$$;

revoke execute on function public.lettre_inscrire(uuid, text, text, text) from public, anon, authenticated;
grant  execute on function public.lettre_inscrire(uuid, text, text, text) to service_role;

-- Le lien de l'e-mail, ouvert, puis le bouton « Confirmer » (un clic de la
-- personne, jamais la seule ouverture du lien : les messageries qui
-- visitent les liens d'avance ne confirment rien).
create function public.lettre_confirmer(p_boutique_id uuid, p_jeton text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a record;
begin
  if p_jeton is null or p_jeton !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('etat', 'inconnu');
  end if;
  select * into v_a from public.lettre_abonnes a
   where a.boutique_id = p_boutique_id and a.jeton_hash = sha256(convert_to(p_jeton, 'UTF8'))
   for update;
  if not found then
    return jsonb_build_object('etat', 'inconnu');
  end if;
  if v_a.statut = 'inscrit' then
    return jsonb_build_object('etat', 'deja');
  end if;
  if v_a.demande_le < now() - interval '7 days' then
    return jsonb_build_object('etat', 'expire');
  end if;
  update public.lettre_abonnes a set statut = 'inscrit', inscrit_le = now() where a.id = v_a.id;
  return jsonb_build_object('etat', 'inscrit');
end;
$$;

revoke execute on function public.lettre_confirmer(uuid, text) from public;
grant  execute on function public.lettre_confirmer(uuid, text) to anon, authenticated;

-- Se désinscrire : l'adresse est effacée sur-le-champ.
create function public.lettre_desinscrire(p_boutique_id uuid, p_jeton text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_jeton is null or p_jeton !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('etat', 'inconnu');
  end if;
  update public.lettre_abonnes a
     set statut = 'desinscrit', email = null, jeton_hash = null, desinscrit_le = now(), desinscrit_par = 'abonne'
   where a.boutique_id = p_boutique_id and a.jeton_hash = sha256(convert_to(p_jeton, 'UTF8'))
  returning a.id into v_id;
  return jsonb_build_object('etat', case when v_id is null then 'inconnu' else 'desinscrit' end);
end;
$$;

revoke execute on function public.lettre_desinscrire(uuid, text) from public;
grant  execute on function public.lettre_desinscrire(uuid, text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- Le backoffice : l'écran Lettre
-- ---------------------------------------------------------------------
-- La navigation : la boutique a-t-elle la lettre, ou des inscrits ?
create function public.gestion_lettre_etat(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object(
    'actif', coalesce((private.reglage(p_boutique_id, 'vitrine.lettre'))::boolean, false),
    'inscrits', (select count(*) from public.lettre_abonnes a where a.boutique_id = p_boutique_id and a.statut = 'inscrit'));
end;
$$;

-- Les inscrits (les plus récents d'abord, ou ceux qu'une recherche
-- trouve), leurs comptes, les douze dernières semaines. La direction.
create function public.gestion_lettre(p_boutique_id uuid, p_recherche text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := lower(nullif(btrim(coalesce(p_recherche, '')), ''));
  v_semaine date := date_trunc('week', (now() at time zone 'Africa/Tunis'))::date;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,lecture}');
  return jsonb_build_object(
    'actif', coalesce((private.reglage(p_boutique_id, 'vitrine.lettre'))::boolean, false),
    'compteurs', (select jsonb_build_object(
                    'inscrits', count(*) filter (where a.statut = 'inscrit'),
                    'a_confirmer', count(*) filter (where a.statut = 'a_confirmer' and a.demande_le > now() - interval '7 days'),
                    'nouveaux_30j', count(*) filter (where a.statut = 'inscrit' and a.inscrit_le > now() - interval '30 days'),
                    'desinscrits_30j', count(*) filter (where a.statut = 'desinscrit' and a.desinscrit_le > now() - interval '30 days'))
                  from public.lettre_abonnes a where a.boutique_id = p_boutique_id),
    -- Les inscriptions confirmées, semaine par semaine (lundi), et les départs.
    'semaines', (select jsonb_agg(jsonb_build_object(
                   'semaine', s.debut,
                   'inscrits', (select count(*) from public.lettre_abonnes a
                                 where a.boutique_id = p_boutique_id and a.inscrit_le is not null
                                   and (a.inscrit_le at time zone 'Africa/Tunis')::date between s.debut and s.debut + 6),
                   'desinscrits', (select count(*) from public.lettre_abonnes a
                                    where a.boutique_id = p_boutique_id and a.statut = 'desinscrit'
                                      and (a.desinscrit_le at time zone 'Africa/Tunis')::date between s.debut and s.debut + 6))
                   order by s.debut)
                 from (select (v_semaine - 7 * n) as debut from generate_series(0, 11) n) s),
    'trouves', (select count(*) from public.lettre_abonnes a
                 where a.boutique_id = p_boutique_id and a.statut = 'inscrit'
                   and (v_q is null or strpos(a.email, v_q) > 0)),
    'abonnes', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'email', x.email, 'inscrit_le', x.inscrit_le, 'page', x.page)
                       order by x.inscrit_le desc, x.email)
        from (select a.id, a.email, a.inscrit_le, a.page from public.lettre_abonnes a
               where a.boutique_id = p_boutique_id and a.statut = 'inscrit'
                 and (v_q is null or strpos(a.email, v_q) > 0)
               order by a.inscrit_le desc, a.email
               limit 200) x), '[]'::jsonb));
end;
$$;

-- Retirer un inscrit (à sa demande, par téléphone ou en boutique) : son
-- adresse est effacée comme s'il s'était désinscrit lui-même. Tracé.
create function public.gestion_lettre_retirer(p_boutique_id uuid, p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  select a.email into v_email from public.lettre_abonnes a
   where a.boutique_id = p_boutique_id and a.id = p_id and a.statut <> 'desinscrit'
   for update;
  if not found then
    raise exception 'Cette adresse n''est plus inscrite' using errcode = 'check_violation', hint = 'inconnu';
  end if;
  update public.lettre_abonnes a
     set statut = 'desinscrit', email = null, jeton_hash = null, desinscrit_le = now(), desinscrit_par = 'equipe'
   where a.boutique_id = p_boutique_id and a.id = p_id;
  -- La trace dit le geste, jamais l'adresse effacée.
  perform private.console_trace(auth.uid(), p_boutique_id, 'lettre.retirer', p_id::text, null, null);
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.gestion_lettre_etat(uuid), public.gestion_lettre(uuid, text),
                           public.gestion_lettre_retirer(uuid, uuid) from public, anon;
grant  execute on function public.gestion_lettre_etat(uuid), public.gestion_lettre(uuid, text),
                           public.gestion_lettre_retirer(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------
-- L'export (B8) : les inscrits et la preuve de leur accord
-- ---------------------------------------------------------------------
-- gestion_export garde ses jeux (devenue private.gestion_export_jeux) ;
-- celui-ci s'y ajoute, avec la même règle (propriétaire, administrateur)
-- et la même trace.
alter function public.gestion_export(uuid, text) rename to gestion_export_jeux;
alter function public.gestion_export_jeux(uuid, text) set schema private;
revoke execute on function private.gestion_export_jeux(uuid, text) from public, anon, authenticated;

create function public.gestion_export(p_boutique_id uuid, p_quoi text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lignes jsonb;
begin
  if p_quoi is distinct from 'lettre' then
    return private.gestion_export_jeux(p_boutique_id, p_quoi);
  end if;
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  select coalesce(jsonb_agg(jsonb_build_object(
           'email', a.email, 'inscrit_le', a.inscrit_le, 'demande_le', a.demande_le,
           'page', a.page, 'consentement', a.consentement)
         order by a.inscrit_le), '[]'::jsonb) into v_lignes
    from public.lettre_abonnes a
   where a.boutique_id = p_boutique_id and a.statut = 'inscrit';
  perform private.console_trace(auth.uid(), p_boutique_id, 'export.lettre', null, null,
                                jsonb_build_object('lignes', jsonb_array_length(v_lignes)));
  return v_lignes;
end;
$$;

revoke execute on function public.gestion_export(uuid, text) from public, anon;
grant  execute on function public.gestion_export(uuid, text) to authenticated;
