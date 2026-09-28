import Link from "next/link";
import Image from "next/image";
import { ArrowRight, CloudRain, Plane, ShieldCheck, FileSearch, Scale, Zap } from "lucide-react";
import { LiveStats, RecentClaims } from "@/components/home/LiveWidgets";
import { CLUSTER } from "@/lib/anchor";

const card = "bg-surface-container-lowest/85 backdrop-blur-md border border-white/60 rounded-[18px] floating-shadow";

export default function Home() {
  return (
    <div className="w-full">
      {/* Hero */}
      <section className="px-6 md:px-8 max-w-[1280px] mx-auto pt-10 pb-24 relative z-10">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-14 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary-container text-on-secondary-container text-[12px] font-bold tracking-[0.1em] uppercase mb-8">
              <Zap className="w-4 h-4" /> Live on Solana {CLUSTER}
            </div>
            <h1 className="text-[42px] md:text-[58px] font-extrabold text-on-background mb-6 tracking-tight leading-[1.06] text-balance">
              Insurance that pays <span className="text-primary">when the data says&nbsp;so.</span>
            </h1>
            <p className="text-[18px] text-on-surface-variant mb-10 max-w-xl leading-relaxed">
              Drought cover for farms and delay cover for flights. A fixed rule, real rainfall and flight data,
              and a payout in USDC minutes after the oracle confirms — with the evidence on-chain for anyone to check.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/vaults" className="bg-primary text-on-primary font-bold text-[17px] px-8 py-4 rounded-full electric-glow hover:scale-[1.03] transition-transform text-center">
                Get covered
              </Link>
              <Link href="/creator" className="border border-outline-variant bg-surface-container-lowest/70 text-on-background font-bold text-[17px] px-8 py-4 rounded-full hover:border-primary/40 transition-colors text-center">
                Underwrite a vault
              </Link>
              <Link href="/how-it-works" className="text-on-background font-bold text-[17px] px-4 py-4 flex items-center gap-2 justify-center hover:text-primary">
                How it works <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </div>

          <div className={`${card} p-8`}>
            <div className="flex items-center gap-3 mb-8">
              <Image src="/logo-mark.png" alt="" width={44} height={44} />
              <div>
                <h2 className="text-[20px] font-bold text-on-background">Protocol, live</h2>
                <p className="text-[14px] text-on-surface-variant">Read straight from the chain</p>
              </div>
            </div>
            <LiveStats variant="hero" />
          </div>
        </div>
      </section>

      {/* Products */}
      <section className="px-6 md:px-8 max-w-[1280px] mx-auto pb-24 relative z-10">
        <p className="text-[12px] font-bold tracking-[0.1em] text-primary uppercase mb-3">Two products, one engine</p>
        <h2 className="text-[34px] md:text-[44px] font-bold text-on-background mb-12">Cover built on measurements, not paperwork</h2>
        <div className="grid md:grid-cols-2 gap-8">
          {[
            {
              icon: <CloudRain className="w-7 h-7" />,
              title: "Crop drought",
              rule: "Pays if rainfall at your farm over N days falls below the vault's threshold.",
              data: "Rainfall: Open-Meteo (ERA5 reanalysis + analysis models), global coverage.",
              extra: "See how often a vault would have paid at your exact location over the last 10 years before you buy.",
              href: "/vaults?type=Weather",
            },
            {
              icon: <Plane className="w-7 h-7" />,
              title: "Flight delay",
              rule: "Pays if your flight is cancelled, diverted, or departs/arrives late by the vault's threshold.",
              data: "Flight status: AeroDataBox / Aviationstack, matched on flight number and date.",
              extra: "One premium per flight. File a claim after departure; the oracle waits for landing data if needed.",
              href: "/vaults?type=FlightDelay",
            },
          ].map((p) => (
            <Link key={p.title} href={p.href} className={`${card} p-8 hover:-translate-y-1 transition-transform group`}>
              <div className="w-14 h-14 rounded-[14px] bg-secondary-container text-primary flex items-center justify-center mb-6">{p.icon}</div>
              <h3 className="text-[26px] font-bold text-on-background mb-3">{p.title}</h3>
              <p className="text-[16px] text-on-background mb-3 font-semibold">{p.rule}</p>
              <p className="text-[15px] text-on-surface-variant mb-2">{p.data}</p>
              <p className="text-[15px] text-on-surface-variant mb-6">{p.extra}</p>
              <span className="text-primary font-bold inline-flex items-center gap-2">Browse vaults <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></span>
            </Link>
          ))}
        </div>
      </section>

      {/* Verifiable */}
      <section className="bg-surface-container-low/60 backdrop-blur-sm py-24 px-6 md:px-8 relative z-10 border-y border-white/40">
        <div className="max-w-[1280px] mx-auto grid lg:grid-cols-2 gap-14 items-start">
          <div>
            <p className="text-[12px] font-bold tracking-[0.1em] text-primary uppercase mb-3">Don&apos;t trust, verify</p>
            <h2 className="text-[34px] md:text-[44px] font-bold text-on-background mb-6 leading-tight">Every decision leaves a receipt</h2>
            <p className="text-[17px] text-on-surface-variant mb-8 leading-relaxed">
              When a claim is settled, the verdict, the measured value and the SHA-256 of the full evidence bundle
              are written on-chain. Open any claim and your browser re-hashes the evidence to prove it hasn&apos;t changed.
            </p>
            <div className="space-y-5">
              {[
                { icon: <Scale className="w-5 h-5" />, t: "Fixed, public rules", d: "Each vault's threshold and window are on-chain before you buy. No adjuster, no discretion." },
                { icon: <ShieldCheck className="w-5 h-5" />, t: "Fully collateralised", d: "Every policy locks one full payout of USDC in the vault. The program won't sell cover it can't pay." },
                { icon: <FileSearch className="w-5 h-5" />, t: "Open data, auditable oracle", d: "Rainfall and flight sources are public; the oracle's evidence hash is checked in your browser." },
              ].map((f) => (
                <div key={f.t} className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-secondary-container text-primary flex items-center justify-center flex-shrink-0">{f.icon}</div>
                  <div>
                    <h3 className="text-[17px] font-bold text-on-background">{f.t}</h3>
                    <p className="text-[15px] text-on-surface-variant">{f.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className={`${card} p-6 md:p-8`}>
            <h3 className="text-[18px] font-bold text-on-background mb-5">Latest claims</h3>
            <RecentClaims />
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="py-24 px-6 md:px-8 max-w-[1280px] mx-auto relative z-10">
        <p className="text-[12px] font-bold tracking-[0.1em] text-primary uppercase mb-3">The process</p>
        <h2 className="text-[34px] md:text-[44px] font-bold text-on-background mb-12">Covered in a minute, paid in minutes</h2>
        <ol className="grid md:grid-cols-4 gap-6">
          {[
            { t: "Pick a vault", d: "Choose drought or flight cover. Check the rule, the payout and — for farms — the 10-year history at your spot." },
            { t: "Lock in your risk", d: "Drop a pin on your farm or enter your flight. It's fixed in your policy so nobody can move it later." },
            { t: "File in one click", d: "When the trigger happens, press File a claim. No forms — the oracle already knows what to check." },
            { t: "Get paid, see why", d: "The oracle fetches the data, applies the rule and pays USDC to your wallet, with the evidence attached." },
          ].map((s, i) => (
            <li key={s.t} className={`${card} p-6`}>
              <div className="w-10 h-10 rounded-full border-2 border-primary text-primary font-bold flex items-center justify-center mb-4">{i + 1}</div>
              <h3 className="text-[18px] font-bold text-on-background mb-2">{s.t}</h3>
              <p className="text-[15px] text-on-surface-variant leading-relaxed">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Live band */}
      <section className="pb-8 px-6 md:px-8 relative z-10">
        <div className="max-w-[1280px] mx-auto bg-gradient-to-br from-on-background to-primary rounded-[18px] p-12 md:p-16 text-white relative overflow-hidden shadow-2xl">
          <LiveStats variant="band" />
          <div className="relative z-10 mt-12 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/vaults" className="bg-white text-primary font-bold px-8 py-4 rounded-full text-center hover:scale-[1.03] transition-transform">Browse vaults</Link>
            <Link href="/creator" className="border border-white/40 text-white font-bold px-8 py-4 rounded-full text-center hover:bg-white/10">Start underwriting</Link>
          </div>
          <div className="absolute top-0 right-0 w-1/2 h-full bg-white/5 skew-x-[-20deg] translate-x-1/2 pointer-events-none" />
        </div>
      </section>
    </div>
  );
}
