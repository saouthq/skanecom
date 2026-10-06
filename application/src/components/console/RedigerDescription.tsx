"use client";

import { useState } from "react";
import { Icone } from "./Icone";

/* « Rédiger la description » (module redaction) : ce que le champ contient
   part comme notes, le brouillon revient et prend sa place — rien n'est
   enregistré avant « Enregistrer la fiche ». « Revenir à mon texte » remet
   ce qu'il y avait. */
export function RedigerDescription({ action, champ }: { action: string; champ: string }) {
  const [etat, setEtat] = useState<"repos" | "redaction" | "pose" | "erreur">("repos");
  const [message, setMessage] = useState("");
  const [avant, setAvant] = useState<string | null>(null);

  const zone = () => document.getElementById(champ) as HTMLTextAreaElement | null;
  const remplit = (texte: string) => {
    const z = zone();
    if (!z) return;
    z.value = texte;
    z.dispatchEvent(new Event("input", { bubbles: true }));
  };

  async function redige() {
    const z = zone();
    if (!z || etat === "redaction") return;
    setEtat("redaction");
    setMessage("Rédaction en cours…");
    try {
      const r = await fetch(action, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes: z.value }),
      });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; texte?: string; essai?: boolean; erreur?: string };
      if (!r.ok || !d.ok || !d.texte) throw new Error(d.erreur ?? "La rédaction n'a pas abouti. Votre texte n'a pas changé.");
      setAvant(z.value);
      remplit(d.texte);
      z.focus();
      z.setSelectionRange(0, 0);
      z.scrollTop = 0;
      setEtat("pose");
      setMessage(d.essai
        ? "Brouillon d'essai posé (en local, sans modèle de langue). Relisez-le, puis « Enregistrer la fiche »."
        : "Brouillon posé : relisez-le, corrigez-le, puis « Enregistrer la fiche ».");
    } catch (e) {
      setEtat("erreur");
      setMessage(e instanceof Error ? e.message : "La rédaction n'a pas abouti.");
    }
  }

  function revient() {
    if (avant === null) return;
    remplit(avant);
    zone()?.focus();
    setAvant(null);
    setEtat("repos");
    setMessage("Votre texte est revenu.");
  }

  return (
    <div className="redaction" data-etat={etat}>
      <button type="button" className="btn btn-second btn-petit" onClick={redige} disabled={etat === "redaction"} aria-describedby="redaction-aide">
        <Icone nom="magie" taille={14} /> {etat === "redaction" ? "Rédaction…" : avant !== null ? "Rédiger un autre brouillon" : "Rédiger la description"}
      </button>
      {avant !== null ? (
        <button type="button" className="btn btn-fantome btn-petit" onClick={revient}>
          <Icone nom="defaire" taille={14} /> Revenir à mon texte
        </button>
      ) : null}
      <p id="redaction-aide" className={etat === "erreur" ? "aide redaction-erreur" : "aide"} role="status" aria-live="polite">
        {message || "Un brouillon à partir de la fiche : nom, rayon, déclinaisons, caractéristiques, et vos notes dans le champ. Rien n'est inventé ni enregistré sans vous."}
      </p>
    </div>
  );
}
