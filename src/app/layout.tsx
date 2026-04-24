import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Revsplit",
  description: "Public reverse stock split calendar and EDGAR signal dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
