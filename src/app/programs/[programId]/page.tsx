import { notFound } from "next/navigation";
import { getProgram } from "@/programs/catalog";
import { ProgramScreen } from "@/components/program-screen";
export default async function ProgramPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  const program = getProgram(programId);
  if (!program) notFound();
  return <ProgramScreen program={program} />;
}
