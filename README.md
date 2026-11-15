# YoYo Media

A subscription video-streaming site with a full admin panel and a desktop tool for preparing videos.
This repository contains the **player**, the **backend** and the **upload pipeline**.

- **Player:** a watch page (resume, speed, fullscreen, watermark) and a vertical **Shorts** feed with a
  swipe/scroll feed, double-tap like and a draggable seek slider.
- **Backend:** accounts, sessions, two-step sign-in for admins, subscriptions, test-mode payments,
  likes, comments, follows, search, and a media API that streams files with HTTP Range support and only
  to people who are allowed to watch.
- **Upload:** an admin upload form (files up to 500 MB) and **YoYo Studio**, a tool that converts big
  videos on your own PC and uploads them in resumable 5 MB chunks.

Built with Next.js 16 (App Router), React 19, Prisma 6, MySQL / MariaDB and Tailwind CSS 4.

> The public landing and marketing pages are not part of this repository. Opening `/` sends you to the
> catalogue at `/browse`.

---

## 1. What you need first

| Tool | Version | Why |
| --- | --- | --- |
| Git | any recent | to clone the repository |
| Node.js | 22 or newer (20.9+ also works) | runs the site and Studio |
| npm | comes with Node | installs packages |
| MySQL or MariaDB | MySQL 8+ or MariaDB 10.6+ | the database |
| ffmpeg | any recent | **only for Studio** (video conversion) |

Install ffmpeg:

- Windows: `winget install Gyan.FFmpeg` (then reopen the terminal)
- macOS: `brew install ffmpeg`
- Ubuntu / Debian: `sudo apt install ffmpeg`

---

## 2. Clone and set up, step by step

### Step 1. Clone the repository

```bash
git clone git@github.com:git-nash-init/yoyo-media.git
cd yoyo-media
```

(Use the HTTPS address instead if you have not set up SSH keys on GitHub.)

### Step 2. Install packages

```bash
npm install
```

This also generates the Prisma database client.

### Step 3. Create an empty database and a user

Log in to MySQL / MariaDB as an administrator and run (change the password):

```sql
CREATE DATABASE yoyomedia CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'yoyo'@'127.0.0.1' IDENTIFIED BY 'choose-a-strong-password';
GRANT ALL PRIVILEGES ON yoyomedia.* TO 'yoyo'@'127.0.0.1';
FLUSH PRIVILEGES;
```

### Step 4. Create the `.env` file

Create a file named `.env` in the project folder (it is ignored by git and must never be committed):

```env
DATABASE_URL="mysql://yoyo:choose-a-strong-password@127.0.0.1:3306/yoyomedia"
APP_URL="http://localhost:3000"
# Folder for videos, thumbnails and previews. Keep it outside any public web folder.
STORAGE_DIR="./storage"
# Two different random values, 32+ bytes each. Generate each one with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET="paste-first-random-value"
PAYMENT_WEBHOOK_SECRET="paste-second-random-value"
```

Run the generator command twice and paste a different value into each of the last two lines.

### Step 5. Create the database tables

```bash
npm run db:push
```

### Step 6. Create the admin account

```bash
npm run create-admin -- you@example.com "Your Name"
```

It asks for a password (at least 12 characters, with a letter and a number). The password is never
passed on the command line. There are no default accounts.

### Step 7. Start the site

```bash
npm run dev
```

Open http://localhost:3000, sign in with the admin account, then open **Account → Security** and set up
two-step sign-in with an authenticator app. The admin panel at `/admin` stays locked until you do.

### Step 8. Add your first videos

Pick one way:

**A. In the browser (quick, up to 500 MB).** Go to **Admin → Videos → Upload**, choose a file and send it.

**B. With YoYo Studio (any size, recommended).**

1. In the admin panel open **Ingest tokens**, create a token called "Studio laptop" and copy it. It is
   shown only once.
2. Create `tools/studio/.env`:
   ```env
   STUDIO_SITE_URL=http://localhost:3000
   STUDIO_TOKEN=paste-the-token-here
   ```
3. Run `npm run studio`.
4. Drop video files into `studio/incoming`. Studio converts each one, makes thumbnails and a short
   preview, and uploads it as a **draft**.
5. Open the draft link it prints, fill in the details, pick a thumbnail and press **Publish**.

Studio options: `npm run studio -- --once` (process what is there, then exit),
`--dry-run` (convert but do not upload), `--help`. Optional settings in `tools/studio/.env`:
`STUDIO_MAX_HEIGHT` (default 720), `STUDIO_CRF` (quality 18-28, default 23),
`STUDIO_KEEP_ORIGINALS`, `FFMPEG_PATH`, `FFPROBE_PATH`.

### Step 9. Try it with the sample videos

The `samples/` folder has two small test clips (colour-bar test patterns, no real content):

| File | Size | Type |
| --- | --- | --- |
| `samples/test-short-720x1280.mp4` | 720 x 1280, 10 s | becomes a **Short** (vertical and 90 seconds or less) |
| `samples/test-long-1280x720.mp4` | 1280 x 720, 20 s | becomes a **Long** video |

Copy both into `studio/incoming` (with Studio running) or upload them from **Admin → Videos → Upload**.
Publish them, then create a normal (non-admin) account in a private window and watch them. Viewers need
an active subscription: use the test checkout on the **Subscribe** page, or grant access from
**Admin → Subscribers** (open a person, then "Grant access").

### Step 10. Build for production

```bash
npm run build
npm run start
```

Set `APP_URL` to your real `https://` address and use new secrets. Use a Node.js host where the
`STORAGE_DIR` folder is writable and persistent.

---

## 3. Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the site with hot reload |
| `npm run build` / `npm run start` | Production build and server |
| `npm run db:push` | Create or update database tables from `prisma/schema.prisma` |
| `npm run create-admin -- <email> "<name>"` | Create an admin, or promote and reset an existing account |
| `npm run studio` | Run YoYo Studio |
| `npm run lint` / `npm run typecheck` | Code checks |

---

## 4. Features

### For viewers

- **Browse and search:** the catalogue with channel chips, pagination and fuzzy search across videos,
  series, models and channels.
- **Moving clips on every video card:** short and long videos alike show a muted clip. On a laptop, hover the
  card; on a phone or tablet, scroll the card to the middle of the screen and it plays, then stops as you
  scroll on. Data saver and reduced-motion settings turn this off.
- **Watch page:** streaming player with seeking, playback speed, volume, fullscreen, a logo watermark,
  resume from where you stopped, and download for subscribers.
- **Shorts:** a full-height vertical feed. Scroll or use the arrow keys, tap to pause, double-tap to like
  (a heart pops and disappears), and drag the **seek slider** along the bottom to scrub (playback pauses
  while you drag). The **full-screen button** in the top-right corner (or the `F` key) fills the whole
  screen; press it again, or Esc, to go back to normal view.
- **Auto-hiding header:** the top bar slides away as you scroll down and comes back as soon as you scroll up.
- **Likes, comments and sharing** on every video and short.
- **Follow and subscribe:** follow channels and models. Following shows a pop-up with a confetti effect;
  liking shows a heart burst. The effects are pure CSS and SVG, so nothing extra is downloaded, and they
  respect the reduced-motion setting.
- **Subscriptions page:** the latest videos from everything you follow.
- **Account:** change password (every password field has a show / hide button), two-step sign-in.
- **Light, dark or system theme**, installable web app, and an offline page.
- **Slow-connection help:** a notice with a Reload button appears if a page stays on its loading skeleton
  for more than 8 seconds.

### For the admin (everything on the site is added by an admin)

- **Dashboard:** users, active subscribers, revenue, videos, likes and comments, with charts, storage used
  and a date-range filter.
- **Videos and Shorts:** edit title, slug, description, type, channel, series and episode, featured
  people; choose or upload a thumbnail, grab a frame from the video; publish and unpublish; delete.
- **Channels, Series, Models:** simple create, edit and delete pages.
- **Comments:** moderation with hide and restore.
- **Subscribers:** view anyone's plan and history, grant or revoke access by hand.
- **Payments:** every checkout and its status.
- **Ingest tokens:** create and revoke the tokens Studio uses. A token can only upload.
- **Settings:** price, plan length, watermark on or off and its corner, hero text.
- **Audit log:** a timestamped record of admin actions.

### Payments

Payments run in **test mode** by default through a dummy provider, so nobody is charged. To take real
money, add one provider file (see `lib/payments/provider.ts` and `lib/payments/dummy.ts`) and its webhook
secret.

### Security

- Passwords are hashed with Argon2id; sessions are stored hashed; admin authenticator secrets are
  encrypted at rest.
- Admins must use two-step sign-in. There are no default credentials.
- Video files live outside the web root and are streamed through an API that checks the session and the
  subscription on every request. Thumbnails and previews are public.
- The API is same-origin only, with security headers on every response.

---

## 5. Project layout

```
app/
  (app)/            viewer pages: browse, watch, shorts, series, models, account, checkout
  (auth)/           login, register, two-step sign-in
  admin/            admin panel, including the upload page
  api/              media streaming, watch progress, search, upload and Studio ingest endpoints
components/
  video/            Player, ShortsFeed, follow button, cards
  engagement/       likes, comments, share
  effects/          celebration effects (burst, subscribe pop-up)
  admin/  auth/  shell/  ui/  states/
lib/                auth, payments, ingest, queries, admin actions, security helpers
prisma/schema.prisma  database schema
scripts/            create-admin
tools/studio/       YoYo Studio (video conversion and chunked upload)
samples/            two small test videos
public/             icons, placeholders, service worker
```

---

## 6. Troubleshooting

- **`npm run db:push` cannot connect:** check `DATABASE_URL` (user, password, port, database name) and that
  MySQL / MariaDB is running. Use `127.0.0.1`, not `localhost`.
- **"SESSION_SECRET missing" or sign-in loops:** make sure both secrets in `.env` are set and restart
  `npm run dev`.
- **Studio says the token is empty:** the token goes in `tools/studio/.env`, not the root `.env`.
- **Studio cannot find ffmpeg:** install it and reopen the terminal, or set `FFMPEG_PATH` and `FFPROBE_PATH`.
- **A viewer sees a paywall:** they need an active subscription. Grant one in **Admin → Subscribers**.
- **Lost your authenticator:** there are no backup codes. Someone with database access must reset it.

## 7. Contributing and safety

Never commit `.env` files, ingest tokens or database passwords. If a token leaks, revoke it under
**Admin → Ingest tokens** and create a new one.
