import type { InputState } from '../input/InputManager';
import { type TireState, tireGrip, updateTires, createTires, type TireCompound } from './TireModel';
import type { WeatherState } from './Weather';

export type Difficulty = 'rookie' | 'amateur' | 'pro' | 'sim';

export interface Assists {
  abs: boolean;
  tc: boolean;
  racingLine: boolean;
}

export function assistsFor(diff: Difficulty): Assists {
  switch (diff) {
    case 'rookie':
      return { abs: true, tc: true, racingLine: true };
    case 'amateur':
      return { abs: true, tc: true, racingLine: false };
    case 'pro':
      return { abs: true, tc: false, racingLine: false };
    case 'sim':
      return { abs: false, tc: false, racingLine: false };
  }
}

export interface VehicleState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  speed: number; // m/s
  angularVel: number;
  gear: number; // -1 reverse, 0 N, 1..8
  rpm: number;
  fuel: number; // 0..1
  ers: number; // 0..1
  drsOpen: boolean;
  inDrsZone: boolean;
  tires: TireState;
  damage: number; // 0..1
  wheelLock: boolean;
  lap: number;
  distanceAlong: number; // track progress meters
  finished: boolean;
  /** Race clock ms when this car completed the race; unset while racing. */
  finishTimeMs: number;
  bestLapMs: number;
  currentLapMs: number;
  lastLapMs: number;
  sectorTimes: number[];
}

export interface PhysicsConfig {
  difficulty: Difficulty;
  weather: WeatherState;
  mass: number;
  maxPower: number; // kW peak
  dragCd: number;
  downforceCl: number;
  wheelbase: number;
}

/** Shared player chassis — identical in Quick Race and Time Trial (AI must not alter these). */
export const PLAYER_VEHICLE_SPEC = {
  mass: 620,
  maxPower: 980, // kW peak
  dragCd: 0.88,
  downforceCl: 3.0,
  wheelbase: 3.6,
} as const;

/** Arcade yaw blend toward limited steer rate (same in every mode). */
export const PLAYER_STEER_YAW_SMOOTH = {
  keep: 0.58,
  apply: 0.42,
} as const;

const GEAR_RATIOS = [0, 3.2, 2.4, 1.9, 1.55, 1.3, 1.12, 0.98, 0.88];
const FINAL_DRIVE = 3.4;
const MAX_RPM = 15000;
const IDLE_RPM = 4000;

export function createVehicleState(
  x: number,
  z: number,
  yaw: number,
  compound: TireCompound = 'slick',
): VehicleState {
  return {
    x,
    y: 0,
    z,
    yaw,
    pitch: 0,
    speed: 0,
    angularVel: 0,
    gear: 1,
    rpm: IDLE_RPM,
    fuel: 1,
    ers: 1,
    drsOpen: false,
    inDrsZone: false,
    tires: createTires(compound),
    damage: 0,
    wheelLock: false,
    lap: 1,
    distanceAlong: 0,
    finished: false,
    finishTimeMs: 0,
    bestLapMs: 0,
    currentLapMs: 0,
    lastLapMs: 0,
    sectorTimes: [],
  };
}

export class VehiclePhysics {
  cfg: PhysicsConfig;
  assists: Assists;

  constructor(cfg: PhysicsConfig) {
    this.cfg = cfg;
    this.assists = assistsFor(cfg.difficulty);
  }

  setDifficulty(d: Difficulty): void {
    this.cfg.difficulty = d;
    this.assists = assistsFor(d);
  }

  step(state: VehicleState, input: InputState, dt: number, wallHit: number): void {
    if (state.finished) return;

    // Damage from hits
    if (wallHit > 0) {
      const impact = Math.min(1, wallHit * (Math.abs(state.speed) / 40));
      state.damage = Math.min(1, state.damage + impact * 0.08);
      state.speed *= 1 - impact * 0.35;
    }

    const damageMul = 1 - state.damage * 0.45;
    const surfaceWet = this.cfg.weather.type === 'wet' ? 1 : 0;
    const grip = tireGrip(state.tires, surfaceWet) * this.cfg.weather.gripMultiplier * damageMul;

    // DRS
    state.drsOpen = input.drs && state.inDrsZone && state.speed > 15;
    const drsDragMul = state.drsOpen ? 0.72 : 1;
    const drsDownforceMul = state.drsOpen ? 0.85 : 1;

    // ERS boost (disabled when out of fuel — no drive force at all)
    let ersBoost = 0;
    if (state.fuel > 0 && input.ers && state.ers > 0.01 && state.speed > 5) {
      ersBoost = 120; // kW extra
      state.ers = Math.max(0, state.ers - 0.12 * dt);
    } else if (state.speed > 20 && input.brake > 0.3) {
      // regen
      state.ers = Math.min(1, state.ers + 0.04 * dt * input.brake);
    } else {
      state.ers = Math.min(1, state.ers + 0.008 * dt);
    }

    // Gears / reverse
    if (input.reverse && state.speed < 2) {
      state.gear = -1;
    } else if (state.gear === -1 && input.throttle > 0.1 && !input.reverse) {
      state.gear = 1;
    }

    // Auto shift (up/down)
    if (state.gear >= 1) {
      if (state.rpm > MAX_RPM - 800 && state.gear < 8) state.gear++;
      if (state.rpm < 7500 && state.gear > 1 && input.throttle < 0.9) state.gear--;
    }

    // Engine force — cut completely when out of fuel (coast / brake only)
    const outOfFuel = state.fuel <= 0;
    const ratio = state.gear === -1 ? -2.8 : GEAR_RATIOS[state.gear] * FINAL_DRIVE;
    const wheelRadius = 0.33;
    let powerKw = outOfFuel
      ? 0
      : this.cfg.maxPower * damageMul * (0.85 + 0.15 * state.fuel);
    if (!outOfFuel) powerKw += ersBoost;
    const throttle = outOfFuel ? 0 : input.throttle;

    // Traction control softens wheelspin
    let driveForce = 0;
    if (!outOfFuel && Math.abs(ratio) > 0.01) {
      const omega = (state.rpm / 60) * Math.PI * 2;
      const idealSpeed = (omega / Math.abs(ratio)) * wheelRadius * Math.sign(ratio || 1);
      void idealSpeed;
      const torque = (powerKw * 1000) / Math.max(400, state.rpm * Math.PI * 2 / 60);
      driveForce = (torque * Math.abs(ratio) * throttle) / wheelRadius;
      if (state.gear === -1) driveForce = -Math.abs(driveForce) * 0.4;
      // TC: limit excess force vs grip
      const maxDrive = grip * this.cfg.mass * 9.81 * 0.55;
      if (this.assists.tc && driveForce > maxDrive) driveForce = maxDrive;
      else if (!this.assists.tc && driveForce > maxDrive * 1.35) {
        // wheelspin — lose some
        driveForce *= 0.55;
      }
    }

    // Brakes
    let brakeForce = 0;
    const mainBrake = input.brake;
    const engBrake = input.engineBrake * 0.25;
    const maxBrake = this.cfg.mass * 9.81 * grip * 1.4;
    brakeForce = (mainBrake + engBrake) * maxBrake;
    state.wheelLock = false;
    if (mainBrake > 0.85 && !this.assists.abs && state.speed > 8) {
      // lock risk
      if (mainBrake * state.speed > grip * 55) {
        state.wheelLock = true;
        brakeForce *= 0.45; // locked wheels = less stopping, more slide
      }
    } else if (this.assists.abs && brakeForce > maxBrake * 0.92) {
      brakeForce = maxBrake * 0.92;
    }

    // Aero
    const v = state.speed;
    const v2 = v * v;
    const downforce = 0.5 * 1.225 * this.cfg.downforceCl * drsDownforceMul * v2;
    const drag = 0.5 * 1.225 * this.cfg.dragCd * drsDragMul * v2 * Math.sign(v || 1);
    const rolling = 80 * Math.sign(v || 0);

    const longForce = driveForce - brakeForce * Math.sign(v || 1) - drag - rolling;
    const accel = longForce / this.cfg.mass;
    state.speed += accel * dt;

    // Clamp tiny
    if (Math.abs(state.speed) < 0.05 && mainBrake > 0.1) state.speed = 0;
    if (state.gear !== -1 && state.speed < -0.5) state.speed = 0;

    // Steering — arcade: responsive but not twitchy (A left / D right).
    // Wider track needs enough turn-in at mid speed without high-speed snap.
    const maxSteer = 0.56 / (1 + Math.abs(state.speed) / 38);
    const steerAngle = input.steer * maxSteer;
    const latGripBudget = grip * (1 + downforce / (this.cfg.mass * 9.81)) * 0.95;
    const yawRate = (state.speed / Math.max(0.1, this.cfg.wheelbase)) * Math.tan(steerAngle);
    // Limit by grip
    const maxYaw = latGripBudget * 9.81 / Math.max(1, Math.abs(state.speed));
    const limitedYaw = Math.max(-maxYaw, Math.min(maxYaw, yawRate));
    if (state.wheelLock) {
      state.angularVel = state.angularVel * 0.95 + limitedYaw * 0.25;
    } else {
      // Shared PLAYER_STEER_YAW_SMOOTH — identical Quick Race / Time Trial feel
      const { keep, apply } = PLAYER_STEER_YAW_SMOOTH;
      state.angularVel = state.angularVel * keep + limitedYaw * apply;
    }
    state.yaw += state.angularVel * dt;

    // Integrate position
    state.x += Math.sin(state.yaw) * state.speed * dt;
    state.z += Math.cos(state.yaw) * state.speed * dt;

    // RPM estimate
    if (state.gear === 0) {
      state.rpm = IDLE_RPM + throttle * 2000;
    } else {
      const r = state.gear === -1 ? 2.8 : GEAR_RATIOS[state.gear] * FINAL_DRIVE;
      state.rpm = Math.abs(state.speed) / wheelRadius * Math.abs(r) * 60 / (Math.PI * 2);
      state.rpm = Math.max(IDLE_RPM * 0.7, Math.min(MAX_RPM, state.rpm));
    }

    // Fuel burn — balanced so 2–3 lap Monaco does not empty instantly.
    // Full throttle ≈ 0.0028/s → ~6 min tank; typical race pace lasts 3+ laps.
    if (!outOfFuel) {
      const burn =
        (0.00055 + input.throttle * 0.00225 + (ersBoost > 0 ? 0.0004 : 0)) * dt;
      state.fuel = Math.max(0, state.fuel - burn);
    } else {
      state.fuel = 0;
    }

    const latLoad = Math.min(1, Math.abs(state.angularVel * state.speed) / 25);
    updateTires(state.tires, latLoad, Math.abs(state.speed), dt, state.wheelLock || mainBrake > 0.8);

    state.currentLapMs += dt * 1000;
  }
}

export function speedKmh(state: VehicleState): number {
  return Math.abs(state.speed) * 3.6;
}
