# Till Rage Do Us Part — Online v1.3

## Cozy Home + Custom Characters + Chaos Physics

A private two-player online 3D co-op game for couples. One player creates a room, shares the 5-character code, and both play the same authoritative game world from separate phones/computers.

### v1.3 highlights

- **Arrange Our Home** replaces the one-sofa-only first level.
  - Bigger 30×18 apartment floor.
  - Sofa first, then coffee table, bookshelf, living rug, floor lamp, plant and side table.
  - Coffee table + bookshelf are heavy and require **both players on separate handles**.
  - Smaller furniture is physically carried in front of the character.
  - Glowing placement zones guide one task at a time.
- **Fragile furniture damage**
  - Lamp, plant and side table can crack from hard drops/collisions.
  - A second severe impact can break them; a replacement respawns so the level remains finishable.
  - A girlfriend BONK while carrying something fragile can make it drop and take damage.
- **BONK knockdown**
  - Player 2 can press **F** (or BONK on mobile) near Player 1.
  - Player 1 falls over briefly before recovering.
- **Shared fire safety**
  - Either player can pick up and use the extinguisher during a kitchen fire.
- **Character customization**
  - 5 skin-tone choices.
  - Casual, kurta or salwar-kameez outfit.
  - Optional dupatta.
  - Optional sunflower for her.
  - Softer/cuter faces, larger eyes and improved silhouettes.
- Keeps v1.2 mobile controls and v1.1 interactive kitchen:
  - WASD **or Arrow Keys** online.
  - Mobile joystick + ACT + BONK.
  - Wash vegetables, chop in close-up, pour pasta, tip ingredients, cook/stir, sink flood, fire, serve plates.
  - Kevin no longer moves ingredient positions.

## Run locally

Requires Node.js 20+.

```bash
npm start
```

Open:

```text
http://localhost:3000
```

Health endpoint:

```text
/healthz
```

## Test

```bash
npm test
```

The smoke test verifies room creation/join, character-profile sync, start sync, WASD/arrow/F input relay, snapshots and flow events.

## Railway

This project is already Railway-friendly. If your existing GitHub repository is connected to Railway, copy this version into that repository folder, commit, and push:

```bash
git add -A
git commit -m "feat: add cozy home customization and chaos physics"
git push
```

Railway should deploy the new commit to the same public URL.
