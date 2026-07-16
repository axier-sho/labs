import { expect, test } from "bun:test";
import { formatClockEvent, type ClockEvent } from "./clock";

// `clock watch` must print each received tick with its absolute tick and full
// advancedBy amount, and must never print the stream token. The event carries no
// token, and these tests pin the rendered line for applied, ignored, and
// machine-readable cases.

const appliedEvent: ClockEvent = {
  type: "planet_tick",
  tick: 900,
  advancedBy: 100,
  previousTick: 800,
  issuedAt: "2026-07-15T14:30:00.000Z",
  applied: true,
  reason: null,
  receivedAt: "2026-07-15T14:30:00.500Z",
};

test("an applied tick shows its absolute tick and full advancedBy amount", () => {
  const line = formatClockEvent(appliedEvent, false);

  expect(line).toContain("tick 900");
  expect(line).toContain("advancedBy 100");
  expect(line).toContain("applied");
  expect(line).toContain("prev 800");
});

test("an ignored tick explains why it was not applied", () => {
  const ignored: ClockEvent = {
    ...appliedEvent,
    applied: false,
    reason: "duplicate or older tick",
  };

  const line = formatClockEvent(ignored, false);
  expect(line).toContain("tick 900");
  expect(line).toContain("ignored");
  expect(line).toContain("duplicate or older tick");
});

test("jsonl mode emits the raw event object", () => {
  const line = formatClockEvent(appliedEvent, true);
  const parsed = JSON.parse(line) as ClockEvent;

  expect(parsed.tick).toBe(900);
  expect(parsed.advancedBy).toBe(100);
  expect(parsed.applied).toBe(true);
});
