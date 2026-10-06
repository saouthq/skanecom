import { Fragment } from "react";

type Morceau = { genre: "liste" | "texte"; lignes: string[] };

/* La description d'un produit, telle que le commerçant l'a écrite (ou
   relue, si elle vient de « Rédiger la description ») : des paragraphes
   séparés par une ligne vide, et des listes — les lignes qui commencent par
   « - ». Une description d'un seul tenant s'affiche comme avant : un
   paragraphe. Aucun HTML n'est lu : le texte reste du texte. */
export function TexteDescription({ texte }: { texte: string }) {
  const blocs = texte.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const morceaux: Morceau[] = [];
  for (const bloc of blocs) {
    let courant: Morceau | undefined;
    for (const brute of bloc.split("\n")) {
      const ligne = brute.trim();
      if (!ligne) continue;
      const puce = /^[-•–]\s+/.test(ligne);
      const genre: Morceau["genre"] = puce ? "liste" : "texte";
      if (!courant || courant.genre !== genre) {
        const neuf: Morceau = { genre, lignes: [] };
        morceaux.push(neuf);
        courant = neuf;
      }
      courant.lignes.push(puce ? ligne.replace(/^[-•–]\s+/, "") : ligne);
    }
  }
  return (
    <div className="texte-description">
      {morceaux.map((m, i) =>
        m.genre === "liste" ? (
          <ul key={i}>{m.lignes.map((l, j) => <li key={j}>{l}</li>)}</ul>
        ) : (
          <p key={i}>{m.lignes.map((l, j) => <Fragment key={j}>{j ? <br /> : null}{l}</Fragment>)}</p>
        ),
      )}
    </div>
  );
}
