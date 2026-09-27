/**
 * Player pit-stop mini-game — sequential repairs with timing bars.
 * Race clock keeps running while the panel is open.
 */

export type PitSystem = 'tires' | 'damage' | 'fuel';

export interface PitRepairResult {
  tires: boolean;
  damage: boolean;
  fuel: boolean;
}

type StepDef = {
  id: PitSystem;
  label: string;
  key: string; // KeyboardEvent.code
  keyLabel: string;
  /** Seconds to hold / window for green zone */
  duration: number;
};

const STEPS: StepDef[] = [
  { id: 'tires', label: 'Шины', key: 'Digit1', keyLabel: '1', duration: 1.6 },
  { id: 'damage', label: 'Крыло / урон', key: 'Digit2', keyLabel: '2', duration: 1.8 },
  { id: 'fuel', label: 'Топливо', key: 'Digit3', keyLabel: '3', duration: 1.5 },
];

export class PitStopUI {
  el: HTMLDivElement;
  private active = false;
  private stepIndex = 0;
  private gauge = 0; // 0..1 oscillating or filling
  private gaugeDir = 1;
  private waitingConfirm = false;
  private done: Set<PitSystem> = new Set();
  private onComplete: ((r: PitRepairResult) => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private clickBound = false;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'pit-stop';
    this.el.className = 'hidden';
    parent.appendChild(this.el);
  }

  get isOpen(): boolean {
    return this.active;
  }

  open(onComplete: (r: PitRepairResult) => void): void {
    if (this.active) return;
    this.active = true;
    this.stepIndex = 0;
    this.gauge = 0.15;
    this.gaugeDir = 1;
    this.waitingConfirm = true;
    this.done = new Set();
    this.onComplete = onComplete;
    this.el.classList.remove('hidden');
    this.render();
    this.keyHandler = (e: KeyboardEvent) => this.onKey(e);
    window.addEventListener('keydown', this.keyHandler);
  }

  close(): void {
    this.active = false;
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    this.onComplete = null;
    this.clickBound = false;
  }

  /** Advance timing bar; call every frame while open. Race clock continues elsewhere. */
  update(dt: number): void {
    if (!this.active || !this.waitingConfirm) return;
    const step = STEPS[this.stepIndex];
    if (!step) return;
    // Oscillating timing bar — press when marker is in green band (0.42–0.72)
    this.gauge += this.gaugeDir * dt * (0.85 / Math.max(0.8, step.duration * 0.55));
    if (this.gauge >= 1) {
      this.gauge = 1;
      this.gaugeDir = -1;
    } else if (this.gauge <= 0) {
      this.gauge = 0;
      this.gaugeDir = 1;
    }
    const marker = this.el.querySelector('#pit-marker') as HTMLElement | null;
    if (marker) marker.style.left = `${this.gauge * 100}%`;
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.active || !this.waitingConfirm) return;
    const step = STEPS[this.stepIndex];
    if (!step) return;
    if (e.code === step.key || e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      this.tryConfirm();
    }
  }

  private tryConfirm(): void {
    if (!this.active || !this.waitingConfirm) return;
    const step = STEPS[this.stepIndex];
    if (!step) return;
    const inGreen = this.gauge >= 0.42 && this.gauge <= 0.72;
    // Success in green; outside still completes but slower (retry same step once on miss? — complete anyway with slight delay)
    this.waitingConfirm = false;
    this.done.add(step.id);
    const slot = this.el.querySelector(`[data-step="${step.id}"]`);
    if (slot) {
      slot.classList.add(inGreen ? 'ok' : 'ok-slow');
      slot.classList.remove('current');
    }
    // Brief "work" pause then next step
    const pause = inGreen ? 0.35 : 0.85;
    window.setTimeout(() => {
      if (!this.active) return;
      this.stepIndex += 1;
      if (this.stepIndex >= STEPS.length) {
        this.finish();
        return;
      }
      this.gauge = 0.1;
      this.gaugeDir = 1;
      this.waitingConfirm = true;
      this.render();
    }, pause * 1000);
  }

  private finish(): void {
    const result: PitRepairResult = {
      tires: this.done.has('tires'),
      damage: this.done.has('damage'),
      fuel: this.done.has('fuel'),
    };
    const cb = this.onComplete;
    this.close();
    cb?.(result);
  }

  private render(): void {
    const step = STEPS[this.stepIndex];
    const rows = STEPS.map((s, i) => {
      let cls = 'pit-slot';
      if (this.done.has(s.id)) cls += ' ok';
      else if (i === this.stepIndex) cls += ' current';
      return `<div class="${cls}" data-step="${s.id}" data-i="${i}">
        <span class="pit-key">${s.keyLabel}</span>
        <span class="pit-label">${s.label}</span>
        <span class="pit-status">${this.done.has(s.id) ? '✓' : i === this.stepIndex ? '→' : ''}</span>
      </div>`;
    }).join('');

    this.el.innerHTML = `
      <div class="pit-panel">
        <div class="pit-title">ПИТ-СТОП</div>
        <div class="pit-sub">Ремонт вручную · часы гонки идут</div>
        <div class="pit-slots">${rows}</div>
        <div class="pit-gauge-wrap">
          <div class="pit-gauge">
            <div class="pit-green"></div>
            <div class="pit-marker" id="pit-marker"></div>
          </div>
          <div class="pit-gauge-hint">Нажмите <b>${step?.keyLabel ?? '1'}</b> / Пробел в зелёной зоне — ${step?.label ?? ''}</div>
        </div>
        <div class="pit-help">1 — шины · 2 — крыло · 3 — топливо · Пробел подтверждает текущий</div>
      </div>
    `;

    if (!this.clickBound) {
      this.clickBound = true;
    }
    this.el.querySelectorAll('.pit-slot').forEach((node) => {
      node.addEventListener('click', () => {
        const i = Number((node as HTMLElement).dataset.i);
        if (i === this.stepIndex) this.tryConfirm();
      });
    });
  }
}

/** Shared pit corridor along start/finish — right side of track. */
export const PIT_ZONE = {
  /** Along-track window near S/F (m from start, wraps) */
  nearStartMax: 55,
  nearEndMinFrac: 0.92,
  /** Lateral: toward right (positive) as fraction of half-width */
  lateralMinFrac: 0.28,
  /** Max speed to open pit UI (m/s) ≈ 25 km/h */
  stopSpeed: 7,
  /** Hint when near entry (wider) */
  hintLateralFrac: 0.12,
  hintSpeedMax: 45,
} as const;

export function inPitApproach(
  s: number,
  trackLen: number,
  lateral: number,
  halfW: number,
  speed: number,
): { near: boolean; inBox: boolean } {
  const nearS =
    s <= PIT_ZONE.nearStartMax || s >= trackLen * PIT_ZONE.nearEndMinFrac;
  if (!nearS) return { near: false, inBox: false };
  const latOk = lateral >= halfW * PIT_ZONE.hintLateralFrac;
  const boxLat = lateral >= halfW * PIT_ZONE.lateralMinFrac;
  const spd = Math.abs(speed);
  const near = latOk && spd < PIT_ZONE.hintSpeedMax;
  const inBox = boxLat && spd <= PIT_ZONE.stopSpeed;
  return { near, inBox };
}
