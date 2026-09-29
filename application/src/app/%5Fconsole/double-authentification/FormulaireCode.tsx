"use client";

import { useState, type FormEvent } from "react";

/* Le code est vérifié SANS recharger la page : un code faux ne doit pas
   effacer le QR code qu'on vient de scanner (recharger créerait un nouveau
   facteur, à rescanner). Sans JavaScript, le formulaire part normalement. */
export function FormulaireCode({ facteur, erreurInitiale, children }: {
  facteur: string;
  erreurInitiale?: string;
  children: React.ReactNode;
}) {
  const [erreur, setErreur] = useState(erreurInitiale ?? "");
  const [envoi, setEnvoi] = useState(false);

  const envoie = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setEnvoi(true);
    setErreur("");
    try {
      const r = await fetch(form.action, { method: "POST", body: new FormData(form), headers: { accept: "application/json" } });
      const corps = (await r.json()) as { ok: boolean; erreur?: string; suite?: string };
      if (corps.ok) {
        window.location.assign(corps.suite ?? "/");
        return;
      }
      setErreur(corps.erreur ?? "Code refusé.");
      const champ = form.querySelector<HTMLInputElement>("input[name=code]");
      if (champ) {
        champ.value = "";
        champ.focus();
      }
    } catch {
      setErreur("La console ne répond pas : réessayez.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <form action="/double-authentification/verifier" method="post" className="carte formulaire mt-6" onSubmit={envoie} aria-busy={envoi}>
      <p className="message message-erreur" role="alert" hidden={!erreur}>{erreur}</p>
      <input type="hidden" name="facteur" value={facteur} />
      {children}
      <button type="submit" className="btn btn-primaire btn-bloc" disabled={envoi}>
        {envoi ? "Vérification…" : "Valider"}
      </button>
    </form>
  );
}
