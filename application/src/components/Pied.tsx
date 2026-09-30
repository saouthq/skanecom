import Link from "next/link";
import { Logo } from "./Entete";
import { Billets, Bouclier, Bulle, Camion, Facebook, Instagram, LogoWhatsApp, Magasin, Retour, TikTok } from "./Icones";
import { champ, t } from "@/lib/i18n";
import { texte } from "@/lib/theme";
import { lienConseil } from "@/lib/faits";
import { aUnContact, contactDe } from "@/lib/contact";
import { PAGES_LEGALES } from "@/lib/legal";
import type { Cadre } from "@/lib/boutique";

const ICONES_RESEAU = { instagram: Instagram, facebook: Facebook, tiktok: TikTok };
const NOMS_RESEAU = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" };

/** La boutique elle-même : ses pages (celles qu'elle met au pied), le
 *  contact s'il y en a un, le suivi d'une commande, la garantie. */
function ListeBoutique({ cadre }: { cadre: Cadre }) {
  const pages = cadre.pages.filter((p) => p.dans_pied);
  return (
    <ul>
      {pages.map((p) => (
        <li key={p.slug}>
          <Link href={`/${p.slug}`}>{champ(p, "titre")}</Link>
        </li>
      ))}
      {aUnContact(contactDe(cadre)) ? (
        <li>
          <Link href="/contact">{t.pied.contact}</Link>
        </li>
      ) : null}
      <li>
        <Link href="/suivi">{t.pied.suivreCommande}</Link>
      </li>
      {cadre.sav ? (
        <li>
          <Link href="/garantie-et-sav">{t.sav.lienPied}</Link>
        </li>
      ) : null}
    </ul>
  );
}

/** Les réseaux de la boutique, et WhatsApp : des pastilles rondes. */
function Reseaux({ cadre, classe }: { cadre: Cadre; classe: string }) {
  if (cadre.reseaux.length === 0 && !cadre.whatsapp) return null;
  return (
    <ul className={classe} aria-label={t.pied.reseaux}>
      {cadre.reseaux.map((r) => {
        const Icone = ICONES_RESEAU[r.reseau];
        return (
          <li key={r.reseau}>
            <a href={r.url} target="_blank" rel="noopener noreferrer me" aria-label={t.pied.reseauAria(NOMS_RESEAU[r.reseau], r.compte)}>
              <Icone taille={18} />
            </a>
          </li>
        );
      })}
      {cadre.whatsapp ? (
        <li>
          <a href={`https://wa.me/${cadre.whatsapp}`} target="_blank" rel="noopener noreferrer" aria-label={t.contact.ecrireWhatsapp}>
            <LogoWhatsApp taille={17} />
          </a>
        </li>
      ) : null}
    </ul>
  );
}

/* ============================================================================
   PIED DE PAGE — un par gabarit.

   Deux règles tenues ici, contre l'habitude :
   1. AUCUN lien mort : chaque lien mène à une page qui existe. Les colonnes
      de service portent des FAITS, et ces faits viennent des réglages, jamais
      du code ; les pages légales (lib/legal.ts) aussi.
   2. Les rayons listés sont les rayons RÉELS de la boutique.
   ========================================================================== */

export function Pied({ cadre }: { cadre: Cadre }) {
  return cadre.theme.code === "technique" ? <PiedTechnique cadre={cadre} /> : <PiedEditorial cadre={cadre} />;
}

function ListeRayons({ cadre }: { cadre: Cadre }) {
  return (
    <ul>
      {cadre.racines.map((c) => (
        <li key={c.slug}>
          <Link href={`/categorie/${c.slug}`}>{champ(c, "nom")}</Link>
        </li>
      ))}
      <li>
        <Link href="/catalogue">{t.commun.toutLeCatalogue}</Link>
      </li>
      <li>
        <Link href="/recherche">{t.commun.rechercher}</Link>
      </li>
    </ul>
  );
}

function Droits({ cadre }: { cadre: Cadre }) {
  return (
    <>
      <span>{t.pied.droits(new Date().getFullYear(), cadre.boutique.nom, texte(cadre.theme.textes, "origine") || undefined)}</span>
      <nav className="pied-legal" aria-label={t.pied.legal}>
        {PAGES_LEGALES.map((p) => (
          <Link key={p.chemin} href={p.chemin}>{p.titre}</Link>
        ))}
      </nav>
      <span>{t.pied.devise}</span>
    </>
  );
}

function PiedEditorial({ cadre }: { cadre: Cadre }) {
  const { livraison, theme } = cadre;
  const resume = texte(theme.textes, "resume");
  const retour = texte(theme.textes, "politique_retour");
  return (
    <footer className="ed-pied mt-auto">
      <div className="enveloppe ed-pied-grille">
        <div className="ed-pied-intro">
          {resume ? <p>{resume}</p> : null}
          <Reseaux cadre={cadre} classe="pied-reseaux" />
        </div>
        <div>
          <p className="ed-pied-titre">{t.pied.catalogue}</p>
          <ListeRayons cadre={cadre} />
        </div>
        <div>
          <p className="ed-pied-titre">{t.pied.laBoutique}</p>
          <ListeBoutique cadre={cadre} />
        </div>
        <div>
          <p className="ed-pied-titre">{t.pied.commander}</p>
          <ul className="ed-pied-faits">
            {livraison.cod ? <li>{t.pied.paiementLivraison}</li> : null}
            {livraison.delai ? <li>{livraison.delai}</li> : null}
            <li>{t.produit.refusPossible}</li>
            {retour ? <li>{retour}</li> : null}
          </ul>
        </div>
      </div>
      <div className="enveloppe ed-pied-marque" aria-hidden="true">
        <Logo cadre={cadre} className="marque-geante" />
      </div>
      <div className="enveloppe ed-pied-bas">
        <Droits cadre={cadre} />
      </div>
    </footer>
  );
}

function PiedTechnique({ cadre }: { cadre: Cadre }) {
  const { livraison, theme } = cadre;
  const resume = texte(theme.textes, "resume");
  const conseil = lienConseil(cadre);
  const services = [
    livraison.cod ? { icone: <Billets taille={22} />, titre: t.produit.payezALaLivraison, texte: t.produit.payezALaLivraisonTexte } : null,
    livraison.delai ? { icone: <Camion taille={22} />, titre: livraison.delai, texte: livraison.frais ?? "" } : null,
    cadre.retrait ? { icone: <Magasin taille={22} />, titre: t.produit.retraitMagasin, texte: t.produit.retraitMagasinTexte(cadre.retrait.ville, t.commande.pretSous(cadre.retrait.delai_heures)) } : null,
    cadre.sav?.garantieMois ? { icone: <Bouclier taille={22} />, titre: t.annonce.garantie(cadre.sav.garantieMois), texte: t.sav.garantieTexte } : null,
    { icone: <Retour taille={22} />, titre: t.produit.refusPossible, texte: t.produit.refusPossibleTexte },
  ].filter((s) => s !== null);

  return (
    <footer className="te-pied mt-auto">
      <div className="te-pied-services">
        <ul className="enveloppe">
          {services.map((s) => (
            <li key={s.titre}>
              {s.icone}
              <span>
                <b>{s.titre}</b>
                <span>{s.texte}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="enveloppe te-pied-grille">
        <div>
          <Logo cadre={cadre} />
          {resume ? <p className="te-pied-resume">{resume}</p> : null}
          {conseil ? (
            <a className="te-pied-conseil" href={conseil} target="_blank" rel="noopener noreferrer">
              <Bulle taille={20} />
              {t.produit.conseilLien}
            </a>
          ) : null}
          <Reseaux cadre={cadre} classe="pied-reseaux te-pied-reseaux" />
        </div>
        <div>
          <p className="te-pied-titre">{t.pied.catalogue}</p>
          <ListeRayons cadre={cadre} />
        </div>
        <div>
          <p className="te-pied-titre">{t.pied.laBoutique}</p>
          <ListeBoutique cadre={cadre} />
        </div>
        <div>
          <p className="te-pied-titre">{t.pied.services}</p>
          <ul>
            {livraison.cod ? <li>{t.pied.paiementLivraison}</li> : null}
            {livraison.delai ? <li>{livraison.delai}</li> : null}
            {cadre.retrait ? <li>{t.produit.retraitMagasin}</li> : null}
          </ul>
        </div>
      </div>
      <div className="enveloppe te-pied-bas">
        <Droits cadre={cadre} />
      </div>
    </footer>
  );
}
