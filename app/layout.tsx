import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scanner 3 · Upstox OHLC",
  description: "Read-only NSE OHLC collector using the official Upstox API.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
