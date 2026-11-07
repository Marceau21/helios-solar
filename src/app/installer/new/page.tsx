import Link from "next/link";
import { NewInstallationForm } from "@/components/NewInstallationForm";

export default function NewInstallation() {
  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <Link href="/installer" className="text-sm text-ink-soft hover:underline">Retour aux installations</Link>
      <h1 className="mt-2 mb-5 text-2xl font-extrabold tracking-tight sm:text-3xl">Nouveau client</h1>
      <NewInstallationForm />
    </main>
  );
}
