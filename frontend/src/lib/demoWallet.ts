import {
  BaseSignerWalletAdapter,
  WalletConnectionError,
  WalletNotConnectedError,
  WalletReadyState,
  type WalletName,
} from '@solana/wallet-adapter-base';
import { Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

export const DemoWalletName = 'Demo Wallet (devnet)' as WalletName<'Demo Wallet (devnet)'>;
const STORAGE_KEY = 'insure-demo-wallet-v1';

const ICON =
  'data:image/svg+xml;base64,' +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#2c6e6a"/>' +
      '<path d="M9 9h14v7c0 4-3 7-7 8-4-1-7-4-7-8z" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/></svg>'
  );

/**
 * A throwaway keypair kept in this browser's localStorage, for trying the app on
 * devnet without installing a wallet. Never enabled on mainnet (see AppWalletProvider).
 */
export class DemoWalletAdapter extends BaseSignerWalletAdapter {
  name = DemoWalletName;
  url = 'https://solana.com/docs/intro/wallets';
  icon = ICON;
  supportedTransactionVersions = new Set(['legacy', 0] as const);

  private _keypair: Keypair | null = null;
  private _connecting = false;

  get publicKey(): PublicKey | null {
    return this._keypair?.publicKey ?? null;
  }
  get connecting() {
    return this._connecting;
  }
  get readyState() {
    return typeof window === 'undefined' ? WalletReadyState.Unsupported : WalletReadyState.Loadable;
  }

  async connect(): Promise<void> {
    if (this.connected || this._connecting) return;
    this._connecting = true;
    try {
      let secret: string | null = null;
      try {
        secret = window.localStorage.getItem(STORAGE_KEY);
      } catch {
        /* storage blocked: fall through to an in-memory key */
      }
      const keypair = secret ? Keypair.fromSecretKey(bs58.decode(secret)) : Keypair.generate();
      if (!secret) {
        try {
          window.localStorage.setItem(STORAGE_KEY, bs58.encode(keypair.secretKey));
        } catch {
          /* ignore */
        }
      }
      this._keypair = keypair;
      this.emit('connect', keypair.publicKey);
    } catch (e) {
      const err = new WalletConnectionError((e as Error)?.message, e);
      this.emit('error', err);
      throw err;
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    this._keypair = null;
    this.emit('disconnect');
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    const kp = this._keypair;
    if (!kp) throw new WalletNotConnectedError();
    if (tx instanceof VersionedTransaction) tx.sign([kp]);
    else tx.partialSign(kp);
    return tx;
  }
}
