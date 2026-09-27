import * as THREE from 'three';
import { InputManager } from '../input/InputManager';
import {
  VehiclePhysics,
  createVehicleState,
  PLAYER_VEHICLE_SPEC,
  type VehicleState,
} from '../physics/VehiclePhysics';
import { createWeather } from '../physics/Weather';
import { getTrackById } from '../tracks';
import { projectOnTrack, sampleTrack, applyTrackBarrierClamp, type TrackData } from '../tracks/Track';
import {
  createRenderer,
  createScene,
  applyWeatherVisuals,
  updateSunFollow,
  applyGraphicsTier,
} from '../render/SceneSetup';
import { createTrackMesh } from '../render/TrackMesh';
import { createCarMesh, setDrsVisual, updateCarWheels } from '../render/CarMesh';
import { PostFX } from '../render/PostFX';
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
import { createAIGrid, updateAICar, PLAYER_GRID_S, DEFAULT_OPPONENT_COUNT, type AICar } from '../ai/AIDriver';
import { resolveFieldCollisions } from '../physics/CarCollision';
import { PitStopUI } from '../ui/PitStop';
import {
  inPitApproach,
  pitApronAllowance,
  mandatoryPitDeadlineLap,
  modeHasMandatoryPit,
} from '../tracks/PitLane';
import {
  computeRacePosition,
  selfVerifyRaceStanding,
  type RacerStanding,
} from './RaceStanding';

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
  private pitStop: PitStopUI;
  private countdownEl: HTMLDivElement;
  /** True while player pit mini-game is open (car held, race clock runs). */
  private pitBusy = false;
  /** Seconds before another pit entry is allowed (prevents re-open loop). */
  private pitCooldown = 0;
  /** Player completed a full pit mini-game this race (mandatory rule). */
  private mandatoryPitDone = false;
  /** Lap by which mandatory pit must be completed (inclusive). */
  private mandatoryPitDeadline = 2;
  private mandatoryPitActive = false;

  private track: TrackData = getTrackById('monaco');
  private trackRoot: THREE.Group | null = null;
  private carMesh: THREE.Group | null = null;
  private physics: VehiclePhysics | null = null;
  private vehicle: VehicleState | null = null;
  private aiCars: AICar[] = [];

  private phase: Phase = 'menu';
  private settings: RaceSettings | null = null;
  private graphics: GraphicsSettings;
  private postFX: PostFX;
  private totalLaps = 3;
  private raceTimeMs = 0;
  private countdownT = 0;
  private lightsOn = 0;
  private lastS = 0;
  private crossedStart = false;
  private prevWallHit = 0;
  private lastErsActive = false;
  private aiLapArmed: boolean[] = [];
  /** Forward meters accumulated since last counted lap (player) */
  private progressSinceLap = 0;
  /** Distance traveled since last lap for each AI */
  private aiProgressSinceLap: number[] = [];
  /** Min fraction of track length required before a lap may count */
  private static readonly LAP_MIN_FRAC = 0.8;
  /** Disarm double-count: must leave S/F zone after a lap */
  private static readonly LAP_REARM_S = 40;

  private clock = new THREE.Clock();
  private running = false;
  private showRacingLine = false;
  private lastFrameDt = 0.016;

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
    this.postFX = new PostFX(this.renderer, this.scene, this.cameraCtrl.camera);
    this.postFX.applyTier(this.graphics.tier);

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
    this.pitStop = new PitStopUI(app);

    this.countdownEl = document.createElement('div');
    this.countdownEl.id = 'countdown';
    this.countdownEl.className = 'hidden';
    app.appendChild(this.countdownEl);

    window.addEventListener('resize', () => this.onResize());

    // Documented scenario: behind 2 AI on same lap → P3 (throws on regression)
    selfVerifyRaceStanding();
  }

  private applyGraphicsFromMenu(g: GraphicsSettings): void {
    this.graphics = { ...g };
    saveGraphicsSettings(this.graphics);
    applyGraphicsTier(this.renderer, this.scene, this.graphics.tier);
    this.postFX.applyTier(this.graphics.tier);
    applyWeatherVisuals(
      this.scene,
      createWeather(this.settings?.weather ?? 'dry'),
      this.graphics.night,
      this.graphics.tier,
    );
    const p = profileFor(this.graphics.tier);
    this.renderer.toneMappingExposure = this.graphics.night ? 0.9 : p.exposure;
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
    this.pitBusy = false;
    this.pitStop.close();
    this.mandatoryPitDone = false;
    this.mandatoryPitActive = false;
    this.hud.setMandatoryPit(false, 1, false, false);
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        // Shared car geos are reused across player + AI — do not dispose them here.
        if (m.geometry && !m.geometry.userData?.sharedGeo) {
          m.geometry.dispose();
        }
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
    this.postFX.applyTier(this.graphics.tier);
    const weather = createWeather(settings.weather);
    applyWeatherVisuals(this.scene, weather, this.graphics.night, this.graphics.tier);
    const qp = profileFor(this.graphics.tier);
    this.renderer.toneMappingExposure = this.graphics.night ? 0.9 : qp.exposure;

    this.track = getTrackById(settings.trackId || 'monaco');
    this.trackRoot = createTrackMesh(this.track, this.graphics.tier, this.graphics.night);
    this.scene.add(this.trackRoot);

    // Racing-line assist is HUD-only — no in-world spheres / gizmos (they read as debug junk).
    this.showRacingLine =
      settings.difficulty === 'rookie' || settings.mode === 'tutorial';

    const livery = this.resolveLivery(settings);
    const castShadow = qp.carCastShadow || qp.sceneryCastShadow;
    this.carMesh = createCarMesh(livery, { castShadow, racingNumber: 1 });
    this.scene.add(this.carMesh);

    // Pole (left): same S as AI grid reference — AI rows sit behind on the straight
    const start = sampleTrack(this.track.points, PLAYER_GRID_S);
    const poleLat = -0.72 * (start.width * 0.32);
    const px = start.x + Math.cos(start.yaw) * poleLat;
    const pz = start.z - Math.sin(start.yaw) * poleLat;
    this.vehicle = createVehicleState(px, pz, start.yaw, settings.tires);
    this.vehicle.y = start.y;
    this.vehicle.pitch = start.pitch;
    this.vehicle.distanceAlong = PLAYER_GRID_S;
    this.vehicle.lap = 1;
    this.vehicle.currentLapMs = 0;

    // Same PLAYER_VEHICLE_SPEC in Quick Race and Time Trial — AI presence never scales these.
    this.physics = new VehiclePhysics({
      difficulty: settings.difficulty,
      weather,
      ...PLAYER_VEHICLE_SPEC,
    });

    this.pitBusy = false;
    this.pitCooldown = 0;
    this.pitStop.close();
    this.mandatoryPitActive = modeHasMandatoryPit(settings.mode);
    this.mandatoryPitDone = false;
    this.mandatoryPitDeadline = mandatoryPitDeadlineLap(this.totalLaps);
    this.hud.setMandatoryPit(
      this.mandatoryPitActive,
      this.mandatoryPitDeadline,
      false,
      false,
    );

    // AI opponents (skip in time-trial solo focus? keep them for quick/tutorial)
    if (settings.mode !== 'timetrial') {
      const oppCount = settings.opponentCount ?? DEFAULT_OPPONENT_COUNT;
      this.aiCars = createAIGrid(
        this.track,
        settings.liveryId,
        weather,
        castShadow,
        oppCount,
      ); // castShadow = carCastShadow || sceneryCastShadow
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
    this.refreshMandatoryPitHud();

    this.raceTimeMs = 0;
    this.aiAccum = 0;
    this.lastS = PLAYER_GRID_S;
    this.crossedStart = false;
    this.progressSinceLap = 0;
    this.aiProgressSinceLap = this.aiCars.map(() => 0);
    this.phase = 'countdown';
    this.countdownT = 0;
    this.lightsOn = 0;
    this.showCountdownLights(0, false);
    this.cameraCtrl.setMode('chase');
    this.cameraCtrl.update(this.vehicle, 0.016);
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
    this.postFX.setSize(w, h);
  }

  private loop = (): void => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    this.lastFrameDt = dt;

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
      this.syncAIMeshes();
      this.cameraCtrl.update(this.vehicle, dt);
      this.hud.update(this.vehicle, this.lastErsActive, this.fpsValue, this.getPlayerPosition());
    } else if (this.phase === 'finished' && this.vehicle) {
      this.syncCarMesh();
      this.syncAIMeshes();
      this.cameraCtrl.update(this.vehicle, dt);
    }

    this.updateWater(dt);
    this.postFX.render();
  };

  /** Subtle harbor normal scroll on Ultra (and High if flagged). */
  private updateWater(dt: number): void {
    if (!this.trackRoot) return;
    const water = this.trackRoot.getObjectByName('harborWater') as THREE.Mesh | undefined;
    if (!water?.userData?.animatedWater) return;
    const mat = water.material as THREE.MeshStandardMaterial;
    const nrm = mat.normalMap;
    if (!nrm) return;
    nrm.offset.x = (nrm.offset.x + dt * 0.02) % 1;
    nrm.offset.y = (nrm.offset.y + dt * 0.012) % 1;
  }

  private syncAIMeshes(): void {
    for (const ai of this.aiCars) {
      const v = ai.vehicle;
      ai.mesh.position.set(v.x, v.y, v.z);
      ai.mesh.rotation.order = 'YXZ';
      ai.mesh.rotation.y = v.yaw;
      ai.mesh.rotation.z = 0;
      ai.mesh.rotation.x = v.pitch;
      updateCarWheels(ai.mesh, v.steerAngle, v.speed, this.lastFrameDt);
    }
  }

  private toStanding(v: VehicleState): RacerStanding {
    return {
      lap: v.lap,
      distanceAlong: v.distanceAlong,
      finished: v.finished,
      finishTimeMs: v.finished ? v.finishTimeMs : undefined,
    };
  }

  /**
   * Live / results position: lap primary, s-distance secondary.
   * Finished cars use finishTimeMs so Results matches true order
   * (crossing S/F must not jump a car ahead of those who finished earlier).
   */
  private getPlayerPosition(): number {
    if (!this.vehicle) return 1;
    if (this.aiCars.length === 0) return 1;
    return computeRacePosition(
      this.toStanding(this.vehicle),
      this.aiCars.map((ai) => this.toStanding(ai.vehicle)),
      this.track.length,
    );
  }

  /** Mark car finished exactly once; stamp race clock for order. */
  private markFinished(v: VehicleState): void {
    if (v.finished) return;
    v.finished = true;
    v.finishTimeMs = this.raceTimeMs;
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

    if (this.pitCooldown > 0) this.pitCooldown = Math.max(0, this.pitCooldown - dt);

    // Pit mini-game: hold car, keep race clock + AI; player repairs manually
    if (this.pitBusy && this.pitStop.isOpen) {
      this.vehicle.speed = 0;
      this.input.resetAnalogs();
      this.pitStop.update(dt);
      this.raceTimeMs += dt * 1000;
      this.vehicle.currentLapMs += dt * 1000;
      this.updateAIOnly(dt);
      return;
    }

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

    // Dedicated pit lane zone (right-side corridor wrapping S/F)
    const pit = inPitApproach(
      proj.s,
      this.track.length,
      proj.lateral,
      halfW,
      this.vehicle.speed,
    );
    this.hud.setPitHint(pit.near || pit.inBox, pit.inBox && this.pitCooldown <= 0);
    if (
      pit.inBox &&
      !this.pitBusy &&
      this.pitCooldown <= 0 &&
      this.settings.mode !== 'timetrial'
    ) {
      this.openPlayerPit();
      return;
    }

    // Apron only at pit entry/exit mouths or when already in the spur
    const pitApron = pitApronAllowance(
      proj.s,
      this.track.length,
      proj.lateral,
      halfW,
    );
    const clamped = applyTrackBarrierClamp(
      this.vehicle.x,
      this.vehicle.z,
      this.vehicle.yaw,
      proj.lateral,
      halfW + (proj.lateral > 0 ? pitApron : 0),
    );
    let wallHit = clamped.wallHit;
    if (wallHit > 0) {
      this.vehicle.x = clamped.x;
      this.vehicle.z = clamped.z;
      this.vehicle.yaw = clamped.yaw;
      // Soften only tiny scrapes at very low speed (still solid barrier)
      if (!(wallHit > this.prevWallHit + 0.05 || Math.abs(this.vehicle.speed) > 8)) {
        wallHit *= 0.45;
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
    this.progressSinceLap += this.forwardProgress(this.lastS, s, total);
    // Forward S/F cross: leave high-s zone into low-s while armed + enough distance.
    // Requires ~80% track traveled since last lap; reverse/oscillation near join ignored.
    if (
      this.crossedStart &&
      this.lastS > total * 0.9 &&
      s < total * 0.1 &&
      this.vehicle.speed > 5 &&
      this.progressSinceLap >= total * Game.LAP_MIN_FRAC
    ) {
      this.vehicle.lastLapMs = this.vehicle.currentLapMs;
      if (this.vehicle.bestLapMs <= 0 || this.vehicle.currentLapMs < this.vehicle.bestLapMs) {
        this.vehicle.bestLapMs = this.vehicle.currentLapMs;
      }
      this.vehicle.currentLapMs = 0;
      this.vehicle.lap += 1;
      this.progressSinceLap = 0;
      this.crossedStart = false; // re-arm only after leaving S/F zone
      this.refreshMandatoryPitHud();
      if (
        this.mandatoryPitActive &&
        !this.mandatoryPitDone &&
        this.vehicle.lap > this.mandatoryPitDeadline
      ) {
        this.disqualifyRace('Нет обязательного пит-стопа до круга ' + this.mandatoryPitDeadline);
        return;
      }
      if (this.vehicle.lap > this.totalLaps) {
        this.markFinished(this.vehicle);
        this.finishRace();
      }
    }
    if (s > Game.LAP_REARM_S) this.crossedStart = true;
    this.lastS = s;
    this.vehicle.distanceAlong = s;
    this.raceTimeMs += dt * 1000;

    // AI + collisions (shared path with pit-hold mode)
    this.updateAIOnly(dt);

    if (this.carMesh) setDrsVisual(this.carMesh, this.vehicle.drsOpen);
  }

  /** Forward-only along-track meters (ignores reverse / S/F oscillation). */
  private forwardProgress(prevS: number, nextS: number, total: number): number {
    if (total <= 1e-3) return 0;
    let ds = nextS - prevS;
    // Forward wrap across S/F (end → start)
    if (ds < -total * 0.5) ds += total;
    // Backward wrap or reverse motion — do not credit
    if (ds > total * 0.5) ds -= total;
    return ds > 0 ? ds : 0;
  }


  private openPlayerPit(): void {
    if (!this.vehicle || this.pitBusy) return;
    this.pitBusy = true;
    this.vehicle.speed = 0;
    this.hud.setPitHint(true, true);
    this.pitStop.open((result) => {
      if (!this.vehicle) return;
      if (result.tires) {
        this.vehicle.tires.wear = 0;
        this.vehicle.tires.temperature = 0.65;
      }
      if (result.damage) {
        this.vehicle.damage = 0;
      }
      if (result.fuel) {
        this.vehicle.fuel = Math.min(1, this.vehicle.fuel + 0.55);
      }
      // Full mini-game completion satisfies mandatory pit
      if (result.tires && result.damage && result.fuel) {
        this.mandatoryPitDone = true;
        this.refreshMandatoryPitHud();
      }
      this.pitBusy = false;
      this.pitCooldown = 8; // leave the box before re-entry
      this.hud.setPitHint(false);
    });
  }

  private refreshMandatoryPitHud(): void {
    if (!this.vehicle) return;
    const onDeadlineLap =
      this.mandatoryPitActive &&
      !this.mandatoryPitDone &&
      this.vehicle.lap === this.mandatoryPitDeadline;
    this.hud.setMandatoryPit(
      this.mandatoryPitActive && !this.mandatoryPitDone,
      this.mandatoryPitDeadline,
      this.mandatoryPitDone,
      onDeadlineLap,
    );
  }

  private disqualifyRace(reason: string): void {
    if (!this.vehicle) return;
    this.phase = 'finished';
    this.markFinished(this.vehicle);
    this.pitBusy = false;
    this.pitStop.close();
    this.hud.hide();
    this.results.show({
      totalTimeMs: this.raceTimeMs,
      bestLapMs: this.vehicle.bestLapMs,
      lapsCompleted: Math.max(0, this.vehicle.lap - 1),
      damage: this.vehicle.damage,
      tireWear: this.vehicle.tires.wear,
      position: this.getPlayerPosition(),
      fieldSize: 1 + this.aiCars.length,
      disqualified: true,
      dqReason: reason,
    });
  }

  /** AI + collisions only (used while player is in pit UI). */
  private updateAIOnly(dt: number): void {
    if (!this.vehicle) return;
    const total = this.track.length;
    const aiHz = profileFor(this.graphics.tier).aiUpdateHz;
    const aiInterval = 1 / Math.max(10, aiHz);
    this.aiAccum += dt;
    if (this.aiAccum >= aiInterval) {
      const aiDt = Math.min(0.08, this.aiAccum);
      this.aiAccum = 0;
      const raceAge = this.raceTimeMs / 1000;
      const playerS = this.vehicle.distanceAlong;
      for (let i = 0; i < this.aiCars.length; i++) {
        const ai = this.aiCars[i];
        ai.raceAgeSec = raceAge;
        // Distant AI: cheaper half-rate skip (mesh still synced each frame)
        if (this.aiCars.length >= 12) {
          let ds = Math.abs(ai.vehicle.distanceAlong - playerS);
          if (ds > total * 0.5) ds = total - ds;
          if (ds > 140 && i % 2 === (Math.floor(raceAge * 2) % 2)) {
            continue;
          }
        }
        const prevS = ai.vehicle.distanceAlong;
        updateAICar(ai, this.track, aiDt);
        const ns = ai.vehicle.distanceAlong;
        this.aiProgressSinceLap[i] =
          (this.aiProgressSinceLap[i] ?? 0) + this.forwardProgress(prevS, ns, total);
        if (ns > Game.LAP_REARM_S) this.aiLapArmed[i] = true;
        if (
          this.aiLapArmed[i] &&
          prevS > total * 0.9 &&
          ns < total * 0.1 &&
          Math.abs(ai.vehicle.speed) > 5 &&
          this.aiProgressSinceLap[i] >= total * Game.LAP_MIN_FRAC
        ) {
          ai.vehicle.lastLapMs = ai.vehicle.currentLapMs;
          if (ai.vehicle.bestLapMs <= 0 || ai.vehicle.currentLapMs < ai.vehicle.bestLapMs) {
            ai.vehicle.bestLapMs = ai.vehicle.currentLapMs;
          }
          ai.vehicle.currentLapMs = 0;
          ai.vehicle.lap += 1;
          this.aiProgressSinceLap[i] = 0;
          this.aiLapArmed[i] = false;
          if (ai.vehicle.lap > this.totalLaps) {
            this.markFinished(ai.vehicle);
          }
        }
      }
    }
    resolveFieldCollisions(
      this.vehicle,
      this.aiCars.map((ai) => ai.vehicle),
    );
  }

  private finishRace(): void {
    if (!this.vehicle) return;
    this.phase = 'finished';
    this.markFinished(this.vehicle);
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
    // Chassis follows path yaw/pitch only — no body lean/twist from steer input.
    // Front wheels yaw via updateCarWheels(steerAngle).
    this.carMesh.rotation.y = this.vehicle.yaw;
    this.carMesh.rotation.z = 0;
    this.carMesh.rotation.x = this.vehicle.pitch;
    updateCarWheels(this.carMesh, this.vehicle.steerAngle, this.vehicle.speed, this.lastFrameDt);
    updateSunFollow(this.scene, this.vehicle.x, this.vehicle.z);
  }
}
