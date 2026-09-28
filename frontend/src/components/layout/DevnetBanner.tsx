'use client';

import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { CLUSTER } from '@/lib/anchor';
import { useToast } from '@/components/ui/Toast';

/** Test-network notice with the two faucets a new user needs. Hidden on mainnet. */
export default function DevnetBanner() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (CLUSTER === 'mainnet') return null;

  const airdrop = async () => {
    if (!publicKey) return;
    setBusy(true);
    const id = toast.show({ kind: 'pending', title: 'Requesting 1 test SOL…' });
    try {
      const sig = await connection.requestAirdrop(publicKey, LAMPORTS_PER_SOL);
      const bh = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
      toast.update(id, { kind: 'success', title: '1 SOL received', sig });
    } catch {
      toast.update(id, {
        kind: 'error',
        title: 'Airdrop is rate-limited right now',
        body: 'Use the web faucet instead.',
        href: { label: 'Open faucet.solana.com', url: 'https://faucet.solana.com' },
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed top-0 inset-x-0 z-[60] h-8 bg-on-background text-white text-[12px] flex items-center justify-center gap-3 px-4">
      <span className="font-bold uppercase tracking-[0.08em]">{CLUSTER}</span>
      <span className="hidden sm:inline text-white/70">Test network — no real money.</span>
      <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" className="underline font-semibold">
        Get test USDC
      </a>
      {publicKey ? (
        <button onClick={airdrop} disabled={busy} className="underline font-semibold disabled:opacity-60">
          Get test SOL
        </button>
      ) : (
        <a href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer" className="underline font-semibold">
          Get test SOL
        </a>
      )}
    </div>
  );
}
