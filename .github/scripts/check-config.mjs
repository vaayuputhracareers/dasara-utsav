// Checks config.js before the website is published.
//  • stops if the SECRET key was pasted by mistake (this file is public!)
//  • stops on typing mistakes, so a working website is never replaced by a broken one
// Usage: node .github/scripts/check-config.mjs config.js
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const file = process.argv[2] || 'config.js';
const gh = !!process.env.GITHUB_ACTIONS;
const say = (kind, msg) => console.log(gh ? `::${kind} file=${file},title=config.js::${msg}` : `${kind.toUpperCase()}: ${msg}`);
const fail = (msg) => { say('error', msg); process.exit(1); };

function jwtRole(key) {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role || null; } catch { return null; }
}

let cfg;
try {
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync(file, 'utf8'), sandbox, { timeout: 1000 });
  cfg = sandbox.window.APP_CONFIG;
} catch (e) {
  fail(`There is a typing mistake in config.js (${e.message}). Keep both values inside "double quotes" and keep the comma after the first line.`);
}
if (!cfg || typeof cfg !== 'object') fail('config.js must contain: window.APP_CONFIG = { supabaseUrl: "...", supabaseKey: "..." };');

const url = String(cfg.supabaseUrl ?? '').trim();
const key = String(cfg.supabaseKey ?? '').trim();

if (/^sb_secret_/i.test(key) || jwtRole(key) === 'service_role' || /^sb_secret_/i.test(url)) {
  fail('This is the SECRET key – it must never be on a website. Paste the PUBLISHABLE key (sb_publishable_…) instead. Because this file is public, also create a new secret key in Supabase (Project Settings → API Keys) and delete the old one.');
}
if (!url && !key) {
  say('warning', 'config.js is still empty – the website will show "App setup needed" until you paste your Supabase Project URL and Publishable key.');
  process.exit(0);
}
if (!url || !key) fail('Please fill BOTH supabaseUrl and supabaseKey in config.js.');
if (!/^https:\/\/[a-z0-9.-]+(:\d+)?(\/.*)?$/i.test(url)) fail(`supabaseUrl should look like https://abcdefgh.supabase.co (found: "${url}")`);
if (/\s/.test(key)) fail('supabaseKey contains a space or line break – copy it again with the copy button in Supabase.');
if (!/^sb_publishable_/.test(key) && jwtRole(key) !== 'anon') {
  say('warning', 'supabaseKey does not look like a Publishable key (sb_publishable_…) or the older anon key. Please double-check it.');
}
console.log(`config.js looks good → ${url}`);
