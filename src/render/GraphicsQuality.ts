import * as THREE from 'three';

export type GraphicsTier = 'low' | 'medium' | 'high' | 'ultra';

export interface GraphicsSettings {
  tier: GraphicsTier;
  showFps: boolean;
  /** Night lighting — darker ambient, cooler sky, brighter lamp emissive */
  night: boolean;
  /** Settings schema version (v2: ultra = best, not emergency-low) */
  v?: number;
}

export const DEFAULT_GRAPHICS: GraphicsSettings = {
  tier: 'medium',
  showFps: false,
  night: false,
  v: 2,
};

export interface QualityProfile {
  pixelRatioCap: number;
  shadowEnabled: boolean;
  shadowMapSize: number;
  shadowRadius: number;
  shadowCamExtent: number;
  antialias: boolean;
  /** Sample every Nth track point for scenery placement (higher = fewer props) */
  sceneryStep: number;
  sceneryCastShadow: boolean;
  /** Cars cast shadows even when scenery does not (Medium soft-shadow budget) */
  carCastShadow: boolean;
  asphaltCastShadow: boolean;
  treeDetail: number;
  fogNear: number;
  fogFar: number;
  anisotropy: number;
  useLambertScenery: boolean;
  /** Clearance beyond asphalt edge + barriers (m) before prop AABB */
  sceneryMargin: number;
  maxBuildings: number;
  maxTrees: number;
  maxLamps: number;
  /** AI physics update rate Hz (capped); mesh still syncs cheaper */
  aiUpdateHz: number;
  tunnelPointLights: boolean;
  /** Merge track dash markings into fewer meshes */
  markingStep: number;
  /** Extra landscape props (rocks, banners, flower beds) */
  maxDecor: number;
  /** Distant hillside / landmark clusters */
  hillsideClusters: number;
  /** Lightweight bloom + vignette (High/Ultra) */
  postFX: boolean;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  vignetteDarkness: number;
  /** Asphalt MeshPhysical clearcoat / wet sheen */
  asphaltClearcoat: boolean;
  /** Reflective harbor water (Standard/Physical) */
  reflectiveWater: boolean;
  /** Animate water UVs / normals */
  animatedWater: boolean;
  /** Cubemap face size for env reflections */
  envMapSize: number;
  /** Sun intensity multiplier (day) */
  sunIntensity: number;
  /** Exposure for ACES tone mapping (day) */
  exposure: number;
}

const PROFILES: Record<GraphicsTier, QualityProfile> = {
  /** Playable floor — weak iGPUs / battery */
  low: {
    pixelRatioCap: 1,
    shadowEnabled: false,
    shadowMapSize: 512,
    shadowRadius: 1,
    shadowCamExtent: 50,
    antialias: false,
    sceneryStep: 4,
    sceneryCastShadow: false,
    carCastShadow: false,
    asphaltCastShadow: false,
    treeDetail: 5,
    fogNear: 55,
    fogFar: 300,
    anisotropy: 1,
    useLambertScenery: true,
    sceneryMargin: 4.0,
    maxBuildings: 28,
    maxTrees: 40,
    maxLamps: 22,
    aiUpdateHz: 24,
    tunnelPointLights: false,
    markingStep: 22,
    maxDecor: 14,
    hillsideClusters: 3,
    postFX: false,
    bloomStrength: 0,
    bloomRadius: 0.4,
    bloomThreshold: 0.9,
    vignetteDarkness: 0,
    asphaltClearcoat: false,
    reflectiveWater: false,
    animatedWater: false,
    envMapSize: 64,
    sunIntensity: 1.35,
    exposure: 1.15,
  },
  /** Default — soft car shadows, no post; target ~60 FPS mid laptop */
  medium: {
    pixelRatioCap: 1,
    shadowEnabled: true,
    shadowMapSize: 1024,
    shadowRadius: 2.5,
    shadowCamExtent: 42,
    antialias: true,
    sceneryStep: 3,
    sceneryCastShadow: false,
    carCastShadow: true,
    asphaltCastShadow: false,
    treeDetail: 6,
    fogNear: 90,
    fogFar: 420,
    anisotropy: 4,
    useLambertScenery: true,
    sceneryMargin: 4.0,
    maxBuildings: 58,
    maxTrees: 78,
    maxLamps: 38,
    aiUpdateHz: 30,
    tunnelPointLights: false,
    markingStep: 14,
    maxDecor: 32,
    hillsideClusters: 7,
    postFX: false,
    bloomStrength: 0,
    bloomRadius: 0.4,
    bloomThreshold: 0.9,
    vignetteDarkness: 0,
    asphaltClearcoat: false,
    reflectiveWater: false,
    animatedWater: false,
    envMapSize: 128,
    sunIntensity: 1.7,
    exposure: 1.2,
  },
  /** Soft shadows + scenery casts + subtle bloom/vignette */
  high: {
    pixelRatioCap: 1.25,
    shadowEnabled: true,
    shadowMapSize: 1536,
    shadowRadius: 2.2,
    shadowCamExtent: 48,
    antialias: true,
    sceneryStep: 2,
    sceneryCastShadow: true,
    carCastShadow: true,
    asphaltCastShadow: false,
    treeDetail: 6,
    fogNear: 100,
    fogFar: 480,
    anisotropy: 8,
    useLambertScenery: false,
    sceneryMargin: 3.0,
    maxBuildings: 78,
    maxTrees: 96,
    maxLamps: 52,
    aiUpdateHz: 40,
    tunnelPointLights: false,
    markingStep: 12,
    maxDecor: 48,
    hillsideClusters: 9,
    postFX: true,
    bloomStrength: 0.2,
    bloomRadius: 0.42,
    bloomThreshold: 0.84,
    vignetteDarkness: 0.38,
    asphaltClearcoat: true,
    reflectiveWater: true,
    animatedWater: false,
    envMapSize: 128,
    sunIntensity: 1.85,
    exposure: 1.18,
  },
  /** Max AAA-lite — heavier shadows, animated water, stronger post */
  ultra: {
    pixelRatioCap: 1.5,
    shadowEnabled: true,
    shadowMapSize: 2048,
    shadowRadius: 2.8,
    shadowCamExtent: 52,
    antialias: true,
    sceneryStep: 2,
    sceneryCastShadow: true,
    carCastShadow: true,
    asphaltCastShadow: false,
    treeDetail: 7,
    fogNear: 110,
    fogFar: 520,
    anisotropy: 8,
    useLambertScenery: false,
    sceneryMargin: 2.8,
    maxBuildings: 96,
    maxTrees: 120,
    maxLamps: 64,
    aiUpdateHz: 48,
    tunnelPointLights: true,
    markingStep: 10,
    maxDecor: 64,
    hillsideClusters: 11,
    postFX: true,
    bloomStrength: 0.28,
    bloomRadius: 0.5,
    bloomThreshold: 0.78,
    vignetteDarkness: 0.42,
    asphaltClearcoat: true,
    reflectiveWater: true,
    animatedWater: true,
    envMapSize: 256,
    sunIntensity: 2.0,
    exposure: 1.15,
  },
};

export function profileFor(tier: GraphicsTier): QualityProfile {
  return PROFILES[tier] ?? PROFILES.medium;
}

export function applyRendererQuality(
  renderer: THREE.WebGLRenderer,
  tier: GraphicsTier,
): QualityProfile {
  const p = profileFor(tier);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.pixelRatioCap));
  renderer.shadowMap.enabled = p.shadowEnabled;
  renderer.shadowMap.type =
    tier === 'ultra' || tier === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.shadowMap.needsUpdate = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = p.exposure;
  return p;
}

export function applySunShadowQuality(
  sun: THREE.DirectionalLight,
  tier: GraphicsTier,
): void {
  const p = profileFor(tier);
  sun.castShadow = p.shadowEnabled;
  if (p.shadowEnabled) {
    sun.shadow.mapSize.set(p.shadowMapSize, p.shadowMapSize);
    sun.shadow.radius = p.shadowRadius;
    sun.shadow.blurSamples = tier === 'ultra' ? 8 : 4;
    const e = p.shadowCamExtent;
    sun.shadow.camera.left = -e;
    sun.shadow.camera.right = e;
    sun.shadow.camera.top = e;
    sun.shadow.camera.bottom = -e;
    sun.shadow.camera.far = Math.min(240, e * 4.5);
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
}

const STORAGE_KEY = 'forja-f1-graphics';
const SETTINGS_VERSION = 2;

function parseTier(v: unknown, settingsVersion: number): GraphicsTier {
  // v1 stored "ultra" as emergency-low — migrate to low
  if (settingsVersion < 2 && v === 'ultra') return 'low';
  if (v === 'ultra' || v === 'low' || v === 'high' || v === 'medium') return v;
  return 'medium';
}

export function loadGraphicsSettings(): GraphicsSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GRAPHICS };
    const parsed = JSON.parse(raw) as Partial<GraphicsSettings> & { v?: number };
    const ver = typeof parsed.v === 'number' ? parsed.v : 1;
    return {
      tier: parseTier(parsed.tier, ver),
      showFps: !!parsed.showFps,
      night: !!parsed.night,
      v: SETTINGS_VERSION,
    };
  } catch {
    return { ...DEFAULT_GRAPHICS };
  }
}

export function saveGraphicsSettings(s: GraphicsSettings): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...s, v: SETTINGS_VERSION }),
    );
  } catch {
    /* ignore quota */
  }
}
