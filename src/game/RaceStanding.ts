/**
 * Race order helpers.
 *
 * Live HUD: primary = lap, secondary = distanceAlong (s-distance).
 *   progress = (lap - 1) * trackLength + distanceAlong
 *
 * Results / after a car finishes: finishTimeMs order among finishers;
 * anyone still racing ranks behind all finishers.
 */

export interface RacerStanding {
  lap: number;
  /** Meters along track centerline from S/F (0..trackLength). */
  distanceAlong: number;
  finished?: boolean;
  /** Race clock when the car completed the race (ms). Lower = better. */
  finishTimeMs?: number;
}

/** Total race progress in meters (lap + s). */
export function raceProgressMeters(
  lap: number,
  distanceAlong: number,
  trackLength: number,
): number {
  const L = Math.max(1e-6, trackLength);
  const s = ((distanceAlong % L) + L) % L;
  return (Math.max(1, lap) - 1) * L + s;
}

/**
 * 1-based position of `player` among player + opponents.
 *
 * - While racing: sort by lap, then s-distance. Finished opponents count as ahead.
 * - After player finished: only earlier finishTimeMs opponents rank ahead
 *   (cars still out on track do not steal the place).
 */
export function computeRacePosition(
  player: RacerStanding,
  opponents: RacerStanding[],
  trackLength: number,
): number {
  if (player.finished) {
    let pos = 1;
    const t = player.finishTimeMs ?? Number.POSITIVE_INFINITY;
    for (const opp of opponents) {
      if (opp.finished && (opp.finishTimeMs ?? Number.POSITIVE_INFINITY) < t) {
        pos++;
      }
    }
    return pos;
  }

  let pos = 1;
  const pProg = raceProgressMeters(player.lap, player.distanceAlong, trackLength);
  for (const opp of opponents) {
    if (opp.finished) {
      pos++;
      continue;
    }
    const oProg = raceProgressMeters(opp.lap, opp.distanceAlong, trackLength);
    if (oProg > pProg) pos++;
  }
  return pos;
}

/**
 * Documented self-check — throws if ranking regresses.
 * Scenario: player behind 2 AI on same lap → position 3.
 */
export function selfVerifyRaceStanding(): void {
  const L = 2500;

  // Live: same lap, two AI with greater s → P3
  const player = { lap: 2, distanceAlong: 800 };
  const field = [
    { lap: 2, distanceAlong: 1200 },
    { lap: 2, distanceAlong: 950 },
    { lap: 2, distanceAlong: 400 },
    { lap: 1, distanceAlong: 2400 },
  ];
  const pos = computeRacePosition(player, field, L);
  if (pos !== 3) {
    throw new Error(
      `RaceStanding self-check failed: expected position 3 (behind 2 AI same lap), got ${pos}`,
    );
  }

  // Results: two AI finished earlier → player P3 even if still-running AI have high s
  const finishedPlayer = {
    lap: 4,
    distanceAlong: 10,
    finished: true,
    finishTimeMs: 300_000,
  };
  const finishedField = [
    { lap: 4, distanceAlong: 200, finished: true, finishTimeMs: 280_000 },
    { lap: 4, distanceAlong: 150, finished: true, finishTimeMs: 290_000 },
    { lap: 3, distanceAlong: 2400, finished: false },
    { lap: 3, distanceAlong: 2300, finished: false },
  ];
  const finPos = computeRacePosition(finishedPlayer, finishedField, L);
  if (finPos !== 3) {
    throw new Error(
      `RaceStanding finish-order self-check failed: expected 3, got ${finPos}`,
    );
  }

  const p = raceProgressMeters(3, 100, L);
  if (Math.abs(p - (2 * L + 100)) > 1e-6) {
    throw new Error(`raceProgressMeters mismatch: ${p}`);
  }
}
