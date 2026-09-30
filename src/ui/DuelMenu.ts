/**
 * Дуэль 1 на 1 — pick a fictional rival, bet in-game coins, race 1-on-1.
 */
import {
  DUEL_DRIVERS,
  DUEL_LAP_OPTIONS,
  DEFAULT_DUEL_LAPS,
  duelCoefficient,
  duelPayout,
  sanitizeBet,
  playerRating,
  getDuelDriver,
  type DuelContext,
} from '../game/Duel';
import type { CareerState } from '../game/Career';
import { TRACK_OPTIONS, type TrackId } from '../tracks';
import { coinBadge, fmtCoins } from './Garage';

export interface DuelStartRequest {
  ctx: DuelContext;
  trackId: TrackId;
  laps: number;
}

export class DuelMenu {
  private career: CareerState;
  private onBack: () => void;
  private onConfirm: (req: DuelStartRequest) => void;
  private driverId: string = DUEL_DRIVERS[0].id;
  private betText = '';
  private laps: number = DEFAULT_DUEL_LAPS;
  private trackId: TrackId;

  constructor(
    career: CareerState,
    trackId: TrackId,
    onBack: () => void,
    onConfirm: (req: DuelStartRequest) => void,
  ) {
    this.career = career;
    this.trackId = trackId;
    this.onBack = onBack;
    this.onConfirm = onConfirm;
  }

  render(root: HTMLElement): void {
    const c = this.career;
    const pr = playerRating(c.levels);
    const prevBet = Number(this.betText);
    if (!this.betText || !(prevBet >= 1) || prevBet > c.coins) {
      this.betText = String(Math.max(0, Math.min(c.coins, 50)));
    }
    const cards = DUEL_DRIVERS.map((d) => {
      const coef = duelCoefficient(d.rating, c.levels);
      const sel = d.id === this.driverId;
      const stronger = d.rating > pr;
      return `
        <button class="duel-card${sel ? ' selected' : ''}" data-drv="${d.id}">
          <span class="duel-lvl">${d.levelRu}</span>
          <span class="duel-name">${d.name}</span>
          <span class="duel-rating ${stronger ? 'hi' : 'lo'}">Рейтинг ${d.rating}</span>
          <span class="duel-coef">×${coef.toFixed(2)}</span>
        </button>`;
    }).join('');

    root.innerHTML = `
      <div class="logo" style="font-size:1.8rem">Дуэль 1 на 1</div>
      <div class="menu-panel wide-panel">
        <div class="panel-top">
          <span class="panel-sub">Ваш рейтинг машины: ${Math.round(pr)}</span>
          ${coinBadge(c.coins)}
        </div>
        <div class="form-row">
          <label>Соперник</label>
          <div class="duel-list">${cards}</div>
        </div>
        <div class="duel-grid2">
          <div class="form-row">
            <label>Трасса</label>
            <select id="duel-track">
              ${TRACK_OPTIONS.map((t) => `<option value="${t.id}" ${t.id === this.trackId ? 'selected' : ''}>${t.nameRu}</option>`).join('')}
            </select>
          </div>
          <div class="form-row">
            <label>Круги</label>
            <select id="duel-laps">
              ${DUEL_LAP_OPTIONS.map((n) => `<option value="${n}" ${n === this.laps ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <label>Ставка (1 – ${fmtCoins(c.coins)})</label>
          <input type="number" id="duel-bet" min="1" max="${c.coins}" step="1" value="${this.betText}" ${c.coins < 1 ? 'disabled' : ''} />
        </div>
        <div class="duel-summary" id="duel-summary"></div>
        <button class="menu-btn" id="duel-go">Сделать ставку и стартовать →</button>
        <p class="panel-note">Только внутриигровые монеты. Реальные деньги не используются.
        Победа — ставка × коэффициент. Поражение или сход — ставка сгорает. Обязательный пит-стоп в дуэли отключён.</p>
        <button class="back-link" data-d="back">← Назад</button>
      </div>
    `;

    root.querySelectorAll<HTMLButtonElement>('[data-drv]').forEach((b) => {
      b.addEventListener('click', () => {
        this.driverId = b.dataset.drv!;
        this.render(root);
      });
    });
    const bet = root.querySelector('#duel-bet') as HTMLInputElement;
    bet.addEventListener('input', () => {
      this.betText = bet.value;
      this.updateSummary(root);
    });
    const tr = root.querySelector('#duel-track') as HTMLSelectElement;
    tr.addEventListener('change', () => (this.trackId = tr.value as TrackId));
    const lp = root.querySelector('#duel-laps') as HTMLSelectElement;
    lp.addEventListener('change', () => (this.laps = Number(lp.value) || DEFAULT_DUEL_LAPS));
    root.querySelector('#duel-go')!.addEventListener('click', () => this.confirm(root));
    root.querySelector('[data-d="back"]')!.addEventListener('click', () => this.onBack());
    this.updateSummary(root);
  }

  private updateSummary(root: HTMLElement): void {
    const box = root.querySelector('#duel-summary') as HTMLElement;
    const go = root.querySelector('#duel-go') as HTMLButtonElement;
    const d = getDuelDriver(this.driverId);
    const bet = sanitizeBet(this.betText, this.career.coins);
    if (!d) return;
    const coef = duelCoefficient(d.rating, this.career.levels);
    if (this.career.coins < 1) {
      box.innerHTML = `<span class="warn">Недостаточно монет. Заработайте их в Быстрой гонке.</span>`;
      go.disabled = true;
      return;
    }
    if (bet === null) {
      box.innerHTML = `<span class="warn">Введите ставку от 1 до ${fmtCoins(this.career.coins)}</span>`;
      go.disabled = true;
      return;
    }
    box.innerHTML = `
      <div><span>Соперник</span><b>${d.name} · ${d.levelRu}</b></div>
      <div><span>Коэффициент</span><b class="gold">×${coef.toFixed(2)}</b></div>
      <div><span>Возможный выигрыш</span><b class="gold">🪙 ${fmtCoins(duelPayout(bet, coef))}</b></div>`;
    go.disabled = false;
  }

  private confirm(root: HTMLElement): void {
    const d = getDuelDriver(this.driverId);
    const bet = sanitizeBet(this.betText, this.career.coins);
    if (!d || bet === null) {
      this.updateSummary(root);
      return;
    }
    const coef = duelCoefficient(d.rating, this.career.levels);
    this.onConfirm({
      ctx: { driverId: d.id, bet, coef },
      trackId: this.trackId,
      laps: this.laps,
    });
  }
}
