/* ============================================================================
   UNE CONFIRMATION — un geste rare et lourd (réinitialiser une double
   authentification…) demandé depuis une ligne de liste. Le formulaire est un
   popover HTML : il s'ouvre au-dessus de tout (aucune carte ne le rogne,
   au téléphone il reste à l'écran), se ferme par Échap, par un clic dehors
   ou par « Annuler », et marche sans JavaScript. Envoyé en place
   (EnvoiFormulaires), il se referme de lui-même.
   ========================================================================== */

export function Confirmation({
  id, declencheur, titre, texte, action, champs, bouton, classeDeclencheur = "btn btn-second btn-petit",
}: {
  /** Unique dans la page : il relie le bouton à son popover. */
  id: string;
  declencheur: React.ReactNode;
  titre: string;
  texte: React.ReactNode;
  action: string;
  champs: Record<string, string>;
  bouton: string;
  classeDeclencheur?: string;
}) {
  return (
    <>
      <button type="button" popoverTarget={id} className={classeDeclencheur}>{declencheur}</button>
      <form id={id} popover="auto" action={action} method="post" className="confirmation" role="dialog" aria-labelledby={`${id}-titre`}>
        {Object.entries(champs).map(([nom, valeur]) => <input key={nom} type="hidden" name={nom} value={valeur} />)}
        <p id={`${id}-titre`} className="confirmation-titre">{titre}</p>
        <p className="confirmation-texte">{texte}</p>
        <div className="confirmation-gestes">
          <button type="button" popoverTarget={id} popoverTargetAction="hide" className="btn btn-second btn-petit">Annuler</button>
          <button type="submit" className="btn btn-danger btn-petit">{bouton}</button>
        </div>
      </form>
    </>
  );
}
