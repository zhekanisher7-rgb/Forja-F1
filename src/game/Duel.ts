/**
 * 1-on-1 duels with in-game coin bets. Fictional drivers only.
 * Coefficient depends on opponent rating vs. the player's upgraded car.
 */
import type { AIDriverConfig } from '../ai/AIDriver';
import { averageLevel, type UpgradeLevels } from './Upgrades';

export interface DuelDriver {
  id: string;
  name: string;
  levelRu: string;
  /** 0..100 pace/skill rating */
  rating: number;
  liveryId: string;
}

/** Fictional names only — no real F1 drivers. */
export const DUEL_DRIVERS: readonly DuelDriver[] = [
  { id: 'd1', name: 'Тимур Ласточкин', levelRu: 'Новичок', rating: 15, liveryId: 'williams' },
  { id: 'd2', name: 'Марко Вентура', levelRu: 'Любитель', rating: 30, liveryId: 'haas' },
  { id: 'd3', name: 'Олег Бурцев', levelRu: 'Полупрофи', rating: 45, liveryId: 'alpine' },
  { id: 'd4', name: 'Лукас Ферро', levelRu: 'Профи', rating: 60, liveryId: 'aston' },
  { id: 'd5', name: 'Ян Штраль', levelRu: 'Эксперт', rating: 72, liveryId: 'mclaren' },
  { id: 'd6', name: 'Рафаэль Кортес', levelRu: 'Звезда', rating: 84, liveryId: 'mercedes' },
  { id: 'd7', name: 'Виктор Громов', levelRu: 'Чемпион мира', rating: 96, liveryId: 'redbull' },
] as const;

export const DUEL_LAP_OPTIONS = [1, 2, 3] as const;
export const DEFAULT_DUEL_LAPS = 2;

export const COEF_MIN = 1.1;
export const COEF_MAX = 6.0;
/** Rating spread of the logistic curve (bigger = flatter odds). */
const COEF_SPREAD = 16;
/** Bookmaker margin (<1 keeps expected value slightly negative). */
const COEF_MARGIN = 0.92;

export function getDuelDriver(id: string): DuelDriver | undefined {
  return DUEL_DRIVERS.find((d) => d.id === id);
}

/** Player car rating: 40 (stock) … 90 (all categories level 10). */
export function playerRating(levels: UpgradeLevels): number {
  return 40 + 5 * averageLevel(levels);
}

/** Estimated player win probability vs an opponent rating. */
export function winProbability(oppRating: number, playerR: number): number {
  return 1 / (1 + Math.exp((oppRating - playerR) / COEF_SPREAD));
}

/** Payout coefficient (rounded to 0.05, clamped 1.1 … 6.0). */
export function duelCoefficient(oppRating: number, levels: UpgradeLevels): number {
  const p = winProbability(oppRating, playerRating(levels));
  const raw = COEF_MARGIN / Math.max(1e-3, p);
  const c = Math.max(COEF_MIN, Math.min(COEF_MAX, raw));
  return Math.round(c * 20) / 20;
}

export function duelPayout(bet: number, coef: number): number {
  return Math.round(bet * coef);
}

/** Valid bet: integer 1..balance, else null. */
export function sanitizeBet(raw: unknown, balance: number): number | null {
  const v = Math.floor(Number(raw));
  if (!Number.isFinite(v) || v < 1 || v > balance) return null;
  return v;
}

/** AI config for a duel opponent — rating drives skill, target pace and power. */
export function duelAIConfig(d: DuelDriver): AIDriverConfig {
  const r = Math.max(0, Math.min(1, d.rating / 100));
  // All duel rivals run the no-TC chassis so pace scales smoothly with rating
  // (the default skill→assist mapping has a big TC cliff at skill 0.7).
  return {
    skill: 0.3 + 0.66 * r,
    aggression: 0.3 + 0.45 * r,
    liveryId: d.liveryId,
    paceMul: 0.8 + 0.36 * r,
    powerMul: 0.92 + 0.22 * r,
    physicsDifficulty: 'pro',
  };
}

/** Active duel context carried through a race. */
export interface DuelContext {
  driverId: string;
  bet: number;
  coef: number;
}
