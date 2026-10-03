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
| `app/scripts/app-icons.mjs` | Makes the phone app icon from the logo in Settings and colours Android's start screen like the splash picture (run by the publish workflow) |
| `.github/workflows/deploy.yml` | Builds the app and publishes it on GitHub Pages on every change |
| `.github/scripts/check-config.mjs` | Stops publishing if `config.js` has a typing mistake or a secret key |
| `SETUP-GUIDE.md` | Full setup and daily-use guide |

## Features

- **Logins** with mobile number + 6-digit PIN (no OTP). Mobile boxes accept exactly 10 digits. The first account is the Admin. The Admin creates members (or approves self sign-ups), resets PINs, blocks members and promotes them to admin. Accounts from before the PIN switch are asked once to set a PIN.
- **Donations**: name, mobile, amount (quick 116/516/1116… buttons), cash/UPI (temple UPI QR with the amount), village, gotram, purpose. Receipt numbers have no gaps (`DSR26-0001`). The server records who collected each donation. Saving twice on a weak network never creates a duplicate.
- **WhatsApp receipt** (one tap, free) in Telugu from an editable template, with an SMS fallback and a "verify receipt" page for donors.
- **Expenses**: categories and a bill photo. Member expenses need admin approval.
- **Member expenses – 2 ways to settle** (database version 7): when approving, the admin chooses **↔️ Set off against collections** (deducted from the cash the member hands over, now or from later collections – as before) or **💸 Pay back now** – the admin pays the member in **cash** or through the **temple UPI** (with an optional UPI transaction no. / note), and nothing is deducted. A set-off expense can be paid back later (Expenses → the expense → *Pay back*, or Cash handover → *🧾 Expenses*), and a pay back can be undone. An expense already used in a cash handover cannot be paid back. Every pay back and undo is in the change history; the member sees how each expense was settled; the dashboard shows what was paid back (cash / UPI) and what the committee still owes members; the Excel export has a *Settlement* column.
- **Cash handover**: running balance per member = cash collected − approved expenses that are set off − cash handed over (paid-back expenses are not deducted). Shortfalls carry forward.
- **Delete members** (database version 11): Members → 🗑️ on a row, or tap the person → *🗑️ Delete member*. The admin can delete any member or admin except themselves. Someone without records is removed completely; someone with receipts / expenses / handovers keeps those records in the accounts (with the name) – only the login is removed and they disappear from the list. Cash they still hold stays in *cash with members* (the handover can still be recorded) and expenses waiting for approval stay in Expenses. The mobile number can be used for a new account. Written to the change history.
- **Opening balance, cash in hand / cash at bank** (database version 9): ☰ More → 🏦 Cash & Bank → *📒 Opening balance* takes the money the committee already had (cash in hand and cash at bank separately, with an *as on* date); net position = opening balance + donations − expenses. The dashboard's net position is split into **💵 Cash in hand** (with the committee + still with members) and **🏦 Cash at bank**. Every approved expense moves the right balance – committee expenses paid in **Cash** reduce cash in hand, paid by **UPI** reduce the bank; member expenses set off reduce the cash with that member, pay backs reduce cash or bank by how they were paid. **☰ More → 🏦 Cash & Bank** shows how both are worked out and records **cash deposited into the bank** / **cash withdrawn from the bank** (admin only, editable, in the change history). Net position = cash in hand + cash at bank − anything the committee owes members. The Excel report and the yearly export have the split and a *Cash & Bank* sheet. When the admin switches on *📊 Members can see the financial position*, team members see the same split (cash in hand, cash at bank, opening balance) on their home screen.
- **Financial position for members** (Members page → *📊 Members can see the financial position*, OFF by default, database version 7): when ON, team members see total donations, total expenses and the balance on their home screen – only the totals, never names or other members' balances.
- **Dashboard**: net position (green surplus / red deficit), totals, cash with members, today's figures, pending approvals, UPI to verify, charts and a full Excel report.
- **Programs**: day-wise schedule with alankaram, timings and place. Program name, place and details can be written in Telugu and English; each shows in the language the app or page is in (one language filled in → shown in both). Needs database version 6 for place and details.
- **Puja schedule** (Programs → 🪔 Puja schedule): which family does the puja on which day. The admin adds all festival days in one tap and writes the family on each day (puja, time, village, gotram, mobile, note); free days show *Available*. Puja, family, village and gotram can be written in Telugu and English (database version 6). Every team member sees it; the public page shows only the date, puja, family and village (never mobile, gotram or note), with its own on/off switch in Public page → *What can visitors see?*. Included in the Excel export and in Delete data. Needs database version 5.
- **Public QR page**: the Admin switches each section on or off. It never shows mobile numbers.
- **QR poster editor** (Public page & QR → 🖼️ QR poster → ✏️ Edit poster): an A4 poster to print, with a live preview. Every line (garland, logo, temple name, festival name, dates, the Telugu and English messages under the QR, the web address, the bottom line) can be switched off or reworded; lines that are off leave no gap. The automatic words come from Settings and name only what visitors can actually see. Download or share the poster. Saving the choices needs database version 6.
- **Donate (UPI) on the public page**: a *🙏 Donate to the temple* section right under the header opens the visitor's UPI apps (GPay, PhonePe, Paytm, BHIM…) to pay the temple UPI ID, with amount buttons, *Other amount*, *Copy UPI ID* and the temple UPI QR (shown at once on laptops; *Save QR* for "scan from gallery"). A donation link (`…/p/<code>#donate`) jumps straight to it. Set up and switched on/off in Public page & QR → *🙏 Donation link (UPI)* (the same UPI ID, payee name and amounts as in Settings). Needs database version 6.
- **Audit trail** of cancellations, edits, approvals, handovers and PIN resets.
- **Data tools (admin only, Settings → Data)**: a full Excel backup of any year (summary, donations, expenses, cash handovers, members, day-wise, programs, alankaram, puja schedule) plus a ZIP of the bill photos, so the app can be reused every year. **Delete data** has two confirmations: step 1 is a checklist with backup status and cash warnings, step 2 needs the word DELETE plus the admin PIN, checked on the server (5 tries, then 15 minutes locked).
- **Database update notice**: when a new app version needs a database change, the admin sees *"Database update needed"* with a **Copy SQL** button. `setup.sql` is always safe to run again.
- **App icon = the logo from Settings**: every publish makes the home-screen, iPhone and browser-tab icons from it, and a 30-minute check rebuilds the website when the logo changes (no logo → the default lamp icon).
- **Splash screen**: a full-screen picture chosen in Settings (1080 × 1920 px), the complete picture always shown, for 5 seconds (2–10) every time the app opens – also on a phone's first open and when the installed app is opened again after 5+ minutes (not after a WhatsApp receipt). Tap to skip; kept on the phone so it appears at once, even offline; never on receipt or public-page links. Needs database version 4.
- **Loading / refresh**: while the app (or the public page) loads or is refreshed, only a spinning circle is shown – no icon.
- Installable on phones as **Dasara** (Add to Home screen) with a sidebar layout on laptops. English by default, Telugu with one tap. Everything is editable in the app.

## Tech

React 18 + Vite · Supabase (Postgres, Auth, Storage, Row Level Security) · `qrcode` · SheetJS (Excel, lazy-loaded).
All business rules live in the database (`setup.sql`): RLS policies + `SECURITY DEFINER` functions.
The browser only ever uses the publishable key. Mobile logins are mapped internally to
`<mobile>@members.utsav.invalid` (a reserved domain, so no e-mail is ever sent).
The app works at the site root or in a GitHub Pages sub-folder (`/dasara-utsav/`). `404.html` makes
receipt links (`/r/…`) and QR links (`/p/…`) open directly.

## Testing done

- 122 automated database/API checks against the real Supabase Auth server + PostgREST (pay back: only the admin, only approved member expenses, cash or temple UPI only, never twice, not after a cash handover, the amount locked, undo, not changeable around the logged step, balances / handovers / dashboard / member summary follow it, change history; financial position: only when switched on, only active members, only the totals; security rules, receipt numbering, handover maths, public page privacy, PIN reset rules, sign-up rules, splash settings, puja schedule: team reads, only the admin writes, visitors never get mobile / gotram / note, the on/off switch; Donate: the UPI ID reaches visitors only when the section is on and a UPI ID is set, payee name falls back to the temple name, members cannot change the UPI ID / switch / poster, poster choices must be an object; Telugu names saved and shown to visitors – never the Telugu gotram).
- 8 storage permission checks for the logo (upload, replace, member refused). Without the version 3 rule the upload fails exactly as reported ("no permission").
- 33 checks for **Delete data** (now including the puja schedule): only the admin may call it, the DELETE word, wrong PINs and the 15-minute lock, what is deleted and what is kept, receipts restarting at 0001, optional removal of member logins. Upgrading from the version 1 or version 2 `setup.sql` keeps every row identical, including logins.
- 32 checks for the app icon script: icon sizes made from the logo, see-through logos on white, the start screen colour from the splash picture, the 30-minute check (same / new / removed logo or splash, Supabase not reachable), and that a failure never stops a publish.
- 48 browser checks for the splash screen: upload + save, 5-second default, the complete picture on phones (a phone-shaped picture fills the screen edge to edge), tap / Escape to skip, first open on a new phone, the installed app opened again later (not after WhatsApp, not in a browser tab), receipt and public links without it, laptop screens, broken picture, remove, Telugu, and an older database (version 3) still saving every other setting.
- 8 browser checks for the loading screen: refreshing the app, the puja page and the public page (and starting without internet) shows only the spinning circle – no lamp, icon or picture.
- Upgrade test version 3 → 4 on a database full of demo data: every record identical, only the two splash settings added, safe to run twice.
- 52 phone-size browser checks for the **puja schedule**: menu and tabs, "Add all festival days", reserve / edit / free / delete, a family filling a day's *Available* entry, a second puja on one day, the 10-digit mobile box, the member view (read only), the public page (never mobile / gotram / note), the on/off switch, empty schedule, Telugu, and an older database (version 4) showing the update notice, then working after the update.
- Upgrade test version 4 → 5 on a database full of demo data: every record identical, only the puja table and its on/off switch added, safe to run twice.
- 70 phone-size browser checks for **Public page & QR**: the poster editor (9 lines with switches, automatic words from Settings, live preview, save, reopen, emptied words = line left out with no gap, back to automatic, the downloaded A4 poster read back by a QR reader); the donation link settings (wrong UPI ID refused, save, copy link, test link, on/off, no UPI ID); the public *Donate* section (amount buttons, *Other amount*, the exact UPI link, copy, the UPI QR read back – no fixed amount, *Save QR*, `#donate` link, laptop, Telugu, never shown when off); Telugu names in the program and puja schedules (admin, member, public page, Telugu-only family fills a free day); and an older database (version 5) working with the update notice, then everything back after the update.
- 40 phone-size browser checks for **settling member expenses and the financial position**: the settle choice when approving (with the balance effect), approve + pay back by temple UPI with a transaction no., list badges, details, no editing after a pay back, undo, pay back later in cash, set off by default, no pay back after a cash handover or for committee funds; the cash handover page (paid-back amount, *🧾 Expenses* list with *Pay back*, "Amount paid to …" wording); dashboard; change history; the member's home, list and details; the Members page switch (off by default, on → the member sees the same totals as the database, Telugu, off again); and an older database (version 6) working with the update notice, then everything back after the update.
- Upgrade test version 6 → 7 on a database full of demo data: every record and every member balance identical, only the pay-back columns and the members' switch added (empty / off), safe to run twice.
- Upgrade test version 5 → 6 on a database full of demo data: every record identical, only the Donate switch, the poster choices and the Telugu name columns added (empty), safe to run twice.
- 89 phone-size browser checks for the PIN update (equal box sizes, "PIN (6 digits)" labels): app name, English default, 10-digit mobile boxes on login, sign-up, Members and the donation form + edit (typing and pasting +91 numbers), PIN boxes, PIN login, sign-up, old password → set PIN, Me → Change PIN, Members add + reset PIN, logo label and upload (transparent PNG kept, no overwrite mode).
- 54 phone-size browser checks for **Settings → Data** (now with the Puja schedule sheet, Telugu + English name columns and the expense *Settlement* column): year choice and counts; the Excel contents compared with the database (sheets, totals, dates, money format); the ZIP matching the Excel "Bill File" column; both delete steps; leftover photos removed; the member blocked; the "Database update needed" notice and Copy SQL.
- End-to-end phone-size browser tests of every screen (admin, member, public visitor), Excel exports, QR poster and bill photo upload.
- GitHub Pages simulation (`/dasara-utsav/` sub-folder, 404 fallback): login, every page opened directly and refreshed, receipt and QR links, install/offline, logout. 18/18 checks passed.
