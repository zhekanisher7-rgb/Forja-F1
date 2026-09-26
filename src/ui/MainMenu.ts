import { LIVERIES } from '../vehicles/Liveries';
import type { Difficulty } from '../physics/VehiclePhysics';
import type { WeatherType } from '../physics/Weather';
import type { TireCompound } from '../physics/TireModel';
import {
  type GraphicsSettings,
  type GraphicsTier,
  DEFAULT_GRAPHICS,
} from '../render/GraphicsQuality';
import { TRACK_OPTIONS, type TrackId } from '../tracks';

export type GameMode = 'quick' | 'timetrial' | 'tutorial';

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

export class MainMenu {
  el: HTMLDivElement;
  private settings: RaceSettings = {
    mode: 'quick',
    difficulty: 'amateur',
    liveryId: 'ferrari',
    customPrimary: '#888888',
    customSecondary: '#222222',
    customAccent: '#00ff88',
    weather: 'dry',
    tires: 'slick',
    laps: 3,
    trackId: 'monaco',
  };
  private graphics: GraphicsSettings;
  private view: 'main' | 'race' | 'settings' | 'credits' = 'main';
  private cbs: MenuCallbacks;

  constructor(parent: HTMLElement, cbs: MenuCallbacks, graphics?: GraphicsSettings) {
    this.cbs = cbs;
    this.graphics = { ...(graphics ?? DEFAULT_GRAPHICS) };
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
          <button class="menu-btn" data-a="quick">Быстрая гонка</button>
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
    if (tires) tires.addEventListener('change', () => (this.settings.tires = tires.value as TireCompound));
    const laps = this.el.querySelector('#laps') as HTMLSelectElement | null;
    if (laps) laps.addEventListener('change', () => (this.settings.laps = Number(laps.value)));
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
        this.cbs.onStart({ ...this.settings });
        break;
    }
  }
}
