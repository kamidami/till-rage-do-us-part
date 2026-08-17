# Till Rage Do Us Part — Online v1.1

Two-player online 3D co-op couple game.

## v1.1 changes

- Both **WASD and Arrow Keys** move your character in online mode.
- Kevin no longer relocates pasta, tomato, or onion. Ingredient starting locations stay stable.
- Kitchen workflow is more interactive:
  - Runner picks vegetables up.
  - Tomato/onion must be washed at the sink.
  - Tomato/onion must be chopped in a close-up timing mini-game.
  - Prepared ingredients are delivered to the prep tray.
  - Chef uses a close-up pour/tip task to transfer ingredients into the pot.
  - Existing urgency, cooking, sink crisis, fire, serving, and patience systems remain.
- In online mode, the player performing a close-up sees the full task panel; the partner sees a smaller observer panel and can keep moving.
- Girlfriend (Player 2) can press **F** near Player 1 for a harmless cute “BONK ♥” frustration-release gag.

## Controls

Online (each laptop):
- Move: `WASD` **or** Arrow Keys
- Interact / kitchen task: `E`
- Girlfriend only: `F` near Player 1 = cute bonk

Local mode:
- Player 1: WASD + E
- Player 2: Arrow Keys + Enter
- Player 2: F = cute bonk

## Run locally

```bash
npm start
```

Open `http://localhost:3000`.

## Test

```bash
npm test
```

## Railway

The project reads `process.env.PORT` and includes `/healthz`. Existing Railway GitHub deployment can redeploy automatically after you push this version.
