'use client';

import '@solana/wallet-adapter-react-ui/styles.css';
import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider} from '@solana/wallet-adapter-react-ui';
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { clusterApiUrl } from '@solana/web3.js';

export default function AppWalletProvider({children} : {children: React.ReactNode}){
    const network = WalletAdapterNetwork.Devnet;
    const endpoint = useMemo(()=>
    clusterApiUrl(network), [network]);

    const wallets = useMemo(()=>[],[]);

    return (
        <ConnectionProvider endpoint = {endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    {children}
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    )
}