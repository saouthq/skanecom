import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icone } from "@/components/console/Icone";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { titreBoutique } from "@/lib/console/titre-boutique";
import { GROUPES_DROITS, SANS_FORMULE, type DonneesFormules } from "@/lib/console/formules";
import { resumeEcarts, type DonneesDroits } from "@/lib/console/droits";
import { formateMontant } from "@/lib/prix";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: await titreBoutique(params, "Formule") };
}

/* ============================================================================
   LA FORMULE D'UNE BOUTIQUE, PERSONNALISÉE (migration …_formule_personnalisee)
   — sa formule de départ (ou « sur mesure » : tout ouvert), puis, droit par
   droit, ce qui lui est ouvert : cocher ajoute un droit hors formule,
   décocher en retire un. Chaque ligne dit, en direct, où elle en est
   (dans la formule, ajouté, retiré, hors formule). Et son prix, s'il diffère
   de celui de la formule. Un module retiré se coupe ; une fonction retirée
   s'éteint sur la vitrine (le réglage du commerçant est gardé).
   ========================================================================== */

export default async function FormuleBoutique({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const { user, role } = await exigeAdmin();
  const peutChanger = role === "super_admin";
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const service = clientService();
  const { data: fiche } = await service.rpc("console_boutique", { p_slug: slug });
  if (!fiche) notFound();
  const boutique = fiche.boutique as { id: string; nom: string };
  const [{ data, error }, { data: df }] = await Promise.all([
    service.rpc("console_droits_boutique", { p_acteur: user.id, p_boutique_id: boutique.id }),
    service.rpc("console_formules", { p_acteur: user.id }),
  ]);
  if (error) throw new Error(`Droits illisibles : ${error.message}`);
  const d = data as DonneesDroits;
  const formules = ((df ?? { formules: [] }) as DonneesFormules).formules;
  const { ajoutes, retires } = resumeEcarts(d);
  const ouverts = d.droits.filter((x) => x.effectif).length;
  const nomBase = d.formule?.nom ?? SANS_FORMULE;
  const FORM = "dr-formulaire";

  return (
    <>
      <div className="sous-tete">
        <h2>Formule</h2>
        <p>
          Ce que {boutique.nom} a le droit d&apos;utiliser : sa formule, puis ce que SkanEcom lui ajoute ou lui retire, droit par droit.
          Un module retiré se coupe ; une fonction retirée s&apos;éteint sur la vitrine (le réglage du commerçant est gardé).
          {peutChanger ? null : <> Seul un super-administrateur la change.</>}
        </p>
      </div>
      <div className="grid gap-5">
        {messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
        {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}

        <section className="carte dr-resume" aria-labelledby="t-depart">
          <div className="dr-resume-texte">
            <h3 id="t-depart">Part de : {nomBase}</h3>
            <p className="aide">
              {ouverts} droit{ouverts > 1 ? "s" : ""} ouvert{ouverts > 1 ? "s" : ""} sur {d.droits.length}
              {ajoutes || retires ? ` · ${[ajoutes ? `${ajoutes} ajouté${ajoutes > 1 ? "s" : ""}` : null, retires ? `${retires} retiré${retires > 1 ? "s" : ""}` : null].filter(Boolean).join(", ")} pour cette boutique` : d.formule ? " · exactement sa formule" : " · tout ouvert"}
              {" · "}
              {d.prix_boutique !== null ? `${formateMontant(d.prix_boutique)} TND / mois (son prix)`
                : d.formule?.prix != null ? `${formateMontant(d.formule.prix)} TND / mois (celui de ${d.formule.nom})` : "prix à fixer"}
            </p>
          </div>
          {peutChanger ? (
            <form action={`/boutiques/${slug}/formule`} method="post" className="dr-depart">
              <input type="hidden" name="boutique_id" value={boutique.id} />
              <input type="hidden" name="retour" value="droits" />
              <label className="sr-only" htmlFor="dr-base">Formule de départ</label>
              <select id="dr-base" className="entree" name="formule" defaultValue={d.formule?.code ?? ""} key={d.formule?.code ?? "sur-mesure"}>
                <option value="">{SANS_FORMULE} (tout ouvert)</option>
                {formules.map((f) => <option key={f.code} value={f.code}>{f.nom}{f.prix !== null ? ` · ${formateMontant(f.prix)} TND` : ""}</option>)}
              </select>
              <button type="submit" className="btn btn-second btn-petit">Partir de celle-ci</button>
            </form>
          ) : null}
        </section>

        <section className="carte carte-plate" aria-labelledby="t-droits">
          <div className="md-tete">
            <h3 id="t-droits">Ce qui lui est ouvert</h3>
            <p className="aide">Coché : ouvert. La pastille dit l&apos;écart avec {d.formule ? `la formule ${d.formule.nom}` : "« sur mesure »"}, en direct.</p>
          </div>
          {GROUPES_DROITS.map((g) => {
            const droits = d.droits.filter((x) => x.groupe === g.cle);
            if (!droits.length) return null;
            return (
              <fieldset key={g.cle} className="dr-groupe">
                <legend>{g.titre} <span className="aide">{g.aide}</span></legend>
                <ul className="dr-liste" role="list">
                  {droits.map((x) => (
                    <li key={x.code} className="dr-ligne" data-formule={x.dans_formule ? "1" : "0"}>
                      <label className="dr-case">
                        <input type="checkbox" form={FORM} name="droit" value={x.code} defaultChecked={x.effectif} disabled={!peutChanger}
                          aria-describedby={`dr-${x.code.replace(/\W/g, "-")}`} />
                        <span className="dr-texte">
                          <span className="dr-nom">{x.libelle}{x.disponible ? null : <span className="ui-etat dr-a-venir">À venir</span>}</span>
                          {x.description ? <span className="aide" id={`dr-${x.code.replace(/\W/g, "-")}`}>{x.description}</span> : null}
                        </span>
                      </label>
                      {/* La pastille suit la case (CSS :has) : l'écart se voit avant d'enregistrer. */}
                      <span className="dr-etat" aria-hidden="true">
                        <span className="ui-etat dr-dans">{d.formule ? "Dans la formule" : "Ouvert"}</span>
                        <span className="ui-etat ui-etat-point ui-etat-vert dr-ajoute">Ajouté</span>
                        <span className="ui-etat ui-etat-point ui-etat-ambre dr-retire">Retiré</span>
                        <span className="ui-etat dr-hors">Hors formule</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </fieldset>
            );
          })}
        </section>

        {peutChanger ? (
          <form id={FORM} action={`/boutiques/${slug}/droits/enregistrer`} method="post" className="carte dr-pied">
            <input type="hidden" name="boutique_id" value={boutique.id} />
            <div className="dr-prix">
              <label htmlFor="dr-prix">Son prix</label>
              <span className="dr-prix-champ">
                <input id="dr-prix" name="prix" inputMode="decimal" autoComplete="off" className="entree"
                  defaultValue={d.prix_boutique === null ? "" : formateMontant(d.prix_boutique)}
                  placeholder={d.formule?.prix != null ? formateMontant(d.formule.prix) : "À fixer"} aria-describedby="dr-prix-aide" />
                <span>TND / mois</span>
              </span>
              <span className="aide" id="dr-prix-aide">Vide : {d.formule?.prix != null ? `celui de ${d.formule.nom}` : "à fixer"} · compté dans Revenus · tracé au journal</span>
            </div>
            <div className="dr-gestes">
              <button type="submit" className="btn btn-primaire">Enregistrer</button>
              {ajoutes || retires ? (
                <button type="submit" name="revenir" value="1" className="btn btn-fantome">
                  <Icone nom="defaire" taille={14} /> Revenir à {d.formule ? `la formule ${d.formule.nom}` : "« sur mesure »"}
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
        <p className="aide">
          Ce que chaque formule ouvre se règle dans <Link href="/formules">Formules</Link> ; ses quotas d&apos;envoi, dans <Link href={`/consommation#t-b-${slug}`}>Consommation</Link>.
        </p>
      </div>
    </>
  );
}
