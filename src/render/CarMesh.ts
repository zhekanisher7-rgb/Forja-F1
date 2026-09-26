import * as THREE from 'three';
import type { Livery } from '../vehicles/Liveries';

/** F1-2026-inspired silhouette — narrower nose, bargeboards, diffuser, halo */
export function createCarMesh(livery: Livery, opts?: { castShadow?: boolean }): THREE.Group {
  const cast = opts?.castShadow !== false;
  const g = new THREE.Group();
  g.name = 'playerCar';

  const prim = new THREE.MeshStandardMaterial({
    color: livery.primary,
    metalness: 0.72,
    roughness: 0.18,
    envMapIntensity: 1.15,
  });
  const sec = new THREE.MeshStandardMaterial({
    color: livery.secondary,
    metalness: 0.55,
    roughness: 0.28,
    envMapIntensity: 0.9,
  });
  const acc = new THREE.MeshStandardMaterial({
    color: livery.accent,
    metalness: 0.75,
    roughness: 0.16,
    envMapIntensity: 1.1,
  });
  const carbon = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    metalness: 0.8,
    roughness: 0.32,
    envMapIntensity: 0.85,
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x0a0a0a,
    metalness: 0.05,
    roughness: 0.92,
    envMapIntensity: 0.2,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x101820,
    metalness: 0.9,
    roughness: 0.08,
    envMapIntensity: 1.4,
    transparent: true,
    opacity: 0.85,
  });

  // Main tub — slightly tapered feel via stacked boxes
  const tub = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.32, 2.9), prim);
  tub.position.y = 0.34;
  g.add(tub);
  const tubRear = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.28, 0.7), prim);
  tubRear.position.set(0, 0.36, -1.55);
  g.add(tubRear);

  // Narrow 2026-style nose cone
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 1.5), prim);
  nose.position.set(0, 0.3, 2.15);
  g.add(nose);
  const noseMid = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.7), prim);
  noseMid.position.set(0, 0.32, 1.45);
  g.add(noseMid);
  const noseTip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.45), carbon);
  noseTip.position.set(0, 0.28, 2.95);
  g.add(noseTip);

  // Sidepods — undercut vibe (taller rear, scooped front)
  const podL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 1.55), sec);
  podL.position.set(-0.82, 0.38, 0.05);
  g.add(podL);
  const podR = podL.clone();
  podR.position.x = 0.82;
  g.add(podR);
  const scoopL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.6), carbon);
  scoopL.position.set(-0.78, 0.22, 0.7);
  g.add(scoopL);
  const scoopR = scoopL.clone();
  scoopR.position.x = 0.78;
  g.add(scoopR);

  // Bargeboard / floor fence hints
  const fenceL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 1.1), carbon);
  fenceL.position.set(-0.55, 0.18, 0.9);
  g.add(fenceL);
  const fenceR = fenceL.clone();
  fenceR.position.x = 0.55;
  g.add(fenceR);

  // Halo
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.04, 8, 16, Math.PI), carbon);
  halo.rotation.x = Math.PI / 2;
  halo.position.set(0, 0.7, 0.4);
  g.add(halo);
  const haloPillar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.06), carbon);
  haloPillar.position.set(0, 0.58, 0.72);
  g.add(haloPillar);

  // Cockpit / visor
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.15, 0.7), carbon);
  cockpit.position.set(0, 0.55, 0.35);
  g.add(cockpit);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.35), glass);
  visor.position.set(0, 0.68, 0.55);
  g.add(visor);

  // Engine cover / airbox / shark fin
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.42, 1.35), prim);
  cover.position.set(0, 0.55, -0.55);
  g.add(cover);
  const airbox = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.35), carbon);
  airbox.position.set(0, 0.82, -0.15);
  g.add(airbox);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.38, 0.95), acc);
  fin.position.set(0, 0.88, -0.75);
  g.add(fin);

  // Front wing — multi-element
  const fw = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.05, 0.42), carbon);
  fw.position.set(0, 0.1, 2.65);
  g.add(fw);
  const fw2 = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.04, 0.22), acc);
  fw2.position.set(0, 0.16, 2.58);
  g.add(fw2);
  const fw3 = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.03, 0.14), carbon);
  fw3.position.set(0, 0.21, 2.52);
  g.add(fw3);
  const endplateL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.32, 0.55), carbon);
  endplateL.position.set(-0.98, 0.2, 2.62);
  g.add(endplateL);
  const endplateR = endplateL.clone();
  endplateR.position.x = 0.98;
  g.add(endplateR);

  // Rear wing
  const rw = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.07, 0.32), carbon);
  rw.position.set(0, 0.98, -1.72);
  rw.name = 'rearWing';
  g.add(rw);
  const rw2 = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.05, 0.18), acc);
  rw2.position.set(0, 0.88, -1.68);
  rw2.name = 'rearWingFlap';
  g.add(rw2);
  const beamWing = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.12), carbon);
  beamWing.position.set(0, 0.28, -1.85);
  g.add(beamWing);
  const rwEndL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.58, 0.38), carbon);
  rwEndL.position.set(-0.72, 0.75, -1.72);
  g.add(rwEndL);
  const rwEndR = rwEndL.clone();
  rwEndR.position.x = 0.72;
  g.add(rwEndR);

  // Wheels + rims
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.32, 14);
  const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.34, 10);
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xccccd0,
    metalness: 0.85,
    roughness: 0.25,
    envMapIntensity: 1.0,
  });
  const places = [
    [-0.85, 0.36, 1.5],
    [0.85, 0.36, 1.5],
    [-0.9, 0.36, -1.35],
    [0.9, 0.36, -1.35],
  ];
  for (const [wx, wy, wz] of places) {
    const w = new THREE.Mesh(wheelGeo, rubber);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, wy, wz);
    g.add(w);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.z = Math.PI / 2;
    rim.position.set(wx, wy, wz);
    g.add(rim);
  }

  // Floor / diffuser
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.04, 3.35), carbon);
  floor.position.y = 0.1;
  g.add(floor);
  const diff = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.22, 0.35), carbon);
  diff.position.set(0, 0.18, -1.95);
  g.add(diff);

  // Soft blob shadow
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const blob = new THREE.Mesh(new THREE.CircleGeometry(1.5, 20), shadowMat);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.025;
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
    flap.rotation.x = open ? -0.35 : 0;
  }
}
