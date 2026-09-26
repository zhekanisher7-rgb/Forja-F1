import * as THREE from 'three';
import type { Livery } from '../vehicles/Liveries';

/**
 * Procedural F1-2026-ish car — tapered nose, undercut sidepods, multi-element
 * wings, proper halo, detailed wheels. Shared geos L/R; ~1 draw-heavy mesh
 * group kept lean for AI packs + Medium ~60 FPS.
 */
export function createCarMesh(livery: Livery, opts?: { castShadow?: boolean }): THREE.Group {
  const cast = opts?.castShadow !== false;
  const g = new THREE.Group();
  g.name = 'playerCar';

  const prim = new THREE.MeshStandardMaterial({
    color: livery.primary,
    metalness: 0.78,
    roughness: 0.14,
    envMapIntensity: 1.35,
  });
  const sec = new THREE.MeshStandardMaterial({
    color: livery.secondary,
    metalness: 0.62,
    roughness: 0.22,
    envMapIntensity: 1.05,
  });
  const acc = new THREE.MeshStandardMaterial({
    color: livery.accent,
    metalness: 0.8,
    roughness: 0.12,
    envMapIntensity: 1.25,
  });
  const carbon = new THREE.MeshStandardMaterial({
    color: 0x141414,
    metalness: 0.88,
    roughness: 0.28,
    envMapIntensity: 0.95,
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x0c0c0c,
    metalness: 0.02,
    roughness: 0.94,
    envMapIntensity: 0.15,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x0a1218,
    metalness: 0.85,
    roughness: 0.06,
    envMapIntensity: 1.55,
    transparent: true,
    opacity: 0.82,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xd8d8dc,
    metalness: 0.92,
    roughness: 0.18,
    envMapIntensity: 1.2,
  });
  const discMat = new THREE.MeshStandardMaterial({
    color: 0x3a3a40,
    metalness: 0.7,
    roughness: 0.4,
    envMapIntensity: 0.7,
  });

  // ── Chassis tub (tapered via stacked scaled boxes) ──
  const tubCore = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.3, 2.55), prim);
  tubCore.position.set(0, 0.36, -0.05);
  g.add(tubCore);
  const tubFront = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.26, 0.7), prim);
  tubFront.position.set(0, 0.34, 1.35);
  g.add(tubFront);
  const tubRear = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.28, 0.65), prim);
  tubRear.position.set(0, 0.37, -1.45);
  g.add(tubRear);

  // ── Narrow 2026-style nose (cone + tip) ──
  const noseCone = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.22, 1.35, 10), prim);
  noseCone.rotation.x = Math.PI / 2;
  noseCone.position.set(0, 0.3, 2.35);
  g.add(noseCone);
  const noseBridge = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.55), prim);
  noseBridge.position.set(0, 0.31, 1.65);
  g.add(noseBridge);
  const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), carbon);
  noseTip.scale.set(1, 0.7, 1.4);
  noseTip.position.set(0, 0.28, 3.05);
  g.add(noseTip);

  // ── Sidepods with undercut scoop ──
  for (const sx of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.38, 1.5), sec);
    pod.position.set(sx * 0.78, 0.4, 0.0);
    g.add(pod);
    // Undercut / inlet (lower + forward carbon)
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.55), carbon);
    scoop.position.set(sx * 0.74, 0.22, 0.65);
    g.add(scoop);
    // Cooling outlet hint at rear of pod
    const outlet = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.2), carbon);
    outlet.position.set(sx * 0.72, 0.42, -0.7);
    g.add(outlet);
    // Floor fence / bargeboard
    const fence = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.2, 1.05), carbon);
    fence.position.set(sx * 0.52, 0.18, 0.85);
    g.add(fence);
  }

  // ── Halo (torus arch + central pillar + stays) ──
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.035, 8, 20, Math.PI), carbon);
  halo.rotation.x = Math.PI / 2;
  halo.position.set(0, 0.72, 0.38);
  g.add(halo);
  const haloPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.32, 8), carbon);
  haloPillar.position.set(0, 0.58, 0.74);
  g.add(haloPillar);
  for (const sx of [-1, 1]) {
    const stay = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, 0.35), carbon);
    stay.position.set(sx * 0.32, 0.72, 0.2);
    stay.rotation.y = sx * 0.15;
    g.add(stay);
  }

  // ── Cockpit / visor ──
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.14, 0.65), carbon);
  cockpit.position.set(0, 0.56, 0.32);
  g.add(cockpit);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.11, 0.32), glass);
  visor.position.set(0, 0.7, 0.52);
  g.add(visor);

  // ── Engine cover / airbox / shark fin ──
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.4, 1.3), prim);
  cover.position.set(0, 0.56, -0.5);
  g.add(cover);
  const coverTaper = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 0.55, 8), prim);
  coverTaper.rotation.x = Math.PI / 2;
  coverTaper.position.set(0, 0.62, -1.25);
  g.add(coverTaper);
  const airbox = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.32), carbon);
  airbox.position.set(0, 0.84, -0.12);
  g.add(airbox);
  const airIntake = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 10), carbon);
  airIntake.rotation.x = Math.PI / 2;
  airIntake.position.set(0, 0.86, 0.08);
  g.add(airIntake);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.36, 0.9), acc);
  fin.position.set(0, 0.9, -0.7);
  g.add(fin);

  // ── Front wing — 3 elements + endplates + footplates ──
  const fwMain = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.045, 0.4), carbon);
  fwMain.position.set(0, 0.1, 2.68);
  g.add(fwMain);
  const fw2 = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.035, 0.2), acc);
  fw2.position.set(0, 0.155, 2.6);
  g.add(fw2);
  const fw3 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.028, 0.12), carbon);
  fw3.position.set(0, 0.2, 2.54);
  g.add(fw3);
  for (const sx of [-1, 1]) {
    const ep = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.3, 0.52), carbon);
    ep.position.set(sx * 0.96, 0.2, 2.65);
    g.add(ep);
    // Footplate / dive plane
    const dive = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.025, 0.22), carbon);
    dive.position.set(sx * 0.78, 0.08, 2.55);
    g.add(dive);
  }
  // Nose pylon to wing
  const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.08), carbon);
  pylon.position.set(0, 0.2, 2.55);
  g.add(pylon);

  // ── Rear wing — mainplane + DRS flap + beam + endplates ──
  const rw = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.3), carbon);
  rw.position.set(0, 1.0, -1.7);
  rw.name = 'rearWing';
  g.add(rw);
  const rwFlap = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.045, 0.16), acc);
  rwFlap.position.set(0, 0.9, -1.66);
  rwFlap.name = 'rearWingFlap';
  g.add(rwFlap);
  const beamWing = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.035, 0.1), carbon);
  beamWing.position.set(0, 0.28, -1.88);
  g.add(beamWing);
  for (const sx of [-1, 1]) {
    const ep = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.55, 0.36), carbon);
    ep.position.set(sx * 0.7, 0.78, -1.7);
    g.add(ep);
  }
  // Rear wing pillars
  for (const sx of [-0.2, 0.2]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.55, 0.06), carbon);
    pillar.position.set(sx, 0.7, -1.72);
    g.add(pillar);
  }

  // ── Wheels: tire + rim + brake disc (shared geos) ──
  const tireGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.3, 16);
  const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.32, 12);
  const discGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.04, 12);
  const hubGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.34, 8);
  // Simple spoke ring (torus) for rim detail
  const spokeGeo = new THREE.TorusGeometry(0.15, 0.018, 6, 12);
  const places: [number, number, number][] = [
    [-0.86, 0.37, 1.48],
    [0.86, 0.37, 1.48],
    [-0.9, 0.37, -1.32],
    [0.9, 0.37, -1.32],
  ];
  for (const [wx, wy, wz] of places) {
    const tire = new THREE.Mesh(tireGeo, rubber);
    tire.rotation.z = Math.PI / 2;
    tire.position.set(wx, wy, wz);
    g.add(tire);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.z = Math.PI / 2;
    rim.position.set(wx, wy, wz);
    g.add(rim);
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.rotation.z = Math.PI / 2;
    disc.position.set(wx * 0.92, wy, wz);
    g.add(disc);
    const hub = new THREE.Mesh(hubGeo, rimMat);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(wx, wy, wz);
    g.add(hub);
    const spoke = new THREE.Mesh(spokeGeo, rimMat);
    spoke.rotation.y = Math.PI / 2;
    spoke.position.set(wx, wy, wz);
    g.add(spoke);
  }

  // ── Floor + diffuser vanes ──
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.035, 3.3), carbon);
  floor.position.y = 0.1;
  g.add(floor);
  const diff = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.2, 0.32), carbon);
  diff.position.set(0, 0.17, -1.92);
  g.add(diff);
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    const vane = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.28), carbon);
    vane.position.set(i * 0.22, 0.18, -1.9);
    g.add(vane);
  }

  // Soft blob shadow
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  const blob = new THREE.Mesh(new THREE.CircleGeometry(1.45, 18), shadowMat);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.022;
  blob.name = 'blobShadow';
  blob.renderOrder = -1;
  g.add(blob);

  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.name !== 'blobShadow') {
      (o as THREE.Mesh).castShadow = cast;
      (o as THREE.Mesh).receiveShadow = true;
    }
  });

  return g;
}

export function applyLivery(car: THREE.Group, livery: Livery): void {
  void car;
  void livery;
}

export function setDrsVisual(car: THREE.Group, open: boolean): void {
  const flap = car.getObjectByName('rearWingFlap');
  if (flap) {
    flap.rotation.x = open ? -0.38 : 0;
  }
}
