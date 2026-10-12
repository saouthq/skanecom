/* ============================================================================
   LE TEXTE DES CONDITIONS DE SERVICE — écrit dans la console en texte
   simple, lu au backoffice et dans la console : « ## » ouvre un titre, « - »
   une ligne de liste, une ligne vide sépare les paragraphes. Aucun HTML ne
   passe : tout est rendu en éléments, échappé par React.
   ========================================================================== */

type Bloc = { genre: "titre"; texte: string } | { genre: "liste"; lignes: string[] } | { genre: "paragraphe"; texte: string };

export function blocsConditions(texte: string): Bloc[] {
  const blocs: Bloc[] = [];
  let paragraphe: string[] = [];
  const fermer = () => {
    if (paragraphe.length) blocs.push({ genre: "paragraphe", texte: paragraphe.join(" ") });
    paragraphe = [];
  };
  for (const brute of texte.replace(/\r\n?/g, "\n").split("\n")) {
    const ligne = brute.trim();
    if (!ligne) { fermer(); continue; }
    if (ligne.startsWith("## ")) { fermer(); blocs.push({ genre: "titre", texte: ligne.slice(3).trim() }); continue; }
    if (ligne.startsWith("- ")) {
      fermer();
      const dernier = blocs[blocs.length - 1];
      if (dernier?.genre === "liste") dernier.lignes.push(ligne.slice(2).trim());
      else blocs.push({ genre: "liste", lignes: [ligne.slice(2).trim()] });
      continue;
    }
    paragraphe.push(ligne);
  }
  fermer();
  return blocs;
}

/** `niveau` : le rang des titres (h2 dans une page qui a son h1). Les
 *  champs encore à compléter, entre crochets, sont surlignés. */
export function TexteConditions({ texte, niveau = 2 }: { texte: string; niveau?: 2 | 3 }) {
  const Titre = niveau === 2 ? "h2" : "h3";
  return (
    <div className="cdt-texte">
      {blocsConditions(texte).map((b, i) =>
        b.genre === "titre" ? <Titre key={i}>{b.texte}</Titre>
        : b.genre === "liste" ? <ul key={i}>{b.lignes.map((l, j) => <li key={j}><Champs texte={l} /></li>)}</ul>
        : <p key={i}><Champs texte={b.texte} /></p>,
      )}
    </div>
  );
}

function Champs({ texte }: { texte: string }) {
  const morceaux = texte.split(/(\[[^\]\n]{1,80}\])/);
  return <>{morceaux.map((m, i) => (/^\[[^\]]+\]$/.test(m) ? <mark key={i} className="cdt-a-completer">{m}</mark> : m))}</>;
}
