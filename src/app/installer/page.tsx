import Link from "next/link";
import { PortfolioTable } from "@/components/PortfolioTable";
import { listInstallations } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function InstallerHome() {
  const list = await listInstallations();
  const items = list.map((i) => ({
    id: i.id,
    customerName: i.customerName,
    address: i.address,
    kwc: (i.layout.panels.length * i.layout.panelWattage) / 1000 || i.systemSizeKw,
    hasBattery: i.devices.some((d) => d.kind === "battery"),
    isDemo: i.isDemo,
  }));
  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Vos installations</h1>
          <p className="text-sm text-ink-soft">Actualisé toutes les 30 secondes.</p>
        </div>
        <Link href="/installer/new" className="rounded-lg bg-ink px-4 py-2.5 font-semibold text-white hover:bg-ink/90">
          Ajouter un client
        </Link>
      </div>
      <PortfolioTable items={items} />
    </main>
  );
}
