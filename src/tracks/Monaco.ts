/**
 * Stylized Circuit de Monaco — recognizable flow, not survey-accurate.
 * Scale ~1 unit = 1 meter. Loop ~2500m (compressed for arcade feel).
 *
 * Elevations (Y) separate the two plan-view crossings:
 *  1) Beau Rivage climb OVER Portier (Casino height vs harbor drop)
 *  2) Swimming Pool OVER start/finish straight (clear overpass)
 * Barriers / asphalt follow centerline Y so nothing coplanar-collides.
 */
import { buildCenterline, trackLength, type TrackData } from './Track';

const ROAD_WIDTH_SCALE = 1.65;

/** Handcrafted centerline approximating Monaco with vertical profile */
const RAW: { x: number; z: number; y?: number; width?: number }[] = [
  // Start/finish straight (under swimming-pool bridge later) — sea level
  // Wider playable street (scaled); approach from -Z matches outgoing tangent
  { x: 40, z: 0, y: 0, width: 12 },
  { x: 48, z: 90, y: 0, width: 12 },
  { x: 58, z: 170, y: 0, width: 11 },
  // Ste Devote (right)
  { x: 80, z: 230, y: 0.5, width: 10 },
  { x: 120, z: 265, y: 1.5, width: 9 },
  { x: 170, z: 285, y: 3, width: 9 },
  // Climb Beau Rivage / Magasin — rises OVER Portier crossing (~y10 vs ~y2)
  { x: 230, z: 300, y: 5.5, width: 10 },
  { x: 290, z: 320, y: 8.5, width: 10 },
  { x: 340, z: 350, y: 10.5, width: 9 },
  { x: 375, z: 395, y: 11.5, width: 9 },
  // Massenet / Casino square — peak
  { x: 390, z: 450, y: 12, width: 9 },
  { x: 385, z: 505, y: 11.5, width: 8 },
  { x: 355, z: 545, y: 11, width: 8 },
  { x: 310, z: 560, y: 10.5, width: 8 },
  // Mirabeau Haute (right)
  { x: 260, z: 555, y: 10, width: 8 },
  { x: 220, z: 525, y: 9, width: 8 },
  { x: 200, z: 480, y: 8, width: 8 },
  // Hairpin (Grand Hotel / Loews) — still elevated
  { x: 195, z: 435, y: 7, width: 7 },
  { x: 210, z: 400, y: 5.5, width: 7 },
  { x: 245, z: 385, y: 4, width: 7 },
  { x: 285, z: 380, y: 3, width: 8 },
  // Mirabeau Bas / Portier — LOW under the climb overpass (XZ under Beau Rivage)
  { x: 335, z: 348, y: 2.0, width: 9 },
  { x: 355, z: 320, y: 1.9, width: 9 },
  { x: 375, z: 250, y: 1.8, width: 9 },
  // Tunnel
  { x: 385, z: 180, y: 1.5, width: 10 },
  { x: 390, z: 110, y: 1.2, width: 10 },
  { x: 385, z: 40, y: 0.8, width: 10 },
  { x: 360, z: -20, y: 0.4, width: 10 },
  // Tunnel exit → Nouvelle Chicane (harbor)
  { x: 320, z: -60, y: 0.2, width: 11 },
  { x: 270, z: -85, y: 0, width: 11 },
  { x: 220, z: -95, y: 0, width: 10 },
  // Chicane left-right
  { x: 175, z: -80, y: 0, width: 9 },
  { x: 150, z: -50, y: 0, width: 9 },
  { x: 140, z: -10, y: 0, width: 10 },
  // Tabac (fast left along harbor) — begin climb onto pool bridge
  { x: 130, z: 40, y: 0.5, width: 11 },
  { x: 110, z: 100, y: 2.5, width: 11 },
  { x: 85, z: 150, y: 5.0, width: 10 },
  // Swimming Pool OVERPASS — raised clear of start/finish (crosses ~x55,z155 over SF)
  { x: 55, z: 155, y: 5.8, width: 9 },
  { x: 10, z: 160, y: 5.6, width: 9 },
  { x: -30, z: 150, y: 5.3, width: 9 },
  { x: -65, z: 120, y: 4.5, width: 9 },
  { x: -80, z: 70, y: 3.2, width: 9 },
  { x: -70, z: 20, y: 2.0, width: 9 },
  // La Rascasse (right hairpin) — descend toward pit
  { x: -40, z: -20, y: 1.0, width: 8 },
  { x: 0, z: -50, y: 0.4, width: 8 },
  { x: 40, z: -55, y: 0.2, width: 8 },
  // Anthony Noghes → pit straight — approach from -Z so S/F tangents match
  { x: 70, z: -40, y: 0.1, width: 10 },
  { x: 50, z: -55, y: 0.05, width: 11 },
  { x: 42, z: -40, y: 0, width: 12 },
  { x: 40, z: -18, y: 0, width: 12 },
  { x: 40, z: 0, y: 0, width: 12 }, // close loop (duplicate of start)
].map((p) => ({ ...p, width: (p.width ?? 10) * ROAD_WIDTH_SCALE }));


export function createMonacoTrack(): TrackData {
  const points = buildCenterline(RAW);
  const length = trackLength(points);
  return {
    id: 'monaco',
    name: 'Circuit de Monaco',
    nameRu: 'Трасса Монако',
    length,
    points,
    drsZones: [
      { startS: length * 0.92, endS: length * 0.99 },
      { startS: length * 0.52, endS: length * 0.60 },
    ],
    gravel: [
      { x: 95, z: 250, w: 18, d: 12, rot: 0.4, y: 0.8 },
      { x: 220, z: 400, w: 14, d: 10, rot: -0.3, y: 6 },
      { x: 230, z: -100, w: 20, d: 14, rot: 0.1, y: 0 },
      { x: -55, z: 40, w: 16, d: 12, rot: 0.6, y: 2.5 },
    ],
    startIndex: 0,
  };
}
