import { camelotCode, keyFit, type MusicalKey } from "./musicKey";

// Whether a song fits a Studio project's tempo and key well enough to be
// mixed in without a stretch or shift that would hurt the sound. Pure, so
// it can be tested without a browser.
//
// BPM: the song's own tempo, half-time and double-time all count. A song
// at 70 fits a 140 BPM project (and a 140 BPM song fits a 70 project).
//
// Key: same Camelot code, one step round the wheel, or the relative major
// or minor — all count as a match. Everything else is a clash. musicKey.ts
// does the Camelot arithmetic; this module just chooses which of its
// answers count as compatible.

export const DEFAULT_BPM_TOLERANCE = 0.06;

export type BpmResult = {
  compatible: boolean;
  /** The multiplier (1, 2 or 0.5) at which the song is read; undefined when no BPM is known. */
  factor?: 1 | 2 | 0.5;
  /** The ratio `effectiveBpm / projectBpm`, 1 being spot on. */
  ratio?: number;
};

/**
 * Whether `bpm` fits `projectBpm` within `tolerance` (fractional, e.g. 0.06
 * for ±6%), trying as-is, half time and double time and keeping the
 * closest. Returns `compatible: false` with no factor when either BPM is
 * missing — the caller shows that as "unknown", not as a blocker.
 */
export function bpmCompatible(
  bpm: number | null | undefined,
  projectBpm: number | null | undefined,
  tolerance: number = DEFAULT_BPM_TOLERANCE,
): BpmResult {
  if (!bpm || !projectBpm || bpm <= 0 || projectBpm <= 0) return { compatible: false };
  const factors: (1 | 2 | 0.5)[] = [1, 2, 0.5];
  let best: { factor: 1 | 2 | 0.5; ratio: number; distance: number } | null = null;
  for (const factor of factors) {
    const ratio = (bpm * factor) / projectBpm;
    const distance = Math.abs(ratio - 1);
    if (!best || distance < best.distance) best = { factor, ratio, distance };
  }
  return { compatible: best!.distance <= tolerance + 1e-9, factor: best!.factor, ratio: best!.ratio };
}

export type KeyResult = {
  compatible: boolean;
  /** The relation musicKey.keyFit found. Only set when both keys are known. */
  fit?: "same" | "relative" | "neighbour" | "far" | "clash";
};

/**
 * Whether `key` fits `projectKey`: same notes (identical key or its
 * relative major/minor), or one step round the Camelot wheel (a fifth
 * away — six of seven notes shared). Returns `compatible: false` with no
 * fit when either key is missing.
 */
export function keyCompatible(
  key: MusicalKey | null | undefined,
  projectKey: MusicalKey | null | undefined,
): KeyResult {
  if (!key || !projectKey) return { compatible: false };
  const fit = keyFit(key, projectKey);
  return { compatible: fit === "same" || fit === "relative" || fit === "neighbour", fit };
}

export type ProjectReference = {
  bpm: number | null | undefined;
  /** The project's key, usually the first beat lane's — see effectiveProjectKey below. */
  key: MusicalKey | null | undefined;
};

export type SongForCheck = {
  bpm: number | null | undefined;
  key: MusicalKey | null | undefined;
  /** Per-lane BPM override, when the user has set one on an existing lane; wins over `bpm`. */
  bpmOverride?: number | null;
};

export type CompatibilityOptions = {
  bpmTolerance?: number;
};

export type Compatibility = {
  /** Both BPM and key are known and compatible. */
  compatible: boolean;
  /** Short reason to show when the add is blocked ("126 BPM, project is 100"); undefined when compatible. */
  reason?: string;
  /** True when BPM or key is unknown — the caller shows "not analyzed yet" and allows with a warning. */
  unknown: boolean;
  bpm: BpmResult & { known: boolean };
  key: KeyResult & { known: boolean };
};

/**
 * The compatibility verdict for one song against the project, with human
 * reasons for whichever side blocks (BPM, key, or neither). "Unknown" when
 * the song is missing one or both of them — the UI allows it with a warning
 * rather than blocking.
 */
export function checkCompatibility(
  song: SongForCheck,
  project: ProjectReference,
  options: CompatibilityOptions = {},
): Compatibility {
  const tolerance = options.bpmTolerance ?? DEFAULT_BPM_TOLERANCE;
  const effectiveBpm = song.bpmOverride ?? song.bpm;
  const bpmResult = bpmCompatible(effectiveBpm, project.bpm, tolerance);
  const keyResult = keyCompatible(song.key, project.key);
  const bpmKnown = !!effectiveBpm && !!project.bpm;
  const keyKnown = !!song.key && !!project.key;
  const unknown = !bpmKnown || !keyKnown;
  const bpmFails = bpmKnown && !bpmResult.compatible;
  const keyFails = keyKnown && !keyResult.compatible;
  let reason: string | undefined;
  if (bpmFails && keyFails) {
    reason = `${describeBpm(effectiveBpm!, project.bpm!)}, ${describeKey(song.key!, project.key!)}`;
  } else if (bpmFails) {
    reason = describeBpm(effectiveBpm!, project.bpm!);
  } else if (keyFails) {
    reason = describeKey(song.key!, project.key!);
  }
  return {
    compatible: !bpmFails && !keyFails && !unknown,
    reason,
    unknown,
    bpm: { ...bpmResult, known: bpmKnown },
    key: { ...keyResult, known: keyKnown },
  };
}

function describeBpm(bpm: number, projectBpm: number) {
  return `${Math.round(bpm)} BPM, project is ${Math.round(projectBpm)}`;
}

function describeKey(key: MusicalKey, projectKey: MusicalKey) {
  return `Key ${camelotCode(key)}, project is ${camelotCode(projectKey)}`;
}
