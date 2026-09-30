export interface RaceResult {
  totalTimeMs: number;
  bestLapMs: number;
  lapsCompleted: number;
  damage: number;
  tireWear: number;
  position?: number;
  fieldSize?: number;
  /** Disqualification (e.g. missed mandatory pit) */
  disqualified?: boolean;
  dqReason?: string;
  /** Quick Race career coins (set by Game). */
  coins?: {
    earned: number;
    base: number;
    tierMul: number;
    tierName: string;
    balance: number;
  };
  /** Duel settlement (set by Game). */
  duel?: {
    won: boolean;
    bet: number;
    coef: number;
    payout: number;
    opponent: string;
    balance: number;
  };
}

function coins(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
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
    const dq = !!result.disqualified;
    const duel = result.duel;
    let title = dq ? '⛔ ДИСКВАЛИФИКАЦИЯ' : '🏁 ФИНИШ';
    if (duel) title = duel.won ? `🏆 Победа! +${coins(duel.payout)} монет` : '💀 Поражение. Ставка сгорела';
    let coinBlock = '';
    if (result.coins) {
      const c = result.coins;
      coinBlock = `
        <div class="results-coins${c.earned > 0 ? '' : ' none'}">
          <div class="rc-main">🪙 +${coins(c.earned)} монет</div>
          <div class="rc-sub">${c.earned > 0 ? `${coins(c.base)} × ${c.tierMul} (${c.tierName})` : 'Без награды при дисквалификации'} · баланс ${coins(c.balance)}</div>
        </div>`;
    } else if (duel) {
      coinBlock = `
        <div class="results-coins${duel.won ? '' : ' none'}">
          <div class="rc-main">${duel.won ? `🪙 +${coins(duel.payout)}` : `🪙 −${coins(duel.bet)}`}</div>
          <div class="rc-sub">Соперник: ${duel.opponent} · ставка ${coins(duel.bet)} × ${duel.coef.toFixed(2)} · баланс ${coins(duel.balance)}</div>
        </div>`;
    }
    const dqBlock = dq
      ? `<div class="results-dq">${result.dqReason ?? 'Нарушение регламента'}</div>`
      : '';
    const posBlock = dq
      ? `<div class="results-stat"><span class="label">СТАТУС</span><span class="value dq">DQ</span></div>`
      : `<div class="results-stat"><span class="label">ПОЗИЦИЯ</span><span class="value">${pos} / ${field}</span></div>`;
    this.el.innerHTML = `
      <div class="results-card${dq || (duel && !duel.won) ? ' dq' : ''}">
        <h2 class="${duel ? 'long' : ''}">${title}</h2>
        ${dqBlock}
        ${coinBlock}
        ${posBlock}
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
