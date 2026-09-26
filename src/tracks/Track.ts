import * as THREE from 'three';

export interface TrackPoint {
  x: number;
  y: number;
  z: number;
  width: number;
  /** cumulative distance from start */
  s: number;
}

export interface DrsZone {
  startS: number;
  endS: number;
}

export interface TrackData {
  id: string;
  name: string;
  nameRu: string;
  length: number;
  points: TrackPoint[];
  drsZones: DrsZone[];
  /** gravel patches as local polygons in world xz */
  gravel: { x: number; z: number; w: number; d: number; rot: number; y?: number }[];
  startIndex: number;
}

type RawPt = { x: number; z: number; y?: number; width?: number };

function catmullRom1(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

function isRawClosed(raw: RawPt[]): boolean {
  if (raw.length < 3) return false;
  const a = raw[0];
  const b = raw[raw.length - 1];
  return Math.hypot(a.x - b.x, a.z - b.z) < 0.05;
}

/**
 * Dense Catmull-Rom resample of handcrafted control points.
 * Default ~2.4 m spacing → continuous asphalt ribbon without visible segment seams.
 */
export function buildCenterline(
  raw: RawPt[],
  spacing = 2.4,
): TrackPoint[] {
  if (raw.length < 2) return [];

  const closed = isRawClosed(raw);
  // Unique control points (drop duplicate closing point for indexing)
  const ctrl = closed ? raw.slice(0, -1) : raw.slice();
  const n = ctrl.length;
  if (n < 2) {
    const p = raw[0];
    return [{ x: p.x, y: p.y ?? 0, z: p.z, width: p.width ?? 10, s: 0 }];
  }

  const get = (i: number): RawPt => {
    if (closed) {
      const j = ((i % n) + n) % n;
      return ctrl[j];
    }
    return ctrl[Math.max(0, Math.min(n - 1, i))];
  };

  const samples: { x: number; y: number; z: number; width: number }[] = [];
  const segCount = closed ? n : n - 1;

  for (let i = 0; i < segCount; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const y0 = p0.y ?? 0;
    const y1 = p1.y ?? 0;
    const y2 = p2.y ?? 0;
    const y3 = p3.y ?? 0;
    const w0 = p0.width ?? 10;
    const w1 = p1.width ?? 10;
    const w2 = p2.width ?? 10;
    const w3 = p3.width ?? 10;

    // Chord length for subdivision count
    const chord = Math.hypot(p2.x - p1.x, y2 - y1, p2.z - p1.z);
    const steps = Math.max(1, Math.ceil(chord / spacing));

    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      samples.push({
        x: catmullRom1(p0.x, p1.x, p2.x, p3.x, t),
        y: catmullRom1(y0, y1, y2, y3, t),
        z: catmullRom1(p0.z, p1.z, p2.z, p3.z, t),
        width: catmullRom1(w0, w1, w2, w3, t),
      });
    }
  }

  // Close loop: append first sample
  if (closed && samples.length > 0) {
    const first = samples[0];
    samples.push({ x: first.x, y: first.y, z: first.z, width: first.width });
  } else if (!closed) {
    const last = get(n - 1);
    samples.push({
      x: last.x,
      y: last.y ?? 0,
      z: last.z,
      width: last.width ?? 10,
    });
  }

  // Deduplicate near-identical consecutive samples, then accumulate s
  const pts: TrackPoint[] = [];
  let sAcc = 0;
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    if (i > 0) {
      const prev = samples[i - 1];
      const ds = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
      if (ds < 0.05 && i < samples.length - 1) continue;
      sAcc += ds;
    }
    pts.push({
      x: p.x,
      y: p.y,
      z: p.z,
      width: Math.max(10, p.width),
      s: sAcc,
    });
  }

  // Ensure closed endpoints match exactly (position + width).
  // Drop near-duplicate samples next to the join that cause coplanar z-fighting.
  if (closed && pts.length > 4) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    b.x = a.x;
    b.y = a.y;
    b.z = a.z;
    b.width = a.width;

    // Remove interior samples too close to the join (both ends)
    const cleaned: TrackPoint[] = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i];
      const d0 = Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z);
      if (d0 < 0.35) continue;
      cleaned.push(p);
    }
    // Re-accumulate s after cleanup
    let sAcc2 = 0;
    cleaned[0].s = 0;
    for (let i = 1; i < cleaned.length; i++) {
      const prev = cleaned[i - 1];
      const p = cleaned[i];
      sAcc2 += Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
      p.s = sAcc2;
    }
    const close = { x: a.x, y: a.y, z: a.z, width: a.width, s: 0 };
    if (cleaned.length > 1) {
      const last = cleaned[cleaned.length - 1];
      close.s = last.s + Math.hypot(a.x - last.x, a.y - last.y, a.z - last.z);
    }
    cleaned.push(close);
    return cleaned;
  }

  return pts;
}

export function trackLength(pts: TrackPoint[]): number {
  return pts[pts.length - 1]?.s ?? 0;
}

/** Along-track distance between two s values on a closed loop */
function sDelta(a: number, b: number, total: number): number {
  let d = Math.abs(a - b) % total;
  if (d > total * 0.5) d = total - d;
  return d;
}

/**
 * Closest point on polyline; returns distance along, lateral offset, tangent yaw, elevation.
 * preferredS disambiguates stacked overpasses (same XZ, different Y) by staying on the
 * ribbon the car was already following.
 * preferredY refuses snapping to a deck ~2m+ above/below unless we are clearly climbing
 * a ramp (continuous s + steep pitch).
 */
export function projectOnTrack(
  pts: TrackPoint[],
  x: number,
  z: number,
  preferredS?: number,
  preferredY?: number,
): { s: number; lateral: number; yaw: number; width: number; idx: number; y: number; pitch: number } {
  let bestDist = Infinity;
  let bestScore = Infinity;
  let best = { s: 0, lateral: 0, yaw: 0, width: 10, idx: 0, y: 0, pitch: 0 };
  const n = pts.length;
  const total = trackLength(pts) || 1;
  const MAX_Y_JUMP = 2.0;

  for (let i = 0; i < n - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-6) continue;
    let t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const dist = Math.hypot(x - px, z - pz);
    const s = a.s + (b.s - a.s) * t;
    const y = a.y + (b.y - a.y) * t;
    const horiz = Math.hypot(dx, dz) || 1;
    const pitch = Math.atan2(b.y - a.y, horiz);

    // Continuity along track length
    const cont = preferredS === undefined ? 0 : sDelta(s, preferredS, total) * 0.025;

    // Height preference — stay on current deck under overpasses
    let yPenalty = 0;
    if (preferredY !== undefined) {
      const dy = Math.abs(y - preferredY);
      if (dy > MAX_Y_JUMP) {
        const alongOk =
          preferredS !== undefined && sDelta(s, preferredS, total) < 35;
        const climbing = alongOk && Math.abs(pitch) > 0.045 && dy < 5.5;
        if (!climbing) {
          // Hard-reject wrong deck (e.g. upper swimming-pool while on S/F)
          yPenalty = 80 + dy * 8;
        } else {
          yPenalty = dy * 0.15; // soft — allowing ramp climb
        }
      } else {
        yPenalty = dy * 0.35; // mild preference for matching height
      }
    }

    const score = dist + cont + yPenalty;
    const clearlyCloser = dist + yPenalty < bestDist - 1.2;
    const better =
      clearlyCloser || (dist <= bestDist + 2.5 && score < bestScore);
    if (better) {
      bestDist = Math.min(bestDist, dist + yPenalty * 0.05);
      bestScore = score;
      const yaw = Math.atan2(dx, dz);
      const nx = x - px;
      const nz = z - pz;
      const lateral = nx * Math.cos(yaw) - nz * Math.sin(yaw);
      const width = a.width + (b.width - a.width) * t;
      best = { s, lateral, yaw, width, idx: i, y, pitch };
    }
  }
  return best;
}

export function sampleTrack(
  pts: TrackPoint[],
  s: number,
): { x: number; y: number; z: number; yaw: number; width: number; pitch: number } {
  const total = trackLength(pts);
  let ss = ((s % total) + total) % total;
  for (let i = 0; i < pts.length - 1; i++) {
    if (ss >= pts[i].s && ss <= pts[i + 1].s) {
      const span = pts[i + 1].s - pts[i].s || 1;
      const t = (ss - pts[i].s) / span;
      const x = pts[i].x + (pts[i + 1].x - pts[i].x) * t;
      const y = pts[i].y + (pts[i + 1].y - pts[i].y) * t;
      const z = pts[i].z + (pts[i + 1].z - pts[i].z) * t;
      const dx = pts[i + 1].x - pts[i].x;
      const dz = pts[i + 1].z - pts[i].z;
      const yaw = Math.atan2(dx, dz);
      const width = pts[i].width + (pts[i + 1].width - pts[i].width) * t;
      const horiz = Math.hypot(dx, dz) || 1;
      const pitch = Math.atan2(pts[i + 1].y - pts[i].y, horiz);
      return { x, y, z, yaw, width, pitch };
    }
  }
  const last = pts[pts.length - 1];
  return { x: last.x, y: last.y, z: last.z, yaw: 0, width: last.width, pitch: 0 };
}

function isClosedLoop(pts: TrackPoint[]): boolean {
  if (pts.length < 3) return false;
  const a = pts[0];
  const b = pts[pts.length - 1];
  return Math.hypot(a.x - b.x, a.z - b.z) < 0.05;
}

/**
 * Build left/right asphalt edges with mitered joins.
 * Y follows centerline elevation so ribbons / barriers climb with the road.
 */
export function getTrackEdges(pts: TrackPoint[], halfWidthScale = 1): {
  left: THREE.Vector3[];
  right: THREE.Vector3[];
} {
  const left: THREE.Vector3[] = [];
  const right: THREE.Vector3[] = [];
  const n = pts.length;
  const closed = isClosedLoop(pts);
  const lastUnique = closed ? n - 2 : n - 1;

  for (let i = 0; i < n; i++) {
    let iPrev: number;
    let iNext: number;
    if (closed) {
      if (i === 0 || i === n - 1) {
        iPrev = lastUnique;
        iNext = 1;
      } else {
        iPrev = i - 1;
        iNext = i + 1;
      }
    } else {
      iPrev = Math.max(0, i - 1);
      iNext = Math.min(n - 1, i + 1);
    }

    const p0 = pts[iPrev];
    const p1 = pts[i];
    const p2 = pts[iNext];

    let d1x = p1.x - p0.x;
    let d1z = p1.z - p0.z;
    let d2x = p2.x - p1.x;
    let d2z = p2.z - p1.z;
    let l1 = Math.hypot(d1x, d1z);
    let l2 = Math.hypot(d2x, d2z);
    if (l1 < 1e-6 && l2 < 1e-6) {
      d1x = 0;
      d1z = 1;
      l1 = 1;
      d2x = 0;
      d2z = 1;
      l2 = 1;
    } else if (l1 < 1e-6) {
      d1x = d2x;
      d1z = d2z;
      l1 = l2;
    } else if (l2 < 1e-6) {
      d2x = d1x;
      d2z = d1z;
      l2 = l1;
    }
    d1x /= l1;
    d1z /= l1;
    d2x /= l2;
    d2z /= l2;

    const n1x = d1z;
    const n1z = -d1x;
    const n2x = d2z;
    const n2z = -d2x;

    let mx = n1x + n2x;
    let mz = n1z + n2z;
    let mlen = Math.hypot(mx, mz);
    if (mlen < 1e-5) {
      const tx = d1x + d2x;
      const tz = d1z + d2z;
      const tl = Math.hypot(tx, tz) || 1;
      mx = tz / tl;
      mz = -tx / tl;
      mlen = 1;
    } else {
      mx /= mlen;
      mz /= mlen;
    }

    const cosHalf = Math.max(mx * n1x + mz * n1z, 0.35);
    let hw = (pts[i].width / 2) * halfWidthScale;
    let miterLen = hw / cosHalf;

    const turnDot = Math.max(-1, Math.min(1, d1x * d2x + d1z * d2z));
    const turn = Math.acos(turnDot);
    if (turn > 0.35) {
      const maxHw = Math.min(l1, l2) / (2 * Math.max(Math.sin(turn / 2), 0.15));
      const maxMiter = maxHw / cosHalf;
      if (miterLen > maxMiter) {
        miterLen = maxMiter;
        hw = maxMiter * cosHalf;
      }
    }
    miterLen = Math.min(miterLen, hw * 2.0);

    left.push(new THREE.Vector3(p1.x - mx * miterLen, p1.y, p1.z - mz * miterLen));
    right.push(new THREE.Vector3(p1.x + mx * miterLen, p1.y, p1.z + mz * miterLen));
  }
  return { left, right };
}

/**
 * Ground / terrain height at world XZ.
 * Follows the track corridor (preferring the lower ribbon under overpasses),
 * blends into gentle hills / harbor quay further out.
 */
export function sampleTerrainHeight(pts: TrackPoint[], x: number, z: number): number {
  let bestClear = Infinity;
  let bestY = 0;
  let minNearbyY = Infinity;
  let found = false;
  const corridor = 36;
  const n = pts.length;

  for (let i = 0; i < n - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-6) continue;
    let t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const dist = Math.hypot(x - px, z - pz);
    const width = a.width + (b.width - a.width) * t;
    const clearance = dist - width * 0.5;
    if (clearance > corridor) continue;
    found = true;
    const y = a.y + (b.y - a.y) * t;
    if (y < minNearbyY) minNearbyY = y;
    if (clearance < bestClear) {
      bestClear = clearance;
      bestY = y;
    }
  }

  // Procedural hills / cliffs / harbor (cheap, no extra draw calls)
  // Multi-frequency landforms: broad hills + mid ridges + fine rocky noise
  const hill =
    Math.sin(x * 0.011) * Math.cos(z * 0.009) * 2.55 +
    Math.sin(x * 0.0045 + z * 0.0065) * 4.1 +
    Math.sin(x * 0.023 - z * 0.017) * 1.45 +
    Math.sin(x * 0.038 + z * 0.029) * Math.cos(z * 0.021) * 0.85;
  // Casino / Massenet plateau with stepped hillside terraces
  const casinoDist = Math.hypot(x - 370, z - 500);
  const casino = Math.max(0, 1 - casinoDist / 220) * 9.8;
  const casinoTerraces =
    Math.max(0, 1 - casinoDist / 160) *
    (Math.sin(x * 0.055) * 1.35 + Math.cos(z * 0.048) * 1.1);
  // Rocky rise around Monaco tunnel mouth (Portier → tunnel) + side gullies
  const tunnelDist = Math.hypot(x - 400, z - 160);
  const tunnelCliff = Math.max(0, 1 - tunnelDist / 95) * 8.6;
  const tunnelGully =
    Math.max(0, 1 - tunnelDist / 70) *
    Math.abs(Math.sin(x * 0.07 + z * 0.05)) * 2.4;
  // Beau Rivage / Magasin climb hills (north of Portier overpass)
  const climbHill =
    Math.max(0, 1 - Math.hypot(x - 300, z - 340) / 130) *
    (3.2 + Math.sin(x * 0.03) * 1.4);
  const quayZone = x > 120 && z < 80 && z > -140;
  let base = Math.max(
    -0.4,
    hill * 0.48 + casino + casinoTerraces + tunnelCliff * 0.9 + tunnelGully * 0.55 + climbHill,
  );
  if (quayZone) {
    // Harbor flat / quay level — props sit on quay, not floating over water
    // Rocky bank lip near waterline for readable harbor edge
    const quay = 0.35;
    const towardWater = Math.max(0, Math.min(1, (40 - z) / 80));
    const bankLip =
      Math.max(0, 1 - Math.abs(z + 20) / 55) *
      Math.max(0, 1 - Math.abs(x - 240) / 90) *
      (0.55 + Math.sin(x * 0.08) * 0.25);
    base = quay * (1 - towardWater * 0.85) + (-0.35) * towardWater * 0.85;
    base = Math.max(base, hill * 0.18) + bankLip * (1 - towardWater * 0.6);
  }

  if (!found) return base;

  // Under elevated overpass: use lower ribbon for ground
  let trackGroundY = bestY;
  if (bestY - minNearbyY > 2.2 && bestClear < 10) {
    trackGroundY = minNearbyY;
  }

  // Soft blend from track shoulder into surrounding terrain.
  // On-asphalt (clearance < 0): sink well below ribbon so S/F / Noghes never z-fight.
  const underAsphalt = bestClear < 0.35;
  const sink = underAsphalt ? 0.14 : 0.08;
  const edge = Math.max(0, bestClear);
  const u = Math.min(1, edge / corridor);
  const s = u * u * (3 - 2 * u);
  const nearY = trackGroundY - sink;
  return nearY * (1 - s) + base * s;
}
