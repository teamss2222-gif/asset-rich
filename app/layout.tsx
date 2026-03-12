import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "🎮 ASSET LAB",
  description: "8-BIT 자산관리 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head />
      <body>{children}</body>
    </html>
  );
}
