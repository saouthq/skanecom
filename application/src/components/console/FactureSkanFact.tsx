import { Icone } from "./Icone";
import { montant } from "@/lib/console/skanfact";
import { quand } from "@/lib/gestion/libelles";
import { GENRES_SKANFACT, ecranSkanFact } from "@/lib/gestion/skanfact-libelles";

/* Ce que SkanFact sait d'une commande (module skanfact, B1 à B4) : sa
   facture (« Voir la facture dans SkanFact »), le paiement à la livraison,
   ses avoirs ; ce qui attend une panne ; ce que SkanFact a refusé, avec sa
   phrase et « Réessayer » ; ou « Facturer dans SkanFact » pour une commande
   d'avant la connexion. */

type Piece = { id?: string; numero?: string; date?: string; netAPayer?: string; reste?: string; montant?: string; ecran?: string };
export type EnvoiSkanFact = {
  id: string; genre: "facture" | "paiement" | "retour"; cle: string; etat: "a_envoyer" | "fait" | "refuse";
  essais: number; prochain_essai: string; erreur: string | null; motif: string | null; fait_le: string | null;
  reponse: { facture?: Piece; avoir?: Piece; rembourse?: string | null; deja?: boolean; rien?: boolean } | null;
};
export type EtatFactureSkanFact = { actif: boolean; connecte: boolean; moment: "confirmation" | "livraison" | null; envois: EnvoiSkanFact[] };

export function FactureSkanFact({ e, statut, numero, action, fiche, peutAgir, url, maintenant }: {
  e: EtatFactureSkanFact; statut: string; numero: string; action: string; fiche: string; peutAgir: boolean; url: string | null; maintenant: Date;
}) {
  const facture = e.envois.find((x) => x.genre === "facture");
  const faite = facture?.etat === "fait" ? facture.reponse?.facture : undefined;
  const lien = ecranSkanFact(url, faite?.ecran);
  const refus = e.envois.some((x) => x.etat === "refuse");
  // Le reste à payer, tel que SkanFact l'a dit en dernier.
  const dernier = [...e.envois].reverse().find((x) => x.etat === "fait" && x.reponse?.facture?.reste !== undefined)?.reponse?.facture?.reste;
  const facturable = ["confirmee", "expediee", "livree"].includes(statut) && (e.moment !== "livraison" || statut === "livree");
  const suite = e.envois.filter((x) => !(x.genre === "facture" && x.etat === "fait"));

  return (
    <section className={`carte sf-commande${refus ? " sf-commande-alerte" : ""}`} aria-labelledby="t-skanfact-titre" id="t-skanfact">
      <div className="carte-tete">
        <div>
          <h2 id="t-skanfact-titre" className="carte-titre-icone"><Icone nom="billet" /> SkanFact</h2>
          <p>
            {faite
              ? <>Facturée {facture?.fait_le ? quand(facture.fait_le, maintenant) : ""}{dernier !== undefined ? <> · reste à payer <b className="tabular-nums">{montant(dernier, "TND", "TND")}</b></> : null}.</>
              : facture?.etat === "refuse" ? "SkanFact a refusé la facture : rien n'a été facturé."
                : facture ? "La facture part dans SkanFact."
                  : !e.connecte ? "La boutique n'est pas connectée à SkanFact."
                    : facturable ? "Pas encore facturée (commande d'avant la connexion)."
                      : e.moment === "livraison" && ["confirmee", "expediee"].includes(statut) ? "Elle sera facturée à la livraison."
                        : "Rien n'est parti dans SkanFact pour cette commande."}
          </p>
        </div>
      </div>

      {faite ? (
        <div className="sf-commande-facture">
          <b className="sf-numero">{faite.numero}</b>
          {faite.netAPayer ? <b className="tabular-nums">{montant(faite.netAPayer, "TND", "TND")}</b> : null}
          {lien ? (
            <a href={lien} target="_blank" rel="noopener" className="btn btn-second btn-bloc"
              aria-label={`Voir la facture ${faite.numero ?? ""} dans SkanFact (nouvel onglet)`}>
              Voir la facture dans SkanFact <Icone nom="externe" taille={14} />
            </a>
          ) : null}
        </div>
      ) : null}

      {suite.length ? (
        <ul className="sf-commande-envois" role="list">
          {suite.map((x) => {
            const avoir = x.reponse?.avoir;
            const lienAvoir = ecranSkanFact(url, avoir?.ecran);
            const rendu = x.reponse?.rembourse && Number(x.reponse.rembourse) > 0 ? x.reponse.rembourse : null;
            return (
              <li key={x.id} className="sf-commande-envoi">
                <span>
                  <b>{x.genre === "retour" && x.etat === "fait" && avoir?.numero ? `Avoir ${avoir.numero}` : GENRES_SKANFACT[x.genre]}</b>
                  {x.etat === "fait" ? (
                    <span className="discret">
                      {x.genre === "retour"
                        ? <>{x.motif}{avoir?.montant ? ` · ${montant(avoir.montant, "TND", "TND")}` : ""}{rendu ? ` · argent rendu ${montant(rendu, "TND", "TND")}` : ""}</>
                        : x.reponse?.rien ? "Rien à encaisser" : "Enregistré dans SkanFact"}
                      {x.fait_le ? ` · ${quand(x.fait_le, maintenant)}` : ""}
                    </span>
                  ) : x.etat === "refuse" ? (
                    <span className="sf-erreur">{x.erreur}</span>
                  ) : (
                    <span className="discret">
                      {x.essais ? `En attente : ${x.erreur ?? "SkanFact n'a pas répondu"} (${x.essais} essai${x.essais > 1 ? "s" : ""}, prochain essai ${quand(x.prochain_essai, maintenant)})` : "Part dans un instant."}
                    </span>
                  )}
                </span>
                {x.etat === "fait" && lienAvoir ? (
                  <a href={lienAvoir} target="_blank" rel="noopener" className="btn btn-fantome" aria-label={`Voir l'avoir ${avoir?.numero ?? ""} dans SkanFact (nouvel onglet)`}>
                    Voir l&apos;avoir <Icone nom="externe" taille={12} />
                  </a>
                ) : x.etat === "refuse" && peutAgir ? (
                  <form action={action} method="post">
                    <input type="hidden" name="geste" value="reessayer" />
                    <input type="hidden" name="envoi" value={x.id} />
                    <input type="hidden" name="numero" value={numero} />
                    <input type="hidden" name="retour" value={fiche} />
                    <button type="submit" className="btn btn-primaire">Réessayer</button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {!facture && e.actif && e.connecte && facturable && peutAgir ? (
        <form action={action} method="post">
          <input type="hidden" name="geste" value="facturer" />
          <input type="hidden" name="numero" value={numero} />
          <input type="hidden" name="retour" value={fiche} />
          <button type="submit" className="btn btn-second">Facturer dans SkanFact</button>
        </form>
      ) : null}
    </section>
  );
}
