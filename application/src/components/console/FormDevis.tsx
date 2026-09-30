"use client";

import { useState } from "react";
import { Icone } from "./Icone";
import { formateMontant } from "@/lib/prix";
import { millimes } from "@/lib/console/import";
import type { LigneDevisGestion } from "@/lib/gestion/devis";

/* ============================================================================
   LE CHIFFRAGE D'UN DEVIS — une ligne par article : ce qu'il vaut au
   catalogue (et aux pros), le stock, et le prix unitaire du devis, proposé
   d'emblée (le prix pro s'il y en a un, sinon le prix du catalogue). Une
   remise en % se pose sur toutes les lignes d'un geste ; les totaux, les
   frais et l'écart au catalogue suivent la saisie. « Enregistrer » garde un
   brouillon (le client ne voit rien) ; « Envoyer » le met dans son compte.

   Un formulaire HTML ordinaire : sans JavaScript, on saisit et on envoie.
   ========================================================================== */

type ModeFrais = "boutique" | "offerte" | "montant";

const arrondi = (m: number) => Math.round(m / 100) * 100;

export function FormDevis({ action, lignes, frais, note, version, envoye }: {
  action: string;
  lignes: LigneDevisGestion[];
  frais: number | null;
  note: string | null;
  version: string;
  /** Déjà envoyé : le renvoyer le remplace dans le compte du client. */
  envoye: boolean;
}) {
  const initial = (l: LigneDevisGestion) => l.prix_devis_millimes ?? l.prix_pro_millimes ?? l.prix_actuel_millimes;
  const [prix, setPrix] = useState<Record<string, string>>(() => Object.fromEntries(lignes.map((l) => [l.id, formateMontant(initial(l))])));
  const [remise, setRemise] = useState("");
  const [modeFrais, setModeFrais] = useState<ModeFrais>(frais === null ? "boutique" : frais === 0 ? "offerte" : "montant");
  const [montantFrais, setMontantFrais] = useState(frais && frais > 0 ? formateMontant(frais) : "");

  const lus = lignes.map((l) => ({ l, m: millimes(prix[l.id] ?? "") }));
  const illisibles = lus.filter(({ m }) => m === null || Number.isNaN(m)).length;
  const sousTotal = lus.reduce((s, { l, m }) => s + (m && !Number.isNaN(m) ? m * l.quantite : 0), 0);
  const catalogue = lignes.reduce((s, l) => s + l.prix_actuel_millimes * l.quantite, 0);
  const fraisLus = modeFrais === "montant" ? millimes(montantFrais) : modeFrais === "offerte" ? 0 : null;
  const total = sousTotal + (fraisLus && !Number.isNaN(fraisLus) ? fraisLus : 0);
  const ecart = catalogue > 0 ? Math.round((1 - sousTotal / catalogue) * 1000) / 10 : 0;

  const appliqueRemise = () => {
    const r = Number(remise.replace(",", "."));
    if (!Number.isFinite(r) || r < 0 || r >= 100) return;
    setPrix(Object.fromEntries(lignes.map((l) => [l.id, formateMontant(arrondi(l.prix_actuel_millimes * (1 - r / 100)))])));
  };

  return (
    <form method="post" action={action} className="dv-form">
      <input type="hidden" name="action" value="chiffrer" />
      <input type="hidden" name="version" value={version} />

      <div className="dv-remise">
        <label htmlFor="dv-remise">Remise sur le catalogue</label>
        <span className="dv-remise-champ">
          <input id="dv-remise" className="entree tabular-nums" inputMode="decimal" value={remise} placeholder="0"
                 onChange={(e) => setRemise(e.target.value.replace(/[^\d,.]/g, "").slice(0, 5))}
                 onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); appliqueRemise(); } }} />
          <span aria-hidden="true">%</span>
        </span>
        <button type="button" className="btn btn-second btn-petit" onClick={appliqueRemise}>Appliquer à toutes les lignes</button>
      </div>

      <ul className="dv-lignes" role="list">
        {lignes.map((l) => {
          const m = millimes(prix[l.id] ?? "");
          const invalide = m === null || Number.isNaN(m);
          const manque = l.stock < l.quantite;
          return (
            <li key={l.id} className="dv-ligne" data-invalide={invalide ? "" : undefined}>
              <span className="dv-ligne-quoi">
                <b>{l.produit_nom}</b>
                <span className="discret">{[l.variante_libelle, l.sku].filter(Boolean).join(" · ")}</span>
                <span className="dv-ligne-faits">
                  <span className="tabular-nums">× {l.quantite}</span>
                  <span className={manque ? "dv-manque" : "discret"}>
                    {manque ? <Icone nom="alerte" taille={13} /> : null} {l.stock} en stock
                  </span>
                  <span className="discret">Catalogue {formateMontant(l.prix_actuel_millimes)}</span>
                  {l.prix_pro_millimes ? <span className="dv-pro">Pro {formateMontant(l.prix_pro_millimes)}</span> : null}
                  {!l.en_vente ? <span className="ui-etat">Hors vente</span> : null}
                </span>
              </span>
              <span className="champ dv-ligne-prix">
                <label htmlFor={`p-${l.id}`}>Prix unitaire <span className="facultatif">TND</span></label>
                <input id={`p-${l.id}`} name={`prix:${l.id}`} className="tabular-nums" inputMode="decimal" required value={prix[l.id] ?? ""}
                       aria-invalid={invalide ? true : undefined}
                       onChange={(e) => setPrix((avant) => ({ ...avant, [l.id]: e.target.value }))} />
              </span>
              <span className="dv-ligne-total tabular-nums">{invalide ? "—" : `${formateMontant((m ?? 0) * l.quantite)} TND`}</span>
            </li>
          );
        })}
      </ul>

      <div className="dv-bas">
        <fieldset className="dv-frais">
          <legend>Livraison</legend>
          <label className="opt"><input type="radio" name="frais_mode" value="boutique" checked={modeFrais === "boutique"} onChange={() => setModeFrais("boutique")} /> Frais habituels de la boutique</label>
          <label className="opt"><input type="radio" name="frais_mode" value="offerte" checked={modeFrais === "offerte"} onChange={() => setModeFrais("offerte")} /> Offerte</label>
          <label className="opt dv-frais-montant">
            <input type="radio" name="frais_mode" value="montant" checked={modeFrais === "montant"} onChange={() => setModeFrais("montant")} /> Montant
            <input name="frais" className="entree tabular-nums" inputMode="decimal" value={montantFrais} placeholder="15,000" aria-label="Frais de livraison du devis, en dinars"
                   onFocus={() => setModeFrais("montant")} onChange={(e) => setMontantFrais(e.target.value)} />
          </label>
        </fieldset>
        <div className="champ dv-validite">
          <label htmlFor="dv-validite">Valable</label>
          <select id="dv-validite" name="validite" defaultValue="15">
            <option value="7">7 jours</option>
            <option value="15">15 jours</option>
            <option value="30">30 jours</option>
            <option value="60">60 jours</option>
          </select>
        </div>
        <div className="champ dv-note">
          <label htmlFor="dv-note">Le mot au client <span className="facultatif">facultatif, il le lira avec les prix</span></label>
          <textarea id="dv-note" name="note" rows={3} maxLength={1000} defaultValue={note ?? ""}
                    placeholder="Ex. Prix valables pour la quantité ; livraison sur le chantier le mardi." />
        </div>
      </div>

      <div className="dv-barre">
        <dl className="dv-totaux" aria-live="polite">
          <div><dt>Articles</dt><dd className="tabular-nums">{formateMontant(sousTotal)} TND</dd></div>
          <div><dt>Livraison</dt><dd>{fraisLus === null ? "selon la zone" : fraisLus === 0 ? "offerte" : Number.isNaN(fraisLus) ? "illisible" : `${formateMontant(fraisLus)} TND`}</dd></div>
          <div className="dv-total"><dt>Total</dt><dd className="tabular-nums">{formateMontant(total)} TND</dd></div>
          {catalogue > 0 && ecart !== 0 ? (
            <div className="dv-ecart" data-hausse={ecart < 0 ? "" : undefined}>
              <dt>Au catalogue</dt>
              <dd>{ecart > 0 ? `−${String(ecart).replace(".", ",")} %` : `+${String(-ecart).replace(".", ",")} %`}</dd>
            </div>
          ) : null}
        </dl>
        <span className="dv-gestes">
          <button type="submit" name="envoyer" value="0" className="btn btn-second">Enregistrer le brouillon</button>
          <button type="submit" name="envoyer" value="1" className="btn btn-primaire" disabled={illisibles > 0}>
            <Icone nom="message" taille={16} /> {envoye ? "Renvoyer le devis" : "Envoyer le devis"}
          </button>
        </span>
      </div>
    </form>
  );
}
