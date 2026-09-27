/**
 * Basic Monaco AI — follows racing line with skill-based speed, simple overtake offset.
 */
import * as THREE from 'three';
import { sampleTrack, applyTrackBarrierClamp, type TrackData } from '../tracks/Track';
import {
  VehiclePhysics,
  createVehicleState,
  type VehicleState,
} from '../physics/VehiclePhysics';
import { type WeatherState } from '../physics/Weather';
import { createCarMesh } from '../render/CarMesh';
import { getLivery } from '../vehicles/Liveries';
import type { InputState } from '../input/InputManager';

export interface AIDriverConfig {
  skill: number; // 0..1 — higher = faster / cleaner line
  aggression: number;
  liveryId: string;
}

export interface AICar {
  id: string;
  config: AIDriverConfig;
  vehicle: VehicleState;
  mesh: THREE.Group;
  physics: VehiclePhysics;
  /** lateral offset from center (−1..1 of half-width) */
  lineBias: number;
  lookAhead: number;
  /** Grid slot index (0..) — used to stagger launch targets */
  gridIndex: number;
  /** Seconds since lights-out; set by Game each frame */
  raceAgeSec: number;
}

const emptyInput = (): InputState => ({
  throttle: 0,
  brake: 0,
  steer: 0,
  engineBrake: 0,
  ers: false,
  drs: false,
  reverse: false,
  cameraToggle: false,
});

/** Curvature estimate from three samples ahead (1/radius approx) */
function curvatureAhead(track: TrackData, s: number, skill: number): number {
  const d1 = 12 + skill * 8;
  const d2 = 28 + skill * 14;
  const a = sampleTrack(track.points, s + d1 * 0.35);
  const b = sampleTrack(track.points, s + d1);
  const c = sampleTrack(track.points, s + d2);
  const yaw1 = Math.atan2(b.x - a.x, b.z - a.z);
  const yaw2 = Math.atan2(c.x - b.x, c.z - b.z);
  let dYaw = yaw2 - yaw1;
  while (dYaw > Math.PI) dYaw -= Math.PI * 2;
  while (dYaw < -Math.PI) dYaw += Math.PI * 2;
  return Math.abs(dYaw);
}

export function createAICar(
  id: string,
  config: AIDriverConfig,
  track: TrackData,
  startS: number,
  lateralBias: number,
  weather: WeatherState,
  castShadow: boolean,
  gridIndex = 0,
): AICar {
  const sample = sampleTrack(track.points, startS);
  // Offset laterally from center — keep clear of sister grid slot
  const lat = lateralBias * (sample.width * 0.32);
  const x = sample.x + Math.cos(sample.yaw) * lat;
  const z = sample.z - Math.sin(sample.yaw) * lat;

  const vehicle = createVehicleState(x, z, sample.yaw, 'slick');
  vehicle.y = sample.y;
  vehicle.pitch = sample.pitch;
  vehicle.distanceAlong = startS;
  vehicle.lap = 1;
  // AI start with slightly less fuel variance (cosmetic)
  vehicle.fuel = 0.92 + config.skill * 0.06;

  const physics = new VehiclePhysics({
    difficulty: config.skill > 0.7 ? 'pro' : config.skill > 0.4 ? 'amateur' : 'rookie',
    weather,
    mass: 620,
    maxPower: 850 + config.skill * 110,
    dragCd: 0.9,
    downforceCl: 2.9,
    wheelbase: 3.6,
  });

  const racingNumber = 11 + (parseInt(id.replace(/\D/g, ''), 10) || 0) * 11;
  const mesh = createCarMesh(getLivery(config.liveryId), { castShadow, racingNumber });
  mesh.name = `ai-${id}`;

  return {
    id,
    config,
    vehicle,
    mesh,
    physics,
    lineBias: lateralBias * 0.4,
    lookAhead: 14 + config.skill * 10,
    gridIndex,
    raceAgeSec: 0,
  };
}

export function updateAICar(ai: AICar, track: TrackData, dt: number): void {
  const v = ai.vehicle;
  const skill = ai.config.skill;
  const launch = ai.raceAgeSec < 4.5;
  const launchT = Math.max(0, 1 - ai.raceAgeSec / 4.5);

  // Stagger look-ahead / line so cars don't dive into the same apex off the line
  const staggerLat =
    (ai.gridIndex % 2 === 0 ? -1 : 1) * (0.18 + ai.gridIndex * 0.06) * launchT;
  const staggerLook = ai.gridIndex * 2.2 * launchT;

  const targetS = v.distanceAlong + ai.lookAhead + staggerLook;
  const target = sampleTrack(track.points, targetS);
  const near = sampleTrack(track.points, v.distanceAlong + 4);

  const latOff = (ai.lineBias + staggerLat) * near.width * 0.42;
  const tx = target.x + Math.cos(target.yaw) * latOff;
  const tz = target.z - Math.sin(target.yaw) * latOff;

  const dx = tx - v.x;
  const dz = tz - v.z;
  const desiredYaw = Math.atan2(dx, dz);
  let yawErr = desiredYaw - v.yaw;
  while (yawErr > Math.PI) yawErr -= Math.PI * 2;
  while (yawErr < -Math.PI) yawErr += Math.PI * 2;

  const curv = curvatureAhead(track, v.distanceAlong, skill);
  // Target speed from curvature — skill raises ceiling; softer during launch
  const baseMax = 48 + skill * 22; // m/s ~170–250 km/h
  const cornerMax = Math.max(12, baseMax * (1 - Math.min(0.85, curv * 2.8)));
  const speed = Math.abs(v.speed);

  const input = emptyInput();
  // Steer — proportional; dial down aggression in first seconds
  const steerGain = launch ? 1.1 + skill * 0.35 : 1.6 + skill * 0.8;
  input.steer = Math.max(-1, Math.min(1, yawErr * steerGain));

  if (launch && speed < 28) {
    // Lights-out: prioritise clean acceleration, light brake only if way too fast into kink
    if (speed > cornerMax + 8) {
      input.brake = Math.min(0.35, (speed - cornerMax) * 0.06);
      input.throttle = 0.35;
    } else {
      input.throttle = Math.min(1, 0.88 + skill * 0.12);
      input.brake = 0;
    }
  } else if (speed > cornerMax + 2) {
    input.brake = Math.min(1, (speed - cornerMax) * 0.12);
    input.throttle = 0;
  } else if (speed > cornerMax) {
    input.brake = 0.15;
    input.throttle = 0.2;
  } else {
    input.throttle = Math.min(1, 0.55 + skill * 0.4 + (cornerMax - speed) * 0.02);
    input.brake = 0;
  }

  // DRS when in zone and mostly straight
  input.drs = v.inDrsZone && curv < 0.08 && speed > 25;
  // Occasional ERS on straights
  input.ers = curv < 0.05 && speed > 30 && v.ers > 0.15 && skill > 0.35;

  // Track walls = Tecpro face (same hard clamp as player)
  const half = near.width / 2;
  const latNow =
    (v.x - near.x) * Math.cos(near.yaw) - (v.z - near.z) * Math.sin(near.yaw);
  const clamped = applyTrackBarrierClamp(v.x, v.z, v.yaw, latNow, half);
  let wallHit = clamped.wallHit;
  if (wallHit > 0) {
    v.x = clamped.x;
    v.z = clamped.z;
    v.yaw = clamped.yaw;
    v.speed *= 0.9;
  }

  // DRS zone flag from track
  v.inDrsZone = track.drsZones.some((z) => {
    if (z.startS <= z.endS) return v.distanceAlong >= z.startS && v.distanceAlong <= z.endS;
    return v.distanceAlong >= z.startS || v.distanceAlong <= z.endS;
  });

  ai.physics.step(v, input, dt, wallHit);

  // Re-project s / elevation from position for lap consistency
  const projS = projectS(track, v.x, v.z, v.distanceAlong, v.y);
  v.distanceAlong = projS.s;
  if (Math.abs(projS.y - v.y) > 2.0 && Math.abs(projS.pitch) < 0.05) {
    /* stay on lower deck under overpass */
  } else {
    v.y = projS.y;
    v.pitch = projS.pitch;
  }

  // Sync mesh
  ai.mesh.position.set(v.x, v.y, v.z);
  ai.mesh.rotation.order = 'YXZ';
  ai.mesh.rotation.y = v.yaw;
  ai.mesh.rotation.z = -v.angularVel * 0.12;
  ai.mesh.rotation.x = v.pitch - v.speed * 0.002;
}

function projectS(
  track: TrackData,
  x: number,
  z: number,
  preferredS: number,
  preferredY = 0,
): { s: number; y: number; pitch: number } {
  // Local search around preferredS; prefer matching height under overpasses
  const total = track.length || 1;
  let bestScore = Infinity;
  let best = { s: preferredS, y: preferredY, pitch: 0 };
  const start = preferredS - 40;
  const end = preferredS + 60;
  for (let s = start; s <= end; s += 3) {
    const ss = ((s % total) + total) % total;
    const p = sampleTrack(track.points, ss);
    const d = Math.hypot(x - p.x, z - p.z);
    const dy = Math.abs(p.y - preferredY);
    const yPen = dy > 2.0 ? 50 + dy * 6 : dy * 0.4;
    const score = d + yPen;
    if (score < bestScore) {
      bestScore = score;
      best = { s: ss, y: p.y, pitch: p.pitch };
    }
  }
  return best;
}

/** Player grid S — AI slots sit behind on the same straight (no wrap past S/F). */
export const PLAYER_GRID_S = 36;
/** Longitudinal gap between consecutive grid rows (m along track). */
const GRID_ROW_GAP = 9.5;

/** Allowed opponent counts in race setup (persisted via MainMenu). */
export const OPPONENT_COUNT_OPTIONS = [4, 8, 12, 16] as const;
export type OpponentCount = (typeof OPPONENT_COUNT_OPTIONS)[number];
export const DEFAULT_OPPONENT_COUNT: OpponentCount = 8;

const AI_LIVERY_POOL = [
  'mercedes',
  'mclaren',
  'redbull',
  'aston',
  'williams',
  'alpine',
  'haas',
  'audi',
  'racingbulls',
  'cadillac',
  'ferrari',
] as const;

/** Spawn N AI opponents with staggered F1-style grid slots (player pole at PLAYER_GRID_S). */
export function createAIGrid(
  track: TrackData,
  playerLiveryId: string,
  weather: WeatherState,
  castShadow: boolean,
  count: number = DEFAULT_OPPONENT_COUNT,
): AICar[] {
  const n = Math.max(1, Math.min(16, Math.round(count)));
  const pool = AI_LIVERY_POOL.filter((id) => id !== playerLiveryId);
  // Cycle liveries if field > pool size
  const configs: AIDriverConfig[] = [];
  for (let i = 0; i < n; i++) {
    const t = n <= 1 ? 1 : i / (n - 1);
    const skill = 0.88 - t * 0.48; // 0.88 … ~0.40
    const aggression = 0.58 - t * 0.32;
    configs.push({
      skill,
      aggression,
      liveryId: pool[i % pool.length] ?? 'mercedes',
    });
  }

  // F1-style 2-wide grid behind the player. Player is pole (left) at PLAYER_GRID_S.
  // Slot i → one car length+ behind previous; alternate left/right.
  // IMPORTANT: never clamp all AI onto the same s (old Math.max(0.6, …) stacked them).
  return configs.map((cfg, i) => {
    const row = i + 1; // 1..N behind pole
    const startS = Math.max(1.5, PLAYER_GRID_S - row * GRID_ROW_GAP);
    // Odd rows start right of center, even left — clears the pole lane
    const lateral = row % 2 === 1 ? 0.78 : -0.78;
    return createAICar(
      `ai${i}`,
      cfg,
      track,
      startS,
      lateral,
      weather,
      castShadow,
      i,
    );
  });
}

/** Legacy stub kept for type compatibility */
export function createStubAI(id: string, config: AIDriverConfig): { id: string; config: AIDriverConfig; update: (_dt: number) => void } {
  return {
    id,
    config,
    update(_dt: number): void {
      /* replaced by createAIGrid / updateAICar */
    },
  };
}

export type GridSlot = {
  driverId: string;
  isPlayer: boolean;
  liveryId: string;
};
