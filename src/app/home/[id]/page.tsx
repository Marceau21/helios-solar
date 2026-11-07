import { notFound } from "next/navigation";
import { LiveInstallation } from "@/components/LiveInstallation";
import { getInstallation } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inst = await getInstallation(id);
  if (!inst) notFound();
  return <LiveInstallation inst={inst} />;
}
