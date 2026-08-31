# Instagram Media Manager

A local, single-user web app for logging into your own Instagram account and downloading/organizing media (posts, carousels, videos, reels, stories) from accounts you're authorized to access — original quality, full metadata, no CAPTCHA/2FA bypass, no private-account circumvention, no rate-limit evasion.

## Stack

- **Backend**: FastAPI + SQLAlchemy + MySQL, Alembic migrations
- **Instagram access**: Instaloader, authenticated via cookies captured from a real Playwright browser login (the app never sees your password)
- **Background jobs**: Celery + Redis
- **Frontend**: React (Vite) + Bootstrap

This machine already has everything bundled via Laragon at `C:\laragon\bin\`: MySQL 8.0.30, Redis 5.0.14, Python 3.10.6, Node 18.8. The instructions below use those paths directly so you don't need to install anything separately.

## One-time setup

### 1. Backend virtualenv + dependencies

```bash
cd backend
"C:\laragon\bin\python\python-3.10\python.exe" -m venv venv
venv\Scripts\pip install -r requirements.txt
venv\Scripts\python -m playwright install chromium
```

### 2. Configure environment

```bash
copy .env.example .env
```

Generate a real encryption key and put it in `.env` as `SECRET_KEY` (this encrypts your stored Instagram session at rest):

```bash
venv\Scripts\python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### 3. Create the MySQL database

Start MySQL from Laragon (or `C:\laragon\bin\mysql\mysql-8.0.30-winx64\bin\mysqld.exe`), then:

```bash
"C:\laragon\bin\mysql\mysql-8.0.30-winx64\bin\mysql.exe" -u root -e "CREATE DATABASE instagram_media_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### 4. Run migrations

```bash
cd backend
venv\Scripts\python -m alembic upgrade head
```

### 4b. Create the back-office login

Set `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `.env`, then:

```bash
cd backend
venv\Scripts\python -m scripts.create_admin
```

Only a bcrypt hash is written to MySQL — the plaintext password is never
stored. Re-run this any time to reset a forgotten password.

### 5. Frontend dependencies

```bash
cd frontend
"C:\laragon\bin\nodejs\node-v18\npm.cmd" install
```

## Running the app (4 processes)

Open four terminals:

```bash
# 1. Redis (Celery broker)
C:\laragon\bin\redis\redis-x64-5.0.14.1\redis-server.exe --port 6379

# 2. Celery worker — Windows requires --pool=solo (the default prefork pool doesn't work on Windows)
cd backend
venv\Scripts\python -m celery -A app.tasks.celery_app worker --pool=solo --loglevel=info

# 3. FastAPI backend
cd backend
venv\Scripts\python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 4. React frontend
cd frontend
"C:\laragon\bin\nodejs\node-v18\npm.cmd" run dev
```

MySQL should already be running via Laragon. Then open **http://localhost:5173**.

The FastAPI OpenAPI docs are at http://127.0.0.1:8000/docs if you want to poke the API directly.

`--host 0.0.0.0` makes the backend reachable from other devices on your LAN
(needed for the [mobile app](#mobile-app-android-apk)), not just this PC. The
first time you run it, Windows Firewall will prompt to allow it through
private networks — accept that, or add a manual inbound rule for TCP 8000 if
you don't see the prompt.

## Two separate logins

Don't confuse them:

| | Back-office login | Instagram connection |
| --- | --- | --- |
| Purpose | Gets you into *this app* | Authorizes *downloading* from Instagram |
| Where | Sign-in screen at startup | "Instagram Login" page inside the app |
| Credentials | `admin` + your `.env` password | Your real Instagram account |
| Stored as | bcrypt hash in `admin_users` | encrypted session cookies |

The back office is protected by an httpOnly, signed session cookie (7-day
expiry). Every `/api/*` route **and** the `/files/*` media mount require it, so
downloaded media isn't readable by anything that can merely reach the port.
Five failed logins on a username trigger a 60-second lockout.

Change the password in-app under **Settings**, or by editing `.env` and re-running
`scripts.create_admin`.

## Using it

0. **Sign in** to the back office with your admin credentials.
1. **Login** — click "Connect Instagram Account." A real, visible Chromium window opens on Instagram's own login page. Log in there yourself, including any 2FA/checkpoint — the app never touches your password, it only reads the resulting session cookies once you're logged in.
2. **Accounts** — add a username you're authorized to access. Its profile (avatar, bio, follower/post counts) is fetched immediately.
3. On an account's detail page, trigger **Sync Profile**, **Download All Posts**, **Download Reels**, **Download Stories**, or **Download Story Archive**. Each runs as a background Celery job; progress is shown live.

   > **Story Archive** means your *past* stories — the ones Instagram auto-saves
   > privately. This is **not** the same as Highlights (the public collections
   > pinned on a profile). Because Instaloader has no archive endpoint and the
   > internal API returns HTML rather than JSON, this feature drives a real
   > browser with your saved session, loads `instagram.com/archive/stories`, and
   > reads the data the page itself fetches. It therefore only works for the
   > account that owns the session — another user's archive is private and the
   > job refuses early with a clear message rather than silently returning
   > nothing. Being UI-driven, it is the most fragile feature here: an Instagram
   > redesign can break it.

4. The **Media Library** groups everything into tabs — **All / Posts / Reels /
   Stories / Archive** — each with a live count. Posts covers single images,
   videos and carousel members; Archive covers downloaded archived stories.
   Below the tabs, **year chips** filter by the year the content was *posted*
   (`taken_at`, not download date). The year list follows the active tab, so it
   only ever offers years that tab actually contains, and switching tab clears
   the year to avoid landing on an empty grid.
5. **Browse & Select** — to pick individual items instead of downloading everything:
   - Click **Browse & Select** on the account page.
   - Choose the **Posts / Reels / Stories** tab and click **Fetch list**. This
     pulls *listings only* (no media bytes) into `discovered_media`, so you can
     see what exists before committing to a download. `Latest N` bounds how many
     items are fetched, which keeps large accounts from hammering rate limits.
   - Tiles show a carousel badge with its item count, a video marker, and a
     green **Saved** badge for anything already downloaded.
   - **Click** a tile to select it; **Shift-click** to select a range. Or use
     **Select all** / **Select new** (everything not yet downloaded).
   - Click **Download selected (N)** to queue just those items.
   - Filter with **All / Not downloaded / Downloaded**, and use the trash button
     to clear the cached listing (downloaded files are unaffected).

   Thumbnails are cached to `media/{username}/_thumbs/` on first view, so
   re-browsing makes no Instagram requests at all.
4. **Media Library** — browse everything downloaded, filter by account/type, click a tile for full metadata (caption, timestamps, IDs, resolution, file size, source URL) and to download or delete the original file.
5. **Jobs** — a running log of every background job across all accounts.

## Mobile app (Android APK)

There's also a native Android wrapper (via [Capacitor](https://capacitorjs.com/))
that loads this same app. It's a thin shell — your phone doesn't run FastAPI,
Celery, MySQL or Playwright; it just talks to the backend running on this PC
over the same Wi-Fi/LAN, exactly like a browser does. **Connect Instagram
Account** still pops open a visible Chromium window **on this PC**, not on
the phone — that doesn't change.

### One-time setup (already done for this checkout)

- `frontend/app/main.py`'s FastAPI app now also serves `frontend/dist` as a
  single origin (mounted last, after `/api`, `/files`, `/docs`, so nothing is
  shadowed), so the whole app is reachable at `http://<PC-LAN-IP>:8000` with
  no separate frontend server needed.
- Capacitor is installed in `frontend/` (`@capacitor/core`, `@capacitor/cli`,
  `@capacitor/android`), with `frontend/capacitor.config.json` pointing its
  WebView `server.url` straight at that same backend origin
  (`cleartext: true` since it's plain HTTP on the LAN, not HTTPS) — this
  keeps everything same-origin, so the existing relative `/api`/`/files`
  fetches and the httpOnly session cookie work with no code changes.
- The native project lives in `frontend/android/`. A release keystore was
  generated at `frontend/android/app/release-key.jks`, with its passwords in
  `frontend/android/keystore.properties` (gitignored — **do not commit this
  file or the `.jks`**; back both up somewhere safe, since losing the
  keystore means you can never sign an update to the same app again).
- The app icon/splash screen were generated from the same navy/teal mark
  used for the web favicon (`frontend/resources/icon.png`,
  `frontend/resources/splash.png`).

> **Capacitor requires Node ≥ 22** — this machine's default Node (via
> `nvm4w`) is older, but Node 25.2.1 is already installed. Run `nvm use
> 25.2.1` before any `npx cap ...` command below, then `nvm use 16.17.0`
> (or whatever you normally use) afterwards if you don't want to leave it
> switched.
>
> Building the APK also requires a JDK ≥ 11 — use
> `C:\Program Files\Java\jdk-17.0.3.1`, **not** the older
> `Eclipse Foundation\jdk-8...` also on this machine (Gradle will fail
> configuring the Android Gradle Plugin under JDK 8).

### Find your PC's LAN IP

The bundled config points at `192.168.0.16` (this machine's IP at setup
time). If that changes — new network, DHCP renewal — get the current one:

```bash
ipconfig   # look for "IPv4 Address" under your Wi-Fi/Ethernet adapter
```

...and update it in **two** places, then rebuild:
- `frontend/capacitor.config.json` → `server.url`
- (optional) `backend/.env` → `CORS_ORIGINS`, only needed if you also run
  `npm run dev` and want to reach the Vite dev server from another device

### Rebuild after any frontend change

```bash
cd frontend
"C:\laragon\bin\nodejs\node-v18\npm.cmd" run build
nvm use 25.2.1
npx cap copy android
```

### Build the signed release APK

```bash
cd frontend/android
JAVA_HOME="C:\Program Files\Java\jdk-17.0.3.1" ./gradlew assembleRelease
```

Output: `frontend/android/app/build/outputs/apk/release/app-release.apk`.
Transfer it to your phone (ADB, USB file copy, cloud drive, etc.) and
install it — you'll need to allow "install unknown apps" for whichever app
you use to open the file, since it isn't from the Play Store.

### Using the app on your phone

1. Make sure the backend is running with `--host 0.0.0.0` (see above) and
   your phone is on the **same Wi-Fi network** as this PC.
2. Open the app, sign in with your back-office credentials, same as the web
   version.
3. Everything else — Accounts, Downloads, Media Library, Jobs — works the
   same as in a browser. **Connect Instagram Account** will open the
   Chromium login window on this PC; go log in there, then come back to the
   phone.

## Documentation

A full technical guide (18 pages) covering architecture, the design system,
pipelines and debugging lives in [`docs/`](docs/):

- **`docs/Instagram-Media-Manager-Technical-Guide.pdf`** — the rendered guide
- `docs/technical-guide.html` — source; edit this
- `docs/generate_pdf.py` — regenerate after editing:

```bash
backend\venv\Scripts\python docs\generate_pdf.py
```

## Frontend architecture

The UI is built on a **shared design system** ported from the `desmondyap` admin
theme (`C:\laragon\www\desmondyap\adm`). Nothing is hard-coded per page — the
Back Office shell and any future front-facing page both consume the same layer.

```
frontend/src/
├── styles/                 # THE design system (import order matters)
│   ├── tokens.css          # ← single source of truth: colours, radii, shadows, fonts
│   ├── base.css            # resets, typography, scrollbars
│   ├── layout.css          # sidebar + topbar + breadcrumb shell
│   ├── components.css      # buttons, panels, pills, action buttons, forms
│   ├── datatable.css       # table, toolbar, pagination
│   ├── media.css           # gallery grid, thumbnails, modal
│   └── index.css           # barrel — imported once in main.jsx
├── components/
│   ├── layout/             # AppLayout, Sidebar, Topbar, Breadcrumb
│   ├── ui/                 # Panel, StatusPill, EmptyState, ConfirmModal
│   ├── datatable/          # DataTable (reusable, sortable, searchable)
│   └── media/              # MediaCard, MediaModal
├── constants/media.js      # media types, icons, labels, formatters
├── api/                    # one module per backend resource
└── pages/                  # one file per route
```

**Design tokens** — every colour comes from `styles/tokens.css`, so re-theming the
whole app is a single-file edit:

| Token | Value | Used for |
| --- | --- | --- |
| `--c-primary` | `#1896bd` | buttons, links, panel titles |
| `--grad-primary` | teal→mint gradient | active sidebar item |
| `--c-navy-deep` | `#000f2d` | sidebar background |
| `--c-navy` | `#012161` | table headers, active pagination |
| `--c-body-bg` | `#eaedf7` | page background |
| `--shadow-card` | `0 10px 30px rgb(24 28 33 / 5%)` | all raised surfaces |

**Icons** use [Remix Icon](https://remixicon.com) (`ri-*`), the same set the source
theme used — installed via npm rather than copying its 678 KB combined
stylesheet, since only one of its five bundled icon sets was ever needed.

**DataTable** (`components/datatable/DataTable.jsx`) is a React port of the
theme's jQuery DataTables setup — search, page-length menu, column sorting,
info line, pagination, and CSV/print export, visually identical. It's written in
React rather than wired to jQuery because jQuery DataTables manipulates the DOM
directly, which conflicts with React re-rendering rows from state. Usage:

```jsx
<DataTable
  columns={[
    { key: 'username', header: 'Account', sortable: true },
    { key: 'action', header: 'Action', searchable: false, render: (row) => <button/> },
  ]}
  rows={accounts}
  exportable
/>
```

Per column: `sortable`, `searchable: false`, `render(row, index)` for custom JSX,
and `value(row)` for the text used in sorting/search/export (important when a
cell displays more than one field).

## Notes

- Downloaded files are stored under `media/`, organized as `media/{username}/{media_type}/...`, and are never resized or re-encoded — they're byte-for-byte what Instagram served your authenticated session.
- Only one Instagram session is active at a time. Re-running the login flow replaces it. Sessions naturally expire like any browser session; when that happens, just log in again.
- Static file serving is mounted at `/files` (not `/media`) specifically to avoid colliding with the frontend's own `/media` (Media Library) route.
- All access is scoped to whatever your authenticated Instagram session is actually permitted to see — this app does not attempt to work around private-account restrictions, CAPTCHAs, or rate limits. A small fixed delay between download requests is intentional courtesy throttling, not evasion.
