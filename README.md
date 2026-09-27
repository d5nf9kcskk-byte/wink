# Wink

Wink is a reading tracker for everyone, kids included. You start a session when you pick up a book, stop it when you put the book down, and Wink keeps your pages, minutes, daily goal and streak. Streaks forgive missed days, your reading is never paywalled, and every animation follows your Motion setting (Full, Reduced or Off). It is a static React app on GitHub Pages; accounts and sync run on Supabase.

## Run it locally

```sh
npm install
npm run dev
```

Open http://localhost:5173. Add `?sample=1` to the address (http://localhost:5173/?sample=1) to load demo books and sessions on this device.

## Tests

```sh
npm test        # vitest, once
npm run lint    # oxlint
npm run build   # type-check and build to dist/
```

## Connect accounts (Supabase)

Without these keys Wink runs in "this device only" mode: everything works, but data stays in this browser and there is no sign-in.

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run `supabase/migrations/0001_init.sql`.
3. In **Authentication → Providers**, enable **Email** (magic link and password) and **Google** (see below).
4. In **Authentication → URL Configuration**, set **Site URL** to your GitHub Pages URL (for example `https://<you>.github.io/<repo>/`), and add `https://<you>.github.io/<repo>/**` and `http://localhost:5173/**` to **Redirect URLs**.
5. Copy `.env.example` to `.env.local` and fill in the project URL and anon key from **Project Settings → API**. Restart `npm run dev`.

### Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services → Credentials**, create an **OAuth client ID** (type: Web application).
2. Add the callback URL shown in Supabase's Google provider settings as an authorized redirect URI.
3. Paste the client ID and secret into Supabase's Google provider and save.

## Deploy (GitHub Pages)

1. Push this project to a GitHub repository.
2. **Settings → Pages → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Skip them to deploy in "this device only" mode.

Every push to `main` tests, builds and deploys (`.github/workflows/deploy.yml`). You can also run it by hand from the Actions tab.
