'use client';

import Link from "next/link";
import { usePathname } from 'next/navigation';
import { Shield } from 'lucide-react';
import dynamic from 'next/dynamic';

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

export default function Navbar() {
  const pathname = usePathname();
  const isActive = (path: string) => pathname === path;

  return (
    <nav className="fixed top-8 left-1/2 -translate-x-1/2 w-[95%] max-w-[1280px] rounded-full px-8 py-4 z-50 glass-nav border border-white/20 shadow-[0_20px_40px_rgba(74,58,255,0.1)] flex justify-between items-center mx-auto transition-all">
      <Link href="/" className="flex items-center gap-2">
        <Shield className="text-primary w-8 h-8 fill-primary/20" />
        <span className="text-[24px] font-bold text-on-background tracking-tight">Insure Protocol</span>
      </Link>
      
      <div className="hidden md:flex items-center gap-8">
        <Link href="/vaults" className={`text-[12px] font-bold tracking-[0.1em] uppercase transition-all ${isActive('/vaults') ? 'text-primary border-b-2 border-primary pb-1' : 'text-on-surface-variant hover:text-primary'}`}>
          Vaults
        </Link>
        <Link href="/my-insurance" className={`text-[12px] font-bold tracking-[0.1em] uppercase transition-all ${isActive('/my-insurance') ? 'text-primary border-b-2 border-primary pb-1' : 'text-on-surface-variant hover:text-primary'}`}>
          My Insurance
        </Link>
        <Link href="/creator" className={`text-[12px] font-bold tracking-[0.1em] uppercase transition-all ${isActive('/creator') ? 'text-primary border-b-2 border-primary pb-1' : 'text-on-surface-variant hover:text-primary'}`}>
          Creator
        </Link>
      </div>

      <div className="flex items-center">
        <WalletMultiButton />
      </div>
    </nav>
  );
}
