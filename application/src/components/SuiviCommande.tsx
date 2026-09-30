"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ResumeCommande, type CommandeMienne } from "./Compte";
import { t } from "@/lib/i18n";

/* ============================================================================
   LE SUIVI SANS COMPTE — deux champs, une réponse : la commande telle que
   « Mes commandes » la montre (sa frise, son contenu, où elle va), ou une
   phrase qui ne dit pas lequel des deux est faux. Après cinq essais manqués
   sur un numéro, la base fait attendre (le message le dit).
   ========================================================================== */

type Reponse = { ok: true; commande: CommandeMienne } | { ok: false; raison: string; message?: string };

export function SuiviCommande({ exemple }: { exemple: string }) {
  const [numero, setNumero] = useState("");
  const [telephone, setTelephone] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [commande, setCommande] = useState<CommandeMienne | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const resultat = useRef<HTMLDivElement>(null);
  const champNumero = useRef<HTMLInputElement>(null);
  const retourAuFormulaire = useRef(false);

  // Le focus suit ce qui remplace l'autre : le résultat quand il paraît (un
  // lecteur d'écran le lit), le numéro quand on en cherche une autre. Posé au
  // moment où React attache le bloc, jamais avant : un requestAnimationFrame
  // lancé après la réponse pouvait passer avant le rendu, et le focus se perdait.
  useLayoutEffect(() => {
    if (commande) resultat.current?.focus();
    else if (retourAuFormulaire.current) {
      retourAuFormulaire.current = false;
      champNumero.current?.focus();
    }
  }, [commande]);

  async function chercher(e: React.FormEvent) {
    e.preventDefault();
    if (enCours) return;
    setEnCours(true);
    setErreur(null);
    try {
      const r = await fetch("/suivi/chercher", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ numero, telephone }),
      });
      const d = (await r.json()) as Reponse;
      if (d.ok) {
        setCommande(d.commande);
      } else {
        setCommande(null);
        setErreur(d.raison === "introuvable" ? t.suivi.introuvable : d.raison === "serveur" ? t.suivi.erreur : (d.message ?? t.suivi.erreur));
      }
    } catch {
      setErreur(t.suivi.erreur);
    } finally {
      setEnCours(false);
    }
  }

  if (commande) {
    return (
      <div className="suivi-resultat" ref={resultat} tabIndex={-1}>
        <div className="compte-carte" data-statut={commande.statut}>
          <ResumeCommande c={commande} />
        </div>
        <button type="button" className="btn-lien legende" onClick={() => { retourAuFormulaire.current = true; setCommande(null); setNumero(""); }}>
          {t.suivi.autre}
        </button>
      </div>
    );
  }

  return (
    <form className="suivi-formulaire" onSubmit={chercher} noValidate>
      <div className="champ">
        <label htmlFor="suivi-numero">{t.suivi.numero}</label>
        <input
          ref={champNumero}
          id="suivi-numero"
          name="numero"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder={exemple}
          value={numero}
          onChange={(e) => setNumero(e.target.value.slice(0, 40))}
          aria-describedby="suivi-numero-aide"
          required
        />
        <p id="suivi-numero-aide" className="legende">{t.suivi.numeroAide(exemple)}</p>
      </div>
      <div className="champ">
        <label htmlFor="suivi-telephone">{t.suivi.telephone}</label>
        <div className="tunnel-tel">
          <span aria-hidden="true">{t.commande.indicatif}</span>
          <input
            id="suivi-telephone"
            name="telephone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="20 123 456"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value.slice(0, 20))}
            required
          />
        </div>
      </div>
      {erreur ? <p className="tunnel-alerte" role="alert">{erreur}</p> : null}
      <button type="submit" className="btn btn-primaire btn-bloc" disabled={enCours || !numero.trim() || telephone.replace(/\D/g, "").length < 8} aria-busy={enCours || undefined}>
        {enCours ? t.suivi.recherche : t.suivi.chercher}
      </button>
    </form>
  );
}
