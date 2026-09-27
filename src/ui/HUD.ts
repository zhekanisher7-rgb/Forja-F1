import type { VehicleState } from '../physics/VehiclePhysics';
import { speedKmh } from '../physics/VehiclePhysics';
import type { TrackData } from '../tracks/Track';
import { getMinimapPath } from '../render/TrackMesh';

function fmtDelta(ms: number): string {
  const sign = ms >= 0 ? '+' : '−';
  const abs = Math.abs(ms) / 1000;
  return `${sign}${abs.toFixed(3)}`;
}

function fmtTime(ms: number): string {
  if (ms <= 0) return '—';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

export class HUD {
  el: HTMLDivElement;
  private minimap: HTMLCanvasElement;
  private mapPath: ReturnType<typeof getMinimapPath> | null = null;
  private totalLaps = 3;
  private fieldSize = 1;
  private showFps = false;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'hud';
    this.el.className = 'hidden';
    parent.appendChild(this.el);
    this.el.innerHTML = `
      <div class="hud-pos"><span id="pos">1</span><span class="of">/<span id="pos-of">1</span></span></div>
      <div class="hud-lap">КРУГ <span class="num" id="lap">1</span>/<span id="lap-max">3</span></div>
      <div class="hud-delta" id="delta">—</div>
      <div class="hud-fps hidden" id="hud-fps">— FPS</div>
      <div class="hud-flags">
        <div class="flag-pill" id="flag-drs">DRS</div>
        <div class="flag-pill" id="flag-ers">ERS</div>
        <div class="flag-pill" id="flag-lock">LOCK</div>
      </div>
      <div class="hud-bars">
        <div class="bar-row"><span>ШИНЫ</span><div class="bar-track"><div class="bar-fill tires" id="bar-tires"></div></div><span id="tires-pct">100%</span></div>
        <div class="bar-row"><span>ТОПЛИВО</span><div class="bar-track"><div class="bar-fill fuel" id="bar-fuel"></div></div><span id="fuel-pct">100%</span></div>
        <div class="bar-row"><span>ERS</span><div class="bar-track"><div class="bar-fill ers" id="bar-ers"></div></div><span id="ers-pct">100%</span></div>
      </div>
      <div class="hud-speed"><div class="val" id="spd">0</div><div class="unit">КМ/Ч</div></div>
      <div class="hud-gear" id="gear">1</div>
      <canvas id="minimap" width="160" height="160"></canvas>
      <div class="lock-hint" id="lock-hint">БЛОКИРОВКА КОЛЁС</div>
      <div class="fuel-empty-hint" id="fuel-empty">НЕТ ТОПЛИВА</div>
      <div class="racing-line-hint hidden" id="line-hint">● ГОНОЧНАЯ ЛИНИЯ</div>
      <div class="pit-hint" id="pit-hint">Пит</div>
      <div class="bar-row hud-damage" style="display:none"><span>УРОН</span><div class="bar-track"><div class="bar-fill damage" id="bar-damage"></div></div><span id="dmg-pct">0%</span></div>
    `;
    this.minimap = this.el.querySelector('#minimap') as HTMLCanvasElement;
  }

  setTrack(
    track: TrackData,
    totalLaps: number,
    showRacingLine: boolean,
    fieldSize = 1,
  ): void {
    this.mapPath = getMinimapPath(track);
    this.totalLaps = totalLaps;
    this.fieldSize = fieldSize;
    (this.el.querySelector('#lap-max') as HTMLElement).textContent = String(totalLaps);
    (this.el.querySelector('#pos-of') as HTMLElement).textContent = String(fieldSize);
    const hint = this.el.querySelector('#line-hint') as HTMLElement;
    if (showRacingLine) hint.classList.remove('hidden');
    else hint.classList.add('hidden');
  }

  setShowFps(on: boolean): void {
    this.showFps = on;
    const el = this.el.querySelector('#hud-fps') as HTMLElement;
    if (on) el.classList.remove('hidden');
    else el.classList.add('hidden');
  }

  show(): void {
    this.el.classList.remove('hidden');
  }

  hide(): void {
    this.el.classList.add('hidden');
    this.setPitHint(false);
  }

  /** Near pit entry — show «Пит» cue */
  setPitHint(show: boolean, inBox = false): void {
    const el = this.el.querySelector('#pit-hint') as HTMLElement | null;
    if (!el) return;
    el.classList.toggle('show', show);
    el.classList.toggle('inbox', inBox);
    el.textContent = inBox ? 'Пит · остановитесь' : 'Пит';
  }

  update(
    state: VehicleState,
    ersActive: boolean,
    fps = 0,
    position = 1,
  ): void {
    const spd = Math.round(speedKmh(state));
    (this.el.querySelector('#spd') as HTMLElement).textContent = String(spd);
    const gearLabel = state.gear === -1 ? 'R' : state.gear === 0 ? 'N' : String(state.gear);
    (this.el.querySelector('#gear') as HTMLElement).textContent = gearLabel;
    (this.el.querySelector('#lap') as HTMLElement).textContent = String(
      Math.min(state.lap, this.totalLaps),
    );
    (this.el.querySelector('#pos') as HTMLElement).textContent = String(position);
    (this.el.querySelector('#pos-of') as HTMLElement).textContent = String(this.fieldSize);

    if (this.showFps) {
      (this.el.querySelector('#hud-fps') as HTMLElement).textContent =
        `${Math.round(fps)} FPS`;
    }

    const tirePct = Math.round((1 - state.tires.wear) * 100);
    const fuelPct = Math.round(state.fuel * 100);
    const ersPct = Math.round(state.ers * 100);
    (this.el.querySelector('#bar-tires') as HTMLElement).style.width = `${tirePct}%`;
    (this.el.querySelector('#bar-fuel') as HTMLElement).style.width = `${fuelPct}%`;
    (this.el.querySelector('#bar-ers') as HTMLElement).style.width = `${ersPct}%`;
    (this.el.querySelector('#tires-pct') as HTMLElement).textContent = `${tirePct}%`;
    (this.el.querySelector('#fuel-pct') as HTMLElement).textContent = `${fuelPct}%`;
    (this.el.querySelector('#ers-pct') as HTMLElement).textContent = `${ersPct}%`;

    const dmgPct = Math.round(state.damage * 100);
    const dmgBar = this.el.querySelector('#bar-damage') as HTMLElement | null;
    const dmgLabel = this.el.querySelector('#dmg-pct') as HTMLElement | null;
    if (dmgBar) dmgBar.style.width = `${dmgPct}%`;
    if (dmgLabel) dmgLabel.textContent = `${dmgPct}%`;

    const fuelEmpty = state.fuel <= 0;
    const fuelRow = this.el.querySelector('#bar-fuel')?.parentElement?.parentElement as HTMLElement | null;
    fuelRow?.classList.toggle('empty', fuelEmpty);
    (this.el.querySelector('#fuel-empty') as HTMLElement).classList.toggle('show', fuelEmpty);
    if (fuelEmpty) {
      (this.el.querySelector('#fuel-pct') as HTMLElement).textContent = '0%';
    }

    const drsFlag = this.el.querySelector('#flag-drs') as HTMLElement;
    drsFlag.classList.toggle('active', state.drsOpen || state.inDrsZone);
    drsFlag.textContent = state.drsOpen ? 'DRS OPEN' : state.inDrsZone ? 'DRS ZONE' : 'DRS';

    const ersFlag = this.el.querySelector('#flag-ers') as HTMLElement;
    ersFlag.classList.toggle('ers-active', ersActive && state.ers > 0.01);

    const lockFlag = this.el.querySelector('#flag-lock') as HTMLElement;
    lockFlag.classList.toggle('active', state.wheelLock);
    (this.el.querySelector('#lock-hint') as HTMLElement).classList.toggle('show', state.wheelLock);

    const deltaEl = this.el.querySelector('#delta') as HTMLElement;
    if (state.bestLapMs > 0 && state.currentLapMs > 2000) {
      const ref = state.lastLapMs > 0 ? state.lastLapMs : state.bestLapMs;
      void ref;
      if (state.lastLapMs > 0) {
        const dBest = state.lastLapMs - state.bestLapMs;
        deltaEl.textContent = `ЛК ${fmtTime(state.lastLapMs)}  (${fmtDelta(dBest)})`;
        deltaEl.className = 'hud-delta ' + (dBest <= 0 ? 'ahead' : 'behind');
      } else {
        deltaEl.textContent = `ТЕК ${fmtTime(state.currentLapMs)}`;
        deltaEl.className = 'hud-delta';
      }
    } else {
      deltaEl.textContent = `ТЕК ${fmtTime(state.currentLapMs)}`;
      deltaEl.className = 'hud-delta';
    }

    this.drawMinimap(state);
  }

  private drawMinimap(state: VehicleState): void {
    if (!this.mapPath) return;
    const ctx = this.minimap.getContext('2d')!;
    const w = this.minimap.width;
    const h = this.minimap.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, w, h);

    const { xs, zs, minX, maxX, minZ, maxZ } = this.mapPath;
    const pad = 12;
    const sx = (w - pad * 2) / Math.max(1, maxX - minX);
    const sz = (h - pad * 2) / Math.max(1, maxZ - minZ);
    const sc = Math.min(sx, sz);

    const tx = (x: number) => pad + (x - minX) * sc + ((w - pad * 2) - (maxX - minX) * sc) / 2;
    const tz = (z: number) => h - pad - (z - minZ) * sc - ((h - pad * 2) - (maxZ - minZ) * sc) / 2;

    ctx.beginPath();
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 3;
    for (let i = 0; i < xs.length; i++) {
      if (i === 0) ctx.moveTo(tx(xs[i]), tz(zs[i]));
      else ctx.lineTo(tx(xs[i]), tz(zs[i]));
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = '#e10600';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < xs.length; i++) {
      if (i === 0) ctx.moveTo(tx(xs[i]), tz(zs[i]));
      else ctx.lineTo(tx(xs[i]), tz(zs[i]));
    }
    ctx.stroke();

    ctx.fillStyle = '#00d2be';
    ctx.beginPath();
    ctx.arc(tx(state.x), tz(state.z), 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
