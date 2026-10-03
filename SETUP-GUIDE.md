# 🪔 Dasara Utsav App: Setup Guide

**How it fits together:**
the **website** lives on **GitHub** (free, published automatically) → it talks to the **database** on **Supabase**.
The only connection between them is one small file, **`config.js`** (2 values).

After setup, everything else is edited **inside the app** by the Admin: temple name, committee,
village, street, dates, UPI ID, receipt message, programs and members.

| Part | Who | Time |
|---|---|---|
| A. Supabase (database) | you | ~10 min |
| B. GitHub (website) | you create the account + key, **Arena uploads everything** | ~10 min |
| C. Connect them (`config.js`) | you | ~3 min |
| D. First time inside the app | you (Admin) | ~10 min |
| E. Own subdomain (optional, Cloudflare) | you add 1 DNS record, Arena does the rest | ~5 min + certificate wait |

---

## Part A: Supabase (the database)

1. Open **https://supabase.com** → **Start your project** → sign in (Google or GitHub).
2. **New project**
   - Name: `dasara-2026`
   - Database password: create one and **keep it to yourself**
   - Region: **South Asia (Mumbai)**
   - **Create new project** → wait ~2 minutes.
3. Left menu → **SQL Editor** → **New query**.
   Copy **everything** from **`supabase/setup.sql`**. On GitHub, open the file and click the
   **⧉ Copy raw file** button at the top right of the code. Paste it and click **Run**.
   ✅ You should see *"Success. No rows returned"*. (It is safe to run again later.)
4. Left menu → **Authentication** → **Sign In / Providers** (older screens: **Providers**) → **Email**
   - **Confirm email → OFF** → **Save**
     (members log in with their mobile number, so no e-mails are sent)
   - Keep **"Allow new users to sign up" ON**. The app itself decides who may join.
5. Click **Connect** (top of the dashboard) or **Project Settings → API Keys** and note:
   - **Project URL**: looks like `https://abcdefgh.supabase.co`
   - **Publishable key**: looks like `sb_publishable_...` (the older "anon public" key also works)

> ⚠️ Never share or paste the **secret key** (`sb_secret_...` / `service_role`) or your database password anywhere.

---

## Part B: GitHub (the website)

### B1. Create the GitHub account
1. Open **https://github.com/signup** → e-mail, password, **username** → verify the e-mail (GitHub sends a code).
2. 💡 **The username becomes part of the website address:**
   `https://USERNAME.github.io/dasara-utsav/`
   Choose something short and clear, e.g. `attilidasara` (letters, numbers, hyphens only).

### B2. Create a key (token) for Arena
1. Click your **profile photo** (top right) → **Settings**.
2. Left menu, at the very bottom → **Developer settings** → **Personal access tokens** → **Tokens (classic)**.
3. **Generate new token** → **Generate new token (classic)**.
4. Fill in:
   - **Note:** `arena-upload`
   - **Expiration:** `30 days` (covers the festival)
   - Tick **☑ repo** and **☑ workflow**. Nothing else is needed.
5. **Generate token** → copy the code that starts with **`ghp_`** (GitHub shows it only once).
6. Send that code to Arena in the chat.

Arena then **creates the repository `dasara-utsav`**, **uploads all the code**, **turns on GitHub Pages**,
waits until the website is live and gives you the exact links.

> 🔒 **Safety**
> - The repository is **public**, which free GitHub Pages requires. This is safe: the code contains no
>   passwords and no donor data. All data stays in Supabase, protected by logins and security rules.
> - When the work is finished (or after the festival), delete the token: **Settings → Developer settings →
>   Personal access tokens → Tokens (classic) → Delete**. The website keeps working.
> - For later changes, create a new token the same way and send it again.

---

## Part C: Connect the website to Supabase (`config.js`)

1. Open your repository `https://github.com/USERNAME/dasara-utsav` → click **`config.js`** → click the **✏️ pencil** (Edit).
2. Paste your two values from Part A, step 5, between the quotes:
   ```js
   window.APP_CONFIG = {
     supabaseUrl: "https://abcdefgh.supabase.co",
     supabaseKey: "sb_publishable_xxxxxxxxxxxxxxxx"
   };
   ```
3. Click **Commit changes…** → **Commit changes**.
4. Click the **Actions** tab. Wait for **"Publish website"** to show a **green ✓** (2–3 minutes).
5. Open **`https://USERNAME.github.io/dasara-utsav/`**. You should see the login screen. 🎉

*If you see a red ✗:* click it and read the message, for example *"This is the SECRET key"* or
*"There is a typing mistake in config.js"*. Fix `config.js` the same way. The old website stays online until the fix is published.

*(Prefer not to edit? Send Arena the Project URL + Publishable key and it will fill `config.js` for you.
Never send the secret key or database password.)*

---

## Part D: First time inside the app

1. Open the website on your phone → **Create an account / కొత్త ఖాతా సృష్టించండి** → your name, mobile, a **6-digit PIN**.
   👉 **The first account becomes the Admin** (that's you). Do this right after Part C.
2. **☰ మరిన్ని / More → ⚙️ Settings**: fill in and **Save**:
   - Temple name, committee name, village, street (Telugu + English)
   - Festival title, year, start & end dates, receipt prefix (e.g. `DSR26` → DSR26-0001)
   - Temple UPI ID + account name, quick amounts (116, 516, 1116 …)
   - Donation purposes, expense categories
   - The Telugu WhatsApp receipt message (tap the tags to insert; live preview below)
   - Logo / deity photo (optional): a **square picture, 512 × 512 px** (JPG or PNG). It is shown in a circle,
     and about 30 minutes after saving it also becomes the **phone app icon**.
   - **📱 Splash screen** (optional): a **tall picture, 1080 × 1920 px** (portrait, JPG or PNG; a picture made for your
     phone screen also works). Every time the app is opened it fills the screen for the chosen seconds (**5** by
     default, 2–10), then the app opens; a tap skips it. The **complete picture is always shown** – nothing is cut off;
     if a phone screen has a slightly different shape, the small gap is filled with a soft blurred copy of the picture.
     It also shows the very first time the app is opened on a new phone, and when the installed app is opened again
     after 5 minutes or more (not when you come back from sending a WhatsApp receipt). **▶️ Preview** shows it straight
     away. Donor receipt links and the public QR page open without it.
   - *App web address*: **leave empty**. The app detects its address by itself (`https://USERNAME.github.io/dasara-utsav` or your own subdomain).
3. **☰ More → 👥 Members → ➕ Add member** → name, Telugu name, mobile. A random **6-digit PIN** is filled in
   (🎲 New gives another one) →
   **Send login details on WhatsApp**. Repeat for each team member.
   (You can also let members sign up themselves. They wait for your approval.)
4. **☰ More → 📅 Programs** → *Fill sample Navaratri alankaram list* → edit each day → add programs with timings.
   Name, place and details have a **Telugu** and an **English** box: each shows in the language the app or page is in
   (fill only one and it shows in both).
   **☰ More → 🪔 Puja schedule** (or the **🪔 Puja schedule** tab on the Programs page) → *📅 Add all festival days*
   → tap a day → write the **family doing the puja** (and if you like: puja name, time, village, gotram, mobile,
   note) → **Save**. Family, puja name, village and gotram have Telugu and English boxes. A day without a family shows **Available**. Mobile, gotram and note are seen only by the team.
   Every team member sees the puja schedule; visitors see it on the public page when *🪔 Puja schedule* is ON there.
5. **☰ More → 📱 Public page & QR** → switch ON the sections visitors may see → turn the page **ON**.
   - **🙏 Donation link (UPI)**: enter the temple **UPI ID** (printed under the temple's UPI QR; looks like
     name@bank), the name shown in the payment app and the amount buttons → **Save**, and keep
     *Show the "Donate" section* ON. Visitors then see **🙏 Donate to the temple** at the top of the page: one tap
     opens GPay / PhonePe / Paytm with the temple UPI ID filled in, and the money goes straight to the temple account.
     **📲 Test on this phone** opens your own UPI app (just close it). Share the **donation link** (`…#donate`) in
     WhatsApp groups.
   - **🖼️ QR poster → ✏️ Edit poster**: switch off the lines you don't want and change the words (the picture
     changes at once) → **Save** → **⬇️ Download poster** → print it and keep it at the temple.
6. **☰ More → 👥 Members** → *📊 Members can see the financial position*: switch it ON if team members may see the total
   donations, total expenses and balance on their home screen (OFF by default; you can change it any time).
7. On every phone: open the link in **Chrome → ⋮ → Add to Home screen** so it opens like an app (the icon is called **Dasara**).

The app opens in **English**. Tap **తెలుగు** at the top to switch; each phone remembers its choice. WhatsApp receipts
stay in Telugu.

---

## Part E (optional): Your own address with a Cloudflare subdomain

Use an address like `dasara.yourdomain.com` instead of `USERNAME.github.io/dasara-utsav`.
👉 **Do this before printing QR posters and before members add the app to their phones**, because both use the address.

1. **Cloudflare** → your domain → **DNS** → **Records** → **Add record**:

   | Field | Value |
   |---|---|
   | Type | `CNAME` |
   | Name | `dasara` (only the part before your domain) |
   | Target | `USERNAME.github.io` (nothing after it, **no** `/dasara-utsav`) |
   | Proxy status | **DNS only** (grey cloud) ← important |
   | TTL | Auto |

   → **Save**.
   > Why the grey cloud? GitHub creates the free HTTPS certificate itself. With the orange cloud (proxy) the
   > certificate cannot be created, and the site may show *"too many redirects"*.
2. Send the full address (e.g. `dasara.yourdomain.com`) to Arena. Arena connects it on GitHub, rebuilds the
   website for the new address, switches on HTTPS and checks everything.
   *Doing it yourself instead:* repository **Settings → Pages → Custom domain** → type the address → **Save** →
   wait for *"DNS check successful"* → **Actions → Publish website → Run workflow** (the app must be rebuilt for
   the new address) → when the certificate is ready (5–60 minutes) tick **Enforce HTTPS**.
3. Open `https://dasara.yourdomain.com` ✓. Old `github.io` links (receipts already sent) forward to the new address automatically.
4. In the app, **Settings → App web address** stays **empty**.

*Optional extra safety:* GitHub profile photo → **Settings → Pages** → **Add a domain** → `yourdomain.com` →
add the TXT record that GitHub shows to Cloudflare DNS → **Verify**. This stops anyone else from using your domain on GitHub.

---

## 📅 Daily routine during the festival

| Who | What |
|---|---|
| Member | **➕ Donate** → name, mobile, amount, cash/UPI, village, gotram, purpose → **Save** → **Send on WhatsApp** → press **Send** in WhatsApp |
| Member (UPI) | Choose **UPI** → **Show temple UPI QR** → donor scans & pays → then Save |
| Member (spent money) | **🧾 Expense** → amount, category, photo of bill → admin approves |
| Admin, approving a member's expense | Choose how to settle it: **↔️ Set off against collections** (deducted from the cash that member hands over, now or later) or **💸 Pay back now** → **Cash** or **Temple UPI** (type the UPI transaction no. if you like) → **Approve**. Changed your mind? Open the expense → *Pay back* or *Undo pay back*. |
| Admin, once at the start | **☰ More → 🏦 Cash & Bank → 📒 Opening balance** → the money the committee already had (cash in hand, cash at bank, *as on* date) → **Save**. Skip it if you start from zero. |
| Admin, cash into / out of the bank | **☰ More → 🏦 Cash & Bank** → **🏦 Deposit cash into bank** or **💵 Withdraw cash from bank** → date, amount, note (slip no. / ATM) → **Save**. Cash in hand and cash at bank change at once. Tip: confirm the member's cash handover first, then record the deposit. |
| Admin, night | **🤝 Cash handover** → collect cash from each member → **Confirm received** (if less is given, the difference stays on their balance). When the committee owes a member, tap **🧾 Expenses** on their card → **💸 Pay back** (cash or temple UPI). |
| Admin | **🏦 UPI to check** → compare with the bank app → mark each UPI receipt as received |
| Admin | **📊 Dashboard → Full report** → Excel file with all donations, expenses, handovers |

---

## 📦 After the festival: keep the records, start fresh next year

1. **⚙️ Settings → 🗄️ Data → 📥 Export data**: choose the year → **Download Excel**, and also download
   **Bill photos (ZIP)**. Keep both files safe (Google Drive / laptop). The Excel file has these sheets: Summary,
   Donations, Expenses, Cash handovers, Members, Day-wise, Programs, Alankaram and Puja schedule.
2. Before deleting: confirm every member's **cash handover**, and approve or reject the waiting expenses.
3. **🗑️ Delete data** (two steps, admin only):
   - Step 1 shows exactly what will be deleted, warns about cash still with members, and marks each year
     ✅ exported / ⚠️ not exported (with an **Export now** button). Tick *"I have exported the data…"*.
   - Step 2: type **DELETE** and your 6-digit admin **PIN**. After 5 wrong PINs it is locked for 15 minutes.
   - Kept: settings, logo and member logins. Optionally you can also remove the member logins.
     Receipt numbers restart at 0001.
4. For the new year: in Settings change **Year**, **dates** and **Receipt prefix** (e.g. `DSR27`) → **Save**.

## 🔢 Logins with a 6-digit PIN

Everybody logs in with **mobile number + 6-digit PIN**.

- Accounts made before the switch to PINs: the next time the app opens, it asks once
  **"Set your PIN (6 digits)"**. After that the old password no longer works.
- Someone cannot log in (forgot the PIN, or still has an old password)? The admin gives a new PIN:
  **Members → tap the member → 🔢 Reset PIN → send on WhatsApp**.
- To change your own PIN: **👤 Me → 🔢 Change PIN**.

## 🛠️ When the app says "Database update needed"

Some new features need a one-time change in Supabase. **Your data stays as it is.**

1. In the app tap **📋 Copy SQL**. (Or on GitHub open `supabase/setup.sql` → **Copy raw file**.)
2. Supabase → **SQL Editor** → **New query** → paste → **Run** (it should say *Success*).
3. Back in the app tap **🔄 Check again**. The notice disappears.

---

## 🆘 Good to know

- **Website shows "App setup needed"** → `config.js` is still empty, or the update is still running.
  Check **Actions** for the green ✓, then refresh the page.
- **"There isn't a GitHub Pages site here"** → the very first publish is not finished yet. Wait 2–3 minutes.
  **Settings → Pages** shows *"Your site is live at …"* when it is ready.
- **Own subdomain shows a blank page** → the website was not rebuilt after the domain was added:
  **Actions → Publish website → Run workflow**.
- **"Too many redirects" / certificate warning on the subdomain** → in Cloudflare the record is orange (proxied).
  Set it to **DNS only** (grey cloud) and wait a few minutes.
- **Don't rename the repository or the GitHub username during the festival.** The website address
  would change and printed QR posters would stop working.
- **Member forgot the PIN** → Members → tap the member → **🔢 Reset PIN** → send on WhatsApp.
  Members can also change their own PIN in **👤 Me**.
- **Admin forgot the PIN** → another admin can reset it, or in Supabase **SQL Editor** run
  (replace the mobile number and the 6-digit PIN):
  ```sql
  update auth.users
     set encrypted_password = extensions.crypt('482915', extensions.gen_salt('bf')),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"pin_set": true}'::jsonb
   where email = '9876543210@members.utsav.invalid';
  ```
- **"Supabase did not accept this PIN"** → Supabase → **Authentication → Sign In / Providers → Email**:
  *Minimum password length* **6** and *Password requirements* **none** (these are the normal settings).
- **The phone icon shows the old name or the old picture** → the icon is made from the logo in Settings about
  30 minutes after saving. Then long-press the icon → **Remove**, open the website in Chrome →
  **⋮ → Add to Home screen** again (iPhone: Safari → Share → Add to Home Screen).
- **GitHub → Actions shows a "Publish website" run every 30 minutes** → that is the logo / splash check. When
  nothing changed it stops after a few seconds; this is normal.
- **Android shows the app icon for a moment before the splash picture** → that is the phone's own start screen;
  Android always shows it while an installed web app starts and it cannot be switched off. About 30 minutes after a
  splash picture is saved, its colour is used behind that icon, so it flows into the picture. Re-add the app icon
  (see above) to see the new colour straight away.
- **Splash picture not showing** → switching back to the app within 5 minutes does not show it again. Close the app
  completely (swipe it away from the recent apps) and open it again. Settings shows *"needs a database update"* →
  see *"Database update needed"* above.
- **Logo upload says "no permission"** → the database update is missing: see *"Database update needed"* above.
- **Donate: the UPI app opens but the payment fails** (*"exceeded bank limit"*, *"for security reasons"*) → some UPI
  apps stop payments that come from a link to a *personal* UPI ID. Use the temple's **business (merchant) UPI ID** if
  it has one (bank, PhonePe Business, Paytm Business or GPay Business). Visitors can always pay with **Copy** (the UPI
  ID) or the **QR** shown under the button.
- **Donate: nothing opens on an iPhone or a laptop** → iPhones open only one UPI app (or none) and laptops have none:
  use **Copy** or scan the **QR** (laptops show it straight away).
- **Donations made on the public page** go straight to the temple account; the app cannot see them. When the bank or
  UPI app shows one, enter it as a donation (payment **UPI**) so the donor gets a receipt.
- **No "Donate" section / "Edit poster" cannot save / no Telugu boxes** → the database update (version 6) is
  missing: see *"Database update needed"* above.
- **No cash in hand / cash at bank on the dashboard, or "Cash & Bank" says it needs an update** → the database
  update (version 10) is missing: see *"Database update needed"* above.
- **Cash in hand or cash at bank shows below zero** → a cash handover, a bank deposit or a withdrawal is not entered
  yet, or an expense has the wrong mode (💵 Cash = from cash in hand, 📱 UPI = from the temple bank account).
- **No "Pay back" choice for member expenses / no financial position switch on the Members page** → the database
  update (version 7) is missing: see *"Database update needed"* above.
- **"Pay back" missing on a member's expense** → it was already used in a cash handover (set off), or it was paid
  from committee funds. Only expenses a member paid that are not yet in a handover can be paid back.
- **Wrong entry** → only the admin can cancel a receipt, and a reason is required. It stays in the records as *Cancelled*, and the donor's receipt link shows *Cancelled*.
- **"Sign-up is closed"** → self sign-up is OFF in Settings → create the member from **Members**.
- **Message about "Confirm email"** → repeat Part A, step 4.
- **WhatsApp does not open** → check WhatsApp is installed; or use **SMS** / **Copy message**.
- **Nothing is ever deleted**: every cancellation, edit, approval, handover and PIN reset is listed in **☰ More → 📜 Change history**.
- **Privacy**: members see only their own receipts; the public QR page never shows mobile numbers or bill photos.
- **Supabase free plan**: a project that is unused for about a week is *paused* (data is safe). Open supabase.com and click **Restore**. Download the Excel report after the festival as a backup.
- **Next festival** (Ganesh Chaturthi, Sankranti…): change the title, dates and receipt prefix in Settings, or create a fresh Supabase project, repeat Part A and update `config.js`.

---

### Alternative without GitHub: Netlify Drop
Arena can also give you a ready zip (`dasara-utsav-site.zip`): unzip → put the two values in `site/config.js` →
drag the `site` folder onto **https://app.netlify.com/drop**. Use this only if you decide not to use GitHub.
