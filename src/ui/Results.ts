export interface RaceResult {
  totalTimeMs: number;
  bestLapMs: number;
  lapsCompleted: number;
  damage: number;
  tireWear: number;
  position?: number;
  fieldSize?: number;
}

function fmt(ms: number): string {
  if (ms <= 0) return '—';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

export class ResultsScreen {
  el: HTMLDivElement;
  private onMenu: () => void;

  constructor(parent: HTMLElement, onMenu: () => void) {
    this.onMenu = onMenu;
    this.el = document.createElement('div');
    this.el.id = 'results';
    this.el.className = 'hidden';
    parent.appendChild(this.el);
  }

  show(result: RaceResult): void {
    const pos = result.position ?? 1;
    const field = result.fieldSize ?? 1;
    this.el.innerHTML = `
      <div class="results-card">
        <h2>🏁 ФИНИШ</h2>
        <div class="results-stat"><span class="label">ПОЗИЦИЯ</span><span class="value">${pos} / ${field}</span></div>
        <div class="results-stat"><span class="label">ОБЩЕЕ ВРЕМЯ</span><span class="value">${fmt(result.totalTimeMs)}</span></div>
        <div class="results-stat"><span class="label">ЛУЧШИЙ КРУГ</span><span class="value">${fmt(result.bestLapMs)}</span></div>
        <div class="results-stat"><span class="label">КРУГОВ</span><span class="value">${result.lapsCompleted}</span></div>
        <div class="results-stat"><span class="label">УРОН</span><span class="value">${Math.round(result.damage * 100)}%</span></div>
        <div class="results-stat"><span class="label">ИЗНОС ШИН</span><span class="value">${Math.round(result.tireWear * 100)}%</span></div>
        <button class="menu-btn" id="res-menu" style="margin-top:1.5rem">В главное меню</button>
      </div>
    `;
    this.el.classList.remove('hidden');
    this.el.querySelector('#res-menu')!.addEventListener('click', () => {
      this.hide();
      this.onMenu();
    });
  }

  hide(): void {
    this.el.classList.add('hidden');
  }
}
