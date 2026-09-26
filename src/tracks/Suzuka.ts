/**
 * Stylized Suzuka Circuit — figure-8 arcade ribbon (~2.9 km compressed).
 *
 * Share XZ only at intentional bridges:
 *  - Dunlop portal (50,418): upper y8.0 / under y1.15 (ΔY≥6.8)
 *  - Return flyover over 130R near (36,−55): deck y7.0 / 130R y0.2 (ΔY≥6.5)
 *
 * Critical: flyover descent finishes to y≈0 on a south stub (x≈0, z≲−35)
 * BEFORE joining S/F — no coplanar stack on the outbound start ribbon
 * (that landing caused the striped asphalt z-fight at the junction).
 */
import { buildCenterline, trackLength, type TrackData } from './Track';

const ROAD_WIDTH_SCALE = 2.0;

const RAW: { x: number; z: number; y?: number; width?: number }[] = [
  // Pit / start — outbound east (keep z≥0 so south stub stays clear)
  { x: 0, z: 0, y: 0, width: 12 },
  { x: 100, z: 8, y: 0, width: 12 },
  { x: 180, z: 20, y: 0.1, width: 11 },
  // Esses NE
  { x: 245, z: 90, y: 0.55, width: 10 },
  { x: 270, z: 170, y: 1.3, width: 9 },
  { x: 250, z: 245, y: 2.2, width: 9 },
  { x: 260, z: 320, y: 3.5, width: 9 },
  { x: 225, z: 368, y: 4.8, width: 9 },
  // Dunlop OVER
  { x: 155, z: 395, y: 6.2, width: 10 },
  { x: 95, z: 412, y: 7.5, width: 10 },
  { x: 50, z: 418, y: 8.0, width: 10 },
  { x: -5, z: 395, y: 6.4, width: 10 },
  // Degner — north of Spoon
  { x: -40, z: 360, y: 4.5, width: 9 },
  { x: -70, z: 325, y: 3.4, width: 9 },
  { x: -30, z: 280, y: 2.6, width: 9 },
  { x: 40, z: 250, y: 2.0, width: 9 },
  { x: 120, z: 215, y: 1.5, width: 8 },
  // Hairpin SE
  { x: 145, z: 150, y: 1.15, width: 8 },
  { x: 120, z: 105, y: 1.0, width: 8 },
  { x: 55, z: 100, y: 0.95, width: 8 },
  { x: 10, z: 135, y: 0.9, width: 8 },
  // Spoon
  { x: -10, z: 170, y: 0.85, width: 9 },
  { x: -70, z: 175, y: 0.7, width: 10 },
  { x: -150, z: 145, y: 0.45, width: 11 },
  { x: -200, z: 85, y: 0.28, width: 11 },
  // Back straight
  { x: -210, z: 45, y: 0.18, width: 12 },
  { x: -195, z: -10, y: 0.12, width: 11 },
  // 130R — south of pit (z≈−55)
  { x: -140, z: -35, y: 0.1, width: 11 },
  { x: -70, z: -55, y: 0.12, width: 11 },
  { x: 10, z: -58, y: 0.18, width: 10 },
  { x: 100, z: -55, y: 0.22, width: 10 },
  { x: 185, z: -38, y: 0.28, width: 9 },
  { x: 260, z: -15, y: 0.35, width: 9 },
  // East underpass approach
  { x: 310, z: 10, y: 0.4, width: 9 },
  { x: 325, z: 95, y: 0.55, width: 9 },
  { x: 320, z: 210, y: 0.85, width: 9 },
  { x: 305, z: 330, y: 1.05, width: 9 },
  { x: 280, z: 400, y: 1.15, width: 9 },
  { x: 155, z: 430, y: 1.2, width: 10 },
  { x: 50, z: 418, y: 1.15, width: 10 }, // UNDER Dunlop
  { x: 105, z: 480, y: 0.85, width: 10 },
  { x: 190, z: 500, y: 0.45, width: 10 },
  // Outer east return
  { x: 315, z: 480, y: 0.28, width: 11 },
  { x: 420, z: 360, y: 0.18, width: 11 },
  { x: 440, z: 180, y: 0.1, width: 11 },
  { x: 415, z: 20, y: 0.06, width: 11 },
  { x: 350, z: -115, y: 0.04, width: 11 },
  // Deep south — climb to flyover
  { x: 220, z: -215, y: 0.02, width: 12 },
  { x: 100, z: -235, y: 0.02, width: 12 },
  { x: 25, z: -185, y: 0.25, width: 11 },
  { x: 35, z: -130, y: 1.4, width: 10 },
  { x: 40, z: -95, y: 4.2, width: 10 },
  { x: 38, z: -70, y: 6.6, width: 10 },
  { x: 36, z: -55, y: 7.0, width: 10 }, // OVER 130R
  // Stay elevated until north of 130R (z≳−28), then drop on south stub into S/F
  { x: 28, z: -32, y: 6.4, width: 10 },
  { x: 12, z: -26, y: 3.5, width: 10 },
  { x: 2, z: -30, y: 0.35, width: 11 },
  { x: 0, z: -18, y: 0.05, width: 12 },
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
      { x: 145, z: 520, w: 12, d: 9, rot: -0.2, y: 0.9 },
      { x: 405, z: 180, w: 13, d: 10, rot: 0.15, y: 0.2 },
    ],
    startIndex: 0,
  };
}
