import type { Metadata } from "next";
import Link from "next/link";
import { PROGRAM_ID, BACKEND_URL, explorerAddress } from "@/lib/anchor";

export const metadata: Metadata = {
  title: "How it works",
  description: "The rules, the data sources, the oracle and how to verify any claim yourself.",
};

const h2 = "text-[28px] md:text-[34px] font-bold text-on-background mb-4 scroll-mt-40";
const p = "text-[16px] text-on-surface-variant leading-relaxed mb-4";
const card = "bg-surface-container-lowest/85 backdrop-blur-md border border-white/60 rounded-[18px] floating-shadow p-8 mb-8";

export default function HowItWorks() {
  return (
    <div className="px-6 md:px-8 py-10 max-w-[900px] mx-auto relative z-10">
      <p className="text-[12px] font-bold tracking-[0.1em] text-primary uppercase mb-3">Documentation</p>
      <h1 className="text-[40px] md:text-[56px] font-extrabold text-on-background mb-6 tracking-tight leading-tight">How Insure works</h1>
      <p className="text-[18px] text-on-surface-variant mb-12 leading-relaxed">
        Insure is parametric insurance: instead of assessing damage, each policy pays a fixed amount when a
        measurable event happens. That makes it fast and cheap — and it means the rule and the data are everything,
        so both are public.
      </p>

      <nav className={`${card} !p-6`} aria-label="On this page">
        <ul className="grid sm:grid-cols-2 gap-2 text-[15px] font-semibold text-primary">
          <li><a href="#roles">Who does what</a></li>
          <li><a href="#drought">Drought cover</a></li>
          <li><a href="#flight">Flight-delay cover</a></li>
          <li><a href="#oracle">The oracle &amp; trust model</a></li>
          <li><a href="#verify">Verify a claim yourself</a></li>
          <li><a href="#safety">What the program guarantees</a></li>
        </ul>
      </nav>

      <section id="roles" className={card}>
        <h2 className={h2}>Who does what</h2>
        <p className={p}><strong className="text-on-background">Underwriters</strong> create a vault, set the rule (threshold, window, region), the premium and the payout, and deposit USDC. They earn a fee on every premium and keep what&apos;s left after the vault expires.</p>
        <p className={p}><strong className="text-on-background">Policyholders</strong> buy a policy by choosing their farm location or flight. That choice is locked into the policy.</p>
        <p className={p}><strong className="text-on-background">The oracle</strong> is a service that, when a claim is filed, fetches the relevant data, applies the vault&apos;s rule and signs the settlement.</p>
      </section>

      <section id="drought" className={card}>
        <h2 className={h2}>Drought cover</h2>
        <p className={p}>
          A drought vault says: <em>&ldquo;pay $X if any N-day stretch of rain at your farm is below T mm during coverage.&rdquo;</em>
          When you file a claim, the oracle sums the daily rainfall at your pinned location over the N full days before you filed
          (or before your paid coverage ended, if you file in the 7-day grace period) and pays if the total is below T.
        </p>
        <ul className="list-disc pl-6 text-[16px] text-on-surface-variant space-y-2 mb-4">
          <li>Data: <a className="text-primary underline" href="https://open-meteo.com" target="_blank" rel="noopener noreferrer">Open-Meteo</a> — recent days from its analysis models, older days from the ERA5 reanalysis archive.</li>
          <li>Premiums are monthly. You can renew up to 10 days after your coverage lapses.</li>
          <li>Each vault only covers farms inside its region, so a vault priced for one climate can&apos;t be bought for a much drier one.</li>
          <li>Before buying, the vault page replays the rule over the past 10 years at your pin so you can see how often it would have paid.</li>
        </ul>
      </section>

      <section id="flight" className={card}>
        <h2 className={h2}>Flight-delay cover</h2>
        <p className={p}>
          A flight vault pays if your flight is <strong className="text-on-background">cancelled</strong>, <strong className="text-on-background">diverted</strong>,
          or its departure or arrival is late by at least the vault&apos;s threshold. An early arrival doesn&apos;t cancel out a late departure.
        </p>
        <ul className="list-disc pl-6 text-[16px] text-on-surface-variant space-y-2 mb-4">
          <li>Data: AeroDataBox and/or Aviationstack, matched on the exact flight number and scheduled departure date.</li>
          <li>You must buy before your flight date starts (UTC), and you can file from the flight date onward.</li>
          <li>If the flight hasn&apos;t landed yet and hasn&apos;t hit the threshold, the oracle waits and re-checks automatically.</li>
        </ul>
      </section>

      <section id="oracle" className={card}>
        <h2 className={h2}>The oracle &amp; trust model</h2>
        <p className={p}>
          Settlement can only be signed by one oracle key, registered on-chain by the program&apos;s upgrade authority.
          You are trusting that key to apply the published rule honestly. In exchange, every decision is checkable:
          the measured value and the SHA-256 of the evidence bundle are stored on the claim, and the bundle itself is public.
        </p>
        <p className={p}>
          The payout decision is plain code — never an AI verdict. An AI model (Gemini) is only used to read messy flight-API
          responses when the parser can&apos;t (its output is then checked and run through the same rule) and to write a
          plain-English explanation.
        </p>
        <p className={p}>
          If no usable data appears within 72 hours of filing, the claim is rejected so the vault isn&apos;t frozen — and you can file again.
        </p>
      </section>

      <section id="verify" className={card}>
        <h2 className={h2}>Verify a claim yourself</h2>
        <p className={p}>
          Every claim page downloads the evidence and re-hashes it in your browser. To do it independently:
        </p>
        <pre className="bg-on-background text-white rounded-[12px] p-4 text-[13px] overflow-x-auto mb-4"><code>{`curl -s ${BACKEND_URL}/evidence/<CLAIM_ADDRESS> | sha256sum
# compare with the claim's evidence_hash on-chain`}</code></pre>
        <p className={p}>
          The bundle contains the raw data (e.g. every day&apos;s rainfall and the exact API URL), the rule, the measured value and the verdict,
          so you can also re-fetch the source data and recompute the result.
        </p>
      </section>

      <section id="safety" className={card}>
        <h2 className={h2}>What the program guarantees</h2>
        <ul className="list-disc pl-6 text-[16px] text-on-surface-variant space-y-2">
          <li>Every policy is fully collateralised: a vault can&apos;t sell more cover than its liquidity pays out.</li>
          <li>One payout per policy; one pending claim at a time.</li>
          <li>Underwriters can only withdraw capital that isn&apos;t backing a policy, and can&apos;t close a vault while claims are pending.</li>
          <li>Pausing a vault only stops new sales — it never blocks renewals or payouts.</li>
          <li>If your USDC account was closed, the payout recreates it.</li>
        </ul>
        <p className="text-[14px] text-on-surface-variant mt-6">
          Program:{" "}
          <a className="text-primary underline break-all" href={explorerAddress(PROGRAM_ID.toBase58())} target="_blank" rel="noopener noreferrer">
            {PROGRAM_ID.toBase58()}
          </a>
        </p>
      </section>

      <div className="flex flex-col sm:flex-row gap-4">
        <Link href="/vaults" className="bg-primary text-on-primary font-bold px-8 py-4 rounded-full text-center electric-glow">Browse vaults</Link>
        <Link href="/creator" className="border border-outline-variant font-bold px-8 py-4 rounded-full text-center hover:border-primary/40">Create a vault</Link>
      </div>
    </div>
  );
}
