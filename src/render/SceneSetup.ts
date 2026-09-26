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
    // Preserve for post FX readback when High/Ultra
    stencil: false,
  });
  applyRendererQuality(renderer, tier);
  renderer.setSize(window.innerWidth, window.innerHeight);
  return renderer;
}

function makeSkyTexture(wet: boolean, night: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  if (night) {
    g.addColorStop(0, '#03060e');
    g.addColorStop(0.35, '#0a1428');
    g.addColorStop(0.7, '#152038');
    g.addColorStop(1, '#1c2a3c');
  } else if (wet) {
    g.addColorStop(0, '#2a3548');
    g.addColorStop(0.4, '#4a5568');
    g.addColorStop(0.75, '#6a7080');
    g.addColorStop(1, '#7a8088');
  } else {
    // Monaco midday / early afternoon — deep Mediterranean blue → warm horizon haze
    g.addColorStop(0, '#0e3a7a');
    g.addColorStop(0.28, '#2a6eb8');
    g.addColorStop(0.5, '#5a9fd0');
    g.addColorStop(0.72, '#b8d4ec');
    g.addColorStop(0.88, '#e8dcc8');
    g.addColorStop(1, '#f0e8d8');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);

  // Soft sun glow disc (day)
  if (!night && !wet) {
    const sun = ctx.createRadialGradient(380, 120, 4, 380, 120, 90);
    sun.addColorStop(0, 'rgba(255,250,230,0.95)');
    sun.addColorStop(0.25, 'rgba(255,230,180,0.45)');
    sun.addColorStop(0.55, 'rgba(255,210,140,0.12)');
    sun.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(380, 120, 90, 0, Math.PI * 2);
    ctx.fill();
  }

  const cloudCount = night ? 4 : wet ? 10 : 16;
  for (let i = 0; i < cloudCount; i++) {
    const cx = Math.random() * 512;
    const cy = 260 + Math.random() * 170;
    const rx = 40 + Math.random() * 90;
    const ry = 12 + Math.random() * 28;
    const alpha = night
      ? 0.06 + Math.random() * 0.08
      : wet
        ? 0.14 + Math.random() * 0.14
        : 0.12 + Math.random() * 0.22;
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

  if (night) {
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.35 + Math.random() * 0.65})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 260, 1.2, 1.2);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function makeEnvCubemap(
  wet: boolean,
  night = false,
  faceSize = 128,
): THREE.CubeTexture {
  const size = Math.max(64, Math.min(256, faceSize));
  const faces: HTMLCanvasElement[] = [];
  const cols = night
    ? ['#0a1528', '#0a1528', '#1a2840', '#0a1010', '#0a1528', '#0a1528']
    : wet
      ? ['#5a6578', '#5a6578', '#8899aa', '#2a3030', '#5a6578', '#5a6578']
      : ['#4a90c8', '#4a90c8', '#e8f0fc', '#2a4a20', '#5aa0d0', '#5aa0d0'];
  for (let f = 0; f < 6; f++) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, cols[f]);
    g.addColorStop(0.55, f === 2 ? cols[2] : cols[f]);
    g.addColorStop(1, f === 3 ? '#2a3a20' : cols[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    if (f !== 3 && !night) {
      const sun = ctx.createRadialGradient(size * 0.5, size * 0.28, 2, size * 0.5, size * 0.28, size * 0.22);
      sun.addColorStop(0, 'rgba(255,250,230,0.9)');
      sun.addColorStop(0.35, 'rgba(255,240,200,0.4)');
      sun.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sun;
      ctx.beginPath();
      ctx.arc(size * 0.5, size * 0.28, size * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(0, size * 0.55, size, size * 0.18);
    }
    if (night && f !== 3) {
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`;
        ctx.fillRect(Math.random() * size, Math.random() * size * 0.55, 1.5, 1.5);
      }
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
  const geo = new THREE.SphereGeometry(900, 32, 16);
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
  // Cool Mediterranean haze — slightly desaturated blue
  const fogColor = night ? 0x0a1528 : weather.type === 'wet' ? 0x5a6578 : 0x8ab4d8;
  scene.fog = new THREE.Fog(fogColor, night ? 45 : p.fogNear, night ? 220 : p.fogFar);
  scene.background = new THREE.Color(fogColor);
  scene.environment = makeEnvCubemap(weather.type === 'wet', night, p.envMapSize);

  addSkyDome(scene, weather, night);

  const hemi = new THREE.HemisphereLight(
    night ? 0x334466 : weather.type === 'wet' ? 0x8899aa : 0xd8e8ff,
    night ? 0x0a1018 : weather.type === 'wet' ? 0x2a3030 : 0x4a5a32,
    night ? 0.28 : weather.type === 'wet' ? 0.5 : 0.92,
  );
  hemi.name = 'hemi';
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(
    night ? 0xaabbff : 0xfff0d0,
    night ? 0.28 : weather.type === 'wet' ? 0.6 : p.sunIntensity,
  );
  sun.name = 'sun';
  // Afternoon angle — longer soft shadows along the harbor
  sun.position.set(95, 105, 55);
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.03;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 220;
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  applySunShadowQuality(sun, tier);
  scene.add(sun);
  scene.add(sun.target);

  // Cool fill from harbor side — lifts shadow side of cars / asphalt
  const fill = new THREE.DirectionalLight(
    night ? 0x4466aa : 0x88b0ff,
    night ? 0.14 : weather.type === 'wet' ? 0.22 : 0.42,
  );
  fill.name = 'fill';
  fill.position.set(-60, 45, -80);
  scene.add(fill);

  // Warm bounce from sunlit buildings / asphalt
  const bounce = new THREE.DirectionalLight(
    night ? 0x223344 : 0xffd8a8,
    night ? 0.06 : weather.type === 'wet' ? 0.1 : 0.22,
  );
  bounce.name = 'bounce';
  bounce.position.set(30, 12, -40);
  scene.add(bounce);

  const amb = new THREE.AmbientLight(night ? 0x1a2030 : 0x485058, night ? 0.3 : 0.14);
  amb.name = 'amb';
  scene.add(amb);

  (scene.userData as { night?: boolean; tier?: GraphicsTier }).night = night;
  (scene.userData as { night?: boolean; tier?: GraphicsTier }).tier = tier;

  return scene;
}

export function updateSunFollow(scene: THREE.Scene, x: number, z: number): void {
  const sun = scene.getObjectByName('sun') as THREE.DirectionalLight | undefined;
  if (!sun) return;
  sun.target.position.set(x, 0, z);
  sun.position.set(x + 70, 100, z + 48);
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
  const fogColor = night ? 0x0a1528 : weather.type === 'wet' ? 0x5a6578 : 0x8ab4d8;
  scene.background = new THREE.Color(fogColor);
  if (scene.fog && (scene.fog as THREE.Fog).isFog) {
    const f = scene.fog as THREE.Fog;
    f.color.set(fogColor);
    f.near = night ? 45 : p.fogNear;
    f.far = night ? 220 : p.fogFar;
  }
  scene.environment = makeEnvCubemap(weather.type === 'wet', night, p.envMapSize);

  const old = scene.getObjectByName('skyDome');
  if (old) {
    scene.remove(old);
    (old as THREE.Mesh).geometry.dispose();
    ((old as THREE.Mesh).material as THREE.Material).dispose();
  }
  addSkyDome(scene, weather, night);

  const hemi = scene.getObjectByName('hemi') as THREE.HemisphereLight | undefined;
  if (hemi) {
    hemi.color.set(night ? 0x334466 : weather.type === 'wet' ? 0x8899aa : 0xd8e8ff);
    hemi.groundColor.set(night ? 0x0a1018 : weather.type === 'wet' ? 0x2a3030 : 0x4a5a32);
    hemi.intensity = night ? 0.28 : weather.type === 'wet' ? 0.5 : 0.92;
  }
  const sun = scene.getObjectByName('sun') as THREE.DirectionalLight | undefined;
  if (sun) {
    sun.color.set(night ? 0xaabbff : 0xfff0d0);
    sun.intensity = night ? 0.28 : weather.type === 'wet' ? 0.6 : p.sunIntensity;
    applySunShadowQuality(sun, t);
  }
  const fill = scene.getObjectByName('fill') as THREE.DirectionalLight | undefined;
  if (fill) {
    fill.color.set(night ? 0x4466aa : 0x88b0ff);
    fill.intensity = night ? 0.14 : weather.type === 'wet' ? 0.22 : 0.42;
  }
  const bounce = scene.getObjectByName('bounce') as THREE.DirectionalLight | undefined;
  if (bounce) {
    bounce.color.set(night ? 0x223344 : 0xffd8a8);
    bounce.intensity = night ? 0.06 : weather.type === 'wet' ? 0.1 : 0.22;
  }
  const amb = scene.getObjectByName('amb') as THREE.AmbientLight | undefined;
  if (amb) {
    amb.color.set(night ? 0x1a2030 : 0x485058);
    amb.intensity = night ? 0.3 : 0.14;
  }
  (scene.userData as { night?: boolean }).night = night;
}

export function applyGraphicsTier(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  tier: GraphicsTier,
): void {
  const p = applyRendererQuality(renderer, tier);
  const sun = scene.getObjectByName('sun') as THREE.DirectionalLight | undefined;
  if (sun) {
    applySunShadowQuality(sun, tier);
    const night = !!(scene.userData as { night?: boolean }).night;
    if (!night) sun.intensity = p.sunIntensity;
  }
  (scene.userData as { tier?: GraphicsTier }).tier = tier;
  const night = !!(scene.userData as { night?: boolean }).night;
  if (scene.fog && (scene.fog as THREE.Fog).isFog) {
    (scene.fog as THREE.Fog).near = night ? 45 : p.fogNear;
    (scene.fog as THREE.Fog).far = night ? 220 : p.fogFar;
  }
}
