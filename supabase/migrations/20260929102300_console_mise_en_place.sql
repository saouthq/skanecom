-- =====================================================================
-- SkanEcom — 24 · CONSOLE C6 : LA LISTE DE MISE EN PLACE
-- 29/09/2026 — étape 1, tâche « console » (PRD §6.1 C6 et §7)
-- =====================================================================
--
-- La mise en place d'un client, telle que Skander et son père la suivent
-- (PRD §7), étape par étape, avec la date de chacune : l'objectif est d'en
-- mesurer la durée sur Maymar, puis de la réduire à chaque client.
--
-- Ce qui se constate se constate : la marque réglée, le catalogue en
-- vitrine, le domaine du client, le livreur et le WhatsApp, les
-- informations légales, le propriétaire dans l'équipe, la boutique ouverte.
-- Ce qui ne se voit pas dans la base se coche à la main, depuis la console :
-- le recueil (logo, photos, fichier, conditions), la commande test de bout
-- en bout, la formation de l'équipe (plateforme.mise_en_place).

create table plateforme.mise_en_place (
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  etape       text not null check (etape in ('recueil', 'commande_test', 'formation')),
  faite_le    timestamptz not null default now(),
  faite_par   uuid references auth.users (id) on delete set null,
  primary key (boutique_id, etape)
);

comment on table plateforme.mise_en_place is
  'Les étapes de mise en place cochées à la main depuis la console (les autres se constatent : public.console_mise_en_place).';

alter table plateforme.mise_en_place enable row level security;
revoke all on plateforme.mise_en_place from public, anon, authenticated;


-- Les dix étapes d'une boutique, dans l'ordre : pour chacune, faite ou non,
-- depuis quand, cochée à la main ou constatée, et ce qu'on en sait.
create function public.console_mise_en_place(p_boutique_id uuid)
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
  v_manuelle    jsonb;
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

-- L'avancement de chaque boutique, pour la liste de la console.
create function public.console_avancements()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(b.id, jsonb_build_object(
           'faites', (select count(*) from jsonb_array_elements(public.console_mise_en_place(b.id) -> 'etapes') e
                       where (e ->> 'fait')::boolean),
           'total', jsonb_array_length(public.console_mise_en_place(b.id) -> 'etapes'))), '{}'::jsonb)
  from plateforme.boutiques b;
$$;

-- Cocher (ou décocher) une étape qui ne se constate pas.
create function public.console_marquer_etape(p_acteur uuid, p_boutique_id uuid, p_etape text, p_fait boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant boolean;
begin
  perform private.console_exige_admin(p_acteur);
  if p_etape is null or p_etape not in ('recueil', 'commande_test', 'formation') then
    raise exception 'Cette étape se constate d''elle-même : elle ne se coche pas' using errcode = 'check_violation', hint = 'etape';
  end if;
  if p_fait is null then
    raise exception 'Étape : faite ou à faire ?' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id) then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;

  v_avant := exists (select 1 from plateforme.mise_en_place m where m.boutique_id = p_boutique_id and m.etape = p_etape);
  if v_avant = p_fait then
    return;
  end if;
  if p_fait then
    insert into plateforme.mise_en_place (boutique_id, etape, faite_par) values (p_boutique_id, p_etape, p_acteur);
  else
    delete from plateforme.mise_en_place m where m.boutique_id = p_boutique_id and m.etape = p_etape;
  end if;
  perform private.console_trace(p_acteur, p_boutique_id, case when p_fait then 'mise_en_place.faite' else 'mise_en_place.a_faire' end,
    p_etape, jsonb_build_object('fait', v_avant), jsonb_build_object('fait', p_fait));
end;
$$;

revoke execute on function public.console_mise_en_place(uuid)                       from public, anon, authenticated;
revoke execute on function public.console_avancements()                             from public, anon, authenticated;
revoke execute on function public.console_marquer_etape(uuid, uuid, text, boolean)  from public, anon, authenticated;
grant  execute on function public.console_mise_en_place(uuid)                       to service_role;
grant  execute on function public.console_avancements()                             to service_role;
grant  execute on function public.console_marquer_etape(uuid, uuid, text, boolean)  to service_role;
