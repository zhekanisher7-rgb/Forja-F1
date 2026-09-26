/**
 * Stylized Suzuka Circuit — figure-8 arcade ribbon (~2.5–2.8 km compressed).
 * Dunlop crossover: upper deck ~y6 over lower ~y1.5 (same pattern as Monaco overpasses).
 */
import { buildCenterline, trackLength, type TrackData } from './Track';

const ROAD_WIDTH_SCALE = 3.6;

const RAW: { x: number; z: number; y?: number; width?: number }[] = [
  // Pit straight (east)
  { x: 0, z: 0, y: 0, width: 12 },
  { x: 60, z: 10, y: 0, width: 12 },
  { x: 120, z: 25, y: 0.2, width: 11 },
  // First corner → S curves (north)
  { x: 160, z: 60, y: 0.5, width: 10 },
  { x: 175, z: 110, y: 1.0, width: 9 },
  { x: 155, z: 155, y: 1.5, width: 9 },
  { x: 170, z: 200, y: 2.2, width: 9 },
  { x: 160, z: 245, y: 3.0, width: 9 },
  // Climb to Dunlop bridge (OVER crossover)
  { x: 130, z: 285, y: 4.2, width: 10 },
  { x: 90, z: 310, y: 5.5, width: 10 },
  { x: 40, z: 320, y: 6.2, width: 10 }, // crossover XZ ~ (40, 300) high
  { x: -10, z: 310, y: 5.8, width: 10 },
  // Degner
  { x: -50, z: 280, y: 4.5, width: 9 },
  { x: -70, z: 230, y: 3.2, width: 9 },
  { x: -65, z: 180, y: 2.2, width: 9 },
  // Hairpin (right)
  { x: -40, z: 145, y: 1.5, width: 8 },
  { x: 0, z: 130, y: 1.2, width: 8 },
  { x: 40, z: 140, y: 1.0, width: 8 },
  { x: 65, z: 175, y: 0.9, width: 9 },
  // Spoon (long left)
  { x: 80, z: 220, y: 0.8, width: 10 },
  { x: 70, z: 270, y: 0.7, width: 10 },
  { x: 35, z: 305, y: 0.6, width: 11 },
  { x: -15, z: 320, y: 0.5, width: 11 },
  { x: -65, z: 310, y: 0.4, width: 11 },
  // Back straight → 130R
  { x: -100, z: 270, y: 0.3, width: 12 },
  { x: -115, z: 210, y: 0.2, width: 12 },
  { x: -110, z: 140, y: 0.15, width: 12 },
  { x: -85, z: 80, y: 0.1, width: 11 },
  // 130R (fast left into Casio)
  { x: -40, z: 40, y: 0.1, width: 11 },
  { x: 10, z: 25, y: 0.2, width: 10 },
  // Casio triangle / chicane → under Dunlop (LOW at crossover)
  { x: 50, z: 40, y: 0.4, width: 9 },
  { x: 70, z: 80, y: 0.7, width: 9 },
  { x: 65, z: 140, y: 1.0, width: 9 },
  { x: 45, z: 210, y: 1.3, width: 9 },
  { x: 40, z: 280, y: 1.5, width: 10 }, // UNDER crossover (~y1.5 vs ~y6.2)
  { x: 55, z: 330, y: 1.4, width: 10 },
  { x: 90, z: 355, y: 1.0, width: 10 },
  { x: 140, z: 350, y: 0.6, width: 10 },
  // Run back to pit straight (south-east then west — clear of S-curves)
  { x: 180, z: 320, y: 0.3, width: 11 },
  { x: 200, z: 260, y: 0.2, width: 11 },
  { x: 195, z: 180, y: 0.1, width: 11 },
  { x: 170, z: 100, y: 0.05, width: 11 },
  { x: 120, z: 40, y: 0, width: 12 },
  { x: 60, z: 10, y: 0, width: 12 },
  { x: 0, z: 0, y: 0, width: 12 },
].map((p) => ({ ...p, width: (p.width ?? 10) * ROAD_WIDTH_SCALE }));

export function createSuzukaTrack(): TrackData {
  const points = buildCenterline(RAW);
  const length = trackLength(points);
  return {
    id: 'suzuka',
    name: 'Suzuka Circuit',
    nameRu: 'Сузука',
    length,
    points,
    drsZones: [
      { startS: length * 0.01, endS: length * 0.09 },
      { startS: length * 0.52, endS: length * 0.62 },
    ],
    gravel: [
      { x: -90, z: 200, w: 14, d: 10, rot: 0.3, y: 2.0 },
      { x: 100, z: 360, w: 12, d: 9, rot: -0.2, y: 1.0 },
      { x: 210, z: 220, w: 13, d: 10, rot: 0.15, y: 0.2 },
    ],
    startIndex: 0,
  };
}
