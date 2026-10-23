import Phaser from 'phaser';
import type { WorldScene } from '../scenes/WorldScene';
import { saves } from '../systems/SaveManager';
import { Button, Window } from './kit';

/** Preferências, acessibilidade e backup acessíveis dentro do jogo. */
export class SettingsPanel {
  private win: Window;
  private music: Button;
  private sfx: Button;
  private motion: Button;
  private quality: Button;
  private exportBtn: Button;
  private importBtn: Button;
  private u = 1;

  constructor(
    scene: Phaser.Scene,
    private world: WorldScene,
  ) {
    this.win = new Window(scene, 'CONFIGURAÇÕES', 13, () => this.setOpen(false));
    this.win.sub.setText('áudio, acessibilidade e save');
    this.music = new Button(scene, { label: 'MÚSICA', color: 'dark', size: 11, onTap: () => this.flip('music') }).addTo(this.win.root);
    this.sfx = new Button(scene, { label: 'EFEITOS', color: 'dark', size: 11, onTap: () => this.flip('sfx') }).addTo(this.win.root);
    this.motion = new Button(scene, { label: 'TREMOR', color: 'dark', size: 11, onTap: () => this.flip('reducedMotion') }).addTo(this.win.root);
    this.quality = new Button(scene, { label: 'GRÁFICOS', color: 'dark', size: 11, onTap: () => this.flip('quality') }).addTo(this.win.root);
    this.exportBtn = new Button(scene, {
      label: 'EXPORTAR SAVE', color: 'blue', size: 11, onTap: () => world.events.emit('toast', saves.exportFile() ? 'Backup baixado' : 'Não foi possível exportar'),
    }).addTo(this.win.root);
    this.importBtn = new Button(scene, {
      label: 'IMPORTAR SAVE', color: 'gold', size: 11, onTap: () => saves.importFile((ok) => ok ? location.reload() : world.events.emit('toast', 'Arquivo de save inválido')),
    }).addTo(this.win.root);
    this.refresh();
  }

  get open() { return this.win.open; }
  contains(x: number, y: number) { return this.win.contains(x, y); }
  toggle() { this.setOpen(!this.open); }
  setOpen(on: boolean) {
    this.win.setOpen(on);
    if (on) {
      this.refresh();
      this.layout(this.u);
    }
  }

  private flip(key: 'music' | 'sfx' | 'reducedMotion' | 'quality') {
    this.world.audio.toggle(key);
    this.world.audio.sfx('ui');
    this.refresh();
    this.layout(this.u);
  }

  private refresh() {
    const s = this.world.audio.settings;
    this.music.setLabel(`MÚSICA: ${s.music ? 'LIGADA' : 'DESLIGADA'}`).setColor(s.music ? 'green' : 'dark');
    this.sfx.setLabel(`EFEITOS: ${s.sfx ? 'LIGADOS' : 'DESLIGADOS'}`).setColor(s.sfx ? 'green' : 'dark');
    this.motion.setLabel(`TREMOR: ${s.reducedMotion ? 'REDUZIDO' : 'NORMAL'}`).setColor(s.reducedMotion ? 'green' : 'dark');
    this.quality.setLabel(`GRÁFICOS: ${s.quality === 'high' ? 'ALTOS' : 'LEVES'}`).setColor(s.quality === 'high' ? 'blue' : 'dark');
  }

  layout(u: number) {
    this.u = u;
    const { width, height } = this.win.root.scene.scale;
    this.win.place(u, Math.min(width * 0.92, 520 * u), Math.min(height * 0.9, 290 * u));
    const pad = this.win.pad;
    const top = this.win.head + pad / 2;
    const gap = 8 * u;
    const bw = (this.win.W - pad * 2 - gap) / 2;
    const bh = 42 * u;
    [this.music, this.sfx, this.motion, this.quality, this.exportBtn, this.importBtn].forEach((b, i) => b.place(pad + (i % 2) * (bw + gap), top + Math.floor(i / 2) * (bh + gap), u, bw, bh));
  }
}
