import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnTetePage } from "@/components/console/Coquille";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";

export const metadata: Metadata = { title: "E-mail reçu" };

/* Aperçu en ligne seulement : un e-mail que l'application a rédigé et gardé
   au lieu de l'envoyer (supabase/apercu/codes-demo.sql), tel qu'il serait
   arrivé. Affiché dans un cadre isolé (aucun script, aucune navigation). */

type Recu = { le: string; destinataire: string; expediteur: string | null; sujet: string | null; html: string; texte: string | null };

const HEURE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Tunis" });

export default async function CourrielRecu({ params }: { params: Promise<{ id: string }> }) {
  await exigeAdmin();
  const id = Number.parseInt((await params).id, 10);
  if (!Number.isSafeInteger(id)) notFound();
  const { data, error } = await clientService().rpc("console_courriel_apercu", { p_id: id });
  if (error || !data) notFound();
  const r = data as Recu;
  return (
    <>
      <EnTetePage
        titre={r.sujet ?? "E-mail"}
        description={`De ${r.expediteur ?? "SkanEcom"} à ${r.destinataire}, le ${HEURE.format(new Date(r.le))}.`}
        avant={<Link href="/" className="btn-lien aide">← Les codes de l&apos;aperçu</Link>}
      />
      <div className="crl-grille">
        <section className="carte crl-carte">
          <iframe className="crl-cadre" title={r.sujet ?? "E-mail"} srcDoc={r.html} sandbox="" />
          {r.texte ? (
            <details className="crl-texte">
              <summary>Version texte</summary>
              <pre>{r.texte}</pre>
            </details>
          ) : null}
        </section>
      </div>
    </>
  );
}
