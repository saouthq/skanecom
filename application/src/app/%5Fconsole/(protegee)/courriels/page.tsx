import type { Metadata } from "next";
import Link from "next/link";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { cadre as chargeCadre } from "@/lib/boutique";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { courrielChangementEmail, courrielCode, courrielInvitation, courrielMotDePasse, marqueDeBoutique, MARQUE_PLATEFORME } from "@/lib/courriels/messages";
import type { Courriel } from "@/lib/courriels/modele";

export const metadata: Metadata = { title: "E-mails" };

/* ============================================================================
   LES E-MAILS — ce que reçoivent l'acheteur et l'équipe, tels qu'ils
   partent : aux couleurs de la boutique choisie, sur ordinateur ou sur
   téléphone, avec leur version texte. Des exemples (codes et liens fictifs) :
   rien n'est envoyé d'ici.
   ========================================================================== */

type Boutique = { slug: string; nom: string; hote_principal: string | null };

export default async function Courriels({ searchParams }: { searchParams: Promise<{ boutique?: string; vue?: string }> }) {
  await exigeAdmin();
  const p = await searchParams;
  const { data } = await clientService().rpc("console_boutiques");
  const boutiques = ((data ?? []) as Boutique[]).filter((b) => b.slug);
  const choisie = boutiques.find((b) => b.slug === p.boutique) ?? boutiques[0];
  const telephone = p.vue === "telephone";

  const exemples: { cle: string; pour: string; courriel: Courriel }[] = [];
  if (choisie) {
    const cadre = await chargeCadre(choisie.slug);
    const marque = marqueDeBoutique(cadre, choisie.hote_principal ? `https://${choisie.hote_principal}` : null);
    const console = "https://app.skanecom.tn";
    exemples.push(
      { cle: "code", pour: "L'acheteur, pour se connecter (au nom de la boutique)", courriel: courrielCode(marque, "482913") },
      { cle: "adresse", pour: "L'acheteur, qui change d'adresse", courriel: courrielChangementEmail(marque, "705362") },
      { cle: "invitation", pour: "L'équipe, invitée depuis la console", courriel: courrielInvitation(MARQUE_PLATEFORME, `${console}/bienvenue?jeton=exemple&type=invite`) },
      { cle: "mot-de-passe", pour: "L'équipe, qui a oublié son mot de passe", courriel: courrielMotDePasse(MARQUE_PLATEFORME, `${console}/bienvenue?jeton=exemple&type=recovery`) },
    );
  }
  const lien = (valeurs: { boutique?: string; vue?: string }) =>
    `/courriels?${new URLSearchParams({ boutique: valeurs.boutique ?? choisie?.slug ?? "", ...(valeurs.vue ? { vue: valeurs.vue } : {}) })}`;

  return (
    <>
      <EnTetePage
        titre="E-mails"
        description="Ce que reçoivent l'acheteur et l'équipe, tels qu'ils partent. Des exemples : rien n'est envoyé d'ici."
      />
      <div className="crl-barre">
        <nav className="segments" aria-label="Boutique">
          {boutiques.map((b) => (
            <Link key={b.slug} href={lien({ boutique: b.slug, vue: p.vue })} aria-current={b.slug === choisie?.slug ? "page" : undefined}
                  className={b.slug === choisie?.slug ? "crl-segment crl-segment-actif" : "crl-segment"}>
              {b.nom}
            </Link>
          ))}
        </nav>
        <nav className="segments" aria-label="Écran">
          <Link href={lien({})} className={telephone ? "crl-segment" : "crl-segment crl-segment-actif"} aria-current={telephone ? undefined : "page"}>
            <Icone nom="apercu" taille={14} /> Ordinateur
          </Link>
          <Link href={lien({ vue: "telephone" })} className={telephone ? "crl-segment crl-segment-actif" : "crl-segment"} aria-current={telephone ? "page" : undefined}>
            <Icone nom="telephone" taille={14} /> Téléphone
          </Link>
        </nav>
      </div>

      <div className={telephone ? "crl-grille crl-grille-telephone" : "crl-grille"}>
        {exemples.map((x) => (
          <section key={x.cle} className="carte crl-carte" aria-label={x.courriel.sujet}>
            <p className="aide crl-pour">{x.pour}</p>
            <div className="crl-boite">
              <span className="crl-de">{x.cle === "invitation" || x.cle === "mot-de-passe" ? MARQUE_PLATEFORME.nom : choisie?.nom}</span>
              <span className="crl-sujet">{x.courriel.sujet}</span>
            </div>
            <iframe className="crl-cadre" title={x.courriel.sujet} srcDoc={x.courriel.html} sandbox="" loading="lazy" />
            <details className="crl-texte">
              <summary>Version texte</summary>
              <pre>{x.courriel.texte}</pre>
            </details>
          </section>
        ))}
      </div>
    </>
  );
}
