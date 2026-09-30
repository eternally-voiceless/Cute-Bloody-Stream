import Phaser from 'phaser';

const NICK_COLORS = ['#ff6fb1', '#7fe7ff', '#ffd23f', '#9dff8a', '#c9a0ff', '#ff9f5a', '#6fb1ff', '#ff5a7a'];

function nickColor(nick: string): string {
  let h = 0;
  for (let i = 0; i < nick.length; i++) h = (h * 31 + nick.charCodeAt(i)) | 0;
  return NICK_COLORS[Math.abs(h) % NICK_COLORS.length];
}

// DOM-панель чата поверх canvas (ТЗ, 2 и 12). Позиция в логических координатах 1920×1080.
export class ChatPanel {
  readonly dom: Phaser.GameObjects.DOMElement;
  private list: HTMLDivElement;
  private maxMessages: number;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, maxMessages: number, title = 'Чат стрима') {
    this.maxMessages = maxMessages;
    const root = document.createElement('div');
    root.className = 'chat';
    root.style.width = `${w}px`;
    root.style.height = `${h}px`;
    root.innerHTML = `<div class="chat-head"><span class="live-dot"></span>${title}</div><div class="chat-list"></div>`;
    this.list = root.querySelector('.chat-list') as HTMLDivElement;
    this.dom = scene.add.dom(x, y, root).setOrigin(0, 0).setScrollFactor(0).setDepth(1000);
  }

  add(nick: string, text: string, highlight = false): void {
    const row = document.createElement('div');
    row.className = highlight ? 'chat-msg hl' : 'chat-msg';
    const n = document.createElement('span');
    n.className = 'nick';
    n.style.color = nickColor(nick);
    n.textContent = nick;
    const t = document.createElement('span');
    t.textContent = ` ${text}`;
    row.append(n, t);
    this.list.append(row);
    while (this.list.children.length > this.maxMessages) this.list.firstElementChild?.remove();
    this.list.scrollTop = this.list.scrollHeight;
  }

  setVisible(v: boolean): void {
    this.dom.setVisible(v);
  }

  setAlpha(a: number): void {
    this.dom.setAlpha(a);
  }

  destroy(): void {
    this.dom.destroy();
  }
}
