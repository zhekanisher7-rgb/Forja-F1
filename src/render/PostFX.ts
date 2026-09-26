import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { GraphicsTier } from './GraphicsQuality';
import { profileFor } from './GraphicsQuality';

/** Mild vignette — High/Ultra only, negligible cost */
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    offset: { value: 1.05 },
    darkness: { value: 0.55 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - 0.5) * vec2(offset);
      float vig = smoothstep(0.85, 0.25, dot(uv, uv));
      vig = mix(1.0 - darkness, 1.0, vig);
      gl_FragColor = vec4(texel.rgb * vig, texel.a);
    }
  `,
};

export class PostFX {
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private vignette: ShaderPass | null = null;
  private enabled = false;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
  }

  /** Rebuild or tear down composer for the active tier. */
  applyTier(tier: GraphicsTier): void {
    const p = profileFor(tier);
    if (!p.postFX) {
      this.disposeComposer();
      this.enabled = false;
      return;
    }
    this.ensureComposer();
    if (this.bloom) {
      this.bloom.strength = p.bloomStrength;
      this.bloom.radius = p.bloomRadius;
      this.bloom.threshold = p.bloomThreshold;
    }
    if (this.vignette) {
      this.vignette.uniforms.darkness.value = p.vignetteDarkness;
      this.vignette.enabled = p.vignetteDarkness > 0.01;
    }
    this.enabled = true;
    this.setSize(window.innerWidth, window.innerHeight);
  }

  setSize(w: number, h: number): void {
    if (!this.composer) return;
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    if (this.bloom) this.bloom.setSize(w, h);
  }

  render(): void {
    if (this.enabled && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private ensureComposer(): void {
    if (this.composer) return;
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));

    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.22,
      0.45,
      0.82,
    );
    composer.addPass(bloom);
    this.bloom = bloom;

    const vig = new ShaderPass(VignetteShader);
    composer.addPass(vig);
    this.vignette = vig;

    // Correct ACES / output color space after post
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  private disposeComposer(): void {
    if (!this.composer) return;
    this.composer.dispose();
    this.composer = null;
    this.bloom = null;
    this.vignette = null;
  }

  dispose(): void {
    this.disposeComposer();
  }
}
