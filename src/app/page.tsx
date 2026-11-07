import Link from "next/link";
import { LiveInstallationHero } from "@/components/LiveHero";
import { listInstallations } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const [first] = await listInstallations().catch(() => []);
  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:py-12">
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,460px)_1fr]">
        <div>
          <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-5xl">Chaque toit solaire, visible comme une maison.</h1>
          <p className="mt-5 max-w-[46ch] text-lg text-ink-soft">
            Helios reconstruit la maison de vos clients en 3D et y affiche la production, la consommation et la batterie mesurées par leur onduleur.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/installer" className="rounded-lg bg-ink px-5 py-3 font-semibold text-white hover:bg-ink/90">
              Ouvrir l&apos;espace installateur
            </Link>
            <Link href="/home" className="rounded-lg border border-line bg-panel px-5 py-3 font-semibold hover:bg-white">
              Voir l&apos;espace particulier
            </Link>
          </div>
          <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-ink-soft">Onduleurs</dt>
              <dd className="font-semibold">SolarEdge, Enphase</dd>
            </div>
            <div>
              <dt className="text-ink-soft">Modèle 3D</dt>
              <dd className="font-semibold">Depuis l&apos;adresse</dd>
            </div>
            <div>
              <dt className="text-ink-soft">Pour</dt>
              <dd className="font-semibold">Installateurs et clients</dd>
            </div>
          </dl>
        </div>
        {first && <LiveInstallationHero inst={first} />}
      </div>
    </main>
  );
}
