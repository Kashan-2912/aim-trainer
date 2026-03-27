import type { Metadata } from "next";
import { Geist_Mono, Rajdhani } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const rajdhani = Rajdhani({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Pulse Grid — Aim Trainer",
  description: "Radial aim trainer — tap targets before they reach the edge.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${rajdhani.variable} ${geistMono.variable} h-full overflow-hidden select-none antialiased`}
    >
      <body className="flex min-h-0 h-dvh flex-col overflow-hidden overscroll-none bg-[#0a0b0d] text-white select-none">
        {children}
      </body>
    </html>
  );
}
