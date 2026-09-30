/**
 * Career state: coin balance + upgrade levels, persisted in localStorage.
 * Also race tiers (city / regional / international) and coin reward math.
 * Coins are in-game only — no real money anywhere.
 */
import type { AIFieldProfile } from '../ai/AIDriver';
import {
  UPGRADE_IDS,
  createEmptyLevels,
  clampLevel,
  nextUpgradeCost,
  type UpgradeId,
  type UpgradeLevels,
} from './Upgrades';

export const CAREER_KEY = 'forja-f1-career';
export const CAREER_VERSION = 1;
/** Enough for ~2-3 first upgrades (60 / 90) or a small first duel bet. */
export const STARTING_COINS = 250;

export interface CareerStats {
  races: number;
  wins: number;
  podiums: number;
  duelsWon: number;
  duelsLost: number;
  coinsEarned: number;
}

export interface CareerState {
  v: number;
  coins: number;
  levels: UpgradeLevels;
  stats: CareerStats;
}

function emptyStats(): CareerStats {
  return { races: 0, wins: 0, podiums: 0, duelsWon: 0, duelsLost: 0, coinsEarned: 0 };
}

export function createCareer(): CareerState {
  return { v: CAREER_VERSION, coins: STARTING_COINS, levels: createEmptyLevels(), stats: emptyStats() };
}

function nonNegInt(n: unknown, fallback = 0): number {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

/** Tolerant parse: bad / missing fields fall back to defaults; never throws. */
export function parseCareer(raw: string | null): CareerState {
  if (!raw) return createCareer();
  try {
    const d = JSON.parse(raw) as Partial<CareerState> | null;
    if (!d || typeof d !== 'object') return createCareer();
    const levels = createEmptyLevels();
    const src = (d.levels ?? {}) as Partial<Record<UpgradeId, unknown>>;
    for (const id of UPGRADE_IDS) levels[id] = clampLevel(src[id]);
    const st = (d.stats ?? {}) as Partial<Record<keyof CareerStats, unknown>>;
    const stats = emptyStats();
    for (const k of Object.keys(stats) as (keyof CareerStats)[]) stats[k] = nonNegInt(st[k]);
    // Future versions: migrate here based on d.v
    return {
      v: CAREER_VERSION,
      coins: nonNegInt(d.coins, STARTING_COINS),
      levels,
      stats,
    };
  } catch {
    return createCareer();
  }
}

export function loadCareer(): CareerState {
  try {
    return parseCareer(localStorage.getItem(CAREER_KEY));
  } catch {
    return createCareer();
  }
}

export function saveCareer(c: CareerState): void {
  try {
    localStorage.setItem(CAREER_KEY, JSON.stringify(c));
  } catch {
    /* storage full / disabled — ignore */
  }
}

/** Try to buy the next level. Returns true on success (mutates + does NOT save). */
export function tryUpgrade(c: CareerState, id: UpgradeId): boolean {
  const cost = nextUpgradeCost(c.levels[id]);
  if (cost === null || c.coins < cost) return false;
  c.coins -= cost;
  c.levels[id] = clampLevel(c.levels[id] + 1);
  return true;
}

// ---------------------------------------------------------------- Tiers

export type RaceTier = 'city' | 'regional' | 'international';
export const RACE_TIERS: readonly RaceTier[] = ['city', 'regional', 'international'] as const;

export interface TierDef {
  id: RaceTier;
  nameRu: string;
  descRu: string;
  coinMul: number;
  ai: AIFieldProfile;
}

/**
 * AI field strength per tier. Regional ≈ the original Quick Race field
 * (skill 0.40–0.88, pace ×1). International is tuned to roughly a max-upgraded car.
 */
export const TIERS: Record<RaceTier, TierDef> = {
  city: {
    id: 'city',
    nameRu: 'Городские',
    descRu: 'Слабые соперники',
    coinMul: 1,
    ai: { skillMin: 0.25, skillMax: 0.6, paceMul: 0.9, powerMul: 0.94, aggressionMul: 0.7 },
  },
  regional: {
    id: 'regional',
    nameRu: 'Региональные',
    descRu: 'Средний уровень',
    coinMul: 1.5,
    ai: { skillMin: 0.4, skillMax: 0.88, paceMul: 1.0, powerMul: 1.0, aggressionMul: 1.0 },
  },
  international: {
    id: 'international',
    nameRu: 'Международные',
    descRu: 'Сильнейшие пилоты',
    coinMul: 3,
    ai: { skillMin: 0.72, skillMax: 0.98, paceMul: 1.14, powerMul: 1.12, aggressionMul: 1.3 },
  },
};

export function isRaceTier(x: unknown): x is RaceTier {
  return typeof x === 'string' && (RACE_TIERS as readonly string[]).includes(x);
}

// ---------------------------------------------------------------- Rewards

/** City (×1) coins by finishing position P1..P17 (index 0 = winner). */
export const POSITION_COINS: readonly number[] = [
  250, 200, 170, 145, 125, 110, 95, 85, 75, 65, 58, 52, 47, 43, 40, 38, 36,
];
/** Minimum coins for any classified finish. */
export const FINISH_COINS = 30;

/** Bigger fields pay a bit more: 4 opp ×0.9, 8 ×1.0, 12 ×1.1, 16 ×1.2. */
export function fieldMultiplier(opponents: number): number {
  const n = Math.max(0, Math.min(16, opponents));
  return 0.8 + n * 0.025;
}

/** Longer races pay more: 1 lap ×0.67, 2 ×0.83, 3 ×1.0, 5 ×1.33, 8 ×1.8. */
export function lapMultiplier(laps: number): number {
  return Math.max(0.6, Math.min(1.8, 0.5 + laps / 6));
}

export interface RaceReward {
  /** Position reward before tier multiplier (includes field/lap scaling). */
  base: number;
  tierMul: number;
  total: number;
}

export function computeRaceReward(
  position: number,
  fieldSize: number,
  laps: number,
  tier: RaceTier,
  disqualified: boolean,
): RaceReward {
  const tierMul = TIERS[tier].coinMul;
  if (disqualified || position < 1) return { base: 0, tierMul, total: 0 };
  const posCoins = Math.max(FINISH_COINS, POSITION_COINS[position - 1] ?? FINISH_COINS);
  const base = Math.round(posCoins * fieldMultiplier(fieldSize - 1) * lapMultiplier(laps));
  return { base, tierMul, total: Math.round(base * tierMul) };
}

/** Credit a finished career race; returns coins added (already saved). */
export function applyRaceReward(
  c: CareerState,
  reward: RaceReward,
  position: number,
  disqualified: boolean,
): number {
  c.stats.races += 1;
  if (!disqualified) {
    if (position === 1) c.stats.wins += 1;
    if (position <= 3) c.stats.podiums += 1;
  }
  c.coins += reward.total;
  c.stats.coinsEarned += reward.total;
  saveCareer(c);
  return reward.total;
}
