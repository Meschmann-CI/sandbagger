# Going live: Supabase + Netlify

The app already runs without any of this (local demo mode). These steps give it a
shared database and real logins so Nader, Barry, and Pat can use it from their phones.

You need to create the accounts yourself — both are free and neither needs a card.

---

## 1. Create the Supabase project

1. Go to https://supabase.com and sign up (GitHub login is fastest).
2. **New project**. Name it `sandbagger`. Pick a strong database password and save it
   somewhere — you won't need it for the app, but you'll want it later.
3. Choose the region closest to you (East US).
4. Wait about two minutes for it to finish provisioning.

## 2. Create the tables

1. In your project, open **SQL Editor** in the left sidebar.
2. Open `supabase/schema.sql` from this folder, copy the whole file, paste it in.
3. Click **Run**. You should see "Success. No rows returned."

This creates the tables, the sign-in helpers, and the security rules. It's safe to
re-run if you ever need to.

## 3. Get your two keys

In **Project Settings** (gear icon):

- **Data API** → copy the **Project URL** (looks like `https://abcdefgh.supabase.co`)
- **API Keys** → copy the **anon public** key (a long string starting `eyJ...`)

The anon key is meant to be public — it's safe in the browser. The security rules from
step 2 are what actually protect the data. Never put the `service_role` key in the app.

## 4. Point the app at it

Create a file named `.env.local` in the `golf-app` folder (same place as `package.json`):

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key...
```

Restart the app (close the launcher window and double-click **Launch Golf App.bat**
again — Vite only reads env files at startup). You should now see a sign-in screen
instead of the app.

## 5. Sign in and create the group

1. Enter your email, click **Send me a sign-in link**, then open the link from your inbox.
2. You'll land on a setup screen. Choose **Start a new group**.
3. Fill in the group name and your details. **Load sample data** fills the group with a
   worked example (one past trip with its itinerary and cost split, one being planned, and
   a season of rounds) so the app isn't empty while you look around. Uncheck it if you'd
   rather start clean.
4. Done — you're in, and it's stored in the cloud rather than this browser.

## 6. Add the other guys

On your **Profile** tab, tap **+ Add golfer** and enter each person's name, email, and
handicap. When they sign in with that email, the profile you made becomes theirs
automatically — no invite code needed.

If someone would rather join themselves, give them the six-character **invite code**
shown on your Profile tab.

## 7. Deploy to Netlify

1. Push this folder to a GitHub repo (I can do this part).
2. Go to https://netlify.com, sign up, then **Add new site → Import an existing project**
   and pick the repo.
3. Netlify reads `netlify.toml`, so the build settings are already correct.
4. Before deploying, open **Site configuration → Environment variables** and add the same
   two values from step 4 (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`).
5. Deploy. You'll get a URL like `sandbagger.netlify.app` — send that to the group.

## 8. One Supabase setting for the live site

Once you know your Netlify URL, go back to Supabase → **Authentication → URL
Configuration** and set:

- **Site URL**: your Netlify URL
- **Redirect URLs**: add your Netlify URL

Otherwise the email sign-in links will keep pointing at `localhost` and won't work on
anyone else's phone.

---

## Notes

- **Free tier limits**: Supabase pauses a project after a week with no activity (one
  click to restore) and sends 3 sign-in emails per hour by default. Fine for four guys;
  if the email limit bites, connect your own SMTP under Authentication → Emails.
- **Photos** are stored inline in the database as compressed images. That works, but if
  the group starts uploading a lot of them, moving to Supabase Storage is the next step.
- **Local mode still works**: delete or rename `.env.local` and the app goes back to the
  sample data in your browser, which is handy for testing without touching real data.
