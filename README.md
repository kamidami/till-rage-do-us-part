# Till Rage Do Us Part — Online v2.3.2

## Movie Night Update

v2.3.1 keeps the stable v2.2.1 movement/HUD hotfix and replaces the old tea chapter with a new hands-on **Movie Night Mayhem** chapter. Laundry remains removed.

## Core story flow

### Chapter 1 — Our New Home
- Arrange sofa, coffee table, bookshelf, rug, lamp, plant and side table.
- Heavy furniture requires both players.
- Fragile decor can crack/break after hard drops or badly timed BONKs.
- Contextual per-player action cards explain approach/grab/carry/place duties.

### Chapter 2 — Dinner Date From Hell
- Ingredient preparation is untimed.
- Washing, chopping and pouring use animated close-up task windows.
- Cooking pressure begins only after the stove is switched on.
- Both players can use the extinguisher.
- Kevin cannot relocate ingredients.

### Chapter 3 — Movie Night Mayhem
A calm, playful payoff chapter with no failure timer.

1. Turn on the warm floor lamp.
2. Search the sofa cushions for the missing remote (three tactile taps).
3. Pick up the remote and carry it to the TV.
4. Turn on the TV and choose a movie using an animated poster-carousel close-up.
5. Make popcorn in a dedicated animated close-up.
6. Carry the popcorn bowl to the coffee table.
7. Bring the blanket to the sofa.
8. Both players sit down together to finish the chapter.

Optional interactions: pet Kevin, toggle fairy lights, or pause by the window to watch the rain.

## UI / UX
- Full-screen game presentation.
- Stable non-overlapping HUD from v2.2.1.
- Contextual action cards in Home, Kitchen and Movie Night.
- Dedicated movie close-up visuals for sofa searching, movie choosing and popcorn making.
- Mobile ACT label follows the current context.
- Routes: Full Episode, Kitchen, Movie Night and Questions.
- 12 relationship questions / 24 maximum Understanding.
- No Laundry chapter.

## Controls

Desktop:
- WASD / Arrow Keys — move
- E — interact / grab / task
- F — girlfriend BONK
- R — restart current chapter
- F10 — fullscreen

Mobile:
- Left virtual joystick — move
- ACT — interact / grab / task
- BONK ♥ — girlfriend BONK
- Landscape recommended during gameplay

## Run locally

Requires Node.js 20 or newer.

```bat
npm start
```

Open `http://localhost:3000`. For two-player testing on one computer, use normal Chrome + Incognito.

> Three.js is currently loaded from cdnjs, so browser testing still needs internet access.

## Automated validation

```bat
npm test
```

The suite checks multiplayer room flow plus Movie Night replacement, interactive movie mini-games, removed tea implementation, removed Laundry chapter, route compatibility and UI assets.

## Deployment

Existing Railway settings remain unchanged:
- Start command: `npm start`
- Health check: `/healthz`
- No new environment variables required

## Internal compatibility note

The network route id for Chapter 3 remains `rain` so existing clients/server flow stay compatible. The visible chapter itself is **Movie Night Mayhem**; the old tea gameplay has been removed.


## v2.3.1 hotfix
- Fixes Movie Night failing to build because kitchen-role cleanup was referenced but missing.
- Loads the v2.3 Movie Night visual stylesheet in the browser.
- Smooths the camera look target and disables random shake during the calm Movie Night chapter.
- Starts both players inside the living-room composition so the new chapter reads immediately.


## v2.3.2 hotfix

- Fixed Movie Night blanket pickup: interaction now measures distance to the blanket position correctly, so either player can pick it up, carry it, and place it on the sofa.
- Rotated the Movie Night sofa so the seating side faces the television wall.
- Increased the blanket pickup radius slightly to make the interaction less finicky.
