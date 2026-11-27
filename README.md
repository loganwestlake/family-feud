# Family Face-Off 🎤

A TV-game-show-style survey game for family game night. It has a flipping answer board, strikes, a point bank,
double/triple rounds, and **buzzer laptops**: each team gets a laptop, anyone mashes any key, and Firebase decides
who was first. The TV shows the winner and how many milliseconds the other team lost by.

| Device | Page | What it does |
|---|---|---|
| TV computer | `index.html` | The game board everyone watches. The host runs it with the mouse. |
| Laptop 1 & 2 | `buzzer.html` | One per team. Join with **room code + 4-digit PIN**, then press any key to buzz. |
| Your phone | `remote/` | Host remote: join with room + PIN, see the question, who buzzed first, and every answer with its points. Tap to flip answers on the TV. |

## One-time setup

### 1. Firebase (free)
1. Go to <https://console.firebase.google.com> and open (or create) your project.
2. **Build → Realtime Database → Create Database.** Pick **United States (us-central1)**, then **Start in locked mode**.
3. On the **Rules** tab, paste the contents of [`database.rules.json`](database.rules.json) and click **Publish**.
   (If you skip this, the TV lobby shows a **Copy the rules** button and a link straight to that page.)
   These rules only allow reading or writing a game if you know its room code **and** PIN, and nobody can list games.
4. **Project settings ⚙ → Your apps → Web app**: copy the `firebaseConfig = { ... }` block.

### 2. Firebase settings
Your project's web settings are in [`firebase-config.js`](firebase-config.js). They aren't secret: every browser running
the game downloads them, and Google's Firebase docs say so. The database rules are what protect your data.
(Optional: if you add a `FIREBASE_CONFIG` repository secret, the deploy uses that instead.)

### 3. GitHub Pages (already set up)
**Settings → Pages → Source: GitHub Actions.** Every push to `claude/serene-euler-flw9ni` publishes the site.
GitHub's `github-pages` environment only allows that branch. To publish from `main`, allow `main` under
**Settings → Environments → github-pages → Deployment branches**, then add `main` to `.github/workflows/pages.yml`.

### 4. Lock down the API key (recommended)
In [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials), open your
"Browser key" and set **Application restrictions: Websites** to `https://loganwestlake.github.io/*`.

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
| Wrong answer | **✕ Strike Team** (each team has its own 3 X's; the third X on the team in control pops up a Steal card) |
| Start over | **↺ Reset game** (TV bar or phone): scores to 0, round 1, questions reshuffled |
| Who gets the points | Automatic: the team that buzzes in first. If the other team wins the face-off or steals, tap **Points → Team** and the round's points move over. They lock in when you go to the next round. |
| Show the answers nobody got | **Reveal Rest** (adds no points) |
| Next question | **Next Round ▶** |

**Phone remote:** open `https://loganwestlake.github.io/family-feud/remote` (or scan the QR code in the TV lobby) and type the room and PIN.
For one-tap access, the QR code inside **⚙ Setup** has the PIN built in. Only you see it, so players can't scan it.

**Lightning Round:** tap **⚡ Lightning Round** on the phone (or the TV's control bar). Player 1 gets 20 seconds for 5 quick questions;
tap the matching answer on your phone for each one (or type what they said for 0 points), then **Reveal next answer** to show them on the TV.
Switch to **Player 2** (25 seconds). Player 1's answers are covered on the TV. If player 2 repeats an answer, the TV buzzes and your phone asks for another one.
Together they need **200 points**.

**Keeping the TV awake:** every page asks the browser to keep the screen on while it's open (Chrome, Edge, Safari and Firefox support this).
If the TV computer still sleeps, click the page once, since some browsers only allow it after a click.

**Questions:** 59 are built in (the point values are made up for fun), shuffled for each new game. To add your own, go to **⚙ Setup → Survey questions**, write the question on one line, then `Answer | points`
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
- `remote/index.html`: the phone remote (`host.html` redirects there)
- `assets/awake.mp4`: tiny silent video that keeps older browsers awake
- `common.js`: shared Firebase/room/PIN helpers
- `questions.js`: sample questions
- `database.rules.json`: Realtime Database rules to paste into Firebase
- `firebase-config.js`: your Firebase project's web settings
- `.github/workflows/pages.yml`: deploys to GitHub Pages
