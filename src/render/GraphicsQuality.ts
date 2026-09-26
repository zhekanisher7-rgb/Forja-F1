import * as THREE from 'three';

export type GraphicsTier = 'ultra' | 'low' | 'medium' | 'high';

export interface GraphicsSettings {
  tier: GraphicsTier;
  showFps: boolean;
  /** Night lighting — darker ambient, cooler sky, brighter lamp emissive */
  night: boolean;
}

export const DEFAULT_GRAPHICS: GraphicsSettings = {
  tier: 'medium',
  showFps: false,
  night: false,
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
}

const PROFILES: Record<GraphicsTier, QualityProfile> = {
  /** Emergency preset for weak integrated GPUs */
  ultra: {
    pixelRatioCap: 1,
    shadowEnabled: false,
    shadowMapSize: 256,
    shadowRadius: 1,
    shadowCamExtent: 40,
    antialias: false,
    sceneryStep: 5,
    sceneryCastShadow: false,
    asphaltCastShadow: false,
    treeDetail: 4,
    fogNear: 40,
    fogFar: 220,
    anisotropy: 1,
    useLambertScenery: true,
    sceneryMargin: 4.5,
    maxBuildings: 18,
    maxTrees: 28,
    maxLamps: 16,
    aiUpdateHz: 20,
    tunnelPointLights: false,
    markingStep: 28,
  },
  low: {
    pixelRatioCap: 1,
    shadowEnabled: false,
    shadowMapSize: 512,
    shadowRadius: 1,
    shadowCamExtent: 50,
    antialias: false,
    sceneryStep: 4,
    sceneryCastShadow: false,
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
  },
  medium: {
    pixelRatioCap: 1,
    shadowEnabled: false,
    shadowMapSize: 1024,
    shadowRadius: 1.5,
    shadowCamExtent: 55,
    antialias: true,
    sceneryStep: 3,
    sceneryCastShadow: false,
    asphaltCastShadow: false,
    treeDetail: 5,
    fogNear: 70,
    fogFar: 360,
    anisotropy: 2,
    useLambertScenery: true,
    sceneryMargin: 3.5,
    maxBuildings: 40,
    maxTrees: 55,
    maxLamps: 30,
    aiUpdateHz: 30,
    tunnelPointLights: false,
    markingStep: 16,
  },
  high: {
    pixelRatioCap: 1.25,
    shadowEnabled: true,
    shadowMapSize: 1024,
    shadowRadius: 2,
    shadowCamExtent: 48,
    antialias: true,
    sceneryStep: 2,
    sceneryCastShadow: true,
    asphaltCastShadow: false,
    treeDetail: 6,
    fogNear: 90,
    fogFar: 450,
    anisotropy: 4,
    useLambertScenery: false,
    sceneryMargin: 3.0,
    maxBuildings: 55,
    maxTrees: 70,
    maxLamps: 40,
    aiUpdateHz: 40,
    tunnelPointLights: false,
    markingStep: 14,
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
  renderer.shadowMap.type = tier === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.shadowMap.needsUpdate = true;
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
    const e = p.shadowCamExtent;
    sun.shadow.camera.left = -e;
    sun.shadow.camera.right = e;
    sun.shadow.camera.top = e;
    sun.shadow.camera.bottom = -e;
    sun.shadow.camera.far = Math.min(220, e * 4.5);
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
}

const STORAGE_KEY = 'forja-f1-graphics';

function parseTier(v: unknown): GraphicsTier {
  if (v === 'ultra' || v === 'low' || v === 'high' || v === 'medium') return v;
  return 'medium';
}

export function loadGraphicsSettings(): GraphicsSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GRAPHICS };
    const parsed = JSON.parse(raw) as Partial<GraphicsSettings>;
    return {
      tier: parseTier(parsed.tier),
      showFps: !!parsed.showFps,
      night: !!parsed.night,
    };
  } catch {
    return { ...DEFAULT_GRAPHICS };
  }
}

export function saveGraphicsSettings(s: GraphicsSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota */
  }
}
