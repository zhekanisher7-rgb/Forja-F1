export type TireCompound = 'slick' | 'inter' | 'wet';

export interface TireState {
  compound: TireCompound;
  wear: number; // 0..1 (1 = dead)
  temperature: number; // 0..1
}

export function createTires(compound: TireCompound = 'slick'): TireState {
  return { compound, wear: 0, temperature: 0.55 };
}

/** Peak lateral grip coefficient by compound × surface wetness (0 dry .. 1 wet) */
export function tireGrip(tires: TireState, surfaceWet: number): number {
  const wearPenalty = 1 - tires.wear * 0.45;
  const tempFactor = 0.75 + 0.25 * (1 - Math.abs(tires.temperature - 0.7) * 2);
  let base: number;
  switch (tires.compound) {
    case 'slick':
      base = 1.35 * (1 - surfaceWet * 0.75);
      break;
    case 'inter':
      base = 1.05 * (0.55 + surfaceWet * 0.4);
      break;
    case 'wet':
      base = 0.95 * (0.35 + surfaceWet * 0.65);
      break;
  }
  return Math.max(0.25, base * wearPenalty * tempFactor);
}

export function updateTires(
  tires: TireState,
  lateralLoad: number,
  speed: number,
  dt: number,
  brakingHard: boolean,
): void {
  const wearRate = (0.0008 + lateralLoad * 0.0025 + (brakingHard ? 0.0015 : 0)) * (speed / 80);
  tires.wear = Math.min(1, tires.wear + wearRate * dt);
  const targetTemp = 0.4 + Math.min(0.5, (lateralLoad + speed / 120) * 0.35);
  tires.temperature += (targetTemp - tires.temperature) * Math.min(1, dt * 0.8);
}
