import type { Metadata } from "next";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { TexteConditions } from "@/components/TexteConditions";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { quand } from "@/lib/gestion/libelles";

export const metadata: Metadata = { title: "Conditions de service" };

/* ============================================================================
   LES CONDITIONS DE SERVICE DE SKANECOM, au backoffice (migration
   …_conditions_service) — le texte en vigueur, ce qui a changé depuis la
   version d'avant, et l'accord : le propriétaire coche, puis accepte au nom
   de son entreprise (la raison sociale de ses informations légales). Toute
   l'équipe peut les lire ; les accords passés restent dits.
   ========================================================================== */

type Donnees = {
  version: number | null;
  a_accepter: boolean;
  peut_accepter?: boolean;
  proprietaire?: string | null;
  conditions: { version: number; titre: string; texte: string; changements: string | null; publie_le: string } | null;
  au_nom_de: string;
  accords: { version: number; qui: string; au_nom_de: string; le: string }[];
};

export default async function PageConditions({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; erreur?: string }> }) {
  const { slug } = await params;
  const v = await searchParams;
  const { boutique } = await exigeMembre(slug);
  const { data, error } = await (await clientSession()).rpc("gestion_conditions", { p_boutique_id: boutique.boutique_id });
  if (error) throw new Error(`Conditions illisibles : ${error.message}`);
  const d = data as Donnees;
  const maintenant = new Date();
  const accord = d.accords.find((a) => a.version === d.version) ?? null;
  const support = Boolean(boutique.support_jusqu_a);

  return (
    <>
      <EnTetePage
        titre="Conditions de service"
        description="Ce qui lie la boutique à SkanEcom : ce que fait la plateforme, ce que fait la boutique, et le traitement des données de vos clients."
      />
      {v.ok ? <p className="message message-succes" role="status">{v.ok}</p> : null}
      {v.erreur ? <p className="message message-erreur" role="alert">{v.erreur}</p> : null}
      {!d.conditions ? (
        <section className="carte"><p>SkanEcom n&apos;a pas encore publié ses conditions de service : rien à accepter pour l&apos;instant.</p></section>
      ) : (
        <div className="cdt-page">
          <section className="carte cdt-accord-carte" aria-labelledby="t-accord">
            <h2 id="t-accord" className="carte-titre-icone"><Icone nom={accord ? "succes" : "fichier"} /> {accord ? "Acceptées" : "À accepter"}</h2>
            {accord ? (
              <p>Version {accord.version} acceptée par {accord.qui}, {quand(accord.le, maintenant)}, au nom de <b>{accord.au_nom_de}</b>.</p>
            ) : support ? (
              <p>Pendant un accès support, SkanEcom lit les conditions mais ne les accepte jamais à la place du commerçant.</p>
            ) : d.peut_accepter ? (
              <form action={`/gestion/${slug}/conditions/accepter`} method="post" className="formulaire cdt-accepter">
                <input type="hidden" name="version" value={d.conditions.version} />
                {d.conditions.changements ? <div className="message"><p className="cdt-champs"><b>Ce qui change depuis la version d&apos;avant :</b> {d.conditions.changements}</p></div> : null}
                <label className="case">
                  <input type="checkbox" name="lu" value="oui" required />
                  <span>J&apos;ai lu les conditions de service de SkanEcom et l&apos;accord de traitement des données, et je les accepte au nom de <b>{d.au_nom_de}</b>.</span>
                </label>
                <div><button type="submit" className="btn btn-primaire">Accepter la version {d.conditions.version}</button></div>
                <p className="aide">L&apos;accord est daté et garde votre adresse e-mail. La raison sociale vient de vos informations légales (Réglages).</p>
              </form>
            ) : (
              <p>Le propriétaire de la boutique{d.proprietaire ? ` (${d.proprietaire})` : ""} les accepte au nom de l&apos;entreprise. Vous pouvez les lire ci-dessous.</p>
            )}
          </section>

          <article className="carte cdt-document" aria-labelledby="t-document">
            <h2 id="t-document" className="cdt-document-titre">{d.conditions.titre}</h2>
            <p className="aide">Version {d.conditions.version}, publiée {quand(d.conditions.publie_le, maintenant)}.</p>
            <TexteConditions texte={d.conditions.texte} niveau={3} />
          </article>

          {d.accords.length > (accord ? 1 : 0) ? (
            <section className="carte" aria-labelledby="t-accords">
              <h2 id="t-accords" className="carte-titre-icone"><Icone nom="horloge" /> Les accords précédents</h2>
              <ul className="cdt-versions" role="list">
                {d.accords.filter((a) => a !== accord).map((a) => (
                  <li key={a.version}>Version {a.version} : acceptée par {a.qui}, {quand(a.le, maintenant)}, au nom de {a.au_nom_de}.</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}
