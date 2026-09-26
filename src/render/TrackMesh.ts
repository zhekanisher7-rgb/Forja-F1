import * as THREE from 'three';
import type { TrackData, TrackPoint } from '../tracks/Track';
import { getTrackEdges, sampleTerrainHeight } from '../tracks/Track';
import { profileFor, type GraphicsTier, type QualityProfile } from './GraphicsQuality';

/** Procedural asphalt — grain, tire wear lanes, edge darkening, faint dashes */
function makeAsphaltTexture(anisotropy: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#2a2a30';
  ctx.fillRect(0, 0, 256, 512);

  // Fine grain (cheaper than 28k on 512²)
  for (let i = 0; i < 9000; i++) {
    const v = 20 + Math.random() * 50;
    const a = 0.05 + Math.random() * 0.12;
    ctx.fillStyle = `rgba(${v},${v},${v + 5},${a})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  // Rubber wear bands
  for (let band = 0; band < 4; band++) {
    const x0 = 40 + band * 45 + Math.random() * 12;
    ctx.fillStyle = 'rgba(10,10,14,0.2)';
    ctx.fillRect(x0, 0, 12 + Math.random() * 10, 512);
  }
  // Edge darkening
  const eg = ctx.createLinearGradient(0, 0, 36, 0);
  eg.addColorStop(0, 'rgba(0,0,0,0.35)');
  eg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = eg;
  ctx.fillRect(0, 0, 36, 512);
  const eg2 = ctx.createLinearGradient(256, 0, 220, 0);
  eg2.addColorStop(0, 'rgba(0,0,0,0.35)');
  eg2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = eg2;
  ctx.fillRect(220, 0, 36, 512);

  ctx.strokeStyle = 'rgba(75,75,82,0.4)';
  ctx.lineWidth = 3;
  ctx.setLineDash([22, 18]);
  ctx.beginPath();
  ctx.moveTo(128, 0);
  ctx.lineTo(128, 512);
  ctx.stroke();
  ctx.setLineDash([]);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.2, 48);
  tex.anisotropy = anisotropy;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
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

/** Facade with window grid — shared by all buildings (1 draw call via InstancedMesh) */
function makeBuildingFacadeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#9a9088';
  ctx.fillRect(0, 0, 128, 256);
  // subtle plaster noise
  for (let i = 0; i < 800; i++) {
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
      const lit = Math.random() > 0.45;
      ctx.fillStyle = lit ? 'rgba(180,210,240,0.85)' : 'rgba(30,40,55,0.75)';
      const pad = 4;
      ctx.fillRect(col * mw + pad, r * mh + pad + 2, mw - pad * 2, mh - pad * 2 - 4);
      if (lit) {
        ctx.fillStyle = 'rgba(255,240,200,0.25)';
        ctx.fillRect(col * mw + pad, r * mh + pad + 2, (mw - pad * 2) * 0.45, mh - pad * 2 - 4);
      }
    }
  }
  // roof band
  ctx.fillStyle = '#6a6058';
  ctx.fillRect(0, 0, 128, 10);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGroundTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#3a5236';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6000; i++) {
    const g = 40 + Math.random() * 50;
    ctx.fillStyle = `rgba(${g * 0.55},${g},${g * 0.4},${0.1 + Math.random() * 0.15})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
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
  const { left, right } = getTrackEdges(pts);

  addGround(root, pts, quality);

  // Soft runoff / grass strips first (below asphalt Y) — fills sky gaps beside ribbon
  addShoulderStrips(root, left, right, pts, quality);

  // Continuous asphalt ribbon (dense Catmull-Rom samples) — clear Y above terrain, no polygonOffset
  const asphaltMat = new THREE.MeshStandardMaterial({
    color: 0x3e3e46,
    map: makeAsphaltTexture(quality.anisotropy),
    roughness: 0.92,
    metalness: 0.04,
  });
  const asphalt = new THREE.Mesh(buildRibbonGeometry(left, right, 0.045), asphaltMat);
  asphalt.receiveShadow = true;
  asphalt.castShadow = quality.asphaltCastShadow;
  root.add(asphalt);

  // Soft edge darken blend (slightly wider, transparent) — hides hard rectangle seams
  addSoftEdgeBlend(root, left, right);

  // Center racing line — raised, no polygonOffset flicker
  const { left: ll, right: rr } = getTrackEdges(pts, 0.12);
  const lineMat = new THREE.MeshBasicMaterial({
    color: 0x2a3540,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  root.add(new THREE.Mesh(buildRibbonGeometry(ll, rr, 0.055), lineMat));

  addEdgeLine(root, left, true);
  addEdgeLine(root, right, false);
  addKerbs(root, left, true, quality);
  addKerbs(root, right, false, quality);
  addWallRibbon(root, left, -1, quality);
  addWallRibbon(root, right, 1, quality);
  addTrackMarkings(root, pts, quality);

  const gravelMat = new THREE.MeshStandardMaterial({ color: 0xb8a078, metalness: 0.08, roughness: 1 });
  for (const g of track.gravel) {
    // Never lay runoff patches on driveable asphalt
    if (!boxClearsRibbon(pts, g.x, g.z, g.w, g.d, 1.5)) continue;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(g.w, g.d), gravelMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = g.rot;
    const gy = sampleTerrainHeight(pts, g.x, g.z) + 0.03;
    mesh.position.set(g.x, Math.max((g.y ?? 0) + 0.02, gy), g.z);
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  const drsMat = new THREE.MeshStandardMaterial({
    color: 0x22cc66,
    emissive: 0x115522,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.75,
  });
  for (const zone of track.drsZones) {
    for (const s of [zone.startS, zone.endS]) {
      const idx = findIndexAtS(pts, s);
      const p = pts[idx];
      const next = pts[Math.min(pts.length - 1, idx + 1)];
      const yaw = Math.atan2(next.x - p.x, next.z - p.z);
      const gate = new THREE.Group();
      const postL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 0.3), drsMat);
      postL.position.set(-p.width / 2 - 0.5, 1.5, 0);
      const postR = postL.clone();
      postR.position.x = p.width / 2 + 0.5;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(p.width + 1.5, 0.2, 0.2), drsMat);
      beam.position.y = 3;
      gate.add(postL, postR, beam);
      gate.position.set(p.x, p.y, p.z);
      gate.rotation.y = yaw;
      root.add(gate);
    }
  }

  addTunnel(root, pts, 0.48, 0.58, quality);
  addOverpassSupports(root, pts, quality);
  addHarbor(root, pts, quality);
  addScenery(root, pts, left, right, quality, night);

  // Start/finish stripe — thin decal only (never a thick grey box on asphalt)
  const sfMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.75,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    depthWrite: false,
  });
  const sf = new THREE.Mesh(new THREE.PlaneGeometry(pts[0].width * 0.92, 1.6), sfMat);
  sf.rotation.x = -Math.PI / 2;
  const yaw0 = Math.atan2(pts[1].x - pts[0].x, pts[1].z - pts[0].z);
  sf.position.set(pts[0].x, pts[0].y + 0.055, pts[0].z);
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
    const y = a.y + (b.y - a.y) * t + 0.065;
    const z = a.z + (b.z - a.z) * t;
    pushQuad(x, y, z, yaw, 0.18, 1.2);
  }

  if (positions.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const dashMat = new THREE.MeshBasicMaterial({
      color: 0xd8d8e0,
      transparent: true,
      opacity: 0.55,
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
    line.position.set(x, y + 0.068, z);
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
  const margin = 160;
  const gw = maxX - minX + margin * 2;
  const gd = maxZ - minZ + margin * 2;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  // Gently varying heightfield following track corridor + hills / harbor
  // Medium: ~72 segs (~5k verts) — cheap enough for 60 FPS
  const segs = quality.sceneryStep >= 5 ? 48 : quality.sceneryStep >= 3 ? 72 : 96;
  const geo = new THREE.PlaneGeometry(gw, gd, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx;
    const z = pos.getZ(i) + cz;
    pos.setY(i, sampleTerrainHeight(pts, x, z));
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
  const ao = new THREE.Mesh(buildRibbonGeometry(left, right, -0.04), aoMat);
  ao.renderOrder = -2;
  root.add(ao);
}

/** Soft asphalt edge darken — wider translucent ribbon, no polygonOffset flicker */
function addSoftEdgeBlend(
  root: THREE.Group,
  left: THREE.Vector3[],
  right: THREE.Vector3[],
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
  // Left shoulder soft band
  const leftBand = new THREE.Mesh(buildRibbonGeometry(outerL, left, 0.038), mat);
  leftBand.renderOrder = 1;
  root.add(leftBand);
  // Right shoulder soft band
  const rightBand = new THREE.Mesh(buildRibbonGeometry(right, outerR, 0.038), mat.clone());
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
    const cInner = offsetEdge(edge, side, 0.15);
    const cOuter = offsetEdge(edge, side, 2.4);
    const cL = side < 0 ? cOuter : cInner;
    const cR = side < 0 ? cInner : cOuter;
    const concrete = new THREE.Mesh(buildRibbonGeometry(cL, cR, 0.012), concreteMat);
    concrete.receiveShadow = true;
    root.add(concrete);

    // Grass strip farther out (~2.2–8 m) — fills gaps under buildings/trees
    const gInner = offsetEdge(edge, side, 2.2);
    const gOuter = offsetEdge(edge, side, 8.5);
    // Snap grass strip Y toward terrain so it meets the heightfield
    const gL = side < 0 ? gOuter : gInner;
    const gR = side < 0 ? gInner : gOuter;
    const grassGeo = buildRibbonGeometryTerrain(gL, gR, pts, 0.02);
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
    const ly = Math.max(left[i].y - 0.08, sampleTerrainHeight(pts, left[i].x, left[i].z)) + yLift;
    const ry = Math.max(right[i].y - 0.08, sampleTerrainHeight(pts, right[i].x, right[i].z)) + yLift;
    positions.push(left[i].x, ly, left[i].z);
    positions.push(right[i].x, ry, right[i].z);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(0, i / Math.max(n - 1, 1), 1, i / Math.max(n - 1, 1));
  }
  for (let i = 0; i < n - 1; i++) {
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
  const pillarSpacing = 9;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    if (a.s < nextPillarS) continue;
    const b = pts[i + 1];
    const midY = (a.y + b.y) * 0.5;
    if (midY < 4.2) continue;
    nextPillarS = a.s + pillarSpacing;
    const mx = (a.x + b.x) * 0.5;
    const mz = (a.z + b.z) * 0.5;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const groundY = crossingIdx.has(i)
      ? (crossings.find((s) => i >= s.i0 && i <= s.i1)?.lowerY ?? 0)
      : sampleTerrainHeight(pts, mx, mz);
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
  // Cheap water — Basic + slight transparency (no expensive specular shader)
  const waterMat = new THREE.MeshBasicMaterial({
    color: 0x1a6a8a,
    transparent: true,
    opacity: 0.88,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(280, 180), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(230, -0.06, -50);
  water.frustumCulled = true;
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
  for (const q of quaySpecs) {
    if (!boxClearsRibbon(pts, q.x, q.z, q.w, q.d, 3.5)) continue;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(q.w, q.h, q.d), quayMat);
    mesh.position.set(q.x, q.y, q.z);
    mesh.receiveShadow = true;
    mesh.castShadow = quality.sceneryCastShadow;
    root.add(mesh);
  }

  // 2 boats only (was 4) — less clutter / draw calls
  const hullMat = quality.useLambertScenery
    ? new THREE.MeshLambertMaterial({ color: 0xf0f2f5 })
    : new THREE.MeshStandardMaterial({ color: 0xf0f2f5, roughness: 0.4, metalness: 0.3 });
  const cabinMat = quality.useLambertScenery
    ? new THREE.MeshLambertMaterial({ color: 0x2a4060 })
    : new THREE.MeshStandardMaterial({ color: 0x2a4060, roughness: 0.35, metalness: 0.4 });
  const boats: [number, number, number][] = [
    // On water south of chicane / quay — must clear asphalt ribbon
    [200, -120, 0.4],
    [255, -110, -0.6],
  ];
  for (const [bx, bz, rot] of boats) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(14, 2.2, 4), hullMat);
    hull.position.set(bx, 0.6, bz);
    hull.rotation.y = rot;
    hull.castShadow = quality.sceneryCastShadow;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(6, 2.5, 3.2), cabinMat);
    cabin.position.set(bx - Math.sin(rot) * 2, 2.4, bz - Math.cos(rot) * 2);
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

function addWallRibbon(
  root: THREE.Group,
  edge: THREE.Vector3[],
  side: number,
  quality: QualityProfile,
): void {
  const wallBase = offsetEdge(edge, side, 0.9);
  const wallH = 1.25;
  const n = wallBase.length;
  if (n < 2) return;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < n; i++) {
    const iPrev = i === 0 ? n - 2 : i - 1;
    const iNext = i === n - 1 ? 1 : i + 1;
    let dx = wallBase[iNext].x - wallBase[iPrev].x;
    let dz = wallBase[iNext].z - wallBase[iPrev].z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const nx = dz * side;
    const nz = -dx * side;
    const by = wallBase[i].y;

    positions.push(wallBase[i].x, by, wallBase[i].z);
    positions.push(wallBase[i].x, by + wallH, wallBase[i].z);
    normals.push(nx, 0, nz, nx, 0, nz);
    uvs.push(i / Math.max(n - 1, 1), 0, i / Math.max(n - 1, 1), 1);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    if (side > 0) {
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    } else {
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  const wallMat = quality.useLambertScenery
    ? new THREE.MeshLambertMaterial({ color: 0x9aa3b0, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({
        color: 0x9aa3b0,
        metalness: 0.35,
        roughness: 0.45,
        side: THREE.DoubleSide,
      });
  const wall = new THREE.Mesh(geo, wallMat);
  wall.castShadow = quality.sceneryCastShadow;
  wall.receiveShadow = true;
  root.add(wall);

  addWallStripe(root, wallBase, side, 0.85, 1.05, 0xe8e8ec, 0.03);
  addWallStripe(root, wallBase, side, 0.65, 0.85, 0xc01818, 0.025);
}

function addWallStripe(
  root: THREE.Group,
  wallBase: THREE.Vector3[],
  side: number,
  h0: number,
  h1: number,
  color: number,
  out: number,
): void {
  const n = wallBase.length;
  const sp: number[] = [];
  const sn: number[] = [];
  const su: number[] = [];
  const si: number[] = [];
  for (let i = 0; i < n; i++) {
    const iPrev = i === 0 ? n - 2 : i - 1;
    const iNext = i === n - 1 ? 1 : i + 1;
    let dx = wallBase[iNext].x - wallBase[iPrev].x;
    let dz = wallBase[iNext].z - wallBase[iPrev].z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const nx = dz * side;
    const nz = -dx * side;
    const ox = nx * out;
    const oz = nz * out;
    const by = wallBase[i].y;
    sp.push(wallBase[i].x + ox, by + h0, wallBase[i].z + oz);
    sp.push(wallBase[i].x + ox, by + h1, wallBase[i].z + oz);
    sn.push(nx, 0, nz, nx, 0, nz);
    su.push(i * 0.5, 0, i * 0.5, 1);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    if (side > 0) si.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    else si.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(sn, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2));
  geo.setIndex(si);
  const mat = new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
  });
  root.add(new THREE.Mesh(geo, mat));
}

function addEdgeLine(root: THREE.Group, edge: THREE.Vector3[], isLeft: boolean): void {
  const inner = offsetEdge(edge, isLeft ? 1 : -1, 0.15);
  const outer = offsetEdge(edge, isLeft ? 1 : -1, 0.45);
  const left = isLeft ? outer : inner;
  const right = isLeft ? inner : outer;
  const mat = new THREE.MeshBasicMaterial({ color: 0xe0e0e8 });
  root.add(new THREE.Mesh(buildRibbonGeometry(left, right, 0.052), mat));
}

function addKerbs(
  root: THREE.Group,
  edge: THREE.Vector3[],
  isLeft: boolean,
  quality: QualityProfile,
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
  const outer = offsetEdge(edge, side, 1.15);
  const left = isLeft ? outer : inner;
  const right = isLeft ? inner : outer;
  // Continuous kerb ribbon (same dense samples as asphalt)
  const kerb = new THREE.Mesh(buildRibbonGeometry(left, right, 0.058), mat);
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
  root.add(new THREE.Mesh(buildRibbonGeometry(lipL, lipR, 0.1), lipMat));
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

/** Barrier offset from asphalt edge (matches addWallRibbon) */
const BARRIER_OUT = 0.9;

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
      const groundY = sampleTerrainHeight(pts, x, z);
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
function acceptPropY(pts: TrackPoint[], x: number, z: number, baseY: number, tol = 1.25): boolean {
  const gy = sampleTerrainHeight(pts, x, z);
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

  const bldgColors = [0x8a8078, 0xc4a882, 0x9a8a7a, 0xb8a090, 0x6a7080, 0xd0c0a8, 0x7a8890];
  const bldgMat = makeSceneryMat(0xffffff, quality, facadeTex) as THREE.MeshLambertMaterial;
  // allow per-instance tint
  bldgMat.vertexColors = false;

  const treeTrunkMat = makeSceneryMat(0x3a2818, quality);
  const treeLeafMat = makeSceneryMat(0x2d6a30, quality);
  const palmLeafMat = makeSceneryMat(0x3a8a38, quality);
  const lampMat = makeSceneryMat(0x333338, quality);
  const lampEmissive = night ? 1.8 : 0.55;
  const lampGlowMat = makeSceneryMat(0xffe8a0, quality, undefined, 0xffcc66, lampEmissive);

  const segs = Math.min(4, Math.floor(6 / step));
  const detail = Math.max(4, quality.treeDetail);

  // Shared unit geometries — scaled per instance
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const trunkCyl = new THREE.CylinderGeometry(0.22, 0.32, 1, detail);
  const palmTrunk = new THREE.CylinderGeometry(0.18, 0.28, 1, detail);
  const coneLeaf = new THREE.ConeGeometry(1.5, 1, Math.max(5, detail));
  const palmTop = new THREE.SphereGeometry(1.8, detail, Math.max(4, detail - 1));
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 1, 5);
  const glowGeo = new THREE.SphereGeometry(0.28, 6, 6);

  type Xform = { x: number; y: number; z: number; sx: number; sy: number; sz: number; rotY?: number; color?: number };

  const buildings: Xform[] = [];
  const trunks: Xform[] = [];
  const cones: Xform[] = [];
  const palmTrunks: Xform[] = [];
  const palmTops: Xform[] = [];
  const poles: Xform[] = [];
  const glows: Xform[] = [];

  let bCount = 0;
  let tCount = 0;
  let lCount = 0;

  // Distance-based stride (~step * 3.2 m) so dense Catmull-Rom samples don't balloon prop counts
  const strideM = Math.max(6, step * 3.2);
  let nextS = 0;
  const indices: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    if (pts[i].s + 1e-3 >= nextS) {
      indices.push(i);
      nextS = pts[i].s + strideM;
    }
  }

  for (let ii = 0; ii < indices.length; ii++) {
    const i = indices[ii];
    const useLeft = ii % 2 === 0;
    const edge = useLeft ? left : right;
    const side = useLeft ? -1 : 1;

    // --- Buildings: far offset, large half-extent ---
    if (ii % 2 === 0 && bCount < quality.maxBuildings) {
      const h = 10 + (i % 7) * 2.8;
      const w = 5 + (i % 4);
      const d = 5 + ((i + 2) % 4);
      const halfToward = Math.max(w, d) * 0.5;
      const extra = 2 + (i % 4) * 1.5;
      const placed = placeAlongEdgeNormal(pts, edge, i, side, halfToward, margin, extra);
      if (placed && acceptPropY(pts, placed.x, placed.z, placed.y)) {
        buildings.push({
          x: placed.x,
          y: placed.y + h / 2,
          z: placed.z,
          sx: w,
          sy: h,
          sz: d,
          rotY: Math.atan2(placed.nx, placed.nz),
          color: bldgColors[i % bldgColors.length],
        });
        bCount++;
      }
    }

    // --- Trees / palms: closer but still clear of barriers ---
    if (ii % 3 !== 0 && tCount < quality.maxTrees) {
      const isPalm = ii % 5 === 1;
      const isPine = !isPalm && ii % 2 === 0;
      if (isPalm || isPine) {
        const halfToward = isPalm ? 1.6 : 1.4;
        const extra = 0.5 + (i % 2) * 0.8;
        const placed = placeAlongEdgeNormal(pts, edge, i, side, halfToward, margin, extra);
        if (placed && acceptPropY(pts, placed.x, placed.z, placed.y)) {
          if (isPalm) {
            palmTrunks.push({
              x: placed.x, y: placed.y + 2.25, z: placed.z,
              sx: 1, sy: 4.5, sz: 1,
            });
            palmTops.push({
              x: placed.x, y: placed.y + 5.2, z: placed.z,
              sx: 1.2, sy: 0.55, sz: 1.2,
            });
          } else {
            trunks.push({
              x: placed.x, y: placed.y + 1.0, z: placed.z,
              sx: 1, sy: 2.0, sz: 1,
            });
            cones.push({
              x: placed.x, y: placed.y + 3.2, z: placed.z,
              sx: 1, sy: 3.2, sz: 1,
            });
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

  // Distant Monaco hillside blocks — sit ON terrain heightfield
  for (let k = 0; k < segs; k++) {
    const hx = 360 + (k % 3) * 18;
    const hz = 480 + Math.floor(k / 3) * 22;
    const hh = 14 + k * 2;
    if (!intersectsRoadRibbon(pts, hx, hz, 8, margin)) {
      const gy = sampleTerrainHeight(pts, hx, hz);
      if (!acceptPropY(pts, hx, hz, gy, 2.0)) continue;
      buildings.push({
        x: hx, y: gy + hh / 2, z: hz,
        sx: 12, sy: hh, sz: 10,
        color: 0xb0a090,
      });
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

  addInstanced(trunkCyl, treeTrunkMat, trunks, false);
  addInstanced(coneLeaf, treeLeafMat, cones, false);
  addInstanced(palmTrunk, treeTrunkMat, palmTrunks, false);
  addInstanced(palmTop, palmLeafMat, palmTops, false);
  addInstanced(poleGeo, lampMat, poles, false);
  addInstanced(glowGeo, lampGlowMat, glows, false);

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
