// La feuille de la console : ici, pas dans le layout racine (voir ./layout.tsx).
import "./feuille.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Porte } from "@/components/console/Porte";

export const metadata: Metadata = { title: "Page introuvable" };

/* Une adresse de la console qui ne mène nulle part : la porte de SkanEcom, en
   français, avec une sortie. L'accueil renvoie chacun chez lui : la console
   pour l'équipe SkanEcom, le backoffice pour l'équipe d'une boutique, la
   connexion sinon. Le backoffice d'une boutique a la sienne, dans sa coquille
   (gestion/[slug]/not-found.tsx). */
export default function Introuvable() {
  return (
    <Porte
      titre="Page introuvable"
      description="Cette adresse ne mène à aucun écran : elle a peut-être changé, ou un caractère manque."
    >
      <Link className="btn btn-primaire btn-bloc" href="/">Revenir à l&apos;accueil</Link>
    </Porte>
  );
}
