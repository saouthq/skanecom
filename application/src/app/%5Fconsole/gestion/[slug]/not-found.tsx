"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone, type NomIcone } from "@/components/console/Icone";

/* ============================================================================
   UN ÉCRAN DU BACKOFFICE QUI N'EXISTE PAS ICI — dans la coquille de la
   boutique (le layout reste), en français. Le cas courant : l'écran d'une
   fonction coupée (Réassort sans « Prévenir du retour », Visites sans mesure
   d'audience…), atteint par un lien gardé ou la palette. Il dit laquelle, et
   où l'allumer. Sinon : une commande, un produit, un client qui n'existe
   pas, ou plus.

   Next.js ne donne pas les paramètres de la route à cette page : la boutique
   et l'écran se lisent dans l'adresse (/gestion/<boutique>/<écran>/…).
   ========================================================================== */

type Raison = { titre: string; texte: string; icone: NomIcone; lien?: { libelle: string; chemin: string } };

const PAR_REGLAGE = (fonction: string, groupe: string, ou: string): Pick<Raison, "texte" | "lien"> => ({
  texte: `Cet écran montre « ${fonction} », coupé pour votre boutique. Il s'allume dans Réglages → ${ou} ; l'écran revient aussitôt.`,
  lien: { libelle: `Réglages → ${ou}`, chemin: `reglages/${groupe}` },
});
const PAR_MODULE = (module: string): Pick<Raison, "texte"> => ({
  texte: `« ${module} » est un module : SkanEcom l'ouvre pour votre boutique, sur demande. Tant qu'il est fermé, cet écran n'a rien à montrer.`,
});

const ECRANS: Record<string, Raison> = {
  reassort: { titre: "Réassort : fonction coupée", icone: "cloche", ...PAR_REGLAGE("Prévenir du retour d'une pièce épuisée", "vitrine", "Fonctions de la vitrine") },
  visites: { titre: "Visites : fonction coupée", icone: "graphique", ...PAR_REGLAGE("Mesure d'audience", "vitrine", "Fonctions de la vitrine") },
  lettre: { titre: "Lettre d'information : fonction coupée", icone: "courriel", ...PAR_REGLAGE("Lettre d'information", "vitrine", "Fonctions de la vitrine") },
  paniers: { titre: "Paniers : fonction coupée", icone: "panier", ...PAR_REGLAGE("Relance des paniers", "commandes", "Commandes") },
  promotions: { titre: "Promotions : module fermé", icone: "etiquette", ...PAR_MODULE("Promotions") },
  devis: { titre: "Devis : module fermé", icone: "fichier", ...PAR_MODULE("Devis") },
  sav: { titre: "Service après-vente : module fermé", icone: "outil", ...PAR_MODULE("Service après-vente") },
  avis: { titre: "Avis clients : module fermé", icone: "etoile", ...PAR_MODULE("Avis clients") },
  skanfact: { titre: "SkanFact : module fermé", icone: "billet", ...PAR_MODULE("SkanFact") },
};
const FICHES: Record<string, Raison> = {
  commandes: { titre: "Commande introuvable", icone: "commandes", texte: "Ce numéro ne correspond à aucune commande de votre boutique.", lien: { libelle: "Les commandes", chemin: "commandes" } },
  produits: { titre: "Produit introuvable", icone: "colis", texte: "Ce produit n'existe pas, ou plus, dans votre catalogue.", lien: { libelle: "Le catalogue", chemin: "produits" } },
  clients: { titre: "Client introuvable", icone: "personne", texte: "Ce client n'existe pas dans votre boutique.", lien: { libelle: "Les clients", chemin: "clients" } },
};

function raisonDe(chemin: string): { base: string; raison: Raison } {
  const [, gestion, boutique, ecran, suite] = chemin.split("/");
  const base = gestion === "gestion" && boutique ? `/gestion/${boutique}` : "/gestion";
  // Les comptes pros : un module, sous Clients.
  if (ecran === "clients" && suite === "pros") return { base, raison: { titre: "Comptes professionnels : module fermé", icone: "personne", ...PAR_MODULE("Comptes professionnels") } };
  const raison = (suite ? FICHES[ecran] : undefined) ?? ECRANS[ecran] ?? {
    titre: "Cet écran n'existe pas ici",
    icone: "question",
    texte: "L'adresse a peut-être changé, ou l'écran n'est pas ouvert pour votre boutique. Tout le backoffice reste à portée, dans le menu.",
  };
  return { base, raison };
}

export default function EcranIntrouvable() {
  const { base, raison } = raisonDe(usePathname() ?? "");
  return (
    <>
      <EnTetePage titre={raison.titre} />
      <div className="vide introuvable-bo">
        <span className="vide-icone"><Icone nom={raison.icone} taille={20} /></span>
        <strong>Rien à montrer ici</strong>
        <p>{raison.texte}</p>
        <div className="introuvable-bo-actions">
          {raison.lien ? (
            <Link className="btn btn-primaire" href={`${base}/${raison.lien.chemin}`}>
              {raison.lien.libelle} <Icone nom="droite" />
            </Link>
          ) : null}
          <Link className={raison.lien ? "btn btn-second" : "btn btn-primaire"} href={`${base}/aujourdhui`}>
            Revenir à Aujourd&apos;hui
          </Link>
        </div>
      </div>
    </>
  );
}
