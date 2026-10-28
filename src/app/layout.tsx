import type { Metadata, Viewport } from "next";
import { AppProvider } from "@/features/workout/provider";
import { Shell } from "@/components/shell";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "FORM — Personal training", template: "%s · FORM" },
  description:
    "Your training, one deliberate session at a time. A private, local fitness tracker.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0f14",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppProvider>
          <Shell>{children}</Shell>
        </AppProvider>
      </body>
    </html>
  );
}
