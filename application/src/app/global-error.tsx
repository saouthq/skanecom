"use client";

import { useSignalerErreur } from "@/components/SignalerErreur";

/* Le dernier filet : une erreur dans la mise en page elle-même (la boutique
   ou la console ne se lisent plus). Une page à part, en français, sans rien
   qui dépende de ce qui a cassé. */
export default function ErreurGlobale({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useSignalerErreur(error);
  return (
    <html lang="fr">
      <body style={{ font: "16px/1.6 system-ui, sans-serif", maxWidth: "36rem", margin: "15vh auto", padding: "0 1.5rem", color: "#1b1f24", background: "#fafaf8" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 500 }}>Cette page n&apos;a pas pu s&apos;afficher.</h1>
        <p>Une erreur l&apos;a interrompue ; elle est signalée. Réessayez dans un instant.</p>
        <p>
          <button type="button" onClick={reset} style={{ font: "inherit", padding: ".625rem 1.125rem", borderRadius: ".5rem", border: 0, background: "#1b1f24", color: "#fff", cursor: "pointer" }}>
            Réessayer
          </button>
        </p>
        {error.digest ? <p style={{ color: "#6b7280", fontSize: ".8125rem" }}>Référence : {error.digest}</p> : null}
      </body>
    </html>
  );
}
