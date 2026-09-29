import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BoutonCopier } from "@/components/console/BoutonCopier";
import { EnTetePage, initiales } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { dateJournal } from "@/lib/console/libelles";
import { COOKIE_LIEN, ROLES_EQUIPE, VALIDITE_LIEN, lienWhatsAppPartage, messageLien } from "@/lib/console/equipe";
import { cheminEquipeBoutique, lienEncoreUtile, lienRemis, type MembreBoutique } from "@/lib/gestion/equipe";
import { LIBELLES_ROLE } from "@/lib/gestion/libelles";

export const metadata: Metadata = { title: "Équipe" };

function etatDe(m: MembreBoutique): { texte: string; classe: string } {
  if (!m.actif) return { texte: "Accès retiré", classe: "ui-etat ui-etat-point" };
  if (m.en_attente) return { texte: "Invitation en attente", classe: "ui-etat ui-etat-point ui-etat-ambre" };
  return { texte: "Actif", classe: "ui-etat ui-etat-point ui-etat-vert" };
}

/* ============================================================================
   L'ÉQUIPE DE LA BOUTIQUE (B7) — le propriétaire invite ses employés, change
   leur rôle, retire ou rend un accès, remet un lien (invitation expirée, mot
   de passe oublié). L'administrateur voit l'équipe sans la changer ; les
   autres rôles n'ont pas cette page.
   ========================================================================== */
export default async function EquipeBoutique({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string; email?: string; role?: string }>;
}) {
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  if (boutique.role !== "proprietaire" && boutique.role !== "admin") redirect(`/gestion/${slug}`);
  const gere = boutique.role === "proprietaire";

  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_equipe", { p_boutique_id: boutique.boutique_id });
  if (error) throw new Error(`Équipe illisible : ${error.message}`);
  const equipe = (data ?? []) as MembreBoutique[];
  const lien = gere ? lienEncoreUtile(lienRemis((await cookies()).get(COOKIE_LIEN)?.value), equipe) : null;
  const actifs = equipe.filter((m) => m.actif).length;
  const action = cheminEquipeBoutique(slug);

  return (
    <>
      <EnTetePage
        titre="Équipe"
        description={`${actifs} ${actifs > 1 ? "personnes ont" : "personne a"} accès au backoffice de ${boutique.nom}. Chacune a son compte : personne ne connaît le mot de passe d'un autre.`}
      />

      <div className="pile">
        {messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
        {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}
        {!gere ? <p className="message">Lecture seule : le propriétaire de la boutique gère son équipe.</p> : null}

        {lien ? (
          <section id="lien" className="carte carte-lien" aria-labelledby="t-lien">
            <div className="carte-tete">
              <div>
                <h2 id="t-lien" className="carte-titre-icone">
                  <Icone nom="lien" /> {lien.type === "invite" ? "Le lien d'invitation" : "Le lien pour choisir un mot de passe"} de {lien.email}
                </h2>
                <p>À envoyer à cette personne seulement. Il sert une seule fois, pendant {VALIDITE_LIEN} ; il reste affiché ici un quart d&apos;heure.</p>
              </div>
            </div>
            <div className="lien-acces-rang">
              <div className="champ lien-acces">
                <label className="sr-only" htmlFor="lien-acces">Lien</label>
                <input id="lien-acces" className="code-secret" readOnly value={lien.lien} />
              </div>
              <BoutonCopier texte={lien.lien} />
              <a className="btn btn-succes" href={lienWhatsAppPartage(messageLien(lien))} target="_blank" rel="noopener noreferrer">
                <Icone nom="message" /> Envoyer par WhatsApp
              </a>
            </div>
          </section>
        ) : null}

        <div className="grille-2">
          <section className="carte" aria-labelledby="t-membres">
            <div className="carte-tete">
              <div>
                <h2 id="t-membres" className="carte-titre-icone"><Icone nom="equipe" /> Membres</h2>
                <p>Le propriétaire et l&apos;administrateur se connectent avec une double authentification.</p>
              </div>
            </div>
            <ul className="equipe" role="list">
              {equipe.map((m) => {
                const etat = etatDe(m);
                const qui = m.email ?? m.telephone ?? "compte sans adresse";
                const aal2 = m.role === "proprietaire" || m.role === "admin";
                return (
                  <li key={m.user_id} className={`membre${m.actif ? "" : " membre-inactif"}`}>
                    <div className="membre-qui">
                      <span className="avatar" aria-hidden="true">{initiales(qui)}</span>
                      <div>
                        <p className="membre-nom">{qui}{m.vous ? <span className="ui-etat eq-vous">Vous</span> : null}</p>
                        <p className="membre-infos">
                          <span className={etat.classe}>{etat.texte}</span>
                          {!gere || !m.actif ? <span>{LIBELLES_ROLE[m.role] ?? m.role}</span> : null}
                          {m.actif && !m.en_attente
                            ? <span>{m.derniere_connexion ? `vu le ${dateJournal(m.derniere_connexion)}` : "jamais connecté"}</span>
                            : null}
                          {m.actif && aal2 ? (
                            <span className="inline-flex items-center gap-1">
                              <Icone nom="bouclier" taille={13} />
                              {m.double_auth ? "double authentification active" : "double authentification pas encore activée"}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                    {gere ? (
                      <div className="membre-gestes">
                        {m.actif ? (
                          <form action={`${action}/modifier`} method="post" className="membre-role">
                            <input type="hidden" name="user_id" value={m.user_id} />
                            <label className="sr-only" htmlFor={`role-${m.user_id}`}>Rôle de {qui}</label>
                            <select id={`role-${m.user_id}`} name="role" defaultValue={m.role} className="entree">
                              {ROLES_EQUIPE.map((r) => <option key={r.code} value={r.code}>{LIBELLES_ROLE[r.code]}</option>)}
                            </select>
                            <button type="submit" className="btn btn-second btn-petit">Changer</button>
                          </form>
                        ) : null}
                        {m.actif && !m.vous ? (
                          m.lien_possible ? (
                            <form action={`${action}/lien`} method="post">
                              <input type="hidden" name="user_id" value={m.user_id} />
                              <button type="submit" className="btn btn-second btn-petit">
                                <Icone nom={m.en_attente ? "lien" : "cle"} taille={14} />
                                {m.en_attente ? "Nouvelle invitation" : "Lien de mot de passe"}
                              </button>
                            </form>
                          ) : (
                            <span className="aide eq-ailleurs" title="Ce compte sert aussi dans une autre boutique">Lien : par SkanEcom</span>
                          )
                        ) : null}
                        {!m.vous ? (
                          <form action={`${action}/modifier`} method="post">
                            <input type="hidden" name="user_id" value={m.user_id} />
                            <input type="hidden" name="actif" value={m.actif ? "0" : "1"} />
                            <button type="submit" className={`btn btn-petit ${m.actif ? "btn-danger" : "btn-second"}`}>
                              <Icone nom={m.actif ? "retirer" : "rendre"} taille={14} />
                              {m.actif ? "Retirer l'accès" : "Rendre l'accès"}
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          {gere ? (
            <section className="carte" aria-labelledby="t-inviter">
              <div className="carte-tete">
                <div>
                  <h2 id="t-inviter" className="carte-titre-icone"><Icone nom="plus" /> Inviter une personne</h2>
                  <p>Son compte est créé et vous recevez un lien à lui envoyer : elle y choisit son mot de passe, puis arrive dans le backoffice.</p>
                </div>
              </div>
              <form action={`${action}/inviter`} method="post" className="formulaire">
                <div className="champ">
                  <label htmlFor="email">Adresse e-mail</label>
                  <input id="email" name="email" type="email" required autoComplete="off" defaultValue={messages.email ?? ""} placeholder="prenom@exemple.tn" />
                  <p className="aide">Son identifiant. Aucun e-mail n&apos;est envoyé : c&apos;est vous qui transmettez le lien.</p>
                </div>
                <fieldset className="choix">
                  <legend>Rôle</legend>
                  {ROLES_EQUIPE.map((r) => (
                    <label key={r.code} className="choix-carte role-choix">
                      <input type="radio" name="role" value={r.code} required defaultChecked={(messages.role ?? "confirmateur") === r.code} />
                      <span>
                        <b>{LIBELLES_ROLE[r.code]}</b>
                        <span className="aide">{r.aide}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <button type="submit" className="btn btn-primaire btn-bloc">Inviter</button>
              </form>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
