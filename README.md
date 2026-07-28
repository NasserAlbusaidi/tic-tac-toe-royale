# XO Royale

Browser Tic Tac Toe with private rooms, live play, reconnect-safe player
sessions, configurable rounds, spectators, scoring, and round history.

## Architecture

- React and Vite frontend
- Native WebSocket client
- Server-authoritative game engine
- Vercel WebSocket Function in `api/ws.mjs`
- Redis room state and cross-instance events in production
- In-memory room store for local development

Redis rooms expire six hours after their last activity.

## Run locally

```bash
npm ci
npm run dev
```

This starts:

- WebSocket room server: `http://127.0.0.1:4242`
- Vite client: `http://127.0.0.1:5173`

Open two browser windows, create a room, copy the invite, and join from the
second window. Local development uses the in-memory store unless `REDIS_URL`
is set.

## Verify

```bash
npm run check
```

This runs lint, game-engine and multiplayer hub tests, the production build,
and Node syntax checks.

## Deploy to Vercel

The project requires a `REDIS_URL` environment variable. Vercel's Upstash
integration can provision and attach a Redis database to the project.

```bash
npx vercel
npx vercel integration add upstash
npx vercel --prod
```

The Vercel Hobby and Upstash Redis free tiers are sufficient for occasional
games with friends. The client automatically reconnects and restores its room
when a WebSocket Function reaches its duration limit.
