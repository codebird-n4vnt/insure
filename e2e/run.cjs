/**
 * End-to-end scenarios against the local stack (run `bash stack.sh up` first).
 * Every step drives the real UI in Chrome, with a demo wallet per role, and the
 * real oracle keeper settling claims on the real program.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const L = require('./lib.cjs');

const B = path.join(__dirname, '..', 'backend', 'node_modules') + '/';
const { Keypair, Transaction, Connection } = require(B + '@solana/web3.js');
const local = (unix) => { const d = new Date(unix * 1000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const state = (k, v) => {
  const f = path.join(L.E2E, 'run.json');
  const s = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : {};
  if (v === undefined) return s[k];
  s[k] = v;
  fs.writeFileSync(f, JSON.stringify(s));
};
const expect = (cond, msg) => { if (!cond) throw new Error('expectation failed: ' + msg); };

const steps = {
  async landingAndWallets() {
    const { ctx, page } = await L.open('creator');
    await page.goto(L.APP, { waitUntil: 'networkidle' });
    await page.getByTestId('live-stats-hero').waitFor();
    await L.connectDemo(page);
    const creator = await L.walletAddress(page);
    L.fund(creator, 2000);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByTestId('balance-pill').waitFor({ timeout: 20000 });
    expect(/2,000 USDC/.test(await page.getByTestId('balance-pill').innerText()), 'balance pill shows 2,000 USDC');
    await L.shot(page, '01-home');
    await ctx.close();

    const m = await L.open('mobile', { width: 390, height: 844 });
    await m.page.goto(L.APP, { waitUntil: 'networkidle' });
    await m.page.getByRole('button', { name: 'Open menu' }).click();
    await m.page.locator('nav').getByRole('link', { name: 'Underwrite' }).click();
    await m.page.waitForURL('**/creator');
    await m.ctx.close();

    const f = await L.open('farmer');
    await f.page.goto(L.APP + '/vaults', { waitUntil: 'networkidle' });
    await L.connectDemo(f.page);
    L.fund(await L.walletAddress(f.page), 100);
    await f.ctx.close();
  },

  async createDroughtVault() {
    const { ctx, page } = await L.open('creator');
    await page.goto(L.APP + '/creator', { waitUntil: 'networkidle' });
    await L.connectDemo(page);
    await page.fill('#threshold', '50');
    await page.fill('#obs', '1');
    await page.getByLabel('Search for a place').fill('Nagpur');
    await page.getByRole('button', { name: /Nagpur.*Maharashtra/ }).first().click();
    await page.getByRole('button', { name: /±250 km/ }).click();
    await page.getByTestId('backtest-hits').waitFor({ timeout: 60000 });
    await page.fill('#payout', '100');
    await page.fill('#premium', '5');
    await page.fill('#fee', '500');
    await page.fill('#deposit', '500');
    const open = Math.ceil((await L.chainTime()) / 60) * 60 + 120;
    const t = { 'Sales open': open, 'Sales close': open + 120, 'Coverage starts': open + 120, 'Coverage ends': open + 40 * 86400, 'Vault expires': open + 50 * 86400 };
    for (const [label, v] of Object.entries(t)) await page.getByLabel(label, { exact: true }).fill(local(v));
    await page.getByTestId('create-vault').click();
    await page.getByTestId('vault-created').waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: 'Open vault' }).click();
    await page.waitForURL('**/vaults/**');
    state('drought', { vault: page.url().split('/vaults/')[1], ...t });
    await page.getByTestId('creator-panel').waitFor();
    await L.shot(page, '02-vault-creator');
    await ctx.close();
  },

  async buyPolicyUiAndBlink() {
    const v = state('drought');
    await L.travelTo(v['Sales open'] + 5);
    const { ctx, page } = await L.open('farmer');
    await page.goto(`${L.APP}/vaults/${v.vault}`, { waitUntil: 'networkidle' });
    await page.getByLabel('Search for a place').fill('Nagpur');
    await page.getByRole('button', { name: /Nagpur.*Maharashtra/ }).first().click();
    await page.getByTestId('backtest-hits').waitFor({ timeout: 60000 });
    expect(!(await page.getByRole('listbox').isVisible().catch(() => false)), 'search dropdown closes after picking');
    await page.getByTestId('buy-policy').click();
    await L.toast(page, 'success');
    await page.getByTestId('policy-status').waitFor({ timeout: 20000 });
    await L.shot(page, '03-policy');
    await ctx.close();

    const meta = await (await fetch(`http://localhost:3001/api/actions/vaults/${v.vault}`)).json();
    expect(!meta.disabled, 'blink is enabled while sales are open');
    const buyer = Keypair.generate();
    L.fund(buyer.publicKey.toBase58(), 50);
    const post = (q) => fetch(`http://localhost:3001/api/actions/vaults/${v.vault}${q}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: buyer.publicKey.toBase58() }) });
    expect((await post('?lat=27&lon=71')).status === 400, 'blink rejects locations outside the region');
    const res = await post('?lat=21.2&lon=79.1');
    const body = await res.json();
    expect(res.ok, 'blink builds a transaction: ' + JSON.stringify(body));
    const tx = Transaction.from(Buffer.from(body.transaction, 'base64'));
    tx.sign(buyer);
    const conn = new Connection('http://127.0.0.1:8899', 'confirmed');
    await conn.confirmTransaction(await conn.sendRawTransaction(tx.serialize()), 'confirmed');
  },

  async claimSettledAndVerified() {
    const v = state('drought');
    await L.travelTo(v['Coverage starts'] + 86400 + 3600);
    const { ctx, page } = await L.open('farmer');
    await page.goto(`${L.APP}/vaults/${v.vault}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !document.querySelector('[data-testid="file-claim"]')?.hasAttribute('disabled'), null, { timeout: 90000 });
    await page.getByTestId('file-claim').click();
    await L.toast(page, 'success');
    await page.waitForFunction(() => /approved|rejected/i.test(document.querySelector('[data-testid="claim-status"]')?.textContent || ''), null, { timeout: 180000 });
    await L.shot(page, '04-claim-settled', true);
    await page.getByTestId('claim-row').first().click();
    await page.getByTestId('hash-match').waitFor({ timeout: 30000 });
    await L.shot(page, '05-evidence', true);
    await page.goto(`${L.APP}/my-insurance`, { waitUntil: 'networkidle' });
    await page.getByText('Crop Drought Policy').waitFor({ timeout: 20000 });
    await ctx.close();
  },

  async keeperRecoversOfflineClaims() {
    execSync('bash stack.sh backend-stop', { cwd: __dirname, stdio: 'inherit' });
    execSync(`E2E=${L.E2E} NODE_PATH=${B} npx tsx ${path.join(__dirname, 'sweep.ts')}`, { cwd: path.join(__dirname, '..', 'backend'), stdio: 'inherit' });
    execSync('bash stack.sh backend-start', { cwd: __dirname, stdio: 'inherit' });
    const claim = fs.readFileSync(path.join(L.E2E, 'sweep-claim.txt'), 'utf8').trim();
    for (let i = 0; i < 30; i++) {
      const log = fs.readFileSync(path.join(L.E2E, 'backend.log'), 'utf8');
      if (new RegExp(`${claim} (APPROVE|REJECT)`).test(log)) return;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error('keeper sweep did not settle the claim filed while it was offline');
  },

  async creatorDashboardAndFees() {
    const { ctx, page } = await L.open('creator');
    await page.goto(`${L.APP}/creator?tab=vaults`, { waitUntil: 'networkidle' });
    await page.getByTestId('my-vaults').waitFor({ timeout: 20000 });
    await page.getByTestId('my-vaults').locator('a').first().click();
    await page.getByTestId('creator-panel').waitFor();
    await page.getByRole('button', { name: /Collect \$/ }).click();
    await L.toast(page, 'success');
    await page.goto(L.APP, { waitUntil: 'networkidle' });
    await page.getByTestId('recent-claims').waitFor({ timeout: 20000 });
    await L.shot(page, '06-home-live', true);
    await page.goto(`${L.APP}/vaults/not-a-key`, { waitUntil: 'networkidle' });
    await page.getByText('Vault not found').waitFor({ timeout: 10000 });
    await ctx.close();
  },

  async underwriterReleasesLapsedPolicy() {
    // The Blink buyer never renewed. Once every renewal and claim window has closed,
    // the underwriter can free the payout that was locked for that policy.
    const v = state('drought');
    await L.travelTo(v['Coverage starts'] + 30 * 86400 + 10 * 86400 + 3600);
    const { ctx, page } = await L.open('creator');
    await page.goto(`${L.APP}/vaults/${v.vault}`, { waitUntil: 'networkidle' });
    await page.getByTestId('creator-panel').waitFor();
    const release = page.getByRole('button', { name: /Release 1 lapsed policy/ });
    await release.waitFor({ timeout: 20000 });
    const before = await page.getByText('Active policies').locator('xpath=..').innerText();
    await release.click();
    await L.toast(page, 'success');
    await page.waitForFunction(() => !/Release \d+ lapsed/.test(document.body.innerText), null, { timeout: 20000 });
    const after = await page.getByText('Active policies').locator('xpath=..').innerText();
    expect(before.replace(/\D/g, '') === '1' && after.replace(/\D/g, '') === '0', `active policies 1 → 0 (was "${before}" → "${after}")`);
    await L.shot(page, '07-release-lapsed');
    await ctx.close();
  },

  async flightPolicyDefersWithoutData() {
    const c = await L.open('creator');
    await c.page.goto(`${L.APP}/creator`, { waitUntil: 'networkidle' });
    await c.page.getByRole('button', { name: /Flight delay/ }).first().click();
    await c.page.fill('#threshold', '120');
    const open = Math.ceil((await L.chainTime()) / 60) * 60 + 120;
    const t = { 'Sales open': open, 'Sales close': open + 120, 'Coverage starts': open + 120, 'Coverage ends': open + 20 * 86400, 'Vault expires': open + 30 * 86400 };
    for (const [label, v] of Object.entries(t)) await c.page.getByLabel(label, { exact: true }).fill(local(v));
    await c.page.fill('#deposit', '300');
    await c.page.getByTestId('create-vault').click();
    await c.page.getByTestId('vault-created').waitFor({ timeout: 60000 });
    await c.page.getByRole('button', { name: 'Open vault' }).click();
    await c.page.waitForURL('**/vaults/**');
    const vault = c.page.url().split('/vaults/')[1];
    await c.ctx.close();

    await L.travelTo(open + 5);
    const f = await L.open('farmer');
    await f.page.goto(`${L.APP}/vaults/${vault}`, { waitUntil: 'networkidle' });
    const flightDay = Math.ceil((open + 200) / 86400) * 86400;
    await f.page.fill('#flight', 'ai 101');
    await f.page.fill('#fdate', new Date(flightDay * 1000).toISOString().slice(0, 10));
    await f.page.getByTestId('buy-policy').click();
    await L.toast(f.page, 'success');
    await L.travelTo(flightDay + 3 * 3600);
    await f.page.reload({ waitUntil: 'networkidle' });
    await f.page.waitForFunction(() => !document.querySelector('[data-testid="file-claim"]')?.hasAttribute('disabled'), null, { timeout: 90000 });
    await f.page.getByTestId('file-claim').click();
    await L.toast(f.page, 'success');
    await new Promise((r) => setTimeout(r, 8000));
    const health = await (await fetch('http://localhost:3001/health')).json();
    const reasons = Object.values(health.keeper.deferred).map((d) => d.lastReason).join(' ');
    expect(/No flight data provider configured/.test(reasons), 'keeper defers flight claims with a clear reason when no provider is set');
    await f.ctx.close();
  },
};

(async () => {
  const only = process.argv[2];
  const results = [];
  for (const [name, fn] of Object.entries(steps)) {
    if (only && name !== only) continue;
    const t0 = Date.now();
    process.stdout.write(`▶ ${name} … `);
    try {
      await fn();
      results.push([name, true]);
      console.log(`ok (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    } catch (e) {
      results.push([name, false]);
      console.log('FAILED');
      console.error(e);
      break;
    }
  }
  const failed = results.filter(([, ok]) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} scenarios passed. Screenshots: ${path.join(L.E2E, 'shots')}`);
  process.exit(failed ? 1 : 0);
})();
