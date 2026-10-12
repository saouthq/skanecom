import Link from "next/link";
import { Icone } from "./Icone";

/* ============================================================================
   LES FICHES RÉFLEXES (État technique) — quand ça casse, quoi faire, dans
   l'ordre, avec le lien de chaque geste. Écrites pour être suivies à 3 h du
   matin, au téléphone : un symptôme, des étapes courtes, la sortie.
   ========================================================================== */

type Fiche = { id: string; symptome: string; etapes: React.ReactNode[] };

const FICHES: Fiche[] = [
  {
    id: "vitrine",
    symptome: "Une vitrine ne s'ouvre plus (ou une alerte « vitrine sans réponse »)",
    etapes: [
      <>Ouvrir son <b>diagnostic</b> (sa fiche → Diagnostic) : il essaie la vitrine à l&apos;instant et dit ce qui bloque.</>,
      <>Un certificat en erreur : son domaine ne pointe plus vers SkanEcom — voir avec le client chez son registraire, puis <a href="#t-domaines">revérifier les certificats</a>.</>,
      <>Une erreur de l&apos;application : la lire dans <a href="#t-erreurs">Erreurs de l&apos;application</a> (la pile, la route). Juste avant, dans la <a href="#t-chronologie">chronologie</a> : une mise en ligne, un réglage changé ?</>,
      <>Le temps de corriger : la <a href="#t-depannage">mettre en maintenance</a> (ses clients voient une page d&apos;attente propre, personne ne commande à moitié).</>,
      <>Corrigé : la rouvrir, et <b>vider son cache</b> si une page ancienne reste servie.</>,
    ],
  },
  {
    id: "mise-en-ligne",
    symptome: "Tout casse juste après une mise en ligne",
    etapes: [
      <>Regarder <a href="#t-version">Version en ligne</a> : « Base en retard » veut dire que le code attend une migration que la base n&apos;a pas — la jouer d&apos;abord.</>,
      <>Toutes les vitrines touchées : <a href="#t-depannage">toute la plateforme en maintenance</a> le temps d&apos;agir.</>,
      <>Revenir à la version d&apos;avant (son cache est encore là) : <code>wrangler versions deploy &lt;précédente&gt;@100% --name skanecom-application --yes</code> (docs/DEPLOIEMENT.md). La chronologie notera le retour arrière.</>,
      <>Rouvrir la plateforme ; marquer réglées les erreurs de la mauvaise version.</>,
    ],
  },
  {
    id: "courriels",
    symptome: "Les commerçants (ou leurs clients) ne reçoivent plus les e-mails",
    etapes: [
      <>La carte <a href="#t-courriels">E-mails</a> : un fournisseur « aucun » ou un secret qui manque, et rien ne part. Le dernier refus dit pourquoi (clé refusée, quota, adresse).</>,
      <><a href="#t-taches">Tâches de fond</a> : le dernier tour des e-mails de commande — ce qui est parti, ce qui a échoué, ce qui reste.</>,
      <>Une seule boutique : son diagnostic dit si quelqu&apos;un dans son équipe a une adresse, et si son domaine d&apos;envoi est vérifié.</>,
      <>La cause réglée : <a href="#t-depannage">relancer ses e-mails coincés</a> (ceux qui attendent et ceux abandonnés depuis sept jours repartent à l&apos;instant).</>,
    ],
  },
  {
    id: "skanfact",
    symptome: "Les factures n'arrivent plus dans SkanFact",
    etapes: [
      <>La carte <a href="#t-skanfact">SkanFact</a> : les boutiques dont un envoi est refusé, et pourquoi (le refus de SkanFact, en clair).</>,
      <>Un refus : le message de SkanFact dit quoi corriger ; le commerçant corrige dans son backoffice, puis on relance ses envois.</>,
      <>« Pour plus tard » partout : SkanFact ne répond pas — rien n&apos;est perdu, les envois repartent au tour de l&apos;heure suivant.</>,
    ],
  },
  {
    id: "erreurs",
    symptome: "Une avalanche d'erreurs d'un coup",
    etapes: [
      <><a href="#t-erreurs">Erreurs de l&apos;application</a> : une seule ligne qui compte des centaines de fois, ou beaucoup de lignes différentes ? La première dit où ; les secondes, souvent, la base.</>,
      <>La <a href="#t-chronologie">chronologie</a>, juste au-dessus de la première erreur : ce qui a changé.</>,
      <>La <a href="#t-base">base</a> : lente, ou trop de connexions ouvertes ? Le tableau de bord de Supabase dit la suite.</>,
    ],
  },
  {
    id: "connexion",
    symptome: "Un commerçant ne peut plus se connecter à son backoffice",
    etapes: [
      <>Sa fiche → <b>Équipe</b> : son accès est-il actif ? Un nouveau lien d&apos;accès se remet d&apos;un geste (WhatsApp ou e-mail).</>,
      <>Son téléphone perdu (double authentification) : un super-administrateur la réinitialise depuis son équipe ; il en enregistre une nouvelle à la connexion suivante.</>,
      <>La boutique suspendue : son backoffice reste ouvert, avec le message de la suspension.</>,
    ],
  },
  {
    id: "paiement",
    symptome: "Un client a payé par carte, la commande dit « non payée »",
    etapes: [
      <>Konnect prévient SkanEcom à chaque paiement (son appel passe même pendant une maintenance) ; la page de confirmation relit aussi le paiement chez Konnect quand le client y revient.</>,
      <>Rien d&apos;arrivé : vérifier le paiement dans l&apos;espace marchand Konnect du commerçant, et que son compte est bien branché — son diagnostic le dit.</>,
    ],
  },
];

export function FichesReflexes() {
  return (
    <section className="carte et-carte et-large" aria-labelledby="t-reflexes" data-niveau="neutre">
      <header className="et-tete">
        <h2 id="t-reflexes" className="carte-titre-icone"><Icone nom="question" /> Fiches réflexes</h2>
        <span className="ui-etat ui-etat-point">Quand ça casse</span>
      </header>
      <p className="aide et-alertes-regle">Un symptôme, les gestes dans l&apos;ordre, chacun avec son lien. Chaque geste passe au journal.</p>
      <div className="rf-liste">
        {FICHES.map((f) => (
          <details key={f.id} className="rf" id={`reflexe-${f.id}`}>
            <summary><span>{f.symptome}</span><Icone nom="bas" taille={14} /></summary>
            <ol>{f.etapes.map((e, i) => <li key={i}>{e}</li>)}</ol>
          </details>
        ))}
      </div>
      <p className="aide">Le diagnostic d&apos;une boutique : sa fiche, onglet <b>Diagnostic</b>. <Link href="/journal">Le journal</Link> garde qui a fait quoi.</p>
    </section>
  );
}
