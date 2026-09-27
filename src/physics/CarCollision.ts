/**
 * Simple arcade car–car hitboxes (circle approx of F1 footprint).
 * Separates overlapping cars, mild bounce — no ghosting, no mutual freeze.
 * Player power/mass are NEVER reduced by AI presence (damageMul stays mode-identical).
 */
import type { VehicleState } from './VehiclePhysics';

/** Approx half-width / collision radius (tub ~1.8 m wide, nose/length folded in) */
export const CAR_HIT_RADIUS = 1.55;

/** Soft floor so bumps cannot leave cars at walking pace */
const MIN_POST_HIT_SPEED = 6.5;

export type ResolvePairOpts = {
  /** When true, skip damage on `a` (player) so AI contact cannot nerf maxPower. */
  protectA?: boolean;
};

/**
 * Resolve overlap between two vehicles. Mutates both.
 * Returns impact severity (0 = no hit) for optional VFX / damage callers.
 */
export function resolveCarPair(a: VehicleState, b: VehicleState, opts?: ResolvePairOpts): number {
  if (a.finished || b.finished) return 0;

  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const minDist = CAR_HIT_RADIUS * 2;

  if (dist >= minDist) return 0;
  if (dist < 1e-4) {
    // Exact stack — nudge apart along average heading
    const nx = Math.sin((a.yaw + b.yaw) * 0.5);
    const nz = Math.cos((a.yaw + b.yaw) * 0.5);
    a.x -= nx * CAR_HIT_RADIUS;
    a.z -= nz * CAR_HIT_RADIUS;
    b.x += nx * CAR_HIT_RADIUS;
    b.z += nz * CAR_HIT_RADIUS;
    a.speed = Math.max(Math.abs(a.speed) * 0.92, MIN_POST_HIT_SPEED) * Math.sign(a.speed || 1);
    b.speed = Math.max(Math.abs(b.speed) * 0.92, MIN_POST_HIT_SPEED) * Math.sign(b.speed || 1);
    return 0.5;
  }

  const nx = dx / dist;
  const nz = dz / dist;
  const overlap = minDist - dist;

  // Separate evenly so neither ghosts through (slightly stronger push to unstick)
  const sep = overlap * 0.55;
  a.x -= nx * sep;
  a.z -= nz * sep;
  b.x += nx * sep;
  b.z += nz * sep;

  // Closing speed along contact normal (positive = approaching)
  const avx = Math.sin(a.yaw) * a.speed;
  const avz = Math.cos(a.yaw) * a.speed;
  const bvx = Math.sin(b.yaw) * b.speed;
  const bvz = Math.cos(b.yaw) * b.speed;
  const closing = (avx - bvx) * nx + (avz - bvz) * nz;

  let impact = Math.min(1, overlap / CAR_HIT_RADIUS);
  const playerProtect = opts?.protectA === true;

  if (closing > 0.5) {
    impact = Math.min(1, impact + closing / 40);
    // Mild arcade bounce — keep cars moving; never scrub to a crawl
    const bleed = Math.min(playerProtect ? 0.22 : 0.32, closing * (playerProtect ? 0.005 : 0.007));
    const aMul = (playerProtect ? 0.94 : 0.88) - bleed * 0.08;
    const bMul = 0.88 - bleed * 0.1;
    const aKeep = Math.max(Math.abs(a.speed) * aMul, Math.min(Math.abs(a.speed), MIN_POST_HIT_SPEED));
    const bKeep = Math.max(Math.abs(b.speed) * bMul, Math.min(Math.abs(b.speed), MIN_POST_HIT_SPEED));
    a.speed = aKeep * Math.sign(a.speed || 1);
    b.speed = bKeep * Math.sign(b.speed || 1);
    // Nudge yaw away from contact so cars don't stick parallel
    const yawKick = 0.06 * Math.min(1, closing / 25);
    const aSide = Math.sign(Math.cos(a.yaw) * nx - Math.sin(a.yaw) * nz) || 1;
    const bSide = Math.sign(Math.cos(b.yaw) * nx - Math.sin(b.yaw) * nz) || 1;
    a.yaw -= aSide * yawKick;
    b.yaw += bSide * yawKick;
    // Damage only on AI / unprotected cars — never cut player maxPower via damageMul
    if (!playerProtect) {
      a.damage = Math.min(1, a.damage + impact * 0.022);
    }
    b.damage = Math.min(1, b.damage + impact * 0.022);
  } else {
    // Side-rub / already separating — very light scrub (was 0.96–0.97/frame = freeze in traffic)
    a.speed *= playerProtect ? 0.995 : 0.99;
    b.speed *= 0.99;
    // Still enforce a gentle floor if both nearly stopped while interlocking
    if (Math.abs(a.speed) < MIN_POST_HIT_SPEED * 0.5 && Math.abs(b.speed) < MIN_POST_HIT_SPEED * 0.5) {
      a.speed = Math.max(Math.abs(a.speed), MIN_POST_HIT_SPEED * 0.55) * Math.sign(a.speed || 1);
      b.speed = Math.max(Math.abs(b.speed), MIN_POST_HIT_SPEED * 0.55) * Math.sign(b.speed || 1);
    }
  }

  return impact;
}

/** Player vs all AI (player power protected), then AI–AI pairs. */
export function resolveFieldCollisions(
  player: VehicleState | null,
  opponents: VehicleState[],
): void {
  if (player) {
    for (const o of opponents) {
      resolveCarPair(player, o, { protectA: true });
    }
  }
  for (let i = 0; i < opponents.length; i++) {
    for (let j = i + 1; j < opponents.length; j++) {
      resolveCarPair(opponents[i], opponents[j]);
    }
  }
}
