-- =====================================================================
-- SkanEcom — 53 · LES VISITES DE LA VITRINE (mesure d'audience sans cookie)
-- =====================================================================
--
-- « Combien de gens passent, d'où ils viennent, et combien commandent » :
-- la question que se pose tout commerçant, à laquelle les commandes seules
-- ne répondent pas. Ici, sans cookie ni donnée personnelle :
--
--   · un visiteur est reconnu, LE TEMPS D'UNE JOURNÉE, par une empreinte :
--     sha256(sel du jour, boutique, clé du navigateur). La clé est elle-même
--     une empreinte que l'application calcule (adresse IP et navigateur) :
--     l'adresse IP n'arrive jamais en base. Le sel est tiré au hasard
--     chaque jour et effacé le surlendemain : passé ce délai, plus personne
--     — ni la boutique, ni la plateforme — ne peut relier une empreinte à
--     quiconque, ni suivre un visiteur d'un jour à l'autre ;
--   · d'une page, on garde son chemin (sans ses paramètres, les
--     identifiants remplacés par « : id »), et le nombre de fois qu'elle a
--     été vue ce jour-là ;
--   · d'une visite : sa page d'entrée, le site d'où l'on vient (son nom de
--     domaine seulement, sans « www. »), le genre d'appareil (téléphone, tablette,
--     ordinateur), le nombre de pages vues.
--
-- Réglage de la boutique (vitrine.statistiques), coupé par défaut. Les
-- robots (moteurs, aperçus de liens) sont écartés par l'application, comme
-- les navigateurs qui demandent à ne pas être suivis. Treize mois gardés.
-- =====================================================================

insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('vitrine.statistiques', 'booleen', null, 'false', 'vitrine', null, true,
     'Mesure d''audience',
     'Oui = la vitrine compte ses visites, sans cookie ni donnée personnelle : visiteurs, pages vues, d''où ils viennent, sur quel appareil, et combien commandent (écran Visites). Non = rien n''est compté.', 34);

-- Le sel du jour : tiré au hasard, effacé le surlendemain.
create table private.sels_visites (
  jour date primary key,
  sel  bytea not null
);
revoke all on private.sels_visites from public, anon, authenticated;

create table public.vitrine_visites (
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  jour        date not null,
  -- sha256(sel du jour ‖ boutique ‖ clé) : sans le sel, effacé, illisible.
  empreinte   bytea not null,
  entree      text not null check (char_length(entree) between 1 and 200),
  source      text check (source is null or char_length(source) between 1 and 120),
  appareil    text not null check (appareil in ('telephone', 'tablette', 'ordinateur')),
  pages       integer not null default 1 check (pages >= 1),
  primary key (boutique_id, jour, empreinte)
);

create table public.vitrine_pages (
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  jour        date not null,
  chemin      text not null check (char_length(chemin) between 1 and 200),
  vues        integer not null default 1 check (vues >= 1),
  primary key (boutique_id, jour, chemin)
);

comment on table public.vitrine_visites is
  'Les visites de la vitrine, une par visiteur et par jour, reconnues par une empreinte salée du jour (le sel est effacé le surlendemain) : entrée, source, appareil, pages vues. Aucune donnée personnelle.';
comment on table public.vitrine_pages is
  'Les pages vues de la vitrine, par jour et par chemin (sans paramètres, identifiants remplacés).';

create trigger vitrine_visites_boutique_immuable before update of boutique_id on public.vitrine_visites
  for each row execute function private.boutique_immuable();
create trigger vitrine_pages_boutique_immuable before update of boutique_id on public.vitrine_pages
  for each row execute function private.boutique_immuable();

alter table public.vitrine_visites enable row level security;
alter table public.vitrine_pages enable row level security;
create policy "vitrine_visites: l'équipe lit celles de sa boutique"
  on public.vitrine_visites for select using (boutique_id in (select private.mes_boutiques()));
create policy "vitrine_pages: l'équipe lit celles de sa boutique"
  on public.vitrine_pages for select using (boutique_id in (select private.mes_boutiques()));
revoke insert, update, delete, truncate on public.vitrine_visites, public.vitrine_pages from anon, authenticated;


-- ---------------------------------------------------------------------
-- Compter une page vue (la vitrine, à chaque page)
-- ---------------------------------------------------------------------
create function public.compter_vue(p_boutique_id uuid, p_cle text, p_chemin text, p_source text default null, p_appareil text default 'ordinateur')
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_jour     date := (now() at time zone 'Africa/Tunis')::date;
  v_sel      bytea;
  v_chemin   text;
  v_source   text := nullif(lower(btrim(coalesce(p_source, ''))), '');
  v_appareil text := case when p_appareil in ('telephone', 'tablette', 'ordinateur') then p_appareil else 'ordinateur' end;
  v_neuf     integer;
begin
  if p_cle is null or char_length(p_cle) not between 16 and 128
     or not coalesce((private.reglage(p_boutique_id, 'vitrine.statistiques'))::boolean, false)
     or not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut = 'active') then
    return;
  end if;
  -- Le chemin : sans paramètres ni ancre, les identifiants remplacés, 200 signes au plus.
  v_chemin := split_part(split_part(coalesce(p_chemin, ''), '?', 1), '#', 1);
  v_chemin := regexp_replace(v_chemin, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ':id', 'g');
  if v_chemin !~ '^/[A-Za-z0-9/_.:%-]*$' then
    return;
  end if;
  v_chemin := left(v_chemin, 200);
  if v_source is not null and v_source !~ '^[a-z0-9.-]{1,120}$' then
    v_source := null;
  end if;
  -- Un site, un nom : www.instagram.com et l.instagram.com comptent comme instagram.com.
  v_source := regexp_replace(v_source, '^(www|m|l|lm|mobile|web)\.', '');

  insert into private.sels_visites (jour, sel)
  values (v_jour, decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex'))
  on conflict (jour) do nothing;
  get diagnostics v_neuf = row_count;
  if v_neuf > 0 then
    -- Premier passage du jour : le sel d'avant-hier s'efface, et les
    -- visites de plus de treize mois (toutes boutiques).
    delete from private.sels_visites s where s.jour < v_jour - 1;
    delete from public.vitrine_visites v where v.jour < v_jour - 400;
    delete from public.vitrine_pages p where p.jour < v_jour - 400;
  end if;
  select s.sel into v_sel from private.sels_visites s where s.jour = v_jour;

  insert into public.vitrine_visites as x (boutique_id, jour, empreinte, entree, source, appareil)
  values (p_boutique_id, v_jour, sha256(v_sel || convert_to(p_boutique_id::text || p_cle, 'UTF8')), v_chemin, v_source, v_appareil)
  on conflict (boutique_id, jour, empreinte) do update set pages = x.pages + 1;
  insert into public.vitrine_pages as x (boutique_id, jour, chemin)
  values (p_boutique_id, v_jour, v_chemin)
  on conflict (boutique_id, jour, chemin) do update set vues = x.vues + 1;
end;
$$;

comment on function public.compter_vue(uuid, text, text, text, text) is
  'Compte une page vue de la vitrine (réglage vitrine.statistiques) : la visite du jour du visiteur (empreinte salée du jour), la page. Ne rend rien ; ne refuse rien de façon visible.';

revoke execute on function public.compter_vue(uuid, text, text, text, text) from public;
grant  execute on function public.compter_vue(uuid, text, text, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- L'équipe de direction : l'écran Visites
-- ---------------------------------------------------------------------
create function public.gestion_visites_etat(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object(
    'actif', coalesce((private.reglage(p_boutique_id, 'vitrine.statistiques'))::boolean, false),
    'compte', exists (select 1 from public.vitrine_visites v where v.boutique_id = p_boutique_id));
end;
$$;

-- Sur 7, 30 ou 90 jours (et la période d'avant, pour comparer) : les
-- visiteurs, les pages vues, les commandes passées et la conversion ; le
-- jour par jour ; les pages et les produits les plus vus ; les sources ;
-- les appareils ; les pages d'entrée.
create function public.gestion_visites(p_boutique_id uuid, p_jours integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jours   integer := case when p_jours in (7, 30, 90) then p_jours else 30 end;
  v_aujourd date := (now() at time zone 'Africa/Tunis')::date;
  v_debut   date := v_aujourd - (v_jours - 1);
  v_avant   date := v_aujourd - (2 * v_jours - 1);
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,lecture}');
  return (
    with visites as (
      select v.*, case when v.jour >= v_debut then 'courante' else 'precedente' end as tranche
        from public.vitrine_visites v where v.boutique_id = p_boutique_id and v.jour >= v_avant
    ), commandes as (
      select (c.created_at at time zone 'Africa/Tunis')::date as jour,
             case when (c.created_at at time zone 'Africa/Tunis')::date >= v_debut then 'courante' else 'precedente' end as tranche
        from public.commandes c
       where c.boutique_id = p_boutique_id and c.origine = 'vitrine' and c.statut not in ('a_arbitrer')
         and c.created_at >= (v_avant::timestamp at time zone 'Africa/Tunis')
    ), chiffres as (
      select t.tranche,
             (select count(*) from visites v where v.tranche = t.tranche) as visiteurs,
             (select coalesce(sum(v.pages), 0) from visites v where v.tranche = t.tranche) as vues,
             (select count(*) from commandes c where c.tranche = t.tranche) as commandes
        from (values ('courante'), ('precedente')) t(tranche)
    ), resume as (
      select tranche, jsonb_build_object('visiteurs', visiteurs, 'vues', vues, 'commandes', commandes,
               'pages_par_visite', case when visiteurs > 0 then round(vues::numeric / visiteurs, 1) end,
               'conversion', case when visiteurs > 0 then round(commandes::numeric / visiteurs, 4) end) as j
        from chiffres
    ), pages as (
      select p.chemin, sum(p.vues) as vues from public.vitrine_pages p
       where p.boutique_id = p_boutique_id and p.jour >= v_debut group by p.chemin
    )
    select jsonb_build_object(
      'actif', coalesce((private.reglage(p_boutique_id, 'vitrine.statistiques'))::boolean, false),
      'du', v_debut, 'au', v_aujourd,
      'courante',   (select j from resume where tranche = 'courante'),
      'precedente', (select j from resume where tranche = 'precedente'),
      'par_jour', (select jsonb_agg(jsonb_build_object(
                     'jour', d.jour,
                     'visiteurs', (select count(*) from visites v where v.jour = d.jour),
                     'vues', (select coalesce(sum(v.pages), 0) from visites v where v.jour = d.jour),
                     'commandes', (select count(*) from commandes c where c.jour = d.jour)) order by d.jour)
                     from (select generate_series(v_debut, v_aujourd, interval '1 day')::date as jour) d),
      -- Les pages, avec le nom du produit ou du rayon qu'elles montrent.
      'pages', coalesce((select jsonb_agg(jsonb_build_object('chemin', x.chemin, 'vues', x.vues, 'nom', x.nom) order by x.vues desc, x.chemin)
                           from (select pg.chemin, pg.vues,
                                        coalesce((select coalesce(pr.nom_fr, pr.nom_ar) from public.produits pr
                                                   where pr.boutique_id = p_boutique_id and pg.chemin = '/produit/' || pr.slug),
                                                 (select coalesce(ca.nom_fr, ca.nom_ar) from public.categories ca
                                                   where ca.boutique_id = p_boutique_id and pg.chemin = '/categorie/' || ca.slug)) as nom
                                   from pages pg order by pg.vues desc, pg.chemin limit 10) x), '[]'::jsonb),
      'produits', coalesce((select jsonb_agg(jsonb_build_object('slug', x.slug, 'nom', x.nom, 'vues', x.vues) order by x.vues desc, x.slug)
                              from (select pr.slug, coalesce(pr.nom_fr, pr.nom_ar) as nom, pg.vues
                                      from pages pg
                                      join public.produits pr on pr.boutique_id = p_boutique_id and pg.chemin = '/produit/' || pr.slug
                                     order by pg.vues desc, pr.slug limit 8) x), '[]'::jsonb),
      'sources', coalesce((select jsonb_agg(jsonb_build_object('source', x.source, 'visiteurs', x.n) order by x.n desc, x.source nulls first)
                             from (select v.source, count(*) as n from visites v where v.tranche = 'courante'
                                    group by v.source order by count(*) desc, v.source nulls first limit 8) x), '[]'::jsonb),
      'appareils', (select jsonb_build_object(
                      'telephone',  count(*) filter (where v.appareil = 'telephone'),
                      'tablette',   count(*) filter (where v.appareil = 'tablette'),
                      'ordinateur', count(*) filter (where v.appareil = 'ordinateur'))
                      from visites v where v.tranche = 'courante'),
      'entrees', coalesce((select jsonb_agg(jsonb_build_object('chemin', x.entree, 'visiteurs', x.n) order by x.n desc, x.entree)
                             from (select v.entree, count(*) as n from visites v where v.tranche = 'courante'
                                    group by v.entree order by count(*) desc, v.entree limit 5) x), '[]'::jsonb)
    )
  );
end;
$$;

revoke execute on function public.gestion_visites_etat(uuid) from public, anon;
revoke execute on function public.gestion_visites(uuid, integer) from public, anon;
grant  execute on function public.gestion_visites_etat(uuid) to authenticated;
grant  execute on function public.gestion_visites(uuid, integer) to authenticated;
