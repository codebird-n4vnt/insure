'use client';

import Link from "next/link";
import { Shield, Terminal, Users, Share2 } from "lucide-react";

export default function Footer() {
  return (
    <footer className="relative z-10">

      {/* Footer Links */}
      <div className="bg-surface-container-low/80 backdrop-blur-md pt-[120px] pb-8 px-8 border-t border-white/20">
        <div className="max-w-[1280px] mx-auto flex flex-col md:flex-row justify-between items-start gap-12 border-b border-outline-variant pb-16 mb-16">
          {/* Brand */}
          <div className="max-w-xs">
            <div className="flex items-center gap-2 mb-6">
              <Shield className="text-primary w-8 h-8 fill-primary/20" />
              <span className="text-[24px] font-black text-on-background tracking-tight">Insure Protocol</span>
            </div>
            <p className="text-[16px] text-on-surface-variant leading-relaxed">
              Providing high-assurance parametric protection through cryptographic proof and automated execution.
            </p>
          </div>

          {/* Links Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
            <div className="flex flex-col gap-4">
              <h5 className="text-[12px] font-bold tracking-[0.1em] uppercase text-on-background">Product</h5>
              <Link href="/vaults" className="text-[16px] text-on-surface-variant hover:text-primary transition-colors">Marketplace</Link>
              <Link href="/vaults" className="text-[16px] text-on-surface-variant hover:text-primary transition-colors">Vaults</Link>
              <Link href="/creator" className="text-[16px] text-on-surface-variant hover:text-primary transition-colors">Create Vault</Link>
            </div>
            <div className="flex flex-col gap-4">
              <h5 className="text-[12px] font-bold tracking-[0.1em] uppercase text-on-background">Coverage</h5>
              <Link href="/vaults" className="text-[16px] text-on-surface-variant hover:text-primary transition-colors">Crop Failure</Link>
              <Link href="/vaults" className="text-[16px] text-on-surface-variant hover:text-primary transition-colors">Flight Delay</Link>
              <Link href="/my-insurance" className="text-[16px] text-on-surface-variant hover:text-primary transition-colors">My Policies</Link>
            </div>
            <div className="flex flex-col gap-4">
              <h5 className="text-[12px] font-bold tracking-[0.1em] uppercase text-on-background">Resources</h5>
              <a href="#" className="text-[16px] text-on-surface-variant hover:text-primary transition-colors">Security Audit</a>
              <a href="#" className="text-[16px] text-on-surface-variant hover:text-primary transition-colors">Brand Kit</a>
              <a href="#" className="text-[16px] text-on-surface-variant hover:text-primary transition-colors">Whitepaper</a>
            </div>
            <div className="flex flex-col gap-4">
              <h5 className="text-[12px] font-bold tracking-[0.1em] uppercase text-on-background">Legal</h5>
              <a href="#" className="text-[16px] text-on-surface-variant hover:text-primary transition-colors">Privacy Protocol</a>
              <a href="#" className="text-[16px] text-on-surface-variant hover:text-primary transition-colors">Terms of Use</a>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="max-w-[1280px] mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <p className="text-[12px] font-bold tracking-[0.1em] uppercase text-on-surface-variant">
            © 2024 Insure Protocol. Parametric protection for the decentralized world.
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-on-surface-variant hover:text-primary transition-colors"><Terminal className="w-6 h-6" /></a>
            <a href="#" className="text-on-surface-variant hover:text-primary transition-colors"><Users className="w-6 h-6" /></a>
            <a href="#" className="text-on-surface-variant hover:text-primary transition-colors"><Share2 className="w-6 h-6" /></a>
          </div>
        </div>
      </div>
    </footer>
  );
}
