import Link from "next/link";
import { notFound } from "next/navigation";
import { InstallerInstallation } from "@/components/InstallerInstallation";
import { getInstallation } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inst = await getInstallation(id);
  if (!inst) notFound();
  return (
    <main>
      <div className="mx-auto max-w-[1400px] px-4 pt-6 sm:px-6">
        <Link href="/installer" className="text-sm text-ink-soft hover:underline">Retour aux installations</Link>
      </div>
      <InstallerInstallation inst={inst} />
    </main>
  );
}
