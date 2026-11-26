# Family Face-Off 🎤

A TV-game-show-style survey game for family game night: big flipping answer board, strikes, a point bank,
double/triple rounds, and **two keyboards as buzzers** that show who hit first (down to the millisecond).
Firebase is optional. It records every buzz and lets the host run the show from a phone.

## Quick start (no Firebase needed)

1. Download this folder and open `index.html` in Chrome or Edge on the computer hooked up to the TV.
2. Plug in two USB keyboards.
3. Click **START THE SHOW** (this goes fullscreen).
4. **Team 1 slams the LEFT half** of their keyboard. **Team 2 slams the RIGHT half** of theirs.
   The first key wins, the team's name flashes on screen, and the board shows how late the other team was.

> **Why halves?** A web page can't tell two USB keyboards apart, so it only sees *which key* was pressed.
> Each team owns its own keys. Want one big key per team instead (e.g. `Z` for Team 1 and `M` for Team 2)?
> Go to **⚙ Setup → Buzzer Keys → Learn keys**. Ctrl/Alt/Cmd are always ignored, so a palm slam can't close the tab.

### Running the game (host)
Move the mouse to the bottom of the screen to bring up the control bar, or use the phone remote (below).

| Action | How |
|---|---|
| Reveal an answer | Click its tile (click again to hide it) |
| Start a face-off | **⚡ Arm Buzzers** (armed automatically at the start of each round) |
| Wrong face-off answer | **✕ Face-off Miss** (one big X, not counted as a strike) |
| Wrong answer while playing | **✕ Strike** (shows 1, 2, then 3 X's) |
| Give a team the board | **Control → Team** |
| End the round | **Award Bank → Team** (for a steal, award it to the stealing team) |
| Show the answers nobody got | **Reveal Rest** (adds no points) |
| Next question | **Next Round ▶** |

Points are doubled in round 4 and tripled from round 5 on (you can turn this off in Setup). The first team to reach
the winning score (300 by default) gets the winner screen.

### Your own questions
**⚙ Setup → Survey Questions.** Put the question on its own line, then one answer per line as `Answer | points`,
with a blank line between questions:

```
Name something you bring to the beach.
Towel | 33
Sunscreen | 27
Umbrella | 13
```

Everything (scores, questions, settings) is saved in the browser, so refreshing the page won't lose the game.

## Firebase setup (buzzer log + phone remote)

1. Go to <https://console.firebase.google.com> → **Add project** (Analytics isn't needed).
2. **Build → Realtime Database → Create database** (pick any location, then **Start in test mode**).
3. In the **Rules** tab, paste this and click **Publish**:
   ```json
   { "rules": { "rooms": { "$room": { ".read": true, ".write": true } } } }
   ```
4. **Project settings (⚙) → Your apps → Web (`</>`)**: register an app, then copy the `firebaseConfig` block.
   It must include `databaseURL`. If it doesn't, you created the app before the database, so copy it again.
5. In the game, open **⚙ Setup → Firebase**, paste the config, and click **Save & Close**. The top-right corner
   should read **Firebase live · room XXXX**.

What Firebase gives you:
- **`rooms/<ROOM>/buzz`**: the current buzz, claimed with a first-writer-wins transaction.
- **`rooms/<ROOM>/buzzLog`**: every buzz with team, round, question, and how many ms the loser was behind.
- **`rooms/<ROOM>/state`**: the live board, which `host.html` mirrors.
- **Phone remote (`host.html`)**: see who buzzed, tap answers to reveal them, add strikes, award points, and change rounds.

### Using the phone remote
The phone needs to reach `host.html` over the internet, so host this folder somewhere. The easiest option is
**GitHub Pages**: repo **Settings → Pages → Deploy from branch** → pick the branch → `/ (root)`. Then open the board from
the Pages URL, go to **Setup → Firebase**, and scan the QR code with your phone.
(You can also open `host.html` on the phone yourself and paste the config and room code.)

## Files
- `index.html`, `style.css`, `board.js`: the TV board
- `host.html`: the phone remote
- `common.js`: shared Firebase and storage helpers
- `questions.js`: the sample questions
