import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"], weight: ["500", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Studio iA", template: "%s | Studio iA" },
  description: "Genera imágenes con iA, arma carruseles y publica en tus redes sociales.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${spaceGrotesk.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
