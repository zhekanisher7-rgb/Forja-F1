/**
 * Stylized Suzuka Circuit — figure-8 arcade ribbon (~2.8 km compressed).
 * Dunlop: upper y6.6 / lower y1.35. Wide ribbons kept apart in XZ except the
 * intentional overpass (ΔY≥5). Degner north of Spoon; underpass inland;
 * outer return far east.
 */
import { buildCenterline, trackLength, type TrackData } from './Track';

const ROAD_WIDTH_SCALE = 2.15;

const RAW: { x: number; z: number; y?: number; width?: number }[] = [
  { x: 0, z: 0, y: 0, width: 12 },
  { x: 100, z: 5, y: 0, width: 12 },
  { x: 170, z: 15, y: 0.1, width: 11 },
  // Esses NE
  { x: 230, z: 85, y: 0.55, width: 10 },
  { x: 250, z: 160, y: 1.3, width: 9 },
  { x: 230, z: 230, y: 2.2, width: 9 },
  { x: 245, z: 300, y: 3.2, width: 9 },
  { x: 210, z: 350, y: 4.2, width: 9 },
  // Dunlop OVER
  { x: 150, z: 375, y: 5.4, width: 10 },
  { x: 95, z: 395, y: 6.3, width: 10 },
  { x: 50, z: 400, y: 6.6, width: 10 },
  { x: 0, z: 375, y: 5.6, width: 10 },
  // Degner swings EAST of Spoon then into hairpin
  { x: -30, z: 350, y: 4.3, width: 9 },
  { x: -55, z: 320, y: 3.3, width: 9 },
  { x: -20, z: 280, y: 2.6, width: 9 },
  { x: 40, z: 255, y: 2.1, width: 9 },
  { x: 115, z: 220, y: 1.6, width: 8 },
  // Hairpin (south-east)
  { x: 130, z: 160, y: 1.2, width: 8 },
  { x: 110, z: 115, y: 1.05, width: 8 },
  { x: 60, z: 110, y: 1.0, width: 8 },
  { x: 25, z: 140, y: 0.95, width: 8 },
  // Spoon — west from hairpin exit, south of Degner
  { x: 10, z: 170, y: 0.9, width: 9 },
  { x: -50, z: 175, y: 0.75, width: 10 },
  { x: -130, z: 150, y: 0.5, width: 11 },
  { x: -185, z: 95, y: 0.3, width: 11 },
  // Back straight
  { x: -190, z: 70, y: 0.2, width: 12 },
  { x: -175, z: 0, y: 0.12, width: 11 },
  // 130R — stay west (x≲20) until past return climb, then east
  { x: -130, z: -5, y: 0.1, width: 11 },
  { x: -70, z: -40, y: 0.12, width: 11 },
  { x: -10, z: -50, y: 0.18, width: 10 },
  { x: 80, z: -45, y: 0.25, width: 10 },
  { x: 170, z: -25, y: 0.3, width: 9 },
  { x: 250, z: -15, y: 0.35, width: 9 },
  // East underpass approach — cut west only at Dunlop latitude (z≳380)
  { x: 300, z: -30, y: 0.4, width: 9 },
  { x: 315, z: 70, y: 0.55, width: 9 },
  { x: 310, z: 180, y: 0.8, width: 9 },
  { x: 300, z: 300, y: 1.05, width: 9 },
  { x: 285, z: 380, y: 1.25, width: 9 },
  { x: 150, z: 405, y: 1.35, width: 10 },
  { x: 50, z: 400, y: 1.35, width: 10 }, // UNDER Dunlop
  { x: 95, z: 450, y: 1.0, width: 10 },
  { x: 170, z: 470, y: 0.55, width: 10 },
  // Outer east return (x≳370 — outside underpass approach)
  { x: 280, z: 450, y: 0.3, width: 11 },
  { x: 380, z: 350, y: 0.2, width: 11 },
  { x: 400, z: 190, y: 0.12, width: 11 },
  { x: 370, z: 40, y: 0.08, width: 11 },
  { x: 310, z: -90, y: 0.05, width: 11 },
  { x: 200, z: -185, y: 0.03, width: 12 },
  { x: 110, z: -200, y: 0.02, width: 12 },
  { x: 55, z: -165, y: 0.015, width: 12 },
  { x: 45, z: -110, y: 0.01, width: 11 },
  { x: 40, z: -55, y: 0.005, width: 11 },
  { x: 25, z: -15, y: 0.002, width: 12 },
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
      { x: -195, z: 90, w: 14, d: 10, rot: 0.3, y: 1.2 },
      { x: 130, z: 480, w: 12, d: 9, rot: -0.2, y: 0.9 },
      { x: 365, z: 190, w: 13, d: 10, rot: 0.15, y: 0.2 },
    ],
    startIndex: 0,
  };
}
