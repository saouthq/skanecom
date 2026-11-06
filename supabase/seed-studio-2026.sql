-- =====================================================================
-- SkanEcom · jeu de démonstration : ATELIER OCRE, nouvelle identité
-- =====================================================================
-- Atelier Ocre (supabase/seed-studio.sql) passe à l'identité claire du
-- Studio, refait en novembre 2026 : un fond presque blanc, des surfaces
-- blanches, des filets fins, l'ocre en accent seulement ; des coins
-- arrondis, des cartes au cadre, des titres amples, des apparitions
-- sobres (plus d'animations « expressives »). Les titres ne sont plus
-- coupés à la main : ils s'équilibrent seuls sur deux lignes.
--
-- Contrastes (sur le fond #FCFCFB) : encre 18,4:1, encre_doux 5,5:1,
-- accent 5,5:1 ; le contour des champs, sur la carte blanche du
-- formulaire, 3,0:1 (WCAG 1.4.11).
--
-- Un fichier à part : l'aperçu en ligne joue chaque jeu une fois, par son
-- nom (supabase/functions/apercu-installer) ; modifier seed-studio.sql ne
-- changerait rien en ligne. Rejouable sans dommage ; sans effet si la
-- boutique n'existe pas.
-- =====================================================================

do $$
declare
  b constant uuid := '00000000-0000-4000-8000-000000000006';
begin
  if not exists (select 1 from plateforme.boutiques where id = b) then
    return;
  end if;

  update public.themes set
    couleurs = '{"fond": "#FCFCFB", "surface": "#FFFFFF", "surface_2": "#F5F4F1", "filet": "#EAE7E2", "filet_fort": "#DBD6CE", "contour_champ": "#9A9389",
                 "encre": "#121110", "encre_doux": "#6B6660", "accent": "#A0522D", "accent_clair": "#EDB892"}',
    polices = '{"titres": "instrument-sans", "texte": "instrument-sans"}',
    style = '{"coins": "arrondis", "boutons": "pilule", "cartes": "cadre", "photos": "4-5", "titres": "ample", "densite": "normale", "animations": "oui"}',
    sections = $j$[
      {"type": "hero", "lien": "/catalogue",
       "textes": {"etiquette_fr": "Architecture d'intérieur · Tunis",
                  "titre_fr": "Des lieux qui vous ressemblent.",
                  "chapo_fr": "Appartements, villas, cafés, hôtels : nous dessinons des intérieurs lumineux et durables, faits pour la vie d'ici.",
                  "cta_fr": "Voir les réalisations",
                  "image_alt_fr": "Un salon en contrebas, une longue baie vitrée et des plantes"},
       "image": {"chemin": "atelier-ocre/accueil/ouverture-2400.webp", "chemin_portrait": "atelier-ocre/accueil/ouverture-portrait-1200.webp"}},
      {"type": "texte",
       "textes": {"etiquette_fr": "Le studio",
                  "texte_fr": "Nous partons de la lumière, des matières et de vos habitudes. Chaque projet se dessine à la main, se construit avec des artisans tunisiens, et se livre prêt à vivre."}},
      {"type": "selection", "nombre": 6, "textes": {"etiquette_fr": "Sélection", "titre_fr": "Réalisations choisies"}},
      {"type": "rayons", "textes": {"etiquette_fr": "Domaines", "titre_fr": "Ce que nous dessinons"}},
      {"type": "services", "lien": "/contact",
       "textes": {"etiquette_fr": "Ce que nous faisons",
                  "titre_fr": "Du premier croquis à la remise des clés.",
                  "chapo_fr": "Un seul interlocuteur, de l'idée au chantier : vous savez toujours où en est votre projet.",
                  "s1_titre_fr": "Architecture d'intérieur", "s1_texte_fr": "Plans, volumes, lumière, matières : un projet complet, dessiné pour votre lieu et votre budget.",
                  "s2_titre_fr": "Rénovation complète", "s2_texte_fr": "Nous coordonnons les corps de métier et suivons le chantier chaque semaine, jusqu'aux finitions.",
                  "s3_titre_fr": "Mobilier sur mesure", "s3_texte_fr": "Cuisines, bibliothèques, dressings : dessinés au millimètre, fabriqués par des ateliers d'ici.",
                  "s4_titre_fr": "Conseil et décoration", "s4_texte_fr": "Une visite, des choix de couleurs, de luminaires et de meubles, pour transformer sans tout refaire.",
                  "cta_fr": "Parlons de votre projet",
                  "image_alt_fr": "Une table ronde en bois sous des suspensions blanches"},
       "image": {"chemin": "atelier-ocre/accueil/services-1200.webp"}},
      {"type": "etapes",
       "textes": {"etiquette_fr": "Comment nous travaillons", "titre_fr": "Une méthode en quatre temps.",
                  "e1_titre_fr": "La rencontre", "e1_texte_fr": "Une première visite, sans engagement : vos envies, vos contraintes, votre budget.",
                  "e2_titre_fr": "L'esquisse", "e2_texte_fr": "Plans, planches d'ambiance et premières matières, à valider ensemble.",
                  "e3_titre_fr": "Le projet", "e3_texte_fr": "Plans détaillés, choix définitifs, devis des artisans : tout est chiffré avant de commencer.",
                  "e4_titre_fr": "Le chantier", "e4_texte_fr": "Nous suivons les travaux chaque semaine, jusqu'à la remise des clés."}},
      {"type": "editorial", "lien": "/le-studio",
       "textes": {"etiquette_fr": "L'atelier",
                  "titre_fr": "Dessiné à Tunis, fait par des mains d'ici.",
                  "texte_fr": "Menuisiers, ferronniers, céramistes : nous travaillons avec des artisans tunisiens que nous connaissons depuis des années. Chaque pièce sur mesure est suivie de l'atelier jusqu'à chez vous.",
                  "cta_fr": "Découvrir le studio",
                  "image_alt_fr": "Une salle voûtée blanche, une fenêtre ouverte sur la lumière"},
       "image": {"chemin": "atelier-ocre/accueil/recit-1200.webp"}},
      {"type": "contact",
       "textes": {"etiquette_fr": "Un projet ?", "titre_fr": "Parlons de votre projet.",
                  "chapo_fr": "Racontez-nous votre lieu et vos envies : nous vous rappelons pour fixer une première visite."}}
    ]$j$
  where boutique_id = b;
end
$$;
