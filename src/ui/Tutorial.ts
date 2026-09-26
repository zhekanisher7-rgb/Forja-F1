export class TutorialOverlay {
  el: HTMLDivElement;
  private onClose: () => void;

  constructor(parent: HTMLElement, onClose: () => void) {
    this.onClose = onClose;
    this.el = document.createElement('div');
    this.el.id = 'tutorial';
    this.el.className = 'hidden';
    parent.appendChild(this.el);
    this.el.innerHTML = `
      <div class="tutorial-card">
        <h2>Обучение — управление</h2>
        <table>
          <tr><td>W / ↑</td><td>Газ (аналоговый разгон)</td></tr>
          <tr><td>S / ↓</td><td>Двигательное торможение</td></tr>
          <tr><td>Shift</td><td>Основной тормоз</td></tr>
          <tr><td>A / ←</td><td>Руль влево</td></tr>
          <tr><td>D / →</td><td>Руль вправо</td></tr>
          <tr><td>Ctrl</td><td>ERS-буст (пока есть заряд)</td></tr>
          <tr><td>Пробел</td><td>DRS (только в зоне DRS)</td></tr>
          <tr><td>R</td><td>Задний ход (на низкой скорости)</td></tr>
          <tr><td>C</td><td>Камера: преследование ↔ кокпит</td></tr>
        </table>
        <p class="hint">
          Держитесь асфальта между барьерами Монако. Зелёные ворота — зоны DRS.
          Жёсткий тормоз без ABS (режим «Симулятор») может заблокировать колёса.
          Столкновения с стенами наносят урон и замедляют машину.
        </p>
        <button class="menu-btn" id="tut-ok" style="margin-top:1rem">Понятно — к гонке</button>
        <button class="back-link" id="tut-menu">Только меню</button>
      </div>
    `;
    this.el.querySelector('#tut-ok')!.addEventListener('click', () => {
      this.hide();
      this.onClose();
    });
    this.el.querySelector('#tut-menu')!.addEventListener('click', () => this.hide());
  }

  show(): void {
    this.el.classList.remove('hidden');
  }

  hide(): void {
    this.el.classList.add('hidden');
  }
}
