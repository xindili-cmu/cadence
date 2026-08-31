#!/usr/bin/env node
/**
 * gsc-oauth-setup.js — one-time helper: turn an OAuth client into the
 * `GSC_OAUTH_JSON` secret that weekly-brief.js uses for Search Console.
 *
 * WHY THIS EXISTS (2026-08-31): the original path was a service-account key,
 * but Google's "Secure by default" org policy
 * (`iam.disableServiceAccountKeyCreation`) blocks key creation on this
 * account — on the CMU workspace account AND on the personal Gmail. OAuth
 * refresh tokens need no service-account key, so they sidestep the policy.
 *
 * RUN LOCALLY, NEVER IN CI: it opens a localhost callback listener and needs
 * a browser sign-in. CI only ever consumes the resulting secret.
 *
 *   node scripts/gsc-oauth-setup.js
 *
 * It prints the JSON to paste into the repo secret. The secret contains a
 * long-lived credential — paste it straight into GitHub, don't commit it,
 * don't paste it into a chat.
 *
 * Scope is `webmasters.readonly`: read Search Console stats, nothing else.
 */

const http = require('http');
const crypto = require('crypto');
const readline = require('readline');

const REDIRECT_PORT = 8737; // arbitrary high port; must match the OAuth client
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

const ask = (q) => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, (a) => { rl.close(); resolve(a.trim()); });
});

const SETUP_STEPS = `
──────────────────────────────────────────────────────────────────────
先在 Google Cloud 建一个 OAuth 客户端（一次性，约 3 分钟）：

  1. console.cloud.google.com → 选中你的项目（如 cadence-gsc）
  2. APIs & Services → Library → 搜 "Search Console API" → Enable
  3. APIs & Services → OAuth consent screen
       - User type: External → Create
       - App name 随便填（如 Cadence GSC），support email 选自己
       - Audience/Test users 那步把自己的 Gmail 加进去
       - ⚠️ 建好后回到 OAuth consent screen 点 "PUBLISH APP"
         （留在 Testing 状态的话 refresh token 7 天就失效，周报会每周报错）
  4. APIs & Services → Credentials → + CREATE CREDENTIALS
       → OAuth client ID → Application type: **Web application**
       → Authorized redirect URIs 填这一条（必须一模一样）：
             ${REDIRECT_URI}
       → CREATE
  5. 弹窗里的 Client ID / Client secret 就是下面要填的两项
──────────────────────────────────────────────────────────────────────
`;

async function main() {
  console.log(SETUP_STEPS);
  const clientId = await ask('Client ID: ');
  const clientSecret = await ask('Client secret: ');
  if (!clientId || !clientSecret) {
    console.error('\n❌ 两项都不能为空，重跑一次。');
    process.exit(1);
  }

  // CSRF guard: Google echoes `state` back; a callback without our exact
  // value didn't come from the flow we started.
  const state = crypto.randomBytes(16).toString('hex');
  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',   // ← without this, no refresh token comes back
    prompt: 'consent',        // ← forces a fresh refresh token on re-runs
    state,
  });

  console.log('\n在浏览器打开这个链接并授权（用能访问 Search Console 的那个 Google 账号）：\n');
  console.log(authUrl);
  console.log('\n（页面可能显示「Google hasn’t verified this app」——这是你自己刚建的应用，点 Advanced → Go to … 继续）\n');
  console.log(`等待回调 http://localhost:${REDIRECT_PORT} …  (Ctrl+C 取消)`);

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
      if (u.pathname !== '/oauth2callback') { res.writeHead(404).end(); return; }
      const done = (msg) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body style="font:16px system-ui;padding:40px">${msg}</body></html>`);
        server.close();
      };
      const err = u.searchParams.get('error');
      if (err) { done(`❌ 授权被拒绝：${err}`); reject(new Error(err)); return; }
      if (u.searchParams.get('state') !== state) {
        done('❌ state 不匹配，已中止。'); reject(new Error('state mismatch')); return;
      }
      const c = u.searchParams.get('code');
      if (!c) { done('❌ 回调里没有 code。'); reject(new Error('no code')); return; }
      done('✅ 授权成功，回到终端看结果。');
      resolve(c);
    });
    server.listen(REDIRECT_PORT);
    server.on('error', reject);
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    console.error(`\n❌ 换 token 失败 ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const tok = await res.json();
  if (!tok.refresh_token) {
    console.error('\n❌ 返回里没有 refresh_token。通常是这个账号之前已授权过同一个客户端。');
    console.error('   去 myaccount.google.com/permissions 撤销该应用，然后重跑本脚本。');
    process.exit(1);
  }

  // Prove the credential works before telling Cindy to store it — a secret
  // that only fails at 07:30 Monday inside cron is exactly the silent-drift
  // failure this repo keeps getting bitten by.
  const site = process.env.GSC_SITE_URL || 'sc-domain:incadencept.com';
  const probe = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: '2026-01-01', endDate: '2026-12-31', dimensions: [], rowLimit: 1 }),
    }
  );
  if (probe.ok) {
    console.log(`\n✅ 已验证：这套凭证能读 ${site} 的数据。`);
  } else {
    console.log(`\n⚠️  凭证拿到了，但试读 ${site} 失败 ${probe.status}：${(await probe.text()).slice(0, 300)}`);
    console.log('   常见原因：授权时选错了 Google 账号（要用 Search Console 里有权限的那个）。');
  }

  const payload = JSON.stringify({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: tok.refresh_token,
  });
  console.log('\n──────────────────────────────────────────────────────────────────────');
  console.log('把下面整行（含大括号）存成 GitHub repo secret `GSC_OAUTH_JSON`：');
  console.log('  repo → Settings → Secrets and variables → Actions → New repository secret');
  console.log('──────────────────────────────────────────────────────────────────────\n');
  console.log(payload);
  console.log('\n⚠️  这行是长期凭证：别提交进仓库、别贴进聊天。存完就可以关掉终端。');
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
