"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camion, Coeur, Fleche, LogoWhatsApp, Loupe, Menu, Personne, Telephone } from "./Icones";
import { Tiroir } from "./Tiroir";
import { urlFichier } from "@/lib/photos";
import { t } from "@/lib/i18n";

/* ============================================================================
   LES MORCEAUX VIVANTS DE L'EN-TÊTE

   · EnteteDefilant — gabarit éditorial : sur l'accueil qui s'ouvre par une
     photo pleine page, l'en-tête est posé SUR la photo (transparent, texte
     clair) ; il redevient opaque dès qu'on défile, qu'on le survole ou qu'on
     y entre au clavier (editorial.css). Partout ailleurs, il est opaque.
   · MenuMobile — le menu du téléphone : plein écran, il descend comme un
     rideau. La recherche d'abord, puis les rayons en grand, avec leur photo
     et leur nombre de pièces (les sous-rayons en pastilles), les raccourcis
     (commandes, favoris, suivi, WhatsApp), l'aide et ce que la boutique
     promet. Chaque bloc entre à son tour (sauf mouvement réduit).
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

export type EntreeMenu = {
  cle: string;
  href: string;
  nom: string;
  /** Sa photo (celle du rayon, sinon d'un sous-rayon) et ses pièces. */
  image?: string | null;
  compte?: number;
  enfants?: { cle: string; href: string; nom: string }[];
};

/** Un raccourci du menu : une tuile, son icône, son lien (WhatsApp, le téléphone : externes). */
export type RaccourciMenu = { cle: string; href: string; nom: string; icone: "compte" | "favoris" | "suivi" | "whatsapp" | "contact"; externe?: boolean };

const ICONES_RACCOURCI = { compte: Personne, favoris: Coeur, suivi: Camion, whatsapp: LogoWhatsApp, contact: Telephone } as const;

/** Demande d'ouverture du menu (l'onglet « Rayons » du téléphone, structure Commerce). */
export const MENU_OUVRIR = "skanecom:menu-ouvrir";

export function MenuMobile({
  marque,
  entrees,
  raccourcis = [],
  faits,
  aide = [],
  className = "",
}: {
  /** Le logo de la boutique (ou son nom), en tête du menu, comme dans l'en-tête de la page. */
  marque: React.ReactNode;
  /** Les rayons garnis. */
  entrees: EntreeMenu[];
  /** Commandes, favoris, suivi, WhatsApp : en tuiles. */
  raccourcis?: RaccourciMenu[];
  /** Les faits de service (paiement, livraison), au bas du menu. */
  faits: string[];
  /** « Besoin d'aide ? » : les pages, le contact, la garantie — au téléphone,
   *  le pied de page est loin (recette du 05/10). */
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

  // Chaque bloc entre à son tour : son rang, en variable CSS.
  let rang = 0;
  const suivant = () => ({ "--i": rang++ }) as React.CSSProperties;

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
        entete={<div className="menu-marque">{marque}</div>}
      >
        <form className="menu-recherche" action="/recherche" role="search" style={suivant()} onSubmit={() => ferme()}>
          <Loupe taille={18} />
          <input type="search" name="q" placeholder={t.menu.rechercher} aria-label={t.menu.rechercher} enterKeyHint="search" autoComplete="off" />
        </form>

        <nav aria-label={t.commun.navigationPrincipale} className="menu-nav">
          <p className="menu-sur-titre" style={suivant()}>{t.menu.rayons}</p>
          <ul className="menu-rayons">
            {entrees.map((e) => (
              <li key={e.cle} style={suivant()}>
                <Link className="menu-rayon" href={e.href} onClick={ferme} aria-current={chemin === e.href ? "page" : undefined}>
                  <span className="menu-rayon-nom">
                    {e.nom}
                    {e.compte ? <span className="menu-rayon-compte">{t.menu.pieces(e.compte)}</span> : null}
                  </span>
                  {e.image ? (
                    <span className="menu-rayon-image" aria-hidden="true">
                      <Image src={urlFichier(e.image)} alt="" fill sizes="64px" />
                    </span>
                  ) : (
                    <Fleche taille={20} className="menu-rayon-fleche rtl:-scale-x-100" />
                  )}
                </Link>
                {e.enfants && e.enfants.length > 0 ? (
                  <ul className="menu-sous-rayons">
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
          <Link className="menu-tout" href="/catalogue" onClick={ferme} style={suivant()} aria-current={chemin === "/catalogue" ? "page" : undefined}>
            <span>{t.commun.toutLeCatalogue}</span>
            <Fleche taille={18} className="rtl:-scale-x-100" />
          </Link>
        </nav>

        {raccourcis.length > 0 ? (
          <ul className="menu-raccourcis" style={suivant()}>
            {raccourcis.map((r) => {
              const Icone = ICONES_RACCOURCI[r.icone];
              return (
                <li key={r.cle}>
                  {r.externe ? (
                    <a href={r.href} {...(r.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})} data-raccourci={r.icone}>
                      <Icone taille={20} />
                      <span>{r.nom}</span>
                    </a>
                  ) : (
                    <Link href={r.href} onClick={ferme} aria-current={chemin === r.href ? "page" : undefined} data-raccourci={r.icone}>
                      <Icone taille={20} />
                      <span>{r.nom}</span>
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}

        {aide.length > 0 ? (
          <nav className="menu-aide" aria-label={t.commun.besoinAide} style={suivant()}>
            <p className="menu-sur-titre">{t.commun.besoinAide}</p>
            <ul>
              {aide.map((a) => (
                <li key={a.href}>
                  <Link href={a.href} onClick={ferme} aria-current={chemin === a.href ? "page" : undefined}>{a.nom}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {faits.length > 0 ? (
          <ul className="menu-faits" style={suivant()}>
            {faits.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        ) : null}
      </Tiroir>
    </>
  );
}
