import type { Metadata } from "next";
import Link from "next/link";
import { exigeAdmin } from "@/lib/console/session";
import { clientService } from "@/lib/console/service";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { ChoixMetier } from "@/components/console/ChoixMetier";
import { IdentifiantDepuisNom } from "@/components/console/IdentifiantDepuisNom";
import { AssistantCreation } from "@/components/console/AssistantCreation";
import type { Metier } from "@/lib/console/metiers";
import { LIBELLES_THEME } from "@/lib/console/libelles";
import { STRUCTURES_CONSOLE } from "@/lib/console/structures";
import { SANS_FORMULE, type DonneesFormules } from "@/lib/console/formules";
import { formateMontant } from "@/lib/prix";

export const metadata: Metadata = { title: "Nouvelle boutique" };

const ETAPES = ["Le client", "Le métier", "L'apparence", "L'offre"];

/* C1 · Créer une boutique et lui attribuer son domaine, en quatre étapes
   (le client, le métier, l'apparence, l'offre) et un récapitulatif. Elle
   naît « en préparation » : rien n'est visible tant qu'on ne l'ouvre pas.
   Son métier, s'il est choisi, pose d'un geste ses rayons, ses
   caractéristiques, sa palette et sa structure (…_metiers.sql) ; sans
   métier, on choisit la structure et l'on part de zéro. La personne à
   appeler, notée ici, va dans « Le client » de sa fiche. */
export default async function NouvelleBoutique({ searchParams }: {
  searchParams: Promise<{ erreur?: string; nom?: string; slug?: string; hote?: string; theme?: string; metier?: string; demonstration?: string; formule?: string; modele?: string; contact_nom?: string; contact_telephone?: string; prospect?: string }>;
}) {
  const { user, role } = await exigeAdmin();
  const v = await searchParams;
  const [{ data }, { data: df }] = await Promise.all([
    clientService().rpc("console_metiers", { p_acteur: user.id }),
    clientService().rpc("console_formules", { p_acteur: user.id }),
  ]);
  const metiers = (data ?? []) as Metier[];
  // « À partir de » une boutique : sa configuration, à la place d'un métier et d'une structure.
  const { data: dmodele } = v.modele ? await clientService().rpc("console_boutique", { p_slug: v.modele }) : { data: null };
  const modele = dmodele ? (dmodele as { boutique: { slug: string; nom: string }; theme: { code: string } | null }) : null;
  const donneesFormules = (df ?? { formules: [], droits: [] }) as DonneesFormules;
  const formules = donneesFormules.formules;
  // Les modules construits, et les formules qui ouvrent chacun (pour dire, en direct, ceux qui seront un ajout).
  const modules = donneesFormules.droits.filter((d) => d.genre === "module" && d.disponible);
  return (
    <div className="max-w-[48rem]">
      <EnTetePage
        avant={<Link href="/"><Icone nom="retour" taille={14} /> Boutiques</Link>}
        titre="Nouvelle boutique"
        description="Elle naîtra « en préparation » : la vitrine ne l'affiche qu'une fois ouverte."
      />

      <form action="/nouvelle-boutique/creer" method="post" className="carte formulaire nb-formulaire">
        <IdentifiantDepuisNom />
        {/* Créée depuis un prospect : il passera « gagné », sa boutique rattachée. */}
        {v.prospect && /^[0-9a-f-]{36}$/.test(v.prospect) ? <input type="hidden" name="prospect" value={v.prospect} /> : null}
        {/* Quatre étapes, une à la fois (AssistantCreation) ; sans JavaScript, le formulaire entier. */}
        <AssistantCreation etapeInitiale={0} />
        <ol className="nb-tete" aria-label="Les étapes">
          {ETAPES.map((e, i) => (
            <li key={e}>
              <button type="button" data-aller={i} className="nb-tete-etape" aria-current={i === 0 ? "step" : "false"}>
                <span className="nb-tete-numero" aria-hidden="true">{i + 1}</span>
                <span>{e}</span>
              </button>
            </li>
          ))}
        </ol>
        {v.erreur ? <p className="message message-erreur" role="alert">{v.erreur}</p> : null}
        {v.prospect && !v.erreur ? <p className="message">Pour le prospect « {v.nom} » : ce qu&apos;on sait de lui est déjà rempli. Créée, la boutique le fera passer « gagné ».</p> : null}

        <fieldset className="nb-etape" data-etape="client">
          <legend className="nb-etape-titre" tabIndex={-1}>1. Le client</legend>
          <div className="champ">
            <label htmlFor="nom">Nom de la boutique</label>
            <input id="nom" name="nom" required maxLength={80} defaultValue={v.nom ?? ""} autoFocus placeholder="Maymar" />
          </div>
          <div className="deux-colonnes">
            <div className="champ">
              <label htmlFor="slug">Identifiant</label>
              <input id="slug" name="slug" required pattern="[a-z0-9]([a-z0-9\-]{0,46}[a-z0-9])?" maxLength={48} defaultValue={v.slug ?? ""}
                aria-describedby="aide-slug" placeholder="maymar" />
              <p id="aide-slug" className="aide">Tiré du nom ; minuscules, chiffres et tirets. Il ne change plus ensuite.</p>
            </div>
            <div className="champ">
              <label htmlFor="hote">Domaine principal</label>
              <input id="hote" name="hote" required placeholder="maymar.tn" defaultValue={v.hote ?? ""} aria-describedby="aide-hote" />
              <p id="aide-hote" className="aide">Sans « https:// ». Les autres s&apos;ajoutent ensuite.</p>
            </div>
          </div>
          <div className="deux-colonnes">
            <div className="champ">
              <label htmlFor="contact_nom">Personne à appeler <span className="discret">(facultatif)</span></label>
              <input id="contact_nom" name="contact_nom" maxLength={120} defaultValue={v.contact_nom ?? ""} autoComplete="off" placeholder="Prénom Nom, son rôle" />
            </div>
            <div className="champ">
              <label htmlFor="contact_telephone">Son téléphone <span className="discret">(facultatif)</span></label>
              <input id="contact_telephone" name="contact_telephone" type="tel" inputMode="tel" defaultValue={v.contact_telephone ?? ""}
                pattern="[0-9+ .\(\)\-]{8,20}" title="Huit chiffres au moins, par exemple 20 123 456" autoComplete="off" placeholder="20 123 456" />
            </div>
          </div>
          <div className="nb-nav"><span /><button type="button" data-suivant className="btn btn-primaire">Continuer <Icone nom="droite" taille={14} /></button></div>
        </fieldset>

        <fieldset className="nb-etape" data-etape="metier">
          <legend className="nb-etape-titre" tabIndex={-1}>2. Le métier</legend>
          {modele ? (
            <div className="message nb-modele">
              <input type="hidden" name="modele" value={modele.boutique.slug} />
              <p>
                <b>À partir de {modele.boutique.nom}</b> : son apparence ({LIBELLES_THEME[modele.theme?.code ?? "editorial"] ?? modele.theme?.code}), ses réglages, sa livraison, ses rayons
                et leurs caractéristiques. Ni ses images, ni son catalogue, ni ses clients, ni ses informations légales.{" "}
                <Link href="/nouvelle-boutique" className="btn-lien whitespace-nowrap">Partir de zéro plutôt</Link>
              </p>
            </div>
          ) : <ChoixMetier metiers={metiers} choisi={v.metier} />}
          <div className="nb-nav">
            <button type="button" data-precedent className="btn btn-fantome"><Icone nom="gauche" taille={14} /> Retour</button>
            <button type="button" data-suivant className="btn btn-primaire">Continuer <Icone nom="droite" taille={14} /></button>
          </div>
        </fieldset>

        <fieldset className="nb-etape" data-etape="apparence">
          <legend className="nb-etape-titre" tabIndex={-1}>3. L&apos;apparence</legend>
          {modele ? <p className="aide">Celle de {modele.boutique.nom}, reprise telle quelle ; elle se change ensuite dans Marque.</p> : (
            <>
              {/* Un métier pose sa structure : le choix ne sert que pour « partir de zéro ». */}
              <p className="aide nb-structure-metier" data-structure-metier>La structure suit le métier choisi (indiquée sur sa carte) ; elle se change ensuite dans Marque.</p>
              <fieldset className="choix choix-2 mt-gabarit">
                <legend>Structure</legend>
                {STRUCTURES_CONSOLE.map((x) => (
                  <label key={x.code} className="choix-carte">
                    <input type="radio" name="theme" value={x.code} defaultChecked={(v.theme ?? "editorial") === x.code} />
                    <span>
                      <b>{LIBELLES_THEME[x.code]}</b>
                      <span className="aide">{x.aide}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            </>
          )}
          <p className="aide">Le logo, les couleurs et les photos se posent ensuite, dans Marque, avec l&apos;aperçu.</p>
          <div className="nb-nav">
            <button type="button" data-precedent className="btn btn-fantome"><Icone nom="gauche" taille={14} /> Retour</button>
            <button type="button" data-suivant className="btn btn-primaire">Continuer <Icone nom="droite" taille={14} /></button>
          </div>
        </fieldset>

        <fieldset className="nb-etape" data-etape="offre">
          <legend className="nb-etape-titre" tabIndex={-1}>4. L&apos;offre</legend>
          {/* La formule vendue engage le client : le super-administrateur la pose (le support crée « sur mesure »). */}
          {role !== "super_admin" ? (
            <p className="aide">Elle naîtra « sur mesure » (tout ouvert) : un super-administrateur posera sa formule.</p>
          ) : <fieldset className="choix choix-2 nb-formules">
            <legend>Formule vendue</legend>
            {formules.map((f) => (
              <label key={f.code} className="choix-carte">
                <input type="radio" name="formule" value={f.code} defaultChecked={v.formule === f.code} />
                <span>
                  <b>{f.nom}{f.prix !== null ? <span className="discret"> · {formateMontant(f.prix)} TND / mois</span> : null}</b>
                  {f.description ? <span className="aide">{f.description}</span> : null}
                </span>
              </label>
            ))}
            <label className="choix-carte">
              <input type="radio" name="formule" value="" defaultChecked={!v.formule} />
              <span>
                <b>{SANS_FORMULE}</b>
                <span className="aide">Tout est ouvert. Pour une démonstration, ou un client dont l&apos;offre n&apos;est pas encore arrêtée.</span>
              </span>
            </label>
          </fieldset>}
          {role === "super_admin" && modules.length ? (
            <fieldset className="choix choix-2 nb-modules">
              <legend>Modules à activer dès maintenant <span className="aide">Tout se change ensuite dans son onglet Modules.</span></legend>
              {modules.map((m) => (
                <label key={m.code} className="choix-carte nb-module"
                  data-formules={formules.filter((f) => f.droits.includes(m.code)).map((f) => f.code).join(" ")}>
                  <input type="checkbox" name="module" value={m.code.replace(/^module\./, "")} />
                  <span>
                    <b>{m.libelle}</b>
                    {m.description ? <span className="aide">{m.description}</span> : null}
                    <span className="ui-etat ui-etat-point ui-etat-ambre nb-hors">Hors de la formule choisie : lui sera ouvert en plus</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}
          {/* « Hors formule », en direct : selon la formule cochée (sur mesure ouvre tout). */}
          <style>{formules.map((f) => `.nb-formulaire:has(input[name="formule"][value="${f.code}"]:checked) .nb-module:not([data-formules~="${f.code}"]):has(input:checked) .nb-hors { display: inline-flex; }`).join("\n")}</style>
          <label className="choix-carte">
            <input type="checkbox" name="demonstration" value="1" defaultChecked={v.demonstration === "1"} />
            <span>
              <b>Boutique de démonstration</b>
              <span className="aide">Pour la montrer aux prospects, pas un client : ses commandes ne compteront pas dans la synthèse de la console. Cela se change ensuite sur sa page.</span>
            </span>
          </label>
          {/* Le récapitulatif, rempli par l'assistant avant de créer. */}
          <div className="nb-recap">
            <p className="nb-recap-titre">Avant de créer</p>
            <dl data-recap />
          </div>
          <div className="nb-nav">
            <button type="button" data-precedent className="btn btn-fantome"><Icone nom="gauche" taille={14} /> Retour</button>
            <button type="submit" className="btn btn-primaire">Créer la boutique</button>
          </div>
          <p className="aide nb-ensuite">Elle naît « en préparation ». Ensuite : la marque, le catalogue, l&apos;équipe.</p>
        </fieldset>
      </form>
    </div>
  );
}
