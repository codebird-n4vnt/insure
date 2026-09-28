'use client';

import Link from "next/link";
import Image from "next/image";
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Menu, X } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useBalances } from '@/lib/useBalances';

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

const LINKS = [
  { href: '/vaults', label: 'Vaults' },
  { href: '/my-insurance', label: 'My Insurance' },
  { href: '/creator', label: 'Underwrite' },
  { href: '/how-it-works', label: 'How it works' },
];

function BalancePill() {
  const { publicKey } = useWallet();
  const { sol, usdc } = useBalances();
  if (!publicKey || usdc === null) return null;
  const usd = Number(usdc) / 1e6;
  return (
    <div
      className="hidden sm:flex items-center gap-3 px-4 py-2 rounded-full bg-surface-container-low border border-outline-variant text-[12px] font-bold text-on-background"
      data-testid="balance-pill"
      title="Your devnet balances"
    >
      <span>{usd.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC</span>
      <span className="w-px h-3 bg-outline-variant" />
      <span className={sol !== null && sol < 0.01 ? 'text-error' : ''}>{sol === null ? '—' : sol.toFixed(2)} SOL</span>
    </div>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

  // Close the mobile menu on navigation.
  useEffect(() => {
    const id = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(id);
  }, [pathname]);

  return (
    <nav className="fixed top-10 left-1/2 -translate-x-1/2 w-[95%] max-w-[1280px] rounded-[28px] px-5 md:px-8 py-3 z-50 glass-nav border border-white/40 shadow-[0_20px_40px_rgba(44,110,106,0.10)]">
      <div className="flex justify-between items-center gap-4">
        <Link href="/" className="flex items-center gap-2 flex-shrink-0" aria-label="Insure home">
          <Image src="/logo-mark.png" alt="" width={36} height={36} priority />
          <span className="text-[22px] font-extrabold text-on-background tracking-tight">insure</span>
        </Link>

        <div className="hidden lg:flex items-center gap-8">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-[12px] font-bold tracking-[0.1em] uppercase transition-all ${isActive(l.href) ? 'text-primary border-b-2 border-primary pb-1' : 'text-on-surface-variant hover:text-primary'}`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <BalancePill />
          <WalletMultiButton />
          <button
            className="lg:hidden p-2 rounded-full hover:bg-surface-container-low"
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden flex flex-col gap-1 pt-4 pb-2 border-t border-outline-variant mt-3">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-3 rounded-[12px] text-[15px] font-bold ${isActive(l.href) ? 'bg-secondary-container text-on-secondary-container' : 'text-on-background hover:bg-surface-container-low'}`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
