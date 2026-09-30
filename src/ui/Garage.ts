/**
 * Гараж / Прокачка — 6 upgrade categories, levels 0..10, paid with in-game coins.
 */
import {
  UPGRADE_IDS,
  UPGRADE_DEFS,
  MAX_UPGRADE_LEVEL,
  nextUpgradeCost,
  bonusText,
  averageLevel,
  upgradedSpec,
} from '../game/Upgrades';
import { saveCareer, tryUpgrade, type CareerState } from '../game/Career';

export function fmtCoins(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
}

export function coinBadge(coins: number): string {
  return `<div class="coin-badge" title="Внутриигровые монеты"><span class="coin-ico">🪙</span><span class="coin-val">${fmtCoins(coins)}</span></div>`;
}

export class GarageScreen {
  private career: CareerState;
  private onBack: () => void;
  private flashId: string | null = null;

  constructor(career: CareerState, onBack: () => void) {
    this.career = career;
    this.onBack = onBack;
  }

  render(root: HTMLElement): void {
    const c = this.career;
    const spec = upgradedSpec(c.levels);
    const rows = UPGRADE_IDS.map((id) => {
      const def = UPGRADE_DEFS[id];
      const lvl = c.levels[id];
      const cost = nextUpgradeCost(lvl);
      const maxed = cost === null;
      const afford = !maxed && c.coins >= (cost ?? 0);
      const segs = Array.from({ length: MAX_UPGRADE_LEVEL }, (_, i) =>
        `<span class="seg${i < lvl ? ' on' : ''}"></span>`,
      ).join('');
      const nextTxt = maxed
        ? '<span class="gar-max">МАКС.</span>'
        : `След.: ${bonusText(id, lvl + 1)}`;
      return `
        <div class="gar-row${this.flashId === id ? ' flash' : ''}">
          <div class="gar-head">
            <span class="gar-name">${def.icon} ${def.nameRu}</span>
            <span class="gar-lvl">Ур. ${lvl}/${MAX_UPGRADE_LEVEL}</span>
          </div>
          <div class="seg-bar">${segs}</div>
          <div class="gar-bonus">${lvl > 0 ? bonusText(id, lvl) : def.descRu + ' — без бонуса'}</div>
          <div class="gar-foot">
            <span class="gar-next">${nextTxt}</span>
            <button class="gar-buy" data-up="${id}" ${afford ? '' : 'disabled'}>
              ${maxed ? 'Максимум' : `Улучшить · 🪙 ${fmtCoins(cost!)}`}
            </button>
          </div>
        </div>`;
    }).join('');

    root.innerHTML = `
      <div class="logo" style="font-size:1.8rem">Гараж</div>
      <div class="menu-panel wide-panel">
        <div class="panel-top">
          <span class="panel-sub">Прокачка болида · средний уровень ${averageLevel(c.levels).toFixed(1)}</span>
          ${coinBadge(c.coins)}
        </div>
        <div class="gar-list">${rows}</div>
        <div class="gar-summary">
          Итог: ${Math.round(spec.maxPower)} кВт · ERS ${Math.round(spec.ersBoostKw)} кВт ·
          ~${Math.round(spec.topSpeedKmh)} км/ч · Cl ${spec.downforceCl.toFixed(2)} · Cd ${spec.dragCd.toFixed(3)}
        </div>
        <p class="panel-note">Монеты зарабатываются в гонках (Быстрая гонка) и дуэлях. Бонусы действуют только на вашу машину.</p>
        <button class="back-link" data-g="back">← Назад</button>
      </div>
    `;
    this.flashId = null;

    root.querySelectorAll<HTMLButtonElement>('[data-up]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.up as (typeof UPGRADE_IDS)[number];
        if (tryUpgrade(this.career, id)) {
          saveCareer(this.career);
          this.flashId = id;
        }
        this.render(root);
      });
    });
    root.querySelector('[data-g="back"]')?.addEventListener('click', () => this.onBack());
  }
}
