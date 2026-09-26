/**
 * Stylized Interlagos (Autódromo José Carlos Pace) — Senna S, hills, arcade ~2.3 km.
 * Anti-clockwise: outbound stays EAST; climb onto S/F stays WEST so ribbons never
 * stack in plan view. Width kept moderate so Tecpro stays at asphalt edges
 * (old 3.8× scale made half-widths collide and put barriers mid-road).
 *
 * End-of-lap: west climb drops to a south stub, then dense NNE-aligned rejoin
 * into S/F (same heading as outbound) — no Catmull hook / edge-width collapse
 * that left a Tecpro gap and asphalt z-fight at the junction.
 */
import { buildCenterline, trackLength, type TrackData } from './Track';

const ROAD_WIDTH_SCALE = 2.15;

const RAW: { x: number; z: number; y?: number; width?: number }[] = [
  // Reta Principal (S/F) — high plateau, downhill toward Senna S
  { x: 0, z: 0, y: 5.5, width: 12 },
  { x: 14, z: 85, y: 4.8, width: 12 },
  { x: 28, z: 160, y: 3.6, width: 11 },
  // Senna S (east lobe — clear of west climb)
  { x: 70, z: 215, y: 2.6, width: 10 },
  { x: 125, z: 250, y: 2.0, width: 9 },
  { x: 180, z: 255, y: 1.7, width: 9 },
  { x: 225, z: 220, y: 1.8, width: 9 },
  { x: 250, z: 165, y: 2.2, width: 10 },
  // Curva do Sol → Reta Oposta (south)
  { x: 265, z: 105, y: 2.8, width: 11 },
  { x: 270, z: 35, y: 3.4, width: 12 },
  { x: 260, z: -40, y: 3.6, width: 12 },
  { x: 235, z: -100, y: 3.2, width: 11 },
  // Descida / Ferradura
  { x: 185, z: -150, y: 2.4, width: 10 },
  { x: 120, z: -170, y: 1.6, width: 10 },
  { x: 55, z: -155, y: 1.1, width: 9 },
  { x: 5, z: -115, y: 0.9, width: 9 },
  { x: -30, z: -65, y: 1.1, width: 9 },
  // Pinheirinho (west low)
  { x: -70, z: -15, y: 1.6, width: 9 },
  { x: -110, z: 40, y: 2.3, width: 9 },
  { x: -140, z: 100, y: 3.0, width: 9 },
  // Bico de Pato / Mergulho
  { x: -160, z: 160, y: 3.8, width: 10 },
  { x: -155, z: 220, y: 4.6, width: 10 },
  // Junção → climb on WEST corridor (x ≲ −85) — never over Senna / outbound
  { x: -130, z: 270, y: 5.2, width: 10 },
  { x: -100, z: 295, y: 5.55, width: 11 },
  { x: -90, z: 250, y: 5.65, width: 11 },
  { x: -95, z: 180, y: 5.65, width: 11 },
  { x: -100, z: 110, y: 5.6, width: 12 },
  // South stub west of Pinheirinho, then dense NNE rejoin (match S/F heading)
  { x: -92, z: 55, y: 5.55, width: 12 },
  { x: -78, z: 18, y: 5.5, width: 12 },
  { x: -62, z: -10, y: 5.5, width: 12 },
  { x: -42, z: -28, y: 5.5, width: 12 },
  { x: -25, z: -32, y: 5.5, width: 12 },
  { x: -12, z: -28, y: 5.5, width: 12 },
  { x: -5, z: -18, y: 5.5, width: 12 },
  { x: -2.8, z: -12, y: 5.5, width: 12 },
  { x: -1.8, z: -8, y: 5.5, width: 12 },
  { x: -1.2, z: -5.5, y: 5.5, width: 12 },
  { x: -0.8, z: -3.5, y: 5.5, width: 12 },
  { x: -0.5, z: -2.2, y: 5.5, width: 12 },
  { x: -0.3, z: -1.2, y: 5.5, width: 12 },
  { x: -0.15, z: -0.55, y: 5.5, width: 12 },
  { x: -0.05, z: -0.18, y: 5.5, width: 12 },
  { x: 0, z: 0, y: 5.5, width: 12 },
].map((p) => ({ ...p, width: (p.width ?? 10) * ROAD_WIDTH_SCALE }));

export function createInterlagosTrack(): TrackData {
  const points = buildCenterline(RAW);
  const length = trackLength(points);
  return {
    id: 'interlagos',
    name: 'Interlagos',
    nameRu: 'Интерлагос',
    length,
    points,
    drsZones: [
      { startS: length * 0.0, endS: length * 0.1 },
      { startS: length * 0.26, endS: length * 0.38 },
    ],
    gravel: [
      { x: 250, z: 210, w: 14, d: 10, rot: 0.35, y: 1.8 },
      { x: 140, z: -185, w: 12, d: 9, rot: -0.25, y: 1.4 },
      { x: -165, z: 105, w: 13, d: 10, rot: 0.4, y: 2.8 },
    ],
    startIndex: 0,
  };
}
