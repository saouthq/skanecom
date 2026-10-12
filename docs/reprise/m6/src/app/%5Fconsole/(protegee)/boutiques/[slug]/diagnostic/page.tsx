import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { dateJournal } from "@/lib/console/libelles";
import { essayerVitrine } from "@/lib/console/surveillance";
import { titreBoutique } from "@/lib/console/titre-boutique";
import { Icone } from "@/components/console/Icone";
import { constats, type DonneesDiagnostic, type Constat } from "@/lib/console/diagnostic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: await titreBoutique(params, "Diagnostic") };
}

/* ============================================================================
   LE DIAGNOSTIC D'UNE BOUTIQUE — « pourquoi ce client ne reçoit rien ? »
   Tout ce qui fait qu'elle vend, relu à chaque ouverture : sa vitrine
   essayée pour de vrai, son adresse, son statut, ses erreurs et ses pannes,
   ses files d'envoi, son catalogue, sa livraison, son paiement, ses
   commandes. Chaque point dit ce qu'il a vu et, s'il cloche, quoi faire —
   avec le lien du geste.
   ========================================================================== */

const MARQUE: Record<Constat["niveau"], { icone: "succes" | "alerte" | "refus" | "question"; mot: string }> = {
  ok: { icone: "succes", mot: "Bon" },
  attention: { icone: "alerte", mot: "À regarder" },
  panne: { icone: "refus", mot: "Bloque" },
  neutre: { icone: "question", mot: "Pour info" },
};

export default async function Diagnostic({ params }: { params: Promise<{ slug: string }> }) {
  const { user } = await exigeAdmin();
  const { slug } = await params;
  const service = clientService();
  const { data: fiche } = await service.rpc("console_boutique", { p_slug: slug });
  if (!fiche) notFound();
  const id = (fiche as { boutique: { id: string } }).boutique.id;
  const { data, error } = await service.rpc("console_diagnostic", { p_acteur: user.id, p_boutique_id: id });
  if (error) throw new Error(`Diagnostic illisible : ${error.message}`);
  const d = data as DonneesDiagnostic;
  // La vitrine, essayée pour de vrai (comme la surveillance de l'heure).
  const essai = d.domaine ? await essayerVitrine(d.domaine.hote, id) : null;
  const liste = constats(d, essai, new Date().getTime());
  const bloquants = liste.filter((c) => c.niveau === "panne").length;
  const aRegarder = liste.filter((c) => c.niveau === "attention").length;
  const verdict = bloquants ? "panne" : aRegarder ? "attention" : "ok";

  return (
    <div className="dg">
      <div className="et-verdict carte" data-niveau={verdict} role="status">
        <Icone nom={verdict === "ok" ? "succes" : "alerte"} taille={20} />
        <div>
          <p className="et-verdict-titre">
            {bloquants ? `${bloquants} point${bloquants > 1 ? "s" : ""} qui bloque${bloquants > 1 ? "nt" : ""} la vente`
              : aRegarder ? `${aRegarder} point${aRegarder > 1 ? "s" : ""} à regarder` : `Tout va bien pour ${d.boutique.nom}.`}
          </p>
          <p className="discret">Relu le {dateJournal(d.le)}, la vitrine essayée à l&apos;instant. <Link href={`/boutiques/${slug}/diagnostic`}>Relire</Link></p>
        </div>
      </div>
      <ol className="dg-liste carte" aria-label="Les points du diagnostic">
        {liste.map((c) => (
          <li key={c.cle} data-niveau={c.niveau}>
            <span className="dg-marque" aria-hidden="true"><Icone nom={MARQUE[c.niveau].icone} taille={16} /></span>
            <div className="dg-corps">
              <p className="dg-titre"><b>{c.titre}</b> <span className="dg-mot">{MARQUE[c.niveau].mot}</span></p>
              <p className="dg-vu">{c.vu}</p>
              {c.faire ? <p className="dg-faire aide"><b>Que faire :</b> {c.faire}</p> : null}
            </div>
            {c.lien ? <Link className="btn btn-second btn-petit dg-lien" href={c.lien.href}>{c.lien.libelle}</Link> : null}
          </li>
        ))}
      </ol>
      <p className="aide">
        La même lecture que la surveillance de l&apos;heure et l&apos;État technique, pour cette boutique seule.
        Ce qui a changé autour d&apos;elle : <Link href={`/etat?pour=${slug}&periode=7#t-chronologie`}>sa chronologie technique</Link>.
      </p>
    </div>
  );
}
