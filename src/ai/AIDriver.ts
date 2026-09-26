/**
 * Basic Monaco AI — follows racing line with skill-based speed, simple overtake offset.
 */
import * as THREE from 'three';
import { sampleTrack, type TrackData } from '../tracks/Track';
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
): AICar {
  const sample = sampleTrack(track.points, startS);
  // Offset laterally from center
  const lat = lateralBias * (sample.width * 0.28);
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
    mass: 800,
    maxPower: 680 + config.skill * 90,
    dragCd: 0.92,
    downforceCl: 3.0,
    wheelbase: 3.6,
  });

  const mesh = createCarMesh(getLivery(config.liveryId), { castShadow });
  mesh.name = `ai-${id}`;

  return {
    id,
    config,
    vehicle,
    mesh,
    physics,
    lineBias: lateralBias * 0.35,
    lookAhead: 14 + config.skill * 10,
  };
}

export function updateAICar(ai: AICar, track: TrackData, dt: number): void {
  const v = ai.vehicle;
  const skill = ai.config.skill;

  const targetS = v.distanceAlong + ai.lookAhead;
  const target = sampleTrack(track.points, targetS);
  const near = sampleTrack(track.points, v.distanceAlong + 4);

  // Desired point with line bias (racing line = slight inside on exits)
  const latOff = ai.lineBias * near.width * 0.4;
  const tx = target.x + Math.cos(target.yaw) * latOff;
  const tz = target.z - Math.sin(target.yaw) * latOff;

  const dx = tx - v.x;
  const dz = tz - v.z;
  const desiredYaw = Math.atan2(dx, dz);
  let yawErr = desiredYaw - v.yaw;
  while (yawErr > Math.PI) yawErr -= Math.PI * 2;
  while (yawErr < -Math.PI) yawErr += Math.PI * 2;

  const curv = curvatureAhead(track, v.distanceAlong, skill);
  // Target speed from curvature — skill raises ceiling
  const baseMax = 48 + skill * 22; // m/s ~170–250 km/h
  const cornerMax = Math.max(12, baseMax * (1 - Math.min(0.85, curv * 2.8)));
  const speed = Math.abs(v.speed);

  const input = emptyInput();
  // Steer — proportional with skill damping
  input.steer = Math.max(-1, Math.min(1, yawErr * (1.6 + skill * 0.8)));

  if (speed > cornerMax + 2) {
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

  // Track walls soft — keep on ribbon
  const half = near.width / 2;
  const latNow =
    (v.x - near.x) * Math.cos(near.yaw) - (v.z - near.z) * Math.sin(near.yaw);
  let wallHit = 0;
  if (Math.abs(latNow) > half + 0.6) {
    wallHit = Math.abs(latNow) - half;
    const side = Math.sign(latNow);
    v.x -= Math.cos(near.yaw) * side * wallHit * 0.4;
    v.z += Math.sin(near.yaw) * side * wallHit * 0.4;
    v.speed *= 0.92;
  }

  // DRS zone flag from track
  v.inDrsZone = track.drsZones.some((z) => {
    if (z.startS <= z.endS) return v.distanceAlong >= z.startS && v.distanceAlong <= z.endS;
    return v.distanceAlong >= z.startS || v.distanceAlong <= z.endS;
  });

  ai.physics.step(v, input, dt, wallHit);

  // Re-project s / elevation from position for lap consistency
  const projS = projectS(track, v.x, v.z, v.distanceAlong);
  v.distanceAlong = projS.s;
  v.y = projS.y;
  v.pitch = projS.pitch;

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
): { s: number; y: number; pitch: number } {
  // Lightweight local search around preferredS
  const total = track.length || 1;
  let bestDist = Infinity;
  let best = { s: preferredS, y: 0, pitch: 0 };
  const start = Math.max(0, preferredS - 40);
  const end = preferredS + 60;
  for (let s = start; s <= end; s += 3) {
    const ss = ((s % total) + total) % total;
    const p = sampleTrack(track.points, ss);
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < bestDist) {
      bestDist = d;
      best = { s: ss, y: p.y, pitch: p.pitch };
    }
  }
  return best;
}

/** Spawn 4 AI opponents with staggered grid slots */
export function createAIGrid(
  track: TrackData,
  playerLiveryId: string,
  weather: WeatherState,
  castShadow: boolean,
): AICar[] {
  const pool = [
    'mercedes',
    'mclaren',
    'redbull',
    'aston',
    'williams',
    'alpine',
    'haas',
    'audi',
  ].filter((id) => id !== playerLiveryId);

  const configs: AIDriverConfig[] = [
    { skill: 0.82, aggression: 0.55, liveryId: pool[0] ?? 'mercedes' },
    { skill: 0.68, aggression: 0.4, liveryId: pool[1] ?? 'mclaren' },
    { skill: 0.55, aggression: 0.35, liveryId: pool[2] ?? 'redbull' },
    { skill: 0.42, aggression: 0.25, liveryId: pool[3] ?? 'williams' },
  ];

  // Grid: player at s=5; AI behind on alternate sides
  return configs.map((cfg, i) =>
    createAICar(
      `ai${i}`,
      cfg,
      track,
      5 + (i + 1) * 8.5,
      i % 2 === 0 ? -0.85 : 0.85,
      weather,
      castShadow,
    ),
  );
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
