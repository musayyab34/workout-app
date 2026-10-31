import { AuthForm } from "@/components/auth-form";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  return <AuthForm mode="sign-in" initialMessage={typeof error === "string" ? error.slice(0, 1000) : ""} />;
}
