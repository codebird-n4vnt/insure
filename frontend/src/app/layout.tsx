import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import AppWalletProvider from "@/components/providers/AppWalletProvider";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import AmbientBackground from "@/components/layout/AmbientBackground";
import DevnetBanner from "@/components/layout/DevnetBanner";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Insure — parametric insurance on Solana", template: "%s · Insure" },
  description:
    "Drought and flight-delay cover that pays automatically. Fixed rules, real-world data, and an on-chain evidence trail anyone can verify.",
  openGraph: {
    title: "Insure — parametric insurance on Solana",
    description: "Cover that pays automatically when the data says so. Every decision verifiable on-chain.",
    images: [{ url: "/logo.png", width: 600, height: 600 }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="light">
      <body
        className={`${plusJakartaSans.variable} font-sans text-[16px] text-on-background selection:bg-secondary-container selection:text-on-secondary-container antialiased min-h-screen`}
      >
        <AppWalletProvider>
          <AmbientBackground />
          <DevnetBanner />
          <Navbar />
          <main className="pt-36">{children}</main>
          <Footer />
        </AppWalletProvider>
      </body>
    </html>
  );
}
