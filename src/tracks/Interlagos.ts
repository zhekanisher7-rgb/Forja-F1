/**
 * Stylized Interlagos (Autódromo José Carlos Pace) — Senna S, hills, arcade ~2.3 km.
 * Anti-clockwise: outbound stays EAST; climb onto S/F stays WEST so ribbons never
 * stack in plan view (fixes grass/asphalt/kerb z-fighting from the old parallel climb).
 */
import { buildCenterline, trackLength, type TrackData } from './Track';

const ROAD_WIDTH_SCALE = 3.8;

const RAW: { x: number; z: number; y?: number; width?: number }[] = [
  // Reta Principal (S/F) — high plateau, downhill toward Senna S
  { x: 0, z: 0, y: 5.5, width: 12 },
  { x: 12, z: 85, y: 4.8, width: 12 },
  { x: 22, z: 160, y: 3.6, width: 11 },
  // Senna S (east lobe — clear of west climb)
  { x: 55, z: 210, y: 2.6, width: 10 },
  { x: 110, z: 245, y: 2.0, width: 9 },
  { x: 165, z: 250, y: 1.7, width: 9 },
  { x: 210, z: 220, y: 1.8, width: 9 },
  { x: 235, z: 170, y: 2.2, width: 10 },
  // Curva do Sol → Reta Oposta (south)
  { x: 250, z: 110, y: 2.8, width: 11 },
  { x: 255, z: 40, y: 3.4, width: 12 },
  { x: 250, z: -35, y: 3.6, width: 12 },
  { x: 230, z: -95, y: 3.2, width: 11 },
  // Descida / Ferradura
  { x: 185, z: -145, y: 2.4, width: 10 },
  { x: 125, z: -165, y: 1.6, width: 10 },
  { x: 65, z: -155, y: 1.1, width: 9 },
  { x: 15, z: -120, y: 0.9, width: 9 },
  { x: -20, z: -70, y: 1.1, width: 9 },
  // Pinheirinho (west low)
  { x: -55, z: -20, y: 1.6, width: 9 },
  { x: -90, z: 35, y: 2.3, width: 9 },
  { x: -115, z: 95, y: 3.0, width: 9 },
  // Bico de Pato / Mergulho
  { x: -130, z: 155, y: 3.8, width: 10 },
  { x: -125, z: 210, y: 4.6, width: 10 },
  // Junção → climb on WEST corridor (x ≲ −55) — never over Senna / outbound
  { x: -100, z: 255, y: 5.2, width: 10 },
  { x: -70, z: 280, y: 5.6, width: 11 },
  { x: -55, z: 240, y: 5.7, width: 11 },
  { x: -60, z: 175, y: 5.65, width: 11 },
  { x: -65, z: 110, y: 5.6, width: 12 },
  { x: -55, z: 50, y: 5.55, width: 12 },
  { x: -30, z: 15, y: 5.5, width: 12 },
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
      { x: 240, z: 210, w: 14, d: 10, rot: 0.35, y: 1.8 },
      { x: 140, z: -180, w: 12, d: 9, rot: -0.25, y: 1.4 },
      { x: -145, z: 100, w: 13, d: 10, rot: 0.4, y: 2.8 },
    ],
    startIndex: 0,
  };
}
