import { ProgramResolver } from "@/components/program-resolver";
export default async function Page({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  return <ProgramResolver id={(await params).programId} />;
}
