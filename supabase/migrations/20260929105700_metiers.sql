-- =====================================================================
-- SkanEcom — 58 · LES PRÉRÉGLAGES PAR MÉTIER
-- =====================================================================
--
-- « Une boutique prête à habiller en dix minutes » (feuille de route D) :
-- un commerçant de beauté, de high-tech ou d'épicerie fine n'a pas les
-- rayons, les caractéristiques ni la palette d'une boutique de mode. Un
-- préréglage pose d'un geste, depuis la console :
--   · le gabarit, les couleurs et les polices (des valeurs de la liste
--     fermée des thèmes, vérifiées par leur trigger) ;
--   · les rayons du métier (et leurs sous-rayons) ;
--   · ses caractéristiques (fiches techniques B9), chacune sur ses rayons ;
--   · quelques réglages de vitrine qui lui vont, et un texte de retour.
-- Tout reste modifiable ensuite, au backoffice comme à la console.
--
-- Il ne s'applique qu'à une boutique encore vide (ni rayon, ni produit, ni
-- caractéristique) : il ne mélange jamais son catalogue à un existant. Les
-- réglages déjà réglés par la boutique ne sont pas touchés. Un
-- administrateur de la plateforme seul, tracé.
-- =====================================================================

create table plateforme.metiers (
  code        text primary key check (code ~ '^[a-z_]{2,30}$'),
  nom         text not null,
  description text not null,
  position    smallint not null default 0,
  definition  jsonb not null check (jsonb_typeof(definition) = 'object')
);

comment on table plateforme.metiers is
  'Les préréglages par métier : gabarit, couleurs, polices, textes, rayons, caractéristiques et réglages posés d''un geste sur une boutique vide.';

alter table plateforme.metiers enable row level security;
revoke all on plateforme.metiers from anon, authenticated;

insert into plateforme.metiers (code, nom, description, position, definition) values
('mode', 'Mode et prêt-à-porter', 'Femme, homme, chaussures, accessoires ; la matière et la coupe sur chaque fiche.', 1, $j$
{"theme": "editorial",
 "couleurs": {"accent": "#8C4A2F", "fond": "#F7F4EF"},
 "polices": {"titres": "instrument-serif", "texte": "instrument-sans"},
 "textes": {"politique_retour_fr": "Échange possible sous 14 jours, article non porté et étiqueté."},
 "rayons": [
   {"slug": "femme", "nom": "Femme", "enfants": [{"slug": "robes", "nom": "Robes"}, {"slug": "hauts", "nom": "Hauts"}, {"slug": "pantalons-et-jupes", "nom": "Pantalons et jupes"}]},
   {"slug": "homme", "nom": "Homme", "enfants": [{"slug": "chemises", "nom": "Chemises"}, {"slug": "pantalons", "nom": "Pantalons"}]},
   {"slug": "chaussures", "nom": "Chaussures"},
   {"slug": "accessoires", "nom": "Accessoires", "enfants": [{"slug": "sacs", "nom": "Sacs"}, {"slug": "ceintures", "nom": "Ceintures"}]}],
 "attributs": [
   {"cle": "matiere", "label": "Matière", "type": "texte", "filtrable": true, "en_carte": false},
   {"cle": "coupe", "label": "Coupe", "type": "texte", "filtrable": true, "rayons": ["femme", "homme"]},
   {"cle": "entretien", "label": "Entretien", "type": "texte", "filtrable": false}],
 "reglages": {"catalogue.favoris": true, "vitrine.partage": true, "catalogue.prevenir_retour": true}}
$j$),
('beaute', 'Beauté et cosmétique', 'Soins, cheveux, maquillage, parfums, coffrets ; la contenance et le type de peau.', 2, $j$
{"theme": "editorial",
 "couleurs": {"accent": "#A4506F", "fond": "#FBF7F6"},
 "polices": {"titres": "young-serif", "texte": "instrument-sans"},
 "textes": {"politique_retour_fr": "Pour votre sécurité, un produit ouvert ne peut être ni repris ni échangé."},
 "rayons": [
   {"slug": "soins-du-visage", "nom": "Soins du visage"}, {"slug": "corps-et-bain", "nom": "Corps et bain"},
   {"slug": "cheveux", "nom": "Cheveux"}, {"slug": "maquillage", "nom": "Maquillage"},
   {"slug": "parfums", "nom": "Parfums"}, {"slug": "coffrets", "nom": "Coffrets"}],
 "attributs": [
   {"cle": "contenance", "label": "Contenance", "unite": "ml", "type": "nombre", "filtrable": true, "en_carte": true},
   {"cle": "type_de_peau", "label": "Type de peau", "type": "texte", "filtrable": true, "rayons": ["soins-du-visage", "corps-et-bain"]},
   {"cle": "ingredients", "label": "Ingrédients clés", "type": "texte", "filtrable": false},
   {"cle": "fabrication", "label": "Fabriqué en", "type": "texte", "filtrable": true}],
 "reglages": {"catalogue.favoris": true, "vitrine.partage": true, "catalogue.prevenir_retour": true}}
$j$),
('bijoux', 'Bijoux et montres', 'Colliers, bagues, bracelets, boucles d''oreilles, montres ; le métal et la pierre.', 3, $j$
{"theme": "editorial",
 "couleurs": {"accent": "#9A7428", "fond": "#FAF8F4"},
 "polices": {"titres": "instrument-serif", "texte": "instrument-sans"},
 "textes": {"politique_retour_fr": "Échange possible sous 14 jours, bijou non porté, dans son écrin."},
 "rayons": [
   {"slug": "colliers", "nom": "Colliers"}, {"slug": "bagues", "nom": "Bagues"}, {"slug": "bracelets", "nom": "Bracelets"},
   {"slug": "boucles-d-oreilles", "nom": "Boucles d'oreilles"}, {"slug": "montres", "nom": "Montres"}],
 "attributs": [
   {"cle": "metal", "label": "Métal", "type": "texte", "filtrable": true, "en_carte": true},
   {"cle": "pierre", "label": "Pierre", "type": "texte", "filtrable": true},
   {"cle": "longueur", "label": "Longueur", "unite": "cm", "type": "nombre", "filtrable": true, "rayons": ["colliers", "bracelets"]},
   {"cle": "etancheite", "label": "Étanchéité", "unite": "m", "type": "nombre", "filtrable": true, "rayons": ["montres"]}],
 "reglages": {"catalogue.favoris": true, "vitrine.partage": true}}
$j$),
('high_tech', 'High-tech et téléphonie', 'Smartphones, ordinateurs, audio, accessoires ; stockage, mémoire, écran, garantie.', 4, $j$
{"theme": "technique",
 "couleurs": {"accent": "#38BDF8"},
 "polices": {"titres": "archivo", "texte": "archivo"},
 "textes": {"politique_retour_fr": "Produit neuf, scellé, garanti ; rétractation possible si l'emballage n'a pas été ouvert."},
 "rayons": [
   {"slug": "smartphones", "nom": "Smartphones"}, {"slug": "ordinateurs-portables", "nom": "Ordinateurs portables"},
   {"slug": "tablettes", "nom": "Tablettes"}, {"slug": "audio", "nom": "Audio"},
   {"slug": "accessoires", "nom": "Accessoires", "enfants": [{"slug": "chargeurs-et-cables", "nom": "Chargeurs et câbles"}, {"slug": "coques-et-protections", "nom": "Coques et protections"}]},
   {"slug": "maison-connectee", "nom": "Maison connectée"}],
 "attributs": [
   {"cle": "stockage", "label": "Stockage", "unite": "Go", "type": "nombre", "filtrable": true, "en_carte": true, "rayons": ["smartphones", "ordinateurs-portables", "tablettes"]},
   {"cle": "memoire", "label": "Mémoire vive", "unite": "Go", "type": "nombre", "filtrable": true, "rayons": ["smartphones", "ordinateurs-portables", "tablettes"]},
   {"cle": "ecran", "label": "Écran", "unite": "pouces", "type": "nombre", "filtrable": true, "rayons": ["smartphones", "ordinateurs-portables", "tablettes"]},
   {"cle": "connectique", "label": "Connectique", "type": "texte", "filtrable": true, "rayons": ["audio", "accessoires"]},
   {"cle": "garantie", "label": "Garantie", "unite": "mois", "type": "nombre", "filtrable": true}],
 "reglages": {"catalogue.prevenir_retour": true, "catalogue.favoris": true}}
$j$),
('maison', 'Maison et décoration', 'Cuisine et table, décoration, linge, luminaires, rangement ; matière et dimensions.', 5, $j$
{"theme": "editorial",
 "couleurs": {"accent": "#5E6B4E", "fond": "#F6F4EE"},
 "polices": {"titres": "instrument-serif", "texte": "instrument-sans"},
 "textes": {"politique_retour_fr": "Retour possible sous 7 jours, article intact dans son emballage d'origine."},
 "rayons": [
   {"slug": "cuisine-et-table", "nom": "Cuisine et table"}, {"slug": "decoration", "nom": "Décoration"},
   {"slug": "linge-de-maison", "nom": "Linge de maison"}, {"slug": "luminaires", "nom": "Luminaires"}, {"slug": "rangement", "nom": "Rangement"}],
 "attributs": [
   {"cle": "matiere", "label": "Matière", "type": "texte", "filtrable": true, "en_carte": true},
   {"cle": "dimensions", "label": "Dimensions", "type": "texte", "filtrable": false},
   {"cle": "entretien", "label": "Entretien", "type": "texte", "filtrable": false},
   {"cle": "fait_main", "label": "Fait main", "type": "texte", "filtrable": true}],
 "reglages": {"catalogue.favoris": true, "vitrine.partage": true}}
$j$),
('alimentation', 'Épicerie fine et terroir', 'Huiles d''olive, dattes, miels, épices, coffrets ; le poids net, la région d''origine.', 6, $j$
{"theme": "editorial",
 "couleurs": {"accent": "#7A5A1E", "fond": "#FBF8F1"},
 "polices": {"titres": "young-serif", "texte": "instrument-sans"},
 "textes": {"politique_retour_fr": "Denrées alimentaires : ni reprises ni échangées une fois livrées, sauf défaut constaté à la livraison."},
 "rayons": [
   {"slug": "huiles-d-olive", "nom": "Huiles d'olive"}, {"slug": "dattes-et-fruits-secs", "nom": "Dattes et fruits secs"},
   {"slug": "miels-et-confitures", "nom": "Miels et confitures"}, {"slug": "epices-et-harissa", "nom": "Épices et harissa"},
   {"slug": "coffrets-cadeaux", "nom": "Coffrets cadeaux"}],
 "attributs": [
   {"cle": "poids_net", "label": "Poids net", "unite": "g", "type": "nombre", "filtrable": true, "en_carte": true},
   {"cle": "origine", "label": "Région d'origine", "type": "texte", "filtrable": true},
   {"cle": "bio", "label": "Agriculture biologique", "type": "texte", "filtrable": true},
   {"cle": "conservation", "label": "Conservation", "type": "texte", "filtrable": false}],
 "reglages": {"vitrine.partage": true}}
$j$),
('outillage', 'Outillage et quincaillerie', 'Électroportatif, outillage à main, quincaillerie, protection, jardin ; tension, puissance, norme.', 7, $j$
{"theme": "technique",
 "couleurs": {"accent": "#F2B705"},
 "polices": {"titres": "archivo", "texte": "archivo"},
 "textes": {"politique_retour_fr": "Retour possible sous 7 jours, outil non utilisé dans son emballage d'origine."},
 "rayons": [
   {"slug": "outillage-electroportatif", "nom": "Outillage électroportatif"}, {"slug": "outillage-a-main", "nom": "Outillage à main"},
   {"slug": "quincaillerie", "nom": "Quincaillerie"}, {"slug": "protection", "nom": "Protection"}, {"slug": "jardin", "nom": "Jardin"}],
 "attributs": [
   {"cle": "tension", "label": "Tension", "unite": "V", "type": "nombre", "filtrable": true, "en_carte": true, "rayons": ["outillage-electroportatif", "jardin"]},
   {"cle": "puissance", "label": "Puissance", "unite": "W", "type": "nombre", "filtrable": true, "rayons": ["outillage-electroportatif", "jardin"]},
   {"cle": "batterie", "label": "Batterie incluse", "type": "texte", "filtrable": true, "rayons": ["outillage-electroportatif"]},
   {"cle": "norme", "label": "Norme", "type": "texte", "filtrable": true, "rayons": ["protection"]}],
 "reglages": {"catalogue.prevenir_retour": true}}
$j$),
('bagages', 'Bagages et voyage', 'Valises cabine et soute, sacs de voyage, sacs à dos, accessoires ; volume, poids, roues.', 8, $j$
{"theme": "editorial",
 "couleurs": {"accent": "#1F4E79", "fond": "#F5F6F7"},
 "polices": {"titres": "instrument-serif", "texte": "instrument-sans"},
 "textes": {"politique_retour_fr": "Retour possible sous 14 jours, bagage non utilisé, étiquettes en place."},
 "rayons": [
   {"slug": "valises-cabine", "nom": "Valises cabine"}, {"slug": "valises-soute", "nom": "Valises soute"},
   {"slug": "sacs-de-voyage", "nom": "Sacs de voyage"}, {"slug": "sacs-a-dos", "nom": "Sacs à dos"},
   {"slug": "accessoires-de-voyage", "nom": "Accessoires de voyage"}],
 "attributs": [
   {"cle": "volume", "label": "Volume", "unite": "L", "type": "nombre", "filtrable": true, "en_carte": true, "rayons": ["valises-cabine", "valises-soute", "sacs-de-voyage", "sacs-a-dos"]},
   {"cle": "poids", "label": "Poids", "unite": "kg", "type": "nombre", "filtrable": true, "rayons": ["valises-cabine", "valises-soute", "sacs-de-voyage", "sacs-a-dos"]},
   {"cle": "dimensions", "label": "Dimensions", "type": "texte", "filtrable": false},
   {"cle": "roues", "label": "Roues", "type": "nombre", "filtrable": true, "rayons": ["valises-cabine", "valises-soute"]}],
 "reglages": {"catalogue.favoris": true, "catalogue.prevenir_retour": true}}
$j$);


-- ---------------------------------------------------------------------
-- La console : la liste, l'application
-- ---------------------------------------------------------------------
create function public.console_metiers(p_acteur uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'code', m.code, 'nom', m.nom, 'description', m.description, 'gabarit', m.definition ->> 'theme',
             'accent', m.definition #>> '{couleurs,accent}',
             'rayons', jsonb_array_length(m.definition -> 'rayons'),
             'sous_rayons', (select coalesce(sum(jsonb_array_length(coalesce(r -> 'enfants', '[]'::jsonb))), 0) from jsonb_array_elements(m.definition -> 'rayons') r),
             'caracteristiques', jsonb_array_length(m.definition -> 'attributs'))
           order by m.position)
      from plateforme.metiers m), '[]'::jsonb);
end;
$$;

-- Ce que la boutique a déjà (un préréglage ne vient que sur du vide).
create function public.console_metier_possible(p_acteur uuid, p_boutique_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  return not exists (select 1 from public.categories c where c.boutique_id = p_boutique_id)
     and not exists (select 1 from public.produits p where p.boutique_id = p_boutique_id)
     and not exists (select 1 from public.attributs a where a.boutique_id = p_boutique_id);
end;
$$;

create function public.console_appliquer_metier(p_acteur uuid, p_boutique_id uuid, p_metier text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_def      jsonb;
  v_rayon    jsonb;
  v_enfant   jsonb;
  v_attr     jsonb;
  v_reglage  record;
  v_parent   uuid;
  v_attr_id  uuid;
  v_pos      integer := 0;
  v_pos_enf  integer;
  v_n_rayons integer := 0;
  v_n_attrs  integer := 0;
  v_n_regl   integer := 0;
begin
  perform private.console_exige_admin(p_acteur);
  select m.definition into v_def from plateforme.metiers m where m.code = p_metier;
  if v_def is null then
    raise exception 'Métier inconnu' using errcode = 'check_violation', hint = 'metier';
  end if;
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id) then
    raise exception 'Boutique introuvable' using errcode = 'check_violation', hint = 'boutique';
  end if;
  if exists (select 1 from public.categories c where c.boutique_id = p_boutique_id)
     or exists (select 1 from public.produits p where p.boutique_id = p_boutique_id)
     or exists (select 1 from public.attributs a where a.boutique_id = p_boutique_id) then
    raise exception 'La boutique a déjà un catalogue : un préréglage ne vient que sur une boutique vide'
      using errcode = 'check_violation', hint = 'catalogue';
  end if;

  -- Le gabarit, la palette, les polices ; les textes de la boutique gardés,
  -- ceux du métier ajoutés là où il n'y en a pas.
  insert into public.themes (boutique_id, code, updated_by) values (p_boutique_id, v_def ->> 'theme', p_acteur)
  on conflict (boutique_id) do nothing;
  update public.themes t
     set code = v_def ->> 'theme',
         couleurs = coalesce(v_def -> 'couleurs', '{}'::jsonb),
         polices = coalesce(v_def -> 'polices', '{}'::jsonb),
         textes = coalesce(v_def -> 'textes', '{}'::jsonb) || t.textes,
         version = t.version + 1, updated_at = now(), updated_by = p_acteur
   where t.boutique_id = p_boutique_id;

  -- Les rayons et leurs sous-rayons.
  for v_rayon in select * from jsonb_array_elements(v_def -> 'rayons') loop
    v_pos := v_pos + 1;
    insert into public.categories (boutique_id, slug, nom_fr, position)
    values (p_boutique_id, v_rayon ->> 'slug', v_rayon ->> 'nom', v_pos)
    returning id into v_parent;
    v_n_rayons := v_n_rayons + 1;
    v_pos_enf := 0;
    for v_enfant in select * from jsonb_array_elements(coalesce(v_rayon -> 'enfants', '[]'::jsonb)) loop
      v_pos_enf := v_pos_enf + 1;
      insert into public.categories (boutique_id, parent_id, slug, nom_fr, position)
      values (p_boutique_id, v_parent, v_enfant ->> 'slug', v_enfant ->> 'nom', v_pos_enf);
      v_n_rayons := v_n_rayons + 1;
    end loop;
  end loop;

  -- Les caractéristiques, chacune sur ses rayons (aucun : tout le catalogue).
  v_pos := 0;
  for v_attr in select * from jsonb_array_elements(coalesce(v_def -> 'attributs', '[]'::jsonb)) loop
    v_pos := v_pos + 1;
    insert into public.attributs (boutique_id, cle, label_fr, unite, type, filtrable, en_carte, position)
    values (p_boutique_id, v_attr ->> 'cle', v_attr ->> 'label', v_attr ->> 'unite', coalesce(v_attr ->> 'type', 'texte'),
            coalesce((v_attr ->> 'filtrable')::boolean, true), coalesce((v_attr ->> 'en_carte')::boolean, false), v_pos)
    returning id into v_attr_id;
    v_n_attrs := v_n_attrs + 1;
    insert into public.rayon_attributs (boutique_id, categorie_id, attribut_id)
    select p_boutique_id, c.id, v_attr_id
      from jsonb_array_elements_text(coalesce(v_attr -> 'rayons', '[]'::jsonb)) s(slug)
      join public.categories c on c.boutique_id = p_boutique_id and c.slug = s.slug and c.parent_id is null;
  end loop;

  -- Les réglages : seulement ceux que la boutique n'a pas encore réglés.
  for v_reglage in select * from jsonb_each(coalesce(v_def -> 'reglages', '{}'::jsonb)) loop
    insert into public.reglages (boutique_id, cle, valeur)
    select p_boutique_id, v_reglage.key, v_reglage.value
     where exists (select 1 from plateforme.reglages_catalogue rc where rc.cle = v_reglage.key)
    on conflict (boutique_id, cle) do nothing;
    if found then v_n_regl := v_n_regl + 1; end if;
  end loop;

  perform private.console_trace(p_acteur, p_boutique_id, 'boutique.metier', p_metier, null,
    jsonb_build_object('rayons', v_n_rayons, 'caracteristiques', v_n_attrs, 'reglages', v_n_regl, 'gabarit', v_def ->> 'theme'));
  return jsonb_build_object('rayons', v_n_rayons, 'caracteristiques', v_n_attrs, 'reglages', v_n_regl, 'gabarit', v_def ->> 'theme');
end;
$$;

revoke execute on function public.console_metiers(uuid), public.console_metier_possible(uuid, uuid),
                           public.console_appliquer_metier(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.console_metiers(uuid), public.console_metier_possible(uuid, uuid),
                           public.console_appliquer_metier(uuid, uuid, text) to service_role;
