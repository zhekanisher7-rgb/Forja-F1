import * as THREE from 'three';
import { InputManager } from '../input/InputManager';
import {
  VehiclePhysics,
  createVehicleState,
  type VehicleState,
} from '../physics/VehiclePhysics';
import { createWeather } from '../physics/Weather';
import { createMonacoTrack } from '../tracks/Monaco';
import { projectOnTrack, sampleTrack, type TrackData } from '../tracks/Track';
import {
  createRenderer,
  createScene,
  applyWeatherVisuals,
  updateSunFollow,
  applyGraphicsTier,
} from '../render/SceneSetup';
import { createTrackMesh } from '../render/TrackMesh';
import { createCarMesh, setDrsVisual } from '../render/CarMesh';
import { CameraController } from '../render/CameraController';
import {
  loadGraphicsSettings,
  saveGraphicsSettings,
  profileFor,
  type GraphicsSettings,
} from '../render/GraphicsQuality';
import { MainMenu, type RaceSettings } from '../ui/MainMenu';
import { HUD } from '../ui/HUD';
import { TutorialOverlay } from '../ui/Tutorial';
import { ResultsScreen } from '../ui/Results';
import { getLivery, type Livery } from '../vehicles/Liveries';
import { createAIGrid, updateAICar, type AICar } from '../ai/AIDriver';

type Phase = 'menu' | 'countdown' | 'racing' | 'finished';

export class Game {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private cameraCtrl: CameraController;
  private input = new InputManager();
  private menu: MainMenu;
  private hud: HUD;
  private tutorial: TutorialOverlay;
  private results: ResultsScreen;
  private countdownEl: HTMLDivElement;

  private track: TrackData = createMonacoTrack();
  private trackRoot: THREE.Group | null = null;
  private carMesh: THREE.Group | null = null;
  private physics: VehiclePhysics | null = null;
  private vehicle: VehicleState | null = null;
  private aiCars: AICar[] = [];

  private phase: Phase = 'menu';
  private settings: RaceSettings | null = null;
  private graphics: GraphicsSettings;
  private totalLaps = 3;
  private raceTimeMs = 0;
  private countdownT = 0;
  private lightsOn = 0;
  private lastS = 0;
  private crossedStart = false;
  private prevWallHit = 0;
  private lastErsActive = false;
  private aiLapArmed: boolean[] = [];

  private clock = new THREE.Clock();
  private running = false;
  private showRacingLine = false;

  // FPS counter (no per-frame allocs)
  private fpsFrames = 0;
  private fpsAccum = 0;
  private fpsValue = 0;

  /** AI physics throttle accumulator (seconds) */
  private aiAccum = 0;

  constructor(app: HTMLElement) {
    this.graphics = loadGraphicsSettings();

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'game-canvas';
    app.appendChild(this.canvas);

    this.renderer = createRenderer(this.canvas, this.graphics.tier);
    this.scene = createScene(createWeather('dry'), this.graphics.tier, this.graphics.night);
    this.cameraCtrl = new CameraController(window.innerWidth / window.innerHeight);

    this.menu = new MainMenu(app, {
      onStart: (s) => this.startRace(s),
      onShowTutorial: () => {
        this.tutorial.show();
      },
      onCredits: () => {},
      onGraphicsChange: (g) => this.applyGraphicsFromMenu(g),
    }, this.graphics);

    this.tutorial = new TutorialOverlay(app, () => {
      const s = this.menu.getSettings();
      s.mode = 'tutorial';
      this.startRace(s);
    });

    this.hud = new HUD(app);
    this.results = new ResultsScreen(app, () => this.returnToMenu());

    this.countdownEl = document.createElement('div');
    this.countdownEl.id = 'countdown';
    this.countdownEl.className = 'hidden';
    app.appendChild(this.countdownEl);

    window.addEventListener('resize', () => this.onResize());
  }

  private applyGraphicsFromMenu(g: GraphicsSettings): void {
    this.graphics = { ...g };
    saveGraphicsSettings(this.graphics);
    applyGraphicsTier(this.renderer, this.scene, this.graphics.tier);
    applyWeatherVisuals(
      this.scene,
      createWeather(this.settings?.weather ?? 'dry'),
      this.graphics.night,
      this.graphics.tier,
    );
    this.hud.setShowFps(this.graphics.showFps);
  }

  start(): void {
    this.running = true;
    this.menu.show();
    this.hud.setShowFps(this.graphics.showFps);
    this.clock.start();
    this.loop();
  }

  private returnToMenu(): void {
    this.phase = 'menu';
    this.hud.hide();
    this.countdownEl.classList.add('hidden');
    this.clearWorld();
    this.menu.show();
    this.input.resetAnalogs();
  }

  private clearWorld(): void {
    if (this.trackRoot) {
      this.scene.remove(this.trackRoot);
      this.disposeObject(this.trackRoot);
      this.trackRoot = null;
    }
    if (this.carMesh) {
      this.scene.remove(this.carMesh);
      this.disposeObject(this.carMesh);
      this.carMesh = null;
    }
    for (const ai of this.aiCars) {
      this.scene.remove(ai.mesh);
      this.disposeObject(ai.mesh);
    }
    this.aiCars = [];
    this.vehicle = null;
    this.physics = null;
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry?.dispose();
        const mat = m.material;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      }
      const l = o as THREE.Light;
      if (l.isLight && (l as THREE.PointLight).isPointLight) {
        /* point lights have no geo */
      }
    });
  }

  private resolveLivery(s: RaceSettings): Livery {
    const base = getLivery(s.liveryId);
    if (s.liveryId === 'custom') {
      return {
        ...base,
        primary: s.customPrimary,
        secondary: s.customSecondary,
        accent: s.customAccent,
      };
    }
    return base;
  }

  private startRace(settings: RaceSettings): void {
    this.settings = settings;
    this.graphics = this.menu.getGraphics();
    saveGraphicsSettings(this.graphics);
    this.totalLaps = settings.laps;
    this.menu.hide();
    this.clearWorld();

    applyGraphicsTier(this.renderer, this.scene, this.graphics.tier);
    const weather = createWeather(settings.weather);
    applyWeatherVisuals(this.scene, weather, this.graphics.night, this.graphics.tier);
    this.renderer.toneMappingExposure = this.graphics.night ? 0.95 : 1.22;

    this.track = createMonacoTrack();
    this.trackRoot = createTrackMesh(this.track, this.graphics.tier, this.graphics.night);
    this.scene.add(this.trackRoot);

    this.showRacingLine =
      settings.difficulty === 'rookie' || settings.mode === 'tutorial';
    if (this.showRacingLine) {
      this.addRacingLineMarkers();
    }

    const livery = this.resolveLivery(settings);
    const castShadow = profileFor(this.graphics.tier).sceneryCastShadow;
    this.carMesh = createCarMesh(livery, { castShadow: castShadow });
    this.scene.add(this.carMesh);

    const start = sampleTrack(this.track.points, 5);
    this.vehicle = createVehicleState(start.x, start.z, start.yaw, settings.tires);
    this.vehicle.y = start.y;
    this.vehicle.pitch = start.pitch;
    this.vehicle.distanceAlong = 5;
    this.vehicle.lap = 1;
    this.vehicle.currentLapMs = 0;

    this.physics = new VehiclePhysics({
      difficulty: settings.difficulty,
      weather,
      mass: 800,
      maxPower: 750,
      dragCd: 0.9,
      downforceCl: 3.2,
      wheelbase: 3.6,
    });

    // AI opponents (skip in time-trial solo focus? keep them for quick/tutorial)
    if (settings.mode !== 'timetrial') {
      this.aiCars = createAIGrid(
        this.track,
        settings.liveryId,
        weather,
        castShadow,
      );
      this.aiLapArmed = this.aiCars.map(() => false);
      for (const ai of this.aiCars) {
        this.scene.add(ai.mesh);
      }
    } else {
      this.aiCars = [];
      this.aiLapArmed = [];
    }

    const fieldSize = 1 + this.aiCars.length;
    this.hud.setTrack(
      this.track,
      this.totalLaps,
      this.physics.assists.racingLine || this.showRacingLine,
      fieldSize,
    );
    this.hud.setShowFps(this.graphics.showFps);
    this.hud.show();

    this.raceTimeMs = 0;
    this.aiAccum = 0;
    this.lastS = 5;
    this.crossedStart = false;
    this.phase = 'countdown';
    this.countdownT = 0;
    this.lightsOn = 0;
    this.showCountdownLights(0, false);
    this.cameraCtrl.setMode('chase');
    this.cameraCtrl.update(this.vehicle, 0.016);
  }

  private addRacingLineMarkers(): void {
    if (!this.trackRoot) return;
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00d2be,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const geo = new THREE.SphereGeometry(0.32, 6, 6);
    const group = new THREE.Group();
    group.name = 'racingLine';
    for (let s = 0; s < this.track.length; s += 14) {
      const p = sampleTrack(this.track.points, s);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p.x, p.y + 0.15, p.z);
      group.add(m);
    }
    this.trackRoot.add(group);
  }

  private showCountdownLights(on: number, go: boolean): void {
    this.countdownEl.classList.remove('hidden');
    const lights = [0, 1, 2, 3, 4]
      .map((i) => {
        let cls = 'light';
        if (go) cls += ' go';
        else if (i < on) cls += ' on';
        return `<div class="${cls}"></div>`;
      })
      .join('');
    let text = '';
    if (go) text = 'СТАРТ!';
    else if (on === 0) text = 'ГОТОВНОСТЬ';
    else if (on < 5) text = '';
    else text = '';
    this.countdownEl.innerHTML = `<div class="lights">${lights}</div>${text ? `<div class="countdown-text">${text}</div>` : ''}`;
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.cameraCtrl.resize(w / h);
    applyGraphicsTier(this.renderer, this.scene, this.graphics.tier);
  }

  private loop = (): void => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());

    this.fpsFrames++;
    this.fpsAccum += dt;
    if (this.fpsAccum >= 0.5) {
      this.fpsValue = this.fpsFrames / this.fpsAccum;
      this.fpsFrames = 0;
      this.fpsAccum = 0;
    }

    if (this.phase === 'countdown' && this.vehicle && this.physics) {
      this.updateCountdown(dt);
      this.syncCarMesh();
      this.syncAIMeshes();
      this.cameraCtrl.update(this.vehicle, dt);
      this.hud.update(this.vehicle, false, this.fpsValue, this.getPlayerPosition());
    } else if (this.phase === 'racing' && this.vehicle && this.physics) {
      this.updateRacing(dt);
      this.syncCarMesh();
      this.cameraCtrl.update(this.vehicle, dt);
      this.hud.update(this.vehicle, this.lastErsActive, this.fpsValue, this.getPlayerPosition());
    } else if (this.phase === 'finished' && this.vehicle) {
      this.syncCarMesh();
      this.syncAIMeshes();
      this.cameraCtrl.update(this.vehicle, dt);
    }

    this.renderer.render(this.scene, this.cameraCtrl.camera);
  };

  private syncAIMeshes(): void {
    for (const ai of this.aiCars) {
      const v = ai.vehicle;
      ai.mesh.position.set(v.x, v.y, v.z);
      ai.mesh.rotation.order = 'YXZ';
      ai.mesh.rotation.y = v.yaw;
      ai.mesh.rotation.z = -v.angularVel * 0.12;
      ai.mesh.rotation.x = v.pitch;
    }
  }

  private getPlayerPosition(): number {
    if (!this.vehicle) return 1;
    if (this.aiCars.length === 0) return 1;
    let pos = 1;
    const pProg = this.raceProgress(this.vehicle);
    for (const ai of this.aiCars) {
      if (this.raceProgress(ai.vehicle) > pProg) pos++;
    }
    return pos;
  }

  private raceProgress(v: VehicleState): number {
    return (v.lap - 1) * this.track.length + v.distanceAlong;
  }

  private updateCountdown(dt: number): void {
    const input = this.input.update(dt);
    if (input.cameraToggle) this.cameraCtrl.toggle();

    this.countdownT += dt;
    // F1 style: 1s ready, then lights 1..5 (~1s each), hold, then extinguish = go
    if (this.countdownT < 1.0) {
      if (this.lightsOn !== 0) {
        this.lightsOn = 0;
        this.showCountdownLights(0, false);
      }
    } else if (this.countdownT < 6.0) {
      const n = Math.min(5, Math.floor(this.countdownT));
      if (n !== this.lightsOn) {
        this.lightsOn = n;
        this.showCountdownLights(n, false);
      }
    } else if (this.countdownT < 6.55) {
      // random-ish hold with all five lit
      if (this.lightsOn !== 5) {
        this.lightsOn = 5;
        this.showCountdownLights(5, false);
      }
    } else if (this.countdownT < 6.95) {
      this.showCountdownLights(5, true);
    } else {
      this.countdownEl.classList.add('hidden');
      this.phase = 'racing';
      if (this.vehicle) this.vehicle.currentLapMs = 0;
      for (const ai of this.aiCars) ai.vehicle.currentLapMs = 0;
    }
  }

  private updateRacing(dt: number): void {
    if (!this.vehicle || !this.physics || !this.settings) return;
    const input = this.input.update(dt);
    if (input.cameraToggle) this.cameraCtrl.toggle();

    const proj = projectOnTrack(
      this.track.points,
      this.vehicle.x,
      this.vehicle.z,
      this.vehicle.distanceAlong,
      this.vehicle.y,
    );
    const halfW = proj.width / 2;
    let wallHit = 0;
    const limit = halfW + 0.8;
    if (Math.abs(proj.lateral) > limit) {
      wallHit = Math.abs(proj.lateral) - limit;
      const push = (Math.abs(proj.lateral) - halfW) * 0.85;
      const side = Math.sign(proj.lateral);
      this.vehicle.x -= Math.cos(proj.yaw) * side * push * 0.5;
      this.vehicle.z += Math.sin(proj.yaw) * side * push * 0.5;
      this.vehicle.yaw += -side * 0.02;
      if (!(wallHit > this.prevWallHit + 0.05 || Math.abs(this.vehicle.speed) > 10)) {
        wallHit *= 0.3;
      }
    }
    this.prevWallHit = wallHit;

    if (Math.abs(proj.lateral) > halfW * 0.95) {
      this.vehicle.speed *= 1 - 0.8 * dt;
    }

    this.vehicle.inDrsZone = this.track.drsZones.some((z) => {
      if (z.startS <= z.endS) return proj.s >= z.startS && proj.s <= z.endS;
      return proj.s >= z.startS || proj.s <= z.endS;
    });

    this.lastErsActive = input.ers && this.vehicle.ers > 0.01;
    this.physics.step(this.vehicle, input, dt, wallHit);

    const elev = projectOnTrack(
      this.track.points,
      this.vehicle.x,
      this.vehicle.z,
      this.vehicle.distanceAlong,
      this.vehicle.y,
    );
    // Refuse sudden deck teleports (>~2 m) — projectOnTrack already penalizes, but
    // clamp here too so a bad sample cannot yank the car onto the overpass.
    const dy = elev.y - this.vehicle.y;
    if (Math.abs(dy) > 2.0 && Math.abs(elev.pitch) < 0.05) {
      // stay on current height; keep s/lateral from elev for lap logic
      this.vehicle.pitch = this.vehicle.pitch * 0.85;
    } else {
      this.vehicle.y = elev.y;
      this.vehicle.pitch = elev.pitch;
    }

    const s = elev.s;
    const total = this.track.length;
    if (
      this.crossedStart &&
      this.lastS > total * 0.85 &&
      s < total * 0.15 &&
      this.vehicle.speed > 5
    ) {
      this.vehicle.lastLapMs = this.vehicle.currentLapMs;
      if (this.vehicle.bestLapMs <= 0 || this.vehicle.currentLapMs < this.vehicle.bestLapMs) {
        this.vehicle.bestLapMs = this.vehicle.currentLapMs;
      }
      this.vehicle.currentLapMs = 0;
      this.vehicle.lap += 1;
      if (this.vehicle.lap > this.totalLaps) {
        this.finishRace();
      }
    }
    if (s > 20) this.crossedStart = true;
    this.lastS = s;
    this.vehicle.distanceAlong = s;
    this.raceTimeMs += dt * 1000;

    // AI update — throttled to profile Hz (mesh still advances via larger step)
    const aiHz = profileFor(this.graphics.tier).aiUpdateHz;
    const aiInterval = 1 / Math.max(10, aiHz);
    this.aiAccum += dt;
    if (this.aiAccum >= aiInterval) {
      const aiDt = Math.min(0.08, this.aiAccum);
      this.aiAccum = 0;
      for (let i = 0; i < this.aiCars.length; i++) {
        const ai = this.aiCars[i];
        const prevS = ai.vehicle.distanceAlong;
        updateAICar(ai, this.track, aiDt);
        const ns = ai.vehicle.distanceAlong;
        if (ns > 30) this.aiLapArmed[i] = true;
        if (
          this.aiLapArmed[i] &&
          prevS > total * 0.85 &&
          ns < total * 0.15 &&
          Math.abs(ai.vehicle.speed) > 5
        ) {
          ai.vehicle.lastLapMs = ai.vehicle.currentLapMs;
          if (ai.vehicle.bestLapMs <= 0 || ai.vehicle.currentLapMs < ai.vehicle.bestLapMs) {
            ai.vehicle.bestLapMs = ai.vehicle.currentLapMs;
          }
          ai.vehicle.currentLapMs = 0;
          ai.vehicle.lap += 1;
        }
      }
    }

    if (this.carMesh) setDrsVisual(this.carMesh, this.vehicle.drsOpen);
  }

  private finishRace(): void {
    if (!this.vehicle) return;
    this.phase = 'finished';
    this.vehicle.finished = true;
    this.hud.hide();
    this.results.show({
      totalTimeMs: this.raceTimeMs,
      bestLapMs: this.vehicle.bestLapMs,
      lapsCompleted: this.totalLaps,
      damage: this.vehicle.damage,
      tireWear: this.vehicle.tires.wear,
      position: this.getPlayerPosition(),
      fieldSize: 1 + this.aiCars.length,
    });
  }

  private syncCarMesh(): void {
    if (!this.carMesh || !this.vehicle) return;
    this.carMesh.position.set(this.vehicle.x, this.vehicle.y, this.vehicle.z);
    this.carMesh.rotation.order = 'YXZ';
    this.carMesh.rotation.y = this.vehicle.yaw;
    this.carMesh.rotation.z = -this.vehicle.angularVel * 0.15;
    this.carMesh.rotation.x = this.vehicle.pitch - this.vehicle.speed * 0.002;
    updateSunFollow(this.scene, this.vehicle.x, this.vehicle.z);
  }
}
