import Phaser from 'phaser';

export const FONT = '"Segoe UI", Roboto, Arial, sans-serif';

export function text(
  scene: Phaser.Scene, x: number, y: number, str: string, size = 28, color = '#ffffff', style: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color, ...style });
}

export interface Button extends Phaser.GameObjects.Container {
  setEnabled(v: boolean): Button;
  setLabel(s: string): Button;
}

// Кнопка: скруглённый прямоугольник + текст, подсветка при наведении.
export function button(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number, label: string, onClick: () => void,
  opts: { color?: number; size?: number } = {},
): Button {
  const color = opts.color ?? 0xff3d7f;
  const c = scene.add.container(x, y) as Button;
  const bg = scene.add.graphics();
  const t = text(scene, 0, 0, label, opts.size ?? 30, '#ffffff', { fontStyle: 'bold', align: 'center' }).setOrigin(0.5);
  let enabled = true;
  let hover = false;
  const draw = () => {
    bg.clear();
    const fill = !enabled ? 0x3a3a46 : hover ? Phaser.Display.Color.IntegerToColor(color).lighten(12).color : color;
    bg.fillStyle(fill, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    bg.lineStyle(2, 0xffffff, enabled ? 0.35 : 0.1).strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    t.setAlpha(enabled ? 1 : 0.45);
  };
  c.add([bg, t]);
  c.setSize(w, h);
  c.setInteractive({ useHandCursor: true });
  c.on('pointerover', () => { hover = true; draw(); });
  c.on('pointerout', () => { hover = false; draw(); });
  c.on('pointerup', () => { if (enabled) onClick(); });
  c.setEnabled = (v: boolean) => { enabled = v; draw(); return c; };
  c.setLabel = (s: string) => { t.setText(s); return c; };
  draw();
  return c;
}

export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, alpha = 0.72): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x0c0a14, alpha).fillRoundedRect(x, y, w, h, 18);
  g.lineStyle(2, 0xffffff, 0.12).strokeRoundedRect(x, y, w, h, 18);
  return g;
}
