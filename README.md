# 🪔 Dasara Utsav App

Festival management for the temple committee: **donations with Telugu WhatsApp receipts,
expenses with approvals, day-end cash handover, a live dashboard (net position), the program
schedule and a public QR page**. It works in Telugu and English, on phones and laptops.

| | |
|---|---|
| 🌐 **Website** | https://dasara.localline.in/ |
| ⚙️ **Connect to Supabase** (2 values) | [Edit `config.js`](https://github.com/vaayuputhracareers/dasara-utsav/edit/main/config.js) |
| ✅ **Publishing status** | [Actions](https://github.com/vaayuputhracareers/dasara-utsav/actions) (a green ✓ means the website is updated) |
| 📘 **Step-by-step guide** | [SETUP-GUIDE.md](SETUP-GUIDE.md) |

## How it fits together

```
 Phones / laptop ──►  Website (this GitHub repository → GitHub Pages, free)
                           │  config.js = Supabase Project URL + Publishable key
                           ▼
                      Supabase (database, logins, bill photos): all the data
```

- **Website**: every time something is saved in this repository, GitHub builds the app and
  publishes it on GitHub Pages by itself in about 2 minutes (`.github/workflows/deploy.yml`).
- **Database**: Supabase. It is created once by running `supabase/setup.sql` in the Supabase SQL Editor.
- **The link between them**: only `config.js`. Names (temple, committee, village, street…), dates,
  UPI ID, the receipt message, members and programs are all edited **inside the app** (Admin → Settings).

## Connect the website to Supabase

1. Supabase → **SQL Editor** → paste all of [`supabase/setup.sql`](supabase/setup.sql) → **Run** (only once).
2. Supabase → **Authentication → Sign In / Providers → Email** → turn **Confirm email OFF**.
3. Open [`config.js`](https://github.com/vaayuputhracareers/dasara-utsav/edit/main/config.js), paste the **Project URL** and **Publishable key** → **Commit changes**.
4. Wait for the green ✓ in [Actions](https://github.com/vaayuputhracareers/dasara-utsav/actions), then open the website.
   **The first account you create becomes the Admin.**

> 🔒 **This repository is public. That is what free GitHub Pages needs, and it is safe:** there are no
> passwords or donor data in the code. The publishable key is designed to be public, and every
> record is protected in Supabase by login and security rules. **Never** put the *secret* key
> (`sb_secret_…` / `service_role`) in `config.js`. If you do, the publishing step stops with a red ✗.

## Folder contents

| Path | What it is |
|---|---|
| `config.js` | **The only file you edit:** Supabase Project URL + Publishable key |
| `supabase/setup.sql` | One-time database script (tables, security rules, calculations, storage). Safe to re-run. |
| `app/` | Source code (React + Vite). Local build: `cd app && npm ci && npm run build` |
| `.github/workflows/deploy.yml` | Builds the app and publishes it on GitHub Pages on every change |
| `.github/scripts/check-config.mjs` | Stops publishing if `config.js` has a typing mistake or a secret key |
| `SETUP-GUIDE.md` | Full setup and daily-use guide |

## Features

- **Logins** with mobile number + 6-digit PIN (no OTP). Mobile boxes accept exactly 10 digits. The first account is the Admin. The Admin creates members (or approves self sign-ups), resets PINs, blocks members and promotes them to admin. Accounts from before the PIN switch set a PIN once (an old password still works for that one login).
- **Donations**: name, mobile, amount (quick 116/516/1116… buttons), cash/UPI (temple UPI QR with the amount), village, gotram, purpose. Receipt numbers have no gaps (`DSR26-0001`). The server records who collected each donation. Saving twice on a weak network never creates a duplicate.
- **WhatsApp receipt** (one tap, free) in Telugu from an editable template, with an SMS fallback and a "verify receipt" page for donors.
- **Expenses**: categories and a bill photo. Member expenses need admin approval and are then deducted from that member's cash.
- **Cash handover**: running balance per member = cash collected − approved expenses − cash handed over. Shortfalls carry forward.
- **Dashboard**: net position (green surplus / red deficit), totals, cash with members, today's figures, pending approvals, UPI to verify, charts and a full Excel report.
- **Programs**: day-wise schedule with alankaram, timings and place.
- **Public QR page**: the Admin switches each section on or off. It has a printable QR poster and never shows mobile numbers.
- **Audit trail** of cancellations, edits, approvals, handovers and PIN resets.
- **Data tools (admin only, Settings → Data)**: a full Excel backup of any year (summary, donations, expenses, cash handovers, members, day-wise, programs, alankaram) plus a ZIP of the bill photos, so the app can be reused every year. **Delete data** has two confirmations: step 1 is a checklist with backup status and cash warnings, step 2 needs the word DELETE plus the admin PIN, checked on the server (5 tries, then 15 minutes locked).
- **Database update notice**: when a new app version needs a database change, the admin sees *"Database update needed"* with a **Copy SQL** button. `setup.sql` is always safe to run again.
- Installable on phones as **Dasara** (Add to Home screen) with a sidebar layout on laptops. English by default, Telugu with one tap. Everything is editable in the app.

## Tech

React 18 + Vite · Supabase (Postgres, Auth, Storage, Row Level Security) · `qrcode` · SheetJS (Excel, lazy-loaded).
All business rules live in the database (`setup.sql`): RLS policies + `SECURITY DEFINER` functions.
The browser only ever uses the publishable key. Mobile logins are mapped internally to
`<mobile>@members.utsav.invalid` (a reserved domain, so no e-mail is ever sent).
The app works at the site root or in a GitHub Pages sub-folder (`/dasara-utsav/`). `404.html` makes
receipt links (`/r/…`) and QR links (`/p/…`) open directly.

## Testing done

- 64 automated database/API checks against the real Supabase Auth server + PostgREST (security rules, receipt numbering, handover maths, public page privacy, PIN reset rules, sign-up rules).
- 8 storage permission checks for the logo (upload, replace, member refused). Without the version 3 rule the upload fails exactly as reported ("no permission").
- 32 checks for **Delete data**: only the admin may call it, the DELETE word, wrong PINs and the 15-minute lock, what is deleted and what is kept, receipts restarting at 0001, optional removal of member logins. Upgrading from the version 1 or version 2 `setup.sql` keeps every row identical, including logins.
- 78 phone-size browser checks for the PIN update: app name, English default, 10-digit mobile boxes on login, sign-up, Members and the donation form + edit (typing and pasting +91 numbers), PIN boxes, PIN login, sign-up, old password → set PIN, Me → Change PIN, Members add + reset PIN, logo label and upload (transparent PNG kept, no overwrite mode).
- 49 phone-size browser checks for **Settings → Data**: year choice and counts; the Excel contents compared with the database (sheets, totals, dates, money format); the ZIP matching the Excel "Bill File" column; both delete steps; leftover photos removed; the member blocked; the "Database update needed" notice and Copy SQL.
- End-to-end phone-size browser tests of every screen (admin, member, public visitor), Excel exports, QR poster and bill photo upload.
- GitHub Pages simulation (`/dasara-utsav/` sub-folder, 404 fallback): login, every page opened directly and refreshed, receipt and QR links, install/offline, logout. 18/18 checks passed.
