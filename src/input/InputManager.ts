export interface InputState {
  throttle: number; // 0..1 analog
  brake: number; // 0..1 main brake
  engineBrake: number; // 0..1 light (S)
  steer: number; // -1..1
  ers: boolean;
  drs: boolean;
  reverse: boolean;
  cameraToggle: boolean;
}

/** Shared analog ramps — identical in Quick Race and Time Trial. */
export const INPUT_SMOOTHING = {
  throttleRamp: 3.2,
  steerRamp: 4.0,
  brakeRamp: 5.5,
  engineBrakeRamp: 4.0,
} as const;

const KEYS: Record<string, boolean> = {};

export class InputManager {
  private throttle = 0;
  private brake = 0;
  private engineBrake = 0;
  private steer = 0;
  private cameraPressed = false;
  private cameraEdge = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      KEYS[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      KEYS[e.code] = false;
    });
    window.addEventListener('blur', () => {
      for (const k of Object.keys(KEYS)) KEYS[k] = false;
    });
  }

  update(dt: number): InputState {
    // Shared INPUT_SMOOTHING — same throttle/steer feel with or without AI on track
    const { throttleRamp, steerRamp, brakeRamp, engineBrakeRamp } = INPUT_SMOOTHING;

    const wantGas = KEYS['KeyW'] || KEYS['ArrowUp'];
    const wantBrake = KEYS['ShiftLeft'] || KEYS['ShiftRight'];
    const wantEngineBrake = KEYS['KeyS'] || KEYS['ArrowDown'];
    const wantLeft = KEYS['KeyA'] || KEYS['ArrowLeft'];
    const wantRight = KEYS['KeyD'] || KEYS['ArrowRight'];

    this.throttle = lerpToward(this.throttle, wantGas ? 1 : 0, 1 - Math.exp(-throttleRamp * dt));
    this.brake = lerpToward(this.brake, wantBrake ? 1 : 0, 1 - Math.exp(-brakeRamp * dt));
    this.engineBrake = lerpToward(this.engineBrake, wantEngineBrake ? 1 : 0, 1 - Math.exp(-engineBrakeRamp * dt));

    // Screen/camera: A/← left, D/→ right (sign flipped vs +yaw so chase cam matches).
    let steerTarget = 0;
    if (wantLeft) steerTarget += 1;
    if (wantRight) steerTarget -= 1;
    this.steer = lerpToward(this.steer, steerTarget, 1 - Math.exp(-steerRamp * dt));

    const camDown = KEYS['KeyC'];
    this.cameraEdge = camDown && !this.cameraPressed;
    this.cameraPressed = camDown;

    return {
      throttle: this.throttle,
      brake: this.brake,
      engineBrake: this.engineBrake,
      steer: this.steer,
      ers: KEYS['ControlLeft'] || KEYS['ControlRight'],
      drs: KEYS['Space'],
      reverse: KEYS['KeyR'],
      cameraToggle: this.cameraEdge,
    };
  }

  resetAnalogs(): void {
    this.throttle = 0;
    this.brake = 0;
    this.engineBrake = 0;
    this.steer = 0;
  }
}

/** Exponential smoothing toward target (factor in 0..1). */
function lerpToward(current: number, target: number, factor: number): number {
  const f = Math.max(0, Math.min(1, factor));
  return current + (target - current) * f;
}
