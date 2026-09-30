import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Gabarit } from "@/components/Gabarit";
import { Bouclier } from "@/components/Icones";
import { cadre as chargeCadre } from "@/lib/boutique";
import { identiteLegale, moyensDeContact } from "@/lib/legal";
import { t } from "@/lib/i18n";

/* ============================================================================
   GARANTIE ET SERVICE APRÈS-VENTE — la page que la boutique montre quand
   elle a le module « sav » : la garantie qu'elle annonce (un réglage, jamais
   une phrase écrite à la main), comment faire une demande (depuis « Mes
   commandes »), ce qu'il faut garder sous la main, et comment la joindre
   autrement. Sans le module, la page n'existe pas.
   ========================================================================== */

export const revalidate = 300;

export const metadata: Metadata = { title: t.sav.meta };

export default async function GarantieEtSav({ params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  if (!cadre.sav) notFound();
  const mois = cadre.sav.garantieMois;
  const contact = moyensDeContact(identiteLegale(cadre));

  return (
    <Gabarit className="enveloppe flex-1 sav-page">
      <header className="sav-tete">
        {cadre.revendeurOfficiel ? <p className="sav-revendeur"><Bouclier taille={16} /> {cadre.revendeurOfficiel}</p> : null}
        <h1>{t.sav.titre}</h1>
        <p className="sav-chapo">{t.sav.chapo}</p>
      </header>

      <div className="sav-grille">
        <section className="sav-garantie" aria-labelledby="sav-garantie-titre">
          {mois > 0 ? (
            <p className="sav-duree" aria-hidden="true"><span>{mois}</span> mois</p>
          ) : (
            <span className="sav-duree-icone" aria-hidden="true"><Bouclier taille={36} /></span>
          )}
          <h2 id="sav-garantie-titre">{mois > 0 ? t.annonce.garantie(mois) : "Garantie"}</h2>
          <p>{mois > 0 ? t.sav.garantieDuree(mois) : t.sav.garantieLegale}</p>
        </section>

        <section className="sav-etapes" aria-labelledby="sav-etapes-titre">
          <h2 id="sav-etapes-titre">{t.sav.commentTitre}</h2>
          <ol>
            {t.sav.etapes.map((e, i) => (
              <li key={i}>
                <span className="sav-etape-num" aria-hidden="true">{i + 1}</span>
                <span>{e}</span>
              </li>
            ))}
          </ol>
          <Link href="/compte" className="btn btn-primaire">{t.sav.faireDemande}</Link>
        </section>

        <section className="sav-preparer" aria-labelledby="sav-preparer-titre">
          <h2 id="sav-preparer-titre">{t.sav.preparerTitre}</h2>
          <ul>
            {t.sav.preparer.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
          <p className="sav-ailleurs">{t.sav.ailleurs} {contact}.</p>
        </section>
      </div>
    </Gabarit>
  );
}
