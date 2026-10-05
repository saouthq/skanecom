import type { Metadata } from "next";
import Link from "next/link";
import { exigeAdmin } from "@/lib/console/session";
import { clientService } from "@/lib/console/service";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { ChoixMetier } from "@/components/console/ChoixMetier";
import type { Metier } from "@/lib/console/metiers";
import { LIBELLES_THEME } from "@/lib/console/libelles";
import { STRUCTURES_CONSOLE } from "@/lib/console/structures";

export const metadata: Metadata = { title: "Nouvelle boutique" };

/* C1 · Créer une boutique et lui attribuer son domaine. Elle naît « en
   préparation » : rien n'est visible tant qu'on ne l'ouvre pas. Son métier,
   s'il est choisi, pose d'un geste ses rayons, ses caractéristiques, sa
   palette et sa structure (…_metiers.sql) ; sans métier, on choisit la
   structure et l'on part de zéro. */
export default async function NouvelleBoutique({ searchParams }: {
  searchParams: Promise<{ erreur?: string; nom?: string; slug?: string; hote?: string; theme?: string; metier?: string; demonstration?: string }>;
}) {
  const { user } = await exigeAdmin();
  const v = await searchParams;
  const { data } = await clientService().rpc("console_metiers", { p_acteur: user.id });
  const metiers = (data ?? []) as Metier[];
  return (
    <div className="max-w-[48rem]">
      <EnTetePage
        avant={<Link href="/"><Icone nom="retour" taille={14} /> Boutiques</Link>}
        titre="Nouvelle boutique"
        description="Elle naîtra « en préparation » : la vitrine ne l'affiche qu'une fois ouverte."
      />

      <form action="/nouvelle-boutique/creer" method="post" className="carte formulaire">
        {v.erreur ? <p className="message message-erreur" role="alert">{v.erreur}</p> : null}
        <div className="champ">
          <label htmlFor="nom">Nom de la boutique</label>
          <input id="nom" name="nom" required maxLength={80} defaultValue={v.nom ?? ""} autoFocus placeholder="Maymar" />
        </div>
        <div className="deux-colonnes">
          <div className="champ">
            <label htmlFor="slug">Identifiant</label>
            <input id="slug" name="slug" required pattern="[a-z0-9]([a-z0-9\-]{0,46}[a-z0-9])?" maxLength={48} defaultValue={v.slug ?? ""}
              aria-describedby="aide-slug" placeholder="maymar" />
            <p id="aide-slug" className="aide">Minuscules, chiffres et tirets. Il ne change plus ensuite.</p>
          </div>
          <div className="champ">
            <label htmlFor="hote">Domaine principal</label>
            <input id="hote" name="hote" required placeholder="maymar.tn" defaultValue={v.hote ?? ""} aria-describedby="aide-hote" />
            <p id="aide-hote" className="aide">Sans « https:// ». Les autres s&apos;ajoutent ensuite.</p>
          </div>
        </div>
        <ChoixMetier metiers={metiers} choisi={v.metier} />
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
        <label className="choix-carte">
          <input type="checkbox" name="demonstration" value="1" defaultChecked={v.demonstration === "1"} />
          <span>
            <b>Boutique de démonstration</b>
            <span className="aide">Pour la montrer aux prospects, pas un client : ses commandes ne compteront pas dans la synthèse de la console. Cela se change ensuite sur sa page.</span>
          </span>
        </label>
        <div className="carte-pied">
          <span className="aide">Ensuite : la marque, le catalogue, l&apos;équipe.</span>
          <button type="submit" className="btn btn-primaire">Créer la boutique</button>
        </div>
      </form>
    </div>
  );
}
