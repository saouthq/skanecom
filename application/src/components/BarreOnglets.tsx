"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Coeur, Loupe, Maison, Menu, Panier as IconePanier, Personne } from "./Icones";
import { usePanier } from "@/lib/panier";
import { nombreArticles, PANIER_OUVRIR } from "@/lib/panier-contrat";
import { useFavoris } from "@/lib/favoris";
import { t } from "@/lib/i18n";
import { MENU_OUVRIR } from "./EnteteClient";

/* ============================================================================
   LA BARRE D'ONGLETS DU TÉLÉPHONE (structure Commerce) — en bas de l'écran,
   sous le pouce : l'accueil, les rayons (le menu s'ouvre), la recherche, les
   favoris ou le compte, le panier et son compte (le tiroir s'ouvre).

   Elle se retire où le bas de l'écran est déjà pris : la fiche d'un produit
   (sa barre d'achat), le tunnel de commande. Le bouton WhatsApp, le bandeau
   des pixels et la barre de comparaison se rangent au-dessus d'elle
   (commerce.css). Sur ordinateur, elle n'existe pas.
   ========================================================================== */

export function BarreOnglets({ favoris, compte }: { favoris: boolean; compte: boolean }) {
  const chemin = (usePathname() ?? "/").replace(/^\/_b\/[^/]+/, "") || "/";
  const panier = usePanier();
  const aimes = useFavoris().length;
  const n = nombreArticles(panier);
  if (chemin.startsWith("/produit/") || chemin.startsWith("/commande")) return null;

  const ici = (href: string) => (href === "/" ? chemin === "/" : chemin === href || chemin.startsWith(`${href}/`));
  return (
    <nav className="barre-onglets cache-desktop" aria-label={t.commerce.onglets}>
      <Link href="/" className="bo-onglet" aria-current={ici("/") ? "page" : undefined}>
        <Maison taille={22} /> <span>{t.commerce.accueil}</span>
      </Link>
      <button type="button" className="bo-onglet" aria-haspopup="dialog"
        aria-current={ici("/catalogue") || chemin.startsWith("/categorie/") ? "page" : undefined}
        onClick={() => window.dispatchEvent(new CustomEvent(MENU_OUVRIR))}>
        <Menu taille={22} /> <span>{t.commerce.rayons}</span>
      </button>
      <Link href="/recherche" className="bo-onglet" aria-current={ici("/recherche") ? "page" : undefined}>
        <Loupe taille={22} /> <span>{t.commerce.rechercher}</span>
      </Link>
      {favoris ? (
        <Link href="/favoris" className="bo-onglet" aria-current={ici("/favoris") ? "page" : undefined} aria-label={t.favoris.lienAria(aimes)}>
          <Coeur taille={22} /> <span aria-hidden="true">{t.commerce.favoris}</span>
          {aimes ? <span className="bo-pastille" aria-hidden="true">{aimes}</span> : null}
        </Link>
      ) : compte ? (
        <Link href="/compte" className="bo-onglet" aria-current={ici("/compte") ? "page" : undefined}>
          <Personne taille={22} /> <span>{t.commerce.compte}</span>
        </Link>
      ) : null}
      <button type="button" className="bo-onglet" aria-haspopup="dialog" aria-label={t.commerce.panierAria(n)}
        onClick={() => window.dispatchEvent(new CustomEvent(PANIER_OUVRIR))}>
        <IconePanier taille={22} /> <span aria-hidden="true">{t.commerce.panier}</span>
        {n ? <span className="bo-pastille" aria-hidden="true">{n}</span> : null}
      </button>
    </nav>
  );
}
