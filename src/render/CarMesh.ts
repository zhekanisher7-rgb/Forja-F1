import * as THREE from 'three';
import type { Livery } from '../vehicles/Liveries';

/**
 * Procedural F1-2026-inspired car mesh.
 *
 * Design goals:
 * - F1-2026 silhouette: sculpted nose/sidepods/cover (lathes), multi-element wings,
 *   halo, mirrors, suspension, detailed wheels, diffuser, livery panels
 * - Not blocky cubes — curved tub taper, undercut pods, arched wing elements
 * - MeshPhysical clearcoat paint + env reflections (scene.environment)
 * - Shared BufferGeometry across player + AI (~5 cars); modest segment counts
 */

export interface CarMeshOptions {
  castShadow?: boolean;
  /** Racing number shown on nose / side panels (default from livery id) */
  racingNumber?: number;
}

// ── Shared geometry cache ──────────────────────────────────────────────

interface SharedGeos {
  // chassis / body
  tubCore: THREE.BufferGeometry;
  tubFront: THREE.BufferGeometry;
  tubRear: THREE.BufferGeometry;
  tubMid: THREE.BufferGeometry;
  cokeBottle: THREE.BufferGeometry;
  noseLathe: THREE.BufferGeometry;
  noseBridge: THREE.BufferGeometry;
  noseTip: THREE.BufferGeometry;
  noseCamera: THREE.BufferGeometry;
  // sidepods
  sidepod: THREE.BufferGeometry;
  sidepodTop: THREE.BufferGeometry;
  scoop: THREE.BufferGeometry;
  scoopLip: THREE.BufferGeometry;
  outlet: THREE.BufferGeometry;
  louvre: THREE.BufferGeometry;
  // bargeboards / floor
  bargeBoard: THREE.BufferGeometry;
  bargeVane: THREE.BufferGeometry;
  floorMain: THREE.BufferGeometry;
  floorEdge: THREE.BufferGeometry;
  floorStrake: THREE.BufferGeometry;
  // cockpit / halo
  cockpit: THREE.BufferGeometry;
  visor: THREE.BufferGeometry;
  haloRing: THREE.BufferGeometry;
  haloPillar: THREE.BufferGeometry;
  haloStay: THREE.BufferGeometry;
  haloMount: THREE.BufferGeometry;
  // engine cover
  cover: THREE.BufferGeometry;
  coverTaper: THREE.BufferGeometry;
  airbox: THREE.BufferGeometry;
  airIntake: THREE.BufferGeometry;
  sharkFin: THREE.BufferGeometry;
  exhaust: THREE.BufferGeometry;
  // mirrors
  mirrorGlass: THREE.BufferGeometry;
  mirrorHousing: THREE.BufferGeometry;
  mirrorStalk: THREE.BufferGeometry;
  // front wing
  fwMain: THREE.BufferGeometry;
  fw2: THREE.BufferGeometry;
  fw3: THREE.BufferGeometry;
  fw4: THREE.BufferGeometry;
  fwEndplate: THREE.BufferGeometry;
  fwFootplate: THREE.BufferGeometry;
  fwDive: THREE.BufferGeometry;
  fwPylon: THREE.BufferGeometry;
  fwStrake: THREE.BufferGeometry;
  helmet: THREE.BufferGeometry;
  haloCamera: THREE.BufferGeometry;
  antenna: THREE.BufferGeometry;
  rearFence: THREE.BufferGeometry;
  epSlot: THREE.BufferGeometry;
  // rear wing
  rwMain: THREE.BufferGeometry;
  rwFlap: THREE.BufferGeometry;
  rwLower: THREE.BufferGeometry;
  rwEndplate: THREE.BufferGeometry;
  rwPillar: THREE.BufferGeometry;
  beamWing: THREE.BufferGeometry;
  // diffuser
  diffBody: THREE.BufferGeometry;
  diffVane: THREE.BufferGeometry;
  crashStruct: THREE.BufferGeometry;
  // suspension
  wishbone: THREE.BufferGeometry;
  pushrod: THREE.BufferGeometry;
  trackrod: THREE.BufferGeometry;
  upright: THREE.BufferGeometry;
  // wheels
  tire: THREE.BufferGeometry;
  rim: THREE.BufferGeometry;
  rimInner: THREE.BufferGeometry;
  spoke: THREE.BufferGeometry;
  disc: THREE.BufferGeometry;
  hub: THREE.BufferGeometry;
  hubNut: THREE.BufferGeometry;
  caliper: THREE.BufferGeometry;
  tireGroove: THREE.BufferGeometry;
  brakeDuct: THREE.BufferGeometry;
  gurney: THREE.BufferGeometry;
  sideWinglet: THREE.BufferGeometry;
  fwGurney: THREE.BufferGeometry;
  // livery / numbers
  numberNose: THREE.BufferGeometry;
  numberSide: THREE.BufferGeometry;
  accentStripe: THREE.BufferGeometry;
  shoulderPanel: THREE.BufferGeometry;
  // shadow
  blob: THREE.BufferGeometry;
}

let sharedGeos: SharedGeos | null = null;

function geoAlive(g: THREE.BufferGeometry | undefined): boolean {
  return !!g?.attributes?.position;
}

function makeNoseLathe(): THREE.BufferGeometry {
  // Profile along lathe Y: base (large r) at y=0 → tip (small r) at y=L.
  // After reorient, base at local z=0 and tip at +Z (car forward).
  const pts: THREE.Vector2[] = [];
  const n = 16;
  const L = 1.45;
  for (let i = 0; i <= n; i++) {
    const t = i / n; // 0 = base, 1 = tip
    const r = 0.26 * (1 - t) * (1 - t) + 0.035 + Math.sin((1 - t) * Math.PI) * 0.035;
    pts.push(new THREE.Vector2(r, t * L));
  }
  const geo = new THREE.LatheGeometry(pts, 18);
  geo.rotateZ(-Math.PI / 2);
  geo.rotateY(-Math.PI / 2);
  geo.scale(1, 0.78, 1); // flatten oval nose
  geo.computeVertexNormals();
  return geo;
}

function makeCoverTaperLathe(): THREE.BufferGeometry {
  // Wide at z=0 (front of taper) → narrow at +Z; we'll place + rotate so +Z faces rear.
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const r = 0.24 * (1 - t * 0.72) + 0.04 + Math.sin((1 - t) * Math.PI) * 0.015;
    pts.push(new THREE.Vector2(r, t * 0.85));
  }
  const geo = new THREE.LatheGeometry(pts, 16);
  geo.rotateZ(-Math.PI / 2);
  geo.rotateY(Math.PI / 2);
  // Flip so taper extends toward -Z (rear) when placed
  geo.scale(1, 1, -1);
  geo.computeVertexNormals();
  return geo;
}

/** Undercut sidepod body — ellipse taper along Z (F1-2026 inlet / coke-bottle cue). */
function makeSidepodLathe(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const L = 1.55;
  for (let i = 0; i <= 14; i++) {
    const t = i / 14; // 0 = front scoop, 1 = rear outlet
    const flare = Math.sin(t * Math.PI);
    const r = 0.12 + 0.16 * flare * (1 - t * 0.35) + 0.04 * (1 - t);
    pts.push(new THREE.Vector2(r, t * L));
  }
  const geo = new THREE.LatheGeometry(pts, 14);
  geo.rotateZ(-Math.PI / 2);
  geo.rotateY(-Math.PI / 2);
  // Flatten vertically into a pod (not a full tube)
  geo.scale(1, 0.72, 1);
  geo.computeVertexNormals();
  return geo;
}

/** Engine cover main — rounded loft along car length. */
function makeCoverLathe(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const r = 0.26 * (1 - t * 0.15) + 0.06 * Math.sin(t * Math.PI);
    pts.push(new THREE.Vector2(r, t * 1.35));
  }
  const geo = new THREE.LatheGeometry(pts, 16);
  geo.rotateZ(-Math.PI / 2);
  geo.rotateY(Math.PI / 2);
  geo.scale(1, 0.85, -1);
  geo.computeVertexNormals();
  return geo;
}

function buildSharedGeos(): SharedGeos {
  return {
    tubCore: new THREE.CapsuleGeometry(0.42, 1.9, 6, 12),
    tubFront: new THREE.CapsuleGeometry(0.34, 0.35, 4, 10),
    tubRear: new THREE.CapsuleGeometry(0.36, 0.32, 4, 10),
    tubMid: new THREE.CapsuleGeometry(0.38, 0.45, 4, 10),
    cokeBottle: new THREE.CapsuleGeometry(0.28, 0.28, 4, 10),
    noseLathe: makeNoseLathe(),
    noseBridge: new THREE.CapsuleGeometry(0.16, 0.28, 4, 8),
    noseTip: new THREE.SphereGeometry(0.09, 14, 10),
    noseCamera: new THREE.BoxGeometry(0.06, 0.045, 0.08),

    sidepod: makeSidepodLathe(),
    sidepodTop: new THREE.CapsuleGeometry(0.16, 0.85, 4, 10),
    scoop: new THREE.CylinderGeometry(0.12, 0.18, 0.55, 12),
    scoopLip: new THREE.TorusGeometry(0.16, 0.022, 8, 16, Math.PI),
    outlet: new THREE.CylinderGeometry(0.1, 0.14, 0.22, 10),
    louvre: new THREE.BoxGeometry(0.28, 0.012, 0.08),

    bargeBoard: new THREE.BoxGeometry(0.032, 0.22, 1.1),
    bargeVane: new THREE.BoxGeometry(0.025, 0.16, 0.35),
    floorMain: new THREE.BoxGeometry(1.45, 0.032, 3.35),
    floorEdge: new THREE.BoxGeometry(0.06, 0.05, 2.8),
    floorStrake: new THREE.BoxGeometry(0.03, 0.06, 0.9),

    cockpit: new THREE.BoxGeometry(0.54, 0.15, 0.68),
    visor: new THREE.BoxGeometry(0.48, 0.12, 0.34),
    haloRing: new THREE.TorusGeometry(0.4, 0.032, 12, 32, Math.PI),
    haloPillar: new THREE.CylinderGeometry(0.026, 0.03, 0.34, 10),
    haloStay: new THREE.BoxGeometry(0.022, 0.02, 0.38),
    haloMount: new THREE.BoxGeometry(0.08, 0.04, 0.08),

    cover: makeCoverLathe(),
    coverTaper: makeCoverTaperLathe(),
    airbox: new THREE.CapsuleGeometry(0.12, 0.14, 4, 10),
    airIntake: new THREE.CylinderGeometry(0.075, 0.1, 0.14, 12),
    sharkFin: new THREE.BoxGeometry(0.028, 0.42, 1.05),
    exhaust: new THREE.CylinderGeometry(0.035, 0.04, 0.12, 10),

    mirrorGlass: new THREE.BoxGeometry(0.12, 0.07, 0.02),
    mirrorHousing: new THREE.BoxGeometry(0.14, 0.085, 0.05),
    mirrorStalk: new THREE.CylinderGeometry(0.012, 0.014, 0.22, 8),

    fwMain: new THREE.BoxGeometry(1.95, 0.035, 0.4),
    fw2: new THREE.BoxGeometry(1.78, 0.028, 0.2),
    fw3: new THREE.BoxGeometry(1.58, 0.022, 0.13),
    fw4: new THREE.BoxGeometry(1.38, 0.018, 0.09),
    fwEndplate: new THREE.BoxGeometry(0.032, 0.34, 0.58),
    fwFootplate: new THREE.BoxGeometry(0.32, 0.022, 0.24),
    fwDive: new THREE.BoxGeometry(0.2, 0.02, 0.16),
    fwPylon: new THREE.BoxGeometry(0.05, 0.2, 0.065),
    fwStrake: new THREE.BoxGeometry(0.02, 0.08, 0.28),
    helmet: new THREE.SphereGeometry(0.11, 12, 10),
    haloCamera: new THREE.BoxGeometry(0.05, 0.04, 0.06),
    antenna: new THREE.CylinderGeometry(0.006, 0.01, 0.28, 6),
    rearFence: new THREE.BoxGeometry(0.025, 0.14, 0.55),
    epSlot: new THREE.BoxGeometry(0.05, 0.04, 0.12),

    rwMain: new THREE.BoxGeometry(1.42, 0.045, 0.3),
    rwFlap: new THREE.BoxGeometry(1.32, 0.035, 0.16),
    rwLower: new THREE.BoxGeometry(1.2, 0.025, 0.11),
    rwEndplate: new THREE.BoxGeometry(0.03, 0.62, 0.42),
    rwPillar: new THREE.BoxGeometry(0.032, 0.58, 0.05),
    beamWing: new THREE.BoxGeometry(1.18, 0.028, 0.1),

    diffBody: new THREE.BoxGeometry(1.28, 0.22, 0.36),
    diffVane: new THREE.BoxGeometry(0.028, 0.18, 0.3),
    crashStruct: new THREE.BoxGeometry(0.35, 0.16, 0.2),

    wishbone: new THREE.CylinderGeometry(0.016, 0.016, 1, 6),
    pushrod: new THREE.CylinderGeometry(0.014, 0.014, 1, 6),
    trackrod: new THREE.CylinderGeometry(0.012, 0.012, 1, 6),
    upright: new THREE.BoxGeometry(0.06, 0.12, 0.08),

    tire: new THREE.CylinderGeometry(0.375, 0.375, 0.24, 28),
    // Open rim lip (torus) so spokes stay visible in the wheel face
    rim: new THREE.TorusGeometry(0.225, 0.028, 10, 24),
    rimInner: new THREE.TorusGeometry(0.14, 0.02, 8, 20),
    spoke: new THREE.BoxGeometry(0.05, 0.03, 0.19),
    disc: new THREE.CylinderGeometry(0.17, 0.17, 0.038, 18),
    hub: new THREE.CylinderGeometry(0.055, 0.055, 0.34, 12),
    hubNut: new THREE.CylinderGeometry(0.032, 0.038, 0.045, 10),
    caliper: new THREE.BoxGeometry(0.085, 0.11, 0.065),
    tireGroove: new THREE.TorusGeometry(0.345, 0.014, 8, 24),
    brakeDuct: new THREE.CylinderGeometry(0.05, 0.07, 0.08, 10),
    gurney: new THREE.BoxGeometry(1.28, 0.035, 0.018),
    sideWinglet: new THREE.BoxGeometry(0.22, 0.025, 0.35),
    fwGurney: new THREE.BoxGeometry(1.35, 0.02, 0.014),

    numberNose: new THREE.PlaneGeometry(0.22, 0.16),
    numberSide: new THREE.PlaneGeometry(0.28, 0.18),
    accentStripe: new THREE.BoxGeometry(0.02, 0.12, 1.8),
    shoulderPanel: new THREE.BoxGeometry(0.35, 0.04, 0.55),

    blob: new THREE.CircleGeometry(1.5, 20),
  };
}

function tagShared(geos: SharedGeos): SharedGeos {
  for (const v of Object.values(geos)) {
    const g = v as THREE.BufferGeometry;
    if (g && g.userData) g.userData.sharedGeo = true;
  }
  return geos;
}

function getSharedGeos(): SharedGeos {
  if (!sharedGeos || !geoAlive(sharedGeos.tire) || !geoAlive(sharedGeos.noseLathe)) {
    sharedGeos = tagShared(buildSharedGeos());
  }
  return sharedGeos;
}

// ── Helpers ────────────────────────────────────────────────────────────

type LiveryPart = 'primary' | 'secondary' | 'accent' | 'carbon' | 'none';

function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  part: LiveryPart = 'none',
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.userData.liveryPart = part;
  return m;
}

function place(
  parent: THREE.Object3D,
  m: THREE.Mesh,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.Mesh {
  m.position.set(x, y, z);
  if (rx || ry || rz) m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

function placeScaled(
  parent: THREE.Object3D,
  m: THREE.Mesh,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.Mesh {
  m.scale.set(sx, sy, sz);
  return place(parent, m, x, y, z, rx, ry, rz);
}

/** Stretch a unit-length cylinder between two points (cylinder along Y by default). */
function boneBetween(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): THREE.Mesh {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz) || 0.001;
  const m = mesh(geo, mat, 'carbon');
  m.position.set((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5);
  m.scale.set(1, len, 1);
  // Orient Y-axis toward (dx,dy,dz)
  const dir = new THREE.Vector3(dx, dy, dz).normalize();
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  m.quaternion.copy(quat);
  parent.add(m);
  return m;
}

function numberFromLivery(livery: Livery, override?: number): number {
  if (override != null && override > 0) return override % 100;
  let h = 0;
  for (let i = 0; i < livery.id.length; i++) h = (h * 31 + livery.id.charCodeAt(i)) | 0;
  const n = (Math.abs(h) % 97) + 1;
  return n;
}

function makeNumberTexture(num: number, bg: string, fg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 128, 96);
  // Accent border
  ctx.strokeStyle = fg;
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, 120, 88);
  ctx.fillStyle = fg;
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num), 64, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// ── Public API ─────────────────────────────────────────────────────────

export function createCarMesh(livery: Livery, opts?: CarMeshOptions): THREE.Group {
  const cast = opts?.castShadow !== false;
  const geos = getSharedGeos();
  const g = new THREE.Group();
  g.name = 'playerCar';
  g.userData.liveryId = livery.id;

  // Per-car materials — MeshPhysical paint/glass for real F1 clearcoat look
  const prim = new THREE.MeshPhysicalMaterial({
    color: livery.primary,
    metalness: 0.55,
    roughness: 0.18,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.55,
  });
  const sec = new THREE.MeshPhysicalMaterial({
    color: livery.secondary,
    metalness: 0.45,
    roughness: 0.24,
    clearcoat: 0.85,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.25,
  });
  const acc = new THREE.MeshPhysicalMaterial({
    color: livery.accent,
    metalness: 0.5,
    roughness: 0.2,
    clearcoat: 0.95,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.4,
  });
  const carbon = new THREE.MeshPhysicalMaterial({
    color: 0x0a0a0c,
    metalness: 0.85,
    roughness: 0.38,
    clearcoat: 0.35,
    clearcoatRoughness: 0.35,
    envMapIntensity: 0.85,
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x080808,
    metalness: 0.02,
    roughness: 0.97,
    envMapIntensity: 0.1,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0c1a28,
    metalness: 0.15,
    roughness: 0.05,
    // No transmission — too expensive across full AI grid; reflective tint instead
    transparent: true,
    opacity: 0.42,
    envMapIntensity: 2.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xd8d8dc,
    metalness: 0.96,
    roughness: 0.14,
    envMapIntensity: 1.4,
  });
  const discMat = new THREE.MeshStandardMaterial({
    color: 0x2e2e34,
    metalness: 0.8,
    roughness: 0.35,
    envMapIntensity: 0.8,
  });
  const caliperMat = new THREE.MeshStandardMaterial({
    color: livery.accent,
    metalness: 0.55,
    roughness: 0.35,
    envMapIntensity: 0.9,
  });
  caliperMat.userData.liveryPart = 'accent';

  g.userData.materials = { prim, sec, acc, carbon, rubber, glass, rimMat, discMat, caliperMat };

  // ═══ CHASSIS TUB (capsules along car Z) ═════════════════════════════
  place(g, mesh(geos.tubCore, prim, 'primary'), 0, 0.38, -0.05, Math.PI / 2, 0, 0);
  place(g, mesh(geos.tubFront, prim, 'primary'), 0, 0.36, 1.35, Math.PI / 2, 0, 0);
  place(g, mesh(geos.tubMid, prim, 'primary'), 0, 0.37, 0.65, Math.PI / 2, 0, 0);
  place(g, mesh(geos.tubRear, prim, 'primary'), 0, 0.39, -1.45, Math.PI / 2, 0, 0);
  place(g, mesh(geos.cokeBottle, prim, 'primary'), 0, 0.38, -1.0, Math.PI / 2, 0, 0);

  for (const sx of [-1, 1] as const) {
    place(g, mesh(geos.shoulderPanel, acc, 'accent'), sx * 0.55, 0.54, 0.15);
  }
  place(g, mesh(geos.accentStripe, acc, 'accent'), 0, 0.78, -0.35);

  // ═══ NOSE (sculpted lathe) ═════════════════════════════════════════
  place(g, mesh(geos.noseLathe, prim, 'primary'), 0, 0.32, 1.65);
  place(g, mesh(geos.noseBridge, prim, 'primary'), 0, 0.33, 1.55, Math.PI / 2, 0, 0);
  placeScaled(g, mesh(geos.noseTip, carbon, 'carbon'), 0, 0.3, 3.2, 1, 0.7, 1.35);
  place(g, mesh(geos.noseCamera, carbon, 'carbon'), 0, 0.42, 2.6);

  // ═══ SIDEPODS + UNDERCUT (lathed pods) ══════════════════════════════
  for (const sx of [-1, 1] as const) {
    place(g, mesh(geos.sidepod, sec, 'secondary'), sx * 0.72, 0.42, -0.05);
    place(g, mesh(geos.sidepodTop, prim, 'primary'), sx * 0.7, 0.64, -0.08, Math.PI / 2, 0, 0);
    place(g, mesh(geos.scoop, carbon, 'carbon'), sx * 0.7, 0.24, 0.72, Math.PI / 2, 0, 0);
    place(g, mesh(geos.scoopLip, carbon, 'carbon'), sx * 0.7, 0.28, 0.98, 0, Math.PI / 2, 0);
    place(g, mesh(geos.outlet, carbon, 'carbon'), sx * 0.68, 0.46, -0.75, Math.PI / 2, 0, 0);
    for (let i = 0; i < 3; i++) {
      place(g, mesh(geos.louvre, carbon, 'carbon'), sx * 0.7, 0.4 + i * 0.05, -0.65);
    }
    place(g, mesh(geos.sideWinglet, carbon, 'carbon'), sx * 0.92, 0.56, -0.35, 0, 0, sx * -0.28);
  }

  // ═══ BARGEBOARDS / TURNING VANES ═══════════════════════════════════
  for (const sx of [-1, 1] as const) {
    place(g, mesh(geos.bargeBoard, carbon, 'carbon'), sx * 0.5, 0.18, 0.9);
    place(g, mesh(geos.bargeVane, carbon, 'carbon'), sx * 0.38, 0.16, 1.25);
    place(g, mesh(geos.bargeVane, carbon, 'carbon'), sx * 0.62, 0.15, 1.05, 0, sx * 0.2, 0);
  }

  // ═══ FLOOR + EDGE + STRAKES ════════════════════════════════════════
  place(g, mesh(geos.floorMain, carbon, 'carbon'), 0, 0.1, 0);
  for (const sx of [-1, 1] as const) {
    place(g, mesh(geos.floorEdge, carbon, 'carbon'), sx * 0.72, 0.105, 0.05);
    place(g, mesh(geos.floorStrake, carbon, 'carbon'), sx * 0.45, 0.12, 0.4);
  }

  // ═══ COCKPIT + HALO ════════════════════════════════════════════════
  place(g, mesh(geos.cockpit, carbon, 'carbon'), 0, 0.56, 0.32);
  place(g, mesh(geos.visor, glass, 'none'), 0, 0.7, 0.52);
  // Driver helmet hint under halo
  placeScaled(g, mesh(geos.helmet, acc, 'accent'), 0, 0.62, 0.4, 1, 0.85, 1.1);
  place(g, mesh(geos.haloCamera, carbon, 'carbon'), 0, 0.9, 0.55);

  const halo = mesh(geos.haloRing, carbon, 'carbon');
  place(g, halo, 0, 0.74, 0.38, Math.PI / 2, 0, 0);
  place(g, mesh(geos.haloPillar, carbon, 'carbon'), 0, 0.58, 0.76);
  place(g, mesh(geos.haloMount, carbon, 'carbon'), 0, 0.42, 0.76);
  for (const sx of [-1, 1] as const) {
    place(g, mesh(geos.haloStay, carbon, 'carbon'), sx * 0.34, 0.74, 0.18, 0, sx * 0.18, 0);
    place(g, mesh(geos.haloMount, carbon, 'carbon'), sx * 0.36, 0.55, 0.05);
  }

  // ═══ ENGINE COVER / AIRBOX / FIN / EXHAUST ═════════════════════════
  place(g, mesh(geos.cover, prim, 'primary'), 0, 0.62, -0.15);
  place(g, mesh(geos.coverTaper, prim, 'primary'), 0, 0.64, -1.25);
  place(g, mesh(geos.airbox, carbon, 'carbon'), 0, 0.9, -0.08, Math.PI / 2, 0, 0);
  place(g, mesh(geos.airIntake, carbon, 'carbon'), 0, 0.92, 0.12, Math.PI / 2, 0, 0);
  place(g, mesh(geos.sharkFin, acc, 'accent'), 0, 0.98, -0.7);
  place(g, mesh(geos.antenna, carbon, 'carbon'), 0.06, 1.1, -0.05);
  place(g, mesh(geos.exhaust, carbon, 'carbon'), 0, 0.42, -1.95, Math.PI / 2, 0, 0);

  // ═══ MIRRORS ═══════════════════════════════════════════════════════
  for (const sx of [-1, 1] as const) {
    place(g, mesh(geos.mirrorStalk, carbon, 'carbon'), sx * 0.48, 0.72, 0.55, 0, 0, sx * 0.55);
    place(g, mesh(geos.mirrorHousing, carbon, 'carbon'), sx * 0.62, 0.78, 0.58);
    place(g, mesh(geos.mirrorGlass, glass, 'none'), sx * 0.62, 0.78, 0.61);
  }

  // ═══ FRONT WING (4 elements + endplates + dive planes) ═════════════
  place(g, mesh(geos.fwMain, carbon, 'carbon'), 0, 0.1, 2.72, 0.04, 0, 0);
  place(g, mesh(geos.fw2, acc, 'accent'), 0, 0.148, 2.64, 0.06, 0, 0);
  place(g, mesh(geos.fw3, carbon, 'carbon'), 0, 0.188, 2.57, 0.08, 0, 0);
  place(g, mesh(geos.fw4, carbon, 'carbon'), 0, 0.22, 2.52, 0.1, 0, 0);
  // Twin nose pylons (modern F1 mount)
  for (const sx of [-0.08, 0.08]) {
    place(g, mesh(geos.fwPylon, carbon, 'carbon'), sx, 0.2, 2.58);
  }
  for (const sx of [-1, 1] as const) {
    place(g, mesh(geos.fwEndplate, carbon, 'carbon'), sx * 0.98, 0.2, 2.66);
    place(g, mesh(geos.fwFootplate, carbon, 'carbon'), sx * 0.8, 0.075, 2.55);
    place(g, mesh(geos.fwDive, carbon, 'carbon'), sx * 0.7, 0.13, 2.48);
    place(g, mesh(geos.fwStrake, carbon, 'carbon'), sx * 0.35, 0.14, 2.6);
  }
  // Front-wing gurney on uppermost element
  place(g, mesh(geos.fwGurney, carbon, 'carbon'), 0, 0.245, 2.45);

  // ═══ REAR WING (main + DRS flap + lower + beam + endplates) ════════
  const rw = mesh(geos.rwMain, carbon, 'carbon');
  rw.name = 'rearWing';
  place(g, rw, 0, 1.05, -1.72, -0.08, 0, 0);

  const rwFlap = mesh(geos.rwFlap, acc, 'accent');
  rwFlap.name = 'rearWingFlap';
  place(g, rwFlap, 0, 0.94, -1.66, -0.12, 0, 0);

  place(g, mesh(geos.rwLower, carbon, 'carbon'), 0, 0.84, -1.7, -0.05, 0, 0);
  place(g, mesh(geos.beamWing, carbon, 'carbon'), 0, 0.28, -1.9);

  for (const sx of [-1, 1] as const) {
    place(g, mesh(geos.rwEndplate, carbon, 'carbon'), sx * 0.72, 0.8, -1.72);
    // Horizontal slot hints on endplates
    for (let i = 0; i < 3; i++) {
      place(g, mesh(geos.epSlot, carbon, 'carbon'), sx * 0.74, 0.62 + i * 0.12, -1.55);
    }
  }
  for (const sx of [-0.22, 0.22]) {
    place(g, mesh(geos.rwPillar, carbon, 'carbon'), sx, 0.72, -1.74);
  }
  // DRS gurney lip on flap trailing edge
  place(g, mesh(geos.gurney, acc, 'accent'), 0, 0.95, -1.6);

  // ═══ DIFFUSER ══════════════════════════════════════════════════════
  place(g, mesh(geos.diffBody, carbon, 'carbon'), 0, 0.18, -1.94);
  place(g, mesh(geos.crashStruct, carbon, 'carbon'), 0, 0.3, -1.85);
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    place(g, mesh(geos.diffVane, carbon, 'carbon'), i * 0.16, 0.19, -1.92);
  }
  // Rear floor fences flanking diffuser
  for (const sx of [-1, 1] as const) {
    place(g, mesh(geos.rearFence, carbon, 'carbon'), sx * 0.58, 0.16, -1.7);
  }

  // ═══ SUSPENSION ARMS ═══════════════════════════════════════════════
  // Front wishbones (upper + lower) L/R
  const wheelY = 0.37;
  const fWheelZ = 1.48;
  const rWheelZ = -1.32;
  for (const sx of [-1, 1] as const) {
    const wx = sx * 0.86;
    // Front lower wishbone (two legs)
    boneBetween(g, geos.wishbone, carbon, sx * 0.35, 0.22, fWheelZ + 0.1, wx * 0.92, wheelY - 0.05, fWheelZ);
    boneBetween(g, geos.wishbone, carbon, sx * 0.35, 0.22, fWheelZ - 0.15, wx * 0.92, wheelY - 0.05, fWheelZ);
    // Front upper
    boneBetween(g, geos.wishbone, carbon, sx * 0.3, 0.48, fWheelZ + 0.05, wx * 0.9, wheelY + 0.08, fWheelZ);
    boneBetween(g, geos.wishbone, carbon, sx * 0.3, 0.48, fWheelZ - 0.12, wx * 0.9, wheelY + 0.08, fWheelZ);
    // Front pushrod
    boneBetween(g, geos.pushrod, carbon, sx * 0.25, 0.5, fWheelZ - 0.05, wx * 0.85, wheelY + 0.02, fWheelZ);
    // Front track rod
    boneBetween(g, geos.trackrod, carbon, sx * 0.15, 0.28, fWheelZ + 0.2, wx * 0.88, wheelY - 0.02, fWheelZ + 0.05);
    // Upright
    place(g, mesh(geos.upright, carbon, 'carbon'), wx * 0.95, wheelY, fWheelZ);

    // Rear
    const rwx = sx * 0.9;
    boneBetween(g, geos.wishbone, carbon, sx * 0.35, 0.22, rWheelZ + 0.12, rwx * 0.92, wheelY - 0.05, rWheelZ);
    boneBetween(g, geos.wishbone, carbon, sx * 0.35, 0.22, rWheelZ - 0.12, rwx * 0.92, wheelY - 0.05, rWheelZ);
    boneBetween(g, geos.wishbone, carbon, sx * 0.28, 0.5, rWheelZ + 0.08, rwx * 0.9, wheelY + 0.08, rWheelZ);
    boneBetween(g, geos.wishbone, carbon, sx * 0.28, 0.5, rWheelZ - 0.1, rwx * 0.9, wheelY + 0.08, rWheelZ);
    boneBetween(g, geos.pushrod, carbon, sx * 0.22, 0.52, rWheelZ, rwx * 0.85, wheelY + 0.02, rWheelZ);
    place(g, mesh(geos.upright, carbon, 'carbon'), rwx * 0.95, wheelY, rWheelZ);
  }

  // ═══ WHEELS (tire, rim, spokes, disc, caliper, hub) ════════════════
  // Spoke box is (0.035, 0.018, 0.2) — length along local Z.
  // Wheel axis = world X; spokes radiate in the YZ plane.
  const places: [number, number, number][] = [
    [-0.86, wheelY, fWheelZ],
    [0.86, wheelY, fWheelZ],
    [-0.9, wheelY, rWheelZ],
    [0.9, wheelY, rWheelZ],
  ];
  const SPOKE_COUNT = 5;
  for (const [wx, wy, wz] of places) {
    place(g, mesh(geos.tire, rubber, 'none'), wx, wy, wz, 0, 0, Math.PI / 2);
    // Sidewall groove rings (visual tire detail)
    const groove = mesh(geos.tireGroove, rubber, 'none');
    groove.position.set(wx, wy, wz);
    groove.rotation.y = Math.PI / 2;
    g.add(groove);

    // Rim lips in the wheel plane (YZ); nudge outward past tire sidewall
    const out = Math.sign(wx) * 0.12;
    place(g, mesh(geos.rim, rimMat, 'none'), wx + out * 0.6, wy, wz, 0, Math.PI / 2, 0);
    place(g, mesh(geos.rimInner, carbon, 'carbon'), wx + out * 0.4, wy, wz, 0, Math.PI / 2, 0);
    place(g, mesh(geos.hub, rimMat, 'none'), wx + out, wy, wz, 0, 0, Math.PI / 2);
    place(g, mesh(geos.hubNut, rimMat, 'none'), wx + out * 1.5, wy, wz, 0, 0, Math.PI / 2);
    // Brake disc inset toward chassis
    place(g, mesh(geos.disc, discMat, 'none'), wx * 0.88, wy, wz, 0, 0, Math.PI / 2);
    // Caliper hint (top of disc, team-accent color)
    place(g, mesh(geos.caliper, caliperMat, 'accent'), wx * 0.86, wy + 0.13, wz);
    // Brake duct facing forward
    place(g, mesh(geos.brakeDuct, carbon, 'carbon'), wx * 0.78, wy + 0.02, wz + 0.08, Math.PI / 2, 0, 0);

    for (let s = 0; s < SPOKE_COUNT; s++) {
      const ang = (s / SPOKE_COUNT) * Math.PI * 2;
      const sp = mesh(geos.spoke, rimMat, 'none');
      // Center near outer hub face; rotate so local +Z points radially in YZ
      sp.position.set(wx + out, wy, wz);
      sp.rotation.set(ang, 0, 0);
      g.add(sp);
    }
  }

  // ═══ NUMBER / LIVERY PANELS ════════════════════════════════════════
  const racingNum = numberFromLivery(livery, opts?.racingNumber);
  g.userData.racingNumber = racingNum;
  const numTex = makeNumberTexture(racingNum, livery.secondary, livery.primary);
  const numMat = new THREE.MeshStandardMaterial({
    map: numTex,
    metalness: 0.3,
    roughness: 0.45,
    envMapIntensity: 0.6,
    transparent: false,
    side: THREE.DoubleSide,
  });
  g.userData.numberMat = numMat;

  // Nose number (facing forward-ish, on top of nose bridge)
  const noseNum = mesh(geos.numberNose, numMat, 'none');
  noseNum.name = 'numberNose';
  place(g, noseNum, 0, 0.42, 1.85, -Math.PI / 2.8, 0, 0);

  // Side numbers
  for (const sx of [-1, 1] as const) {
    const sideNum = mesh(geos.numberSide, numMat, 'none');
    sideNum.name = sx < 0 ? 'numberSideL' : 'numberSideR';
    place(g, sideNum, sx * 0.9, 0.48, 0.2, 0, sx * (Math.PI / 2), 0);
  }

  // ═══ BLOB SHADOW ═══════════════════════════════════════════════════
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  const blob = mesh(geos.blob, shadowMat, 'none');
  blob.name = 'blobShadow';
  blob.renderOrder = -1;
  place(g, blob, 0, 0.02, 0, -Math.PI / 2, 0, 0);

  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.name !== 'blobShadow') {
      const m = o as THREE.Mesh;
      m.castShadow = cast;
      m.receiveShadow = true;
    }
  });

  return g;
}

export function applyLivery(car: THREE.Group, livery: Livery): void {
  const mats = car.userData.materials as
    | {
        prim: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
        sec: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
        acc: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
        caliperMat: THREE.MeshStandardMaterial;
      }
    | undefined;
  if (mats) {
    mats.prim.color.set(livery.primary);
    mats.sec.color.set(livery.secondary);
    mats.acc.color.set(livery.accent);
    mats.caliperMat.color.set(livery.accent);
  } else {
    car.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const part = m.userData.liveryPart as LiveryPart | undefined;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (!mat?.color) return;
      if (part === 'primary') mat.color.set(livery.primary);
      else if (part === 'secondary') mat.color.set(livery.secondary);
      else if (part === 'accent') mat.color.set(livery.accent);
    });
  }
  car.userData.liveryId = livery.id;

  // Refresh number texture colors
  const numMat = car.userData.numberMat as THREE.MeshStandardMaterial | undefined;
  const num = (car.userData.racingNumber as number) ?? numberFromLivery(livery);
  if (numMat) {
    const old = numMat.map;
    numMat.map = makeNumberTexture(num, livery.secondary, livery.primary);
    numMat.needsUpdate = true;
    old?.dispose();
  }
}

export function setDrsVisual(car: THREE.Group, open: boolean): void {
  const flap = car.getObjectByName('rearWingFlap');
  if (flap) {
    flap.rotation.x = open ? -0.4 : 0;
  }
}
