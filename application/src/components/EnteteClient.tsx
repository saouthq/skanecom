"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "./Icones";
import { Tiroir } from "./Tiroir";
import { t } from "@/lib/i18n";

/* ============================================================================
   LES MORCEAUX VIVANTS DE L'EN-TÊTE

   · EnteteDefilant — gabarit éditorial : sur l'accueil qui s'ouvre par une
     photo pleine page, l'en-tête est posé SUR la photo (transparent, texte
     clair) ; il redevient opaque dès qu'on défile, qu'on le survole ou qu'on
     y entre au clavier (editorial.css). Partout ailleurs, il est opaque.
   · MenuMobile — le menu du téléphone : un tiroir, les rayons réels.
   ========================================================================== */

function cheminVisible(brut: string | null): string {
  // Le préfixe interne /_b/<boutique> n'est jamais montré, mais on ne compte
  // pas sur le cadre pour l'avoir retiré.
  return (brut ?? "/").replace(/^\/_b\/[^/]+/, "") || "/";
}

export function EnteteDefilant({
  surImage,
  className,
  children,
}: {
  /** L'accueil s'ouvre-t-il par une photo pleine page ? */
  surImage: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const accueil = cheminVisible(usePathname()) === "/";
  const [enHaut, setEnHaut] = useState(true);

  useEffect(() => {
    const suit = () => setEnHaut(window.scrollY < 12);
    suit();
    window.addEventListener("scroll", suit, { passive: true });
    return () => window.removeEventListener("scroll", suit);
  }, []);

  return (
    <header className={className} data-sur-image={surImage && accueil ? "" : undefined} data-transparent={surImage && accueil && enHaut ? "" : undefined}>
      {children}
    </header>
  );
}

export type EntreeMenu = { cle: string; href: string; nom: string; enfants?: { cle: string; href: string; nom: string }[] };

/** Demande d'ouverture du menu (l'onglet « Rayons » du téléphone, structure Commerce). */
export const MENU_OUVRIR = "skanecom:menu-ouvrir";

export function MenuMobile({
  entrees,
  faits,
  aide = [],
  className = "",
}: {
  entrees: EntreeMenu[];
  /** Les faits de service (paiement, livraison), en bas du tiroir. */
  faits: string[];
  /** « Besoin d'aide ? » : suivre sa commande, les questions, le contact —
   *  au téléphone, le pied de page est loin (recette du 05/10). */
  aide?: { href: string; nom: string }[];
  className?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const bouton = useRef<HTMLButtonElement>(null);
  const chemin = cheminVisible(usePathname());
  const ferme = () => setOuvert(false);

  useEffect(() => {
    const ouvre = () => setOuvert(true);
    window.addEventListener(MENU_OUVRIR, ouvre);
    return () => window.removeEventListener(MENU_OUVRIR, ouvre);
  }, []);

  return (
    <>
      <button
        ref={bouton}
        type="button"
        className={`icone-btn ${className}`}
        aria-label={t.commun.ouvrirMenu}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        onClick={() => setOuvert(true)}
      >
        <Menu />
      </button>
      <Tiroir
        ouvert={ouvert}
        onFermer={ferme}
        titre={t.commun.menu}
        cote="debut"
        etiquetteFermer={t.commun.fermerMenu}
        retour={bouton}
        className="tiroir-menu"
        pied={
          faits.length > 0 ? (
            <ul className="menu-faits">
              {faits.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ) : undefined
        }
      >
        <nav aria-label={t.commun.navigationPrincipale}>
          <ul className="menu-liste">
            {entrees.map((e) => (
              <li key={e.cle}>
                <Link href={e.href} onClick={ferme} aria-current={chemin === e.href ? "page" : undefined}>
                  {e.nom}
                </Link>
                {e.enfants && e.enfants.length > 0 ? (
                  <ul className="menu-sous-liste">
                    {e.enfants.map((s) => (
                      <li key={s.cle}>
                        <Link href={s.href} onClick={ferme} aria-current={chemin === s.href ? "page" : undefined}>
                          {s.nom}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </nav>
        {aide.length > 0 ? (
          <nav className="menu-aide" aria-label={t.commun.besoinAide}>
            <p className="menu-aide-titre">{t.commun.besoinAide}</p>
            <ul>
              {aide.map((a) => (
                <li key={a.href}>
                  <Link href={a.href} onClick={ferme} aria-current={chemin === a.href ? "page" : undefined}>{a.nom}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </Tiroir>
    </>
  );
}
