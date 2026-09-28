import Link from "next/link";
import Image from "next/image";
import { CLUSTER, PROGRAM_ID, explorerAddress } from "@/lib/anchor";

export default function Footer() {
  const col = "flex flex-col gap-3";
  const head = "text-[12px] font-bold tracking-[0.1em] uppercase text-on-background mb-1";
  const link = "text-[15px] text-on-surface-variant hover:text-primary transition-colors";

  return (
    <footer className="relative z-10 mt-24">
      <div className="bg-surface-container-low/80 backdrop-blur-md pt-20 pb-10 px-8 border-t border-white/40">
        <div className="max-w-[1280px] mx-auto flex flex-col md:flex-row justify-between items-start gap-12 border-b border-outline-variant pb-12 mb-8">
          <div className="max-w-xs">
            <div className="flex items-center gap-2 mb-4">
              <Image src="/logo-mark.png" alt="" width={36} height={36} />
              <span className="text-[24px] font-extrabold text-on-background tracking-tight">insure</span>
            </div>
            <p className="text-[15px] text-on-surface-variant leading-relaxed">
              Parametric insurance on Solana. Fixed rules, real-world data, payouts in minutes — and an evidence trail anyone can check.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-12">
            <div className={col}>
              <h5 className={head}>Get covered</h5>
              <Link href="/vaults?type=Weather" className={link}>Crop drought</Link>
              <Link href="/vaults?type=FlightDelay" className={link}>Flight delay</Link>
              <Link href="/my-insurance" className={link}>My policies</Link>
            </div>
            <div className={col}>
              <h5 className={head}>Underwrite</h5>
              <Link href="/creator" className={link}>Create a vault</Link>
              <Link href="/creator?tab=vaults" className={link}>My vaults</Link>
            </div>
            <div className={col}>
              <h5 className={head}>Trust</h5>
              <Link href="/how-it-works" className={link}>How it works</Link>
              <Link href="/how-it-works#verify" className={link}>Verify a claim</Link>
              <a href={explorerAddress(PROGRAM_ID.toBase58())} target="_blank" rel="noopener noreferrer" className={link}>Program on Explorer</a>
            </div>
          </div>
        </div>
        <p className="max-w-[1280px] mx-auto text-[12px] text-on-surface-variant">
          © {new Date().getFullYear()} Insure. {CLUSTER === 'mainnet' ? 'Not a regulated insurance product.' : `Running on Solana ${CLUSTER} with test funds. Not a regulated insurance product.`}
        </p>
      </div>
    </footer>
  );
}
