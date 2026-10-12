-- =====================================================================
-- SkanEcom — LE SITE VITRINE PREMIUM (2/2) : les demandes de contact
-- =====================================================================
--
-- Un site vitrine vit de ceux qui écrivent : « Parlons de votre projet ».
-- Jusqu'ici la page Contact ne proposait que WhatsApp, l'appel et l'e-mail
-- — un visiteur qui n'ose pas appeler, ou qui écrit le soir, repart. Ici,
-- un formulaire (réglage vitrine.formulaire_contact, coupé par défaut) :
-- nom, téléphone ou e-mail, l'objet (les choix de la boutique,
-- vitrine.contact_sujets), le message, et la réalisation ou le produit
-- d'où il écrit. La boutique reçoit la demande au backoffice (Demandes),
-- numérotée (DEM-00012) ; le propriétaire et les administrateurs en
-- reçoivent un e-mail. L'équipe la prend en charge, puis la dit traitée.
--
-- Personne d'autre ne lit les demandes : contact_envoyer n'est ouverte
-- qu'au serveur (service_role), qui écrit l'e-mail ; l'équipe lit celles
-- de sa boutique (RLS) et agit par les fonctions gestion_*. Garde-fous :
-- cinq demandes par heure d'un même visiteur (l'empreinte que le serveur
-- calcule, jamais l'adresse IP ; effacée après deux jours), soixante par
-- heure pour une boutique. Une demande traitée s'efface au bout d'un an.
-- =====================================================================

insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('vitrine.formulaire_contact', 'booleen', null, 'false', 'vitrine', null, true,
     'Formulaire de contact',
     'Oui = la page Contact et la section « Contact » de l''accueil proposent un formulaire ; chaque demande arrive au backoffice (Demandes) et part par e-mail au propriétaire et aux administrateurs. Non = WhatsApp, l''appel et l''e-mail seulement.', 38),
  ('vitrine.contact_sujets', 'texte', null, '""', 'vitrine', null, true,
     'Objets proposés au formulaire',
     'Un choix par ligne (« Appartement », « Villa », « Café ou restaurant »…), six au plus : le visiteur dit l''objet de sa demande. Vide = pas de choix, le message seul.', 39);

create function private.valide_reglages_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lignes text[];
begin
  if new.cle = 'vitrine.contact_sujets' then
    v_lignes := array(select btrim(l) from regexp_split_to_table(coalesce(new.valeur #>> '{}', ''), '\n') l where btrim(l) <> '');
    if cardinality(v_lignes) > 6 or exists (select 1 from unnest(v_lignes) l where char_length(l) > 60) then
      raise exception 'Six objets au plus, de 60 caractères chacun' using errcode = 'check_violation', hint = 'limite';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.valide_reglages_contact() from public, anon, authenticated;

create trigger reglages_valide_contact
  before insert or update on public.reglages
  for each row when (new.cle = 'vitrine.contact_sujets')
  execute function private.valide_reglages_contact();


-- ---------------------------------------------------------------------
-- Les demandes
-- ---------------------------------------------------------------------
create table public.demandes_contact (
  id           uuid primary key default gen_random_uuid(),
  boutique_id  uuid not null references plateforme.boutiques (id) on delete cascade,
  rang         integer not null check (rang > 0),
  numero       text not null,
  nom          text not null check (char_length(nom) between 2 and 80),
  -- Au moins un moyen de répondre : le téléphone (+216…, ou un numéro
  -- international), l'e-mail, ou les deux.
  telephone    text check (telephone is null or telephone ~ '^\+[1-9][0-9]{7,14}$'),
  email        text check (email is null or (char_length(email) <= 200 and email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  sujet        text check (sujet is null or char_length(sujet) between 1 and 60),
  message      text not null check (char_length(message) between 10 and 2000),
  -- La réalisation (ou le produit) d'où la personne écrit, COPIÉE : la
  -- demande reste lisible si la fiche change ou disparaît.
  produit_slug text check (produit_slug is null or char_length(produit_slug) <= 120),
  produit_nom  text check (produit_nom is null or char_length(produit_nom) <= 200),
  page         text check (page is null or (char_length(page) <= 300 and page ~ '^/')),
  statut       text not null default 'nouvelle' check (statut in ('nouvelle', 'en_cours', 'traitee')),
  note         text check (note is null or char_length(note) between 1 and 1000),
  -- Le garde-fou contre les envois en rafale : l'empreinte du visiteur
  -- (calculée par le serveur, jamais l'adresse IP), effacée après deux jours.
  empreinte    bytea,
  traitee_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (boutique_id, id),
  unique (boutique_id, numero),
  unique (boutique_id, rang),
  constraint demandes_un_moyen check (telephone is not null or email is not null),
  constraint demandes_traitee check ((statut = 'traitee') = (traitee_at is not null))
);

comment on table public.demandes_contact is
  'Les demandes envoyées par le formulaire de contact de la vitrine : qui, comment répondre, quoi, d''où ; et où en est l''équipe.';

create index demandes_statut_idx on public.demandes_contact (boutique_id, statut, created_at);
create index demandes_empreinte_idx on public.demandes_contact (boutique_id, empreinte, created_at) where empreinte is not null;

create trigger demandes_contact_updated_at before update on public.demandes_contact
  for each row execute function private.set_updated_at();
create trigger demandes_contact_boutique_immuable before update of boutique_id on public.demandes_contact
  for each row execute function private.boutique_immuable();

alter table public.demandes_contact enable row level security;
create policy "demandes_contact: l'équipe lit celles de sa boutique"
  on public.demandes_contact for select using (boutique_id in (select private.mes_boutiques()));
revoke insert, update, delete, truncate on public.demandes_contact from anon, authenticated;

-- Un numéro joignable : tunisien (« 20 123 456 » → +21620123456), ou
-- international (« +33 6 12 34 56 78 », « 0033… ») pour la diaspora.
create function private.telephone_contact(p_brut text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(private.telephone_tunisien(p_brut),
                  case when x.c ~ '^\+[1-9][0-9]{7,14}$' then x.c end)
  from (select regexp_replace(regexp_replace(coalesce(p_brut, ''), '[^0-9+]', '', 'g'), '^00', '+') as c) x;
$$;

revoke execute on function private.telephone_contact(text) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- La vitrine : envoyer une demande (le serveur seul)
-- ---------------------------------------------------------------------
-- Rend le numéro de la demande, et les adresses de l'équipe à prévenir
-- (propriétaire et administrateurs actifs) : le serveur écrit l'e-mail.
create function public.contact_envoyer(
  p_boutique_id uuid,
  p_nom         text,
  p_telephone   text,
  p_email       text,
  p_sujet       text,
  p_message     text,
  p_produit     text,
  p_page        text,
  p_empreinte   text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nom       text := nullif(regexp_replace(btrim(coalesce(p_nom, '')), '\s+', ' ', 'g'), '');
  v_tel_brut  text := nullif(btrim(coalesce(p_telephone, '')), '');
  v_tel       text;
  v_email     text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_sujet     text := nullif(btrim(coalesce(p_sujet, '')), '');
  v_message   text := nullif(btrim(coalesce(p_message, '')), '');
  v_page      text := left(nullif(btrim(coalesce(p_page, '')), ''), 300);
  v_empreinte bytea := case when nullif(btrim(coalesce(p_empreinte, '')), '') is not null
                            then sha256(convert_to(p_boutique_id::text || p_empreinte, 'UTF8')) end;
  v_sujets    text[];
  v_produit_slug text;
  v_produit_nom  text;
  v_rang      integer;
  v_numero    text;
begin
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut = 'active') then
    raise exception 'Boutique introuvable' using errcode = 'check_violation', hint = 'boutique';
  end if;
  if not coalesce((private.reglage(p_boutique_id, 'vitrine.formulaire_contact'))::boolean, false) then
    raise exception 'Cette boutique ne prend pas de demande par formulaire : écrivez-lui ou appelez-la'
      using errcode = 'check_violation', hint = 'reglage';
  end if;
  if v_nom is null or char_length(v_nom) < 2 then
    raise exception 'Votre nom, s''il vous plaît' using errcode = 'check_violation', hint = 'nom';
  end if;
  if char_length(v_nom) > 80 then
    raise exception 'Votre nom : 80 caractères au plus' using errcode = 'check_violation', hint = 'nom';
  end if;
  if v_tel_brut is not null then
    v_tel := private.telephone_contact(v_tel_brut);
    if v_tel is null then
      raise exception 'Ce numéro est illisible : huit chiffres en Tunisie, ou +33…, +49… depuis l''étranger'
        using errcode = 'check_violation', hint = 'telephone';
    end if;
  end if;
  if v_email is not null and (char_length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Cette adresse e-mail est illisible : vérifiez-la' using errcode = 'check_violation', hint = 'email';
  end if;
  if v_tel is null and v_email is null then
    raise exception 'Laissez un numéro ou une adresse e-mail : c''est par là qu''on vous répondra'
      using errcode = 'check_violation', hint = 'telephone';
  end if;
  if v_message is null or char_length(v_message) < 10 then
    raise exception 'Dites-nous en un peu plus (dix caractères au moins)' using errcode = 'check_violation', hint = 'message';
  end if;
  if char_length(v_message) > 2000 then
    raise exception 'Message trop long (2 000 caractères au plus)' using errcode = 'check_violation', hint = 'message';
  end if;
  -- L'objet : l'un des choix de la boutique, rien d'autre.
  if v_sujet is not null then
    v_sujets := array(select btrim(l) from regexp_split_to_table(coalesce(private.reglage(p_boutique_id, 'vitrine.contact_sujets') #>> '{}', ''), '\n') l
                       where btrim(l) <> '');
    if not v_sujet = any (v_sujets) then
      raise exception 'Choisissez l''objet de votre demande dans la liste' using errcode = 'check_violation', hint = 'sujet';
    end if;
  end if;
  if v_page is not null and v_page !~ '^/' then
    v_page := null;
  end if;

  -- Ce que le temps efface : les empreintes de plus de deux jours, les
  -- demandes traitées depuis plus d'un an.
  update public.demandes_contact d set empreinte = null
   where d.boutique_id = p_boutique_id and d.empreinte is not null and d.created_at < now() - interval '2 days';
  delete from public.demandes_contact d
   where d.boutique_id = p_boutique_id and d.statut = 'traitee' and d.traitee_at < now() - interval '1 year';

  if v_empreinte is not null and (select count(*) from public.demandes_contact d
       where d.boutique_id = p_boutique_id and d.empreinte = v_empreinte and d.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Plusieurs demandes sont déjà parties d''ici : la boutique vous répond, ou réessayez dans une heure'
      using errcode = 'check_violation', hint = 'essais';
  end if;
  if (select count(*) from public.demandes_contact d
       where d.boutique_id = p_boutique_id and d.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Beaucoup de demandes en ce moment : réessayez dans une heure, ou écrivez-lui sur WhatsApp'
      using errcode = 'check_violation', hint = 'essais';
  end if;

  -- La fiche d'où elle écrit, si elle existe et se montre.
  if p_produit is not null and p_produit ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(p_produit) <= 120 then
    select p.slug, p.nom_fr into v_produit_slug, v_produit_nom from public.produits p
     where p.boutique_id = p_boutique_id and p.slug = p_produit and p.publie;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('demandes_contact:' || p_boutique_id::text, 0));
  select coalesce(max(d.rang), 0) + 1 into v_rang from public.demandes_contact d where d.boutique_id = p_boutique_id;
  v_numero := 'DEM-' || lpad(v_rang::text, 5, '0');
  insert into public.demandes_contact (boutique_id, rang, numero, nom, telephone, email, sujet, message,
                                       produit_slug, produit_nom, page, empreinte)
  values (p_boutique_id, v_rang, v_numero, v_nom, v_tel, v_email, v_sujet, v_message,
          v_produit_slug, v_produit_nom, v_page, v_empreinte);

  return jsonb_build_object(
    'numero', v_numero,
    'produit', v_produit_nom,
    'equipe', coalesce((
      select jsonb_agg(distinct u.email)
        from plateforme.membres m join auth.users u on u.id = m.user_id
       where m.boutique_id = p_boutique_id and m.actif and m.role in ('proprietaire', 'admin') and u.email is not null), '[]'::jsonb));
end;
$$;

revoke execute on function public.contact_envoyer(uuid, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant  execute on function public.contact_envoyer(uuid, text, text, text, text, text, text, text, text) to service_role;


-- ---------------------------------------------------------------------
-- L'équipe : l'état (la navigation), la liste, les gestes
-- ---------------------------------------------------------------------
create function public.gestion_demandes_etat(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object(
    'actif', coalesce((private.reglage(p_boutique_id, 'vitrine.formulaire_contact'))::boolean, false),
    'site_vitrine', coalesce((private.reglage(p_boutique_id, 'vitrine.site_vitrine'))::boolean, false),
    'nouvelles', (select count(*) from public.demandes_contact d where d.boutique_id = p_boutique_id and d.statut = 'nouvelle'),
    'total', (select count(*) from public.demandes_contact d where d.boutique_id = p_boutique_id));
end;
$$;

-- Une étape (nouvelles et en cours : la plus ancienne d'abord, on rappelle
-- dans l'ordre ; traitées : la plus récente d'abord), et les compteurs.
create function public.gestion_liste_demandes(p_boutique_id uuid, p_etape text, p_limite integer default 50, p_decalage integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_statut text := case p_etape when 'nouvelles' then 'nouvelle' when 'en_cours' then 'en_cours' when 'traitees' then 'traitee' end;
begin
  perform private.catalogue_exige(p_boutique_id);
  if v_statut is null then
    raise exception 'Étape inconnue : %', p_etape using errcode = 'check_violation', hint = 'etape';
  end if;
  return jsonb_build_object(
    'etape', p_etape,
    'compteurs', (select jsonb_build_object(
                    'nouvelles', count(*) filter (where d.statut = 'nouvelle'),
                    'en_cours',  count(*) filter (where d.statut = 'en_cours'),
                    'traitees',  count(*) filter (where d.statut = 'traitee'))
                  from public.demandes_contact d where d.boutique_id = p_boutique_id),
    'total', (select count(*) from public.demandes_contact d where d.boutique_id = p_boutique_id and d.statut = v_statut),
    'demandes', coalesce((
      select jsonb_agg(x.d order by x.ordre) from (
        select jsonb_build_object(
                 'numero', d.numero, 'statut', d.statut, 'nom', d.nom, 'telephone', d.telephone, 'email', d.email,
                 'sujet', d.sujet, 'message', d.message, 'produit_slug', d.produit_slug, 'produit_nom', d.produit_nom,
                 'page', d.page, 'note', d.note, 'cree_le', d.created_at, 'traitee_le', d.traitee_at,
                 -- La même personne a-t-elle déjà écrit ? (par son numéro ou son adresse)
                 'precedentes', (select count(*) from public.demandes_contact y
                                  where y.boutique_id = d.boutique_id and y.rang < d.rang
                                    and ((d.telephone is not null and y.telephone = d.telephone) or (d.email is not null and y.email = d.email)))) as d,
               row_number() over (order by case when v_statut = 'traitee' then -extract(epoch from d.traitee_at) else extract(epoch from d.created_at) end, d.rang) as ordre
          from public.demandes_contact d
         where d.boutique_id = p_boutique_id and d.statut = v_statut
         order by ordre
         limit least(greatest(coalesce(p_limite, 50), 1), 200) offset greatest(coalesce(p_decalage, 0), 0)) x), '[]'::jsonb)
  );
end;
$$;

-- Faire avancer une demande : la prendre en charge, la dire traitée, la
-- rouvrir ; ou noter ce qui a été dit (vers = statut actuel). Comme au SAV,
-- p_statut_affiche est l'étape que l'écran montrait : si la demande a
-- changé entre-temps, le geste est refusé, pas rejoué.
create function public.gestion_avancer_demande(
  p_boutique_id    uuid,
  p_numero         text,
  p_statut_affiche text,
  p_vers           text,
  p_note           text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_d    public.demandes_contact;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,confirmateur,preparateur}');
  select * into v_d from public.demandes_contact d where d.boutique_id = p_boutique_id and d.numero = p_numero for update;
  if not found then
    raise exception 'Demande introuvable' using errcode = 'check_violation', hint = 'demande';
  end if;
  if v_d.statut <> p_statut_affiche then
    raise exception 'La demande a changé entre-temps : relisez-la avant d''agir' using errcode = 'check_violation', hint = 'etape';
  end if;
  if p_vers not in ('nouvelle', 'en_cours', 'traitee') then
    raise exception 'Étape inconnue : %', p_vers using errcode = 'check_violation', hint = 'etape';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'Note trop longue (1 000 caractères au plus)' using errcode = 'check_violation', hint = 'note';
  end if;
  -- Une demande ne revient pas « nouvelle » : rouverte, elle est en cours.
  if p_vers = 'nouvelle' and v_d.statut <> 'nouvelle' then
    raise exception 'Une demande rouverte reprend « en cours »' using errcode = 'check_violation', hint = 'etape';
  end if;

  update public.demandes_contact d
     set statut = p_vers,
         traitee_at = case when p_vers = 'traitee' then coalesce(d.traitee_at, now()) end,
         note = case when p_note is null then d.note else v_note end
   where d.id = v_d.id;
  return jsonb_build_object('numero', v_d.numero, 'statut', p_vers);
end;
$$;

-- Effacer une demande (un envoi indésirable, ou à la demande de la
-- personne) : la direction seule.
create function public.gestion_retirer_demande(p_boutique_id uuid, p_numero text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  delete from public.demandes_contact d where d.boutique_id = p_boutique_id and d.numero = p_numero;
  if not found then
    raise exception 'Demande introuvable' using errcode = 'check_violation', hint = 'demande';
  end if;
end;
$$;

revoke execute on function public.gestion_demandes_etat(uuid) from public, anon;
revoke execute on function public.gestion_liste_demandes(uuid, text, integer, integer) from public, anon;
revoke execute on function public.gestion_avancer_demande(uuid, text, text, text, text) from public, anon;
revoke execute on function public.gestion_retirer_demande(uuid, text) from public, anon;
grant  execute on function public.gestion_demandes_etat(uuid) to authenticated;
grant  execute on function public.gestion_liste_demandes(uuid, text, integer, integer) to authenticated;
grant  execute on function public.gestion_avancer_demande(uuid, text, text, text, text) to authenticated;
grant  execute on function public.gestion_retirer_demande(uuid, text) to authenticated;
