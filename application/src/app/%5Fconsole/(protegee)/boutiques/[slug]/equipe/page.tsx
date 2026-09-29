import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { exigeAdmin } from "@/lib/console/session";
import { dateJournal } from "@/lib/console/libelles";
import { COOKIE_LIEN, ROLES_EQUIPE, VALIDITE_LIEN, cheminEquipe, lienWhatsAppPartage, messageLien, type LienRemis, type MembreEquipe } from "@/lib/console/equipe";
import { boutiqueDe, equipeDe } from "@/lib/console/equipe-serveur";
import { LIBELLES_ROLE } from "@/lib/gestion/libelles";
import { BoutonCopier } from "./BoutonCopier";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: `Équipe · ${(await params).slug}` };
}

function lienRemis(valeur: string | undefined): LienRemis | null {
  if (!valeur) return null;
  try {
    const l = JSON.parse(decodeURIComponent(valeur)) as LienRemis;
    return typeof l.lien === "string" && typeof l.email === "string" ? l : null;
  } catch {
    return null;
  }
}

/** Le lien n'est plus montré une fois qu'il a servi : l'invitation est
 *  acceptée, ou la personne s'est connectée depuis qu'il a été remis. */
function lienEncoreUtile(l: LienRemis | null, equipe: MembreEquipe[]): LienRemis | null {
  if (!l) return null;
  const m = equipe.find((x) => x.user_id === l.userId);
  if (!m || !m.actif) return null;
  if (l.type === "invite") return m.en_attente ? l : null;
  return m.derniere_connexion && new Date(m.derniere_connexion) > new Date(l.emis) ? null : l;
}

function etatDe(m: MembreEquipe): { texte: string; classe: string } {
  if (!m.actif) return { texte: "Accès retiré", classe: "statut-suspendue" };
  if (m.en_attente) return { texte: "Invitation en attente", classe: "statut-en_preparation" };
  return { texte: "Actif", classe: "statut-active" };
}

/* C4 · L'équipe d'une boutique : qui entre dans son backoffice, avec quel
   rôle. L'administrateur invite par adresse e-mail et transmet lui-même le
   lien (WhatsApp) ; il change un rôle, retire ou rend un accès, remet un
   nouveau lien (invitation expirée, mot de passe oublié). */
export default async function Equipe({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ erreur?: string; ok?: string; email?: string; role?: string }>;
}) {
  await exigeAdmin();
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const boutique = await boutiqueDe(slug);
  if (!boutique) notFound();
  const equipe = await equipeDe(boutique.id);
  const lien = lienEncoreUtile(lienRemis((await cookies()).get(COOKIE_LIEN)?.value), equipe);
  const actifs = equipe.filter((m) => m.actif).length;
  const action = cheminEquipe(slug);

  return (
    <div className="max-w-[56rem]">
      <p className="text-petit">
        <Link href="/" className="text-encre-doux hover:underline">Boutiques</Link>
        <span className="text-encre-doux"> / </span>
        <Link href={`/boutiques/${slug}`} className="text-encre-doux hover:underline">{boutique.nom}</Link>
      </p>
      <h1 className="mt-1">Équipe</h1>
      <p className="text-encre-doux mt-1">
        Les personnes qui entrent dans le backoffice de {boutique.nom} : commandes à confirmer, colis à préparer. Chacune a son
        propre compte ; vous ne connaissez jamais son mot de passe.
      </p>

      <div className="mt-6 grid gap-5">
        {messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
        {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}

        {lien ? (
          <section id="lien" className="carte carte-lien" aria-labelledby="t-lien">
            <h2 id="t-lien">{lien.type === "invite" ? "Le lien d'invitation" : "Le lien pour choisir un mot de passe"} de {lien.email}</h2>
            <p className="text-encre-doux mt-1">
              À envoyer à cette personne seulement, par WhatsApp par exemple. Il sert une seule fois, pendant {VALIDITE_LIEN}.
              Il reste affiché ici un quart d&apos;heure.
            </p>
            <label className="sr-only" htmlFor="lien-acces">Lien</label>
            <input id="lien-acces" className="lien-acces code-secret mt-3" readOnly value={lien.lien} />
            <div className="mt-3 flex flex-wrap gap-3">
              <BoutonCopier texte={lien.lien} />
              <a className="btn btn-second" href={lienWhatsAppPartage(messageLien(lien))} target="_blank" rel="noopener noreferrer">
                Envoyer par WhatsApp
              </a>
            </div>
          </section>
        ) : null}

        <section className="carte" aria-labelledby="t-membres">
          <h2 id="t-membres">Membres <span className="text-encre-doux font-normal tabular-nums">· {actifs} {actifs > 1 ? "actifs" : "actif"}</span></h2>
          {equipe.length === 0 ? (
            <p className="text-encre-doux mt-2">Personne encore. Invitez le propriétaire de la boutique ci-dessous.</p>
          ) : (
            <ul className="equipe mt-3" role="list">
              {equipe.map((m) => {
                const etat = etatDe(m);
                const qui = m.email ?? m.telephone ?? "compte sans adresse";
                const aal2 = m.role === "proprietaire" || m.role === "admin";
                return (
                  <li key={m.user_id} className={`membre${m.actif ? "" : " membre-inactif"}`}>
                    <div className="membre-qui">
                      <p className="font-medium break-all">{qui}</p>
                      <p className="text-petit text-encre-doux mt-0.5">
                        <span className={`statut ${etat.classe}`}>{etat.texte}</span>
                        {m.actif && !m.en_attente
                          ? <> · {m.derniere_connexion ? `vu le ${dateJournal(m.derniere_connexion)}` : "jamais connecté"}</>
                          : null}
                        {m.actif && aal2 ? <> · {m.double_auth ? "double authentification active" : "double authentification pas encore activée"}</> : null}
                      </p>
                    </div>
                    <div className="membre-gestes">
                      {m.actif ? (
                        <form action={`${action}/modifier`} method="post" className="membre-role">
                          <input type="hidden" name="user_id" value={m.user_id} />
                          <label className="sr-only" htmlFor={`role-${m.user_id}`}>Rôle de {qui}</label>
                          <select id={`role-${m.user_id}`} name="role" defaultValue={m.role}>
                            {ROLES_EQUIPE.map((r) => <option key={r.code} value={r.code}>{LIBELLES_ROLE[r.code]}</option>)}
                          </select>
                          <button type="submit" className="btn btn-second btn-petit">Changer</button>
                        </form>
                      ) : (
                        <span className="text-petit text-encre-doux">{LIBELLES_ROLE[m.role] ?? m.role}</span>
                      )}
                      {m.actif ? (
                        <form action={`${action}/lien`} method="post">
                          <input type="hidden" name="user_id" value={m.user_id} />
                          <button type="submit" className="btn btn-second btn-petit">
                            {m.en_attente ? "Nouvelle invitation" : "Lien de mot de passe"}
                          </button>
                        </form>
                      ) : null}
                      <form action={`${action}/modifier`} method="post">
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <input type="hidden" name="actif" value={m.actif ? "0" : "1"} />
                        <button type="submit" className={`btn btn-petit ${m.actif ? "btn-danger" : "btn-second"}`}>
                          {m.actif ? "Retirer l'accès" : "Rendre l'accès"}
                        </button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="carte" aria-labelledby="t-inviter">
          <h2 id="t-inviter">Inviter une personne</h2>
          <p className="text-encre-doux mt-1">
            La console crée son compte et vous donne un lien à lui envoyer : elle y choisit son mot de passe, puis arrive dans
            le backoffice. Quelqu&apos;un qui a déjà un compte (une autre boutique) entre avec son mot de passe habituel.
          </p>
          <form action={`${action}/inviter`} method="post" className="formulaire mt-4">
            <div className="champ">
              <label htmlFor="email">Adresse e-mail</label>
              <input id="email" name="email" type="email" required autoComplete="off" defaultValue={messages.email ?? ""} placeholder="prenom@exemple.tn" />
              <p className="aide">Son identifiant de connexion. Aucun e-mail n&apos;est envoyé : c&apos;est vous qui transmettez le lien.</p>
            </div>
            <fieldset className="roles">
              <legend>Rôle</legend>
              {ROLES_EQUIPE.map((r) => (
                <label key={r.code} className="role-choix">
                  <input type="radio" name="role" value={r.code} required defaultChecked={(messages.role ?? "confirmateur") === r.code} />
                  <span>
                    <b>{LIBELLES_ROLE[r.code]}</b>
                    <span className="aide">{r.aide}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div>
              <button type="submit" className="btn btn-primaire">Inviter</button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
