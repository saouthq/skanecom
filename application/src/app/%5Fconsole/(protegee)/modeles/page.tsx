import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { LIBELLES_STATUT, LIBELLES_THEME, adresseVitrine } from "@/lib/console/libelles";
import { STRUCTURES_CONSOLE } from "@/lib/console/structures";
import type { LignePilotage } from "@/lib/console/pilotage";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { ApercuModele } from "@/components/console/ApercuModele";

export const metadata: Metadata = { title: "Modèles" };

/* LA GALERIE DES MODÈLES — chaque structure de vitrine avec sa boutique de
   démonstration (migration 78), en aperçu vivant, pour la montrer à un
   prospect ; les clientes qui l'ont prise ; et la boutique à créer sur ce
   modèle d'un geste. Une structure sans démonstration le dit, et propose
   d'en créer une. Lu avec console_pilotage, comme l'accueil. */
export default async function Modeles() {
  await exigeAdmin();
  const { data, error } = await clientService().rpc("console_pilotage");
  if (error) throw new Error(`Boutiques illisibles : ${error.message}`);
  const boutiques = (data ?? []) as LignePilotage[];
  const hoteConsole = (await headers()).get("host");
  // Ce qui se montre d'abord : les structures qui ont leur démonstration, dans l'ordre du choix.
  const aSaDemo = (code: string) => boutiques.some((b) => b.demonstration && b.marque.code === code);
  const structures = [...STRUCTURES_CONSOLE.filter((s) => aSaDemo(s.code)), ...STRUCTURES_CONSOLE.filter((s) => !aSaDemo(s.code))];
  const avecDemo = structures.filter((s) => aSaDemo(s.code)).length;

  return (
    <>
      <EnTetePage
        titre="Modèles"
        description={`Les ${structures.length} structures d'une vitrine, ${avecDemo} avec leur boutique de démonstration : à montrer à un prospect, puis à créer en un geste.`}
      />
      <div className="mo-grille">
        {structures.map((s) => {
          const demos = boutiques.filter((b) => b.demonstration && b.marque.code === s.code);
          const demo = demos.find((b) => b.statut === "active" && b.hote) ?? demos[0] ?? null;
          const clientes = boutiques.filter((b) => !b.demonstration && b.statut !== "fermee" && b.marque.code === s.code);
          const nom = LIBELLES_THEME[s.code] ?? s.code;
          const url = demo?.hote && demo.statut === "active" ? adresseVitrine(demo.hote, hoteConsole) : null;
          return (
            <section key={s.code} className="carte mo-modele" aria-labelledby={`mo-${s.code}`}>
              {demo && url ? (
                <ApercuModele url={url} nom={demo.nom} structure={nom} />
              ) : (
                <div className="mo-sans-demo">
                  <span className="vide-icone"><Icone nom="ecran" taille={20} /></span>
                  <p>
                    {demo
                      ? `Sa démonstration, ${demo.nom}, est ${(LIBELLES_STATUT[demo.statut] ?? demo.statut).toLowerCase()} : ouvrez-la pour la montrer ici.`
                      : "Pas encore de boutique de démonstration pour cette structure."}
                  </p>
                  {demo ? (
                    <Link href={`/boutiques/${demo.slug}`} className="btn btn-second">Ouvrir sa page</Link>
                  ) : (
                    <Link href={`/nouvelle-boutique?theme=${s.code}&demonstration=1`} className="btn btn-second">
                      <Icone nom="plus" taille={14} /> Créer sa démonstration
                    </Link>
                  )}
                </div>
              )}
              <div className="mo-corps">
                <div className="mo-titre">
                  <h2 id={`mo-${s.code}`}>{nom}</h2>
                  {demo ? <Link href={`/boutiques/${demo.slug}`} className="mo-demo">Démonstration : {demo.nom}</Link> : null}
                </div>
                <p className="mo-pour">{s.pour}</p>
                <p className="aide mo-clientes">
                  {clientes.length
                    ? <>Utilisée par {clientes.map((c, i) => (
                        <span key={c.id}>{i ? ", " : ""}<Link href={`/boutiques/${c.slug}`}>{c.nom}</Link></span>
                      ))}.</>
                    : "Aucune cliente ne l'a encore prise."}
                </p>
                <div className="mo-gestes">
                  <Link href={`/nouvelle-boutique?theme=${s.code}`} className="btn btn-primaire">
                    <Icone nom="plus" taille={16} /> Créer une boutique sur ce modèle
                  </Link>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
