'use client';

import '@solana/wallet-adapter-react-ui/styles.css';
import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { CLUSTER, RPC_URL, WS_URL } from "@/lib/anchor";
import { DemoWalletAdapter } from "@/lib/demoWallet";
import { ToastProvider } from "@/components/ui/Toast";

const DEMO_WALLET = CLUSTER !== 'mainnet' && process.env.NEXT_PUBLIC_DEMO_WALLET !== 'false';

export default function AppWalletProvider({ children }: { children: React.ReactNode }) {
    // Wallet Standard wallets (Phantom, Solflare, Backpack, …) register themselves;
    // the demo wallet is an extra, devnet-only option.
    const wallets = useMemo(() => (DEMO_WALLET ? [new DemoWalletAdapter()] : []), []);

    return (
        <ConnectionProvider endpoint={RPC_URL} config={{ commitment: 'confirmed', wsEndpoint: WS_URL }}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    <ToastProvider>{children}</ToastProvider>
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
}
