# Till Rage Do Us Part — v1.0 Online Couple Multiplayer

A two-player online version of the cute cursed-couple game. Two people can play from different cities using a private 5-character room code.

## What changed in v1.0

- Create a private 2-player room.
- Join with a short room code.
- Both players use **WASD + E on their own laptop**.
- Host-authoritative gameplay: sofa, kitchen, timers, Kevin, patience and level state come from one authoritative simulation.
- Guest input is sent to the host; smooth world snapshots are sent back to the guest.
- Story progression, skip level, restart and quiz progression are synchronized.
- No login/account/database required.
- Local same-keyboard mode is still available.
- v0.9 character upgrades remain, including her little sunflower and kitchen urgency/burning mechanic.

## Run locally

Requires Node.js 20+.

```bash
npm start
```

Open:

```text
http://localhost:3000
```

To test from two computers on the same Wi-Fi, run the server on one computer and open its LAN IP from both browsers, for example:

```text
http://192.168.1.20:3000
```

For different cities, deploy the server to an internet host such as Railway, then both players open the same HTTPS URL.

## How the online room works

1. Player 1 opens the site and enters their name.
2. Click **Create Private Room**.
3. Send the 5-character room code to Player 2.
4. Player 2 opens the same URL, enters their name and room code, then clicks **Join Room**.
5. Host chooses Full Episode / Kitchen / Questions.
6. Host clicks **Start the Cursed Date**.
7. Both players now use **WASD + E** on their own computer.

The host controls story Continue, level Skip and Restart. Both players control their own character and make their own private quiz selections.

## Deploy to Railway

This repository already includes a `railway.json` and uses the `PORT` environment variable automatically.

1. Upload/push this folder to GitHub, or deploy the folder with Railway.
2. Create a Railway service from the repository.
3. Railway runs `npm start`.
4. Generate a public domain in Railway networking settings.
5. Open that URL on both computers.

Health endpoint:

```text
/healthz
```

No database or environment secrets are required for this build.

## Important technical note

Private rooms are stored in server memory. If the server restarts, active room codes disappear. That is intentional for this lightweight personal-game build.

## Project structure

```text
till-rage-online-v1.0/
├── package.json
├── server.js
├── railway.json
├── START_HERE.txt
├── tests/
│   └── multiplayer-smoke.js
└── public/
    ├── index.html
    ├── css/style.css
    └── js/
        ├── config.js
        ├── net.js
        └── game.js
```

## Test

```bash
npm test
```

The smoke test verifies room creation, joining, game start, remote input relay, snapshot relay and synchronized flow commands.
