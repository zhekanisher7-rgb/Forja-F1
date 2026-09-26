/**
 * Simple arcade car–car hitboxes (circle approx of F1 footprint).
 * Separates overlapping cars, slows on contact, light bounce — no ghosting.
 */
import type { VehicleState } from './VehiclePhysics';

/** Approx half-width / collision radius (tub ~1.8 m wide, nose/length folded in) */
export const CAR_HIT_RADIUS = 1.55;

/**
 * Resolve overlap between two vehicles. Mutates both.
 * Returns impact severity (0 = no hit) for optional VFX / damage callers.
 */
export function resolveCarPair(a: VehicleState, b: VehicleState): number {
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
    a.speed *= 0.85;
    b.speed *= 0.85;
    return 0.5;
  }

  const nx = dx / dist;
  const nz = dz / dist;
  const overlap = minDist - dist;

  // Separate evenly so neither ghosts through
  a.x -= nx * overlap * 0.5;
  a.z -= nz * overlap * 0.5;
  b.x += nx * overlap * 0.5;
  b.z += nz * overlap * 0.5;

  // Closing speed along contact normal (positive = approaching)
  const avx = Math.sin(a.yaw) * a.speed;
  const avz = Math.cos(a.yaw) * a.speed;
  const bvx = Math.sin(b.yaw) * b.speed;
  const bvz = Math.cos(b.yaw) * b.speed;
  const closing = (avx - bvx) * nx + (avz - bvz) * nz;

  let impact = Math.min(1, overlap / CAR_HIT_RADIUS);
  if (closing > 0.5) {
    impact = Math.min(1, impact + closing / 40);
    // Arcade bounce: slow both, bleed closing speed
    const bleed = Math.min(0.55, closing * 0.012);
    a.speed *= 0.78 - bleed * 0.15;
    b.speed *= 0.78 - bleed * 0.15;
    // Nudge yaw away from contact so cars don't stick parallel
    const yawKick = 0.05 * Math.min(1, closing / 25);
    const aSide = Math.sign(Math.cos(a.yaw) * nx - Math.sin(a.yaw) * nz) || 1;
    const bSide = Math.sign(Math.cos(b.yaw) * nx - Math.sin(b.yaw) * nz) || 1;
    a.yaw -= aSide * yawKick;
    b.yaw += bSide * yawKick;
    a.damage = Math.min(1, a.damage + impact * 0.035);
    b.damage = Math.min(1, b.damage + impact * 0.035);
  } else {
    // Side-rub / already separating — mild scrub
    a.speed *= 0.96;
    b.speed *= 0.96;
  }

  return impact;
}

/** Player vs all AI, then AI–AI pairs. */
export function resolveFieldCollisions(
  player: VehicleState | null,
  opponents: VehicleState[],
): void {
  if (player) {
    for (const o of opponents) {
      resolveCarPair(player, o);
    }
  }
  for (let i = 0; i < opponents.length; i++) {
    for (let j = i + 1; j < opponents.length; j++) {
      resolveCarPair(opponents[i], opponents[j]);
    }
  }
}
