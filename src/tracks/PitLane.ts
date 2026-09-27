/**
 * Dedicated pit-lane spur (add-on) near S/F — does NOT reshape race centerlines.
 *
 * Layout (all tracks):
 *  - Main ribbon / Tecpro stay as-built except two RIGHT-side openings
 *  - Separate pit asphalt spur runs parallel outside right barriers
 *  - Entry opening before S/F → boxes after S/F → exit opening after start
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
  /** Clear gap between race Tecpro outer face and pit inner edge (m) */
  gapFromRaceEdge: number;
  /** Box stop zone: s after S/F */
  boxStartS: number;
  boxEndS: number;
  hintLateralFrac: number;
  boxLateralFrac: number;
  stopSpeed: number;
  hintSpeedMax: number;
  /** Extra right-side barrier allowance when in spur / openings (m beyond halfW) */
  apronExtra: number;
}

/** Enlarged spur + longer mouths so peel-off / boxes read clearly (race centerline untouched). */
export const PIT_LANE: PitLaneSpec = {
  entryBeforeSf: 105,
  exitAfterSf: 82,
  entryOpenLen: 44,
  exitOpenLen: 40,
  width: 9.5,
  gapFromRaceEdge: 0.55,
  boxStartS: 8,
  boxEndS: 58,
  hintLateralFrac: 0.18,
  boxLateralFrac: 0.52,
  stopSpeed: 7,
  hintSpeedMax: 48,
  // ~ barrier + gap + width + garage margin
  apronExtra: 15.5,
};

export function isPitCorridorS(s: number, trackLen: number, spec: PitLaneSpec = PIT_LANE): boolean {
  if (trackLen <= 1) return false;
  return s <= spec.exitAfterSf || s >= trackLen - spec.entryBeforeSf;
}

/** Right Tecpro gap only at entry / exit mouths — middle wall stays between race and pit. */
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
 * through the mid-corridor wall from the racing line).
 */
export function pitApronAllowance(
  s: number,
  trackLen: number,
  lateral: number,
  halfW: number,
  spec: PitLaneSpec = PIT_LANE,
): number {
  if (lateral <= 0 || !isPitCorridorS(s, trackLen, spec)) return 0;
  if (isPitTecproGap(s, trackLen, 1, spec)) return spec.apronExtra;
  if (lateral > halfW + TRACK_BARRIER_OUT * 0.85) return spec.apronExtra;
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
