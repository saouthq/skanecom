import { notFound } from "next/navigation";

/* Toute adresse qui ne mène à rien dans une boutique : sa page introuvable
   (not-found.tsx, dans son layout, à ses couleurs, avec la recherche), et non
   celle du framework — en anglais, sans en-tête ni sortie. Une route
   attrape-tout a la priorité la plus basse : elle ne prend que ce qu'aucune
   autre ne sert. */
export default function AdresseInconnue(): never {
  notFound();
}
