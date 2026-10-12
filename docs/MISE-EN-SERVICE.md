# La mise en service d'une boutique — le jour J

Répété le 12/10/2026 sur une plateforme **vide** (`outils/base-locale.sh reinit --vide` :
les migrations seules, aucune boutique de démonstration), de la console à la première
commande : tout ce qui suit a été fait pour de vrai, dans cet ordre. Compter une heure,
le catalogue et les photos étant prêts.

## Ce qui doit exister avant (hors code)

| Quoi | Où | Pour |
| --- | --- | --- |
| Projet Supabase de production | organisation SkanEcom, région eu-west-3 | la base, l'authentification |
| Compte Cloudflare + jeton (Workers, R2, Workers AI) | secrets GitHub, jamais dans le dépôt | l'application, les photos, le studio et la rédaction |
| Le domaine de la boutique (`maymar.tn`) | registrar tunisien agréé | l'adresse de la vitrine |
| Les SMS : `SMS_ENVOI` = `twilio:<compte>:<jeton>:<expéditeur>` | secret du Worker | le code de l'acheteur à la commande ; sans lui, Réglages → Commandes → vérification par e-mail |
| Les e-mails : `COURRIELS_ENVOI` = `resend:<clé>:<adresse>` ou `brevo:<clé>:<adresse>` | secret du Worker, domaine vérifié chez le fournisseur | invitations, suivi des commandes, codes par e-mail |

Le reste du déploiement : `docs/DEPLOIEMENT.md` (premier `vinext-cloudflare deploy`, puis le
déploiement en deux temps).

## Le jour J, dans l'ordre

1. **Console → Nouvelle boutique.** Le nom ; « Il a déjà son domaine » (`www.maymar.tn`) ;
   le métier **Bagages et voyage** (il pose les rayons Valises cabine, Valises soute, Sacs de
   voyage, Sacs à dos, Accessoires de voyage, les caractéristiques Volume, Poids, Dimensions,
   Roues, et l'accueil) ; la formule ; les modules (avis, conseil WhatsApp, SAV, studio photo,
   rédaction). **Ne pas** cocher « Boutique de démonstration ». Elle naît « en préparation ».
2. **Catalogue → importer** le fichier rempli (modèle : `docs/mise-en-service/`). Le rapport
   montre chaque ligne, les rayons retrouvés, la fiche technique reconnue ; rien n'est écrit
   avant « Importer ». Le métier doit être posé **avant** : sans lui, les colonnes Volume,
   Dimensions, Roues deviendraient des axes de variante (le rapport le montrerait).
3. **Catalogue → photos** : déposer le dossier, photos nommées par référence
   (`VAL55-NOIR.jpg`, `VAL55-NOIR-2.jpg`…) ; elles se rangent seules.
4. **Équipe → inviter le propriétaire** (le rôle Propriétaire est coché d'office tant que la
   boutique n'en a pas) ; envoyer le lien par WhatsApp. Il sert une fois, 24 heures.
5. **Le propriétaire**, sur son téléphone : le lien → son mot de passe → la double
   authentification → le backoffice. Le bandeau « en préparation » mène à **Réglages**, qui
   liste ce qui manque avant d'ouvrir : informations légales, un numéro (WhatsApp ou
   téléphone), la livraison.
6. **Console → Ouvrir la boutique.** La vitrine est servie aussitôt.
7. **Une vraie commande** depuis un téléphone (code SMS, adresse, paiement à la livraison) :
   elle arrive dans le backoffice, « À confirmer ».

## Ce que la répétition a corrigé

- L'invitation cochait « Confirmation » par défaut, même pour le premier membre ; après
  « Inviter », la carte du lien restait hors de vue.
- Le backoffice d'une boutique pas encore ouverte ne le disait nulle part (le bandeau).
- La console écrivait « 1 étapes sur 10 ».
- Un coloris nommé librement (« Bleu nuit ») prenait la pastille neutre : les teintes
  courantes des bagages sont ajoutées, et un nom inconnu garde sa teinte de base
  (« bleu nuit mat » → bleu nuit, « vert olive foncé » → vert olive).
- L'import acceptait quatre niveaux de rayons et tronquait au-delà ; il en accepte trois,
  comme le backoffice, et le dit ligne par ligne.
