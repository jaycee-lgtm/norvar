import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  weight: ["300","400","500","600"],
  variable: "--font-sora",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Norvar",
  description: "Governance, Risk and Compliance Intelligence Platform",
};

export const viewport = {
  width:        "device-width",
  initialScale: 1,
  viewportFit:  "cover" as const,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={sora.variable}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
