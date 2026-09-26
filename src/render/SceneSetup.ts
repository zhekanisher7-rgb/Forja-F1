import * as THREE from 'three';
import type { WeatherState } from '../physics/Weather';
import {
  applyRendererQuality,
  applySunShadowQuality,
  profileFor,
  type GraphicsTier,
} from './GraphicsQuality';

export function createRenderer(
  canvas: HTMLCanvasElement,
  tier: GraphicsTier = 'medium',
): THREE.WebGLRenderer {
  const p = profileFor(tier);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: p.antialias,
    powerPreference: 'high-performance',
  });
  applyRendererQuality(renderer, tier);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  return renderer;
}

function makeSkyTexture(wet: boolean, night: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  if (night) {
    g.addColorStop(0, '#050814');
    g.addColorStop(0.4, '#0a1528');
    g.addColorStop(0.75, '#152038');
    g.addColorStop(1, '#1a2838');
  } else if (wet) {
    g.addColorStop(0, '#2a3548');
    g.addColorStop(0.4, '#4a5568');
    g.addColorStop(0.75, '#6a7080');
    g.addColorStop(1, '#7a8088');
  } else {
    g.addColorStop(0, '#1a4a8a');
    g.addColorStop(0.35, '#3a7ab8');
    g.addColorStop(0.55, '#6aa8d8');
    g.addColorStop(0.78, '#b8d4ec');
    g.addColorStop(1, '#e8f0f8');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);

  const cloudCount = night ? 4 : wet ? 8 : 18;
  for (let i = 0; i < cloudCount; i++) {
    const cx = Math.random() * 512;
    const cy = 280 + Math.random() * 160;
    const rx = 40 + Math.random() * 90;
    const ry = 12 + Math.random() * 28;
    const alpha = night
      ? 0.06 + Math.random() * 0.08
      : wet
        ? 0.12 + Math.random() * 0.12
        : 0.18 + Math.random() * 0.28;
    const grd = ctx.createRadialGradient(cx, cy, 2, cx, cy, rx);
    grd.addColorStop(0, `rgba(255,255,255,${alpha})`);
    grd.addColorStop(0.55, `rgba(240,245,255,${alpha * 0.55})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + rx * 0.35, cy + 4, rx * 0.55, ry * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Night stars
  if (night) {
    for (let i = 0; i < 120; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.4 + Math.random() * 0.6})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 260, 1.2, 1.2);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function makeEnvCubemap(wet: boolean, night = false): THREE.CubeTexture {
  const faces: HTMLCanvasElement[] = [];
  const cols = night
    ? ['#0a1528', '#0a1528', '#1a2840', '#0a1010', '#0a1528', '#0a1528']
    : wet
      ? ['#5a6578', '#5a6578', '#8899aa', '#2a3030', '#5a6578', '#5a6578']
      : ['#6aa0d0', '#6aa0d0', '#c8e0f8', '#3a5a30', '#7ab0d8', '#7ab0d8'];
  for (let f = 0; f < 6; f++) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, cols[f]);
    g.addColorStop(1, f === 3 ? '#2a3a20' : cols[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    if (f !== 3 && !night) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.arc(32, 20, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    faces.push(c);
  }
  const tex = new THREE.CubeTexture(faces);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function addSkyDome(scene: THREE.Scene, weather: WeatherState, night: boolean): THREE.Mesh {
  const wet = weather.type === 'wet';
  const tex = makeSkyTexture(wet, night);
  const geo = new THREE.SphereGeometry(900, 24, 12);
  geo.scale(-1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ map: tex, depthWrite: false });
  const dome = new THREE.Mesh(geo, mat);
  dome.name = 'skyDome';
  dome.frustumCulled = false;
  scene.add(dome);
  return dome;
}

export function createScene(
  weather: WeatherState,
  tier: GraphicsTier = 'medium',
  night = false,
): THREE.Scene {
  const scene = new THREE.Scene();
  const p = profileFor(tier);
  const fogColor = night ? 0x0a1528 : weather.type === 'wet' ? 0x5a6578 : 0x87b8e0;
  scene.fog = new THREE.Fog(fogColor, night ? 45 : p.fogNear, night ? 220 : p.fogFar);
  scene.background = new THREE.Color(fogColor);
  scene.environment = makeEnvCubemap(weather.type === 'wet', night);

  addSkyDome(scene, weather, night);

  const hemi = new THREE.HemisphereLight(
    night ? 0x334466 : weather.type === 'wet' ? 0x8899aa : 0xc8dcff,
    night ? 0x0a1018 : weather.type === 'wet' ? 0x2a3030 : 0x3a4a28,
    night ? 0.22 : weather.type === 'wet' ? 0.45 : 0.7,
  );
  hemi.name = 'hemi';
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(
    night ? 0xaabbff : 0xfff0d0,
    night ? 0.25 : weather.type === 'wet' ? 0.55 : 1.45,
  );
  sun.name = 'sun';
  sun.position.set(80, 120, 40);
  sun.shadow.bias = -0.00012;
  sun.shadow.normalBias = 0.025;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 200;
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  applySunShadowQuality(sun, tier);
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(
    night ? 0x4466aa : 0x88aaff,
    night ? 0.12 : weather.type === 'wet' ? 0.18 : 0.35,
  );
  fill.name = 'fill';
  fill.position.set(-50, 40, -70);
  scene.add(fill);

  const amb = new THREE.AmbientLight(night ? 0x1a2030 : 0x404850, night ? 0.28 : 0.16);
  amb.name = 'amb';
  scene.add(amb);

  // Store night flag for later updates
  (scene.userData as { night?: boolean; tier?: GraphicsTier }).night = night;
  (scene.userData as { night?: boolean; tier?: GraphicsTier }).tier = tier;

  return scene;
}

export function updateSunFollow(scene: THREE.Scene, x: number, z: number): void {
  const sun = scene.getObjectByName('sun') as THREE.DirectionalLight | undefined;
  if (!sun) return;
  sun.target.position.set(x, 0, z);
  sun.position.set(x + 55, 115, z + 40);
  sun.target.updateMatrixWorld();
}

export function applyWeatherVisuals(
  scene: THREE.Scene,
  weather: WeatherState,
  night = false,
  tier?: GraphicsTier,
): void {
  const t = tier ?? ((scene.userData as { tier?: GraphicsTier }).tier || 'medium');
  const p = profileFor(t);
  const fogColor = night ? 0x0a1528 : weather.type === 'wet' ? 0x5a6578 : 0x87b8e0;
  scene.background = new THREE.Color(fogColor);
  if (scene.fog && (scene.fog as THREE.Fog).isFog) {
    const f = scene.fog as THREE.Fog;
    f.color.set(fogColor);
    f.near = night ? 45 : p.fogNear;
    f.far = night ? 220 : p.fogFar;
  }
  scene.environment = makeEnvCubemap(weather.type === 'wet', night);

  const old = scene.getObjectByName('skyDome');
  if (old) {
    scene.remove(old);
    (old as THREE.Mesh).geometry.dispose();
    ((old as THREE.Mesh).material as THREE.Material).dispose();
  }
  addSkyDome(scene, weather, night);

  const hemi = scene.getObjectByName('hemi') as THREE.HemisphereLight | undefined;
  if (hemi) {
    hemi.color.set(night ? 0x334466 : weather.type === 'wet' ? 0x8899aa : 0xc8dcff);
    hemi.groundColor.set(night ? 0x0a1018 : weather.type === 'wet' ? 0x2a3030 : 0x3a4a28);
    hemi.intensity = night ? 0.22 : weather.type === 'wet' ? 0.45 : 0.7;
  }
  const sun = scene.getObjectByName('sun') as THREE.DirectionalLight | undefined;
  if (sun) {
    sun.color.set(night ? 0xaabbff : 0xfff0d0);
    sun.intensity = night ? 0.25 : weather.type === 'wet' ? 0.55 : 1.45;
    applySunShadowQuality(sun, t);
  }
  const fill = scene.getObjectByName('fill') as THREE.DirectionalLight | undefined;
  if (fill) {
    fill.color.set(night ? 0x4466aa : 0x88aaff);
    fill.intensity = night ? 0.12 : weather.type === 'wet' ? 0.18 : 0.35;
  }
  const amb = scene.getObjectByName('amb') as THREE.AmbientLight | undefined;
  if (amb) {
    amb.color.set(night ? 0x1a2030 : 0x404850);
    amb.intensity = night ? 0.28 : 0.16;
  }
  (scene.userData as { night?: boolean }).night = night;
}

export function applyGraphicsTier(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  tier: GraphicsTier,
): void {
  applyRendererQuality(renderer, tier);
  const sun = scene.getObjectByName('sun') as THREE.DirectionalLight | undefined;
  if (sun) applySunShadowQuality(sun, tier);
  (scene.userData as { tier?: GraphicsTier }).tier = tier;
  const night = !!(scene.userData as { night?: boolean }).night;
  if (scene.fog && (scene.fog as THREE.Fog).isFog) {
    const pf = profileFor(tier);
    (scene.fog as THREE.Fog).near = night ? 45 : pf.fogNear;
    (scene.fog as THREE.Fog).far = night ? 220 : pf.fogFar;
  }
}
