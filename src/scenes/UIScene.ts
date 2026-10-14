import Phaser from 'phaser';
import { DEBUG, FORCE_TOUCH } from '../config';
import type { WeaponDef } from '../data/weapons';
import { OUTFITS, type OutfitId } from '../entities/heroSheets';
import { inputState } from '../input/InputState';
import { VirtualControls } from '../input/VirtualControls';
import type { ArmyMode, War } from '../systems/Army';
import type { Rank } from '../systems/Ranks';
import { ArmyPanel } from '../ui/ArmyPanel';
import { AttributesPanel } from '../ui/AttributesPanel';
import { DebugPanel } from '../ui/DebugPanel';
import { InventoryPanel } from '../ui/InventoryPanel';
import { Button, COLOR, drawBar, FONT, fit, frame, label, sizeFrame } from '../ui/kit';
import { MapPanel } from '../ui/MapPanel';
import { Minimap } from '../ui/Minimap';
import type { WorldScene } from './WorldScene';

type PanelId = 'bag' | 'attrs' | 'army' | 'map' | 'debug';

/**
 * HUD: à esquerda a insígnia da patente, a vida, a Glória e as ordens do
 * exército; à direita o minimapa, o relógio e o menu (mochila, patentes,
 * exército, mapa, debug). No centro, nomes de lugares e avisos.
 */
export class UIScene extends Phaser.Scene {
  private controls!: VirtualControls;
  private world!: WorldScene;
  private panels!: Record<PanelId, { open: boolean; setOpen: (on: boolean) => void; toggle: () => void; contains: (x: number, y: number) => boolean }>;
  private bag!: InventoryPanel;
  private attrs!: AttributesPanel;
  private armyPanel!: ArmyPanel;
  private mapPanel!: MapPanel;
  private debug!: DebugPanel;
  private minimap!: Minimap;
  // HUD
  private badge!: Phaser.GameObjects.NineSlice;
  private insignia!: Phaser.GameObjects.Image;
  private hpBar!: Phaser.GameObjects.Graphics;
  private heart!: Phaser.GameObjects.Image;
  private hpText!: Phaser.GameObjects.Text;
  private gloryIcon!: Phaser.GameObjects.Image;
  private gloryText!: Phaser.GameObjects.Text;
  private rankText!: Phaser.GameObjects.Text;
  private armyText!: Phaser.GameObjects.Text;
  private orders: { mode: ArmyMode | 'camp'; b: Button }[] = [];
  private menu: { id: PanelId; b: Button }[] = [];
  private pointsBadge!: Phaser.GameObjects.Text;
  private clock!: Phaser.GameObjects.Text;
  private areaText!: Phaser.GameObjects.Text;
  private areaSub!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private fps?: Phaser.GameObjects.Text;
  private version!: Phaser.GameObjects.Text;
  private u = 1;
  private hpX = 0;
  private hpY = 0;
  private hpW = 0;
  private hpH = 0;
  private lastHp = -1;
  private lastMax = -1;
  private lastHud = 0;
  private hudBottom = 0;

  constructor() {
    super('UI');
  }

  create() {
    const touch = this.sys.game.device.input.touch || FORCE_TOUCH;
    const world = (this.world = this.scene.get('World') as WorldScene);
    this.controls = new VirtualControls(this, touch);

    // --- esquerda: insígnia, vida, glória, patente, exército
    this.badge = frame(this, 'frame').setDepth(1400);
    this.insignia = this.add.image(0, 0, 'rank-icons', 0).setDepth(1401);
    this.hpBar = this.add.graphics().setDepth(1400);
    this.heart = this.add.image(0, 0, 'ui-menu', 14).setDepth(1402);
    this.hpText = label(this, '', 10).setOrigin(0.5).setDepth(1402);
    this.gloryIcon = this.add.image(0, 0, 'ui-menu', 6).setDepth(1401);
    this.gloryText = label(this, '', 11, COLOR.gold).setOrigin(0, 0.5).setDepth(1401);
    this.rankText = label(this, '', 10, COLOR.blue).setOrigin(0, 0.5).setDepth(1401);
    this.armyText = label(this, '', 10, COLOR.text).setOrigin(0, 0.5).setDepth(1401);
    const army = world.army;
    const orderDefs: [ArmyMode | 'camp', number][] = [
      ['follow', 7],
      ['attack', 8],
      ['hold', 9],
      ['camp', 10],
    ];
    for (const [mode, icon] of orderDefs) {
      const b = new Button(this, {
        icon,
        color: 'dark',
        onTap: () => {
          if (mode !== 'camp') return army.setMode(mode);
          // aquartelar (andar sozinho) / convocar o exército
          if (army.garrison.length) this.showToast(`${army.summon()} soldados convocados: chegam marchando`);
          else if (army.war) this.showToast('Não dá para aquartelar no meio de uma guerra');
          else if (army.quarter()) this.showToast('Exército aquartelado em Brumavale · você segue sozinho');
          this.updateHud();
        },
      }).setDepth(1400);
      this.orders.push({ mode, b });
    }

    // --- direita: minimapa, relógio e menu
    this.minimap = new Minimap(this, world);
    this.minimap.onTap = () => this.togglePanel('map');
    this.clock = label(this, '', 10, COLOR.text).setOrigin(1, 0).setDepth(1401);
    const menuDefs: [PanelId, number, 'dark' | 'red'][] = [
      ['bag', 0, 'dark'],
      ['attrs', 1, 'dark'],
      ['army', 2, 'dark'],
      ['map', 3, 'dark'],
      ['debug', 4, 'red'],
    ];
    for (const [id, icon, color] of menuDefs) this.menu.push({ id, b: new Button(this, { icon, color, onTap: () => this.togglePanel(id) }).setDepth(1400) });
    this.pointsBadge = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '9px', fontStyle: 'bold', color: COLOR.ink }).setOrigin(0.5).setDepth(1405).setBackgroundColor('#ffd77a');

    // --- centro
    this.areaText = label(this, '', 22, COLOR.gold).setOrigin(0.5).setAlpha(0).setDepth(1500);
    this.areaSub = label(this, '', 12, COLOR.text).setOrigin(0.5).setAlpha(0).setDepth(1500);
    this.toast = label(this, '', 13, COLOR.text).setOrigin(0.5).setAlpha(0).setDepth(1500);
    // versão (commit) — confere se o PWA pegou a atualização
    this.version = label(this, `v ${__BUILD_ID__}`, 8, COLOR.dim, 1, false).setOrigin(0.5, 0).setAlpha(0.6);
    if (DEBUG) this.fps = label(this, '', 9, COLOR.dim, 1, false).setOrigin(0.5, 0);

    // --- painéis
    this.bag = new InventoryPanel(this, world.inventory);
    this.attrs = new AttributesPanel(this, world);
    this.armyPanel = new ArmyPanel(this, world);
    this.mapPanel = new MapPanel(this, world);
    this.debug = new DebugPanel(this, world);
    this.debug.onMap = () => {
      this.closePanels();
      this.mapPanel.setOpen(true, true);
    };
    this.panels = { bag: this.bag, attrs: this.attrs, army: this.armyPanel, map: this.mapPanel, debug: this.debug };
    this.controls.blocker = (x, y) =>
      Object.values(this.panels).some((p) => p.open && p.contains(x, y)) ||
      this.minimap.contains(x, y) ||
      [...this.menu.map((m) => m.b), ...this.orders.map((o) => o.b)].some((b) => b.contains(x, y));

    // --- eventos do mundo
    army.on('mode', () => this.updateHud());
    army.on('change', () => this.updateHud());
    army.on('war', (w: War) => this.showArea('GUERRA!', `${w.house} marcha com ${w.start} soldados`));
    army.on('war-end', (w: War & { won: boolean; glory: number }) => {
      if (w.won) this.showArea('VITÓRIA', `${w.killed} inimigos derrotados · ${w.lost} baixas · +${w.glory} de glória`);
      else this.showArea('DERROTA', `${w.house} venceu · ${w.lost} baixas · ${w.glory} de glória`);
      this.updateHud();
    });
    world.progress.on('rank', (r: Rank) => this.showArea(r.name, `nova patente · você comanda até ${r.army} soldados`));
    world.progress.on('change', () => this.updateHud());
    world.events.on('toast', (msg: string) => this.showToast(msg));
    world.events.on('area', (name: string, sub?: string) => this.showArea(name, sub));
    world.events.on('player-died', () => this.showToast('Teren caiu... retornando a Brumavale'));
    const onWeapon = (w: WeaponDef) => {
      this.controls.setButton('attack', w.attackLabel, w.attackIcon);
      (['flame', 'skill2', 'skill3'] as const).forEach((id, i) => this.controls.setButton(id, w.skills[i].label, w.skills[i].icon));
    };
    world.events.on('weapon', (w: WeaponDef) => {
      onWeapon(w);
      this.showToast(`Agora você é ${w.className} (${w.name})`);
    });
    onWeapon(world.player.weapon);
    world.events.on('outfit', (id: OutfitId) => this.showToast(`Vestiu: ${OUTFITS[id].name}`));

    // --- teclado: B mochila · C patentes · G exército · M mapa · 1/2/3/4 ordens
    const kb = this.input.keyboard;
    const K = Phaser.Input.Keyboard.KeyCodes;
    kb?.addKey(K.B).on('down', () => this.togglePanel('bag'));
    kb?.addKey(K.C).on('down', () => this.togglePanel('attrs'));
    kb?.addKey(K.G).on('down', () => this.togglePanel('army'));
    kb?.addKey(K.M).on('down', () => this.togglePanel('map'));
    kb?.addKey(K.ONE).on('down', () => army.setMode('follow'));
    kb?.addKey(K.TWO).on('down', () => army.setMode('attack'));
    kb?.addKey(K.THREE).on('down', () => army.setMode('hold'));
    kb?.addKey(K.FOUR).on('down', () => this.orders[3].b.bg.emit('pointerdown', null, 0, 0, null));

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    this.time.delayedCall(600, () => this.showArea('Brumavale', 'Capital de Greenland'));
    if (!touch) this.time.delayedCall(2600, () => this.showToast('WASD mover · J golpe · K esquiva · L/U/I habilidades · B C G M menus · 1–4 ordens', 4600));
  }

  /** Um painel por vez. */
  private togglePanel(which: PanelId) {
    const p = this.panels[which];
    const was = p.open;
    this.closePanels();
    if (!was) p.setOpen(true);
  }

  private closePanels() {
    for (const p of Object.values(this.panels)) if (p.open) p.setOpen(false);
  }

  /** Fator px do jogo / px CSS, definido em main.ts. */
  private get uiScale(): number {
    return (this.registry.get('uiScale') as number) || 1;
  }

  private layout() {
    const { width, height } = this.scale;
    this.cameras.main.setSize(width, height);
    const u = (this.u = this.uiScale);
    const m = 10 * u;
    // --- esquerda
    const bs = 44 * u;
    sizeFrame(this.badge, m, m, bs, bs, u);
    this.insignia.setScale(Math.max(2, Math.round(2.6 * u))).setPosition(m + this.badge.displayWidth / 2, m + this.badge.displayHeight / 2);
    this.hpX = m + this.badge.displayWidth + 12 * u;
    this.hpY = m + 4 * u;
    this.hpW = Math.min(170 * u, width * 0.24);
    this.hpH = 12 * u;
    this.heart.setScale(Math.max(1, Math.round(1.25 * u))).setPosition(this.hpX - 2 * u, this.hpY + this.hpH / 2);
    fit(this.hpText, 10, u).setPosition(this.hpX + this.hpW / 2, this.hpY + this.hpH / 2);
    const row2 = this.hpY + this.hpH + 13 * u;
    this.gloryIcon.setScale(Math.max(1, Math.round(u))).setPosition(this.hpX + 6 * u, row2);
    fit(this.gloryText, 11, u).setPosition(this.hpX + 16 * u, row2);
    fit(this.rankText, 10, u).setPosition(this.hpX, row2 + 15 * u);
    const oy = m + this.badge.displayHeight + 8 * u;
    fit(this.armyText, 10, u).setPosition(m, oy + 8 * u);
    let ox = m;
    for (const o of this.orders) {
      o.b.place(ox, oy + 18 * u, u, 34 * u, 30 * u);
      ox += o.b.w + 4 * u;
    }
    // --- direita
    const mw = Math.min(150 * u, width * 0.2);
    const mh = Math.round(mw * 0.72);
    const mx = width - m - mw;
    this.minimap.layout(u, mx, m, mw, mh);
    fit(this.clock, 10, u).setPosition(width - m, this.minimap.bottom + 2 * u);
    let bx = width - m;
    const by = this.clock.y + this.clock.height + 4 * u;
    for (const it of [...this.menu].reverse()) {
      it.b.place(bx - 34 * u, by, u, 34 * u, 30 * u);
      bx -= 34 * u + 4 * u;
    }
    this.pointsBadge.setFontSize(Math.round(10 * u)).setPadding(Math.round(3 * u), Math.round(1 * u), Math.round(3 * u), Math.round(1 * u));
    this.hudBottom = by + 30 * u;
    // --- centro
    fit(this.areaText, 22, u).setPosition(width / 2, height * 0.22);
    fit(this.areaSub, 12, u).setPosition(width / 2, height * 0.22 + 22 * u);
    fit(this.toast, 13, u).setPosition(width / 2, height * 0.34);
    fit(this.version, 8, u).setPosition(width / 2, 3 * u);
    this.fps && fit(this.fps, 9, u).setPosition(width / 2, 14 * u);
    // --- painéis e controles
    this.bag.layout(u);
    this.attrs.layout(u);
    this.armyPanel.layout(u);
    if (this.mapPanel.open) this.mapPanel.layout(u);
    else this.mapPanel.layout(u);
    this.debug.layout(u);
    this.controls.hudBottom = this.hudBottom - 20 * u;
    this.controls.layout(width, height, u);
    this.lastHp = -1;
    this.updateHud();
  }

  /** Patente, Glória, exército e ordens. */
  private updateHud() {
    const w = this.world;
    const P = w.progress;
    const a = w.army;
    this.insignia.setFrame(P.rankIdx);
    this.gloryText.setText(`${Math.round(P.glory).toLocaleString('pt-BR')}`);
    this.rankText.setText(P.rank.name);
    const field = a.size - a.garrison.length;
    const show = a.size > 0;
    this.armyText.setVisible(show).setText(
      a.garrison.length && !field ? `Exército aquartelado (${a.garrison.length})` : `Exército ${field}/${P.armyCap}${a.war ? ` · inimigos ${a.foes.length}` : ''}`,
    );
    for (const o of this.orders) {
      o.b.setVisible(show);
      if (o.mode === 'camp') o.b.setIcon(a.garrison.length ? 11 : 10).setColor(a.garrison.length ? 'gold' : 'dark');
      else o.b.setColor(o.mode === a.mode && field > 0 ? 'blue' : 'dark').setEnabled(field > 0);
    }
    // pontos de atributo para distribuir: selo dourado no botão de patentes
    const free = P.free;
    const pb = this.menu.find((m) => m.id === 'attrs')!.b;
    this.pointsBadge.setVisible(free > 0).setText(`+${free}`).setPosition(pb.x + pb.w - 2 * this.u, pb.y + 2 * this.u);
  }

  private showArea(name: string, sub = '') {
    this.areaText.setText(name).setAlpha(0);
    this.areaSub.setText(sub).setAlpha(0);
    this.tweens.killTweensOf([this.areaText, this.areaSub]);
    this.tweens.chain({
      targets: [this.areaText, this.areaSub],
      tweens: [
        { alpha: 1, duration: 500 },
        { alpha: 1, duration: 1700 },
        { alpha: 0, duration: 700 },
      ],
    });
  }

  private showToast(msg: string, hold = 2000) {
    this.toast.setText(msg).setAlpha(0);
    this.tweens.killTweensOf(this.toast);
    this.tweens.chain({
      targets: this.toast,
      tweens: [
        { alpha: 1, duration: 250 },
        { alpha: 1, duration: hold },
        { alpha: 0, duration: 600 },
      ],
    });
  }

  private drawHp() {
    const k = inputState.hp / Math.max(1, inputState.maxHp);
    const g = this.hpBar;
    g.clear();
    drawBar(g, this.hpX, this.hpY, this.hpW, this.hpH, k, k > 0.3 ? 0xd83c3c : 0xff7a3a, this.u);
    this.hpText.setText(`${inputState.hp}/${inputState.maxHp}`);
  }

  update() {
    if (inputState.hp !== this.lastHp || inputState.maxHp !== this.lastMax) {
      this.lastHp = inputState.hp;
      this.lastMax = inputState.maxHp;
      this.drawHp();
    }
    const now = this.time.now;
    this.clock.setText(`${this.registry.get('clock') ?? ''} · ${this.registry.get('weather') ?? ''}`);
    this.minimap.update(now);
    this.controls.update();
    this.debug.update();
    this.attrs.update(now);
    this.armyPanel.update(now);
    this.mapPanel.update(now);
    if (now - this.lastHud > 500) {
      this.lastHud = now;
      this.updateHud();
    }
    if (this.fps) {
      const w = this.world;
      this.fps.setText(`${Math.round(this.game.loop.actualFps)} fps · inimigos ${w.enemies.filter((e) => !e.dead).length} · soldados ${w.army.soldiers.length} · objs ${w.children.length}`);
    }
  }
}
