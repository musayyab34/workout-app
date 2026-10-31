import { ProgramEditor } from "@/components/program-editor";
export default async function Page({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  return <ProgramEditor id={(await params).programId} />;
}
