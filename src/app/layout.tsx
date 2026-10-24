import type { Metadata } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

/**
 * Schibsted Grotesk is the product typeface (docs/design/*.html). next/font
 * downloads it at build time and exposes it as the `--font-schibsted` CSS
 * variable, which Tailwind maps to `font-sans` (see tailwind.config.ts).
 */
const schibsted = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-schibsted",
});

export const metadata: Metadata = {
  title: "Quippe",
  description: "Connecting student organizations with company resources.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={schibsted.variable}>
      <body className="bg-bench font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
