import { Icone } from "./Icone";
import { quand } from "@/lib/gestion/libelles";
import { CLASSES_STATUT_PRO, LIBELLES_STATUT_PRO, type FicheComptePro } from "@/lib/gestion/pro";

/* ============================================================================
   LA CARTE « COMPTE PROFESSIONNEL » DE LA FICHE CLIENT (module comptes_pro)
   — où en est son compte, ce qu'il a écrit, et le geste qui vaut à cette
   étape : valider ou refuser une demande, retirer un compte ouvert, rouvrir
   un compte refusé ou retiré, ou ouvrir d'emblée celui d'un client que la
   boutique connaît. Chaque formulaire dit l'étape vue (statut_vu) : la base
   refuse un geste périmé.
   ========================================================================== */
export function CarteComptePro({ fiche, action, decide, maintenant }: {
  fiche: FicheComptePro;
  action: string;
  decide: boolean;
  maintenant: Date;
}) {
  const c = fiche.compte;
  const cache = (decision: string) => (
    <>
      <input type="hidden" name="action" value="compte_pro" />
      <input type="hidden" name="decision" value={decision} />
      <input type="hidden" name="statut_vu" value={c?.statut ?? "aucun"} />
    </>
  );

  return (
    <section className="carte" aria-labelledby="t-pro" id="compte-pro">
      <div className="carte-tete">
        <div>
          <h2 id="t-pro" className="carte-titre-icone"><Icone nom="etoile" /> Compte professionnel</h2>
          <p>
            {fiche.actif
              ? "Ouvert, le client voit ses prix pro dans la boutique en ligne, et les paie à la commande."
              : "Le module est coupé : aucun prix pro ne s'applique."}
          </p>
        </div>
      </div>

      {c ? (
        <>
          <div className="pro-fiche-etat">
            <span className={CLASSES_STATUT_PRO[c.statut]}>{LIBELLES_STATUT_PRO[c.statut]}</span>
            <span className="aide">
              {c.statut === "demande"
                ? `Demandé ${quand(c.demande_le, maintenant)}`
                : `${quand(c.decide_le ?? c.demande_le, maintenant)}${c.decide_par ? ` · ${c.decide_par}` : ""}`}
            </span>
          </div>
          <dl className="pro-fiche-faits">
            <div><dt>Raison sociale</dt><dd>{c.raison_sociale}</dd></div>
            <div><dt>Matricule fiscal</dt><dd className="tabular-nums">{c.matricule_fiscal ?? <span className="discret">non donné</span>}</dd></div>
            {c.metier ? <div><dt>Métier</dt><dd>{c.metier}</dd></div> : null}
          </dl>
          {c.message ? <blockquote className="pro-ligne-message mt-3">« {c.message} »</blockquote> : null}
          {c.motif && (c.statut === "refuse" || c.statut === "retire") ? <p className="aide mt-3">Motif, lu par le client : {c.motif}</p> : null}
        </>
      ) : (
        <p className="text-petit discret mt-3">Pas de compte professionnel.</p>
      )}

      {decide && fiche.actif ? (
        <div className="pro-fiche-gestes">
          {!c ? (
            <form action={action} method="post">
              {cache("valide")}
              <div className="champ">
                <label htmlFor="pro-raison">Raison sociale</label>
                <input id="pro-raison" name="raison_sociale" maxLength={120} required placeholder="Ex. Menuiserie du Lac" />
              </div>
              <button className="btn btn-second">Ouvrir un compte pro</button>
            </form>
          ) : c.statut === "valide" ? (
            <form action={action} method="post">
              {cache("retire")}
              <div className="champ">
                <label htmlFor="pro-motif">Pourquoi le retirer <span className="discret">(le client le lira)</span></label>
                <input id="pro-motif" name="motif" maxLength={300} required placeholder="Ex. Plus d'activité professionnelle" />
              </div>
              <button className="btn btn-danger">Retirer le compte</button>
            </form>
          ) : (
            <>
              <form action={action} method="post">
                {cache("valide")}
                <button className="btn btn-primaire"><Icone nom="coche" taille={16} /> {c.statut === "demande" ? "Valider la demande" : "Rouvrir le compte"}</button>
              </form>
              {c.statut === "demande" ? (
                <form action={action} method="post">
                  {cache("refuse")}
                  <div className="champ">
                    <label htmlFor="pro-motif">Ou la refuser, en disant pourquoi <span className="discret">(le client le lira)</span></label>
                    <input id="pro-motif" name="motif" maxLength={300} required placeholder="Ex. Pas d'activité professionnelle vérifiée" />
                  </div>
                  <button className="btn btn-danger">Refuser</button>
                </form>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {fiche.journal.length > 0 ? (
        <ol className="bo-journal mt-3">
          {fiche.journal.map((j, i) => (
            <li key={`${j.le}-${i}`}>
              <span className="bo-journal-point" aria-hidden="true" />
              <span className="bo-journal-texte">
                {j.avant ? `${LIBELLES_STATUT_PRO[j.avant.statut]} → ${j.apres ? LIBELLES_STATUT_PRO[j.apres.statut] : "?"}` : "Ouvert d'emblée par la boutique"}
                {j.apres?.motif ? <span className="bo-journal-detail"> — {j.apres.motif}</span> : null}
              </span>
              <span className="bo-journal-meta">{j.auteur ?? "SkanEcom"} · {quand(j.le, maintenant)}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
