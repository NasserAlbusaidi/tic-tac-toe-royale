# XO Royale

Premium browser Tic Tac Toe with private host rooms, Socket.IO live play, host-configured round count, scoreboard, and round history.

## Run

```bash
npm run dev
```

The dev script starts:

- Socket.IO room server: `http://127.0.0.1:4242`
- Vite client: `http://127.0.0.1:5173`

Open two browser windows, create a room in one, copy the invite, and join from the other.

For LAN play from another device on the same Wi-Fi:

```bash
npm run dev:network
```

Then open the network URL printed by Vite, for example `http://10.40.12.173:5173`.

## Verify

```bash
npm run check
```

This runs lint, game-engine tests, production build, and Node syntax checks for the server files.

## Production Preview

```bash
npm run build
npm run preview
```

The production server serves the built client and Socket.IO from `http://127.0.0.1:4242`.
