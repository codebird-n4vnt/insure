const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const E2E = path.join(__dirname, '.state');
const BACKEND = path.join(__dirname, '..', 'backend');
const APP = process.env.APP_URL || 'http://localhost:3100';
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';

async function rpc(method, params = []) {
  const r = await fetch('http://127.0.0.1:8899', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(method + ': ' + JSON.stringify(j.error));
  return j.result;
}
async function chainTime() {
  const acc = await rpc('getAccountInfo', ['SysvarC1ock11111111111111111111111111111111', { encoding: 'base64', commitment: 'confirmed' }]);
  return Number(Buffer.from(acc.value.data[0], 'base64').readBigInt64LE(32));
}
async function travelTo(ts) {
  await rpc('surfnet_timeTravel', [{ absoluteTimestamp: ts * 1000 }]);
  await new Promise((r) => setTimeout(r, 1500));
  const t = await chainTime();
  console.log(`  ⏩ chain time now ${new Date(t * 1000).toISOString()}`);
  return t;
}
function fund(addr, usdc) {
  console.log('  ' + execSync(`E2E=${E2E} NODE_PATH=${BACKEND}/node_modules npx tsx ${path.join(__dirname, 'setup.ts')} fund ${addr} ${usdc}`, { cwd: BACKEND }).toString().trim());
}
async function open(profile, viewport = { width: 1400, height: 1000 }) {
  const ctx = await chromium.launchPersistentContext(path.join(E2E, 'profiles', profile), {
    executablePath: CHROME, headless: true, viewport,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.on('pageerror', (e) => console.log(`  [${profile} pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|ws:\/\//.test(m.text())) console.log(`  [${profile} console.error] ${m.text().slice(0, 300)}`); });
  return { ctx, page };
}
async function connectDemo(page) {
  const btn = page.locator('.wallet-adapter-button-trigger').first();
  await btn.waitFor();
  const label = (await btn.innerText()).trim();
  if (!/select wallet|connect/i.test(label)) return; // already connected
  await btn.click();
  await page.getByText('Demo Wallet (devnet)').click();
  await page.waitForFunction(() => !/select wallet/i.test(document.querySelector('.wallet-adapter-button-trigger')?.textContent || ''));
}
async function walletAddress(page) {
  const secret = await page.evaluate(() => localStorage.getItem('insure-demo-wallet-v1'));
  const { Keypair } = require(BACKEND + '/node_modules/@solana/web3.js');
  const bs58 = require(BACKEND + '/node_modules/bs58').default;
  return Keypair.fromSecretKey(bs58.decode(secret)).publicKey.toBase58();
}
async function shot(page, name, full = false) {
  fs.mkdirSync(path.join(E2E, 'shots'), { recursive: true });
  await page.screenshot({ path: path.join(E2E, 'shots', name + '.png'), fullPage: full });
  console.log('  📸 ' + name);
}
async function toast(page, kind, timeout = 60000) {
  const t = page.locator(`[data-testid="toast-${kind}"]`).last();
  await t.waitFor({ timeout });
  return (await t.innerText()).replace(/\s+/g, ' ');
}
module.exports = { rpc, chainTime, travelTo, fund, open, connectDemo, walletAddress, shot, toast, APP, E2E };
