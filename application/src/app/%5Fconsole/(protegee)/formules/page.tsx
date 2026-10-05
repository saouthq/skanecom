import type { Metadata } from "next";
import Link from "next/link";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { formateMontant } from "@/lib/prix";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { GROUPES_DROITS, SANS_FORMULE, type DonneesFormules, type Formule } from "@/lib/console/formules";

export const metadata: Metadata = { title: "Formules" };

/* ============================================================================
   LES FORMULES — ce que SkanEcom vend. Un tableau de comparaison : une
   colonne par formule (son nom, son prix, ses boutiques), une ligne par
   droit (les fonctions de la vitrine, puis les modules). Chaque colonne est
   son propre formulaire : cocher, puis « Enregistrer » sous la colonne.
   La base contrôle à la source : une fonction hors formule s'éteint sur la
   vitrine, un module hors formule ne s'active pas.
   ========================================================================== */
export default async function Formules({ searchParams }: { searchParams: Promise<{ ok?: string; erreur?: string; nouvelle?: string }> }) {
  const { user, role } = await exigeAdmin();
  const messages = await searchParams;
  const { data, error } = await clientService().rpc("console_formules", { p_acteur: user.id });
  if (error) throw new Error(`Formules illisibles : ${error.message}`);
  const d = data as DonneesFormules;
  const peutModifier = role === "super_admin";
  const sansFormule = d.boutiques.filter((b) => !b.formule && !b.demonstration);
  const colonnes: (Formule & { neuve?: boolean })[] = [
    ...d.formules,
    ...(peutModifier && messages.nouvelle ? [{ code: "", nom: "", description: null, prix: null, position: 0, droits: [], boutiques: 0, neuve: true }] : []),
  ];

  return (
    <>
      <EnTetePage
        titre="Formules"
        description="Ce que SkanEcom vend à chaque boutique. Une fonction hors formule s'éteint sur la vitrine, un module hors formule ne s'active pas."
        actions={peutModifier && !messages.nouvelle ? (
          <Link href="/formules?nouvelle=1#f-neuve" className="btn btn-second"><Icone nom="plus" taille={15} /> Nouvelle formule</Link>
        ) : null}
      />
      {messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
      {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}
      {sansFormule.length ? (
        <p className="message fo-sans">
          {sansFormule.length} boutique{sansFormule.length > 1 ? "s" : ""} cliente{sansFormule.length > 1 ? "s" : ""} sans formule ({SANS_FORMULE.toLowerCase()} : tout est ouvert) :{" "}
          {sansFormule.map((b, i) => <span key={b.id}>{i ? ", " : ""}<Link href={`/boutiques/${b.slug}#t-formule`}>{b.nom}</Link></span>)}
        </p>
      ) : null}

      <div className="carte carte-plate fo-carte">
        <div className="defile">
          <table className="tableau fo-tableau">
            <caption className="sr-only">Les droits de chaque formule</caption>
            <thead>
              <tr>
                <th scope="col" className="fo-coin">Ce que la formule ouvre</th>
                {colonnes.map((f) => (
                  <th key={f.code || "neuve"} scope="col" className="fo-tete" id={f.neuve ? "f-neuve" : `f-${f.code}`}>
                    {peutModifier ? (
                      <div className="fo-tete-champs">
                        {f.neuve ? (
                          <input form="form-neuve" name="code" required pattern="[a-z][a-z0-9_]{1,30}" placeholder="code (ex. pro_plus)" aria-label="Code de la nouvelle formule" className="fo-code" />
                        ) : <input form={`form-${f.code}`} type="hidden" name="code" value={f.code} />}
                        <input form={f.neuve ? "form-neuve" : `form-${f.code}`} name="nom" defaultValue={f.nom} required maxLength={40}
                          aria-label={`Nom de la formule${f.neuve ? "" : ` ${f.nom}`}`} placeholder="Nom" className="fo-nom" />
                        <label className="fo-prix">
                          <input form={f.neuve ? "form-neuve" : `form-${f.code}`} name="prix" inputMode="decimal"
                            defaultValue={f.prix === null ? "" : formateMontant(f.prix)} placeholder="Prix à fixer" aria-label={`Prix mensuel${f.neuve ? "" : ` de ${f.nom}`}, en TND`} />
                          <span>TND / mois</span>
                        </label>
                        <textarea form={f.neuve ? "form-neuve" : `form-${f.code}`} name="description" defaultValue={f.description ?? ""} maxLength={300} rows={4}
                          aria-label={`Ce que dit la formule${f.neuve ? "" : ` ${f.nom}`}`} placeholder="En une phrase, pour qui" className="fo-description" />
                      </div>
                    ) : (
                      <div className="fo-tete-champs">
                        <b className="fo-nom-lu">{f.nom}</b>
                        <span className="fo-prix-lu">{f.prix === null ? "Prix à fixer" : <>{formateMontant(f.prix)} TND / mois</>}</span>
                        {f.description ? <span className="aide">{f.description}</span> : null}
                      </div>
                    )}
                    {f.neuve ? null : (
                      <span className="fo-vendue">{f.boutiques ? `${f.boutiques} boutique${f.boutiques > 1 ? "s" : ""}` : "Pas encore vendue"}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            {GROUPES_DROITS.map((g) => {
              const droits = d.droits.filter((x) => x.groupe === g.cle);
              if (!droits.length) return null;
              return (
                <tbody key={g.cle}>
                  <tr className="fo-groupe">
                    <th scope="colgroup" colSpan={colonnes.length + 1}>{g.titre} <span className="aide">{g.aide}</span></th>
                  </tr>
                  {droits.map((x) => (
                    <tr key={x.code}>
                      <th scope="row" className="fo-droit">
                        <span>{x.libelle}{x.disponible ? null : <span className="ui-etat fo-a-venir">À venir</span>}</span>
                        {x.description ? <span className="aide">{x.description}</span> : null}
                      </th>
                      {colonnes.map((f) => {
                        const dedans = f.droits.includes(x.code);
                        return (
                          <td key={f.code || "neuve"} className="fo-case">
                            {peutModifier ? (
                              <input type="checkbox" form={f.neuve ? "form-neuve" : `form-${f.code}`} name="droit" value={x.code} defaultChecked={dedans}
                                aria-label={`${x.libelle} dans ${f.neuve ? "la nouvelle formule" : f.nom}`} />
                            ) : dedans ? <Icone nom="coche" taille={16} className="fo-oui" /> : <span className="fo-non" aria-label="non">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              );
            })}
            {peutModifier ? (
              <tfoot>
                <tr>
                  <td />
                  {colonnes.map((f) => (
                    <td key={f.code || "neuve"} className="fo-pied">
                      <form id={f.neuve ? "form-neuve" : `form-${f.code}`} action="/formules/enregistrer" method="post">
                        {f.neuve ? <input type="hidden" name="neuve" value="1" /> : null}
                        <button type="submit" className="btn btn-primaire btn-petit">{f.neuve ? "Créer la formule" : `Enregistrer ${f.nom}`}</button>
                      </form>
                      {f.neuve ? (
                        <Link href="/formules" className="btn btn-fantome btn-petit">Annuler</Link>
                      ) : f.boutiques === 0 ? (
                        <form action="/formules/supprimer" method="post">
                          <input type="hidden" name="code" value={f.code} />
                          <button type="submit" className="btn btn-danger btn-petit" aria-label={`Supprimer la formule ${f.nom}`}>
                            <Icone nom="corbeille" taille={14} /> Supprimer
                          </button>
                        </form>
                      ) : null}
                    </td>
                  ))}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
      <p className="aide fo-note">
        Retirer un module d&apos;une formule le coupe dans ses boutiques. Une fonction retirée s&apos;éteint sur leur vitrine ; le réglage du
        commerçant est gardé et revient si la formule l&apos;ouvre de nouveau. {peutModifier ? null : "Seul un super-administrateur change les formules."}
      </p>
    </>
  );
}
