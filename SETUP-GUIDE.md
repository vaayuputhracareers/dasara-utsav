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

1. Open the website on your phone → **కొత్త ఖాతా సృష్టించండి / Create an account** → your name, mobile, password.
   👉 **The first account becomes the Admin** (that's you). Do this right after Part C.
2. **☰ మరిన్ని / More → ⚙️ Settings**: fill in and **Save**:
   - Temple name, committee name, village, street (Telugu + English)
   - Festival title, year, start & end dates, receipt prefix (e.g. `DSR26` → DSR26-0001)
   - Temple UPI ID + account name, quick amounts (116, 516, 1116 …)
   - Donation purposes, expense categories
   - The Telugu WhatsApp receipt message (tap the tags to insert; live preview below)
   - Logo / deity photo (optional)
   - *App web address*: **leave empty**. The app detects `https://USERNAME.github.io/dasara-utsav` by itself.
3. **☰ More → 👥 Members → ➕ Add member** → name, Telugu name, mobile, password →
   **Send login details on WhatsApp**. Repeat for each team member.
   (You can also let members sign up themselves. They wait for your approval.)
4. **☰ More → 📅 Programs** → *Fill sample Navaratri alankaram list* → edit each day → add programs with timings.
5. **☰ More → 📱 Public page & QR** → switch ON the sections visitors may see →
   turn the page **ON** → **Download QR poster** → print it and keep it at the temple.
6. On every phone: open the link in **Chrome → ⋮ → Add to Home screen** so it opens like an app.

---

## 📅 Daily routine during the festival

| Who | What |
|---|---|
| Member | **➕ Donate** → name, mobile, amount, cash/UPI, village, gotram, purpose → **Save** → **Send on WhatsApp** → press **Send** in WhatsApp |
| Member (UPI) | Choose **UPI** → **Show temple UPI QR** → donor scans & pays → then Save |
| Member (spent cash) | **🧾 Expense** → amount, category, photo of bill → admin approves → it is deducted from their cash automatically |
| Admin, night | **🤝 Cash handover** → collect cash from each member → **Confirm received** (if less is given, the difference stays on their balance) |
| Admin | **🏦 UPI to check** → compare with the bank app → mark each UPI receipt as received |
| Admin | **📊 Dashboard → Full report** → Excel file with all donations, expenses, handovers |

---

## 🆘 Good to know

- **Website shows "App setup needed"** → `config.js` is still empty, or the update is still running.
  Check **Actions** for the green ✓, then refresh the page.
- **"There isn't a GitHub Pages site here"** → the very first publish is not finished yet. Wait 2–3 minutes.
  **Settings → Pages** shows *"Your site is live at …"* when it is ready.
- **Don't rename the repository or the GitHub username during the festival.** The website address
  would change and printed QR posters would stop working.
- **Member forgot password** → Members → tap the member → **Reset password** → send on WhatsApp.
  Members can also change their own password in **👤 Me**.
- **Admin forgot password** → another admin can reset it, or in Supabase **SQL Editor** run
  (replace the mobile number and new password):
  ```sql
  update auth.users
     set encrypted_password = extensions.crypt('NewPass123', extensions.gen_salt('bf'))
   where email = '9876543210@members.utsav.invalid';
  ```
- **Wrong entry** → only the admin can cancel a receipt, and a reason is required. It stays in the records as *Cancelled*, and the donor's receipt link shows *Cancelled*.
- **"Sign-up is closed"** → self sign-up is OFF in Settings → create the member from **Members**.
- **Message about "Confirm email"** → repeat Part A, step 4.
- **WhatsApp does not open** → check WhatsApp is installed; or use **SMS** / **Copy message**.
- **Nothing is ever deleted**: every cancellation, edit, approval, handover and password reset is listed in **☰ More → 📜 Change history**.
- **Privacy**: members see only their own receipts; the public QR page never shows mobile numbers or bill photos.
- **Supabase free plan**: a project that is unused for about a week is *paused* (data is safe). Open supabase.com and click **Restore**. Download the Excel report after the festival as a backup.
- **Next festival** (Ganesh Chaturthi, Sankranti…): change the title, dates and receipt prefix in Settings, or create a fresh Supabase project, repeat Part A and update `config.js`.

---

### Alternative without GitHub: Netlify Drop
Arena can also give you a ready zip (`dasara-utsav-site.zip`): unzip → put the two values in `site/config.js` →
drag the `site` folder onto **https://app.netlify.com/drop**. Use this only if you decide not to use GitHub.
