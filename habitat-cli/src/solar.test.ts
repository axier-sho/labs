import { afterEach, expect, test } from "bun:test";
import { fetchSolarIrradiance } from "./kepler";

const realFetch = globalThis.fetch;

// Capture the URL/method each call used so we can assert the CLI hits the exact
// Kepler endpoint the lab specifies, then hand back a canned JSON body.
function stubFetch(
  body: unknown,
  init?: { status?: number; statusText?: string },
): { calls: Array<{ url: string; method: string }> } {
  const calls: Array<{ url: string; method: string }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, options?: RequestInit) => {
    calls.push({
      url: String(input),
      method: String(options?.method ?? "GET"),
    });

    return new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      statusText: init?.statusText ?? "OK",
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  return { calls };
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("calls GET /world/solar-irradiance and parses the reading", async () => {
  const { calls } = stubFetch({
    solarIrradiance: { wPerM2: 900, condition: "clear" },
  });

  const irradiance = await fetchSolarIrradiance("https://kepler.test");

  expect(calls).toHaveLength(1);
  expect(calls[0]?.method).toBe("GET");
  expect(calls[0]?.url).toBe("https://kepler.test/world/solar-irradiance");
  expect(irradiance.wPerM2).toBe(900);
  expect(irradiance.condition).toBe("clear");
});

test("defaults a missing condition to 'unknown'", async () => {
  stubFetch({ solarIrradiance: { wPerM2: 120 } });

  const irradiance = await fetchSolarIrradiance("https://kepler.test");

  expect(irradiance.wPerM2).toBe(120);
  expect(irradiance.condition).toBe("unknown");
});

test("throws when the server omits a usable wPerM2 value", async () => {
  stubFetch({ solarIrradiance: { condition: "night" } });

  await expect(fetchSolarIrradiance("https://kepler.test")).rejects.toThrow(
    "no usable solar irradiance",
  );
});

test("surfaces a Kepler HTTP failure instead of returning a reading", async () => {
  stubFetch({ error: "boom" }, { status: 503, statusText: "Service Unavailable" });

  await expect(fetchSolarIrradiance("https://kepler.test")).rejects.toThrow(
    "/world/solar-irradiance failed (503",
  );
});
