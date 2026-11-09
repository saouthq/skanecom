"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Icone } from "@/components/console/Icone";
import { formatePrix } from "@/lib/prix";

/* ============================================================================
   CHANGER L'ADRESSE D'UNE COMMANDE PAS ENCORE PARTIE — à l'appel : « livrez
   chez ma sœur, à Sfax ». « Voir les frais » chiffre la livraison du nouveau
   gouvernorat sans rien écrire ; « Enregistrer » écrit au total vu (route
   …/adresse → public.gestion_modifier_livraison).
   ========================================================================== */

type Adresse = { ligne1: string; ligne2: string; ville: string; gouvernorat: string; code_postal: string };
type Chiffrage = { ok: boolean; raison?: string; enregistree?: boolean; total_change?: boolean; zone?: string | null;
  frais_avant_millimes?: number; frais_livraison_millimes?: number; total_avant_millimes?: number; total_millimes?: number };

const REFUS: Record<string, string> = {
  incomplete: "L'adresse, la ville et le gouvernorat sont nécessaires au livreur.",
  code_postal: "Le code postal tunisien a quatre chiffres.",
  trop_long: "Une ligne est trop longue : 200 caractères au plus (100 pour la ville).",
  gouvernorat: "Choisissez le gouvernorat dans la liste.",
  partie: "La commande est partie entre-temps : son adresse ne change plus.",
  payee: "Payée en ligne : annulez-la et ressaisissez-la si besoin.",
  retrait: "Elle se retire au magasin : pas d'adresse de livraison.",
  role: "Changer l'adresse revient à qui confirme la commande.",
  session: "Votre session a expiré : reconnectez-vous, puis recommencez.",
};

export function ModifierAdresse({ slug, numero, actuelle, gouvernorats }: {
  slug: string; numero: string; actuelle: Adresse; gouvernorats: { code: string; nom: string }[];
}) {
  const router = useRouter();
  const id = useId();
  const [ouvert, setOuvert] = useState(false);
  const [a, setA] = useState<Adresse>(actuelle);
  const [chiffrage, setChiffrage] = useState<Chiffrage | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const change = (k: keyof Adresse, v: string) => { setA((x) => ({ ...x, [k]: v })); setChiffrage(null); setMessage(null); };
  const inchangee = (Object.keys(actuelle) as (keyof Adresse)[]).every((k) => a[k].trim() === actuelle[k].trim());

  async function envoyer(simuler: boolean) {
    setEnvoi(true);
    setMessage(null);
    const r = await fetch(`/gestion/${slug}/commandes/${encodeURIComponent(numero)}/adresse`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ adresse: a, simuler, total: chiffrage?.total_millimes ?? null }),
    }).then((x) => x.json() as Promise<Chiffrage>).catch(() => ({ ok: false, raison: "erreur" }) as Chiffrage);
    setEnvoi(false);
    if (!r.ok) {
      setChiffrage(null);
      setMessage(REFUS[r.raison ?? ""] ?? "Le changement n'a pas abouti. Réessayez dans un instant.");
      return;
    }
    if (!simuler && r.enregistree) {
      setOuvert(false);
      setChiffrage(null);
      router.replace(`/gestion/${slug}/commandes/${encodeURIComponent(numero)}?fait=adresse`);
      return;
    }
    setChiffrage(r);
    if (!simuler && r.total_change) setMessage("Le total a changé entre-temps : relisez-le, puis enregistrez.");
  }

  if (!ouvert) {
    return (
      <button type="button" className="btn btn-second btn-petit bo-adresse-modifier" onClick={() => setOuvert(true)}>
        <Icone nom="crayon" taille={14} /> Changer l&apos;adresse
      </button>
    );
  }

  const memeFrais = chiffrage?.frais_avant_millimes === chiffrage?.frais_livraison_millimes;
  return (
    <div className="bo-modif" role="group" aria-labelledby="bo-adresse-titre">
      <p id="bo-adresse-titre" className="bo-modif-titre"><b>Changer l&apos;adresse</b> — avant le départ, à la demande du client.</p>
      <div className="bo-adresse-champs">
        <div className="champ">
          <label htmlFor={`${id}-l1`}>Adresse</label>
          <input id={`${id}-l1`} value={a.ligne1} onChange={(e) => change("ligne1", e.target.value)} autoComplete="off" maxLength={200} placeholder="Rue, numéro, résidence" />
        </div>
        <div className="champ">
          <label htmlFor={`${id}-l2`}>Complément <span className="facultatif">(facultatif)</span></label>
          <input id={`${id}-l2`} value={a.ligne2} onChange={(e) => change("ligne2", e.target.value)} autoComplete="off" maxLength={200} placeholder="Étage, repère pour le livreur" />
        </div>
        <div className="bo-adresse-rang">
          <div className="champ">
            <label htmlFor={`${id}-ville`}>Ville</label>
            <input id={`${id}-ville`} value={a.ville} onChange={(e) => change("ville", e.target.value)} autoComplete="off" maxLength={100} />
          </div>
          <div className="champ">
            <label htmlFor={`${id}-cp`}>Code postal</label>
            <input id={`${id}-cp`} value={a.code_postal} onChange={(e) => change("code_postal", e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="off" placeholder="Facultatif" />
          </div>
        </div>
        <div className="champ">
          <label htmlFor={`${id}-gouv`}>Gouvernorat</label>
          <select id={`${id}-gouv`} value={a.gouvernorat} onChange={(e) => change("gouvernorat", e.target.value)}>
            {gouvernorats.map((g) => <option key={g.code} value={g.code}>{g.nom}</option>)}
          </select>
        </div>
      </div>

      {message ? <p className="bo-modif-refus" role="alert">{message}</p> : null}
      {chiffrage?.ok ? (
        <dl className="bo-modif-total liste-def" aria-live="polite">
          <div>
            <dt>Livraison{chiffrage.zone ? ` (${chiffrage.zone})` : ""}</dt>
            <dd>
              {memeFrais ? <>{chiffrage.frais_livraison_millimes ? formatePrix(chiffrage.frais_livraison_millimes) : "Offerte"} <span className="discret">· inchangée</span></>
                : <><s className="discret">{formatePrix(chiffrage.frais_avant_millimes ?? 0)}</s> → <b>{formatePrix(chiffrage.frais_livraison_millimes ?? 0)}</b></>}
            </dd>
          </div>
          <div className="bo-total">
            <dt>Nouveau total</dt>
            <dd>{memeFrais ? <><b>{formatePrix(chiffrage.total_millimes ?? 0)}</b> <span className="discret">· inchangé</span></>
              : <><s className="discret">{formatePrix(chiffrage.total_avant_millimes ?? 0)}</s> → <b>{formatePrix(chiffrage.total_millimes ?? 0)}</b></>}</dd>
          </div>
        </dl>
      ) : null}

      <div className="bo-modif-actions">
        {chiffrage?.ok ? (
          <button type="button" className="btn btn-primaire" disabled={envoi} aria-busy={envoi || undefined} onClick={() => void envoyer(false)}>
            <Icone nom="coche" taille={16} /> Enregistrer l&apos;adresse
          </button>
        ) : (
          <button type="button" className="btn btn-primaire" disabled={envoi || inchangee} aria-busy={envoi || undefined} onClick={() => void envoyer(true)}>
            Voir les frais
          </button>
        )}
        <button type="button" className="btn btn-second" disabled={envoi} onClick={() => { setOuvert(false); setA(actuelle); setChiffrage(null); setMessage(null); }}>Annuler</button>
      </div>
    </div>
  );
}
