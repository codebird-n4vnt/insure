import Link from "next/link";
import { Shield, Zap, Lock, ArrowRight, Wallet, Activity, Database, CheckCircle2 } from "lucide-react";

export default function Home() {
  return (
    <div className="w-full">
      {/* Hero Section */}
      <section className="min-h-screen flex flex-col items-center justify-center px-8 text-center max-w-[1280px] mx-auto py-[120px] relative z-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary-container text-on-secondary-container text-[12px] font-bold tracking-[0.1em] uppercase mb-8">
          <Zap className="w-4 h-4" />
          Live on Solana Mainnet
        </div>
        
        <h1 className="text-[48px] md:text-[80px] font-extrabold text-on-background mb-8 max-w-4xl tracking-tight leading-[1.1]">
          Parametric Insurance.<br/>
          <span className="text-primary">Trustless. Instant. On-Chain.</span>
        </h1>
        
        <p className="text-[18px] text-on-surface-variant mb-12 max-w-2xl mx-auto leading-relaxed">
          Automated, oracle-verified payouts on Solana. No claims adjusters, no paperwork, just mathematical certainty for the decentralized world.
        </p>
        
        <div className="flex flex-col md:flex-row gap-6 mb-24">
          <Link href="/vaults" className="bg-primary text-on-primary font-bold text-[20px] px-10 py-5 rounded-full electric-glow hover:scale-105 transition-transform duration-300">
            Explore Markets
          </Link>
          <a href="#" className="bg-transparent text-on-background font-bold text-[20px] px-10 py-5 rounded-full hover:bg-surface-container-low transition-colors duration-300 flex items-center gap-2 justify-center">
            Read Docs
            <ArrowRight className="w-6 h-6" />
          </a>
        </div>

        {/* Floating Hero Card */}
        <div className="w-full max-w-4xl mx-auto relative mt-12">
          <div className="bg-surface-container-lowest/80 backdrop-blur-md p-[40px] rounded-[16px] floating-shadow border border-white/50 flex flex-col md:flex-row justify-between items-center gap-8 text-left">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-primary-container flex items-center justify-center">
                  <Wallet className="w-6 h-6 text-on-primary-container" />
                </div>
                <div>
                  <h3 className="text-[24px] font-bold text-on-background">Protocol Liquidity</h3>
                  <p className="text-[16px] text-on-surface-variant">Global Vault Overview</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-8 mt-8">
                <div>
                  <p className="text-[12px] font-bold tracking-[0.1em] text-outline uppercase mb-1">Total Value Locked</p>
                  <p className="text-[32px] font-bold text-primary">$42,508,210</p>
                </div>
                <div>
                  <p className="text-[12px] font-bold tracking-[0.1em] text-outline uppercase mb-1">Active Policies</p>
                  <p className="text-[32px] font-bold text-on-background">12,402</p>
                </div>
              </div>
            </div>
            
            <div className="w-full md:w-[320px] bg-primary rounded-[16px] p-8 text-on-primary relative overflow-hidden">
              <div className="relative z-10">
                <p className="text-[12px] font-bold tracking-[0.1em] text-on-primary/70 uppercase mb-2">Vault APY</p>
                <p className="text-[48px] font-extrabold mb-4 leading-none">12.4%</p>
                <button className="w-full bg-white/10 backdrop-blur-md text-on-primary border border-white/20 py-3 rounded-full hover:bg-white/20 transition-all text-[12px] font-bold tracking-[0.1em] uppercase">
                  Stake Now
                </button>
              </div>
              <div className="absolute -right-8 -bottom-8 opacity-10">
                <Activity className="w-48 h-48" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-surface-container-low/50 backdrop-blur-sm py-[120px] px-8 relative z-10 border-y border-white/20">
        <div className="max-w-[1280px] mx-auto text-center mb-24">
          <p className="text-[12px] font-bold tracking-[0.1em] text-primary uppercase mb-4">Engineered for Scale</p>
          <h2 className="text-[48px] font-bold text-on-background">Modern Security Infrastructure</h2>
        </div>
        
        <div className="max-w-[1280px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-10">
          <div className="bg-surface-container-lowest/80 backdrop-blur-md border border-white/50 p-[40px] rounded-[16px] floating-shadow hover:-translate-y-2 transition-transform duration-500">
            <div className="w-16 h-16 rounded-[16px] bg-secondary-container flex items-center justify-center mb-8">
              <Database className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-[28px] font-bold text-on-background mb-4">Oracle-Verified</h3>
            <p className="text-[16px] text-on-surface-variant leading-relaxed">
              Instant payouts triggered by Chainlink oracles. If the data says the event happened, you get paid automatically—no human claims required.
            </p>
          </div>
          
          <div className="bg-surface-container-lowest/80 backdrop-blur-md border border-white/50 p-[40px] rounded-[16px] floating-shadow hover:-translate-y-2 transition-transform duration-500">
            <div className="w-16 h-16 rounded-[16px] bg-secondary-container flex items-center justify-center mb-8">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-[28px] font-bold text-on-background mb-4">Full Transparency</h3>
            <p className="text-[16px] text-on-surface-variant leading-relaxed">
              100% on-chain reserves are verifiable at all times. Solvency is cryptographic, not based on corporate promises or quarterly reports.
            </p>
          </div>
          
          <div className="bg-surface-container-lowest/80 backdrop-blur-md border border-white/50 p-[40px] rounded-[16px] floating-shadow hover:-translate-y-2 transition-transform duration-500">
            <div className="w-16 h-16 rounded-[16px] bg-secondary-container flex items-center justify-center mb-8">
              <Zap className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-[28px] font-bold text-on-background mb-4">Solana Speed</h3>
            <p className="text-[16px] text-on-surface-variant leading-relaxed">
              Sub-second settlement on the world's most performant blockchain. Low fees and lightning-fast policy issuance for every user.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-[120px] px-8 max-w-[1280px] mx-auto relative z-10">
        <div className="flex flex-col md:flex-row items-center gap-20">
          <div className="md:w-1/2">
            <p className="text-[12px] font-bold tracking-[0.1em] text-primary uppercase mb-4">The Process</p>
            <h2 className="text-[48px] font-bold text-on-background mb-8 leading-[1.1]">How It Works</h2>
            <p className="text-[18px] text-on-surface-variant mb-12 leading-relaxed">
              Get protected in minutes. We've removed the friction of traditional insurance by replacing manual processes with smart contracts.
            </p>
            
            <div className="space-y-12">
              {[
                { step: "1", title: "Select Risk", desc: "Choose from a variety of parametric markets including weather, flight delay, or crop failure." },
                { step: "2", title: "Fund Vault", desc: "Select your coverage amount and pay the premium instantly using Solana-based assets." },
                { step: "3", title: "Coverage Active", desc: "Your policy is live. Smart contracts monitor oracle data 24/7 for any trigger events." },
                { step: "4", title: "Auto-Payout", desc: "If a trigger occurs, funds are released to your wallet immediately. No forms required." }
              ].map((item, i) => (
                <div key={i} className="flex gap-6">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full border-2 border-primary text-primary font-bold flex items-center justify-center">
                    {item.step}
                  </div>
                  <div>
                    <h4 className="text-[20px] font-bold text-on-background mb-2">{item.title}</h4>
                    <p className="text-[16px] text-on-surface-variant leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="md:w-1/2 w-full">
            <div className="relative">
              <div className="rounded-[16px] floating-shadow w-full h-[600px] bg-primary/5 border border-primary/20 flex flex-col items-center justify-center text-center p-12">
                 <Shield className="w-32 h-32 text-primary/20 mb-8" />
                 <h3 className="text-[24px] font-bold text-on-background mb-4">Secure Network Architecture</h3>
                 <p className="text-on-surface-variant text-[16px]">Fully verifiable smart contracts operating seamlessly to protect your assets on the blockchain.</p>
              </div>
              <div className="absolute -bottom-8 -left-8 bg-on-background p-8 rounded-[16px] text-white floating-shadow hidden lg:block">
                <p className="text-[12px] font-bold tracking-[0.1em] text-primary uppercase mb-2">Network Status</p>
                <div className="flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="text-[20px] font-bold">Mainnet Operational</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Banner — landing page only */}
      <section className="py-[120px] px-8 relative z-10">
        <div className="max-w-[1280px] mx-auto bg-gradient-to-br from-[#1A1A2E] to-primary rounded-[16px] p-16 text-white text-center relative overflow-hidden shadow-2xl border border-white/10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-16 relative z-10">
            <div className="flex flex-col items-center">
              <span className="text-[64px] font-black mb-2 leading-none">$1B+</span>
              <p className="text-[12px] font-bold tracking-[0.1em] uppercase text-primary-container">Protected Value</p>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[64px] font-black mb-2 leading-none">50k+</span>
              <p className="text-[12px] font-bold tracking-[0.1em] uppercase text-primary-container">Active Users</p>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[64px] font-black mb-2 leading-none">0%</span>
              <p className="text-[12px] font-bold tracking-[0.1em] uppercase text-primary-container">Human Bias</p>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-1/2 h-full bg-white/5 skew-x-[-20deg] translate-x-1/2 pointer-events-none" />
        </div>
      </section>
    </div>
  );
}