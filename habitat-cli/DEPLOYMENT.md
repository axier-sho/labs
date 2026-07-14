# Habitat Deployment Notes

I deployed the Habitat backend to my OpenClaw server and reached it from my
laptop over Tailscale. No public URL or port-forward was used.

## Deployed commit

```
16474d5  Bind Habitat backend to 0.0.0.0 for remote access
```

## API worked on the server

With `bun run server` running, a request from the server returned the
registration and `habitat status` showed the habitat:

```
curl http://127.0.0.1:8787/registration
{"registration": ... "displayName":"SQLite Home" ... }

habitat status
Registered: yes
Name: SQLite Home
```

## Laptop reached the server over Tailscale

I set `HABITAT_API_BASE_URL` in the server's `.env` to the server
address. 

## Request logs on the server

`habitat status` added new lines to the server terminal:

```
[habitat-api] GET /registration -> registered
[kepler] GET /habitats/... -> 200
[habitat-api] GET /status -> registered, Kepler ok
```

## Failure after stopping the server

I stopped `bun run server`. The laptop could no longer connect:

```
habitat status
Could not reach the Habitat backend at http://<server>:8787.
```

The code and database are still on the server, but nothing was listening on
port 8787.

## Why 0.0.0.0

`localhost` only accepts connections from the server itself, so my pc 
would be refused. `0.0.0.0` accepts connections on all interfaces, including
Tailscale, which is what lets my pc to reach port 8787.

## Why .env and habitat.sqlite stay but are ignored

The backend needs both at runtime: Bun loads `.env` for its config, and Habitat reads and writes
`habitat.sqlite` as its database, but they
are in `.gitignore` so they are never committed on the github repository.