import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Open Bench",
  description: "Connecting student organizations with company resources.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
