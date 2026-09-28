'use client';

import { useCallback, useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AccountLayout } from '@solana/spl-token';
import { usdcAta } from './anchor';

export interface Balances {
  /** null until loaded (or when disconnected) */
  sol: number | null;
  /** base units (6 decimals); 0 if the account doesn't exist */
  usdc: bigint | null;
  refresh: () => void;
}

interface State {
  owner: string;
  sol: number | null;
  usdc: bigint | null;
}

/** Live SOL + USDC balance of the connected wallet (websocket-subscribed). */
export function useBalances(): Balances {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [state, setState] = useState<State>({ owner: '', sol: null, usdc: null });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!publicKey) return;
    const owner = publicKey.toBase58();
    let alive = true;
    const patch = (p: Partial<State>) => alive && setState((s) => ({ ...(s.owner === owner ? s : { owner, sol: null, usdc: null }), ...p }));
    const ata = usdcAta(publicKey);
    connection.getBalance(publicKey).then((b) => patch({ sol: b / LAMPORTS_PER_SOL })).catch(() => {});
    connection
      .getAccountInfo(ata)
      .then((a) => patch({ usdc: a ? AccountLayout.decode(a.data).amount : BigInt(0) }))
      .catch(() => {});

    const subs = [
      connection.onAccountChange(publicKey, (a) => patch({ sol: a.lamports / LAMPORTS_PER_SOL }), 'confirmed'),
      connection.onAccountChange(ata, (a) => patch({ usdc: a.data.length ? AccountLayout.decode(a.data).amount : BigInt(0) }), 'confirmed'),
    ];
    return () => {
      alive = false;
      subs.forEach((id) => void connection.removeAccountChangeListener(id).catch(() => {}));
    };
  }, [connection, publicKey, tick]);

  const mine = publicKey && state.owner === publicKey.toBase58();
  return { sol: mine ? state.sol : null, usdc: mine ? state.usdc : null, refresh };
}
