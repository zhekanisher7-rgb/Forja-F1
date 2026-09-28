/**
 * Export race asphalt + Tecpro barriers + pit spur as glTF/GLB for Blender.
 * Geometry follows the same Track path sampling / edge miters as TrackMesh.
 *
 * Usage: npm run export-tracks
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import {
  getTrackById,
  type TrackId,
  PIT_LANE,
  isPitTecproGap,
  pitSpurCenterOffset,
  pitSpurInnerOffset,
} from '../src/tracks/index.ts';
import {
  getTrackEdges,
  sampleTrack,
  TRACK_BARRIER_OUT,
  type TrackData,
  type TrackPoint,
} from '../src/tracks/Track.ts';


/** Node polyfill — three/GLTFExporter still uses FileReader for binary GLB. */
if (typeof globalThis.FileReader === 'undefined') {
  class FileReaderPolyfill {
    result: ArrayBuffer | null = null;
    onloadend: ((ev?: ProgressEvent<FileReader>) => void) | null = null;
    onerror: ((ev?: ProgressEvent<FileReader>) => void) | null = null;
    readAsArrayBuffer(blob: Blob): void {
      blob
        .arrayBuffer()
        .then((buf) => {
          this.result = buf;
          this.onloadend?.(undefined as unknown as ProgressEvent<FileReader>);
        })
        .catch((err) => {
          console.error(err);
          this.onerror?.(undefined as unknown as ProgressEvent<FileReader>);
        });
    }
  }
  // @ts-expect-error Node lacks DOM FileReader
  globalThis.FileReader = FileReaderPolyfill;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'exports', 'tracks');

const TRACK_IDS: TrackId[] = ['monaco', 'suzuka', 'interlagos'];
const ASPHALT_Y = 0.09;
const WALL_H = 1.25;
const BARRIER_OUT = TRACK_BARRIER_OUT;

function buildRibbonGeometry(
  left: THREE.Vector3[],
  right: THREE.Vector3[],
  yLift: number,
): THREE.BufferGeometry {
  const n = Math.min(left.length, right.length);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < n; i++) {
    positions.push(left[i].x, left[i].y + yLift, left[i].z);
    positions.push(right[i].x, right[i].y + yLift, right[i].z);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(0, i / Math.max(n - 1, 1), 1, i / Math.max(n - 1, 1));
  }
  for (let i = 0; i < n - 1; i++) {
    const lx = left[i + 1].x - left[i].x;
    const lz = left[i + 1].z - left[i].z;
    const rx = right[i + 1].x - right[i].x;
    const rz = right[i + 1].z - right[i].z;
    if (Math.hypot(lx, lz) < 1e-4 && Math.hypot(rx, rz) < 1e-4) continue;
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

function offsetEdge(edge: THREE.Vector3[], side: number, dist: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const n = edge.length;
  for (let i = 0; i < n; i++) {
    const iPrev = i === 0 ? (n > 1 ? n - 2 : 0) : i - 1;
    const iNext = i === n - 1 ? (n > 1 ? 1 : n - 1) : i + 1;
    const closed =
      n > 2 && Math.hypot(edge[0].x - edge[n - 1].x, edge[0].z - edge[n - 1].z) < 0.05;
    let prev = edge[iPrev];
    let next = edge[iNext];
    if (closed && (i === 0 || i === n - 1)) {
      prev = edge[n - 2];
      next = edge[1];
    }
    let dx = next.x - prev.x;
    let dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const ox = dz * side * dist;
    const oz = -dx * side * dist;
    out.push(new THREE.Vector3(edge[i].x + ox, edge[i].y, edge[i].z + oz));
  }
  return out;
}

function hasCoplanarForeignRibbon(pts: TrackPoint[], i: number, dyMax = 2.2): boolean {
  const n = pts.length;
  if (n < 8) return false;
  const a = pts[Math.min(i, n - 1)];
  const total = pts[n - 1]?.s || 1;
  for (let j = 0; j < n; j += 2) {
    if (Math.abs(j - i) < 10) continue;
    let along = Math.abs(pts[j].s - a.s);
    if (along > total * 0.5) along = total - along;
    if (along < 60) continue;
    const dist = Math.hypot(a.x - pts[j].x, a.z - pts[j].z);
    const half = (a.width + pts[j].width) * 0.5 + 3.2;
    if (dist > half) continue;
    if (Math.abs(a.y - pts[j].y) <= dyMax) return true;
  }
  return false;
}

function pointOnForeignAsphalt(
  pts: TrackPoint[],
  x: number,
  z: number,
  selfI: number,
  margin = 0.6,
  y?: number,
  dyMax = 2.5,
): boolean {
  const n = pts.length;
  if (n < 8) return false;
  const total = pts[n - 1]?.s || 1;
  const selfS = pts[Math.min(selfI, n - 1)].s;
  const selfY = y ?? pts[Math.min(selfI, n - 1)].y;
  for (let j = 0; j < n - 1; j += 2) {
    let along = Math.abs(pts[j].s - selfS);
    if (along > total * 0.5) along = total - along;
    if (along < 55) continue;
    const a = pts[j];
    const b = pts[Math.min(j + 1, n - 1)];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-6) continue;
    let t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const dist = Math.hypot(x - px, z - pz);
    const half = (a.width + (b.width - a.width) * t) * 0.5 + margin;
    if (dist > half) continue;
    const py = a.y + (b.y - a.y) * t;
    if (Math.abs(selfY - py) > dyMax) continue;
    return true;
  }
  return false;
}

function buildTecproWall(
  edge: THREE.Vector3[],
  side: number,
  pts: TrackPoint[],
): THREE.BufferGeometry | null {
  const wallBase = offsetEdge(edge, side, BARRIER_OUT);
  const n = Math.min(wallBase.length, pts.length);
  if (n < 2) return null;
  const total = pts[pts.length - 1]?.s || 1;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let v = 0;
  let along = 0;

  const wallY = new Float32Array(n);
  for (let i = 0; i < n; i++) wallY[i] = wallBase[i].y;
  for (let pass = 0; pass < 2; pass++) {
    const copy = wallY.slice();
    for (let i = 1; i < n - 1; i++) {
      wallY[i] = copy[i - 1] * 0.25 + copy[i] * 0.5 + copy[i + 1] * 0.25;
    }
  }

  for (let i = 0; i < n - 1; i++) {
    const s0 = pts[Math.min(i, pts.length - 1)].s;
    const s1 = pts[Math.min(i + 1, pts.length - 1)].s;
    const bumpAlong = () => {
      along += Math.hypot(wallBase[i + 1].x - wallBase[i].x, wallBase[i + 1].z - wallBase[i].z);
    };

    if (hasCoplanarForeignRibbon(pts, i) || hasCoplanarForeignRibbon(pts, i + 1)) {
      bumpAlong();
      continue;
    }
    if (isPitTecproGap(s0, total, side) || isPitTecproGap(s1, total, side)) {
      bumpAlong();
      continue;
    }

    const a = wallBase[i];
    const b = wallBase[i + 1];
    const c0 = pts[Math.min(i, pts.length - 1)];
    const c1 = pts[Math.min(i + 1, pts.length - 1)];
    const lat0 = Math.hypot(a.x - c0.x, a.z - c0.z);
    const lat1 = Math.hypot(b.x - c1.x, b.z - c1.z);
    if (lat0 < c0.width * 0.35 || lat1 < c1.width * 0.35) {
      bumpAlong();
      continue;
    }
    if (
      pointOnForeignAsphalt(pts, a.x, a.z, i, 0.35, a.y) ||
      pointOnForeignAsphalt(pts, b.x, b.z, i + 1, 0.35, b.y)
    ) {
      bumpAlong();
      continue;
    }

    let dx = b.x - a.x;
    let dz = b.z - a.z;
    const seg = Math.hypot(dx, dz);
    if (seg < 1e-4) continue;
    dx /= seg;
    dz /= seg;
    const nx = dz * side;
    const nz = -dx * side;
    const ox = nx * 0.12;
    const oz = nz * 0.12;
    const ya = wallY[i];
    const yb = wallY[i + 1];
    const u0 = along * 0.35;
    const u1 = (along + seg) * 0.35;
    positions.push(a.x + ox, ya, a.z + oz);
    positions.push(a.x + ox, ya + WALL_H, a.z + oz);
    positions.push(b.x + ox, yb, b.z + oz);
    positions.push(b.x + ox, yb + WALL_H, b.z + oz);
    for (let k = 0; k < 4; k++) normals.push(nx, 0, nz);
    uvs.push(u0, 0, u0, 1, u1, 0, u1, 1);
    if (side > 0) indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    else indices.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    v += 4;
    along += seg;
  }

  if (!indices.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

function addPitSpur(root: THREE.Group, pts: TrackPoint[]): void {
  if (pts.length < 8) return;
  const total = pts[pts.length - 1].s;
  const spec = PIT_LANE;
  if (total < spec.entryBeforeSf + spec.exitAfterSf + 20) return;

  const group = new THREE.Group();
  group.name = 'pitLane';

  const asphaltMat = new THREE.MeshStandardMaterial({
    color: 0x34343b,
    roughness: 0.9,
    metalness: 0.05,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xe8e8ec,
    roughness: 0.72,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const capMat = new THREE.MeshStandardMaterial({
    color: 0xc81018,
    roughness: 0.7,
    metalness: 0.05,
  });

  const step = 2.4;
  const sList: number[] = [];
  for (let s = total - spec.entryBeforeSf; s < total; s += step) sList.push(Math.min(s, total - 0.05));
  for (let s = 0; s <= spec.exitAfterSf; s += step) sList.push(s);
  if (sList.length < 4) return;

  type SpurPt = { x: number; y: number; z: number; yaw: number; s: number; halfW: number };
  const raw: SpurPt[] = [];
  for (const s of sList) {
    const samp = sampleTrack(pts, s);
    const halfW = samp.width * 0.5;
    const nx = Math.cos(samp.yaw);
    const nz = -Math.sin(samp.yaw);
    const offset = pitSpurCenterOffset(halfW, s, total, spec);
    raw.push({
      x: samp.x + nx * offset,
      y: samp.y,
      z: samp.z + nz * offset,
      yaw: samp.yaw,
      s,
      halfW,
    });
  }

  const spur: SpurPt[] = raw.map((p) => ({ ...p }));
  for (let pass = 0; pass < 3; pass++) {
    const copy = spur.map((p) => ({ x: p.x, z: p.z }));
    for (let i = 1; i < spur.length - 1; i++) {
      spur[i].x = copy[i - 1].x * 0.25 + copy[i].x * 0.5 + copy[i + 1].x * 0.25;
      spur[i].z = copy[i - 1].z * 0.25 + copy[i].z * 0.5 + copy[i + 1].z * 0.25;
    }
  }
  for (let i = 0; i < spur.length; i++) {
    const a = spur[Math.max(0, i - 1)];
    const b = spur[Math.min(spur.length - 1, i + 1)];
    spur[i].yaw = Math.atan2(b.x - a.x, b.z - a.z);
  }

  const halfPit = spec.width * 0.5;
  const pitInner: THREE.Vector3[] = [];
  const pitOuter: THREE.Vector3[] = [];
  for (const p of spur) {
    const nx = Math.cos(p.yaw);
    const nz = -Math.sin(p.yaw);
    pitInner.push(new THREE.Vector3(p.x - nx * halfPit, p.y, p.z - nz * halfPit));
    pitOuter.push(new THREE.Vector3(p.x + nx * halfPit, p.y, p.z + nz * halfPit));
  }

  const PIT_Y = 0.145;
  const CONNECT_Y = 0.118;
  const ribbon = new THREE.Mesh(buildRibbonGeometry(pitInner, pitOuter, PIT_Y), asphaltMat);
  ribbon.name = 'pitAsphalt';
  group.add(ribbon);

  // Entry / exit connectors (race edge → pit inner)
  const addConnector = (fromS: number, toS: number, towardPit: boolean) => {
    const cInner: THREE.Vector3[] = [];
    const cOuter: THREE.Vector3[] = [];
    const samples = 12;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const s = fromS + (toS - fromS) * t;
      const ss = ((s % total) + total) % total;
      const samp = sampleTrack(pts, ss);
      const nx = Math.cos(samp.yaw);
      const nz = -Math.sin(samp.yaw);
      const raceEdge = samp.width * 0.5;
      const pitLat = pitSpurInnerOffset(raceEdge, ss, total, spec);
      const blend = towardPit ? t : 1 - t;
      const ease = blend * blend * (3 - 2 * blend);
      const latA = raceEdge + 0.12;
      const gap = Math.max(0, pitLat - latA);
      if (gap < 0.35) continue;
      const latB = latA + gap * (0.2 + 0.8 * ease);
      if (latB <= latA + 0.08) continue;
      cInner.push(new THREE.Vector3(samp.x + nx * latA, samp.y, samp.z + nz * latA));
      cOuter.push(new THREE.Vector3(samp.x + nx * latB, samp.y, samp.z + nz * latB));
    }
    if (cInner.length >= 2) {
      const mesh = new THREE.Mesh(buildRibbonGeometry(cInner, cOuter, CONNECT_Y), asphaltMat);
      mesh.name = 'pitConnector';
      group.add(mesh);
    }
  };
  addConnector(total - spec.entryOpenLen, total - 1.5, true);
  addConnector(1.5, spec.exitOpenLen, false);

  // Outer Tecpro along pit boxes (segment wall)
  const wallPositions: number[] = [];
  const wallNormals: number[] = [];
  const wallUvs: number[] = [];
  const wallIndices: number[] = [];
  let wv = 0;
  let along = 0;
  for (let i = 0; i < spur.length - 1; i++) {
    const p = spur[i];
    const q = spur[i + 1];
    if (p.s < spec.boxStartS - 4 || p.s > spec.boxEndS + 8) {
      along += Math.hypot(q.x - p.x, q.z - p.z);
      continue;
    }
    const nx = Math.cos(p.yaw);
    const nz = -Math.sin(p.yaw);
    const lat = halfPit + 0.35;
    const ax = p.x + nx * lat;
    const az = p.z + nz * lat;
    const bx = q.x + Math.cos(q.yaw) * lat;
    const bz = q.z + -Math.sin(q.yaw) * lat;
    const seg = Math.hypot(bx - ax, bz - az);
    if (seg < 1e-4) continue;
    const onx = nx;
    const onz = nz;
    const ya = p.y;
    const yb = q.y;
    const u0 = along * 0.35;
    const u1 = (along + seg) * 0.35;
    wallPositions.push(ax, ya, az, ax, ya + 1.2, az, bx, yb, bz, bx, yb + 1.2, bz);
    for (let k = 0; k < 4; k++) wallNormals.push(onx, 0, onz);
    wallUvs.push(u0, 0, u0, 1, u1, 0, u1, 1);
    wallIndices.push(wv, wv + 1, wv + 2, wv + 1, wv + 3, wv + 2);
    wv += 4;
    along += seg;

    // Cap ribbon strip
    const capIn = halfPit + 0.15;
    const capOut = halfPit + 0.55;
    const capL = [
      new THREE.Vector3(p.x + nx * capIn, p.y, p.z + nz * capIn),
      new THREE.Vector3(q.x + Math.cos(q.yaw) * capIn, q.y, q.z + -Math.sin(q.yaw) * capIn),
    ];
    const capR = [
      new THREE.Vector3(p.x + nx * capOut, p.y, p.z + nz * capOut),
      new THREE.Vector3(q.x + Math.cos(q.yaw) * capOut, q.y, q.z + -Math.sin(q.yaw) * capOut),
    ];
    const cap = new THREE.Mesh(buildRibbonGeometry(capL, capR, 1.22), capMat);
    cap.name = 'pitTecproCap';
    group.add(cap);
  }
  if (wallIndices.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(wallPositions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(wallNormals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(wallUvs, 2));
    geo.setIndex(wallIndices);
    const wall = new THREE.Mesh(geo, wallMat);
    wall.name = 'pitTecpro';
    group.add(wall);
  }

  root.add(group);
}

function buildTrackScene(track: TrackData): THREE.Group {
  const root = new THREE.Group();
  root.name = `track_${track.id}`;

  const pts = track.points;
  const { left, right } = getTrackEdges(pts);

  const asphaltMat = new THREE.MeshStandardMaterial({
    color: 0x2c2c32,
    roughness: 0.82,
    metalness: 0.05,
  });
  const asphalt = new THREE.Mesh(buildRibbonGeometry(left, right, ASPHALT_Y), asphaltMat);
  asphalt.name = 'asphalt';
  root.add(asphalt);

  const tecproMat = new THREE.MeshStandardMaterial({
    color: 0xe8e8ec,
    roughness: 0.72,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const capMat = new THREE.MeshStandardMaterial({
    color: 0xc81018,
    roughness: 0.7,
    metalness: 0.05,
  });

  for (const [edge, side, label] of [
    [left, -1, 'left'] as const,
    [right, 1, 'right'] as const,
  ]) {
    const wallGeo = buildTecproWall(edge, side, pts);
    if (wallGeo) {
      const wall = new THREE.Mesh(wallGeo, tecproMat);
      wall.name = `tecpro_${label}`;
      root.add(wall);
    }
    const capInner = offsetEdge(edge, side, 1.05);
    const capOuter = offsetEdge(edge, side, 1.4);
    const cL = side < 0 ? capOuter : capInner;
    const cR = side < 0 ? capInner : capOuter;
    // Simple continuous cap (Blender-friendly); gaps already in wall mesh
    const cap = new THREE.Mesh(buildRibbonGeometry(cL, cR, WALL_H + 0.02), capMat);
    cap.name = `tecproCap_${label}`;
    root.add(cap);
  }

  addPitSpur(root, pts);
  return root;
}

async function exportGlb(scene: THREE.Object3D, outPath: string): Promise<void> {
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(scene, {
    binary: true,
    onlyVisible: true,
  });
  if (!(result instanceof ArrayBuffer)) {
    throw new Error(`Expected ArrayBuffer GLB, got ${typeof result}`);
  }
  fs.writeFileSync(outPath, Buffer.from(result));
}

function exportCenterline(track: TrackData, outPath: string): void {
  const points = track.points.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  fs.writeFileSync(outPath, JSON.stringify(points, null, 2) + '\n');
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Exporting tracks → ${OUT_DIR}`);

  for (const id of TRACK_IDS) {
    const track = getTrackById(id);
    const scene = buildTrackScene(track);
    const glbPath = path.join(OUT_DIR, `${id}.glb`);
    const jsonPath = path.join(OUT_DIR, `${id}-centerline.json`);
    await exportGlb(scene, glbPath);
    exportCenterline(track, jsonPath);
    const glbKb = (fs.statSync(glbPath).size / 1024).toFixed(1);
    console.log(
      `  ${id}: ${track.points.length} pts, length=${track.length.toFixed(0)}m → ${path.basename(glbPath)} (${glbKb} KB), ${path.basename(jsonPath)}`,
    );
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
