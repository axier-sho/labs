# Repository Guidelines

## Project Structure & Module Organization

This repository is a small Bun-based TypeScript CLI.

- `src/index.ts` is the entrypoint and contains the Commander wiring, help text, and command handlers.
- `src/kepler.ts` holds the Kepler integration, registration persistence, and request helpers.
- `package.json` defines the `habitat` binary and the available scripts.
- `.habitat/registration.json` is generated local state and should not be committed.

Keep orchestration in `src/index.ts` and move reusable behavior into focused modules under `src/`.

## Build, Test, and Development Commands

- `bun run habitat --help` or `bun run src/index.ts --help`: inspect available commands without changing state.
- `bun run habitat status`: show the current registration state.
- `bun run habitat register --name "Example"`: register the current working directory with Kepler.
- `bun run habitat unregister`: remove the local registration and remote habitat record.
- `bun run typecheck`: run the TypeScript compiler in `noEmit` mode.

There is no separate build script or dedicated test runner in `package.json` today.

## Coding Style & Naming Conventions

- Use TypeScript with `strict` mode expectations and ES module syntax.
- Prefer small, named functions over large inline handlers.
- Keep CLI-facing code declarative; keep HTTP, file, and state logic in dedicated helpers.
- Use descriptive names for commands and exported types, such as `Registration` and `fetchHabitatStatus`.
- Follow the existing 2-space indentation and concise multiline formatting in the source files.

## Testing Guidelines

Automated tests are not configured yet. Validate changes with:

- `bun run typecheck`
- `bun run habitat --help`
- `bun run habitat status`

If you add tests, keep them close to the code they cover and use clear `*.test.ts` naming.

## Configuration Notes

The CLI reads `KEPLER_BASE_URL`, `KEPLER_PLANET_TOKEN`, and `KEPLER_TOKEN`. Avoid hardcoding environment-specific values; use the existing resolver helpers in `src/kepler.ts`.

For Kepler integration details, see the docs at https://planet.turingguild.com/docs and the OpenAPI contract at https://planet.turingguild.com/openapi.json.
