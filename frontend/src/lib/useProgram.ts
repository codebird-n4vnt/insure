'use client';

import { useMemo } from 'react';
import { AnchorProvider } from '@coral-xyz/anchor';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { getProgram, readonlyProgram } from './anchor';

/** Program bound to the connected wallet, or a read-only one when disconnected. */
export function useProgram() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  return useMemo(
    () =>
      wallet
        ? getProgram(new AnchorProvider(connection, wallet, { commitment: 'confirmed' }))
        : readonlyProgram(connection),
    [connection, wallet]
  );
}
