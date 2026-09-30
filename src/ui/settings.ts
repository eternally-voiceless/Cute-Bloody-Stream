import Phaser from 'phaser';
import { ctx } from '../systems/context';
import { hasMusic } from '../systems/music';
import { emitSettingsOpen, setSetting, settings, type Settings } from '../systems/settings';
import { playSound } from '../systems/sound';

// Значок настроек в правом верхнем углу поверх всех сцен и окно громкости.
// HTML внутри DOM-контейнера Phaser: он в логических координатах 1920×1080 и масштабируется вместе с canvas.

const GEAR = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M19.14 12.94a7.5 7.5 0 0 0 .06-.94 7.5 7.5 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7 7 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7 7 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.63 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.5 7.5 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.5.39 1.05.7 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54a7 7 0 0 0 1.63-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></svg>`;

export function initSettingsUi(game: Phaser.Game): void {
  const host = game.domContainer;
  if (!host || host.querySelector('.settings-root')) return;

  const root = document.createElement('div');
  root.className = 'settings-root';
  root.innerHTML = `
    <button class="settings-gear" type="button" title="Настройки" aria-label="Настройки">${GEAR}</button>
    <div class="settings-backdrop" hidden>
      <div class="settings-panel" role="dialog" aria-modal="true" aria-label="Настройки">
        <div class="settings-title">Настройки</div>
        <label class="settings-row">
          <span class="settings-label">Звук выстрелов</span>
          <input type="range" min="0" max="100" step="1" data-key="sfx">
          <span class="settings-value"></span>
        </label>
        <label class="settings-row">
          <span class="settings-label">Музыка<small class="settings-note">трек ещё не добавлен</small></span>
          <input type="range" min="0" max="100" step="1" data-key="music">
          <span class="settings-value"></span>
        </label>
        <button class="settings-done" type="button">Готово</button>
      </div>
    </div>`;
  host.append(root);

  const gear = root.querySelector('.settings-gear') as HTMLButtonElement;
  const backdrop = root.querySelector('.settings-backdrop') as HTMLDivElement;
  const panel = root.querySelector('.settings-panel') as HTMLDivElement;
  const note = root.querySelector('.settings-note') as HTMLElement;
  const isOpen = () => !backdrop.hidden;

  const sliders = [...root.querySelectorAll<HTMLInputElement>('input[type=range]')];
  const show = (input: HTMLInputElement) => {
    (input.nextElementSibling as HTMLElement).textContent = `${input.value}%`;
    input.style.setProperty('--fill', `${input.value}%`);
  };

  // Пробный выстрел оружием текущей героини (в меню — винтовка), чтобы услышать новую громкость.
  const preview = () => {
    const active = game.scene.getScenes(true);
    const scene = active[active.length - 1];
    const heroine = ctx.run ? ctx.balance.heroines[ctx.run.heroineId] : undefined;
    if (scene) playSound(scene, `fire_${heroine?.weapon ?? 'rifle'}`);
  };

  for (const input of sliders) {
    const key = input.dataset.key as keyof Settings;
    input.addEventListener('input', () => { show(input); setSetting(key, Number(input.value) / 100, false); });
    input.addEventListener('change', () => {
      setSetting(key, Number(input.value) / 100);
      if (key === 'sfx') preview();
    });
  }

  const open = () => {
    for (const input of sliders) {
      input.value = String(Math.round(settings[input.dataset.key as keyof Settings] * 100));
      show(input);
    }
    note.hidden = hasMusic();
    backdrop.hidden = false;
    emitSettingsOpen();
  };
  const close = () => {
    backdrop.hidden = true;
    (document.activeElement as HTMLElement | null)?.blur();
  };

  gear.addEventListener('click', () => (isOpen() ? close() : open()));
  root.querySelector('.settings-done')!.addEventListener('click', close);
  backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) close(); });

  // Окно модальное: клавиши не доходят до игры. Esc закрывает окно, а не открывает меню сцены.
  // Слушатель на фазе захвата срабатывает раньше клавиатуры Phaser на window.
  window.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.code === 'Escape') { close(); e.stopImmediatePropagation(); return; }
    if (!panel.contains(e.target as Node)) e.stopImmediatePropagation();
  }, true);
  // Стрелки на ползунке меняют громкость, но в игру не уходят.
  panel.addEventListener('keydown', (e) => e.stopPropagation());
  // Кнопка не держит фокус: иначе пробел в игре снова нажимал бы её.
  gear.addEventListener('mouseup', () => gear.blur());

  // Phaser слушает mouseup/touchend на window: отпускание над ползунком засчитывалось бы кликом
  // по карточке под окном. Нажатие, начатое в настройках, до игры не доходит целиком.
  let pressedInside = false;
  for (const type of ['mousedown', 'touchstart'] as const) {
    root.addEventListener(type, (e) => { pressedInside = true; e.stopPropagation(); });
  }
  for (const type of ['mouseup', 'touchend'] as const) {
    window.addEventListener(type, (e) => {
      if (!pressedInside) return;
      if (type === 'mouseup' || (e as TouchEvent).touches.length === 0) pressedInside = false;
      e.stopImmediatePropagation();
    }, true);
  }
}
