import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import AppWalletProvider from "@/components/providers/AppWalletProvider";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import AmbientBackground from "@/components/layout/AmbientBackground";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Insure Protocol — Parametric Insurance on Solana",
  description:
    "Automated, oracle-verified parametric insurance payouts on Solana. No claims adjusters, no paperwork.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="light">
      <body
        className={`${plusJakartaSans.variable} font-sans text-[16px] text-on-background selection:bg-secondary-container selection:text-on-secondary-container antialiased min-h-screen`}
      >
        <AppWalletProvider>
          <AmbientBackground />
          <Navbar />
          <main className="pt-32">{children}</main>
          <Footer />
        </AppWalletProvider>
      </body>
    </html>
  );
}
