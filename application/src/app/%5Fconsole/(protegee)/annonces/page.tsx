import type { Metadata } from "next";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { dateJournal } from "@/lib/console/libelles";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import type { DonneesFormules } from "@/lib/console/formules";
import { NIVEAUX_ANNONCE as NIVEAUX } from "@/lib/console/annonces";

export const metadata: Metadata = { title: "Annonces" };

/* ============================================================================
   LES ANNONCES AUX COMMERÇANTS — un message de SkanEcom (une nouveauté,
   une maintenance prévue) en bandeau dans le back-office des boutiques
   visées, sur une période. Chacun la ferme pour soi ; la console dit
   combien l'ont fermée.
   ========================================================================== */

type Annonce = {
  id: number; titre: string; texte: string; niveau: "info" | "nouveaute" | "maintenance"; lien: string | null;
  debut: string; fin: string | null; etat: "prevue" | "en_cours" | "finie";
  cible: { id: string; nom: string }[] | null; fermee_par: number; auteur: string | null;
};

const ETATS: Record<Annonce["etat"], string> = { en_cours: "En cours", prevue: "Prévues", finie: "Finies" };

export default async function Annonces({ searchParams }: { searchParams: Promise<{ ok?: string; erreur?: string }> }) {
  const { user } = await exigeAdmin();
  const messages = await searchParams;
  const service = clientService();
  const [{ data, error }, { data: df }] = await Promise.all([
    service.rpc("console_annonces", { p_acteur: user.id }),
    service.rpc("console_formules", { p_acteur: user.id }),
  ]);
  if (error) throw new Error(`Annonces illisibles : ${error.message}`);
  const annonces = (data ?? []) as Annonce[];
  // Les clientes d'abord, puis les démonstrations (qui ne la reçoivent que cochées) ; jamais une boutique fermée.
  const boutiques = ((df ?? { boutiques: [] }) as DonneesFormules).boutiques
    .filter((b) => b.statut !== "fermee")
    .sort((a, b) => Number(a.demonstration) - Number(b.demonstration));

  return (
    <>
      <EnTetePage titre="Annonces" description="Un message aux équipes des boutiques, en bandeau dans leur back-office. Chacun le ferme pour soi." />
      {messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
      {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}

      <div className="an-cadre">
        <section className="carte" aria-labelledby="t-nouvelle-annonce">
          <div className="carte-tete">
            <div>
              <h2 id="t-nouvelle-annonce" className="carte-titre-icone"><Icone nom="cloche" /> Nouvelle annonce</h2>
              <p>Courte : un titre, deux phrases, un lien s&apos;il y a plus à lire.</p>
            </div>
          </div>
          <form action="/annonces/publier" method="post" className="formulaire">
            <fieldset className="choix choix-3">
              <legend>Genre</legend>
              {(Object.keys(NIVEAUX) as Annonce["niveau"][]).map((n) => (
                <label key={n} className="choix-carte">
                  <input type="radio" name="niveau" value={n} defaultChecked={n === "info"} />
                  <span><b>{NIVEAUX[n].titre}</b><span className="aide">{NIVEAUX[n].aide}</span></span>
                </label>
              ))}
            </fieldset>
            <div className="champ">
              <label htmlFor="an-titre">Titre</label>
              <input id="an-titre" name="titre" required minLength={2} maxLength={80} placeholder="Ex. Les précommandes arrivent" />
            </div>
            <div className="champ">
              <label htmlFor="an-texte">Message</label>
              <textarea id="an-texte" name="texte" required minLength={2} maxLength={400} rows={3}
                placeholder="Ex. Vendez une pièce annoncée avant son arrivée : Réglages → Fonctions de la vitrine." />
            </div>
            <div className="champ">
              <label htmlFor="an-lien">Lien <span className="discret">(facultatif)</span></label>
              <input id="an-lien" name="lien" maxLength={300} placeholder="https://… ou /gestion/…" />
            </div>
            <div className="grille-champs">
              <div className="champ">
                <label htmlFor="an-debut">À partir du <span className="discret">(heure de Tunis)</span></label>
                <input id="an-debut" name="debut" type="datetime-local" />
                <span className="aide">Vide : tout de suite.</span>
              </div>
              <div className="champ">
                <label htmlFor="an-fin">Jusqu&apos;au <span className="discret">(facultatif)</span></label>
                <input id="an-fin" name="fin" type="datetime-local" />
                <span className="aide">Vide : jusqu&apos;à ce que vous l&apos;arrêtiez.</span>
              </div>
            </div>
            <fieldset className="an-cible">
              <legend>Pour</legend>
              <label className="opt"><input type="radio" name="toutes" value="1" defaultChecked /> Toutes les boutiques</label>
              <label className="opt"><input type="radio" name="toutes" value="0" /> Seulement ces boutiques :</label>
              <div className="an-boutiques">
                {boutiques.map((b) => (
                  <label key={b.id} className="opt"><input type="checkbox" name="boutique" value={b.id} /> {b.nom}{b.demonstration ? <span className="an-demo"> · démo</span> : null}</label>
                ))}
              </div>
            </fieldset>
            <div className="carte-pied">
              <span className="aide">Les démonstrations ne la reçoivent que si on les coche.</span>
              <button type="submit" className="btn btn-primaire">Publier</button>
            </div>
          </form>
        </section>

        <div className="pile">
          {(["en_cours", "prevue", "finie"] as const).map((etat) => {
            const liste = annonces.filter((a) => a.etat === etat);
            if (!liste.length && etat !== "en_cours") return null;
            return (
              <section key={etat} className="carte" aria-labelledby={`t-an-${etat}`}>
                <h2 id={`t-an-${etat}`} className="an-groupe">{ETATS[etat]} <span className="compte-onglet">{liste.length}</span></h2>
                {liste.length === 0 ? <p className="discret">Aucune annonce en cours.</p> : (
                  <ul className="an-liste" role="list">
                    {liste.map((a) => (
                      <li key={a.id} data-niveau={a.niveau}>
                        <p className="an-titre"><span className="ui-etat">{NIVEAUX[a.niveau].titre}</span> <b>{a.titre}</b></p>
                        <p className="an-texte">{a.texte}</p>
                        {a.lien ? <p className="aide">Lien : {a.lien}</p> : null}
                        <p className="an-meta">
                          {dateJournal(a.debut)}{a.fin ? ` → ${dateJournal(a.fin)}` : ", sans fin"} ·{" "}
                          {a.cible ? a.cible.map((c) => c.nom).join(", ") : "toutes les boutiques"} ·{" "}
                          {a.fermee_par ? `fermée par ${a.fermee_par} personne${a.fermee_par > 1 ? "s" : ""}` : "personne ne l'a encore fermée"}{a.auteur ? ` · ${a.auteur}` : ""}
                        </p>
                        <form action="/annonces/arreter" method="post" className="an-gestes">
                          <input type="hidden" name="annonce_id" value={a.id} />
                          {etat !== "finie" ? <button type="submit" name="geste" value="arreter" className="btn btn-second btn-petit">Arrêter</button> : null}
                          <button type="submit" name="geste" value="supprimer" className="btn btn-danger btn-petit" aria-label={`Supprimer l'annonce ${a.titre}`}>
                            <Icone nom="corbeille" taille={14} /> Supprimer
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
