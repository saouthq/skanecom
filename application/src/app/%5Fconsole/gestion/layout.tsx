// gestion.css importe d'abord la feuille de la console (../feuille.css).
import "./gestion.css";

/* Le backoffice des boutiques : même domaine et même connexion que la
   console, sa propre feuille. Chaque page vérifie le membre (exigeMembre). */
export default function Gestion({ children }: { children: React.ReactNode }) {
  return children;
}
