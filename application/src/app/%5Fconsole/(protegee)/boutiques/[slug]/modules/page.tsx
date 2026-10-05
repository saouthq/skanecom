import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icone, type NomIcone } from "@/components/console/Icone";
import { dateJournal } from "@/lib/console/libelles";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { adresseRetourSkanFact, adresseSkanFact, empreinteSecret } from "@/lib/console/skanfact";
import { chiffrementPret } from "@/lib/gestion/chiffre";
import { titreBoutique } from "@/lib/console/titre-boutique";
import type { DonneesFormules } from "@/lib/console/formules";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: await titreBoutique(params, "Modules") };
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
  avis: "etoile",
  promotions: "etiquette",
  skanfact: "fichier",
};

export default async function Modules({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ erreur?: string; ok?: string }>;
}) {
  const { user, role } = await exigeAdmin();
  // Un module fait partie de l'offre vendue : le super-administrateur seul l'active (la base le redit).
  const peutChanger = role === "super_admin";
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const service = clientService();
  const { data: fiche } = await service.rpc("console_boutique", { p_slug: slug });
  if (!fiche) notFound();
  const boutique = fiche.boutique as { id: string; nom: string };
  const { data, error } = await service.rpc("console_modules", { p_boutique_id: boutique.id });
  if (error) throw new Error(`Modules illisibles : ${error.message}`);
  const modules = data as Module[];
  const actifs = modules.filter((m) => m.actif).length;
  // La formule de la boutique : un module qu'elle n'ouvre pas ne s'active pas.
  const { data: df } = await service.rpc("console_formules", { p_acteur: user.id });
  const formules = (df ?? { formules: [], droits: [], boutiques: [] }) as DonneesFormules;
  const codeFormule = formules.boutiques.find((x) => x.id === boutique.id)?.formule ?? null;
  const formule = formules.formules.find((f) => f.code === codeFormule) ?? null;
  const horsFormule = (code: string) => formule !== null && !formule.droits.includes(`module.${code}`);
  const formuleQuiOuvre = (code: string) => formules.formules.find((f) => f.droits.includes(`module.${code}`))?.nom ?? null;
  // SkanEcom, partenaire déclaré de SkanFact (« Connecter SkanFact ») : ce que SkanFact doit déclarer.
  const partenaire = modules.some((m) => m.code === "skanfact")
    ? { url: adresseSkanFact(), retour: adresseRetourSkanFact(), empreinte: await empreinteSecret(), chiffre: await chiffrementPret() }
    : null;

  return (
    <>
      <div className="sous-tete">
        <h2>Modules</h2>
        <p>
          Ce que {boutique.nom} propose en plus du socle. Un module fait partie de l&apos;offre vendue : il s&apos;active ici,
          jamais depuis le backoffice de la boutique. Visible sur la vitrine d&apos;ici cinq minutes.
          {peutChanger ? null : <> Un super-administrateur les active et les coupe.</>}
          {" "}{formule ? <>Formule <Link href={`/boutiques/${slug}#t-formule`}>{formule.nom}</Link> : seuls ses modules s&apos;activent.</> : <>Sans formule : tous s&apos;activent.</>}
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
                    {m.code === "skanfact" && partenaire ? (
                      <details className="md-partenaire">
                        <summary>SkanEcom chez SkanFact {partenaire.url && partenaire.empreinte && partenaire.retour && partenaire.chiffre
                          ? <span className="ui-etat ui-etat-point ui-etat-vert">Branché</span>
                          : <span className="ui-etat ui-etat-point">À brancher</span>}</summary>
                        <p className="aide">Ce que SkanFact déclare pour que les commerçants connectent leur boutique : l&apos;adresse exacte de retour, et l&apos;empreinte (SHA-256) du secret de SkanEcom — jamais le secret.</p>
                        <dl className="liste-def">
                          <div><dt>Adresse de retour</dt><dd><code className="md-code">{partenaire.retour ?? "— (NEXT_PUBLIC_CONSOLE_HOTE)"}</code></dd></div>
                          <div><dt>Empreinte du secret</dt><dd><code className="md-code">{partenaire.empreinte ?? "— (SKANFACT_SECRET manque)"}</code></dd></div>
                          <div><dt>Adresse de SkanFact</dt><dd>{partenaire.url ? <code className="md-code">{partenaire.url}</code> : "— (SKANFACT_URL manque)"}</dd></div>
                          <div><dt>Chiffrement des clés</dt><dd>{partenaire.chiffre ? "posé" : "— (SKANFACT_CHIFFRE manque)"}</dd></div>
                        </dl>
                      </details>
                    ) : null}
                  </div>
                  <form action={`/boutiques/${slug}/modules/changer`} method="post" className="md-action">
                    <input type="hidden" name="boutique_id" value={boutique.id} />
                    <input type="hidden" name="module" value={m.code} />
                    {m.actif ? (peutChanger ? (
                      <button type="submit" name="actif" value="false" className="btn btn-second btn-petit" aria-label={`Couper : ${m.libelle}`}>Couper</button>
                    ) : null) : m.disponible && horsFormule(m.code) ? (
                      <span className="md-hors-formule">
                        <span className="ui-etat">Hors formule</span>
                        {formuleQuiOuvre(m.code) ? <span className="aide">Vient avec {formuleQuiOuvre(m.code)}</span> : null}
                      </span>
                    ) : m.disponible && peutChanger ? (
                      <button type="submit" name="actif" value="true" className="btn btn-second btn-petit" aria-label={`Activer : ${m.libelle}`}>Activer</button>
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
