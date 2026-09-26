/**
 * Stylized Suzuka Circuit — figure-8 arcade ribbon (~2.9 km compressed).
 * Two clear overpasses (ΔY≥5.5): Dunlop upper y7.2 / under y1.2; return
 * flyover y6.0 over 130R y0.25 near the south approach to start.
 * Plan lobes otherwise kept apart: Degner north of Spoon; underpass inland;
 * outer return far east; 130R mid-band south of pit.
 */
import { buildCenterline, trackLength, type TrackData } from './Track';

const ROAD_WIDTH_SCALE = 2.05;

const RAW: { x: number; z: number; y?: number; width?: number }[] = [
  // Pit / start
  { x: 0, z: 0, y: 0, width: 12 },
  { x: 100, z: 6, y: 0, width: 12 },
  { x: 180, z: 16, y: 0.1, width: 11 },
  // Esses NE
  { x: 245, z: 85, y: 0.55, width: 10 },
  { x: 270, z: 165, y: 1.3, width: 9 },
  { x: 250, z: 240, y: 2.2, width: 9 },
  { x: 260, z: 315, y: 3.4, width: 9 },
  { x: 225, z: 362, y: 4.5, width: 9 },
  // Dunlop OVER
  { x: 155, z: 390, y: 5.8, width: 10 },
  { x: 95, z: 410, y: 6.9, width: 10 },
  { x: 50, z: 418, y: 7.2, width: 10 },
  { x: -5, z: 392, y: 6.0, width: 10 },
  // Degner — north of Spoon
  { x: -40, z: 360, y: 4.5, width: 9 },
  { x: -70, z: 325, y: 3.4, width: 9 },
  { x: -30, z: 280, y: 2.7, width: 9 },
  { x: 40, z: 250, y: 2.1, width: 9 },
  { x: 120, z: 215, y: 1.6, width: 8 },
  // Hairpin SE
  { x: 145, z: 150, y: 1.2, width: 8 },
  { x: 120, z: 105, y: 1.05, width: 8 },
  { x: 55, z: 100, y: 1.0, width: 8 },
  { x: 10, z: 135, y: 0.95, width: 8 },
  // Spoon — west, south of Degner
  { x: -10, z: 170, y: 0.9, width: 9 },
  { x: -70, z: 175, y: 0.75, width: 10 },
  { x: -150, z: 145, y: 0.5, width: 11 },
  { x: -200, z: 85, y: 0.3, width: 11 },
  // Back straight
  { x: -210, z: 45, y: 0.2, width: 12 },
  { x: -195, z: -10, y: 0.12, width: 11 },
  // 130R — mid-band (z≈−50), south of pit
  { x: -140, z: -30, y: 0.1, width: 11 },
  { x: -70, z: -48, y: 0.12, width: 11 },
  { x: 10, z: -52, y: 0.18, width: 10 },
  { x: 100, z: -50, y: 0.25, width: 10 },
  { x: 185, z: -35, y: 0.3, width: 9 },
  { x: 260, z: -15, y: 0.35, width: 9 },
  // East underpass approach — inland; outer return x≳410
  { x: 310, z: 5, y: 0.4, width: 9 },
  { x: 325, z: 90, y: 0.55, width: 9 },
  { x: 320, z: 200, y: 0.85, width: 9 },
  { x: 305, z: 320, y: 1.05, width: 9 },
  { x: 285, z: 395, y: 1.15, width: 9 },
  { x: 155, z: 422, y: 1.2, width: 10 },
  { x: 50, z: 418, y: 1.2, width: 10 }, // UNDER Dunlop
  { x: 105, z: 475, y: 0.9, width: 10 },
  { x: 190, z: 495, y: 0.5, width: 10 },
  // Outer east return
  { x: 310, z: 475, y: 0.3, width: 11 },
  { x: 415, z: 360, y: 0.2, width: 11 },
  { x: 435, z: 185, y: 0.12, width: 11 },
  { x: 410, z: 25, y: 0.08, width: 11 },
  { x: 345, z: -110, y: 0.05, width: 11 },
  // Deep south — then climb OVER 130R into start
  { x: 220, z: -210, y: 0.03, width: 12 },
  { x: 100, z: -230, y: 0.02, width: 12 },
  { x: 30, z: -180, y: 0.3, width: 11 },
  { x: 40, z: -130, y: 1.2, width: 10 },
  { x: 42, z: -95, y: 4.0, width: 10 },
  { x: 40, z: -70, y: 6.4, width: 10 },
  { x: 36, z: -48, y: 6.6, width: 10 }, // OVER 130R deck (ΔY≥6)
  { x: 30, z: -28, y: 6.2, width: 10 },
  { x: 22, z: -12, y: 3.2, width: 11 },
  { x: 10, z: -3, y: 0.6, width: 12 },
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
      { x: -215, z: 80, w: 14, d: 10, rot: 0.3, y: 1.2 },
      { x: 145, z: 505, w: 12, d: 9, rot: -0.2, y: 0.9 },
      { x: 400, z: 185, w: 13, d: 10, rot: 0.15, y: 0.2 },
    ],
    startIndex: 0,
  };
}
