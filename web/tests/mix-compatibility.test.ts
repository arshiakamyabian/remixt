// mixCompatibility.ts: whether a song fits a Studio project by BPM and
// key. Pure, no DOM — run with:
//
//   node --import ./tests/support/register.mjs --test tests/mix-compatibility.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DEFAULT_BPM_TOLERANCE,
  bpmCompatible,
  checkCompatibility,
  keyCompatible,
} from "../src/lib/client/mixCompatibility.ts";
import type { MusicalKey } from "../src/lib/client/musicKey.ts";

const Amin: MusicalKey = { tonic: 9, mode: "minor" };   // 8A
const Cmaj: MusicalKey = { tonic: 0, mode: "major" };   // 8B — relative to A min
const Emin: MusicalKey = { tonic: 4, mode: "minor" };   // 9A — one step on the wheel
const Dmin: MusicalKey = { tonic: 2, mode: "minor" };   // 7A — one step the other way
const Bbmaj: MusicalKey = { tonic: 10, mode: "major" }; // 6B — two steps from 8A
const Dmaj: MusicalKey = { tonic: 2, mode: "major" };   // 10B — two steps the other way
const Fshm: MusicalKey = { tonic: 6, mode: "minor" };   // 11A — three steps from 8A (far)
// Camelot wheel edges — picked so one step crosses the 12A↔1A seam.
const Gshm: MusicalKey = { tonic: 8, mode: "minor" };   // 12A (G#/Ab min)
const Dshm: MusicalKey = { tonic: 1, mode: "minor" };   // 1A  (D#/Eb min, neighbour of 12A)

describe("bpmCompatible", () => {
  test("within tolerance is compatible", () => {
    const r = bpmCompatible(123, 120, 0.06);
    assert.equal(r.compatible, true);
    assert.equal(r.factor, 1);
  });
  test("outside tolerance is incompatible", () => {
    assert.equal(bpmCompatible(140, 120, 0.06).compatible, false);
  });
  test("half time counts (140 project, 70 song)", () => {
    const r = bpmCompatible(70, 140, 0.06);
    assert.equal(r.compatible, true);
    assert.equal(r.factor, 2);
  });
  test("double time counts (70 project, 140 song)", () => {
    const r = bpmCompatible(140, 70, 0.06);
    assert.equal(r.compatible, true);
    assert.equal(r.factor, 0.5);
  });
  test("missing BPM is incompatible (handled as unknown upstream)", () => {
    assert.equal(bpmCompatible(null, 120).compatible, false);
    assert.equal(bpmCompatible(120, null).compatible, false);
    assert.equal(bpmCompatible(0, 120).compatible, false);
  });
  test("tolerance boundary", () => {
    // 6% above 100 is 106 exactly.
    assert.equal(bpmCompatible(106, 100, 0.06).compatible, true);
    assert.equal(bpmCompatible(106.5, 100, 0.06).compatible, false);
  });
  test("default tolerance is ±6%", () => {
    assert.ok(DEFAULT_BPM_TOLERANCE > 0.05 && DEFAULT_BPM_TOLERANCE < 0.07);
  });
});

describe("keyCompatible", () => {
  test("same key is compatible", () => {
    assert.equal(keyCompatible(Amin, Amin).compatible, true);
  });
  test("relative major/minor is compatible (8A ↔ 8B)", () => {
    assert.equal(keyCompatible(Amin, Cmaj).compatible, true);
    assert.equal(keyCompatible(Cmaj, Amin).compatible, true);
  });
  test("one step on the Camelot wheel is compatible (8A ↔ 9A, 8A ↔ 7A)", () => {
    assert.equal(keyCompatible(Amin, Emin).compatible, true);
    assert.equal(keyCompatible(Amin, Dmin).compatible, true);
  });
  test("wraparound: 12A ↔ 1A is compatible", () => {
    assert.equal(keyCompatible(Gshm, Dshm).compatible, true);
    assert.equal(keyCompatible(Dshm, Gshm).compatible, true);
  });
  test("two steps away is not compatible", () => {
    // 8A → 10B is two Camelot steps.
    assert.equal(keyCompatible(Amin, Dmaj).compatible, false);
    // 8A → 6B is two steps the other way.
    assert.equal(keyCompatible(Amin, Bbmaj).compatible, false);
  });
  test("far keys clash", () => {
    assert.equal(keyCompatible(Amin, Fshm).compatible, false);
  });
  test("missing keys is incompatible (handled as unknown upstream)", () => {
    assert.equal(keyCompatible(null, Amin).compatible, false);
    assert.equal(keyCompatible(Amin, null).compatible, false);
  });
});

describe("checkCompatibility", () => {
  test("both match → compatible, no reason", () => {
    const r = checkCompatibility({ bpm: 123, key: Amin }, { bpm: 120, key: Cmaj });
    assert.equal(r.compatible, true);
    assert.equal(r.unknown, false);
    assert.equal(r.reason, undefined);
  });
  test("BPM mismatch → reason mentions BPM", () => {
    const r = checkCompatibility({ bpm: 140, key: Amin }, { bpm: 100, key: Amin });
    assert.equal(r.compatible, false);
    assert.match(r.reason!, /BPM/);
  });
  test("key mismatch → reason mentions key", () => {
    const r = checkCompatibility({ bpm: 120, key: Fshm }, { bpm: 120, key: Amin });
    assert.equal(r.compatible, false);
    assert.match(r.reason!, /Key/);
  });
  test("both mismatch → reason mentions both", () => {
    const r = checkCompatibility({ bpm: 140, key: Fshm }, { bpm: 100, key: Amin });
    assert.equal(r.compatible, false);
    assert.match(r.reason!, /BPM/);
    assert.match(r.reason!, /Key/);
  });
  test("missing song BPM → unknown, not blocked", () => {
    const r = checkCompatibility({ bpm: null, key: Amin }, { bpm: 120, key: Amin });
    assert.equal(r.compatible, false);
    assert.equal(r.unknown, true);
  });
  test("missing song key → unknown", () => {
    const r = checkCompatibility({ bpm: 120, key: null }, { bpm: 120, key: Amin });
    assert.equal(r.compatible, false);
    assert.equal(r.unknown, true);
  });
  test("lane BPM override wins over track BPM", () => {
    // Track says 70, lane override says 140 — fits a 140 project.
    const r = checkCompatibility(
      { bpm: 70, key: Amin, bpmOverride: 140 },
      { bpm: 140, key: Amin },
    );
    assert.equal(r.compatible, true);
    assert.equal(r.bpm.factor, 1);
  });
  test("custom bpmTolerance tightens the match", () => {
    // 5% off: compatible at default, incompatible at ±2%.
    const loose = checkCompatibility({ bpm: 105, key: Amin }, { bpm: 100, key: Amin });
    const tight = checkCompatibility(
      { bpm: 105, key: Amin },
      { bpm: 100, key: Amin },
      { bpmTolerance: 0.02 },
    );
    assert.equal(loose.compatible, true);
    assert.equal(tight.compatible, false);
  });
});
