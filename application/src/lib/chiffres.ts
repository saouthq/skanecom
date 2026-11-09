/** Les chiffres d'un clavier arabe (٠١٢…٩, et les persans ۰۱۲…۹) ramenés
 *  aux chiffres latins, le séparateur décimal arabe (٫) à la virgule : un
 *  numéro, un prix ou une quantité se tapent ainsi sur bien des téléphones. */
export function chiffresLatins(texte: string): string {
  return texte
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ",");
}
