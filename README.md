# Family Face-Off 🎤

A TV-game-show-style survey game for family game night. It has a flipping answer board, strikes, a point bank,
double/triple rounds, and **buzzer laptops**: each team gets a laptop, anyone mashes any key, and Firebase decides
who was first. The TV shows the winner and how many milliseconds the other team lost by.

| Device | Page | What it does |
|---|---|---|
| TV computer | `index.html` | The game board everyone watches. The host runs it with the mouse. |
| Laptop 1 & 2 | `buzzer.html` | One per team. Join with **room code + 4-digit PIN**, then press any key to buzz. |
| Your phone (optional) | `host.html` | Remote control: who buzzed, reveal answers, strikes, award points. |

## One-time setup

### 1. Firebase (free)
1. Go to <https://console.firebase.google.com> and open (or create) your project.
2. **Build → Realtime Database → Create Database.** Pick **United States (us-central1)**, then **Start in locked mode**.
3. On the **Rules** tab, paste the contents of [`database.rules.json`](database.rules.json) and click **Publish**.
   These rules only allow reading or writing a game if you know its room code **and** PIN, and nobody can list games.
4. **Project settings ⚙ → Your apps → Web app**: copy the `firebaseConfig = { ... }` block.

### 2. Put the config in a GitHub secret (it's never in the code)
1. On GitHub, go to this repo's **Settings → Secrets and variables → Actions → New repository secret**.
2. **Name:** `FIREBASE_CONFIG`. **Secret:** paste the whole `{ apiKey: ..., ... }` block (the rest of the snippet is fine too).

The deploy workflow writes it into the published website only. It's never committed to the repo.

### 3. GitHub Pages
1. Go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
2. Go to **Actions → Deploy to GitHub Pages → Run workflow**. It also runs on every push to `main`.
3. The game is at `https://<your-username>.github.io/family-feud/`.

### 4. Lock down the API key (recommended)
Firebase web config values can't be truly hidden, because every browser that runs the game has to download them.
What protects you is the database rules (step 1) plus limiting the key to your website:
[Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials) → your
"Browser key" → **Application restrictions: Websites**. Add `https://<your-username>.github.io/*`, then **Save**.

## Playing

1. **TV:** open the site. The lobby shows the buzzer address, the **room code**, and the **PIN** (click *show*).
   Click **⚙ Setup** to rename teams, pick your own room/PIN, or edit questions.
2. **Each laptop:** open `.../family-feud/buzzer.html`, type the room + PIN (and a name), then pick a team.
   The lobby lists each laptop as it joins.
3. Click **START THE SHOW**. The buzzers arm for the first face-off.
4. Anyone mashes **any key** (or clicks the big button). The first press reaching Firebase wins:
   the TV shows the team, the winning laptop says **YOU WERE FIRST!**, and the other says **TOO SLOW!**
5. Host controls (move the mouse to the bottom of the TV screen, or use your phone):

| Action | How |
|---|---|
| Reveal an answer | Click its tile (click again to hide it) |
| Next face-off / buzz again | **⚡ Arm Buzzers** (automatic at the start of each round) |
| Wrong face-off answer | **✕ Face-off Miss** (one big X, not counted as a strike) |
| Wrong answer while playing | **✕ Strike** (shows 1, 2, then 3 X's) |
| Give a team the board | **Control → Team** |
| End the round | **Award Bank → Team** (for a steal, award it to the stealing team) |
| Show the answers nobody got | **Reveal Rest** (adds no points) |
| Next question | **Next Round ▶** |

**Phone remote:** in **⚙ Setup** on the TV, scan the host QR code. It carries the room and PIN, so you don't have to type them.

**Your own questions:** in **⚙ Setup → Survey Questions**, write the question on one line, then `Answer | points`
lines, with a blank line between questions.

## How "who was first" works
- When the host arms the buzzers, the TV writes `buzz = { armed: true, armId }`.
- A buzzer press runs a Firebase **transaction** that only succeeds while `armed` is true for that `armId`.
  The database applies transactions one at a time, so exactly one team wins, even if both press at the same moment.
- Every press is also logged with a server timestamp, which is how the "late by 0.055s" number is calculated.
- Both laptops should be on the same Wi-Fi so neither one has a slower connection.

## Files
- `index.html`, `style.css`, `board.js`: the TV board
- `buzzer.html`: the buzzer laptops
- `host.html`: the phone remote
- `common.js`: shared Firebase/room/PIN helpers
- `questions.js`: sample questions
- `database.rules.json`: Realtime Database rules to paste into Firebase
- `.github/workflows/pages.yml`: deploys to GitHub Pages and injects the `FIREBASE_CONFIG` secret
