"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icone } from "@/components/console/Icone";
import { formatePrix } from "@/lib/prix";

/* ============================================================================
   MODIFIER LES ARTICLES D'UNE COMMANDE PAS ENCORE PARTIE — à l'appel de
   confirmation : une autre taille, une autre quantité, une ligne en moins.
   « Voir le nouveau total » chiffre sans rien écrire (le calcul de la
   vitrine, le stock vérifié) ; « Enregistrer » écrit au total vu, puis la
   page se relit (route …/modifier → public.gestion_modifier_commande).
   ========================================================================== */

export type LigneModifiable = {
  variante_id: string;
  produit: string;
  quantite: number;
  choix: { variante_id: string; libelle: string; disponible: number; prix_millimes: number }[];
};
type Choix = { variante_id: string; quantite: number; retiree: boolean };
type Chiffrage = {
  ok: boolean; raison?: string; enregistree?: boolean; total_change?: boolean;
  lignes?: { produit: string; libelle: string | null; quantite: number; total_ligne_millimes: number }[];
  sous_total_millimes?: number; frais_livraison_millimes?: number; remise_millimes?: number; total_millimes?: number; total_avant_millimes?: number;
};

const REFUS: Record<string, string> = {
  stock: "Pas assez de stock pour une des lignes : baissez la quantité ou choisissez une autre déclinaison.",
  partie: "La commande est partie entre-temps : elle ne se modifie plus.",
  payee: "Payée en ligne : le montant reçu ne change pas. Annulez-la et ressaisissez-la si besoin.",
  code_promo: "Un code promo s'y applique : annulez-la et ressaisissez-la pour la changer.",
  precommande: "Une ligne attend un arrivage : annulez-la et ressaisissez-la pour la changer.",
  vide: "Il faut garder au moins un article : pour tout retirer, annulez la commande.",
  role: "Modifier une commande revient à qui la confirme.",
  session: "Votre session a expiré : reconnectez-vous, puis recommencez.",
};

export function ModifierCommande({ slug, numero, lignes }: { slug: string; numero: string; lignes: LigneModifiable[] }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [choix, setChoix] = useState<Choix[]>(() => lignes.map((l) => ({ variante_id: l.variante_id, quantite: l.quantite, retiree: false })));
  const [chiffrage, setChiffrage] = useState<Chiffrage | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const change = (i: number, c: Partial<Choix>) => {
    setChoix((x) => x.map((v, j) => (j === i ? { ...v, ...c } : v)));
    setChiffrage(null);
    setMessage(null);
  };
  const gardees = choix.filter((c) => !c.retiree);
  const inchange = choix.every((c, i) => !c.retiree && c.variante_id === lignes[i].variante_id && c.quantite === lignes[i].quantite);

  async function envoyer(simuler: boolean) {
    setEnvoi(true);
    setMessage(null);
    const r = await fetch(`/gestion/${slug}/commandes/${encodeURIComponent(numero)}/modifier`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ lignes: gardees.map(({ variante_id, quantite }) => ({ variante_id, quantite })), simuler, total: chiffrage?.total_millimes ?? null }),
    }).then((x) => x.json() as Promise<Chiffrage>).catch(() => ({ ok: false, raison: "erreur" }) as Chiffrage);
    setEnvoi(false);
    if (!r.ok) {
      setChiffrage(null);
      setMessage(REFUS[r.raison ?? ""] ?? "La modification n'a pas abouti. Réessayez dans un instant.");
      return;
    }
    if (!simuler && r.enregistree) {
      // La fiche se relit au complet (lignes, total, journal), avec le « c'est fait » des autres gestes.
      setOuvert(false);
      setChiffrage(null);
      router.replace(`/gestion/${slug}/commandes/${encodeURIComponent(numero)}?fait=modifiee`);
      return;
    }
    setChiffrage(r);
    if (!simuler && r.total_change) setMessage("Le total a changé entre-temps (un prix, le stock) : relisez-le, puis enregistrez.");
  }

  if (!ouvert) {
    return (
      <button type="button" className="btn btn-second btn-petit" onClick={() => setOuvert(true)}>
        <Icone nom="crayon" taille={14} /> Modifier les articles
      </button>
    );
  }

  return (
    <div className="bo-modif" role="group" aria-labelledby="bo-modif-titre">
      <p id="bo-modif-titre" className="bo-modif-titre"><b>Modifier les articles</b> — avant le départ, à la demande du client.</p>
      <ul className="bo-modif-lignes" role="list">
        {lignes.map((l, i) => {
          const c = choix[i];
          const v = l.choix.find((x) => x.variante_id === c.variante_id);
          return (
            <li key={`${l.variante_id}-${i}`} className="bo-modif-ligne" data-retiree={c.retiree ? "" : undefined}>
              <span className="bo-modif-nom">{l.produit}</span>
              {l.choix.length > 1 ? (
                <label className="bo-modif-champ">
                  <span className="sr-only">Déclinaison de {l.produit}</span>
                  <select value={c.variante_id} disabled={c.retiree} onChange={(e) => change(i, { variante_id: e.target.value })}>
                    {l.choix.map((x) => (
                      <option key={x.variante_id} value={x.variante_id} disabled={x.disponible <= 0}>
                        {x.libelle} — {x.disponible > 0 ? `${x.disponible} en stock` : "épuisé"}
                      </option>
                    ))}
                  </select>
                </label>
              ) : <span className="text-petit discret">{v?.libelle ?? ""}</span>}
              <label className="bo-modif-champ bo-modif-qte">
                <span className="sr-only">Quantité de {l.produit}</span>
                <input type="number" inputMode="numeric" min={1} max={Math.max(1, v?.disponible ?? 1)} value={c.quantite} disabled={c.retiree}
                  onChange={(e) => change(i, { quantite: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
              </label>
              <button type="button" className="btn-lien text-petit" onClick={() => change(i, { retiree: !c.retiree })}>
                {c.retiree ? "Garder" : "Retirer"}
              </button>
            </li>
          );
        })}
      </ul>

      {message ? <p className="bo-modif-refus" role="alert">{message}</p> : null}
      {chiffrage?.ok ? (
        <dl className="bo-modif-total liste-def" aria-live="polite">
          <div><dt>Sous-total</dt><dd>{formatePrix(chiffrage.sous_total_millimes ?? 0)}</dd></div>
          <div><dt>Livraison</dt><dd>{chiffrage.frais_livraison_millimes ? formatePrix(chiffrage.frais_livraison_millimes) : "Offerte"}</dd></div>
          {chiffrage.remise_millimes ? <div><dt>Remise</dt><dd>−{formatePrix(chiffrage.remise_millimes)}</dd></div> : null}
          <div className="bo-total">
            <dt>Nouveau total</dt>
            <dd>
              {chiffrage.total_avant_millimes === chiffrage.total_millimes
                ? <><b>{formatePrix(chiffrage.total_millimes ?? 0)}</b> <span className="discret">· inchangé</span></>
                : <><s className="discret">{formatePrix(chiffrage.total_avant_millimes ?? 0)}</s> → <b>{formatePrix(chiffrage.total_millimes ?? 0)}</b></>}
            </dd>
          </div>
        </dl>
      ) : null}

      <div className="bo-modif-actions">
        {chiffrage?.ok ? (
          <button type="button" className="btn btn-primaire" disabled={envoi} aria-busy={envoi || undefined} onClick={() => void envoyer(false)}>
            <Icone nom="coche" taille={16} /> Enregistrer la modification
          </button>
        ) : (
          <button type="button" className="btn btn-primaire" disabled={envoi || inchange || gardees.length === 0} aria-busy={envoi || undefined} onClick={() => void envoyer(true)}>
            Voir le nouveau total
          </button>
        )}
        <button type="button" className="btn btn-second" disabled={envoi} onClick={() => { setOuvert(false); setChiffrage(null); setMessage(null);
          setChoix(lignes.map((l) => ({ variante_id: l.variante_id, quantite: l.quantite, retiree: false }))); }}>Annuler</button>
      </div>
      {gardees.length === 0 ? <p className="aide">Il faut garder au moins un article : pour tout retirer, annulez la commande.</p> : null}
    </div>
  );
}
