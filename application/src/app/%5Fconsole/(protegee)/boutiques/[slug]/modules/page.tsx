import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Icone, type NomIcone } from "@/components/console/Icone";
import { dateJournal } from "@/lib/console/libelles";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: `Modules · ${(await params).slug}` };
}

/* ============================================================================
   C3 · LES MODULES D'UNE BOUTIQUE — ce qu'elle propose en plus du socle
   (retrait en magasin, conseil par WhatsApp, paiement en ligne…). Un module
   fait partie de l'offre vendue : il s'active ici, jamais depuis le
   backoffice de la boutique ; ses réglages, eux, s'y règlent. Un module
   pas encore construit est « à venir » : la base refuse de l'activer.
   ========================================================================== */

type Module = {
  code: string; libelle: string; description: string | null; disponible: boolean; actif: boolean;
  change_le: string | null; change_par: string | null; reglages: number;
};

const ICONES: Record<string, NomIcone> = {
  paiement_en_ligne: "billet",
  retrait_magasin: "boutique",
  conseil_whatsapp: "message",
  sav: "reglages",
  comptes_pro: "personne",
  devis: "fichier",
};

export default async function Modules({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ erreur?: string; ok?: string }>;
}) {
  await exigeAdmin();
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const service = clientService();
  const { data: fiche } = await service.rpc("console_boutique", { p_slug: slug });
  if (!fiche) notFound();
  const boutique = fiche.boutique as { id: string; nom: string };
  const { data, error } = await service.rpc("console_modules", { p_boutique_id: boutique.id });
  if (error) throw new Error(`Modules illisibles : ${error.message}`);
  const modules = data as Module[];
  const actifs = modules.filter((m) => m.actif).length;

  return (
    <>
      <div className="sous-tete">
        <h2>Modules</h2>
        <p>
          Ce que {boutique.nom} propose en plus du socle. Un module fait partie de l&apos;offre vendue : il s&apos;active ici,
          jamais depuis le backoffice de la boutique. Visible sur la vitrine d&apos;ici cinq minutes.
        </p>
      </div>
      <div className="grid gap-5">
        {messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
        {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}

        <section className="carte carte-plate" aria-labelledby="t-modules">
          <div className="md-tete">
            <h3 id="t-modules">{actifs} module{actifs > 1 ? "s" : ""} actif{actifs > 1 ? "s" : ""} sur {modules.length}</h3>
          </div>
          <ul className="md-liste" role="list">
            {modules.map((m) => {
              const etat = m.actif ? { classe: "ui-etat ui-etat-point ui-etat-vert", texte: "Actif" }
                : m.disponible ? { classe: "ui-etat ui-etat-point", texte: "Coupé" }
                : { classe: "ui-etat", texte: "À venir" };
              return (
                <li key={m.code} className="md-module" data-module={m.code} data-actif={m.actif ? "" : undefined}>
                  <span className="md-icone" aria-hidden="true"><Icone nom={ICONES[m.code] ?? "reglages"} taille={18} /></span>
                  <div className="md-texte">
                    <p className="md-titre">{m.libelle} <span className={etat.classe}>{etat.texte}</span></p>
                    {m.description ? <p className="aide">{m.description}</p> : null}
                    {m.actif && m.reglages > 0 ? (
                      <p className="md-note"><Icone nom="reglages" taille={13} /> Ses réglages : au backoffice de la boutique, dans Réglages.</p>
                    ) : null}
                    {m.change_le ? (
                      <p className="md-note">{m.actif ? "Activé" : "Coupé"} le {dateJournal(m.change_le)}{m.change_par ? ` par ${m.change_par}` : ""}</p>
                    ) : null}
                  </div>
                  <form action={`/boutiques/${slug}/modules/changer`} method="post" className="md-action">
                    <input type="hidden" name="boutique_id" value={boutique.id} />
                    <input type="hidden" name="module" value={m.code} />
                    {m.actif ? (
                      <button type="submit" name="actif" value="false" className="btn btn-second btn-petit" aria-label={`Couper : ${m.libelle}`}>Couper</button>
                    ) : m.disponible ? (
                      <button type="submit" name="actif" value="true" className="btn btn-primaire btn-petit" aria-label={`Activer : ${m.libelle}`}>Activer</button>
                    ) : null}
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
}
