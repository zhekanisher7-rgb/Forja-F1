/**
 * Stylized Interlagos (Autódromo José Carlos Pace) — Senna S, hills, arcade ~2.3 km.
 * Anti-clockwise loop with climb onto the main straight; no plan-view self-cross.
 */
import { buildCenterline, trackLength, type TrackData } from './Track';

const ROAD_WIDTH_SCALE = 3.8;

const RAW: { x: number; z: number; y?: number; width?: number }[] = [
  // Reta Principal (S/F) — high plateau, slight downhill toward Senna S
  { x: 0, z: 0, y: 5.0, width: 12 },
  { x: 15, z: 80, y: 4.4, width: 12 },
  { x: 25, z: 150, y: 3.5, width: 11 },
  // Senna S
  { x: 50, z: 200, y: 2.6, width: 10 },
  { x: 100, z: 230, y: 2.0, width: 9 },
  { x: 150, z: 235, y: 1.7, width: 9 },
  { x: 190, z: 210, y: 1.8, width: 9 },
  { x: 210, z: 165, y: 2.2, width: 10 },
  // Curva do Sol → Reta Oposta (south)
  { x: 225, z: 110, y: 2.8, width: 11 },
  { x: 235, z: 40, y: 3.4, width: 12 },
  { x: 235, z: -30, y: 3.8, width: 12 },
  { x: 220, z: -90, y: 3.5, width: 11 },
  // Descida / Ferradura
  { x: 185, z: -135, y: 2.6, width: 10 },
  { x: 135, z: -155, y: 1.8, width: 10 },
  { x: 80, z: -150, y: 1.2, width: 9 },
  { x: 35, z: -125, y: 1.0, width: 9 },
  { x: 5, z: -80, y: 1.3, width: 9 },
  // Pinheirinho
  { x: -25, z: -35, y: 1.8, width: 9 },
  { x: -60, z: 10, y: 2.5, width: 9 },
  { x: -90, z: 60, y: 3.2, width: 9 },
  // Bico de Pato / Mergulho
  { x: -105, z: 120, y: 4.0, width: 10 },
  { x: -95, z: 175, y: 4.8, width: 10 },
  // Junção → climb onto S/F (west side, clear of Senna S)
  { x: -60, z: 215, y: 5.2, width: 10 },
  { x: -10, z: 230, y: 5.4, width: 11 },
  { x: 40, z: 210, y: 5.3, width: 11 },
  // Architecture / boxes climb — run west of pit then onto straight
  { x: 70, z: 160, y: 5.2, width: 11 },
  { x: 75, z: 100, y: 5.1, width: 12 },
  { x: 55, z: 45, y: 5.05, width: 12 },
  { x: 25, z: 10, y: 5.0, width: 12 },
  { x: 0, z: 0, y: 5.0, width: 12 },
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
      { x: 220, z: 200, w: 14, d: 10, rot: 0.35, y: 1.8 },
      { x: 140, z: -170, w: 12, d: 9, rot: -0.25, y: 1.4 },
      { x: -120, z: 90, w: 13, d: 10, rot: 0.4, y: 3.0 },
    ],
    startIndex: 0,
  };
}
