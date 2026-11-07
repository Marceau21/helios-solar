import { redirect } from "next/navigation";
import { listInstallations } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Espace particulier : un client voit uniquement ses installations (RLS). En démo, on ouvre la première. */
export default async function HomeOwner() {
  const [first] = await listInstallations();
  if (!first) return <main className="p-10 text-center text-ink-soft">Aucune installation n&apos;est encore liée à votre compte.</main>;
  redirect(`/home/${first.id}`);
}
