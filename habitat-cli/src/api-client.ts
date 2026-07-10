// The CLI's single door to the local Habitat REST backend. All HTTP details
// live here so command handlers never build raw fetch calls: they ask this
// module for typed data and get friendly errors back.
//
// Point the CLI at a different backend (a class server over Tailscale, say)
// with one environment variable — the commands do not change:
//   HABITAT_API_BASE_URL=http://100.x.y.z:18787 bun run src/index.ts status
const DEFAULT_BASE_URL = "http://localhost:8787";

// Shape the backend uses for error responses: { "error": "human message" }.
type ErrorBody = { error?: unknown };

export function apiBaseUrl(): string {
  const value = process.env.HABITAT_API_BASE_URL?.trim();

  return value !== undefined && value !== ""
    ? value.replace(/\/+$/, "")
    : DEFAULT_BASE_URL;
}

// Raised when the backend cannot be reached or returns a non-2xx response.
// Command handlers already funnel errors through reportError(); this just
// carries a message a human can act on.
export class HabitatApiError extends Error {}

export async function apiGet<T>(path: string): Promise<T> {
  return request<T>("GET", path);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("POST", path, body);
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("PUT", path, body);
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("PATCH", path, body);
}

export async function apiDelete<T>(path: string): Promise<T> {
  return request<T>("DELETE", path);
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${apiBaseUrl()}${path}`;

  let response: Response;

  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new HabitatApiError(
      `Could not reach the Habitat backend at ${apiBaseUrl()}.\n` +
        "Is it running? Start it with 'bun run server' in another terminal.\n" +
        `(${error instanceof Error ? error.message : String(error)})`,
    );
  }

  if (!response.ok) {
    throw new HabitatApiError(
      `Habitat backend ${method} ${path} failed (${response.status} ${response.statusText}).` +
        (await describeError(response)),
    );
  }

  // 204 No Content and empty bodies have nothing to parse.
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();

  if (text.trim() === "") {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HabitatApiError(
      `Habitat backend ${method} ${path} returned a non-JSON response.`,
    );
  }
}

// Turn a backend error body into a short, human-readable suffix. Prefers the
// backend's own { error } message and never dumps a raw HTML/JSON blob.
async function describeError(response: Response): Promise<string> {
  try {
    const text = await response.text();

    if (text.trim() === "") {
      return "";
    }

    try {
      const parsed = JSON.parse(text) as ErrorBody;

      if (typeof parsed.error === "string" && parsed.error.trim() !== "") {
        return `\n${parsed.error.trim()}`;
      }
    } catch {
      // Not JSON; fall through to the trimmed raw text.
    }

    return `\n${text.trim()}`;
  } catch {
    return "";
  }
}
