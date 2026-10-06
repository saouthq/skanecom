import { notFound } from "next/navigation";

/* Toute autre adresse de la console : sa page introuvable (../not-found.tsx),
   et non celle du framework — en anglais, sans sortie. */
export default function AdresseInconnue() {
  notFound();
}
