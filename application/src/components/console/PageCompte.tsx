import { EnTetePage, initiales, styleAvatar } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { BoutonCopier } from "@/components/console/BoutonCopier";
import { BoutonImprimer } from "@/components/console/BoutonImprimer";
import { ChampMotDePasse } from "@/components/console/ChampMotDePasse";
import { Confirmation } from "@/components/console/Confirmation";
import { LONGUEUR_MOT_DE_PASSE } from "@/lib/console/equipe";

/* ============================================================================
   MON COMPTE — la même page pour l'équipe SkanEcom (/compte) et pour celle
   d'une boutique (/gestion/<boutique>/compte) : qui l'on est, son mot de
   passe, sa double authentification et ses codes de secours, ses sessions.
   Chaque carte dit le résultat de son geste à sa place (?carte=…).
   ========================================================================== */

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Tunis" });

export type DonneesCompte = {
  email: string;
  role: string;
  retour: string;
  /** null : la double authentification n'est pas demandée pour ce rôle (aucun facteur). */
  doubleAuth: boolean;
  codes: { restants: number; crees_le: string | null };
  codesNeufs: string[] | null;
  messages: { ok?: string; erreur?: string; carte?: string };
};

function Retour({ carte, messages }: { carte: string; messages: DonneesCompte["messages"] }) {
  if (messages.carte !== carte) return null;
  if (messages.erreur) return <p className="message message-erreur bt-retour" role="alert">{messages.erreur}</p>;
  if (messages.ok) return <p className="message message-succes bt-retour" role="status">{messages.ok}</p>;
  return null;
}

export function PageCompte({ d }: { d: DonneesCompte }) {
  return (
    <>
      <EnTetePage titre="Mon compte" description={`Ce que vous réglez pour vous seul : votre mot de passe, ${d.doubleAuth ? "vos codes de secours, " : ""}vos appareils.`} />
      <div className="cp-grille">
        <section className="carte cp-qui" aria-label="Vous">
          <span className="avatar avatar-grand" style={styleAvatar(d.email)} aria-hidden="true">{initiales(d.email)}</span>
          <div>
            <p className="cp-email">{d.email}</p>
            <p className="aide">{d.role}{d.doubleAuth ? <> · <span className="ep-ok"><Icone nom="bouclier" taille={12} /> double authentification</span></> : null}</p>
          </div>
        </section>

        <section className="carte" aria-labelledby="t-mot-de-passe" id="mot-de-passe">
          <div className="carte-tete">
            <div>
              <h2 id="t-mot-de-passe" className="carte-titre-icone"><Icone nom="cle" /> Mot de passe</h2>
              <p>L&apos;actuel d&apos;abord, puis le nouveau, deux fois ({LONGUEUR_MOT_DE_PASSE} caractères au moins).</p>
            </div>
          </div>
          <Retour carte="mot-de-passe" messages={d.messages} />
          <form action="/compte/mot-de-passe" method="post" className="formulaire">
            <input type="hidden" name="retour" value={d.retour} />
            {/* (l'adresse, pour que le gestionnaire de mots de passe sache à quel compte il touche) */}
            <input type="email" name="email" value={d.email} autoComplete="username" readOnly hidden />
            <div className="champ">
              <label htmlFor="cp-actuel">Mot de passe actuel</label>
              <ChampMotDePasse id="cp-actuel" name="actuel" autoComplete="current-password" autoFocus={d.messages.carte === "mot-de-passe" && Boolean(d.messages.erreur)} />
            </div>
            <div className="grille-champs">
              <div className="champ">
                <label htmlFor="cp-nouveau">Nouveau mot de passe</label>
                <ChampMotDePasse id="cp-nouveau" name="nouveau" autoComplete="new-password" minLength={LONGUEUR_MOT_DE_PASSE} />
              </div>
              <div className="champ">
                <label htmlFor="cp-confirmation">Le nouveau, encore</label>
                <ChampMotDePasse id="cp-confirmation" name="confirmation" autoComplete="new-password" minLength={LONGUEUR_MOT_DE_PASSE} />
              </div>
            </div>
            <div><button type="submit" className="btn btn-primaire">Changer le mot de passe</button></div>
          </form>
        </section>

        {/* Sans double authentification (rôles de terrain), pas de codes à garder : pas de carte. */}
        {d.doubleAuth ? (
          <section className="carte" aria-labelledby="t-secours" id="secours">
            <div className="carte-tete">
              <div>
                <h2 id="t-secours" className="carte-titre-icone"><Icone nom="bouclier" /> Codes de secours</h2>
                <p>Si vous perdez votre téléphone : un code remplace celui de l&apos;application, une seule fois, et vous enregistrez la nouvelle.</p>
              </div>
            </div>
            <Retour carte="secours" messages={d.messages} />
            {d.codesNeufs ? (
              <div className="cp-codes-neufs">
                <p className="message message-attention" role="status">
                  Notez-les maintenant : ils ne seront plus montrés. Rangez-les loin du téléphone qui porte votre application : sur papier, ou dans un gestionnaire de mots de passe.
                </p>
                <ol className="cp-codes" aria-label="Vos dix codes de secours">
                  {d.codesNeufs.map((c) => <li key={c}><code>{c}</code></li>)}
                </ol>
                <div className="cp-gestes">
                  <BoutonCopier texte={d.codesNeufs.join("\n")} libelle="Copier les dix codes" classe="btn btn-second" />
                  <BoutonImprimer libelle="Imprimer" classe="btn btn-second" />
                  <form action="/compte/codes-secours" method="post">
                    <input type="hidden" name="retour" value={d.retour} />
                    <button type="submit" name="geste" value="noter" className="btn btn-primaire">C&apos;est noté</button>
                  </form>
                </div>
              </div>
            ) : (
              <div className="cp-codes-etat">
                {d.codes.restants > 0 && d.codes.restants <= 3 ? (
                  <p className="message message-attention">Plus que {d.codes.restants} code{d.codes.restants > 1 ? "s" : ""} de secours : remplacez-les avant d&apos;en manquer.</p>
                ) : d.codes.restants > 0 ? (
                  <p>
                    <b>{d.codes.restants} code{d.codes.restants > 1 ? "s" : ""}</b> encore valable{d.codes.restants > 1 ? "s" : ""}
                    {d.codes.crees_le ? <span className="discret">, créés le {JOUR.format(new Date(d.codes.crees_le))}</span> : null}.
                  </p>
                ) : (
                  <p className="message message-attention">Aucun code de secours : un téléphone perdu, et il faudra qu&apos;un super-administrateur réinitialise votre double authentification.</p>
                )}
                {d.codes.restants > 0 ? (
                  <Confirmation
                    id="cp-remplacer"
                    declencheur="Remplacer mes codes"
                    classeDeclencheur={d.codes.restants <= 3 ? "btn btn-primaire" : "btn btn-second"}
                    titre="Remplacer vos codes de secours ?"
                    texte="Dix nouveaux codes, montrés une seule fois. Les anciens, ceux que vous avez notés, ne valent plus."
                    action="/compte/codes-secours"
                    champs={{ retour: d.retour, geste: "creer" }}
                    bouton="Remplacer"
                  />
                ) : (
                  <form action="/compte/codes-secours" method="post">
                    <input type="hidden" name="retour" value={d.retour} />
                    <button type="submit" name="geste" value="creer" className="btn btn-primaire">Créer mes codes de secours</button>
                  </form>
                )}
              </div>
            )}
          </section>
        ) : null}

        <section className="carte" aria-labelledby="t-sessions" id="sessions">
          <div className="carte-tete">
            <div>
              <h2 id="t-sessions" className="carte-titre-icone"><Icone nom="ecran" /> Vos appareils</h2>
              <p>Un téléphone perdu, un ordinateur prêté : fermez toutes vos sessions d&apos;un geste, celle-ci comprise.</p>
            </div>
          </div>
          <Confirmation
            id="cp-deconnexion"
            declencheur={<><Icone nom="sortie" taille={14} /> Se déconnecter de tous les appareils</>}
            classeDeclencheur="btn btn-second"
            titre="Se déconnecter de tous les appareils ?"
            texte="Chaque session ouverte avec ce compte se ferme, ici comme ailleurs. Vous vous reconnecterez avec votre mot de passe et votre double authentification."
            action="/compte/deconnexion"
            champs={{ retour: d.retour }}
            bouton="Tout déconnecter"
          />
        </section>
      </div>
    </>
  );
}
