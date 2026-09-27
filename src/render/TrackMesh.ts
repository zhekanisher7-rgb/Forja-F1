import * as THREE from 'three';
import type { TrackData, TrackPoint } from '../tracks/Track';
import { getTrackEdges, sampleTerrainHeight, sampleTrack, TRACK_BARRIER_OUT } from '../tracks/Track';
import {
  PIT_LANE,
  isPitCorridorS,
  isPitTecproGap,
} from '../tracks/PitLane';

/** Set per createTrackMesh — Monaco casino/tunnel hills vs generic ribbon terrain. */
let _monacoLandmarks = false;
function terrainH(pts: TrackPoint[], x: number, z: number): number {
  return sampleTerrainHeight(pts, x, z, _monacoLandmarks);
}

/** Barrier offset from asphalt edge — shared with physics (TRACK_BARRIER_OUT) */
const BARRIER_OUT = TRACK_BARRIER_OUT;
import { profileFor, type GraphicsTier, type QualityProfile } from './GraphicsQuality';

/** Procedural asphalt — grain, tire wear, oil patches, edge darkening */
function makeAsphaltTexture(anisotropy: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1e1e24';
  ctx.fillRect(0, 0, 512, 512);

  // Fine grain
  for (let i = 0; i < 14000; i++) {
    const v = 18 + Math.random() * 55;
    const a = 0.04 + Math.random() * 0.14;
    ctx.fillStyle = `rgba(${v},${v},${v + 6},${a})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5);
  }
  // Rubber wear bands (racing line)
  for (let band = 0; band < 5; band++) {
    const x0 = 55 + band * 80 + Math.random() * 18;
    ctx.fillStyle = 'rgba(8,8,12,0.22)';
    ctx.fillRect(x0, 0, 14 + Math.random() * 12, 512);
  }
  // Oil / polish sheen patches
  for (let i = 0; i < 12; i++) {
    const cx = 80 + Math.random() * 350;
    const cy = Math.random() * 512;
    const r = 20 + Math.random() * 50;
    const grd = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
    grd.addColorStop(0, 'rgba(55,55,62,0.35)');
    grd.addColorStop(1, 'rgba(55,55,62,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Edge darkening
  const eg = ctx.createLinearGradient(0, 0, 48, 0);
  eg.addColorStop(0, 'rgba(0,0,0,0.4)');
  eg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = eg;
  ctx.fillRect(0, 0, 48, 512);
  const eg2 = ctx.createLinearGradient(512, 0, 464, 0);
  eg2.addColorStop(0, 'rgba(0,0,0,0.4)');
  eg2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = eg2;
  ctx.fillRect(464, 0, 48, 512);

  ctx.strokeStyle = 'rgba(80,80,88,0.35)';
  ctx.lineWidth = 3;
  ctx.setLineDash([28, 22]);
  ctx.beginPath();
  ctx.moveTo(256, 0);
  ctx.lineTo(256, 512);
  ctx.stroke();
  ctx.setLineDash([]);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.4, 36);
  tex.anisotropy = anisotropy;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  return tex;
}


/** Cheap asphalt roughness variation (darker = glossier racing line) */
function makeAsphaltRoughnessMap(anisotropy: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#c8c8c8';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    const v = 140 + Math.random() * 80;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  // Polished racing-line bands (lower roughness)
  for (let band = 0; band < 5; band++) {
    const x0 = 28 + band * 40 + Math.random() * 8;
    ctx.fillStyle = 'rgb(90,90,95)';
    ctx.fillRect(x0, 0, 8 + Math.random() * 6, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.4, 36);
  tex.anisotropy = anisotropy;
  return tex;
}

function makeKerbTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    const red = i % 2 === 0;
    ctx.fillStyle = red ? '#c81818' : '#f0f0f4';
    ctx.fillRect(i * 16, 0, 16, 32);
    // bevel / wear
    ctx.fillStyle = red ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(i * 16, 0, 16, 6);
    ctx.fillStyle = red ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(i * 16, 22, 16, 10);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Red/white Tecpro-style soft-wall stack (horizontal bands — never blue) */
function makeTecproTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const bands = 6;
  const bh = 128 / bands;
  for (let i = 0; i < bands; i++) {
    const red = i % 2 === 0;
    ctx.fillStyle = red ? '#c81018' : '#f6f6fa';
    ctx.fillRect(0, i * bh, 64, bh);
    // foam bevel
    ctx.fillStyle = red ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.04)';
    ctx.fillRect(0, i * bh, 64, 5);
    ctx.fillStyle = red ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.1)';
    ctx.fillRect(0, i * bh + bh - 5, 64, 5);
  }
  // vertical module seams
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 2;
  for (const x of [16, 32, 48]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 128);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const SPONSOR_NAMES = ['FORJA', 'TEC', 'HYDRO', 'NEXUS', 'VOLT', 'AERO', 'PULSE', 'GRID'];
/** Dark / red / gold boards only — never blue-white cubes that look like wrong barriers */
const SPONSOR_COLORS = [
  ['#1a1208', '#e8c040'],
  ['#1a1a1e', '#e02020'],
  ['#101010', '#f0f0f0'],
  ['#2a1010', '#ff6040'],
  ['#141410', '#c8a020'],
  ['#301808', '#f08030'],
  ['#0e0e10', '#e8e8ec'],
  ['#280808', '#f0e0c0'],
];

/** Single fictional sponsor board atlas (one panel per name) */
function makeSponsorAtlas(): THREE.CanvasTexture {
  const cellW = 256;
  const cellH = 64;
  const n = SPONSOR_NAMES.length;
  const c = document.createElement('canvas');
  c.width = cellW;
  c.height = cellH * n;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < n; i++) {
    const [bg, fg] = SPONSOR_COLORS[i];
    const y0 = i * cellH;
    ctx.fillStyle = bg;
    ctx.fillRect(0, y0, cellW, cellH);
    // border frame
    ctx.strokeStyle = fg;
    ctx.lineWidth = 4;
    ctx.strokeRect(6, y0 + 6, cellW - 12, cellH - 12);
    // accent bar
    ctx.fillStyle = fg;
    ctx.fillRect(10, y0 + cellH - 14, cellW - 20, 4);
    ctx.fillStyle = fg;
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(SPONSOR_NAMES[i], cellW / 2, y0 + cellH / 2 - 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Facade with window grid, balcony bands, cornice — shared by InstancedMesh buildings */
function makeBuildingFacadeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  // Warm Mediterranean plaster (slight tint variance baked into base)
  ctx.fillStyle = '#a89888';
  ctx.fillRect(0, 0, 128, 256);
  // Ground-floor shop / door band
  ctx.fillStyle = '#7a6a58';
  ctx.fillRect(0, 200, 128, 56);
  ctx.fillStyle = '#3a3028';
  ctx.fillRect(48, 214, 32, 42);
  ctx.fillStyle = 'rgba(255,220,160,0.35)';
  ctx.fillRect(12, 218, 22, 28);
  ctx.fillRect(94, 218, 22, 28);
  // Floor cornice bands
  for (const y of [64, 128, 192]) {
    ctx.fillStyle = '#8a7868';
    ctx.fillRect(0, y - 2, 128, 4);
    ctx.fillStyle = 'rgba(255,240,220,0.12)';
    ctx.fillRect(0, y - 2, 128, 1);
  }
  // Balcony / shutter hint
  ctx.fillStyle = '#6a5040';
  ctx.fillRect(0, 120, 128, 6);
  ctx.fillStyle = '#4a3830';
  for (let x = 8; x < 128; x += 32) ctx.fillRect(x, 118, 18, 3);
  // subtle plaster noise
  for (let i = 0; i < 900; i++) {
    const v = 140 + Math.random() * 40;
    ctx.fillStyle = `rgba(${v},${v - 8},${v - 16},0.08)`;
    ctx.fillRect(Math.random() * 128, Math.random() * 256, 2, 2);
  }
  const cols = 4;
  const rows = 8;
  const mw = 128 / cols;
  const mh = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lit = Math.random() > 0.42;
      ctx.fillStyle = lit ? 'rgba(255,220,160,0.82)' : 'rgba(35,32,28,0.78)';
      const pad = 4;
      const wx = col * mw + pad;
      const wy = r * mh + pad + 2;
      const ww = mw - pad * 2;
      const wh = mh - pad * 2 - 4;
      ctx.fillRect(wx, wy, ww, wh);
      // window mullion
      ctx.strokeStyle = lit ? 'rgba(180,140,80,0.35)' : 'rgba(20,18,16,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(wx + 0.5, wy + 0.5, ww - 1, wh - 1);
      ctx.beginPath();
      ctx.moveTo(wx + ww * 0.5, wy);
      ctx.lineTo(wx + ww * 0.5, wy + wh);
      ctx.moveTo(wx, wy + wh * 0.5);
      ctx.lineTo(wx + ww, wy + wh * 0.5);
      ctx.stroke();
      if (lit) {
        ctx.fillStyle = 'rgba(255,240,200,0.28)';
        ctx.fillRect(wx, wy, ww * 0.45, wh);
      }
    }
  }
  // roof / cornice band
  ctx.fillStyle = '#5a5048';
  ctx.fillRect(0, 0, 128, 12);
  ctx.fillStyle = '#7a6a58';
  ctx.fillRect(0, 10, 128, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}


function makeRockTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#6a6660';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6000; i++) {
    const v = 70 + Math.random() * 70;
    const a = 0.08 + Math.random() * 0.2;
    ctx.fillStyle = `rgba(${v},${v - 4},${v - 10},${a})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  for (let i = 0; i < 40; i++) {
    const cx = Math.random() * 256;
    const cy = Math.random() * 256;
    const r = 6 + Math.random() * 20;
    const grd = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
    grd.addColorStop(0, 'rgba(40,38,34,0.35)');
    grd.addColorStop(1, 'rgba(40,38,34,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Crack lines
  ctx.strokeStyle = 'rgba(30,28,24,0.35)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 18; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * 256, Math.random() * 256);
    ctx.lineTo(Math.random() * 256, Math.random() * 256);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeWaterNormalTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  // Flat normal base (128,128,255)
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 300; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const w = 20 + Math.random() * 60;
    const h = 3 + Math.random() * 6;
    const nx = 110 + Math.random() * 36;
    const ny = 110 + Math.random() * 36;
    ctx.fillStyle = `rgb(${nx|0},${ny|0},255)`;
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 9);
  return tex;
}

function makeGroundTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  // Base meadow — slightly varied Mediterranean scrub
  ctx.fillStyle = '#354c32';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    const g = 40 + Math.random() * 50;
    ctx.fillStyle = `rgba(${g * 0.55},${g},${g * 0.4},${0.1 + Math.random() * 0.15})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // Dirt / dry patches
  for (let i = 0; i < 18; i++) {
    const cx = Math.random() * 256;
    const cy = Math.random() * 256;
    const r = 8 + Math.random() * 22;
    const grd = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
    grd.addColorStop(0, 'rgba(110,90,55,0.45)');
    grd.addColorStop(1, 'rgba(110,90,55,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Rock flecks
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = `rgba(${90 + Math.random() * 40},${85 + Math.random() * 30},${70 + Math.random() * 20},0.35)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 3, 1 + Math.random() * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(40, 40);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createTrackMesh(
  track: TrackData,
  tier: GraphicsTier = 'medium',
  night = false,
): THREE.Group {
  const quality = profileFor(tier);
  const root = new THREE.Group();
  root.name = 'track';

  const pts = track.points;
  _monacoLandmarks = track.id === 'monaco';
  const { left, right } = getTrackEdges(pts);

  addGround(root, pts, quality);

  // Soft runoff / grass strips first (below asphalt Y) — fills sky gaps beside ribbon
  addShoulderStrips(root, left, right, pts, quality);

  // Continuous asphalt ribbon (dense Catmull-Rom samples) — clear Y above terrain, no polygonOffset
  const asphaltMap = makeAsphaltTexture(quality.anisotropy);
  const asphaltRough = makeAsphaltRoughnessMap(quality.anisotropy);
  const asphaltMat = quality.asphaltClearcoat
    ? new THREE.MeshPhysicalMaterial({
        color: 0x2a2a30,
        map: asphaltMap,
        roughness: 0.72,
        roughnessMap: asphaltRough,
        metalness: 0.06,
        envMapIntensity: 0.75,
        clearcoat: 0.22,
        clearcoatRoughness: 0.45,
      })
    : new THREE.MeshStandardMaterial({
        color: 0x2c2c32,
        map: asphaltMap,
        roughness: 0.82,
        roughnessMap: asphaltRough,
        metalness: 0.05,
        envMapIntensity: 0.5,
      });
  // Asphalt clearly above terrain/shoulders — prevents grass / shoulder z-fight
  const asphalt = new THREE.Mesh(buildRibbonGeometry(left, right, 0.09), asphaltMat);
  asphalt.receiveShadow = true;
  asphalt.castShadow = quality.asphaltCastShadow;
  root.add(asphalt);

  // Soft edge darken blend (slightly wider, transparent) — hides hard rectangle seams
  addSoftEdgeBlend(root, left, right, pts);

  // Subtle center wear line — skip join/coplanar so it never z-fights asphalt
  const { left: ll, right: rr } = getTrackEdges(pts, 0.1);
  const lineMat = new THREE.MeshStandardMaterial({
    color: 0x1a1e24,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    roughness: 0.95,
    metalness: 0,
  });
  root.add(new THREE.Mesh(buildRibbonGeometrySkipJoinCoplanar(ll, rr, 0.1, pts, 18), lineMat));

  addEdgeLine(root, left, true, pts);
  addEdgeLine(root, right, false, pts);
  addKerbs(root, left, true, quality, pts);
  addKerbs(root, right, false, quality, pts);
  addTecproBarriers(root, left, -1, quality, pts);
  addTecproBarriers(root, right, 1, quality, pts);
  addSponsorBoards(root, left, -1, quality, pts);
  addSponsorBoards(root, right, 1, quality, pts);
  addTrackMarkings(root, pts, quality);

  const gravelMat = new THREE.MeshStandardMaterial({ color: 0xb8a078, metalness: 0.08, roughness: 1 });
  for (const g of track.gravel) {
    // Never lay runoff patches on driveable asphalt
    if (!boxClearsRibbon(pts, g.x, g.z, g.w, g.d, 1.5)) continue;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(g.w, g.d), gravelMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = g.rot;
    const gy = terrainH(pts, g.x, g.z) + 0.03;
    mesh.position.set(g.x, Math.max((g.y ?? 0) + 0.02, gy), g.z);
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  // DRS markers — dark posts outside Tecpro only (no glowing green beam / gate across asphalt)
  const drsMat = new THREE.MeshStandardMaterial({
    color: 0x1a3a28,
    emissive: 0x0a2818,
    emissiveIntensity: 0.12,
    roughness: 0.65,
    metalness: 0.25,
  });
  const drsSignMat = new THREE.MeshStandardMaterial({
    color: 0x2a8a48,
    emissive: 0x103820,
    emissiveIntensity: 0.18,
    roughness: 0.55,
    metalness: 0.15,
  });
  for (const zone of track.drsZones) {
    for (const s of [zone.startS, zone.endS]) {
      const idx = findIndexAtS(pts, s);
      const p = pts[idx];
      const next = pts[Math.min(pts.length - 1, idx + 1)];
      const yaw = Math.atan2(next.x - p.x, next.z - p.z);
      const gate = new THREE.Group();
      const out = p.width / 2 + BARRIER_OUT + 0.85;
      for (const sx of [-1, 1] as const) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.4, 0.22), drsMat);
        post.position.set(sx * out, 1.2, 0);
        const sign = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.7), drsSignMat);
        sign.position.set(sx * out, 2.15, 0);
        gate.add(post, sign);
      }
      gate.position.set(p.x, p.y, p.z);
      gate.rotation.y = yaw;
      root.add(gate);
    }
  }

  if (track.tunnel) {
    addTunnel(root, pts, track.tunnel.startFrac, track.tunnel.endFrac, quality);
    addTunnelEntranceRocks(root, pts, track.tunnel.startFrac, quality);
  }
  addOverpassSupports(root, pts, quality);
  if (track.harbor) {
    addHarbor(root, pts, quality);
  }
  addScenery(root, pts, left, right, quality, night);
  addPitLane(root, pts, left, right, quality);

  // Start/finish stripe — quiet chequered decal (never a glowing white ribbon)
  const sfMat = new THREE.MeshStandardMaterial({
    color: 0xc8c8d0,
    roughness: 0.92,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    depthWrite: false,
    transparent: true,
    opacity: 0.85,
  });
  const sf = new THREE.Mesh(new THREE.PlaneGeometry(pts[0].width * 0.88, 1.15), sfMat);
  sf.rotation.x = -Math.PI / 2;
  const yaw0 = Math.atan2(pts[1].x - pts[0].x, pts[1].z - pts[0].z);
  sf.position.set(pts[0].x, pts[0].y + 0.105, pts[0].z);
  sf.rotation.z = -yaw0;
  sf.renderOrder = 2;
  root.add(sf);

  return root;
}

/** White dashed lane dashes + sector markers — merged BufferGeometry (few draw calls) */
function addTrackMarkings(root: THREE.Group, pts: TrackPoint[], quality: QualityProfile): void {
  const group = new THREE.Group();
  group.name = 'markings';
  const total = pts[pts.length - 1]?.s || 1;
  const step = quality.markingStep;

  const positions: number[] = [];
  const indices: number[] = [];
  let vBase = 0;

  const pushQuad = (
    cx: number, cy: number, cz: number,
    yaw: number, halfW: number, halfL: number,
  ) => {
    const cos = Math.cos(-yaw);
    const sin = Math.sin(-yaw);
    // local corners in XZ before yaw: (±halfW, ±halfL) with plane on XZ
    const corners = [
      [-halfW, -halfL],
      [halfW, -halfL],
      [halfW, halfL],
      [-halfW, halfL],
    ];
    for (const [lx, lz] of corners) {
      const wx = cx + lx * cos - lz * sin;
      const wz = cz + lx * sin + lz * cos;
      positions.push(wx, cy, wz);
    }
    indices.push(vBase, vBase + 1, vBase + 2, vBase, vBase + 2, vBase + 3);
    vBase += 4;
  };

  for (let s = 8; s < total - 4; s += step) {
    const idx = findIndexAtS(pts, s);
    const a = pts[idx];
    const b = pts[Math.min(pts.length - 1, idx + 1)];
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const t = (s - a.s) / Math.max(1e-3, b.s - a.s);
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t + 0.105;
    const z = a.z + (b.z - a.z) * t;
    pushQuad(x, y, z, yaw, 0.18, 1.2);
  }

  if (positions.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const dashMat = new THREE.MeshBasicMaterial({
      color: 0xf0f0f6,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    group.add(new THREE.Mesh(geo, dashMat));
  }

  const sectorMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  for (const frac of [1 / 3, 2 / 3]) {
    const s = total * frac;
    const idx = findIndexAtS(pts, s);
    const a = pts[idx];
    const b = pts[Math.min(pts.length - 1, idx + 1)];
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const t = (s - a.s) / Math.max(1e-3, b.s - a.s);
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const z = a.z + (b.z - a.z) * t;
    const line = new THREE.Mesh(new THREE.PlaneGeometry(a.width * 0.9, 0.6), sectorMat);
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = -yaw;
    line.position.set(x, y + 0.108, z);
    group.add(line);
  }

  root.add(group);
}

function addGround(root: THREE.Group, pts: TrackData['points'], quality: QualityProfile): void {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of pts) {
    const pad = p.width;
    minX = Math.min(minX, p.x - pad);
    maxX = Math.max(maxX, p.x + pad);
    minZ = Math.min(minZ, p.z - pad);
    maxZ = Math.max(maxZ, p.z + pad);
  }
  // Far apron so camera never sees a hard terrain cliff / black void past the ribbon
  const margin = 480;
  const gw = maxX - minX + margin * 2;
  const gd = maxZ - minZ + margin * 2;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  // Gently varying heightfield following track corridor + hills / harbor
  // Medium: ~72 segs (~5k verts) — cheap enough for 60 FPS; High/Ultra denser cliffs
  const segs =
    quality.sceneryStep >= 5 ? 56 : quality.sceneryStep >= 3 ? 80 : quality.treeDetail >= 8 ? 140 : 112;
  const geo = new THREE.PlaneGeometry(gw, gd, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx;
    const z = pos.getZ(i) + cz;
    pos.setY(i, terrainH(pts, x, z));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const groundMat = quality.useLambertScenery
    ? new THREE.MeshLambertMaterial({ color: 0x3d5238, map: makeGroundTexture() })
    : new THREE.MeshStandardMaterial({
        color: 0x3d5238,
        map: makeGroundTexture(),
        roughness: 0.95,
        metalness: 0,
      });
  const ground = new THREE.Mesh(geo, groundMat);
  ground.position.set(cx, 0, cz);
  ground.receiveShadow = true;
  ground.name = 'terrain';
  root.add(ground);

  // Soft contact darkening under corridor — follows terrain, stays below asphalt
  const aoMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
  });
  const { left, right } = getTrackEdges(pts, 1.65);
  const ao = new THREE.Mesh(buildRibbonGeometrySkipJoinCoplanar(left, right, -0.08, pts, 16), aoMat);
  ao.renderOrder = -2;
  root.add(ao);
}

/** Soft asphalt edge darken — wider translucent ribbon, no polygonOffset flicker */
function addSoftEdgeBlend(
  root: THREE.Group,
  left: THREE.Vector3[],
  right: THREE.Vector3[],
  pts: TrackPoint[],
): void {
  const outerL = offsetEdge(left, -1, 0.55);
  const outerR = offsetEdge(right, 1, 0.55);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x121214,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  // Sit just under asphalt top — never coplanar with kerbs at join / overpass
  const leftBand = new THREE.Mesh(
    buildRibbonGeometrySkipJoinCoplanar(outerL, left, 0.07, pts, 18),
    mat,
  );
  leftBand.renderOrder = 1;
  root.add(leftBand);
  const rightBand = new THREE.Mesh(
    buildRibbonGeometrySkipJoinCoplanar(right, outerR, 0.07, pts, 18),
    mat.clone(),
  );
  rightBand.renderOrder = 1;
  root.add(rightBand);
}

/** Grass + concrete runoff strips so sky never shows under props beside the ribbon */
function addShoulderStrips(
  root: THREE.Group,
  left: THREE.Vector3[],
  right: THREE.Vector3[],
  pts: TrackPoint[],
  quality: QualityProfile,
): void {
  const concreteMat = quality.useLambertScenery
    ? new THREE.MeshLambertMaterial({ color: 0x6a6e74 })
    : new THREE.MeshStandardMaterial({ color: 0x6a6e74, roughness: 0.92, metalness: 0.05 });
  const grassMat = quality.useLambertScenery
    ? new THREE.MeshLambertMaterial({ color: 0x3a5536 })
    : new THREE.MeshStandardMaterial({ color: 0x3a5536, roughness: 0.96, metalness: 0 });

  for (const [edge, side] of [[left, -1], [right, 1]] as const) {
    // Concrete runoff immediately outside asphalt (~0.2–2.4 m)
    // Y well below asphalt so join / figure-8 stays clean
    const cInner = offsetEdge(edge, side, 0.15);
    const cOuter = offsetEdge(edge, side, 2.4);
    const cL = side < 0 ? cOuter : cInner;
    const cR = side < 0 ? cInner : cOuter;
    const concrete = new THREE.Mesh(
      buildRibbonGeometrySkipJoinCoplanar(cL, cR, 0.015, pts, 22),
      concreteMat,
    );
    concrete.receiveShadow = true;
    root.add(concrete);

    // Grass strip farther out (~2.2–8 m) — fills gaps under buildings/trees
    const gInner = offsetEdge(edge, side, 2.2);
    const gOuter = offsetEdge(edge, side, 8.5);
    const gL = side < 0 ? gOuter : gInner;
    const gR = side < 0 ? gInner : gOuter;
    const grassGeo = buildRibbonGeometryTerrain(gL, gR, pts, 0.005);
    const grass = new THREE.Mesh(grassGeo, grassMat);
    grass.receiveShadow = true;
    root.add(grass);
  }
}

/** Ribbon whose vertex Y follows terrain (for grass fill beside elevated track) */
function buildRibbonGeometryTerrain(
  left: THREE.Vector3[],
  right: THREE.Vector3[],
  pts: TrackPoint[],
  yLift: number,
): THREE.BufferGeometry {
  const n = Math.min(left.length, right.length);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < n; i++) {
    // Never let grass triangles rise into / through nearby asphalt ribbons
    const lCeil = left[i].y - 0.08;
    const rCeil = right[i].y - 0.08;
    const ly =
      Math.min(lCeil, Math.max(left[i].y - 0.18, terrainH(pts, left[i].x, left[i].z))) + yLift;
    const ry =
      Math.min(rCeil, Math.max(right[i].y - 0.18, terrainH(pts, right[i].x, right[i].z))) + yLift;
    positions.push(left[i].x, ly, left[i].z);
    positions.push(right[i].x, ry, right[i].z);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(0, i / Math.max(n - 1, 1), 1, i / Math.max(n - 1, 1));
  }
  for (let i = 0; i < n - 1; i++) {
    // Omit grass where another ribbon is nearly coplanar (figure-8 shoulders)
    if (i < pts.length && (hasCoplanarForeignRibbon(pts, i) || hasCoplanarForeignRibbon(pts, i + 1))) {
      continue;
    }
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Overpass / viaduct supports.
 *
 * Pillars are placed ONLY outside every driving ribbon (asphalt + margin).
 * At plan-view crossings the lower road often lies under the upper "edge", so a
 * naive ±halfWidth offset lands pillars on the lower centerline — we push along
 * lateral + along-track until clear, or skip.
 *
 * No underside deck boxes on the centerline (those read as mid-track beams /
 * z-fighting plates on the asphalt).
 */
function addOverpassSupports(
  root: THREE.Group,
  pts: TrackData['points'],
  quality: QualityProfile,
): void {
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x6a7078, roughness: 0.7, metalness: 0.2 });

  const crossings = findCrossingSpans(pts);
  const crossingIdx = new Set<number>();
  for (const span of crossings) {
    for (let i = span.i0; i <= span.i1; i++) crossingIdx.add(i);
  }

  const PILLAR_HALF = 0.35;
  const PILLAR_MARGIN = 1.6; // outside asphalt edge
  const minClear = PILLAR_HALF + PILLAR_MARGIN;

  let nextPillarS = -1e9;
  const pillarSpacing = 10;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    if (a.s < nextPillarS) continue;
    const b = pts[i + 1];
    const midY = (a.y + b.y) * 0.5;
    // Pillars only under real overpasses / high decks — avoids orphan columns on climb ramps
    if (midY < 5.5) continue;
    if (!crossingIdx.has(i) && midY < 8.5) continue;
    nextPillarS = a.s + pillarSpacing;
    const mx = (a.x + b.x) * 0.5;
    const mz = (a.z + b.z) * 0.5;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const groundY = crossingIdx.has(i)
      ? (crossings.find((s) => i >= s.i0 && i <= s.i1)?.lowerY ?? 0)
      : terrainH(pts, mx, mz);
    const pillarTop = midY - 0.55;
    const pillarH = pillarTop - groundY;
    if (pillarH < 2.0) continue;

    const placed = placePillarsOffRibbon(pts, mx, mz, yaw, a.width * 0.5, minClear);
    for (const pos of placed) {
      const col = new THREE.Mesh(
        new THREE.BoxGeometry(PILLAR_HALF * 2, pillarH, PILLAR_HALF * 2),
        pillarMat,
      );
      col.position.set(pos.x, groundY + pillarH / 2, pos.z);
      col.castShadow = quality.sceneryCastShadow;
      col.receiveShadow = true;
      root.add(col);
    }
  }
}

/**
 * Find left/right pillar XZ outside ALL track ribbons.
 * Tries lateral push, then lateral + along-track escapes (needed at X-crossings).
 */
function placePillarsOffRibbon(
  pts: TrackPoint[],
  mx: number,
  mz: number,
  yaw: number,
  halfW: number,
  minClear: number,
): { x: number; z: number }[] {
  const latX = Math.cos(yaw);
  const latZ = -Math.sin(yaw);
  const alongX = Math.sin(yaw);
  const alongZ = Math.cos(yaw);
  const out: { x: number; z: number }[] = [];

  for (const side of [-1, 1] as const) {
    let found: { x: number; z: number } | null = null;
    for (let dist = halfW + minClear; dist <= halfW + minClear + 28 && !found; dist += 1.25) {
      for (const along of [0, 3, -3, 6, -6, 10, -10, 14, -14]) {
        const x = mx + latX * side * dist + alongX * along;
        const z = mz + latZ * side * dist + alongZ * along;
        const { clearance } = nearestEdgeClearance(pts, x, z);
        if (clearance >= minClear) {
          found = { x, z };
          break;
        }
      }
    }
    if (found) out.push(found);
  }
  return out;
}

interface CrossingSpan {
  i0: number;
  i1: number;
  lowerY: number;
}

/** Find contiguous elevated indices that pass over a lower track segment in XZ. */
function findCrossingSpans(pts: TrackPoint[]): CrossingSpan[] {
  const n = pts.length;
  const total = pts[n - 1]?.s || 1;
  const isCrossing = new Array<boolean>(n).fill(false);
  const lowerYAt = new Array<number>(n).fill(0);

  for (let i = 0; i < n - 1; i++) {
    const a = pts[i];
    if (a.y < 3.8) continue;
    let bestClear = 0;
    let bestLowY = 0;
    for (let j = 0; j < n - 1; j++) {
      if (Math.abs(i - j) < 4) continue;
      const b = pts[j];
      let along = Math.abs(a.s - b.s);
      if (along > total * 0.5) along = total - along;
      if (along < 55) continue;
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      const maxW = (a.width + b.width) * 0.65 + 8;
      if (dist > maxW) continue;
      const clear = a.y - b.y;
      if (clear < 3.2) continue;
      if (clear > bestClear) {
        bestClear = clear;
        bestLowY = b.y;
      }
    }
    if (bestClear >= 3.2) {
      isCrossing[i] = true;
      lowerYAt[i] = bestLowY;
    }
  }

  const spans: CrossingSpan[] = [];
  let i = 0;
  while (i < n - 1) {
    if (!isCrossing[i]) {
      i++;
      continue;
    }
    const i0 = i;
    let lowY = lowerYAt[i];
    while (i < n - 1 && isCrossing[i]) {
      lowY = Math.min(lowY, lowerYAt[i]);
      i++;
    }
    const i1 = Math.max(i0, i - 1);
    // Expand one sample on each side for continuity of the deck
    spans.push({
      i0: Math.max(0, i0 - 1),
      i1: Math.min(n - 2, i1 + 1),
      lowerY: lowY,
    });
  }
  return spans;
}


/** True if an axis-aligned XZ box stays outside all asphalt ribbons (+ margin). */
function boxClearsRibbon(
  pts: TrackPoint[],
  cx: number,
  cz: number,
  w: number,
  d: number,
  margin: number,
  samples = 10,
): boolean {
  for (let i = 0; i <= samples; i++) {
    for (let j = 0; j <= samples; j++) {
      const x = cx - w / 2 + (w * i) / samples;
      const z = cz - d / 2 + (d * j) / samples;
      const { clearance } = nearestEdgeClearance(pts, x, z);
      if (clearance < margin) return false;
    }
  }
  return true;
}

function addHarbor(root: THREE.Group, pts: TrackPoint[], quality: QualityProfile): void {
  // Harbor water — Basic on Low/Medium; reflective + optional animated normals on High/Ultra
  let waterMat: THREE.Material;
  if (quality.reflectiveWater) {
    const nrm = makeWaterNormalTexture();
    waterMat = new THREE.MeshStandardMaterial({
      color: 0x0e5a78,
      metalness: 0.72,
      roughness: 0.18,
      envMapIntensity: 1.35,
      normalMap: nrm,
      normalScale: new THREE.Vector2(0.55, 0.55),
      transparent: true,
      opacity: 0.92,
    });
    (waterMat as THREE.MeshStandardMaterial).userData.waterNormal = nrm;
  } else {
    waterMat = new THREE.MeshBasicMaterial({
      color: 0x0f6a88,
      transparent: true,
      opacity: 0.88,
    });
  }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(280, 180, 1, 1), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(230, -0.06, -50);
  water.frustumCulled = true;
  water.name = 'harborWater';
  water.userData.animatedWater = quality.animatedWater;
  root.add(water);

  const quayMat = quality.useLambertScenery
    ? new THREE.MeshLambertMaterial({ color: 0x8a8e96 })
    : new THREE.MeshStandardMaterial({ color: 0x8a8e96, roughness: 0.7, metalness: 0.15 });

  // Harbor quay / apron — MUST stay off every driving ribbon (old 260×14 slab at
  // z=42 cut through Tabac). Place inside the loop toward the water, thin height.
  const quaySpecs: { x: number; z: number; w: number; d: number; h: number; y: number }[] = [
    { x: 245, z: -5, w: 100, d: 10, h: 0.55, y: 0.22 },
    { x: 255, z: -18, w: 70, d: 12, h: 0.4, y: 0.15 },
  ];
  if (quality.maxDecor >= 40) {
    quaySpecs.push({ x: 200, z: -28, w: 48, d: 8, h: 0.35, y: 0.12 });
  }
  if (quality.maxDecor >= 64) {
    quaySpecs.push({ x: 290, z: -12, w: 36, d: 7, h: 0.38, y: 0.14 });
  }
  for (const q of quaySpecs) {
    if (!boxClearsRibbon(pts, q.x, q.z, q.w, q.d, 3.5)) continue;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(q.w, q.h, q.d), quayMat);
    mesh.position.set(q.x, q.y, q.z);
    mesh.receiveShadow = true;
    mesh.castShadow = quality.sceneryCastShadow;
    root.add(mesh);
  }

  // Warm hull / dark cabin — never place white+blue boxes on asphalt (post-tunnel).
  const hullMat = quality.useLambertScenery
    ? new THREE.MeshLambertMaterial({ color: 0xc8b8a0 })
    : new THREE.MeshStandardMaterial({ color: 0xc8b8a0, roughness: 0.45, metalness: 0.25 });
  const cabinMat = quality.useLambertScenery
    ? new THREE.MeshLambertMaterial({ color: 0x3a3834 })
    : new THREE.MeshStandardMaterial({ color: 0x3a3834, roughness: 0.4, metalness: 0.35 });
  // Deep in the harbor basin (south of Nouvelle Chicane) — must clear ribbon by hull half-diag.
  const boats: [number, number, number][] = [
    [190, -155, 0.4],
    [240, -165, -0.5],
  ];
  if (quality.maxDecor >= 14) {
    boats.push([160, -170, 1.0], [285, -150, -0.25]);
  }
  if (quality.maxDecor >= 30) {
    boats.push([215, -180, 0.65]);
  }
  if (quality.maxDecor >= 48) {
    boats.push([175, -188, 0.2], [265, -175, -0.7]);
  }
  if (quality.maxDecor >= 80) {
    boats.push([230, -195, 0.9]);
  }
  const hullHalf = Math.hypot(14 / 2, 4 / 2);
  for (const [bx, bz, rot] of boats) {
    // Reject anything that would sit on / through driveable asphalt
    if (!boxClearsRibbon(pts, bx, bz, 14, 4, 4.0)) continue;
    if (intersectsRoadRibbon(pts, bx, bz, hullHalf, 3.0)) continue;
    const hull = new THREE.Mesh(new THREE.BoxGeometry(14, 2.2, 4), hullMat);
    hull.position.set(bx, 0.55, bz);
    hull.rotation.y = rot;
    hull.castShadow = quality.sceneryCastShadow;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(6, 2.5, 3.2), cabinMat);
    cabin.position.set(bx - Math.sin(rot) * 2, 2.3, bz - Math.cos(rot) * 2);
    cabin.rotation.y = rot;
    cabin.castShadow = quality.sceneryCastShadow;
    root.add(hull, cabin);
  }
}

function findIndexAtS(pts: { s: number }[], s: number): number {
  for (let i = 0; i < pts.length - 1; i++) {
    if (s >= pts[i].s && s <= pts[i + 1].s) return i;
  }
  return 0;
}

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

  // Closed-loop edges duplicate the first point at the end — keep it for a proper
  // closing quad, but skip any near-zero-length segment that would z-fight.
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

/** True if a world XZ sample sits on (or inside) a foreign asphalt ribbon. */
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
    // Stacked decks (ΔY large) are not the same driveable surface
    const py = a.y + (b.y - a.y) * t;
    if (Math.abs(selfY - py) > dyMax) continue;
    return true;
  }
  return false;
}

/** Tecpro-like soft walls — red/white foam stacks along asphalt edge */
function addTecproBarriers(
  root: THREE.Group,
  edge: THREE.Vector3[],
  side: number,
  quality: QualityProfile,
  pts: TrackPoint[],
): void {
  const wallBase = offsetEdge(edge, side, BARRIER_OUT);
  const wallH = 1.25;
  const n = Math.min(wallBase.length, pts.length);
  if (n < 2) return;
  const total = pts[pts.length - 1]?.s || 1;
  // No along-track S/F gap — outer Tecpro must be continuous (grass exits closed).
  // Mid-asphalt protection: coplanar / foreign-asphalt / collapsed-miter checks below.
  // Cap ribbon still uses a tiny seam skip so the top plate does not double at the join.
  const skipM = 0;
  const capSkipM = 2.5;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let v = 0;
  let along = 0;

  // Pre-smooth wall Y along the edge so fence stays level/continuous
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
    if (s0 < skipM || s0 > total - skipM || s1 < skipM || s1 > total - skipM) {
      along += Math.hypot(wallBase[i + 1].x - wallBase[i].x, wallBase[i + 1].z - wallBase[i].z);
      continue;
    }
    // No wall stack where another ribbon is coplanar (Suzuka/Interlagos near-misses)
    if (hasCoplanarForeignRibbon(pts, i) || hasCoplanarForeignRibbon(pts, i + 1)) {
      along += Math.hypot(wallBase[i + 1].x - wallBase[i].x, wallBase[i + 1].z - wallBase[i].z);
      continue;
    }
    // Dedicated pit entry/exit — open right Tecpro into pit strip
    if (
      isPitTecproGap(s0, total, side) ||
      isPitTecproGap(s1, total, side)
    ) {
      along += Math.hypot(wallBase[i + 1].x - wallBase[i].x, wallBase[i + 1].z - wallBase[i].z);
      continue;
    }
    const a = wallBase[i];
    const b = wallBase[i + 1];
    // Collapsed miter pulls the edge inward — wall would sit mid-asphalt
    const c0 = pts[Math.min(i, pts.length - 1)];
    const c1 = pts[Math.min(i + 1, pts.length - 1)];
    const lat0 = Math.hypot(a.x - c0.x, a.z - c0.z);
    const lat1 = Math.hypot(b.x - c1.x, b.z - c1.z);
    if (lat0 < c0.width * 0.35 || lat1 < c1.width * 0.35) {
      along += Math.hypot(b.x - a.x, b.z - a.z);
      continue;
    }
    // Never place Tecpro ON driveable asphalt of another (or self-crossed) ribbon
    if (
      pointOnForeignAsphalt(pts, a.x, a.z, i, 0.35, a.y) ||
      pointOnForeignAsphalt(pts, b.x, b.z, i + 1, 0.35, b.y)
    ) {
      along += Math.hypot(b.x - a.x, b.z - a.z);
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
    // Slight outward offset so wall doesn't sit in asphalt
    const ox = nx * 0.12;
    const oz = nz * 0.12;
    const ya = wallY[i];
    const yb = wallY[i + 1];
    const u0 = along * 0.35;
    const u1 = (along + seg) * 0.35;
    positions.push(a.x + ox, ya, a.z + oz);
    positions.push(a.x + ox, ya + wallH, a.z + oz);
    positions.push(b.x + ox, yb, b.z + oz);
    positions.push(b.x + ox, yb + wallH, b.z + oz);
    for (let k = 0; k < 4; k++) normals.push(nx, 0, nz);
    uvs.push(u0, 0, u0, 1, u1, 0, u1, 1);
    if (side > 0) indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    else indices.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    v += 4;
    along += seg;
  }
  if (!indices.length) return;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  const tecproTex = makeTecproTexture();
  tecproTex.repeat.set(1, 1);
  const wallMat = quality.useLambertScenery
    ? new THREE.MeshLambertMaterial({ map: tecproTex, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({
        map: tecproTex,
        metalness: 0.02,
        roughness: 0.72,
        envMapIntensity: 0.35,
        side: THREE.DoubleSide,
      });
  const wall = new THREE.Mesh(geo, wallMat);
  wall.castShadow = quality.sceneryCastShadow;
  wall.receiveShadow = true;
  wall.name = 'tecpro';
  root.add(wall);

  // Thin top cap (red) — soft-wall stack silhouette, not blue/white cubes
  const capMat = quality.useLambertScenery
    ? new THREE.MeshLambertMaterial({ color: 0xc81018 })
    : new THREE.MeshStandardMaterial({ color: 0xc81018, roughness: 0.7, metalness: 0.05 });
  const capInner = offsetEdge(edge, side, 1.05);
  const capOuter = offsetEdge(edge, side, 1.4);
  const cL = side < 0 ? capOuter : capInner;
  const cR = side < 0 ? capInner : capOuter;
  const cap = new THREE.Mesh(
    buildRibbonGeometrySkipJoinCoplanar(cL, cR, wallH + 0.02, pts, capSkipM),
    capMat,
  );
  cap.name = 'tecproCap';
  root.add(cap);
}

/** Branded boards behind Tecpro — fictional FORJA/TEC/HYDRO etc. (InstancedMesh) */
function addSponsorBoards(
  root: THREE.Group,
  edge: THREE.Vector3[],
  side: number,
  quality: QualityProfile,
  pts: TrackPoint[],
): void {
  const boardBase = offsetEdge(edge, side, 2.15);
  const n = Math.min(boardBase.length, pts.length);
  if (n < 3) return;
  const total = pts[pts.length - 1]?.s || 1;
  const skipM = 18;
  const spacing = quality.sceneryStep >= 4 ? 28 : quality.sceneryStep >= 3 ? 20 : 14;
  const atlas = makeSponsorAtlas();
  const cellH = 1 / SPONSOR_NAMES.length;
  const boardW = 5.5;
  const boardH = 1.35;
  const maxBoards = quality.sceneryStep >= 5 ? 12 : quality.sceneryStep >= 3 ? 22 : 32;

  type BoardX = { x: number; y: number; z: number; yaw: number; si: number };
  const boards: BoardX[] = [];
  let nextS = skipM + 4 + (side > 0 ? spacing * 0.5 : 0);

  for (let i = 1; i < n - 1 && boards.length < maxBoards; i++) {
    const s = pts[Math.min(i, pts.length - 1)].s;
    if (s < nextS) continue;
    if (s > total - skipM) break;
    nextS = s + spacing;
    if (hasCoplanarForeignRibbon(pts, i)) continue;
    // Keep pit corridor free of boards (right-side pit strip)
    if (side > 0 && isPitCorridorS(s, total)) continue;

    const p = boardBase[i];
    let dx = boardBase[i + 1].x - boardBase[i - 1].x;
    let dz = boardBase[i + 1].z - boardBase[i - 1].z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const nx = dz * side;
    const nz = -dx * side;
    boards.push({
      x: p.x + nx * 0.05,
      y: p.y + 0.55 + boardH * 0.5,
      z: p.z + nz * 0.05,
      yaw: Math.atan2(nx, nz),
      si: boards.length % SPONSOR_NAMES.length,
    });
  }
  if (!boards.length) return;

  const geo = new THREE.PlaneGeometry(boardW, boardH);
  const dummy = new THREE.Object3D();
  // One InstancedMesh per sponsor type (≤8 draw calls total per side)
  for (let si = 0; si < SPONSOR_NAMES.length; si++) {
    const list = boards.filter((b) => b.si === si);
    if (!list.length) continue;
    const mat = quality.useLambertScenery
      ? new THREE.MeshBasicMaterial({
          map: atlas.clone(),
          side: THREE.DoubleSide,
          toneMapped: false,
        })
      : new THREE.MeshStandardMaterial({
          map: atlas.clone(),
          side: THREE.DoubleSide,
          roughness: 0.55,
          metalness: 0.15,
          envMapIntensity: 0.4,
          toneMapped: true,
        });
    const map = mat.map!;
    map.offset.set(0, 1 - (si + 1) * cellH);
    map.repeat.set(1, cellH);
    map.needsUpdate = true;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    mesh.castShadow = quality.sceneryCastShadow;
    mesh.frustumCulled = true;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(0, b.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    root.add(mesh);
  }

  // Shared posts under boards (single InstancedMesh)
  const postMat = quality.useLambertScenery
    ? new THREE.MeshLambertMaterial({ color: 0x333338 })
    : new THREE.MeshStandardMaterial({ color: 0x333338, roughness: 0.6, metalness: 0.4 });
  const postGeo = new THREE.BoxGeometry(0.12, 0.55, 0.12);
  const posts = new THREE.InstancedMesh(postGeo, postMat, boards.length);
  posts.castShadow = quality.sceneryCastShadow;
  for (let i = 0; i < boards.length; i++) {
    const b = boards[i];
    dummy.position.set(b.x, b.y - boardH * 0.5 - 0.28, b.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    posts.setMatrixAt(i, dummy.matrix);
  }
  posts.instanceMatrix.needsUpdate = true;
  root.add(posts);
}

function addEdgeLine(
  root: THREE.Group,
  edge: THREE.Vector3[],
  isLeft: boolean,
  pts: TrackPoint[],
): void {
  const inner = offsetEdge(edge, isLeft ? 1 : -1, 0.15);
  const outer = offsetEdge(edge, isLeft ? 1 : -1, 0.45);
  const left = isLeft ? outer : inner;
  const right = isLeft ? inner : outer;
  const mat = new THREE.MeshStandardMaterial({
    color: 0xd0d0d8,
    roughness: 0.85,
    metalness: 0.02,
  });
  // Above asphalt; skip join to avoid S/F stack flicker / white glow patches
  root.add(new THREE.Mesh(buildRibbonGeometrySkipJoinCoplanar(left, right, 0.105, pts, 16), mat));
}


/** True if another centerline sample (far along S) sits nearly coplanar under/over this point. */
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
    // Include shoulder/kerb/Tecpro footprint, not just asphalt half-width
    const half = (a.width + pts[j].width) * 0.5 + 3.2;
    if (dist > half) continue;
    if (Math.abs(a.y - pts[j].y) <= dyMax) return true;
  }
  return false;
}


/** SkipJoin + omit quads where another ribbon is coplanar (figure-8 / stacked climbs). */
function buildRibbonGeometrySkipJoinCoplanar(
  left: THREE.Vector3[],
  right: THREE.Vector3[],
  yLift: number,
  pts: TrackPoint[],
  skipM: number,
): THREE.BufferGeometry {
  const n = Math.min(left.length, right.length, pts.length);
  const total = pts[pts.length - 1]?.s || 1;
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
  const nearJoin = (i: number): boolean => {
    const s = pts[Math.min(i, pts.length - 1)].s;
    return s < skipM || s > total - skipM;
  };
  for (let i = 0; i < n - 1; i++) {
    if (nearJoin(i) || nearJoin(i + 1)) continue;
    if (hasCoplanarForeignRibbon(pts, i) || hasCoplanarForeignRibbon(pts, i + 1)) continue;
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

function addKerbs(
  root: THREE.Group,
  edge: THREE.Vector3[],
  isLeft: boolean,
  quality: QualityProfile,
  pts: TrackPoint[],
): void {
  const kerbTex = makeKerbTexture();
  kerbTex.repeat.set(28, 1);
  const mat = quality.useLambertScenery
    ? new THREE.MeshLambertMaterial({ map: kerbTex })
    : new THREE.MeshStandardMaterial({
        map: kerbTex,
        roughness: 0.6,
        metalness: 0.05,
      });
  const side = isLeft ? -1 : 1;
  const inner = offsetEdge(edge, side, 0.05);
  const outer = offsetEdge(edge, side, 1.05);
  const left = isLeft ? outer : inner;
  const right = isLeft ? inner : outer;
  // Slightly above asphalt (epsilon); skip join + coplanar foreign ribbons
  const kerb = new THREE.Mesh(
    buildRibbonGeometrySkipJoinCoplanar(left, right, 0.112, pts, 20),
    mat,
  );
  kerb.receiveShadow = true;
  kerb.castShadow = quality.sceneryCastShadow;
  root.add(kerb);

  const lipMat = quality.useLambertScenery
    ? new THREE.MeshLambertMaterial({ color: 0xdddddd })
    : new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.55 });
  const lipInner = offsetEdge(edge, side, 0.5);
  const lipOuter = offsetEdge(edge, side, 0.7);
  const lipL = isLeft ? lipOuter : lipInner;
  const lipR = isLeft ? lipInner : lipOuter;
  root.add(new THREE.Mesh(buildRibbonGeometrySkipJoinCoplanar(lipL, lipR, 0.13, pts, 20), lipMat));
}

/**
 * Large readable rock / cliff landmark at Monaco tunnel entrance (Portier).
 * Kept clearly OFF asphalt; tiered mesh count for Medium ~60 FPS.
 */
function addTunnelEntranceRocks(
  root: THREE.Group,
  pts: TrackData['points'],
  entranceFrac: number,
  quality: QualityProfile,
): void {
  const total = pts[pts.length - 1]?.s || 1;
  const entranceS = total * entranceFrac;
  const idx = findIndexAtS(pts, entranceS);
  const a = pts[idx];
  const b = pts[Math.min(pts.length - 1, idx + 1)];
  const yaw = Math.atan2(b.x - a.x, b.z - a.z);
  // Landward side of tunnel mouth (+lateral along yaw normal)
  const side = 1;
  const nx = Math.cos(yaw) * side;
  const nz = -Math.sin(yaw) * side;

  const group = new THREE.Group();
  group.name = 'tunnel-entrance-rocks';

  const rockTex = makeRockTexture();
  rockTex.repeat.set(2.2, 2.2);
  const rockMat = quality.useLambertScenery
    ? new THREE.MeshLambertMaterial({ color: 0x7a766e, map: rockTex })
    : new THREE.MeshStandardMaterial({
        color: 0x7a766e,
        map: rockTex,
        roughness: 0.9,
        metalness: 0.04,
        envMapIntensity: 0.25,
      });
  const darkMat = quality.useLambertScenery
    ? new THREE.MeshLambertMaterial({ color: 0x4a4842, map: rockTex })
    : new THREE.MeshStandardMaterial({
        color: 0x4a4842,
        map: rockTex,
        roughness: 0.94,
        metalness: 0.03,
        envMapIntensity: 0.2,
      });
  const scrubMat = quality.useLambertScenery
    ? new THREE.MeshLambertMaterial({ color: 0x3a6a34 })
    : new THREE.MeshStandardMaterial({ color: 0x3a6a34, roughness: 0.9 });

  // Tier: low fewer chunks; medium+ full landmark; High/Ultra denser cliff face
  const chunks =
    quality.maxDecor >= 60
      ? 14
      : quality.maxDecor >= 40
        ? 11
        : quality.maxDecor >= 30
          ? 9
          : quality.maxDecor >= 20
            ? 7
            : quality.maxDecor >= 12
              ? 5
              : 3;

  const baseOff = a.width * 0.5 + quality.sceneryMargin + 6;
  for (let i = 0; i < chunks; i++) {
    const along = (i - (chunks - 1) * 0.5) * 4.2;
    const out = baseOff + (i % 3) * 2.8 + (i % 2) * 1.4;
    const px = a.x + Math.sin(yaw) * along + nx * out;
    const pz = a.z + Math.cos(yaw) * along + nz * out;
    if (intersectsRoadRibbon(pts, px, pz, 5.5, quality.sceneryMargin + 1.5)) continue;
    const gy = terrainH(pts, px, pz);
    if (!acceptPropY(pts, px, pz, gy, 2.5)) continue;

    const sx = 5.5 + (i % 4) * 1.6;
    const sy = 4.2 + (i % 5) * 1.35 + (i === 0 ? 3.5 : 0);
    const sz = 4.8 + ((i + 1) % 3) * 1.4;
    const geo =
      i % 3 === 0
        ? new THREE.DodecahedronGeometry(1, quality.treeDetail >= 6 ? 1 : 0)
        : i % 3 === 1
          ? new THREE.IcosahedronGeometry(1, quality.treeDetail >= 6 ? 1 : 0)
          : new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geo, i % 2 === 0 ? rockMat : darkMat);
    mesh.position.set(px, gy + sy * 0.42, pz);
    mesh.scale.set(sx, sy, sz);
    mesh.rotation.set(0.15 * (i % 3), yaw + i * 0.35, 0.08 * (i % 2));
    mesh.castShadow = quality.sceneryCastShadow;
    mesh.receiveShadow = true;
    group.add(mesh);

    // Cliff shelf lip on the biggest chunks (readable silhouette)
    if (i < 3 && quality.maxDecor >= 14) {
      const lip = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), darkMat);
      lip.position.set(px - nx * 1.2, gy + sy * 0.85, pz - nz * 1.2);
      lip.scale.set(sx * 0.75, Math.max(1.2, sy * 0.22), sz * 0.7);
      lip.rotation.y = yaw + 0.2;
      lip.castShadow = quality.sceneryCastShadow;
      group.add(lip);
    }

    // Sparse scrub on ledges — Medium+; denser clumps on High/Ultra
    if (quality.maxDecor >= 20 && i % 2 === 0) {
      const scrub = new THREE.Mesh(
        new THREE.ConeGeometry(0.9, 1.2, Math.max(5, quality.treeDetail)),
        scrubMat,
      );
      scrub.position.set(px + nx * 0.8, gy + sy * 0.78, pz + nz * 0.8);
      scrub.scale.set(1.4, 1.1, 1.4);
      group.add(scrub);
      if (quality.maxDecor >= 48) {
        const scrub2 = scrub.clone();
        scrub2.position.set(px + nx * 1.6, gy + sy * 0.72, pz + nz * 0.35);
        scrub2.scale.set(1.1, 0.95, 1.1);
        group.add(scrub2);
      }
    }
  }

  // Tall landmark boulder closest to portal (always, if clear)
  const lx = a.x + nx * (baseOff + 2.5);
  const lz = a.z + nz * (baseOff + 2.5);
  if (!intersectsRoadRibbon(pts, lx, lz, 6, quality.sceneryMargin + 2)) {
    const gy = terrainH(pts, lx, lz);
    if (acceptPropY(pts, lx, lz, gy, 2.5)) {
      const landmark = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1, quality.treeDetail >= 6 ? 1 : 0),
        rockMat,
      );
      landmark.position.set(lx, gy + 5.2, lz);
      landmark.scale.set(9.5, 11.5, 8.5);
      landmark.rotation.set(0.2, yaw + 0.6, -0.12);
      landmark.castShadow = quality.sceneryCastShadow;
      landmark.receiveShadow = true;
      landmark.name = 'tunnel-portal-boulder';
      group.add(landmark);
    }
  }

  root.add(group);
}

function addTunnel(
  root: THREE.Group,
  pts: TrackData['points'],
  startFrac: number,
  endFrac: number,
  quality: QualityProfile,
): void {
  const total = pts[pts.length - 1].s;
  const startS = total * startFrac;
  const endS = total * endFrac;
  const mat = new THREE.MeshStandardMaterial({ color: 0x333840, roughness: 0.9 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 1 });
  const lightMat = new THREE.MeshStandardMaterial({
    color: 0xffe8b0,
    emissive: 0xffcc66,
    emissiveIntensity: 1.4,
    roughness: 0.4,
  });

  let lightBudget = 0;
  const tunSpacing = quality.sceneryStep >= 4 ? 6.5 : 4.5;
  let nextTunS = startS;
  for (let i = 0; i < pts.length - 1; i++) {
    if (pts[i].s < startS || pts[i].s > endS) continue;
    if (pts[i].s + 1e-3 < nextTunS) continue;
    nextTunS = pts[i].s + tunSpacing;
    const a = pts[i];
    // Span roughly tunSpacing along centerline for continuous tunnel slabs
    let j = i + 1;
    while (j < pts.length - 1 && pts[j].s < a.s + tunSpacing * 0.95) j++;
    const b = pts[Math.min(pts.length - 1, j)];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const hw = a.width / 2 + 2.2;
    const midY = (a.y + b.y) * 0.5;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;

    const ceil = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 0.5, len + 0.2), ceilMat);
    ceil.position.set(mx, midY + 4.2, mz);
    ceil.rotation.y = yaw;
    ceil.castShadow = quality.sceneryCastShadow;
    root.add(ceil);

    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4, len), mat);
      w.position.set(
        mx + Math.cos(yaw) * s * hw,
        midY + 2,
        mz - Math.sin(yaw) * s * hw,
      );
      w.rotation.y = yaw;
      w.castShadow = quality.sceneryCastShadow;
      root.add(w);
    }

    // Overhead tunnel lamps every ~2 segments
    lightBudget++;
    if (lightBudget % 2 === 0) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(hw * 1.2, 0.12, 0.35), lightMat);
      lamp.position.set(mx, midY + 3.85, mz);
      lamp.rotation.y = yaw;
      root.add(lamp);
      if (quality.tunnelPointLights) {
        const pl = new THREE.PointLight(0xffe0a0, 1.6, 18, 2);
        pl.position.set(mx, midY + 3.5, mz);
        root.add(pl);
      }
    }
  }
}

/**
 * Min distance from asphalt edge to prop center so AABB stays outside
 * asphalt + barriers + margin. `halfExtent` is half-size toward the track.
 */
function minOffsetFromEdge(halfExtent: number, margin: number): number {
  return BARRIER_OUT + margin + halfExtent;
}

/** Lateral clearance from nearest centerline: |lat| - width/2 (negative = on asphalt). */
function nearestEdgeClearance(
  pts: TrackPoint[],
  x: number,
  z: number,
): { clearance: number; y: number } {
  let best = Infinity;
  let bestY = 0;
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-6) continue;
    let t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const dist = Math.hypot(x - px, z - pz);
    const width = a.width + (b.width - a.width) * t;
    const clearance = dist - width * 0.5;
    if (clearance < best) {
      best = clearance;
      bestY = a.y + (b.y - a.y) * t;
    }
  }
  return { clearance: best, y: bestY };
}

/** True if circular approx of AABB intersects asphalt+barrier+margin ribbon. */
function intersectsRoadRibbon(
  pts: TrackPoint[],
  x: number,
  z: number,
  radius: number,
  margin: number,
): boolean {
  const need = BARRIER_OUT + margin + radius;
  const { clearance } = nearestEdgeClearance(pts, x, z);
  return clearance < need;
}

/**
 * Sample along outward normal from track edge. Push out / reject if AABB hits ribbon.
 * Never places near centerline via random offsets.
 */
function placeAlongEdgeNormal(
  pts: TrackPoint[],
  edge: THREE.Vector3[],
  i: number,
  side: number,
  halfExtent: number,
  margin: number,
  extra: number,
): { x: number; y: number; z: number; nx: number; nz: number } | null {
  const p = edge[Math.min(i, edge.length - 1)];
  const next = edge[Math.min(edge.length - 1, i + 1)];
  let dx = next.x - p.x;
  let dz = next.z - p.z;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  const nx = dz * side;
  const nz = -dx * side;
  const nlen = Math.hypot(nx, nz) || 1;
  const nnx = nx / nlen;
  const nnz = nz / nlen;

  let dist = minOffsetFromEdge(halfExtent, margin) + extra;
  for (let attempt = 0; attempt < 6; attempt++) {
    const x = p.x + nnx * dist;
    const z = p.z + nnz * dist;
    const radius = halfExtent * 1.05;
    if (!intersectsRoadRibbon(pts, x, z, radius, margin)) {
      // Sit ON terrain (not floating at raw edge Y)
      const groundY = terrainH(pts, x, z);
      // Reject if terrain wildly disagrees with nearby track (bad overpass under-side)
      if (Math.abs(groundY - p.y) > 14) {
        dist += halfExtent * 0.85 + 1.5;
        continue;
      }
      return { x, y: groundY, z, nx: nnx, nz: nnz };
    }
    dist += halfExtent * 0.85 + 1.5;
  }
  return null;
}

/** Drop props whose base Y is not near terrain (floating / buried). */
function acceptPropY(pts: TrackPoint[], x: number, z: number, baseY: number, tol = 1.05): boolean {
  const gy = terrainH(pts, x, z);
  return Math.abs(baseY - gy) <= tol;
}

function makeSceneryMat(
  color: number,
  quality: QualityProfile,
  map?: THREE.Texture,
  emissive?: number,
  emissiveIntensity = 0,
): THREE.Material {
  if (quality.useLambertScenery) {
    return new THREE.MeshLambertMaterial({
      color,
      map,
      emissive: emissive ?? 0x000000,
      emissiveIntensity,
    });
  }
  return new THREE.MeshStandardMaterial({
    color,
    map,
    roughness: 0.78,
    metalness: 0.08,
    emissive: emissive ?? 0x000000,
    emissiveIntensity,
  });
}

/** Monaco-ish buildings / palms / lamps — InstancedMesh + road-clearance placement */
function addScenery(
  root: THREE.Group,
  pts: TrackData['points'],
  left: THREE.Vector3[],
  right: THREE.Vector3[],
  quality: QualityProfile,
  night: boolean,
): void {
  const group = new THREE.Group();
  group.name = 'scenery';
  const step = Math.max(1, quality.sceneryStep);
  const cast = quality.sceneryCastShadow;
  const margin = quality.sceneryMargin;
  const facadeTex = makeBuildingFacadeTexture();
  facadeTex.repeat.set(1, 1);

  const bldgColors = [0x8a8078, 0xc4a882, 0x9a8a7a, 0xb8a090, 0x7a7068, 0xd0c0a8, 0x908878];
  const bldgMat = makeSceneryMat(0xffffff, quality, facadeTex) as THREE.MeshLambertMaterial;
  // allow per-instance tint
  bldgMat.vertexColors = false;

  const treeTrunkMat = makeSceneryMat(0x3a2818, quality);
  const treeLeafMat = makeSceneryMat(0x2d6a30, quality);
  const palmLeafMat = makeSceneryMat(0x3a8a38, quality);
  const lampMat = makeSceneryMat(0x333338, quality);
  const lampEmissive = night ? 1.8 : 0.55;
  const lampGlowMat = makeSceneryMat(0xffe8a0, quality, undefined, 0xffcc66, lampEmissive);

  const detail = Math.max(4, quality.treeDetail);
  const leafSeg = Math.max(5, detail);
  const leafRing = Math.max(4, detail - 1);

  // Shared unit geometries — richer than lollipop cones / plain boxes, still tier-budgeted
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.ConeGeometry(0.72, 1, 4); // pitched hip roof (scale XZ/Y per instance)
  const plinthGeo = new THREE.BoxGeometry(1.08, 0.18, 1.08);
  const trunkCyl = new THREE.CylinderGeometry(0.2, 0.34, 1, detail);
  const palmTrunk = new THREE.CylinderGeometry(0.16, 0.26, 1, detail);
  // Multi-tier pine foliage (3 scaled cones per tree)
  const coneLeaf = new THREE.ConeGeometry(1.35, 1, leafSeg);
  // Deciduous: ellipsoidal crown clusters (not a single lollipop sphere)
  const bushCrown = new THREE.SphereGeometry(1.05, leafSeg, leafRing);
  const palmTop = new THREE.SphereGeometry(1.65, detail, leafRing);
  // Palm frond discs (flattened spheres = cheap frond mass)
  const palmFrond = new THREE.SphereGeometry(1.1, Math.max(5, detail - 1), 4);
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 1, 5);
  const glowGeo = new THREE.SphereGeometry(0.28, 6, 6);

  type Xform = { x: number; y: number; z: number; sx: number; sy: number; sz: number; rotY?: number; color?: number };

  const buildings: Xform[] = [];
  const roofs: Xform[] = [];
  const plinths: Xform[] = [];
  const trunks: Xform[] = [];
  const cones: Xform[] = [];
  const bushCrowns: Xform[] = [];
  const palmTrunks: Xform[] = [];
  const palmTops: Xform[] = [];
  const palmFronds: Xform[] = [];
  const poles: Xform[] = [];
  const glows: Xform[] = [];

  let bCount = 0;
  let tCount = 0;
  let lCount = 0;

  // Distance-based stride — Medium densifies vs prior 3.2×step without Ultra spam
  const strideM = Math.max(5.2, step * (quality.maxBuildings >= 100 ? 2.75 : 3.2));
  let nextS = 0;
  const indices: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    if (pts[i].s + 1e-3 >= nextS) {
      indices.push(i);
      nextS = pts[i].s + strideM;
    }
  }

  const trackLenS = pts[pts.length - 1]?.s || 1;
  for (let ii = 0; ii < indices.length; ii++) {
    const i = indices[ii];
    const useLeft = ii % 2 === 0;
    const edge = useLeft ? left : right;
    const side = useLeft ? -1 : 1;
    // Keep dedicated pit strip clear of buildings / trees / lamps
    if (side > 0 && isPitCorridorS(pts[i].s, trackLenS)) continue;

    // --- Buildings: far offset, large half-extent (denser on Medium+) ---
    const bldgEvery = quality.maxBuildings >= 100 ? 1 : 2;
    if (ii % bldgEvery === 0 && bCount < quality.maxBuildings) {
      const h = 8 + (i % 9) * 2.4 + (i % 3) * 1.1;
      const w = 4.5 + (i % 5) * 1.15;
      const d = 4.5 + ((i + 2) % 5) * 1.05;
      const halfToward = Math.max(w, d) * 0.5;
      const extra = 2.5 + (i % 5) * 1.6;
      const placed = placeAlongEdgeNormal(pts, edge, i, side, halfToward, margin, extra);
      if (placed && acceptPropY(pts, placed.x, placed.z, placed.y)) {
        const rotY = Math.atan2(placed.nx, placed.nz);
        const col = bldgColors[i % bldgColors.length];
        buildings.push({
          x: placed.x,
          y: placed.y + h / 2,
          z: placed.z,
          sx: w,
          sy: h,
          sz: d,
          rotY,
          color: col,
        });
        // Pitched roof + ground plinth — reads as architecture, not a plain box
        roofs.push({
          x: placed.x,
          y: placed.y + h + 0.55,
          z: placed.z,
          sx: w * 0.78,
          sy: 1.15 + (i % 4) * 0.18,
          sz: d * 0.78,
          rotY: rotY + Math.PI / 4,
          color: (i % 3 === 0) ? 0x4a3020 : 0x5a4030,
        });
        plinths.push({
          x: placed.x,
          y: placed.y + 0.1,
          z: placed.z,
          sx: w,
          sy: 1,
          sz: d,
          rotY,
          color: 0x6a6058,
        });
        // Occasional side wing / chimney stack for silhouette variety
        if (i % 5 === 0 && bCount + 1 < quality.maxBuildings) {
          const wingW = w * 0.45;
          const wingD = d * 0.55;
          const wingH = h * (0.55 + (i % 2) * 0.15);
          const ox = placed.nx * (w * 0.55 + 0.8);
          const oz = placed.nz * (w * 0.55 + 0.8);
          buildings.push({
            x: placed.x + ox,
            y: placed.y + wingH / 2,
            z: placed.z + oz,
            sx: wingW,
            sy: wingH,
            sz: wingD,
            rotY,
            color: bldgColors[(i + 3) % bldgColors.length],
          });
          roofs.push({
            x: placed.x + ox,
            y: placed.y + wingH + 0.4,
            z: placed.z + oz,
            sx: wingW * 0.8,
            sy: 0.9,
            sz: wingD * 0.8,
            rotY: rotY + Math.PI / 4,
            color: 0x4a3020,
          });
        }
        bCount++;
      }
    }

    // --- Trees / palms / deciduous bushes: denser bands clear of barriers ---
    if (tCount < quality.maxTrees) {
      const isPalm = ii % 5 === 1;
      const isBush = !isPalm && ii % 7 === 3;
      const isPine = !isPalm && !isBush && (ii % 2 === 0 || quality.maxTrees >= 140);
      const isExtra = !isPalm && !isBush && !isPine && quality.maxTrees >= 140 && ii % 3 === 0;
      if (isPalm || isPine || isBush || isExtra) {
        const halfToward = isPalm ? 1.6 : isBush || isExtra ? 1.1 : 1.4;
        const extra = 0.5 + (i % 2) * 0.8;
        const placed = placeAlongEdgeNormal(pts, edge, i, side, halfToward, margin, extra);
        if (placed && acceptPropY(pts, placed.x, placed.z, placed.y)) {
          if (isPalm) {
            palmTrunks.push({
              x: placed.x, y: placed.y + 2.4, z: placed.z,
              sx: 1, sy: 4.8, sz: 1,
            });
            palmTops.push({
              x: placed.x, y: placed.y + 5.35, z: placed.z,
              sx: 0.85, sy: 0.45, sz: 0.85,
            });
            // Cheap frond mass around crown
            for (const [ox, oz, sc] of [
              [0.55, 0.1, 1.0],
              [-0.45, 0.35, 0.9],
              [0.15, -0.55, 0.95],
              [-0.25, -0.35, 0.85],
            ] as const) {
              palmFronds.push({
                x: placed.x + ox,
                y: placed.y + 5.05,
                z: placed.z + oz,
                sx: sc * 1.15,
                sy: 0.22,
                sz: sc * 1.15,
                rotY: (i % 5) * 0.4,
              });
            }
          } else if (isBush) {
            trunks.push({
              x: placed.x, y: placed.y + 0.85, z: placed.z,
              sx: 0.7, sy: 1.55, sz: 0.7,
            });
            // 3-sphere deciduous crown (not a single lollipop)
            const baseY = placed.y + 2.35;
            bushCrowns.push({
              x: placed.x, y: baseY, z: placed.z,
              sx: 1.25 + (i % 3) * 0.12, sy: 1.0, sz: 1.25 + (i % 2) * 0.1,
            });
            bushCrowns.push({
              x: placed.x + 0.55, y: baseY + 0.15, z: placed.z - 0.2,
              sx: 0.85, sy: 0.75, sz: 0.9,
            });
            bushCrowns.push({
              x: placed.x - 0.45, y: baseY + 0.25, z: placed.z + 0.35,
              sx: 0.8, sy: 0.7, sz: 0.85,
            });
          } else {
            // Tiered pine: trunk + 3 nested cones
            trunks.push({
              x: placed.x, y: placed.y + 1.15, z: placed.z,
              sx: 1, sy: 2.3, sz: 1,
            });
            const tiers: [number, number, number][] = [
              [placed.y + 2.55, 1.35, 1.7],
              [placed.y + 3.55, 1.05, 1.55],
              [placed.y + 4.45, 0.72, 1.35],
            ];
            for (const [cy, sx, sy] of tiers) {
              cones.push({
                x: placed.x, y: cy, z: placed.z,
                sx, sy, sz: sx,
              });
            }
          }
          tCount++;
        }
      }
    }

    // --- Lamps: just outside barrier ---
    if (ii % 4 === 0 && lCount < quality.maxLamps) {
      const halfToward = 0.35;
      const placed = placeAlongEdgeNormal(pts, edge, i, side, halfToward, margin * 0.65, 0.4);
      if (placed && acceptPropY(pts, placed.x, placed.z, placed.y)) {
        poles.push({
          x: placed.x, y: placed.y + 2.25, z: placed.z,
          sx: 1, sy: 4.5, sz: 1,
        });
        glows.push({
          x: placed.x, y: placed.y + 4.6, z: placed.z,
          sx: 1, sy: 1, sz: 1,
        });
        lCount++;
      }
    }
  }

  // Distant hillside / village clusters — track-relative so Suzuka/Interlagos fill too.
  // Monaco keeps a few iconic casino/tunnel anchors mixed in.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const midX = (minX + maxX) * 0.5;
  const midZ = (minZ + maxZ) * 0.5;
  const spanX = Math.max(80, maxX - minX);
  const spanZ = Math.max(80, maxZ - minZ);
  const clusterSites: [number, number][] = [
    [midX + spanX * 0.42, midZ + spanZ * 0.38],
    [midX - spanX * 0.40, midZ + spanZ * 0.35],
    [midX + spanX * 0.38, midZ - spanZ * 0.42],
    [midX - spanX * 0.36, midZ - spanZ * 0.38],
    [midX + spanX * 0.55, midZ + spanZ * 0.05],
    [midX - spanX * 0.52, midZ - spanZ * 0.08],
    [midX + spanX * 0.12, midZ + spanZ * 0.55],
    [midX - spanX * 0.08, midZ - spanZ * 0.52],
    [midX + spanX * 0.48, midZ + spanZ * 0.48],
    [midX - spanX * 0.45, midZ + spanZ * 0.50],
    [midX + spanX * 0.50, midZ - spanZ * 0.28],
    [midX - spanX * 0.48, midZ - spanZ * 0.32],
    // Monaco iconic anchors (harmless extras on other tracks if off-ribbon)
    [320, 420], [375, 490], [430, 200], [180, 280], [300, -40],
  ];
  const clusters = Math.max(2, quality.hillsideClusters);
  for (let c = 0; c < clusters; c++) {
    const site = clusterSites[c % clusterSites.length];
    const baseX = site[0] + (c * 11) % 30 - 10;
    const baseZ = site[1] + (c * 17) % 40 - 12;
    const localN = 2 + (c % 3) + (quality.maxDecor >= 48 && c % 2 === 0 ? 1 : 0);
    for (let k = 0; k < localN; k++) {
      const hx = baseX + (k % 3) * 16 - 8;
      const hz = baseZ + Math.floor(k / 3) * 18;
      const hh = 12 + ((c + k) % 5) * 3.5;
      if (!intersectsRoadRibbon(pts, hx, hz, 8, margin)) {
        const gy = terrainH(pts, hx, hz);
        if (!acceptPropY(pts, hx, hz, gy, 2.0)) continue;
        const bw = 10 + (k % 3) * 2;
        const bd = 8 + (k % 2) * 3;
        const bcol = bldgColors[(c + k) % bldgColors.length];
        buildings.push({
          x: hx, y: gy + hh / 2, z: hz,
          sx: bw, sy: hh, sz: bd,
          color: bcol,
        });
        roofs.push({
          x: hx, y: gy + hh + 0.7, z: hz,
          sx: bw * 0.75, sy: 1.4, sz: bd * 0.75,
          rotY: Math.PI / 4,
          color: 0x4a3828,
        });
      }
    }
  }

  // Rock outcrops + shrubs + flower beds + low cliff slabs — tiered by maxDecor
  const rocks: Xform[] = [];
  const shrubs: Xform[] = [];
  const flowers: Xform[] = [];
  const cliffs: Xform[] = [];
  const berms: Xform[] = [];
  const flowerColors = [0xc45a6a, 0xd4a03a, 0x6a8cc4, 0xc4783a, 0x8a5a9a, 0xd47868];
  // Tighter stride fills maxDecor budget with more variety (still road-clear)
  const rockStride = Math.max(
    quality.maxDecor >= 70 ? 7.5 : quality.maxDecor >= 60 ? 9 : quality.maxDecor >= 40 ? 11 : 13,
    strideM * (quality.maxDecor >= 48 ? 1.4 : 1.85),
  );
  let nextRockS = 8;
  let decorCount = 0;
  for (let i = 0; i < pts.length - 1 && decorCount < quality.maxDecor; i++) {
    if (pts[i].s + 1e-3 < nextRockS) continue;
    nextRockS = pts[i].s + rockStride;
    const useLeft = i % 2 === 0;
    const edge = useLeft ? left : right;
    const side = useLeft ? -1 : 1;
    if (side > 0 && isPitCorridorS(pts[i].s, trackLenS)) continue;
    const mode = quality.maxDecor >= 56 ? i % 5 : i % 4;
    if (mode === 0) {
      const placed = placeAlongEdgeNormal(pts, edge, i, side, 1.2, margin + 2.5, 4 + (i % 3));
      if (placed && acceptPropY(pts, placed.x, placed.z, placed.y)) {
        const { clearance } = nearestEdgeClearance(pts, placed.x, placed.z);
        if (clearance < BARRIER_OUT + margin + 1.5) continue;
        const rs = 0.8 + (i % 4) * 0.35;
        rocks.push({
          x: placed.x, y: placed.y + rs * 0.45, z: placed.z,
          sx: rs * 1.4, sy: rs * 0.9, sz: rs * 1.1,
          rotY: (i % 7) * 0.4,
        });
        decorCount++;
      }
    } else if (mode === 1) {
      const placed = placeAlongEdgeNormal(pts, edge, i, side, 0.9, margin + 2.0, 3.5);
      if (placed && acceptPropY(pts, placed.x, placed.z, placed.y)) {
        const { clearance } = nearestEdgeClearance(pts, placed.x, placed.z);
        if (clearance < BARRIER_OUT + margin + 1.2) continue;
        shrubs.push({
          x: placed.x, y: placed.y + 0.35, z: placed.z,
          sx: 0.9 + (i % 3) * 0.15, sy: 0.7, sz: 0.9 + (i % 2) * 0.1,
          rotY: (i % 5) * 0.5,
        });
        decorCount++;
      }
    } else if (mode === 2 && quality.maxDecor >= 20) {
      const placed = placeAlongEdgeNormal(pts, edge, i, side, 1.0, margin + 2.2, 3.2);
      if (placed && acceptPropY(pts, placed.x, placed.z, placed.y)) {
        const { clearance } = nearestEdgeClearance(pts, placed.x, placed.z);
        if (clearance < BARRIER_OUT + margin + 1.3) continue;
        flowers.push({
          x: placed.x, y: placed.y + 0.22, z: placed.z,
          sx: 1.6 + (i % 3) * 0.25, sy: 0.35, sz: 1.1,
          rotY: Math.atan2(placed.nx, placed.nz),
          color: flowerColors[i % flowerColors.length],
        });
        decorCount++;
        // Companion shrubs around flower beds (High/Ultra budget)
        if (quality.maxDecor >= 48 && decorCount < quality.maxDecor) {
          shrubs.push({
            x: placed.x + placed.nx * 1.4,
            y: placed.y + 0.32,
            z: placed.z + placed.nz * 1.4,
            sx: 0.7, sy: 0.55, sz: 0.7,
            rotY: (i % 5) * 0.4,
          });
          decorCount++;
        }
      }
    } else if (mode === 3 && quality.maxDecor >= 22) {
      // Cliffs on elevated hills + tunnel approaches (y > 2.2)
      if ((pts[i].y ?? 0) < 2.2) continue;
      const placed = placeAlongEdgeNormal(pts, edge, i, side, 2.2, margin + 3.5, 5 + (i % 2));
      if (placed && acceptPropY(pts, placed.x, placed.z, placed.y)) {
        const { clearance } = nearestEdgeClearance(pts, placed.x, placed.z);
        if (clearance < BARRIER_OUT + margin + 2.5) continue;
        const ch = 2.8 + (i % 4) * 0.9;
        cliffs.push({
          x: placed.x, y: placed.y + ch * 0.45, z: placed.z,
          sx: 3.5 + (i % 3), sy: ch, sz: 1.6 + (i % 2) * 0.4,
          rotY: Math.atan2(placed.nx, placed.nz),
        });
        decorCount++;
        // Secondary ledge rock for denser cliffs
        if (quality.maxDecor >= 48 && decorCount < quality.maxDecor) {
          const rs = 1.1 + (i % 3) * 0.25;
          rocks.push({
            x: placed.x + placed.nx * 2.2,
            y: placed.y + rs * 0.4,
            z: placed.z + placed.nz * 2.2,
            sx: rs * 1.3, sy: rs * 0.85, sz: rs,
            rotY: (i % 7) * 0.35,
          });
          decorCount++;
        }
      }
    } else if (mode === 4 && quality.maxDecor >= 56) {
      // Grass / earth berms — low mounds clear of asphalt
      const placed = placeAlongEdgeNormal(pts, edge, i, side, 1.8, margin + 2.8, 3.5 + (i % 3));
      if (placed && acceptPropY(pts, placed.x, placed.z, placed.y)) {
        const { clearance } = nearestEdgeClearance(pts, placed.x, placed.z);
        if (clearance < BARRIER_OUT + margin + 1.8) continue;
        const bh = 0.9 + (i % 4) * 0.35;
        const bw = 4.5 + (i % 3) * 1.2;
        berms.push({
          x: placed.x, y: placed.y + bh * 0.35, z: placed.z,
          sx: bw, sy: bh, sz: 2.2 + (i % 2) * 0.6,
          rotY: Math.atan2(placed.nx, placed.nz),
          color: (i % 2 === 0) ? 0x3a6a32 : 0x4a5a38,
        });
        decorCount++;
      }
    }
  }

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  const addInstanced = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    list: Xform[],
    withColor: boolean,
  ) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    if (withColor) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      dummy.position.set(t.x, t.y, t.z);
      dummy.scale.set(t.sx, t.sy, t.sz);
      dummy.rotation.set(0, t.rotY ?? 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (withColor && t.color !== undefined) {
        color.setHex(t.color);
        mesh.setColorAt(i, color);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  };

  // Buildings need instanceColor — clone material with instance coloring
  const bldgInstMat = bldgMat.clone();
  (bldgInstMat as THREE.MeshLambertMaterial).vertexColors = false;
  addInstanced(unitBox, bldgInstMat, buildings, true);
  const roofMat = makeSceneryMat(0x5a4030, quality);
  const plinthMat = makeSceneryMat(0x6a6058, quality);
  addInstanced(roofGeo, roofMat, roofs, true);
  addInstanced(plinthGeo, plinthMat, plinths, true);

  addInstanced(trunkCyl, treeTrunkMat, trunks, false);
  addInstanced(coneLeaf, treeLeafMat, cones, false);
  addInstanced(bushCrown, treeLeafMat, bushCrowns, false);
  addInstanced(palmTrunk, treeTrunkMat, palmTrunks, false);
  addInstanced(palmTop, palmLeafMat, palmTops, false);
  addInstanced(palmFrond, palmLeafMat, palmFronds, false);
  addInstanced(poleGeo, lampMat, poles, false);
  addInstanced(glowGeo, lampGlowMat, glows, false);

  const rockMat = makeSceneryMat(0x6e6a62, quality, makeRockTexture());
  const shrubMat = makeSceneryMat(0x2e6a32, quality);
  const flowerMat = makeSceneryMat(0xffffff, quality);
  const cliffMat = makeSceneryMat(0x5c584f, quality);
  const rockGeo = new THREE.DodecahedronGeometry(0.7, quality.treeDetail >= 7 ? 1 : 0);
  const shrubGeo = new THREE.ConeGeometry(0.85, 1.1, Math.max(5, detail));
  const flowerGeo = new THREE.BoxGeometry(1, 1, 1);
  const cliffGeo = new THREE.BoxGeometry(1, 1, 1);
  addInstanced(rockGeo, rockMat, rocks, false);
  addInstanced(shrubGeo, shrubMat, shrubs, false);
  addInstanced(flowerGeo, flowerMat, flowers, true);
  addInstanced(cliffGeo, cliffMat, cliffs, false);
  const bermMat = makeSceneryMat(0x3a6a32, quality);
  const bermGeo = new THREE.SphereGeometry(1, 6, 4);
  addInstanced(bermGeo, bermMat, berms, true);

  root.add(group);
}



/** Flat «ПИТ» board texture (RU) — yellow field, dark lettering. */
function makePitSignTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f0c410';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#1a1a1e';
  ctx.lineWidth = 10;
  ctx.strokeRect(6, 6, 244, 116);
  ctx.fillStyle = '#1a1a1e';
  ctx.font = 'bold 72px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ПИТ', 128, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Clean pit ENTRY/EXIT spur — parallel add-on outside right Tecpro; race ribbon untouched. */
function addPitLane(
  root: THREE.Group,
  pts: TrackPoint[],
  left: THREE.Vector3[],
  right: THREE.Vector3[],
  quality: QualityProfile,
): void {
  if (pts.length < 8) return;
  const group = new THREE.Group();
  group.name = 'pitLane';
  const total = pts[pts.length - 1].s;
  const spec = PIT_LANE;
  if (total < spec.entryBeforeSf + spec.exitAfterSf + 20) return;

  const asphaltMat = quality.useLambertScenery
    ? new THREE.MeshLambertMaterial({ color: 0x34343b })
    : new THREE.MeshStandardMaterial({ color: 0x34343b, roughness: 0.9, metalness: 0.05 });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf2ecd4 });
  // High-contrast yellow + white entry paint on race asphalt
  const entryYellowMat = new THREE.MeshBasicMaterial({
    color: 0xf0c410,
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
  });
  const entryWhiteMat = new THREE.MeshBasicMaterial({
    color: 0xf7f4ea,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const arrowMat = new THREE.MeshBasicMaterial({
    color: 0xffe14a,
    transparent: true,
    opacity: 0.97,
    depthWrite: false,
  });
  const boxMat = quality.useLambertScenery
    ? new THREE.MeshLambertMaterial({ color: 0x4e545c })
    : new THREE.MeshStandardMaterial({ color: 0x4e545c, roughness: 0.85, metalness: 0.1 });
  const roofMat = makeSceneryMat(0xb01818, quality);
  const barrierMat = quality.useLambertScenery
    ? new THREE.MeshLambertMaterial({ color: 0xc8c8d0 })
    : new THREE.MeshStandardMaterial({ color: 0xc8c8d0, roughness: 0.55, metalness: 0.15 });
  const mouthKerbMat = quality.useLambertScenery
    ? new THREE.MeshLambertMaterial({ color: 0xf0c410 })
    : new THREE.MeshStandardMaterial({ color: 0xf0c410, roughness: 0.55, metalness: 0.05 });
  const mouthKerbAltMat = quality.useLambertScenery
    ? new THREE.MeshLambertMaterial({ color: 0xf6f6fa })
    : new THREE.MeshStandardMaterial({ color: 0xf6f6fa, roughness: 0.55, metalness: 0.05 });
  const pitSignTex = makePitSignTexture();
  const pitSignMat = new THREE.MeshBasicMaterial({
    map: pitSignTex,
    transparent: true,
    depthWrite: false,
  });
  const postMat = quality.useLambertScenery
    ? new THREE.MeshLambertMaterial({ color: 0x2a2a30 })
    : new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.7, metalness: 0.2 });

  // Ordered s samples wrapping S/F (entry → SF → exit) — independent of mitered race edges
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
    // Right-hand normal (same convention as projectOnTrack lateral+)
    const nx = Math.cos(samp.yaw);
    const nz = -Math.sin(samp.yaw);
    const offset = halfW + TRACK_BARRIER_OUT + spec.gapFromRaceEdge + spec.width * 0.5;
    raw.push({
      x: samp.x + nx * offset,
      y: samp.y,
      z: samp.z + nz * offset,
      yaw: samp.yaw,
      s,
      halfW,
    });
  }

  // Smooth spur centerline so it does not inherit S/F join wiggle
  const spur: SpurPt[] = raw.map((p) => ({ ...p }));
  for (let pass = 0; pass < 3; pass++) {
    const copy = spur.map((p) => ({ x: p.x, z: p.z }));
    for (let i = 1; i < spur.length - 1; i++) {
      spur[i].x = copy[i - 1].x * 0.25 + copy[i].x * 0.5 + copy[i + 1].x * 0.25;
      spur[i].z = copy[i - 1].z * 0.25 + copy[i].z * 0.5 + copy[i + 1].z * 0.25;
    }
  }
  // Recompute yaw from smoothed polyline
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

  const ribbon = new THREE.Mesh(buildRibbonGeometry(pitInner, pitOuter, 0.1), asphaltMat);
  ribbon.receiveShadow = true;
  ribbon.name = 'pitAsphalt';
  group.add(ribbon);

  // Entry / exit taper connectors: race right edge → pit inner (only near openings)
  const connectMats = asphaltMat;
  const addConnector = (fromS: number, toS: number, towardPit: boolean) => {
    const cInner: THREE.Vector3[] = [];
    const cOuter: THREE.Vector3[] = [];
    const samples = 10;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const s =
        fromS < toS
          ? fromS + (toS - fromS) * t
          : fromS + ((toS + total - fromS) % total) * t; // should not wrap in our use
      const ss = ((s % total) + total) % total;
      const samp = sampleTrack(pts, ss);
      const nx = Math.cos(samp.yaw);
      const nz = -Math.sin(samp.yaw);
      const raceEdge = samp.width * 0.5;
      // Blend lateral from race edge to pit inner
      const pitLat = raceEdge + TRACK_BARRIER_OUT + spec.gapFromRaceEdge;
      const blend = towardPit ? t : 1 - t;
      const lat0 = raceEdge * 0.88;
      const lat1 = pitLat;
      const latA = lat0 + (lat1 - lat0) * blend;
      const latB = latA + 2.2 + blend * (spec.width * 0.62);
      cInner.push(
        new THREE.Vector3(
          samp.x + nx * latA,
          samp.y,
          samp.z + nz * latA,
        ),
      );
      cOuter.push(
        new THREE.Vector3(
          samp.x + nx * latB,
          samp.y,
          samp.z + nz * latB,
        ),
      );
    }
    if (cInner.length >= 2) {
      const mesh = new THREE.Mesh(buildRibbonGeometry(cInner, cOuter, 0.105), connectMats);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  };
  // Entry: peel out before S/F
  addConnector(total - spec.entryOpenLen, total - 1.5, true);
  // Exit: merge back after S/F
  addConnector(1.5, spec.exitOpenLen, false);

  // Dashed center line on spur
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const dummy = new THREE.Object3D();
  const dashXforms: { x: number; y: number; z: number; sx: number; sy: number; sz: number; rotY: number }[] = [];
  for (let i = 0; i < spur.length - 1; i += 2) {
    const a = spur[i];
    const b = spur[i + 1];
    const seg = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    dashXforms.push({
      x: (a.x + b.x) * 0.5,
      y: a.y + 0.14,
      z: (a.z + b.z) * 0.5,
      sx: 0.32,
      sy: 0.04,
      sz: Math.min(2.4, seg * 0.85),
      rotY: a.yaw,
    });
  }

  // Longer / wider dashed entry paint on race asphalt (starts before Tecpro mouth)
  const yellowPaint: typeof dashXforms = [];
  const whitePaint: typeof dashXforms = [];
  const entryPaintLead = 28; // meters before opening start
  const entryPaintStart = total - spec.entryOpenLen - entryPaintLead;
  let paintIdx = 0;
  for (let s = entryPaintStart; s < total - 1.2; s += 2.35) {
    const samp = sampleTrack(pts, s);
    const nx = Math.cos(samp.yaw);
    const nz = -Math.sin(samp.yaw);
    // Double row toward right edge — yellow outer, white inner
    const latWhite = samp.width * 0.22;
    const latYellow = samp.width * 0.36;
    const y = samp.y + 0.13;
    whitePaint.push({
      x: samp.x + nx * latWhite,
      y,
      z: samp.z + nz * latWhite,
      sx: 0.48,
      sy: 0.055,
      sz: 2.55,
      rotY: samp.yaw,
    });
    yellowPaint.push({
      x: samp.x + nx * latYellow,
      y,
      z: samp.z + nz * latYellow,
      sx: 0.55,
      sy: 0.055,
      sz: 2.7,
      rotY: samp.yaw,
    });
    // Chevron / arrow every ~3rd dash inside the mouth
    if (s >= total - spec.entryOpenLen && paintIdx % 3 === 0) {
      const latArr = samp.width * 0.3;
      yellowPaint.push({
        x: samp.x + nx * latArr,
        y: y + 0.01,
        z: samp.z + nz * latArr,
        sx: 1.15,
        sy: 0.05,
        sz: 0.85,
        rotY: samp.yaw + Math.PI * 0.22, // angled toward right peel-off
      });
    }
    paintIdx++;
  }

  // Ground chevrons pointing into the spur at the mouth
  const arrowXforms: typeof dashXforms = [];
  for (let s = total - spec.entryOpenLen + 4; s < total - 4; s += 7.5) {
    const samp = sampleTrack(pts, s);
    const nx = Math.cos(samp.yaw);
    const nz = -Math.sin(samp.yaw);
    const lat = samp.width * 0.42;
    arrowXforms.push({
      x: samp.x + nx * lat,
      y: samp.y + 0.14,
      z: samp.z + nz * lat,
      sx: 1.6,
      sy: 0.06,
      sz: 1.1,
      rotY: samp.yaw + Math.PI * 0.28,
    });
  }

  const addInst = (list: typeof dashXforms, mat: THREE.Material, cast: boolean) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(unit, mat, list.length);
    mesh.castShadow = cast && quality.sceneryCastShadow;
    mesh.receiveShadow = true;
    mesh.renderOrder = 3;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      dummy.position.set(t.x, t.y, t.z);
      dummy.scale.set(t.sx, t.sy, t.sz);
      dummy.rotation.set(0, t.rotY, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  };
  addInst(dashXforms, dashMat, false);
  addInst(whitePaint, entryWhiteMat, false);
  addInst(yellowPaint, entryYellowMat, false);
  addInst(arrowXforms, arrowMat, false);

  // Bright yellow/white mouth kerbs along right race edge at entry opening
  const mouthKerbsY: typeof dashXforms = [];
  const mouthKerbsW: typeof dashXforms = [];
  let kerbFlip = false;
  for (let s = total - spec.entryOpenLen; s < total - 1; s += 1.65) {
    const samp = sampleTrack(pts, s);
    const nx = Math.cos(samp.yaw);
    const nz = -Math.sin(samp.yaw);
    const lat = samp.width * 0.5 + 0.35;
    const xf = {
      x: samp.x + nx * lat,
      y: samp.y + 0.16,
      z: samp.z + nz * lat,
      sx: 0.95,
      sy: 0.18,
      sz: 1.45,
      rotY: samp.yaw,
    };
    if (kerbFlip) mouthKerbsW.push(xf);
    else mouthKerbsY.push(xf);
    kerbFlip = !kerbFlip;
  }
  addInst(mouthKerbsY, mouthKerbMat, false);
  addInst(mouthKerbsW, mouthKerbAltMat, false);

  // «ПИТ» sign boards + posts near entry mouth (outside race asphalt)
  const signSlots = [
    total - spec.entryOpenLen - 6,
    total - spec.entryOpenLen * 0.55,
    total - 8,
  ];
  for (const s of signSlots) {
    const samp = sampleTrack(pts, ((s % total) + total) % total);
    const nx = Math.cos(samp.yaw);
    const nz = -Math.sin(samp.yaw);
    const lat = samp.width * 0.5 + TRACK_BARRIER_OUT + 1.1;
    const px = samp.x + nx * lat;
    const pz = samp.z + nz * lat;
    if (intersectsRoadRibbon(pts, px, pz, 0.8, 0.6)) continue;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.4, 0.18), postMat);
    post.position.set(px, samp.y + 1.2, pz);
    post.castShadow = quality.sceneryCastShadow;
    group.add(post);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), pitSignMat);
    board.position.set(px - nx * 0.12, samp.y + 2.35, pz - nz * 0.12);
    board.rotation.y = samp.yaw + Math.PI; // face oncoming traffic
    board.renderOrder = 4;
    group.add(board);
  }

  // Garage boxes along outer spur (longer box zone, bigger stalls)
  const boxXforms: typeof dashXforms = [];
  const roofXforms: typeof dashXforms = [];
  let nextBox = -1;
  for (const p of spur) {
    if (p.s < spec.boxStartS || p.s > spec.boxEndS) continue;
    if (p.s < nextBox) continue;
    nextBox = p.s + 8.4;
    const nx = Math.cos(p.yaw);
    const nz = -Math.sin(p.yaw);
    const bx = p.x + nx * (halfPit + 4.4);
    const bz = p.z + nz * (halfPit + 4.4);
    if (intersectsRoadRibbon(pts, bx, bz, 3.8, quality.sceneryMargin)) continue;
    if (!acceptPropY(pts, bx, bz, p.y, 2.4)) continue;
    boxXforms.push({
      x: bx, y: p.y + 1.85, z: bz,
      sx: 7.4, sy: 3.6, sz: 4.6, rotY: p.yaw,
    });
    roofXforms.push({
      x: bx, y: p.y + 3.8, z: bz,
      sx: 8.2, sy: 0.26, sz: 5.2, rotY: p.yaw,
    });
  }
  addInst(boxXforms, boxMat, true);
  addInst(roofXforms, roofMat, true);

  // Low outer pit wall stubs (outside spur — never on race asphalt)
  const wallXforms: typeof dashXforms = [];
  let nextWall = -1;
  for (const p of spur) {
    if (p.s < nextWall) continue;
    nextWall = p.s + 5.2;
    const nx = Math.cos(p.yaw);
    const nz = -Math.sin(p.yaw);
    const wx = p.x + nx * (halfPit + 0.5);
    const wz = p.z + nz * (halfPit + 0.5);
    if (intersectsRoadRibbon(pts, wx, wz, 0.5, 0.4)) continue;
    wallXforms.push({
      x: wx, y: p.y + 0.6, z: wz,
      sx: 0.28, sy: 1.1, sz: 4.2, rotY: p.yaw,
    });
  }
  addInst(wallXforms, barrierMat, false);

  void left;
  void right;
  root.add(group);
}


export function getMinimapPath(
  track: TrackData,
): { xs: number[]; zs: number[]; minX: number; maxX: number; minZ: number; maxZ: number } {
  const xs = track.points.map((p) => p.x);
  const zs = track.points.map((p) => p.z);
  return {
    xs,
    zs,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}
