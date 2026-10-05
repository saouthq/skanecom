import type { Metadata } from "next";
import Link from "next/link";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { dateJournal, LIBELLES_STATUT } from "@/lib/console/libelles";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { montant } from "@/lib/console/skanfact";
import { formateMontant } from "@/lib/prix";
import { CANAUX, coutDepassement, niveauQuota, nomMois, type DonneesConsommation } from "@/lib/console/consommation";

export const metadata: Metadata = { title: "Revenus" };

/* ============================================================================
   LES REVENUS DE SKANECOM (migration …_console_revenus) — ce que les
   boutiques rapportent, sans rien estimer :
   · le revenu mensuel attendu, du prix de la formule de chaque boutique
     ouverte (hors démonstration) ; une formule « prix à fixer » ne compte
     pas, et la page dit combien de boutiques restent ainsi hors du compte ;
   · ce que SkanFact a dit à la dernière lecture : le reste à encaisser,
     l'échu, les retards. Les montants de SkanFact restent en texte décimal.
   ========================================================================== */

type FormuleRevenus = { code: string; nom: string; prix: number | null; actives: number; en_preparation: number; suspendues: number };
type BoutiqueRevenus = {
  slug: string; nom: string; statut: string; formule: string | null; formule_nom: string | null;
  /** Son prix : le sien s'il en a un (prix_propre), sinon celui de sa formule. */
  prix: number | null; prix_propre?: boolean; personnalisee?: boolean;
  skanfact: { raison_sociale: string; contrat: boolean; lue_le: string | null; reste: string | null; echu: string | null; retard: number | null } | null;
};
type DonneesRevenus = {
  formules: FormuleRevenus[];
  boutiques: BoutiqueRevenus[];
  skanfact: { reliees: number; lues: number; reste: string; echu: string; en_retard: number; lue_le: string | null };
};

const tnd = (millimes: number) => `${formateMontant(millimes)} TND`;
const dt = (texte: string | null) => montant(texte ?? "0", "TND", "TND");
const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
const nul = (texte: string | null) => !texte || /^0+(\.0+)?$/.test(texte);

export default async function Revenus() {
  const { user } = await exigeAdmin();
  const [{ data, error }, { data: dc }] = await Promise.all([
    clientService().rpc("console_revenus", { p_acteur: user.id }),
    clientService().rpc("console_consommation", { p_acteur: user.id }),
  ]);
  if (error) throw new Error(`Revenus illisibles : ${error.message}`);
  const r = data as DonneesRevenus;
  // Les dépassements de quota du mois (la page Consommation) : chiffrés seulement si la formule en fixe le prix.
  const conso = (dc ?? null) as DonneesConsommation | null;
  const prixQuota = new Map((conso?.formules ?? []).map((f) => [f.code, f]));
  const depasses = (conso?.boutiques ?? []).filter((b) => !b.demonstration).flatMap((b) => CANAUX
    .filter(({ cle }) => niveauQuota(b[cle].envoyes, b[cle].quota) === "depasse")
    .map(({ cle }) => ({ id: b.id, cout: coutDepassement(b[cle], cle, prixQuota.get(b.formule ?? "")) })));
  const auDela = new Set(depasses.map((x) => x.id)).size;
  const surplus = depasses.reduce((n, x) => n + (x.cout ?? 0), 0);

  const ouvertes = r.boutiques.filter((b) => b.statut === "active");
  const payantes = ouvertes.filter((b) => b.prix !== null);
  const mensuel = payantes.reduce((n, b) => n + (b.prix ?? 0), 0);
  const aFixer = ouvertes.filter((b) => b.formule && b.prix === null).length;
  const sansFormule = ouvertes.filter((b) => !b.formule).length;
  const enPreparation = r.boutiques.filter((b) => b.statut === "en_preparation");
  const aVenir = enPreparation.reduce((n, b) => n + (b.prix ?? 0), 0);
  const enPause = r.boutiques.filter((b) => b.statut === "suspendue").reduce((n, b) => n + (b.prix ?? 0), 0);
  const aucunPrix = r.formules.every((f) => f.prix === null);
  const totalFormules = (cle: "actives" | "en_preparation" | "suspendues") => r.formules.reduce((n, f) => n + f[cle], 0);
  // Le revenu d'une formule : la somme des prix de ses boutiques ouvertes (une boutique peut avoir le sien).
  const revenuFormule = (code: string) => ouvertes.filter((b) => b.formule === code && b.prix !== null).reduce((n, b) => n + (b.prix ?? 0), 0);

  return (
    <>
      <EnTetePage
        titre="Revenus"
        description="Ce que rapportent les boutiques : le prix de leur formule, et ce que SkanFact a facturé. Rien n'est estimé : une formule sans prix ne compte pas."
        actions={<Link href="/formules" className="btn btn-second btn-petit"><Icone nom="billet" taille={14} /> Les formules et leurs prix</Link>}
      />

      <ul className="tbp-chiffres rv-chiffres" role="list">
        <li className="carte">
          <span className="tbp-libelle">Revenu mensuel attendu</span>
          <b className="tbp-valeur">{payantes.length ? tnd(mensuel) : "Prix à fixer"}</b>
          <span className="aide">{payantes.length ? `soit ${tnd(mensuel * 12)} par an` : aucunPrix ? "Aucune formule n'a encore de prix." : "Aucune boutique ouverte sur une formule à prix."}</span>
        </li>
        <li className="carte" data-niveau={ouvertes.length && payantes.length < ouvertes.length ? "attention" : undefined}>
          <span className="tbp-libelle">Boutiques payantes</span>
          <b className="tbp-valeur">{payantes.length} <small>sur {pluriel(ouvertes.length, "ouverte", "ouvertes")}</small></b>
          <span className="aide">
            {[aFixer ? `${aFixer} sur une formule à prix à fixer` : null, sansFormule ? pluriel(sansFormule, "sans formule", "sans formule") : null].filter(Boolean).join(", ") || "Toutes comptent."}
          </span>
        </li>
        <li className="carte">
          <span className="tbp-libelle">À l&apos;ouverture</span>
          <b className="tbp-valeur">{aVenir ? `+ ${tnd(aVenir)}` : "—"}</b>
          <span className="aide">{enPreparation.length ? `${pluriel(enPreparation.length, "boutique", "boutiques")} en préparation` : "Aucune boutique en préparation."}{enPause ? ` · ${tnd(enPause)} en pause (suspendues)` : ""}</span>
        </li>
        <li className="carte">
          <span className="tbp-libelle">Dépassements{conso ? ` · ${nomMois(conso.mois)}` : ""}</span>
          <b className="tbp-valeur">{surplus ? `+ ${tnd(surplus)}` : "—"}</b>
          <span className="aide">
            {!auDela ? "Aucune boutique au-delà de son quota d'envois." : (
              <>{auDela > 1 ? `${auDela} boutiques au-delà de leur quota` : "Une boutique au-delà de son quota"}{depasses.some((x) => x.cout === null) ? ", dépassement sans prix fixé" : ""} · <Link href="/consommation">voir</Link></>
            )}
          </span>
        </li>
        <li className="carte" data-niveau={r.skanfact.en_retard ? "attention" : undefined}>
          <span className="tbp-libelle">Reste à encaisser</span>
          <b className="tbp-valeur">{r.skanfact.lues ? dt(r.skanfact.reste) : "—"}</b>
          <span className="aide">
            {!r.skanfact.reliees ? "Aucune boutique reliée à SkanFact."
              : !r.skanfact.lues ? "Situations pas encore lues dans SkanFact."
              : <>dont {dt(r.skanfact.echu)} échu{r.skanfact.en_retard ? `, ${pluriel(r.skanfact.en_retard, "client en retard", "clients en retard")}` : ""}</>}
          </span>
        </li>
      </ul>

      <section className="carte carte-plate rv-bloc" aria-labelledby="t-formules">
        <header className="rv-tete">
          <h2 id="t-formules">Par formule</h2>
          {aucunPrix ? <p className="aide">Les prix se fixent dans <Link href="/formules">Formules</Link> : tant qu&apos;une formule est « prix à fixer », ses boutiques ne comptent pas.</p> : null}
        </header>
        <div className="defile">
          <table className="tableau rv-tableau">
            <thead>
              <tr><th>Formule</th><th>Prix mensuel</th><th className="rv-n">Ouvertes</th><th className="rv-n">En préparation</th><th className="rv-n">Suspendues</th><th className="rv-n">Revenu mensuel</th></tr>
            </thead>
            <tbody>
              {r.formules.map((f) => (
                <tr key={f.code}>
                  <td className="font-medium">{f.nom}</td>
                  <td>{f.prix === null ? <span className="discret">Prix à fixer</span> : tnd(f.prix)}</td>
                  <td className="rv-n">{f.actives}</td>
                  <td className="rv-n">{f.en_preparation}</td>
                  <td className="rv-n">{f.suspendues}</td>
                  <td className="rv-n">{revenuFormule(f.code) ? tnd(revenuFormule(f.code)) : <span className="discret">—</span>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th><td />
                <td className="rv-n">{totalFormules("actives")}</td><td className="rv-n">{totalFormules("en_preparation")}</td><td className="rv-n">{totalFormules("suspendues")}</td>
                <td className="rv-n font-medium">{payantes.length ? tnd(mensuel) : <span className="discret">—</span>}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="carte carte-plate rv-bloc" aria-labelledby="t-boutiques">
        <header className="rv-tete">
          <h2 id="t-boutiques">Par boutique</h2>
          <p className="aide">Les boutiques clientes (hors démonstration et fermées), ouvertes d&apos;abord.{r.skanfact.lue_le ? ` SkanFact lu au plus tôt le ${dateJournal(r.skanfact.lue_le)}.` : ""}</p>
        </header>
        {r.boutiques.length === 0 ? <p className="discret rv-vide">Aucune boutique cliente pour l&apos;instant.</p> : (
          <div className="defile">
            <table className="tableau rv-tableau">
              <thead>
                <tr><th>Boutique</th><th>Statut</th><th>Formule</th><th className="rv-n">Par mois</th><th>SkanFact</th></tr>
              </thead>
              <tbody>
                {r.boutiques.map((b) => (
                  <tr key={b.slug}>
                    <td className="font-medium"><Link href={`/boutiques/${b.slug}`}>{b.nom}</Link></td>
                    <td><span className={`statut statut-${b.statut}`}>{LIBELLES_STATUT[b.statut] ?? b.statut}</span></td>
                    <td>
                      {b.formule_nom ?? (b.prix !== null || b.personnalisee ? "Sur mesure" : <Link href={`/boutiques/${b.slug}#formule`} className="rv-a-faire">Choisir sa formule</Link>)}
                      {b.personnalisee ? <Link href={`/boutiques/${b.slug}/droits`} className="aide rv-propre">personnalisée</Link> : null}
                    </td>
                    <td className="rv-n">
                      {b.prix !== null ? <>{tnd(b.prix)}{b.prix_propre ? <span className="aide rv-propre">son prix</span> : null}</> : <span className="discret">{b.formule ? "Prix à fixer" : "—"}</span>}
                    </td>
                    <td>
                      {!b.skanfact ? <Link href={`/boutiques/${b.slug}/facturation`} className="discret">Non reliée</Link>
                        : !b.skanfact.lue_le ? <span className="discret">Reliée, pas encore lue</span>
                        : nul(b.skanfact.reste) ? <span className="ui-etat ui-etat-point ui-etat-vert">À jour</span>
                        : (
                          <span className="rv-skanfact">
                            {dt(b.skanfact.reste)} à payer
                            {b.skanfact.retard ? <span className="ui-etat ui-etat-point ui-etat-rouge">{b.skanfact.retard} j de retard</span>
                              : !nul(b.skanfact.echu) ? <span className="ui-etat ui-etat-point ui-etat-ambre">{dt(b.skanfact.echu)} échu</span> : null}
                          </span>
                        )}
                      {b.skanfact && !b.skanfact.contrat ? <span className="aide rv-sans-contrat">Sans contrat d&apos;abonnement</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
