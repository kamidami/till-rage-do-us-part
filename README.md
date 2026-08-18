# Till Rage Do Us Part — Online v1.4

## Home Fix + Relaxed Kitchen

This build keeps the online/mobile/custom-character work from v1.3 and fixes the issues found during the live/local play-test.

### What changed

- Setup/lobby overlays can now scroll properly on short laptop screens and phones.
- Railway assets are served with `no-store` plus v1.4 cache-busting query strings so an old JS/CSS build is much less likely to remain stuck in the browser cache.
- Trial One is now visibly one **7-piece Arrange Our Home** sequence from the beginning:
  1. Sofa
  2. Coffee table
  3. Bookshelf
  4. Living rug
  5. Floor lamp
  6. Plant
  7. Side table
- The apartment floor is larger, with the movable furniture staged visibly in the starting room.
- The currently required furniture gets a gold pickup halo/tag and a glowing destination.
- Heavy furniture still needs both players; fragile decor can crack/break from bad drops or a badly timed bonk.
- Girlfriend bonk still knocks the other character down briefly.
- Both characters can still use the extinguisher.
- Salwar kameez, dupatta, sunflower and skin-tone customization remain.
- **Ingredient prep has no countdown now.** Pasta/vegetable fetch/wash/chop/handoff can be done at your own pace. The normal cooking meter still matters after the stove is turned on.
- Partner quiz expanded from 4 to **8 questions** (maximum understanding score 16).

## Run locally

```bat
npm start
```

Open `http://localhost:3000`.

For a two-player same-PC test, use one normal Chrome window and one Incognito window, create a private room in one, then join it from the other.

## Automated checks

```bat
npm test
```

This runs the multiplayer API/SSE smoke test and the v1.4 regression checks.
