-- =====================================================================
-- SkanEcom — 30 · LE SERVICE APRÈS-VENTE (module « sav »)
-- 30/09/2026 — étude 05 (D17 : « demande de service après-vente », S ;
-- « sections revendeur officiel, garantie, SAV », M)
-- =====================================================================
--
-- Une perceuse qui ne démarre plus, une valise dont la roue a cédé : le
-- client ne sait pas à qui s'adresser, il écrit sur WhatsApp à qui répond,
-- la demande se perd. Ici, depuis « Mes commandes », le client connecté
-- (numéro confirmé par SMS) signale le problème d'un article d'une commande
-- LIVRÉE : ce qui ne va pas, le numéro de série s'il le connaît. La boutique
-- reçoit la demande au backoffice, numérotée (SAV-00012), avec la commande,
-- l'article, le client et la garantie ; elle la prend en charge, puis la
-- clôt : résolue (réparation, échange, remboursement, conseil) ou refusée
-- (hors garantie, mauvaise utilisation, défaut non constaté), chaque geste
-- gardé à l'historique.
--
-- Deux réglages : la garantie annoncée (sav.garantie_mois, du module) et
-- « revendeur officiel » (catalogue.revendeur_officiel, pour toutes).
--
-- Le client ne lit jamais les tables : sav_demander et mes_sav, par la
-- session ; l'équipe lit tout de sa boutique (RLS) et agit par les
-- fonctions gestion_*, qui revérifient le rôle et l'étape affichée.

insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('catalogue.revendeur_officiel', 'texte', null, '""', 'catalogue', null, true,
     'Revendeur officiel',
     'Ex. « Revendeur officiel DeWalt » : en tête de la vitrine et sur les fiches produit. Vide = rien n''est affiché.', 31),
  ('sav.garantie_mois', 'entier', null, '0', 'sav', 'sav', true,
     'Garantie annoncée (mois)',
     'La durée de garantie annoncée sur la vitrine, de 1 à 120 mois. 0 = la garantie légale et celle du fabricant, sans durée annoncée.', 70);

create function private.valide_reglages_sav()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cle = 'sav.garantie_mois' and ((new.valeur #>> '{}')::numeric < 0 or (new.valeur #>> '{}')::numeric > 120) then
    raise exception 'La garantie compte de 0 à 120 mois' using errcode = 'check_violation', hint = 'limite';
  end if;
  if new.cle = 'catalogue.revendeur_officiel' and char_length(new.valeur #>> '{}') > 80 then
    raise exception 'Texte trop long (80 caractères au plus)' using errcode = 'check_violation', hint = 'limite';
  end if;
  return new;
end;
$$;

revoke execute on function private.valide_reglages_sav() from public, anon, authenticated;

create trigger reglages_valide_sav
  before insert or update on public.reglages
  for each row when (new.cle in ('sav.garantie_mois', 'catalogue.revendeur_officiel'))
  execute function private.valide_reglages_sav();


-- ---------------------------------------------------------------------
-- Les demandes, et leur historique
-- ---------------------------------------------------------------------
create type public.statut_sav as enum ('nouvelle', 'en_cours', 'resolue', 'refusee');

create table public.sav_demandes (
  id               uuid primary key default gen_random_uuid(),
  boutique_id      uuid not null references plateforme.boutiques (id) on delete cascade,
  rang             integer not null check (rang > 0),
  numero           text not null,
  client_id        uuid not null,
  commande_id      uuid not null,
  ligne_id         uuid not null,
  -- L'article COPIÉ au moment de la demande, comme la commande le garde.
  produit_nom      text not null,
  variante_libelle text,
  sku              text,
  numero_serie     text check (numero_serie is null or char_length(numero_serie) between 1 and 60),
  description      text not null check (char_length(description) between 10 and 1000),
  statut           public.statut_sav not null default 'nouvelle',
  -- Comment elle s'est close : résolue (reparation, echange, remboursement,
  -- conseil, autre) ou refusée (hors_garantie, mauvaise_utilisation,
  -- non_constate, autre).
  issue            text,
  cloturee_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (boutique_id, id),
  unique (boutique_id, numero),
  unique (boutique_id, rang),
  foreign key (boutique_id, client_id)   references public.clients (boutique_id, id) on delete cascade,
  foreign key (boutique_id, commande_id) references public.commandes (boutique_id, id) on delete cascade,
  foreign key (boutique_id, ligne_id)    references public.commande_lignes (boutique_id, id) on delete cascade,
  constraint sav_issue_documentee check (
    (statut in ('nouvelle', 'en_cours') and issue is null and cloturee_at is null)
    or (statut = 'resolue' and issue in ('reparation', 'echange', 'remboursement', 'conseil', 'autre') and cloturee_at is not null)
    or (statut = 'refusee' and issue in ('hors_garantie', 'mauvaise_utilisation', 'non_constate', 'autre') and cloturee_at is not null))
);

comment on table public.sav_demandes is
  'Les demandes de service après-vente : un article d''une commande livrée, ce qui ne va pas, et comment la boutique l''a traité.';

-- Une seule demande ouverte par article commandé.
create unique index sav_une_ouverte_par_ligne on public.sav_demandes (boutique_id, ligne_id) where statut in ('nouvelle', 'en_cours');
create index sav_statut_idx on public.sav_demandes (boutique_id, statut, created_at);
create index sav_client_idx on public.sav_demandes (boutique_id, client_id, created_at desc);

create trigger sav_demandes_updated_at before update on public.sav_demandes
  for each row execute function private.set_updated_at();
create trigger sav_demandes_boutique_immuable before update of boutique_id on public.sav_demandes
  for each row execute function private.boutique_immuable();

create table public.sav_evenements (
  id           uuid primary key default gen_random_uuid(),
  boutique_id  uuid not null references plateforme.boutiques (id) on delete cascade,
  sav_id       uuid not null,
  statut_avant public.statut_sav,
  statut_apres public.statut_sav not null,
  issue        text,
  note         text check (note is null or char_length(note) between 1 and 1000),
  auteur_id    uuid,
  par_client   boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (boutique_id, id),
  foreign key (boutique_id, sav_id) references public.sav_demandes (boutique_id, id) on delete cascade
);

create index sav_evenements_idx on public.sav_evenements (boutique_id, sav_id, created_at);
create trigger sav_evenements_boutique_immuable before update of boutique_id on public.sav_evenements
  for each row execute function private.boutique_immuable();

alter table public.sav_demandes   enable row level security;
alter table public.sav_evenements enable row level security;
create policy "sav: l'équipe lit ceux de sa boutique"
  on public.sav_demandes for select using (boutique_id in (select private.mes_boutiques()));
create policy "sav_evenements: l'équipe lit ceux de sa boutique"
  on public.sav_evenements for select using (boutique_id in (select private.mes_boutiques()));
revoke insert, update, delete, truncate on public.sav_demandes, public.sav_evenements from anon, authenticated;

create function private.sav_actif(p_boutique_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from plateforme.modules_actifs ma
                  where ma.boutique_id = p_boutique_id and ma.module = 'sav' and ma.actif)
$$;
revoke execute on function private.sav_actif(uuid) from public, anon, authenticated;

-- Encore sous la garantie annoncée ? NULL quand la boutique n'en annonce pas.
create function private.sous_garantie(p_boutique_id uuid, p_livree_le timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when coalesce((private.reglage(p_boutique_id, 'sav.garantie_mois') #>> '{}')::integer, 0) > 0 and p_livree_le is not null
              then p_livree_le + make_interval(months => (private.reglage(p_boutique_id, 'sav.garantie_mois') #>> '{}')::integer) > now() end
$$;
revoke execute on function private.sous_garantie(uuid, timestamptz) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- Le client : demander, et suivre ses demandes
-- ---------------------------------------------------------------------
create function public.sav_demander(
  p_boutique_id     uuid,
  p_numero_commande text,
  p_ligne_id        uuid,
  p_numero_serie    text,
  p_description     text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_commande    public.commandes;
  v_ligne       public.commande_lignes;
  v_description text := btrim(coalesce(p_description, ''));
  v_serie       text := nullif(btrim(coalesce(p_numero_serie, '')), '');
  v_ouverte     text;
  v_rang        integer;
  v_id          uuid;
  v_numero      text;
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous avec votre numéro pour faire une demande' using errcode = 'insufficient_privilege', hint = 'compte';
  end if;
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut = 'active')
     or not private.sav_actif(p_boutique_id) then
    raise exception 'Cette boutique ne prend pas de demande de service après-vente en ligne' using errcode = 'check_violation', hint = 'module';
  end if;

  select c.* into v_commande from public.commandes c
   where c.boutique_id = p_boutique_id and c.numero = p_numero_commande
     and c.client_id in (select cl.id from public.clients cl where cl.boutique_id = p_boutique_id and cl.user_id = auth.uid());
  if not found then
    raise exception 'Commande introuvable' using errcode = 'check_violation', hint = 'commande';
  end if;
  if v_commande.statut <> 'livree' then
    raise exception 'Une demande de service après-vente porte sur une commande livrée' using errcode = 'check_violation', hint = 'statut';
  end if;
  select l.* into v_ligne from public.commande_lignes l
   where l.boutique_id = p_boutique_id and l.commande_id = v_commande.id and l.id = p_ligne_id;
  if not found then
    raise exception 'Cet article n''est pas dans la commande' using errcode = 'check_violation', hint = 'ligne';
  end if;
  if char_length(v_description) < 10 or char_length(v_description) > 1000 then
    raise exception 'Décrivez le problème en quelques mots (10 à 1 000 caractères)' using errcode = 'check_violation', hint = 'description';
  end if;
  if char_length(v_serie) > 60 then
    raise exception 'Numéro de série trop long (60 caractères au plus)' using errcode = 'check_violation', hint = 'serie';
  end if;

  -- Deux demandes simultanées de la même boutique prennent chacune leur rang.
  perform 1 from plateforme.boutiques b where b.id = p_boutique_id for no key update;
  select s.numero into v_ouverte from public.sav_demandes s
   where s.boutique_id = p_boutique_id and s.ligne_id = v_ligne.id and s.statut in ('nouvelle', 'en_cours');
  if v_ouverte is not null then
    raise exception 'Une demande est déjà en cours pour cet article : %', v_ouverte using errcode = 'check_violation', hint = 'deja';
  end if;
  if (select count(*) from public.sav_demandes s
       where s.boutique_id = p_boutique_id and s.client_id = v_commande.client_id and s.statut in ('nouvelle', 'en_cours')) >= 3 then
    raise exception 'Trois demandes sont déjà en cours : la boutique vous recontacte' using errcode = 'check_violation', hint = 'trop';
  end if;

  select coalesce(max(s.rang), 0) + 1 into v_rang from public.sav_demandes s where s.boutique_id = p_boutique_id;
  v_numero := 'SAV-' || lpad(v_rang::text, 5, '0');
  insert into public.sav_demandes (boutique_id, rang, numero, client_id, commande_id, ligne_id,
                                   produit_nom, variante_libelle, sku, numero_serie, description)
  values (p_boutique_id, v_rang, v_numero, v_commande.client_id, v_commande.id, v_ligne.id,
          v_ligne.produit_nom, v_ligne.variante_libelle, v_ligne.sku, v_serie, v_description)
  returning id into v_id;
  insert into public.sav_evenements (boutique_id, sav_id, statut_avant, statut_apres, auteur_id, par_client)
  values (p_boutique_id, v_id, null, 'nouvelle', auth.uid(), true);

  return jsonb_build_object('numero', v_numero, 'statut', 'nouvelle');
end;
$$;

comment on function public.sav_demander(uuid, text, uuid, text, text) is
  'Le client connecté signale le problème d''un article d''une de ses commandes livrées. Rend le numéro de la demande (SAV-00012).';

revoke execute on function public.sav_demander(uuid, text, uuid, text, text) from public, anon;
grant  execute on function public.sav_demander(uuid, text, uuid, text, text) to authenticated, service_role;

-- « Mes commandes » (migration 23, reprise) : chaque ligne dit aussi son
-- identifiant, pour la demande de SAV d'un article.
create or replace function public.mes_commandes(p_boutique_id uuid, p_limite integer default 20)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x.commande order by x.cree_le desc, x.numero desc), '[]'::jsonb)
  from (
    select c.created_at as cree_le, c.numero, jsonb_build_object(
      'numero',         c.numero,
      'statut',         c.statut,
      'cree_le',        c.created_at,
      'mode_livraison', c.mode_livraison,
      'ville',          case when c.mode_livraison = 'domicile' then c.livraison_ville end,
      'gouvernorat',    case when c.mode_livraison = 'domicile' then coalesce(g.nom_fr, c.livraison_gouvernorat) end,
      'magasin',        case when c.mode_livraison = 'retrait' then private.magasin(c.boutique_id) end,
      'total_millimes', c.total_millimes,
      'transporteur',   c.transporteur,
      'numero_suivi',   c.numero_suivi,
      'expediee_le',    c.expediee_at,
      'livree_le',      c.livree_at,
      'lignes', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', l.id, 'produit_nom', l.produit_nom, 'variante_libelle', l.variante_libelle, 'quantite', l.quantite,
                 'image', coalesce(v.image_chemin,
                   (select i.chemin from public.produit_images i
                     where i.boutique_id = v.boutique_id and i.produit_id = v.produit_id
                     order by (i.variante_id is not distinct from v.id) desc, i.position, i.created_at
                     limit 1)))
               order by l.created_at, l.produit_nom)
          from public.commande_lignes l
          left join public.variantes v on v.boutique_id = l.boutique_id and v.id = l.variante_id
         where l.boutique_id = c.boutique_id and l.commande_id = c.id), '[]'::jsonb)
    ) as commande
    from public.commandes c
    join plateforme.boutiques b on b.id = c.boutique_id and b.statut = 'active'
    left join public.gouvernorats g on g.code = c.livraison_gouvernorat
    where auth.uid() is not null
      and c.boutique_id = p_boutique_id
      and c.client_id in (select cl.id from public.clients cl
                           where cl.boutique_id = p_boutique_id and cl.user_id = auth.uid())
    order by c.created_at desc, c.numero desc
    limit least(greatest(coalesce(p_limite, 20), 1), 50)
  ) x;
$$;

-- Les demandes du client connecté : où en est chacune. Jamais les notes de
-- l'équipe.
create function public.mes_sav(p_boutique_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'numero', s.numero, 'statut', s.statut, 'issue', s.issue,
           'commande', c.numero, 'ligne_id', s.ligne_id,
           'produit_nom', s.produit_nom, 'variante_libelle', s.variante_libelle,
           'cree_le', s.created_at, 'cloturee_le', s.cloturee_at)
         order by s.created_at desc), '[]'::jsonb)
  from public.sav_demandes s
  join public.commandes c on c.boutique_id = s.boutique_id and c.id = s.commande_id
  where auth.uid() is not null
    and s.boutique_id = p_boutique_id
    and s.client_id in (select cl.id from public.clients cl where cl.boutique_id = p_boutique_id and cl.user_id = auth.uid());
$$;

revoke execute on function public.mes_sav(uuid) from public, anon;
grant  execute on function public.mes_sav(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- L'équipe : la liste, la fiche, les gestes
-- ---------------------------------------------------------------------
-- Le module est-il actif, et combien de demandes attendent (la navigation).
create function public.gestion_sav_etat(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object(
    'actif', private.sav_actif(p_boutique_id),
    'nouvelles', (select count(*) from public.sav_demandes s where s.boutique_id = p_boutique_id and s.statut = 'nouvelle'));
end;
$$;

-- Une étape (nouvelles : la plus ancienne d'abord ; en cours ; closes : la
-- plus récente d'abord), et les compteurs des trois.
create function public.gestion_liste_sav(p_boutique_id uuid, p_etape text, p_limite integer default 50, p_decalage integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_statuts public.statut_sav[] := case p_etape when 'nouvelles' then '{nouvelle}'::public.statut_sav[]
                                                when 'en_cours'  then '{en_cours}'::public.statut_sav[]
                                                when 'closes'    then '{resolue,refusee}'::public.statut_sav[] end;
begin
  perform private.catalogue_exige(p_boutique_id);
  if v_statuts is null then
    raise exception 'Étape inconnue : %', p_etape using errcode = 'check_violation', hint = 'etape';
  end if;
  return jsonb_build_object(
    'etape', p_etape,
    'compteurs', (select jsonb_build_object(
                    'nouvelles', count(*) filter (where s.statut = 'nouvelle'),
                    'en_cours',  count(*) filter (where s.statut = 'en_cours'),
                    'closes',    count(*) filter (where s.statut in ('resolue', 'refusee')))
                  from public.sav_demandes s where s.boutique_id = p_boutique_id),
    'total', (select count(*) from public.sav_demandes s where s.boutique_id = p_boutique_id and s.statut = any (v_statuts)),
    'demandes', coalesce((
      select jsonb_agg(x.d order by x.ordre) from (
        select jsonb_build_object(
                 'numero', s.numero, 'statut', s.statut, 'issue', s.issue, 'cree_le', s.created_at, 'cloturee_le', s.cloturee_at,
                 'produit_nom', s.produit_nom, 'variante_libelle', s.variante_libelle, 'numero_serie', s.numero_serie,
                 'description', left(s.description, 140),
                 'commande', c.numero, 'client_nom', coalesce(cl.nom, c.contact_nom), 'client_telephone', coalesce(cl.telephone, c.contact_telephone),
                 'sous_garantie', private.sous_garantie(s.boutique_id, c.livree_at)) as d,
               row_number() over (order by case when p_etape = 'closes' then -extract(epoch from s.cloturee_at) else extract(epoch from s.created_at) end, s.rang) as ordre
          from public.sav_demandes s
          join public.commandes c on c.boutique_id = s.boutique_id and c.id = s.commande_id
          left join public.clients cl on cl.boutique_id = s.boutique_id and cl.id = s.client_id
         where s.boutique_id = p_boutique_id and s.statut = any (v_statuts)
         order by ordre
         limit least(greatest(coalesce(p_limite, 50), 1), 200) offset greatest(coalesce(p_decalage, 0), 0)) x), '[]'::jsonb)
  );
end;
$$;

-- La fiche : la demande, l'article, la commande, le client, la garantie,
-- l'historique.
create function public.gestion_sav(p_boutique_id uuid, p_numero text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s public.sav_demandes;
  v_c public.commandes;
begin
  perform private.catalogue_exige(p_boutique_id);
  select * into v_s from public.sav_demandes s where s.boutique_id = p_boutique_id and s.numero = p_numero;
  if not found then
    return null;
  end if;
  select * into v_c from public.commandes c where c.boutique_id = p_boutique_id and c.id = v_s.commande_id;
  return jsonb_build_object(
    'numero', v_s.numero, 'statut', v_s.statut, 'issue', v_s.issue,
    'cree_le', v_s.created_at, 'cloturee_le', v_s.cloturee_at,
    'produit_nom', v_s.produit_nom, 'variante_libelle', v_s.variante_libelle, 'sku', v_s.sku,
    'numero_serie', v_s.numero_serie, 'description', v_s.description,
    'ligne', (select jsonb_build_object('quantite', l.quantite, 'prix_unitaire_millimes', l.prix_unitaire_millimes)
                from public.commande_lignes l where l.boutique_id = p_boutique_id and l.id = v_s.ligne_id),
    'commande', jsonb_build_object('numero', v_c.numero, 'cree_le', v_c.created_at, 'livree_le', v_c.livree_at,
                                   'mode_livraison', v_c.mode_livraison, 'total_millimes', v_c.total_millimes),
    'client', (select jsonb_build_object('id', cl.id, 'nom', coalesce(cl.nom, v_c.contact_nom), 'telephone', cl.telephone,
                                         'compte', cl.user_id is not null,
                                         'nb_commandes', cl.nb_commandes, 'nb_refus', cl.nb_refus, 'niveau_risque', cl.niveau_risque,
                                         'sav', (select count(*) from public.sav_demandes x where x.boutique_id = p_boutique_id and x.client_id = cl.id))
                 from public.clients cl where cl.boutique_id = p_boutique_id and cl.id = v_s.client_id),
    'garantie', jsonb_build_object('mois', coalesce((private.reglage(p_boutique_id, 'sav.garantie_mois') #>> '{}')::integer, 0),
                                   'sous_garantie', private.sous_garantie(p_boutique_id, v_c.livree_at)),
    'historique', coalesce((
      select jsonb_agg(jsonb_build_object('le', e.created_at, 'statut_avant', e.statut_avant, 'statut_apres', e.statut_apres,
                                          'issue', e.issue, 'note', e.note, 'par_client', e.par_client,
                                          'auteur', case when not e.par_client then (select u.email from auth.users u where u.id = e.auteur_id) end)
                       order by e.created_at, e.id)
        from public.sav_evenements e where e.boutique_id = p_boutique_id and e.sav_id = v_s.id), '[]'::jsonb)
  );
end;
$$;

-- Faire avancer une demande : la prendre en charge, la clore (résolue ou
-- refusée, avec comment), la rouvrir ; ou y ajouter une note (vers = statut
-- actuel). p_statut_affiche : l'étape que l'écran montrait — si la demande
-- a changé entre-temps, le geste est refusé, pas rejoué.
create function public.gestion_avancer_sav(
  p_boutique_id     uuid,
  p_numero          text,
  p_statut_affiche  public.statut_sav,
  p_vers            public.statut_sav,
  p_issue           text default null,
  p_note            text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_s    public.sav_demandes;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,confirmateur,preparateur}');
  select * into v_s from public.sav_demandes s where s.boutique_id = p_boutique_id and s.numero = p_numero for update;
  if not found then
    raise exception 'Demande introuvable' using errcode = 'check_violation', hint = 'demande';
  end if;
  if v_s.statut <> p_statut_affiche then
    raise exception 'La demande a changé entre-temps : relisez-la avant d''agir' using errcode = 'check_violation', hint = 'etape';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'Note trop longue (1 000 caractères au plus)' using errcode = 'check_violation', hint = 'note';
  end if;

  if p_vers = v_s.statut then
    -- Une note, sans changer d'étape.
    if v_note is null then
      raise exception 'Écrivez la note' using errcode = 'check_violation', hint = 'note';
    end if;
  elsif not ((v_s.statut = 'nouvelle' and p_vers in ('en_cours', 'resolue', 'refusee'))
          or (v_s.statut = 'en_cours' and p_vers in ('resolue', 'refusee'))
          or (v_s.statut in ('resolue', 'refusee') and p_vers = 'en_cours')) then
    raise exception 'Geste impossible depuis cette étape' using errcode = 'check_violation', hint = 'etape';
  end if;

  if p_vers = 'resolue' and p_vers <> v_s.statut and (p_issue is null or p_issue <> all (array['reparation', 'echange', 'remboursement', 'conseil', 'autre'])) then
    raise exception 'Dites comment la demande a été résolue' using errcode = 'check_violation', hint = 'issue';
  end if;
  if p_vers = 'refusee' and p_vers <> v_s.statut and (p_issue is null or p_issue <> all (array['hors_garantie', 'mauvaise_utilisation', 'non_constate', 'autre'])) then
    raise exception 'Dites pourquoi la demande est refusée' using errcode = 'check_violation', hint = 'issue';
  end if;
  if p_vers in ('resolue', 'refusee') and p_vers <> v_s.statut and p_issue = 'autre' and v_note is null then
    raise exception 'Précisez en une note' using errcode = 'check_violation', hint = 'note';
  end if;

  if p_vers <> v_s.statut then
    update public.sav_demandes s
       set statut = p_vers,
           issue = case when p_vers in ('resolue', 'refusee') then p_issue end,
           cloturee_at = case when p_vers in ('resolue', 'refusee') then now() end
     where s.boutique_id = p_boutique_id and s.id = v_s.id;
  end if;
  insert into public.sav_evenements (boutique_id, sav_id, statut_avant, statut_apres, issue, note, auteur_id)
  values (p_boutique_id, v_s.id, v_s.statut, p_vers, case when p_vers in ('resolue', 'refusee') and p_vers <> v_s.statut then p_issue end,
          v_note, auth.uid());

  return jsonb_build_object('numero', v_s.numero, 'statut', p_vers);
end;
$$;

revoke execute on function public.gestion_sav_etat(uuid)                                  from public, anon;
revoke execute on function public.gestion_liste_sav(uuid, text, integer, integer)         from public, anon;
revoke execute on function public.gestion_sav(uuid, text)                                 from public, anon;
revoke execute on function public.gestion_avancer_sav(uuid, text, public.statut_sav, public.statut_sav, text, text) from public, anon;
grant  execute on function public.gestion_sav_etat(uuid)                                  to authenticated, service_role;
grant  execute on function public.gestion_liste_sav(uuid, text, integer, integer)         to authenticated, service_role;
grant  execute on function public.gestion_sav(uuid, text)                                 to authenticated, service_role;
grant  execute on function public.gestion_avancer_sav(uuid, text, public.statut_sav, public.statut_sav, text, text) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- L'export des données (B8, migration 22 reprise) : les demandes de SAV
-- partent aussi dans un tableur.
-- ---------------------------------------------------------------------
create or replace function public.gestion_export(p_boutique_id uuid, p_quoi text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lignes jsonb;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');

  case p_quoi
    when 'commandes' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'numero', c.numero, 'date', c.created_at, 'statut', c.statut, 'origine', c.origine,
               'nom', c.contact_nom, 'telephone', c.contact_telephone, 'email', c.contact_email,
               'adresse', c.livraison_ligne1, 'complement', c.livraison_ligne2, 'ville', c.livraison_ville,
               'gouvernorat', coalesce(g.nom_fr, c.livraison_gouvernorat), 'code_postal', c.livraison_code_postal,
               'zone', c.livraison_zone_nom, 'mode_livraison', c.mode_livraison,
               'sous_total', c.sous_total_millimes, 'frais_livraison', c.frais_livraison_millimes,
               'remise', c.remise_millimes, 'total', c.total_millimes,
               'paiement', c.mode_paiement, 'statut_paiement', c.statut_paiement,
               'transporteur', c.transporteur, 'suivi', c.numero_suivi,
               'refus_origine', c.refus_origine, 'refus_commentaire', c.refus_commentaire,
               'motif_annulation', c.motif_annulation, 'note_client', c.note_client,
               'confirmee_le', c.confirmee_at, 'expediee_le', c.expediee_at, 'livree_le', c.livree_at,
               'conditions_acceptees_le', c.conditions_acceptees ->> 'le')
             order by c.created_at), '[]'::jsonb) into v_lignes
        from public.commandes c
        left join public.gouvernorats g on g.code = c.livraison_gouvernorat
       where c.boutique_id = p_boutique_id;

    when 'articles' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'numero', c.numero, 'date', c.created_at, 'statut', c.statut,
               'produit', l.produit_nom, 'declinaison', l.variante_libelle, 'reference', l.sku,
               'quantite', l.quantite, 'prix_unitaire', l.prix_unitaire_millimes, 'total', l.total_ligne_millimes)
             order by c.created_at, l.created_at), '[]'::jsonb) into v_lignes
        from public.commande_lignes l
        join public.commandes c on c.boutique_id = l.boutique_id and c.id = l.commande_id
       where l.boutique_id = p_boutique_id;

    when 'clients' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'nom', cl.nom, 'telephone', cl.telephone, 'email', cl.email, 'compte', cl.user_id is not null,
               'commandes', cl.nb_commandes, 'refus', cl.nb_refus, 'confiance', cl.niveau_risque,
               'depuis', cl.created_at, 'note', cl.note_interne)
             order by cl.created_at), '[]'::jsonb) into v_lignes
        from public.clients cl
       where cl.boutique_id = p_boutique_id;

    when 'catalogue' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'produit', p.nom_fr, 'adresse', p.slug, 'en_vitrine', p.publie, 'marque', p.marque,
               'rayon', c.nom_fr, 'reference', v.sku, 'declinaison', private.libelle_variante(p_boutique_id, p.id, v.options),
               'prix', v.prix_millimes, 'prix_barre', v.prix_barre_millimes, 'stock', v.stock,
               'alerte_sous', v.seuil_alerte_stock, 'en_vente', v.actif, 'poids_grammes', v.poids_grammes)
             order by p.nom_fr, v.position, v.sku), '[]'::jsonb) into v_lignes
        from public.variantes v
        join public.produits p on p.boutique_id = v.boutique_id and p.id = v.produit_id
        left join public.categories c on c.boutique_id = p.boutique_id and c.id = p.categorie_id
       where v.boutique_id = p_boutique_id;

    when 'stock' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', m.created_at, 'reference', v.sku, 'produit', p.nom_fr, 'motif', m.motif,
               'mouvement', m.delta, 'stock_apres', m.stock_apres, 'commande', c.numero,
               'auteur', u.email, 'commentaire', m.commentaire)
             order by m.created_at), '[]'::jsonb) into v_lignes
        from public.stock_mouvements m
        join public.variantes v on v.boutique_id = m.boutique_id and v.id = m.variante_id
        join public.produits p on p.boutique_id = v.boutique_id and p.id = v.produit_id
        left join public.commandes c on c.boutique_id = m.boutique_id and c.id = m.commande_id
        left join auth.users u on u.id = m.auteur_id
       where m.boutique_id = p_boutique_id;

    when 'sav' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'numero', s.numero, 'date', s.created_at, 'statut', s.statut, 'issue', s.issue,
               'commande', c.numero, 'nom', coalesce(cl.nom, c.contact_nom), 'telephone', coalesce(cl.telephone, c.contact_telephone),
               'produit', s.produit_nom, 'declinaison', s.variante_libelle, 'reference', s.sku,
               'numero_serie', s.numero_serie, 'description', s.description, 'cloturee_le', s.cloturee_at)
             order by s.rang), '[]'::jsonb) into v_lignes
        from public.sav_demandes s
        join public.commandes c on c.boutique_id = s.boutique_id and c.id = s.commande_id
        left join public.clients cl on cl.boutique_id = s.boutique_id and cl.id = s.client_id
       where s.boutique_id = p_boutique_id;

    else
      raise exception 'Export inconnu : %', p_quoi using errcode = 'check_violation', hint = 'quoi';
  end case;

  perform private.console_trace(auth.uid(), p_boutique_id, 'export.' || p_quoi, null, null,
                                jsonb_build_object('lignes', jsonb_array_length(v_lignes)));
  return v_lignes;
end;
$$;
