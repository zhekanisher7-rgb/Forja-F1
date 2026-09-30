import { LIVERIES } from '../vehicles/Liveries';
import { PLAYER_VEHICLE_SPEC, type Difficulty } from '../physics/VehiclePhysics';
import {
  RACE_TIERS,
  TIERS,
  isRaceTier,
  saveCareer,
  type CareerState,
  type RaceTier,
} from '../game/Career';
import type { DuelContext } from '../game/Duel';
import { upgradedSpec } from '../game/Upgrades';
import { GarageScreen, coinBadge } from './Garage';
import { DuelMenu, type DuelStartRequest } from './DuelMenu';
import type { WeatherType } from '../physics/Weather';
import type { TireCompound } from '../physics/TireModel';
import {
  type GraphicsSettings,
  type GraphicsTier,
  DEFAULT_GRAPHICS,
} from '../render/GraphicsQuality';
import { TRACK_OPTIONS, type TrackId } from '../tracks';
import {
  OPPONENT_COUNT_OPTIONS,
  DEFAULT_OPPONENT_COUNT,
  type OpponentCount,
} from '../ai/AIDriver';

export type GameMode = 'quick' | 'timetrial' | 'tutorial' | 'duel';

export interface RaceSettings {
  mode: GameMode;
  difficulty: Difficulty;
  liveryId: string;
  customPrimary: string;
  customSecondary: string;
  customAccent: string;
  weather: WeatherType;
  tires: TireCompound;
  laps: number;
  trackId: TrackId;
  /** AI cars in quick/tutorial (4 / 8 / 12 / 16) */
  opponentCount: OpponentCount;
  /** Career tier for Quick Race (coins multiplier + AI strength). */
  tier: RaceTier;
  /** Set only for mode 'duel' (bet already deducted). */
  duel?: DuelContext;
}

const RACE_PREFS_KEY = 'forja-f1-race-prefs';

function loadRacePrefs(): Partial<Pick<RaceSettings, 'opponentCount' | 'laps' | 'trackId' | 'difficulty' | 'tier'>> {
  try {
    const raw = localStorage.getItem(RACE_PREFS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<RaceSettings>;
  } catch {
    return {};
  }
}

export function saveRacePrefs(s: RaceSettings): void {
  try {
    localStorage.setItem(
      RACE_PREFS_KEY,
      JSON.stringify({
        opponentCount: s.opponentCount,
        laps: s.laps,
        trackId: s.trackId,
        difficulty: s.difficulty,
        tier: s.tier,
      }),
    );
  } catch {
    /* ignore */
  }
}

function clampOpponentCount(n: unknown): OpponentCount {
  const v = Number(n);
  if ((OPPONENT_COUNT_OPTIONS as readonly number[]).includes(v)) return v as OpponentCount;
  return DEFAULT_OPPONENT_COUNT;
}

export type MenuCallbacks = {
  onStart: (settings: RaceSettings) => void;
  onShowTutorial: () => void;
  onCredits: () => void;
  onGraphicsChange: (g: GraphicsSettings) => void;
};

const DIFF_LABELS: Record<Difficulty, string> = {
  rookie: 'Новичок (ABS+TC+линия)',
  amateur: 'Любитель (ABS+TC)',
  pro: 'Профи (ABS)',
  sim: 'Симулятор (без ассистов)',
};

const TIER_LABELS: Record<GraphicsTier, string> = {
  low: 'Низкое (макс. FPS)',
  medium: 'Среднее (~60 FPS, мягкие тени)',
  high: 'Высокое (тени + пост)',
  ultra: 'Ультра (максимум)',
};

const TIER_ORDER: GraphicsTier[] = ['low', 'medium', 'high', 'ultra'];

const TIRE_LABELS: Record<TireCompound, string> = {
  slick: 'Слики',
  inter: 'Интермедиаты',
  wet: 'Дождевые',
};


export class MainMenu {
  el: HTMLDivElement;
  private settings: RaceSettings;
  private graphics: GraphicsSettings;
  private view: 'main' | 'race' | 'settings' | 'credits' | 'garage' | 'duel' = 'main';
  private cbs: MenuCallbacks;
  private career: CareerState;
  private garage: GarageScreen;
  private duelMenu: DuelMenu;

  constructor(
    parent: HTMLElement,
    cbs: MenuCallbacks,
    graphics: GraphicsSettings | undefined,
    career: CareerState,
  ) {
    this.cbs = cbs;
    this.career = career;
    this.graphics = { ...(graphics ?? DEFAULT_GRAPHICS) };
    const prefs = loadRacePrefs();
    this.settings = {
      mode: 'quick',
      difficulty: (prefs.difficulty as Difficulty) || 'amateur',
      liveryId: 'ferrari',
      customPrimary: '#888888',
      customSecondary: '#222222',
      customAccent: '#00ff88',
      weather: 'dry',
      tires: 'slick',
      laps: typeof prefs.laps === 'number' ? prefs.laps : 3,
      trackId: (prefs.trackId as TrackId) || 'monaco',
      opponentCount: clampOpponentCount(prefs.opponentCount),
      tier: isRaceTier(prefs.tier) ? prefs.tier : 'city',
    };
    const toMain = () => {
      this.view = 'main';
      this.render();
    };
    this.garage = new GarageScreen(career, toMain);
    this.duelMenu = new DuelMenu(career, this.settings.trackId, toMain, (req) =>
      this.startDuel(req),
    );
    this.el = document.createElement('div');
    this.el.id = 'main-menu';
    this.el.className = 'screen';
    parent.appendChild(this.el);
    this.render();
  }

  show(): void {
    this.el.classList.remove('hidden');
    this.view = 'main';
    this.render();
  }

  hide(): void {
    this.el.classList.add('hidden');
  }

  getSettings(): RaceSettings {
    return { ...this.settings };
  }

  getGraphics(): GraphicsSettings {
    return { ...this.graphics };
  }

  private render(): void {
    if (this.view === 'main') {
      this.el.innerHTML = `
        <div class="logo">Forja F1 2026</div>
        <div class="logo-sub">Фан-симулятор · Фаза 1+</div>
        <div class="menu-panel">
          <div class="panel-top"><span class="panel-sub">Баланс</span>${coinBadge(this.career.coins)}</div>
          <button class="menu-btn" data-a="quick">Быстрая гонка</button>
          <button class="menu-btn" data-a="duel">Дуэль 1 на 1</button>
          <button class="menu-btn" data-a="garage">Гараж / Прокачка</button>
          <button class="menu-btn" data-a="timetrial">Заезд на время</button>
          <button class="menu-btn" data-a="tutorial">Обучение</button>
          <button class="menu-btn secondary" data-a="settings">Настройки</button>
          <button class="menu-btn secondary" data-a="credits">Выход / Титры</button>
        </div>
        <p class="disclaimer">Неофициальный фан-проект «Forja F1 2026». Не связан с Formula 1®, FIA или командами. Все названия — стилизованная дань уважения.</p>
      `;
    } else if (this.view === 'race') {
      this.el.innerHTML = `
        <div class="logo" style="font-size:1.8rem">Старт</div>
        <div class="menu-panel">
          <div class="form-row">
            <label>Команда / раскраска</label>
            <div class="livery-grid" id="liv-grid"></div>
          </div>
          <div class="form-row" id="custom-colors" style="display:none">
            <label>Свои цвета</label>
            <div class="color-pickers">
              <input type="color" id="c-prim" value="${this.settings.customPrimary}" />
              <input type="color" id="c-sec" value="${this.settings.customSecondary}" />
              <input type="color" id="c-acc" value="${this.settings.customAccent}" />
            </div>
          </div>
          <div class="form-row" id="car-specs">
            <label>Технические характеристики</label>
            <div class="tech-specs" id="tech-specs"></div>
          </div>
          <div class="form-row">
            <label>Трасса</label>
            <select id="track">
              ${TRACK_OPTIONS.map((tr) => `<option value="${tr.id}" ${this.settings.trackId === tr.id ? 'selected' : ''}>${tr.nameRu}</option>`).join('')}
            </select>
          </div>
          <div class="form-row">
            <label>Погода</label>
            <select id="weather">
              <option value="dry" ${this.settings.weather === 'dry' ? 'selected' : ''}>Сухо</option>
              <option value="wet" ${this.settings.weather === 'wet' ? 'selected' : ''}>Дождь</option>
            </select>
          </div>
          <div class="form-row">
            <label>Шины</label>
            <select id="tires">
              <option value="slick" ${this.settings.tires === 'slick' ? 'selected' : ''}>Слики</option>
              <option value="inter" ${this.settings.tires === 'inter' ? 'selected' : ''}>Интермедиаты</option>
              <option value="wet" ${this.settings.tires === 'wet' ? 'selected' : ''}>Дождевые</option>
            </select>
          </div>
          <div class="form-row">
            <label>Круги</label>
            <select id="laps">
              ${[1, 2, 3, 5, 8].map((n) => `<option value="${n}" ${this.settings.laps === n ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
          </div>
          <div class="form-row" id="tier-row">
            <label>Лига (награда в монетах)</label>
            <select id="tier">
              ${RACE_TIERS.map((t) => `<option value="${t}" ${this.settings.tier === t ? 'selected' : ''}>${TIERS[t].nameRu} — ×${TIERS[t].coinMul} · ${TIERS[t].descRu}</option>`).join('')}
            </select>
          </div>
          <div class="form-row" id="opp-row">
            <label>Соперники (ИИ)</label>
            <select id="opponents">
              ${OPPONENT_COUNT_OPTIONS.map((n) => `<option value="${n}" ${this.settings.opponentCount === n ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
          </div>
          <button class="menu-btn" data-a="go">К гонке →</button>
          <button class="back-link" data-a="back">← Назад</button>
        </div>
      `;
      const grid = this.el.querySelector('#liv-grid')!;
      for (const l of LIVERIES) {
        const b = document.createElement('button');
        b.className = 'livery-btn' + (this.settings.liveryId === l.id ? ' selected' : '');
        b.textContent = l.name;
        b.style.background = `linear-gradient(135deg, ${l.primary}, ${l.secondary})`;
        b.dataset.liv = l.id;
        grid.appendChild(b);
      }
      this.toggleCustom();
      this.renderTechSpecs();
    } else if (this.view === 'garage') {
      this.garage.render(this.el);
      return;
    } else if (this.view === 'duel') {
      this.duelMenu.render(this.el);
      return;
    } else if (this.view === 'settings') {
      this.el.innerHTML = `
        <div class="logo" style="font-size:1.8rem">Настройки</div>
        <div class="menu-panel">
          <div class="form-row">
            <label>Сложность</label>
            <select id="diff">
              ${(Object.keys(DIFF_LABELS) as Difficulty[])
                .map(
                  (d) =>
                    `<option value="${d}" ${this.settings.difficulty === d ? 'selected' : ''}>${DIFF_LABELS[d]}</option>`,
                )
                .join('')}
            </select>
          </div>
          <div class="form-row">
            <label>Графика</label>
            <select id="gfx">
              ${TIER_ORDER
                .map(
                  (t) =>
                    `<option value="${t}" ${this.graphics.tier === t ? 'selected' : ''}>${TIER_LABELS[t]}</option>`,
                )
                .join('')}
            </select>
          </div>
          <div class="form-row">
            <label>Время суток</label>
            <select id="tod">
              <option value="day" ${!this.graphics.night ? 'selected' : ''}>День</option>
              <option value="night" ${this.graphics.night ? 'selected' : ''}>Ночь (заглушка)</option>
            </select>
          </div>
          <div class="form-row">
            <label>Счётчик FPS</label>
            <select id="fps">
              <option value="0" ${!this.graphics.showFps ? 'selected' : ''}>Выкл</option>
              <option value="1" ${this.graphics.showFps ? 'selected' : ''}>Вкл (HUD)</option>
            </select>
          </div>
          <p class="hint" style="color:var(--f1-muted);font-size:0.8rem;margin-top:0.75rem;line-height:1.4">
            Низкое: без теней, лёгкий декор — максимум FPS.<br/>
            Среднее (по умолч.): мягкие тени машин, без пост-эффектов — цель ~60 FPS.<br/>
            Высокое: тени декора + лёгкий bloom/виньетка, бликующая вода.<br/>
            Ультра: крупнее тени, анимация воды, сильнее пост. Вкл. «Счётчик FPS» для проверки.<br/>
            Новичок: ABS, TC и гоночная линия. Симулятор: без ассистов.
          </p>
          <button class="menu-btn" data-a="save-settings">Сохранить</button>
        </div>
      `;
    } else if (this.view === 'credits') {
      this.el.innerHTML = `
        <div class="logo" style="font-size:1.8rem">Титры</div>
        <div class="menu-panel" style="text-align:center;line-height:1.6">
          <p><strong>Forja F1 2026</strong></p>
          <p style="color:var(--f1-muted);font-size:0.85rem">Прототип фазы 1+ · фан-трибьют</p>
          <p style="margin-top:1rem;font-size:0.85rem">Сделано для Melgy</p>
          <p style="color:var(--f1-muted);font-size:0.75rem;margin-top:1rem">
            Three.js · Vite · TypeScript<br/>
            Неофициальный проект. Нет лицензии F1/FIA.
          </p>
          <button class="menu-btn" data-a="back" style="margin-top:1.25rem">← В меню</button>
        </div>
      `;
    }

    this.el.querySelectorAll('[data-a]').forEach((btn) => {
      btn.addEventListener('click', () => this.onAction((btn as HTMLElement).dataset.a!));
    });
    this.el.querySelectorAll('[data-liv]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.settings.liveryId = (btn as HTMLElement).dataset.liv!;
        this.render();
      });
    });
    const diff = this.el.querySelector('#diff') as HTMLSelectElement | null;
    if (diff) diff.addEventListener('change', () => (this.settings.difficulty = diff.value as Difficulty));
    const trackSel = this.el.querySelector('#track') as HTMLSelectElement | null;
    if (trackSel)
      trackSel.addEventListener('change', () => (this.settings.trackId = trackSel.value as TrackId));
    const weather = this.el.querySelector('#weather') as HTMLSelectElement | null;
    if (weather) weather.addEventListener('change', () => (this.settings.weather = weather.value as WeatherType));
    const tires = this.el.querySelector('#tires') as HTMLSelectElement | null;
    if (tires) tires.addEventListener('change', () => { this.settings.tires = tires.value as TireCompound; this.renderTechSpecs(); });
    const laps = this.el.querySelector('#laps') as HTMLSelectElement | null;
    if (laps) laps.addEventListener('change', () => (this.settings.laps = Number(laps.value)));
    const opp = this.el.querySelector('#opponents') as HTMLSelectElement | null;
    if (opp) {
      opp.addEventListener('change', () => {
        this.settings.opponentCount = clampOpponentCount(opp.value);
      });
    }
    const oppRow = this.el.querySelector('#opp-row') as HTMLElement | null;
    if (oppRow) oppRow.style.display = this.settings.mode === 'timetrial' ? 'none' : 'block';
    const tierRow = this.el.querySelector('#tier-row') as HTMLElement | null;
    if (tierRow) tierRow.style.display = this.settings.mode === 'quick' ? 'block' : 'none';
    const tierSel = this.el.querySelector('#tier') as HTMLSelectElement | null;
    if (tierSel)
      tierSel.addEventListener('change', () => {
        if (isRaceTier(tierSel.value)) this.settings.tier = tierSel.value;
      });
    const cp = this.el.querySelector('#c-prim') as HTMLInputElement | null;
    const cs = this.el.querySelector('#c-sec') as HTMLInputElement | null;
    const ca = this.el.querySelector('#c-acc') as HTMLInputElement | null;
    if (cp) cp.addEventListener('input', () => (this.settings.customPrimary = cp.value));
    if (cs) cs.addEventListener('input', () => (this.settings.customSecondary = cs.value));
    if (ca) ca.addEventListener('input', () => (this.settings.customAccent = ca.value));

    const gfx = this.el.querySelector('#gfx') as HTMLSelectElement | null;
    if (gfx)
      gfx.addEventListener('change', () => {
        this.graphics.tier = gfx.value as GraphicsTier;
      });
    const tod = this.el.querySelector('#tod') as HTMLSelectElement | null;
    if (tod)
      tod.addEventListener('change', () => {
        this.graphics.night = tod.value === 'night';
      });
    const fps = this.el.querySelector('#fps') as HTMLSelectElement | null;
    if (fps)
      fps.addEventListener('change', () => {
        this.graphics.showFps = fps.value === '1';
      });
  }


  private renderTechSpecs(): void {
    const box = this.el.querySelector('#tech-specs') as HTMLElement | null;
    if (!box) return;
    const s = PLAYER_VEHICLE_SPEC;
    const u = upgradedSpec(this.career.levels);
    const tire = TIRE_LABELS[this.settings.tires];
    const up = (base: number, now: number, txt: string) =>
      Math.abs(now - base) > 1e-6 ? `${txt} <span class="tech-up">▲</span>` : txt;
    const pctUp = (mul: number, invert = false) => {
      const d = Math.round((invert ? 1 - mul : mul - 1) * 100);
      return d > 0 ? `${invert ? '−' : '+'}${d}% <span class="tech-up">▲</span>` : 'база';
    };
    const rows: [string, string][] = [
      ['Масса', `${s.mass} кг`],
      ['Мощность', up(s.maxPower, u.maxPower, `${Math.round(u.maxPower)} кВт`)],
      ['ERS-буст', up(s.ersBoostKw, u.ersBoostKw, `${Math.round(u.ersBoostKw)} кВт`)],
      ['Макс. скорость', up(s.topSpeedKmh, u.topSpeedKmh, `~${Math.round(u.topSpeedKmh)} км/ч`)],
      ['Прижимная сила Cl', up(s.downforceCl, u.downforceCl, u.downforceCl.toFixed(2))],
      ['Сопротивление Cd', up(s.dragCd, u.dragCd, u.dragCd.toFixed(3))],
      ['Тормоза', pctUp(u.brakeMul)],
      ['Сцепление шин', pctUp(u.gripMul)],
      ['Расход топлива', pctUp(u.fuelBurnMul, true)],
      ['Колёсная база', `${s.wheelbase.toFixed(1)} м`],
      ['Шины', tire],
    ];
    box.innerHTML = rows
      .map(
        ([k, v]) =>
          `<div class="tech-row"><span class="tech-k">${k}</span><span class="tech-v">${v}</span></div>`,
      )
      .join('');
  }

  private toggleCustom(): void {
    const box = this.el.querySelector('#custom-colors') as HTMLElement | null;
    if (box) box.style.display = this.settings.liveryId === 'custom' ? 'block' : 'none';
  }

  private onAction(a: string): void {
    switch (a) {
      case 'quick':
        this.settings.mode = 'quick';
        this.view = 'race';
        this.render();
        break;
      case 'timetrial':
        this.settings.mode = 'timetrial';
        this.view = 'race';
        this.render();
        break;
      case 'tutorial':
        this.settings.mode = 'tutorial';
        this.cbs.onShowTutorial();
        break;
      case 'garage':
        this.view = 'garage';
        this.render();
        break;
      case 'duel':
        this.view = 'duel';
        this.render();
        break;
      case 'settings':
        this.view = 'settings';
        this.render();
        break;
      case 'credits':
        this.view = 'credits';
        this.render();
        break;
      case 'back':
        this.view = 'main';
        this.render();
        break;
      case 'save-settings':
        this.cbs.onGraphicsChange({ ...this.graphics });
        this.view = 'main';
        this.render();
        break;
      case 'go':
        saveRacePrefs(this.settings);
        this.cbs.onStart({ ...this.settings, duel: undefined });
        break;
    }
  }

  /** Deduct the bet up-front (quit / reload = bet lost), then start a 1-on-1 race. */
  private startDuel(req: DuelStartRequest): void {
    const bet = req.ctx.bet;
    if (bet < 1 || bet > this.career.coins) return;
    this.career.coins -= bet;
    saveCareer(this.career);
    this.cbs.onStart({
      ...this.settings,
      mode: 'duel',
      trackId: req.trackId,
      laps: req.laps,
      opponentCount: this.settings.opponentCount,
      duel: { ...req.ctx },
    });
  }
}
