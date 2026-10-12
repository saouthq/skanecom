/* ============================================================================
   L'INTRO DU STUDIO — au premier passage d'une visite seulement : le nom de
   la maison monte lettre à lettre, un filet se trace, puis le voile se lève
   sur l'ouverture (dont le titre attend la fin pour monter à son tour).
   CSS seul (app/studio.css), une seconde et quart, rien à cliquer : la page
   est déjà là dessous, et le voile laisse passer les clics.

   SCRIPT_INTRO, dans <head>, avant la première image : déjà vue dans cette
   visite (sessionStorage), ou la page dans un cadre (l'éditeur, la galerie
   des modèles) → <html data-intro-vue>, et le voile ne paraît pas. Sans
   JavaScript, il se joue et s'efface de lui-même ; avec « réduire les
   animations » ou hors du style expressif, il n'existe pas.
   ========================================================================== */

export const SCRIPT_INTRO =
  "try{var d=document.documentElement;if(window.self!==window.top||sessionStorage.getItem('st-intro'))d.dataset.introVue='';else sessionStorage.setItem('st-intro','1')}catch(e){document.documentElement.dataset.introVue=''}";

export function IntroStudio({ nom }: { nom: string }) {
  return (
    <div className="st-intro" aria-hidden="true">
      <span className="st-intro-nom">
        {[...nom].map((c, i) => (
          <span key={i} className="st-intro-lettre" style={{ "--i": i } as React.CSSProperties}>{c === " " ? " " : c}</span>
        ))}
      </span>
      <span className="st-intro-filet" />
    </div>
  );
}
