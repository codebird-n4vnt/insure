/**
 * Captures the screenshots used in docs/USER_GUIDE.md by driving a realistic
 * scenario through the real UI. Run on a fresh stack: `bash stack.sh up && node docs-shots.cjs`.
 */
const path = require('path');
const fs = require('fs');
const L = require('./lib.cjs');

const OUT = path.join(__dirname, '..', 'docs', 'images');
const local = (unix) => { const d = new Date(unix * 1000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const HIDE_DEV = 'nextjs-portal{display:none!important}';

async function go(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: HIDE_DEV });
}
const HIDE_CHROME = 'nav, .fixed.top-0 { visibility: hidden !important; }';
async function dismissToasts(page) {
  for (const b of await page.getByRole('button', { name: 'Dismiss notification' }).all()) await b.click().catch(() => {});
}
async function snap(target, name, opts = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  // Element shots scroll under the fixed header; hide it for those only.
  const isElement = typeof target.page === 'function';
  const page = isElement ? target.page() : target;
  // No stray hover tooltips, focus rings or leftover notifications in the docs.
  await page.mouse.move(2, 400);
  await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur());
  if (!opts.keepToasts) await dismissToasts(page);
  delete opts.keepToasts;
  await page.waitForTimeout(300);
  const style = isElement ? await target.page().addStyleTag({ content: HIDE_CHROME }) : null;
  await target.screenshot({ path: path.join(OUT, name + '.png'), ...opts });
  if (style) await style.evaluate((el) => el.remove());
  console.log('  📸', name);
}
const utc = (iso) => Math.floor(Date.parse(iso) / 1000);

/** Create a vault through the UI; returns its address. */
async function createVault(page, { weather, threshold, obs, place, regionKm, payout, premium, deposit, times, shoot }) {
  await go(page, L.APP + '/creator');
  if (!weather) await page.getByRole('button', { name: /Flight delay/ }).first().click();
  await page.fill('#threshold', String(threshold));
  if (weather) {
    await page.fill('#obs', String(obs));
    await page.getByLabel('Search for a place').fill(place);
    await page.getByRole('button', { name: new RegExp(`${place}.*`) }).first().click();
    await page.getByRole('button', { name: new RegExp(`±${regionKm} km`) }).click();
  }
  await page.fill('#payout', String(payout));
  await page.fill('#premium', String(premium));
  await page.fill('#fee', '500');
  await page.fill('#deposit', String(deposit));
  for (const [label, v] of Object.entries(times)) await page.getByLabel(label, { exact: true }).fill(local(v));
  if (shoot) await shoot(page);
  await page.getByTestId('create-vault').click();
  await page.getByTestId('vault-created').waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Open vault' }).click();
  await page.waitForURL('**/vaults/**');
  return page.url().split('/vaults/')[1];
}

(async () => {
  const viewport = { width: 1280, height: 860 };
  const c = await L.open('doc-creator', viewport);
  const f = await L.open('doc-farmer', viewport);
  const t = await L.open('doc-traveller', viewport);
  for (const [who, p] of [['creator', c.page], ['farmer', f.page], ['traveller', t.page]]) {
    await go(p, L.APP + '/vaults');
    await L.connectDemo(p);
    L.fund(await L.walletAddress(p), who === 'creator' ? 5000 : 200);
  }

  const t0 = Math.ceil((await L.chainTime()) / 60) * 60 + 180;

  // ── Underwriter prices and creates a monsoon drought vault (the guide's main example) ──
  const monsoonVault = await createVault(c.page, {
    weather: true, threshold: 45, obs: 21, place: 'Nagpur', regionKm: 250, payout: 100, premium: 8, deposit: 1000,
    times: {
      'Sales open': t0, 'Sales close': utc('2027-06-14T18:30:00Z'), 'Coverage starts': utc('2027-06-14T18:30:00Z'),
      'Coverage ends': utc('2027-09-15T18:30:00Z'), 'Vault expires': utc('2027-09-29T18:30:00Z'),
    },
    shoot: async (page) => {
      await page.getByTestId('backtest-hits').waitFor({ timeout: 60000 });
      await page.waitForTimeout(1500);
      await snap(page.locator('section').nth(1), 'create-vault-rule');
      await snap(page.locator('section').nth(2), 'create-vault-money');
    },
  });

  // ── A short demo vault whose claim can be settled with real data today ──
  const drought = { 'Sales open': t0, 'Sales close': t0 + 180, 'Coverage starts': t0 + 180, 'Coverage ends': t0 + 60 * 86400, 'Vault expires': t0 + 74 * 86400 };
  const droughtVault = await createVault(c.page, {
    weather: true, threshold: 30, obs: 7, place: 'Nagpur', regionKm: 250, payout: 100, premium: 5, deposit: 500, times: drought,
  });

  // ── A flight-delay vault ──
  const flight = { 'Sales open': t0, 'Sales close': t0 + 180, 'Coverage starts': t0 + 180, 'Coverage ends': t0 + 30 * 86400, 'Vault expires': t0 + 44 * 86400 };
  const flightVault = await createVault(c.page, { weather: false, threshold: 120, payout: 60, premium: 4, deposit: 600, times: flight });

  await L.travelTo(t0 + 10);

  // ── Marketplace ──
  await go(f.page, L.APP + '/vaults');
  await f.page.getByTestId('vault-grid').waitFor({ timeout: 20000 });
  await f.page.waitForTimeout(800);
  await snap(f.page, 'marketplace');

  // ── Farmer buys monsoon cover ──
  await go(f.page, `${L.APP}/vaults/${monsoonVault}`);
  await f.page.getByLabel('Search for a place').fill('Wardha');
  await f.page.getByRole('button', { name: /Wardha.*Maharashtra/ }).first().click();
  await f.page.getByTestId('backtest-hits').waitFor({ timeout: 60000 });
  await f.page.waitForTimeout(1500);
  await snap(f.page.getByTestId('policy-panel'), 'buy-drought');
  await f.page.getByTestId('buy-policy').click();
  await L.toast(f.page, 'success');
  await f.page.getByTestId('policy-status').waitFor({ timeout: 20000 });
  await f.page.waitForTimeout(800);
  await snap(f.page.getByTestId('policy-panel'), 'policy-active');

  // …and the short demo cover, so we can show a claim end to end.
  await go(f.page, `${L.APP}/vaults/${droughtVault}`);
  await f.page.getByLabel('Search for a place').fill('Wardha');
  await f.page.getByRole('button', { name: /Wardha.*Maharashtra/ }).first().click();
  await f.page.getByTestId('buy-policy').click();
  await L.toast(f.page, 'success');

  // ── Traveller buys flight cover ──
  await go(t.page, `${L.APP}/vaults/${flightVault}`);
  const flightDay = Math.ceil((flight['Coverage starts'] + 60) / 86400) * 86400 + 86400;
  await t.page.fill('#flight', 'AI101');
  await t.page.fill('#fdate', new Date(flightDay * 1000).toISOString().slice(0, 10));
  await snap(t.page.getByTestId('policy-panel'), 'buy-flight');
  await t.page.getByTestId('buy-policy').click();
  await L.toast(t.page, 'success');

  // ── A week later the farmer files a claim; the oracle settles it ──
  await L.travelTo(drought['Coverage starts'] + 7 * 86400 + 3600);
  await go(f.page, `${L.APP}/vaults/${droughtVault}`);
  await f.page.waitForFunction(() => !document.querySelector('[data-testid="file-claim"]')?.hasAttribute('disabled'), null, { timeout: 90000 });
  await snap(f.page.getByTestId('policy-panel'), 'file-claim');
  await f.page.getByTestId('file-claim').click();
  await L.toast(f.page, 'success');
  await f.page.waitForFunction(() => /approved|rejected/i.test(document.querySelector('[data-testid="claim-status"]')?.textContent || ''), null, { timeout: 180000 });
  await f.page.waitForTimeout(1500);
  // Frame the policy card and the claim history together, with the live notification.
  await f.page.evaluate(() => {
    const el = document.querySelector('[data-testid="policy-panel"]');
    if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 150);
  });
  await snap(f.page, 'claim-settled', { keepToasts: true });
  await f.page.getByTestId('claim-row').first().click();
  await f.page.getByTestId('hash-match').waitFor({ timeout: 30000 });
  await f.page.addStyleTag({ content: HIDE_DEV });
  await f.page.waitForTimeout(1000);
  await snap(f.page, 'evidence', { fullPage: true });

  await go(f.page, `${L.APP}/my-insurance`);
  await f.page.getByText('Crop Drought Policy').first().waitFor({ timeout: 20000 });
  await f.page.waitForTimeout(800);
  await snap(f.page, 'my-insurance');

  // ── Underwriter views ──
  await go(c.page, `${L.APP}/vaults/${droughtVault}`);
  await c.page.getByTestId('creator-panel').waitFor();
  await c.page.waitForTimeout(800);
  await snap(c.page.getByTestId('creator-panel'), 'underwriter-panel');
  await go(c.page, `${L.APP}/creator?tab=vaults`);
  await c.page.getByTestId('my-vaults').waitFor({ timeout: 20000 });
  await c.page.waitForTimeout(800);
  await snap(c.page, 'underwriter-dashboard');

  // ── Home, with live numbers ──
  await go(c.page, L.APP);
  await c.page.getByTestId('recent-claims').waitFor({ timeout: 20000 });
  await c.page.waitForTimeout(1500);
  await snap(c.page, 'home');

  for (const s of [c, f, t]) await s.ctx.close();

  const m = await L.open('doc-mobile', { width: 390, height: 844 });
  await go(m.page, `${L.APP}/vaults/${droughtVault}`);
  await m.page.waitForTimeout(1500);
  await snap(m.page, 'mobile-vault');
  await m.ctx.close();
  console.log('done');
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
