-- =====================================================================
-- LES FORMULES — ce que SkanEcom vend à chaque boutique.
--
-- Une formule (Essentiel, Pro, Complète…) est une liste de DROITS : des
-- fonctions de la vitrine que le commerçant allume lui-même (favoris, prix
-- barrés, précommandes, pixels…) et des modules que la console active.
-- Une boutique a une formule, ou aucune (« sur mesure » : tout est ouvert,
-- comme avant les formules — les boutiques existantes le restent).
--
-- Le contrôle est à la source :
--   · private.reglage et public.configuration_publique rendent le défaut
--     d'un réglage hors formule : allumé avant un changement de formule,
--     il s'éteint sur la vitrine sans qu'on touche à sa valeur (il revient
--     si la formule revient) ;
--   · le back-office ne peut pas l'allumer (déclencheur sur
--     public.reglages, pour une personne connectée) ;
--   · la console n'active pas un module hors formule, et changer de
--     formule coupe les modules qu'elle ne contient plus.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Le catalogue des droits
-- ---------------------------------------------------------------------
create table plateforme.droits (
  code        text primary key,
  genre       text not null check (genre in ('reglage', 'module')),
  reglage     text references plateforme.reglages_catalogue (cle) on delete cascade,
  module      text references plateforme.modules (code) on delete cascade,
  groupe      text not null,
  libelle_fr  text not null,
  description_fr text,
  position    smallint not null default 0,
  constraint droits_reglage check ((genre = 'reglage') = (reglage is not null) and (genre = 'reglage') = (code = reglage)),
  constraint droits_module check ((genre = 'module') = (module is not null) and (genre <> 'module' or code = 'module.' || module))
);

comment on table plateforme.droits is
  'Ce qu''une formule peut ouvrir : un réglage de la vitrine (code = la clé du réglage) ou un module (code = module.<code>).';

create table plateforme.formules (
  code        text primary key check (code ~ '^[a-z][a-z0-9_]{1,30}$'),
  nom         text not null check (length(btrim(nom)) between 2 and 40),
  description text check (description is null or length(description) <= 300),
  -- Le prix est une décision commerciale : vide tant que SkanEcom ne l'a pas fixé.
  prix_mensuel_millimes integer check (prix_mensuel_millimes is null or prix_mensuel_millimes between 0 and 100000000),
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table plateforme.formule_droits (
  formule text not null references plateforme.formules (code) on delete cascade on update cascade,
  droit   text not null references plateforme.droits (code) on delete cascade,
  primary key (formule, droit)
);

alter table plateforme.boutiques
  add column formule text references plateforme.formules (code) on delete restrict on update cascade;

comment on column plateforme.boutiques.formule is
  'La formule vendue. NULL : sur mesure, tout est ouvert (les boutiques d''avant les formules, les démonstrations).';

alter table plateforme.droits enable row level security;
alter table plateforme.formules enable row level security;
alter table plateforme.formule_droits enable row level security;

-- Les droits : les fonctions que le commerçant allume, et les modules.
insert into plateforme.droits (code, genre, reglage, module, groupe, libelle_fr, description_fr, position) values
  ('catalogue.favoris',            'reglage', 'catalogue.favoris',            null, 'fideliser', 'Favoris',                     'Le cœur sur les cartes, la page des favoris.', 10),
  ('catalogue.prevenir_retour',    'reglage', 'catalogue.prevenir_retour',    null, 'fideliser', 'Prévenir du retour en stock', 'L''acheteur laisse son numéro sur une pièce épuisée.', 20),
  ('vitrine.lettre',               'reglage', 'vitrine.lettre',               null, 'fideliser', 'Lettre d''information',       'L''inscription au pied de page, avec consentement.', 30),
  ('vitrine.partage',              'reglage', 'vitrine.partage',              null, 'fideliser', 'Partager une fiche',          'WhatsApp, Facebook, lien copié.', 40),
  ('vitrine.whatsapp_flottant',    'reglage', 'vitrine.whatsapp_flottant',    null, 'fideliser', 'WhatsApp sur toutes les pages','Le bouton flottant.', 50),
  ('catalogue.afficher_prix_barres','reglage','catalogue.afficher_prix_barres',null, 'vendre',    'Prix barrés',                 'Les opérations de prix barrés sur la vitrine.', 10),
  ('catalogue.precommandes',       'reglage', 'catalogue.precommandes',       null, 'vendre',    'Précommandes sur arrivage',   'Commander une pièce annoncée avant son arrivée.', 20),
  ('catalogue.achetes_ensemble',   'reglage', 'catalogue.achetes_ensemble',   null, 'vendre',    'Souvent achetés ensemble',    'Les ventes associées, tirées des commandes.', 30),
  ('catalogue.ajout_carte',        'reglage', 'catalogue.ajout_carte',        null, 'vendre',    'Ajout depuis la carte',       'Le « + » sur la photo des cartes du catalogue.', 40),
  ('commande.achat_express',       'reglage', 'commande.achat_express',       null, 'vendre',    'Achat express',               '« Commander maintenant » depuis la fiche.', 50),
  ('commande.relance_paniers',     'reglage', 'commande.relance_paniers',     null, 'vendre',    'Relance des paniers abandonnés','Un message WhatsApp prêt, une fois par panier.', 60),
  ('vitrine.statistiques',         'reglage', 'vitrine.statistiques',         null, 'mesurer',   'Statistiques de la vitrine',  'Visiteurs, pages, sources, conversion, sans cookie.', 10),
  ('pub.pixel_meta',               'reglage', 'pub.pixel_meta',               null, 'mesurer',   'Pixel Meta',                  'Facebook et Instagram, avec consentement.', 20),
  ('pub.pixel_tiktok',             'reglage', 'pub.pixel_tiktok',             null, 'mesurer',   'Pixel TikTok',                'Avec consentement.', 30)
on conflict do nothing;

insert into plateforme.droits (code, genre, module, groupe, libelle_fr, description_fr, position)
select 'module.' || m.code, 'module', m.code, 'modules', m.libelle_fr, m.description_fr,
       (row_number() over (order by m.code))::smallint * 10
  from plateforme.modules m
on conflict do nothing;

-- Trois formules de départ, à revoir dans la console (noms, contenu, prix).
insert into plateforme.formules (code, nom, description, position) values
  ('essentiel', 'Essentiel', 'La boutique en ligne et ce qui fait revenir : favoris, partage, WhatsApp, avis.', 10),
  ('pro',       'Pro',       'Vendre plus : prix barrés, précommandes, relances, mesures et pixels, promotions, SAV.', 20),
  ('complete',  'Complète',  'Tout, y compris les comptes professionnels, les devis et la facturation SkanFact.', 30)
on conflict do nothing;

insert into plateforme.formule_droits (formule, droit)
select 'essentiel', d from unnest(array[
  'catalogue.favoris', 'vitrine.partage', 'vitrine.whatsapp_flottant', 'vitrine.statistiques',
  'module.avis', 'module.retrait_magasin', 'module.conseil_whatsapp']) d
where exists (select 1 from plateforme.droits x where x.code = d)
on conflict do nothing;

insert into plateforme.formule_droits (formule, droit)
select 'pro', d from unnest(array[
  'catalogue.favoris', 'vitrine.partage', 'vitrine.whatsapp_flottant', 'vitrine.statistiques',
  'module.avis', 'module.retrait_magasin', 'module.conseil_whatsapp',
  'catalogue.prevenir_retour', 'vitrine.lettre', 'catalogue.afficher_prix_barres', 'catalogue.precommandes',
  'catalogue.achetes_ensemble', 'catalogue.ajout_carte', 'commande.achat_express', 'commande.relance_paniers',
  'pub.pixel_meta', 'pub.pixel_tiktok', 'module.promotions', 'module.sav']) d
where exists (select 1 from plateforme.droits x where x.code = d)
on conflict do nothing;

insert into plateforme.formule_droits (formule, droit)
select 'complete', d.code from plateforme.droits d
on conflict do nothing;


-- ---------------------------------------------------------------------
-- Le contrôle : un droit est ouvert si la boutique n'a pas de formule, si
-- ce n'est pas un droit vendu, ou si sa formule le contient.
-- ---------------------------------------------------------------------
create function private.droit(p_boutique_id uuid, p_droit text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select b.formule is null
        or not exists (select 1 from plateforme.droits d where d.code = p_droit)
        or exists (select 1 from plateforme.formule_droits fd where fd.formule = b.formule and fd.droit = p_droit)
      from plateforme.boutiques b where b.id = p_boutique_id), true);
$$;

revoke execute on function private.droit(uuid, text) from public, anon, authenticated;

/** La formule la moins chère (la première) qui ouvre un droit. */
create function private.formule_requise(p_droit text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('code', f.code, 'nom', f.nom)
    from plateforme.formule_droits fd join plateforme.formules f on f.code = fd.formule
   where fd.droit = p_droit
   order by f.position, f.code
   limit 1;
$$;

revoke execute on function private.formule_requise(text) from public, anon, authenticated;

create or replace function private.reglage(p_boutique_id uuid, p_cle text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.droit(p_boutique_id, p_cle)
    then coalesce(
      (select r.valeur from public.reglages r where r.boutique_id = p_boutique_id and r.cle = p_cle),
      (select c.defaut from plateforme.reglages_catalogue c where c.cle = p_cle))
    else (select c.defaut from plateforme.reglages_catalogue c where c.cle = p_cle)
  end;
$$;

create or replace function public.configuration_publique(p_boutique_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'reglages', coalesce((
      select jsonb_object_agg(c.cle, case when private.droit(b.id, c.cle) then coalesce(r.valeur, c.defaut) else c.defaut end)
      from plateforme.reglages_catalogue c
      left join public.reglages r on r.boutique_id = b.id and r.cle = c.cle
      where c.public
        and (c.module is null or exists (
          select 1 from plateforme.modules_actifs ma
          where ma.boutique_id = b.id and ma.module = c.module and ma.actif))
    ), '{}'::jsonb),
    'modules', coalesce((
      select jsonb_agg(ma.module order by ma.module)
      from plateforme.modules_actifs ma
      where ma.boutique_id = b.id and ma.actif
    ), '[]'::jsonb)
  )
  from plateforme.boutiques b
  where b.id = p_boutique_id and b.statut = 'active';
$$;

-- Le back-office ne peut pas allumer une fonction hors formule. La console
-- (clé de service, sans personne connectée) et le jeu de démonstration
-- passent : les préréglages d'un métier posent leurs valeurs, éteintes à
-- la lecture si la formule ne les ouvre pas.
create function private.reglage_dans_formule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_def plateforme.reglages_catalogue;
  v_f   jsonb;
begin
  if auth.uid() is null or private.droit(new.boutique_id, new.cle) then
    return new;
  end if;
  select * into v_def from plateforme.reglages_catalogue c where c.cle = new.cle;
  if new.valeur = v_def.defaut then
    return new;
  end if;
  v_f := private.formule_requise(new.cle);
  raise exception '« % » n''est pas dans la formule de la boutique%', v_def.libelle_fr,
    case when v_f is null then '' else format(' : elle vient avec la formule %s, que SkanEcom peut vous ouvrir', v_f ->> 'nom') end
    using errcode = 'check_violation', hint = 'formule';
end;
$$;

revoke execute on function private.reglage_dans_formule() from public, anon, authenticated;

create trigger reglages_formule
  before insert or update on public.reglages
  for each row execute function private.reglage_dans_formule();


-- ---------------------------------------------------------------------
-- Le back-office : sa formule, et ce qu'elle n'ouvre pas.
-- ---------------------------------------------------------------------
create function public.gestion_formule(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b plateforme.boutiques;
begin
  perform private.catalogue_exige(p_boutique_id);
  select * into b from plateforme.boutiques x where x.id = p_boutique_id;
  return jsonb_build_object(
    'formule', (select jsonb_build_object('code', f.code, 'nom', f.nom) from plateforme.formules f where f.code = b.formule),
    'fermes', coalesce((
      select jsonb_object_agg(d.code, coalesce(private.formule_requise(d.code), 'null'::jsonb))
        from plateforme.droits d
       where not private.droit(p_boutique_id, d.code)), '{}'::jsonb)
  );
end;
$$;

revoke execute on function public.gestion_formule(uuid) from public, anon;
grant  execute on function public.gestion_formule(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- La console
-- ---------------------------------------------------------------------
create function public.console_formules(p_acteur uuid)
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
               'boutiques', (select count(*) from plateforme.boutiques b where b.formule = f.code))
             order by f.position, f.code)
        from plateforme.formules f), '[]'::jsonb),
    'droits', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', d.code, 'genre', d.genre, 'groupe', d.groupe, 'libelle', d.libelle_fr, 'description', d.description_fr,
               'disponible', d.module is null or (select m.disponible from plateforme.modules m where m.code = d.module))
             order by d.groupe, d.position, d.code)
        from plateforme.droits d), '[]'::jsonb),
    'boutiques', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'slug', b.slug, 'nom', b.nom, 'formule', b.formule, 'demonstration', b.demonstration)
             order by b.nom)
        from plateforme.boutiques b), '[]'::jsonb)
  );
end;
$$;

/** Coupe les modules actifs qu'une boutique n'a plus le droit d'avoir. */
create function private.couper_modules_hors_formule(p_acteur uuid, p_boutique_id uuid)
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_coupes text[] := '{}';
  v_m      text;
begin
  for v_m in
    select ma.module from plateforme.modules_actifs ma
     where ma.boutique_id = p_boutique_id and ma.actif and not private.droit(p_boutique_id, 'module.' || ma.module)
     order by ma.module
  loop
    update plateforme.modules_actifs set actif = false, active_le = now(), active_par = p_acteur
     where boutique_id = p_boutique_id and module = v_m;
    perform private.console_trace(p_acteur, p_boutique_id, 'module.couper', v_m,
      jsonb_build_object('actif', true), jsonb_build_object('actif', false, 'raison', 'formule'));
    v_coupes := v_coupes || v_m;
  end loop;
  return v_coupes;
end;
$$;

revoke execute on function private.couper_modules_hors_formule(uuid, uuid) from public, anon, authenticated;

create function public.console_enregistrer_formule(
  p_acteur uuid, p_code text, p_nom text, p_description text, p_prix_millimes integer, p_droits text[], p_position smallint default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code   text := lower(btrim(coalesce(p_code, '')));
  v_avant  jsonb;
  v_inconnus text[];
  v_b      uuid;
  v_coupes integer := 0;
  v_n      text[];
begin
  if private.console_exige_admin(p_acteur) <> 'super_admin' then
    raise exception 'Seul un super-administrateur change les formules' using errcode = 'insufficient_privilege';
  end if;
  if v_code !~ '^[a-z][a-z0-9_]{1,30}$' then
    raise exception 'Code de formule invalide : lettres minuscules, chiffres, « _ »' using errcode = 'check_violation', hint = 'code';
  end if;
  select array_agg(d) into v_inconnus from unnest(coalesce(p_droits, '{}')) d
   where not exists (select 1 from plateforme.droits x where x.code = d);
  if v_inconnus is not null then
    raise exception 'Droits inconnus : %', array_to_string(v_inconnus, ', ') using errcode = 'check_violation', hint = 'droits';
  end if;

  select jsonb_build_object('nom', f.nom, 'prix', f.prix_mensuel_millimes,
           'droits', coalesce((select jsonb_agg(fd.droit order by fd.droit) from plateforme.formule_droits fd where fd.formule = f.code), '[]'::jsonb))
    into v_avant from plateforme.formules f where f.code = v_code;

  insert into plateforme.formules as f (code, nom, description, prix_mensuel_millimes, position)
  values (v_code, btrim(p_nom), nullif(btrim(coalesce(p_description, '')), ''), p_prix_millimes,
          coalesce(p_position, (select coalesce(max(x.position), 0) + 10 from plateforme.formules x)))
  on conflict (code) do update
    set nom = excluded.nom, description = excluded.description, prix_mensuel_millimes = excluded.prix_mensuel_millimes,
        position = coalesce(p_position, f.position), updated_at = now();

  delete from plateforme.formule_droits fd where fd.formule = v_code and not (fd.droit = any (coalesce(p_droits, '{}')));
  insert into plateforme.formule_droits (formule, droit)
  select v_code, d from unnest(coalesce(p_droits, '{}')) d
  on conflict do nothing;

  -- Un module retiré de la formule : coupé dans ses boutiques.
  for v_b in select b.id from plateforme.boutiques b where b.formule = v_code loop
    v_n := private.couper_modules_hors_formule(p_acteur, v_b);
    v_coupes := v_coupes + coalesce(array_length(v_n, 1), 0);
  end loop;

  perform private.console_trace(p_acteur, null, case when v_avant is null then 'formule.creer' else 'formule.modifier' end, v_code,
    v_avant, jsonb_build_object('nom', btrim(p_nom), 'prix', p_prix_millimes, 'droits', to_jsonb(coalesce(p_droits, '{}'))));
  return jsonb_build_object('code', v_code, 'cree', v_avant is null, 'modules_coupes', v_coupes);
end;
$$;

create function public.console_supprimer_formule(p_acteur uuid, p_code text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if private.console_exige_admin(p_acteur) <> 'super_admin' then
    raise exception 'Seul un super-administrateur change les formules' using errcode = 'insufficient_privilege';
  end if;
  select count(*) into v_n from plateforme.boutiques b where b.formule = p_code;
  if v_n > 0 then
    raise exception 'Formule encore vendue à % boutique%s : changez-les d''abord de formule', v_n, case when v_n > 1 then 's' else '' end
      using errcode = 'check_violation', hint = 'utilisee';
  end if;
  delete from plateforme.formules f where f.code = p_code;
  if not found then
    raise exception 'Formule introuvable' using errcode = 'no_data_found';
  end if;
  perform private.console_trace(p_acteur, null, 'formule.supprimer', p_code, null, null);
end;
$$;

create function public.console_changer_formule(p_acteur uuid, p_boutique_id uuid, p_formule text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  b         plateforme.boutiques;
  v_formule text := nullif(btrim(coalesce(p_formule, '')), '');
  v_coupes  text[];
  v_eteintes jsonb;
begin
  -- Ce que la boutique a acheté : un super-administrateur, pas le support.
  if private.console_exige_admin(p_acteur) <> 'super_admin' then
    raise exception 'Seul un super-administrateur peut le faire : le rôle support aide, sans engager la boutique'
      using errcode = 'insufficient_privilege';
  end if;
  select * into b from plateforme.boutiques x where x.id = p_boutique_id for update;
  if not found then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  if v_formule is not null and not exists (select 1 from plateforme.formules f where f.code = v_formule) then
    raise exception 'Formule inconnue « % »', v_formule using errcode = 'no_data_found', hint = 'formule';
  end if;
  if b.formule is not distinct from v_formule then
    return jsonb_build_object('change', false, 'modules_coupes', '[]'::jsonb, 'fonctions_eteintes', '[]'::jsonb);
  end if;

  update plateforme.boutiques set formule = v_formule, updated_at = now() where id = p_boutique_id;
  v_coupes := private.couper_modules_hors_formule(p_acteur, p_boutique_id);

  -- Les fonctions allumées que la nouvelle formule éteint (leur valeur est
  -- gardée : elles reviennent avec une formule qui les ouvre).
  select coalesce(jsonb_agg(c.libelle_fr order by c.libelle_fr), '[]'::jsonb) into v_eteintes
    from public.reglages r join plateforme.reglages_catalogue c on c.cle = r.cle
   where r.boutique_id = p_boutique_id and r.valeur <> c.defaut and not private.droit(p_boutique_id, r.cle);

  perform private.console_trace(p_acteur, p_boutique_id, 'boutique.formule', v_formule,
    jsonb_build_object('formule', b.formule), jsonb_build_object('formule', v_formule, 'modules_coupes', to_jsonb(v_coupes)));
  return jsonb_build_object('change', true, 'modules_coupes', to_jsonb(v_coupes), 'fonctions_eteintes', v_eteintes);
end;
$$;

-- Activer un module : seulement s'il est dans la formule.
create or replace function public.console_changer_module(p_acteur uuid, p_boutique_id uuid, p_module text, p_actif boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_module plateforme.modules;
  v_avant  boolean;
  v_f      jsonb;
begin
  if private.console_exige_admin(p_acteur) <> 'super_admin' then
    raise exception 'Seul un super-administrateur peut le faire : le rôle support aide, sans engager la boutique'
      using errcode = 'insufficient_privilege';
  end if;
  if p_actif is null then
    raise exception 'Module : activer ou couper ?' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id) then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  select * into v_module from plateforme.modules m where m.code = p_module;
  if not found then
    raise exception 'Module inconnu « % »', p_module using errcode = 'no_data_found', hint = 'module';
  end if;

  select ma.actif into v_avant from plateforme.modules_actifs ma
   where ma.boutique_id = p_boutique_id and ma.module = p_module for update;
  v_avant := coalesce(v_avant, false);
  if v_avant = p_actif then
    return;
  end if;
  if p_actif and not v_module.disponible then
    raise exception 'Le module « % » est à venir : il ne s''active pas encore', v_module.libelle_fr
      using errcode = 'check_violation', hint = 'a_venir';
  end if;
  if p_actif and not private.droit(p_boutique_id, 'module.' || p_module) then
    v_f := private.formule_requise('module.' || p_module);
    raise exception 'Le module « % » n''est pas dans la formule de la boutique%', v_module.libelle_fr,
      case when v_f is null then '' else format(' : il vient avec la formule %s', v_f ->> 'nom') end
      using errcode = 'check_violation', hint = 'formule';
  end if;

  insert into plateforme.modules_actifs as ma (boutique_id, module, actif, active_le, active_par)
  values (p_boutique_id, p_module, p_actif, now(), p_acteur)
  on conflict (boutique_id, module) do update
    set actif = excluded.actif, active_le = excluded.active_le, active_par = excluded.active_par;

  perform private.console_trace(p_acteur, p_boutique_id, case when p_actif then 'module.activer' else 'module.couper' end,
    p_module, jsonb_build_object('actif', v_avant), jsonb_build_object('actif', p_actif));
end;
$$;

revoke execute on function public.console_formules(uuid) from public, anon, authenticated;
revoke execute on function public.console_enregistrer_formule(uuid, text, text, text, integer, text[], smallint) from public, anon, authenticated;
revoke execute on function public.console_supprimer_formule(uuid, text) from public, anon, authenticated;
revoke execute on function public.console_changer_formule(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.console_formules(uuid) to service_role;
grant  execute on function public.console_enregistrer_formule(uuid, text, text, text, integer, text[], smallint) to service_role;
grant  execute on function public.console_supprimer_formule(uuid, text) to service_role;
grant  execute on function public.console_changer_formule(uuid, uuid, text) to service_role;
