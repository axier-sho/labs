import { afterEach, expect, test } from "bun:test";
import { fetchWorldScan } from "./kepler";
import { ScanValidationError, validateScanOptions } from "./scan";

const realFetch = globalThis.fetch;

// Capture the URL/method each call used so we can assert the backend hits the
// exact Kepler endpoint the lab specifies, then hand back a canned JSON body.
function stubFetch(body: unknown): {
  calls: Array<{ url: string; method: string }>;
} {
  const calls: Array<{ url: string; method: string }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, options?: RequestInit) => {
    calls.push({
      url: String(input),
      method: String(options?.method ?? "GET"),
    });

    return new Response(JSON.stringify(body), {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  return { calls };
}

const SCAN_BODY = {
  scan: {
    modelVersion: "resource-probability-v2",
    origin: { x: 3, y: -2 },
    sensorStrength: 60,
    radiusTiles: 0,
    tiles: [],
  },
};

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("calls GET /world/scan with the habitatId and every scan parameter", async () => {
  const { calls } = stubFetch(SCAN_BODY);

  await fetchWorldScan(
    {
      habitatId: "habitat_test",
      x: 3,
      y: -2,
      sensorStrength: 60,
      radiusTiles: 1,
    },
    "https://kepler.test",
  );

  expect(calls).toHaveLength(1);
  expect(calls[0]?.method).toBe("GET");

  const url = new URL(String(calls[0]?.url));
  expect(url.origin + url.pathname).toBe("https://kepler.test/world/scan");
  expect(url.searchParams.get("habitatId")).toBe("habitat_test");
  expect(url.searchParams.get("x")).toBe("3");
  expect(url.searchParams.get("y")).toBe("-2");
  expect(url.searchParams.get("sensorStrength")).toBe("60");
  expect(url.searchParams.get("radiusTiles")).toBe("1");
});

test("returns Kepler's scan body unchanged", async () => {
  stubFetch(SCAN_BODY);

  const body = await fetchWorldScan(
    { habitatId: "habitat_test", x: 3, y: -2, sensorStrength: 60, radiusTiles: 0 },
    "https://kepler.test",
  );

  expect(body).toEqual(SCAN_BODY);
});

test("throws when Kepler returns no scan", async () => {
  stubFetch({ scan: null });

  await expect(
    fetchWorldScan(
      { habitatId: "habitat_test", x: 3, y: -2, sensorStrength: 60, radiusTiles: 0 },
      "https://kepler.test",
    ),
  ).rejects.toThrow("no world scan");
});

test("accepts options on the edges of Kepler's contract", () => {
  expect(
    validateScanOptions({ x: -7, y: 0, sensorStrength: 0, radiusTiles: 0 }),
  ).toEqual({ x: -7, y: 0, sensorStrength: 0, radiusTiles: 0 });

  expect(
    validateScanOptions({ x: 3, y: -2, sensorStrength: 100, radiusTiles: 5 }),
  ).toEqual({ x: 3, y: -2, sensorStrength: 100, radiusTiles: 5 });
});

test("rejects out-of-range sensor strength and radius", () => {
  expect(() =>
    validateScanOptions({ x: 3, y: -2, sensorStrength: 101, radiusTiles: 0 }),
  ).toThrow(ScanValidationError);

  expect(() =>
    validateScanOptions({ x: 3, y: -2, sensorStrength: -1, radiusTiles: 0 }),
  ).toThrow("Sensor strength must be an integer from 0 through 100.");

  expect(() =>
    validateScanOptions({ x: 3, y: -2, sensorStrength: 60, radiusTiles: 6 }),
  ).toThrow("Scan radius must be an integer from 0 through 5.");
});

test("rejects non-integer coordinates and parameters", () => {
  expect(() =>
    validateScanOptions({ x: 3.5, y: -2, sensorStrength: 60, radiusTiles: 0 }),
  ).toThrow("Coordinate x must be an integer.");

  expect(() =>
    validateScanOptions({ x: 3, y: NaN, sensorStrength: 60, radiusTiles: 0 }),
  ).toThrow("Coordinate y must be an integer.");

  expect(() =>
    validateScanOptions({ x: 3, y: -2, sensorStrength: 60.5, radiusTiles: 0 }),
  ).toThrow("Sensor strength must be an integer from 0 through 100.");
});
