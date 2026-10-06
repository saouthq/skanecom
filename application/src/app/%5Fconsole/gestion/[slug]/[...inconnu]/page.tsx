import { notFound } from "next/navigation";

/* Toute autre adresse du backoffice d'une boutique : sa page introuvable
   (../not-found.tsx), dans la coquille, et non celle du framework — en
   anglais, sans menu. Une route attrape-tout ne prend que ce qu'aucune autre
   ne sert. */
export default function AdresseInconnue() {
  notFound();
}
