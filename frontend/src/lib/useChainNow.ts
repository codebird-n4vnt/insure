'use client';

import { useEffect, useState } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js';

/**
 * Current time as the program sees it (the Clock sysvar), not the browser's.
 * Every on-chain time check uses the cluster clock, and a user's system clock
 * can be off by minutes; we sample the offset and tick locally.
 */
export function useChainNow(tickMs = 15_000): number {
  const { connection } = useConnection();
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    let alive = true;
    const sample = async () => {
      try {
        // Clock sysvar layout: slot u64, epoch_start_timestamp i64, epoch u64,
        // leader_schedule_epoch u64, unix_timestamp i64 (offset 32).
        const acc = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY, 'confirmed');
        if (!acc || acc.data.length < 40) return;
        const t = Number(acc.data.readBigInt64LE(32));
        if (alive) setOffset(t - Math.floor(Date.now() / 1000));
      } catch {
        /* keep the last offset */
      }
    };
    void sample();
    const id = setInterval(sample, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [connection]);

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);

  return now + offset;
}
