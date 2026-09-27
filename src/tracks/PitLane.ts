/**
 * Dedicated pit-lane spur (add-on) near S/F — does NOT reshape race centerlines.
 *
 * Layout (all tracks):
 *  - Main ribbon / Tecpro stay as-built except RIGHT-side openings at mouths + boxes
 *  - Separate pit asphalt spur peels away in a curved arc (дуга) outside right barriers
 *  - Entry opening before S/F → boxes after S/F (outer Tecpro only) → exit opening
 *  - Mid corridor sits farther from race asphalt; entry/exit curve back to merge
 *  - Pit-stop Tecpro on outer side only — no double-wall corridor at the boxes
 *
 * Mandatory pit (Quick Race / Tutorial): complete mini-game by end of lap
 * ceil(totalLaps/2). Miss → DQ.
 */

import { TRACK_BARRIER_OUT } from './Track';

export interface PitLaneSpec {
  /** Meters before S/F where pit spur begins */
  entryBeforeSf: number;
  /** Meters after S/F where pit spur ends */
  exitAfterSf: number;
  /** Length of Tecpro opening at pit ENTRY (m, before S/F) */
  entryOpenLen: number;
  /** Length of Tecpro opening at pit EXIT (m, after S/F) */
  exitOpenLen: number;
  /** Pit asphalt strip width (m) */
  width: number;
  /** Clear gap between race Tecpro outer face and pit inner edge at mouths (m) */
  gapFromRaceEdge: number;
  /**
   * Extra lateral bulge at mid corridor (m) — spur peels out in an arc so mid
   * pit / boxes sit clearly farther from the racing line (not glued parallel).
   */
  midBulge: number;
  /** Box stop zone: s after S/F */
  boxStartS: number;
  boxEndS: number;
  hintLateralFrac: number;
  boxLateralFrac: number;
  stopSpeed: number;
  hintSpeedMax: number;
  /** Extra garage / outer-wall margin beyond spur outer edge (m) */
  apronMargin: number;
}

/** Enlarged spur + arc peel + longer mouths (race centerline untouched). */
export const PIT_LANE: PitLaneSpec = {
  entryBeforeSf: 105,
  exitAfterSf: 82,
  entryOpenLen: 44,
  exitOpenLen: 40,
  width: 9.5,
  gapFromRaceEdge: 0.55,
  // Clear outward arc — mid pit ~10 m farther than a parallel strip
  midBulge: 10.5,
  boxStartS: 8,
  boxEndS: 58,
  hintLateralFrac: 0.18,
  boxLateralFrac: 0.52,
  stopSpeed: 7,
  hintSpeedMax: 48,
  apronMargin: 4.5,
};

/** Raised-cosine ease 0→1 (smooth arc segment). */
function halfCos01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return 0.5 - 0.5 * Math.cos(Math.PI * x);
}

/**
 * Arc bulge factor along the pit corridor: 0 at entry/exit ends, 1 through mid
 * (S/F + boxes). Entry peels out as a curve; exit curves back to merge.
 */
export function pitArcBulgeFactor(
  s: number,
  trackLen: number,
  spec: PitLaneSpec = PIT_LANE,
): number {
  if (trackLen <= 1 || !isPitCorridorS(s, trackLen, spec)) return 0;

  if (s >= trackLen - spec.entryBeforeSf) {
    // Entry arm: peel 0 → 1 (reach full bulge before S/F so mouth reads as an arc)
    const u = (s - (trackLen - spec.entryBeforeSf)) / Math.max(1, spec.entryBeforeSf);
    // Fully out by ~70% of the entry run
    return halfCos01(Math.min(1, u / 0.7));
  }

  // Exit arm: hold full bulge through boxes, then arc back to 0
  const u = s / Math.max(1, spec.exitAfterSf);
  const holdEnd = Math.min(0.78, (spec.boxEndS + 6) / Math.max(1, spec.exitAfterSf));
  if (u <= holdEnd) return 1;
  return halfCos01(1 - (u - holdEnd) / Math.max(1e-6, 1 - holdEnd));
}

/** Lateral distance from race centerline to pit strip centerline (right side). */
export function pitSpurCenterOffset(
  halfW: number,
  s: number,
  trackLen: number,
  spec: PitLaneSpec = PIT_LANE,
): number {
  const bulge = spec.midBulge * pitArcBulgeFactor(s, trackLen, spec);
  return halfW + TRACK_BARRIER_OUT + spec.gapFromRaceEdge + spec.width * 0.5 + bulge;
}

/** Inner edge of pit asphalt (right of race Tecpro), including local arc bulge. */
export function pitSpurInnerOffset(
  halfW: number,
  s: number,
  trackLen: number,
  spec: PitLaneSpec = PIT_LANE,
): number {
  const bulge = spec.midBulge * pitArcBulgeFactor(s, trackLen, spec);
  return halfW + TRACK_BARRIER_OUT + spec.gapFromRaceEdge + bulge;
}

export function isPitCorridorS(s: number, trackLen: number, spec: PitLaneSpec = PIT_LANE): boolean {
  if (trackLen <= 1) return false;
  return s <= spec.exitAfterSf || s >= trackLen - spec.entryBeforeSf;
}

/**
 * Right Tecpro gaps: entry/exit mouths + box / pit-stop zone.
 * Mid entry/exit arms keep a race↔pit separator; at the boxes the race wall
 * opens so Tecpro lives on the outer pit side only (no double corridor).
 */
export function isPitTecproGap(
  s: number,
  trackLen: number,
  side: number,
  spec: PitLaneSpec = PIT_LANE,
): boolean {
  if (side <= 0 || trackLen <= 1) return false;
  // Entry mouth: last entryOpenLen meters before S/F
  if (s >= trackLen - spec.entryOpenLen && s <= trackLen) return true;
  // Exit mouth: first exitOpenLen meters after S/F
  if (s >= 0 && s <= spec.exitOpenLen) return true;
  // Pit-stop boxes — open race-right Tecpro so only outer pit Tecpro walls this zone
  if (s >= spec.boxStartS - 2 && s <= spec.boxEndS + 5) return true;
  return false;
}

export function isPitKerbSkip(
  s: number,
  trackLen: number,
  isLeft: boolean,
  spec: PitLaneSpec = PIT_LANE,
): boolean {
  if (isLeft) return false;
  return isPitTecproGap(s, trackLen, 1, spec);
}

/**
 * Physics apron: open right barrier at entry/exit mouths, or when already past
 * race Tecpro into the pit spur (so the car can drive boxes without ghosting
 * through the mid-corridor wall from the racing line). Allowance grows with
 * the local arc bulge so mid pit stays reachable.
 */
export function pitApronAllowance(
  s: number,
  trackLen: number,
  lateral: number,
  halfW: number,
  spec: PitLaneSpec = PIT_LANE,
): number {
  if (lateral <= 0 || !isPitCorridorS(s, trackLen, spec)) return 0;
  const bulge = spec.midBulge * pitArcBulgeFactor(s, trackLen, spec);
  const need =
    TRACK_BARRIER_OUT + spec.gapFromRaceEdge + spec.width + bulge + spec.apronMargin;
  if (isPitTecproGap(s, trackLen, 1, spec)) return need;
  if (lateral > halfW + TRACK_BARRIER_OUT * 0.85) return need;
  return 0;
}

export function inPitApproach(
  s: number,
  trackLen: number,
  lateral: number,
  halfW: number,
  speed: number,
  spec: PitLaneSpec = PIT_LANE,
): { near: boolean; inBox: boolean; inCorridor: boolean } {
  const inCorridor = isPitCorridorS(s, trackLen, spec);
  if (!inCorridor) return { near: false, inBox: false, inCorridor: false };

  const latOk = lateral >= halfW * spec.hintLateralFrac;
  const boxLat = lateral >= halfW * spec.boxLateralFrac;
  const spd = Math.abs(speed);
  const near = latOk && spd < spec.hintSpeedMax;
  const inBoxZone = s >= spec.boxStartS && s <= spec.boxEndS;
  const inBox = boxLat && inBoxZone && spd <= spec.stopSpeed;
  return { near, inBox, inCorridor };
}

/** Deadline lap: ceil(totalLaps/2). 3-lap race → must pit by end of lap 2. */
export function mandatoryPitDeadlineLap(totalLaps: number): number {
  return Math.max(1, Math.ceil(totalLaps / 2));
}

export function modeHasMandatoryPit(mode: string): boolean {
  return mode === 'quick' || mode === 'tutorial';
}
