/**
 * Garage upgrades — 6 categories × levels 0..10.
 * Pure data + math (no DOM) so it can be sanity-checked headless.
 * Bonuses apply to the PLAYER car only (AI pace comes from tier / duel rating).
 */
import { PLAYER_VEHICLE_SPEC } from '../physics/VehiclePhysics';

export type UpgradeId = 'brakes' | 'tyres' | 'fuel' | 'engine' | 'ers' | 'aero';

export const UPGRADE_IDS: readonly UpgradeId[] = [
  'brakes',
  'tyres',
  'fuel',
  'engine',
  'ers',
  'aero',
] as const;

export const MAX_UPGRADE_LEVEL = 10;

export type UpgradeLevels = Record<UpgradeId, number>;

export interface UpgradeDef {
  id: UpgradeId;
  nameRu: string;
  icon: string;
  /** Short description of what the category improves. */
  descRu: string;
}

export const UPGRADE_DEFS: Record<UpgradeId, UpgradeDef> = {
  brakes: { id: 'brakes', nameRu: 'Тормоза', icon: '🛑', descRu: 'Сила торможения' },
  tyres: { id: 'tyres', nameRu: 'Шины', icon: '🛞', descRu: 'Сцепление в поворотах и на торможении' },
  fuel: { id: 'fuel', nameRu: 'Топливный бак', icon: '⛽', descRu: 'Запас хода (ниже расход)' },
  engine: { id: 'engine', nameRu: 'Двигатель', icon: '⚙️', descRu: 'Мощность и макс. скорость' },
  ers: { id: 'ers', nameRu: 'Форсаж ERS', icon: '⚡', descRu: 'Мощность, ёмкость и зарядка ERS' },
  aero: { id: 'aero', nameRu: 'Аэродинамика', icon: '🪽', descRu: 'Прижимная сила и меньше сопротивление' },
};

/**
 * Bonus at level 10 (linear per level). Tuned modest so the car stays controllable.
 *  brakes  +18% max brake force
 *  tyres   +12% grip (lateral + braking + traction limit)
 *  fuel    −25% fuel burn (≈ +33% range)
 *  engine  +15% ICE power (≈ +5% top speed)
 *  ers     +20% deploy kW, +20% capacity (slower drain), +30% recharge
 *  aero    +15% downforce Cl, −6% drag Cd
 */
export const MAX_BONUS = {
  brakeForce: 0.18,
  grip: 0.12,
  fuelBurnCut: 0.25,
  enginePower: 0.15,
  ersPower: 0.2,
  ersCapacity: 0.2,
  ersRecharge: 0.3,
  downforce: 0.15,
  dragCut: 0.06,
} as const;

/** Cost to buy level L (1..10). Escalating: cheap first step, expensive last. */
export const UPGRADE_COSTS: readonly number[] = [60, 90, 140, 190, 260, 340, 430, 540, 660, 820];

export function createEmptyLevels(): UpgradeLevels {
  return { brakes: 0, tyres: 0, fuel: 0, engine: 0, ers: 0, aero: 0 };
}

export function clampLevel(n: unknown): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(MAX_UPGRADE_LEVEL, v));
}

/** Price for the NEXT level from `currentLevel`, or null when maxed. */
export function nextUpgradeCost(currentLevel: number): number | null {
  const l = clampLevel(currentLevel);
  if (l >= MAX_UPGRADE_LEVEL) return null;
  return UPGRADE_COSTS[l];
}

/** Coins to max one category from 0. */
export function totalCategoryCost(): number {
  return UPGRADE_COSTS.reduce((a, b) => a + b, 0);
}

/** Coins to max every category from 0. */
export function totalMaxOutCost(): number {
  return totalCategoryCost() * UPGRADE_IDS.length;
}

/** Average level 0..10 across categories (car strength for duels). */
export function averageLevel(levels: UpgradeLevels): number {
  let sum = 0;
  for (const id of UPGRADE_IDS) sum += clampLevel(levels[id]);
  return sum / UPGRADE_IDS.length;
}

export interface UpgradeModifiers {
  brakeMul: number;
  gripMul: number;
  fuelBurnMul: number;
  powerMul: number;
  ersPowerMul: number;
  /** ERS drain multiplier (<1 = bigger battery) */
  ersDrainMul: number;
  ersRegenMul: number;
  downforceMul: number;
  dragMul: number;
}

export function computeModifiers(levels: UpgradeLevels): UpgradeModifiers {
  const f = (id: UpgradeId) => clampLevel(levels[id]) / MAX_UPGRADE_LEVEL;
  const b = MAX_BONUS;
  return {
    brakeMul: 1 + b.brakeForce * f('brakes'),
    gripMul: 1 + b.grip * f('tyres'),
    fuelBurnMul: 1 - b.fuelBurnCut * f('fuel'),
    powerMul: 1 + b.enginePower * f('engine'),
    ersPowerMul: 1 + b.ersPower * f('ers'),
    ersDrainMul: 1 / (1 + b.ersCapacity * f('ers')),
    ersRegenMul: 1 + b.ersRecharge * f('ers'),
    downforceMul: 1 + b.downforce * f('aero'),
    dragMul: 1 - b.dragCut * f('aero'),
  };
}

/** Physics-facing spec for the player car after upgrades. */
export interface UpgradedSpec {
  mass: number;
  maxPower: number;
  ersBoostKw: number;
  dragCd: number;
  downforceCl: number;
  wheelbase: number;
  topSpeedKmh: number;
  gripMul: number;
  brakeMul: number;
  fuelBurnMul: number;
  ersDrainMul: number;
  ersRegenMul: number;
}

export function upgradedSpec(levels: UpgradeLevels): UpgradedSpec {
  const m = computeModifiers(levels);
  const s = PLAYER_VEHICLE_SPEC;
  // Top speed ~ cbrt(P / Cd) (drag-limited)
  const topMul = Math.cbrt(m.powerMul / m.dragMul);
  return {
    mass: s.mass,
    maxPower: s.maxPower * m.powerMul,
    ersBoostKw: s.ersBoostKw * m.ersPowerMul,
    dragCd: s.dragCd * m.dragMul,
    downforceCl: s.downforceCl * m.downforceMul,
    wheelbase: s.wheelbase,
    topSpeedKmh: s.topSpeedKmh * topMul,
    gripMul: m.gripMul,
    brakeMul: m.brakeMul,
    fuelBurnMul: m.fuelBurnMul,
    ersDrainMul: m.ersDrainMul,
    ersRegenMul: m.ersRegenMul,
  };
}

/** Human-readable bonus for a category at a level (Russian UI). */
export function bonusText(id: UpgradeId, level: number): string {
  const f = clampLevel(level) / MAX_UPGRADE_LEVEL;
  const pct = (x: number) => `${Math.round(x * f * 100)}%`;
  const b = MAX_BONUS;
  const s = PLAYER_VEHICLE_SPEC;
  switch (id) {
    case 'brakes':
      return `+${pct(b.brakeForce)} сила торможения`;
    case 'tyres':
      return `+${pct(b.grip)} сцепление`;
    case 'fuel':
      return `−${pct(b.fuelBurnCut)} расход топлива`;
    case 'engine':
      return `+${pct(b.enginePower)} мощность (${Math.round(s.maxPower * (1 + b.enginePower * f))} кВт)`;
    case 'ers':
      return `+${pct(b.ersPower)} мощность ERS (${Math.round(s.ersBoostKw * (1 + b.ersPower * f))} кВт), +${pct(b.ersCapacity)} ёмкость, +${pct(b.ersRecharge)} зарядка`;
    case 'aero':
      return `+${pct(b.downforce)} прижим, −${pct(b.dragCut)} сопротивление`;
  }
}
