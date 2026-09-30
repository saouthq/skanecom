-- =====================================================================
-- SkanEcom · jeu de démonstration, SUITE (feuille de route B, 30/09/2026)
-- =====================================================================
-- Ce que les boutiques de démonstration racontent en dehors du catalogue :
-- leurs pages (À propos, questions fréquentes, guide des tailles…), leurs
-- réseaux, leurs horaires, leurs moyens de contact, le bouton WhatsApp.
--
-- Un fichier à part de seed.sql : l'aperçu en ligne joue chaque jeu UNE
-- fois (supabase/functions/apercu-installer) ; celui-ci s'ajoute au
-- premier. Rejouable sans dommage (on conflict).
--
-- Maison Selma et la Quincaillerie du Sud sont imaginaires : leurs
-- coordonnées aussi (numéros en 70 000 0xx, domaine exemple.tn). Maymar est
-- une vraie boutique : rien n'est inventé sur elle — sa page de questions
-- ne dit que ce que ses réglages et la plateforme font vraiment.
-- =====================================================================

insert into public.reglages (boutique_id, cle, valeur) values
  -- Quincaillerie du Sud (gabarit technique)
  ('00000000-0000-4000-8000-000000000002', 'contact.telephone',          '"+216 70 000 002"'),
  ('00000000-0000-4000-8000-000000000002', 'legal.email',                '"contact@quincaillerie-du-sud.exemple.tn"'),
  ('00000000-0000-4000-8000-000000000002', 'contact.horaires',           '"Du lundi au samedi, de 8 h à 18 h ; le vendredi jusqu''à 12 h 30"'),
  ('00000000-0000-4000-8000-000000000002', 'contact.facebook',           '"quincaillerie.du.sud"'),
  ('00000000-0000-4000-8000-000000000002', 'contact.instagram',          '"@quincaillerie.du.sud"'),
  ('00000000-0000-4000-8000-000000000002', 'vitrine.whatsapp_flottant',  'true'),
  -- Maison Selma (gabarit éditorial)
  ('00000000-0000-4000-8000-000000000003', 'contact.telephone',          '"+216 70 000 003"'),
  ('00000000-0000-4000-8000-000000000003', 'contact.whatsapp',           '"21670000003"'),
  ('00000000-0000-4000-8000-000000000003', 'legal.email',                '"bonjour@maison-selma.exemple.tn"'),
  ('00000000-0000-4000-8000-000000000003', 'contact.horaires',           '"Du lundi au samedi, de 10 h à 19 h"'),
  ('00000000-0000-4000-8000-000000000003', 'contact.instagram',          '"@maison.selma"'),
  ('00000000-0000-4000-8000-000000000003', 'contact.tiktok',             '"@maison.selma"'),
  ('00000000-0000-4000-8000-000000000003', 'vitrine.whatsapp_flottant',  'true'),
  ('00000000-0000-4000-8000-000000000003', 'vitrine.annonce',            '"Le lin d''été est arrivé : robes, chemises et pantalons"')
on conflict (boutique_id, cle) do update set valeur = excluded.valeur;


-- ---------------------------------------------------------------------
-- Les pages
-- ---------------------------------------------------------------------
insert into public.pages_boutique (boutique_id, slug, genre, titre_fr, corps_fr, publie, dans_pied, position) values

-- Maison Selma ----------------------------------------------------------
('00000000-0000-4000-8000-000000000003', 'a-propos', 'texte', 'À propos',
$t$Maison Selma dessine des vêtements simples et bien coupés, dans des matières qu'on a envie de toucher : le lin, la popeline de coton, le mérinos.

## Une petite maison, à Tunis
Tout a commencé autour d'une table de coupe et de quelques rouleaux de lin. Aujourd'hui encore, chaque modèle est essayé, retouché, puis porté plusieurs semaines avant d'entrer dans la collection. Nous préférons dix pièces justes à cent pièces vite oubliées.

## Ce qui compte pour nous
- **Les matières** : naturelles d'abord, choisies pour durer et se patiner joliment.
- **La coupe** : des volumes aisés, des longueurs pensées pour la vie de tous les jours.
- **Le conseil** : une question sur une taille, une couleur, un entretien ? Écrivez-nous, une vraie personne vous répond.

## Commander chez nous
Vous payez à la livraison, partout en Tunisie, et vous pouvez refuser le colis s'il ne vous convient pas. La livraison est offerte dès 250 TND d'achat. Le détail : [livraison et échanges](/questions-frequentes).$t$,
 true, true, 1),

('00000000-0000-4000-8000-000000000003', 'guide-des-tailles', 'texte', 'Guide des tailles',
$t$Nos tailles suivent les tailles françaises. Mesurez-vous en sous-vêtements, le mètre ruban bien à plat, sans serrer.

## Hauts, robes et vestes
- **36** : tour de poitrine 84 cm, tour de taille 66 cm, tour de hanches 92 cm
- **38** : tour de poitrine 88 cm, tour de taille 70 cm, tour de hanches 96 cm
- **40** : tour de poitrine 92 cm, tour de taille 74 cm, tour de hanches 100 cm
- **42** : tour de poitrine 96 cm, tour de taille 78 cm, tour de hanches 104 cm
- **44** : tour de poitrine 102 cm, tour de taille 84 cm, tour de hanches 110 cm

## Entre deux tailles ?
Pour les coupes amples (chemises en lin, robes longues), prenez la plus petite. Pour les coupes ajustées et la maille, la plus grande.

## Toujours un doute
Écrivez-nous avec vos mesures et le modèle qui vous plaît : nous vous répondons avec la taille qui vous ira. Et si elle ne vous va pas, l'échange est simple — voir les [questions fréquentes](/questions-frequentes).$t$,
 true, true, 2),

('00000000-0000-4000-8000-000000000003', 'questions-frequentes', 'questions', 'Questions fréquentes',
$t$Les réponses aux questions qu'on nous pose le plus. Une autre question ? Écrivez-nous.

### Comment payer ?
À la livraison, en espèces, au livreur. Rien n'est à payer en ligne.

### Combien coûte la livraison ?
7 TND partout en Tunisie, offerte dès 250 TND d'achat. Votre commande arrive en 1 à 4 jours ouvrés.

### Puis-je refuser le colis ?
Oui. S'il ne vous convient pas, refusez-le au livreur : vous ne payez rien.

### La taille ne me va pas : puis-je échanger ?
Oui, sous 14 jours après la réception, article non porté et étiqueté. Écrivez-nous : nous organisons l'échange. Pour choisir la bonne taille du premier coup : le [guide des tailles](/guide-des-tailles).

### Comment suivre ma commande ?
Avec son numéro et votre téléphone, sur la page [Suivre ma commande](/suivi) — sans compte.

### Comment entretenir le lin ?
Lavage à 30 °C, à l'envers, sans essorage fort. Séchez à plat ou sur cintre, repassez légèrement humide : le lin aime vivre, ses plis font partie de son charme.$t$,
 true, true, 3),

-- Quincaillerie du Sud --------------------------------------------------
('00000000-0000-4000-8000-000000000002', 'questions-frequentes', 'questions', 'Questions fréquentes',
$t$Ce que nos clients, artisans et particuliers, nous demandent le plus souvent.

### Puis-je retirer ma commande au magasin ?
Oui, gratuitement, au magasin de Sfax (Route de Tunis, km 3) : elle est prête en 2 heures. Nous vous appelons dès qu'elle vous attend.

### La livraison est-elle offerte ?
Dès 500 TND d'achat, partout en Tunisie.

### Comment payer ?
À la livraison, en espèces, ou au comptoir si vous retirez au magasin.

### Mes outils sont-ils garantis ?
Oui, 12 mois. Un souci ? Signalez-le depuis « Mes commandes » : nous vous rappelons. Le détail : [Garantie et SAV](/garantie-et-sav).

### Je suis artisan ou entreprise : avez-vous des prix professionnels ?
Oui. Demandez votre compte professionnel depuis votre compte client : une fois validé, vous voyez vos prix sur tout le catalogue. Pour une grosse quantité, demandez un devis depuis le panier.

### Je ne sais pas quel modèle choisir.
Écrivez-nous sur WhatsApp avec votre chantier : un vendeur du magasin vous conseille, photo à l'appui si besoin.

### Comment suivre ma commande ?
Avec son numéro et votre téléphone, sur la page [Suivre ma commande](/suivi).$t$,
 true, true, 1),

('00000000-0000-4000-8000-000000000002', 'a-propos', 'texte', 'Le magasin',
$t$La Quincaillerie du Sud, c'est un comptoir à Sfax, des rayons pleins et des vendeurs qui connaissent leurs outils.

## Du bon outil au bon prix
Outillage électroportatif, visserie, protection : nous choisissons des références que nos clients artisans utilisent tous les jours, et nous gardons du stock pour que le chantier ne s'arrête pas.

## Au magasin ou chez vous
- **Retrait en 2 heures** au magasin, Route de Tunis, km 3, du lundi au samedi.
- **Livraison partout en Tunisie**, payée à la livraison, offerte dès 500 TND.
- **Des prix professionnels** pour les artisans et les entreprises, sur demande.

## Un conseil ?
Appelez-nous ou écrivez-nous sur WhatsApp : dites-nous ce que vous voulez faire, nous vous dirons avec quoi. Toutes nos coordonnées : [contact](/contact).$t$,
 true, true, 2),

-- Maymar : ce que ses réglages et la plateforme font vraiment -----------
('00000000-0000-4000-8000-000000000001', 'questions-frequentes', 'questions', 'Questions fréquentes',
$t$### Comment payer ?
À la livraison, en espèces, au livreur. Rien n'est à payer en ligne.

### Vous m'appelez avant d'expédier ?
Oui : nous vous appelons pour confirmer la commande et l'adresse avant de l'expédier.

### Quels sont les délais et les frais de livraison ?
- **Grand Tunis** : 1 à 2 jours, 6 TND
- **Nord et Sahel** : 2 à 3 jours, 8 TND
- **Centre et Sud** : 3 à 5 jours, 10 TND

### Puis-je refuser le colis ?
Oui. S'il ne vous convient pas, refusez-le au livreur : vous ne payez rien.

### Mes articles sont-ils garantis ?
Oui, 24 mois. Un souci ? Signalez-le depuis « Mes commandes » : nous vous rappelons. Le détail : [Garantie et SAV](/garantie-et-sav).

### Comment suivre ma commande ?
Avec son numéro et votre téléphone, sur la page [Suivre ma commande](/suivi) — sans compte.$t$,
 true, true, 1)

on conflict (boutique_id, slug) do nothing;
