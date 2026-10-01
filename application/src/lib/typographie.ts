/* La typographie française : une espace fine insécable avant « ? ! ; : » »
   et après « « » — le signe ne passe plus seul à la ligne. Appliquée aux
   textes des pages (lib/texte-riche) et à ceux des sections de l'accueil
   (texte() de lib/theme), à l'affichage : ce qui est enregistré ne change
   pas. */
export function typographie(texte: string): string {
  return texte.replace(/[ \u00a0]+([?!;:»])/g, "\u202f$1").replace(/«[ \u00a0]+/g, "«\u202f");
}
