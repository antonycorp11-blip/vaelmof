import Phaser from 'phaser';
import { DEBUG, FORCE_TOUCH } from '../config';
import { MOUNTS } from '../data/mounts';
import type { WeaponDef } from '../data/weapons';
import { inputState } from '../input/InputState';
import { VirtualControls } from '../input/VirtualControls';
import { FORMATION_ORDER, FORMATIONS, type ArmyMode, type Formation, type War } from '../systems/Army';
import type { Rank } from '../systems/Ranks';
import { ArmyPanel } from '../ui/ArmyPanel';
import { ClanCreate } from '../ui/ClanCreate';
import { ClansPanel } from '../ui/ClansPanel';
import { HQPanel } from '../ui/HQPanel';
import { MarketPanel } from '../ui/MarketPanel';
import { StablePanel } from '../ui/StablePanel';
import { MissionsPanel } from '../ui/MissionsPanel';
import type { Mission } from '../systems/Missions';
import type { Clan } from '../systems/Clans';
import { ITEMS, type ItemDef } from '../data/items';
import type { Rarity } from '../data/gear';
import { AttributesPanel } from '../ui/AttributesPanel';
import { DebugPanel } from '../ui/DebugPanel';
import { InventoryPanel } from '../ui/InventoryPanel';
import { Button, COLOR, Crest, drawBar, FONT, fit, frame, label, sizeFrame } from '../ui/kit';
import { Dialog, type DialogSpec } from '../ui/Dialog';
import { MapPanel } from '../ui/MapPanel';
import { Minimap } from '../ui/Minimap';
import { MountReveal } from '../ui/MountReveal';
import type { WorldScene } from './WorldScene';

type PanelId = 'bag' | 'attrs' | 'army' | 'hq' | 'market' | 'stable' | 'missions' | 'clans' | 'map' | 'debug';

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
  private missionsPanel!: MissionsPanel;
  private clansPanel!: ClansPanel;
  private hqPanel!: HQPanel;
  private marketPanel!: MarketPanel;
  private stablePanel!: StablePanel;
  private rideBtn!: Button;
  private goldIcon!: Phaser.GameObjects.Image;
  private goldText!: Phaser.GameObjects.Text;
  private clanCreate!: ClanCreate;
  private crest!: Crest;
  private missionText!: Phaser.GameObjects.Text;
  private objText!: Phaser.GameObjects.Text;
  private objAt = 0;
  private news!: Phaser.GameObjects.Text;
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
  private formBtn!: Button;
  private menu: { id: PanelId; b: Button }[] = [];
  private pointsBadge!: Phaser.GameObjects.Text;
  /** Selo NOVA no estábulo (montaria ganha e ainda não vista). */
  private stableBadge!: Phaser.GameObjects.Text;
  private reveal!: MountReveal;
  private dialog!: Dialog;
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
  private menuBar!: Phaser.GameObjects.NineSlice;

  constructor() {
    super('UI');
  }

  create() {
    const touch = this.sys.game.device.input.touch || FORCE_TOUCH;
    const world = (this.world = this.scene.get('World') as WorldScene);
    this.controls = new VirtualControls(this, touch);

    // --- esquerda: insígnia, vida, glória, patente, exército
    this.badge = frame(this, 'frame').setDepth(1400);
    this.crest = new Crest(this).setDepth(1401);
    this.insignia = this.add.image(0, 0, 'rank-icons', 0).setDepth(1403);
    this.hpBar = this.add.graphics().setDepth(1400);
    this.heart = this.add.image(0, 0, 'ui-menu', 14).setDepth(1402);
    this.hpText = label(this, '', 10).setOrigin(0.5).setDepth(1402);
    this.gloryIcon = this.add.image(0, 0, 'ui-menu', 6).setDepth(1401);
    this.gloryText = label(this, '', 11, COLOR.gold).setOrigin(0, 0.5).setDepth(1401);
    this.rankText = label(this, '', 10, COLOR.blue).setOrigin(0, 0.5).setDepth(1401);
    this.goldIcon = this.add.image(0, 0, 'ui-menu', 22).setDepth(1401);
    this.goldText = label(this, '', 11, COLOR.gold).setOrigin(0, 0.5).setDepth(1401);
    this.armyText = label(this, '', 10, COLOR.text).setOrigin(0, 0.5).setDepth(1401);
    this.missionText = label(this, '', 9, COLOR.text, 1, false).setDepth(1401).setLineSpacing(2);
    this.objText = label(this, '', 9, COLOR.gold).setDepth(1401);
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
          else if (army.quarter()) this.showToast(`Exército aquartelado ${world.hq.founded ? 'na sede' : 'em Brumavale'} · você segue sozinho`);
          this.updateHud();
        },
      }).setDepth(1400);
      this.orders.push({ mode, b });
    }

    // formação: toque troca (linha → cunha → flancos → anel)
    this.formBtn = new Button(this, {
      label: FORMATIONS[army.formation].name,
      color: 'dark',
      size: 8,
      onTap: () => {
        const i = FORMATION_ORDER.indexOf(army.formation);
        const f = FORMATION_ORDER[(i + 1) % FORMATION_ORDER.length];
        army.setFormation(f);
        this.formBtn.setLabel(FORMATIONS[f].name);
        this.showToast(`Formação ${FORMATIONS[f].name}: ${FORMATIONS[f].desc}`, 3200);
        this.layout();
      },
    }).setDepth(1400);
    army.on('formation', (f: Formation) => this.formBtn.setLabel(FORMATIONS[f].name));

    // montar / desmontar (sempre à mão)
    this.rideBtn = new Button(this, {
      icon: 26,
      color: 'dark',
      onTap: () => {
        const why = world.stable.toggle();
        if (why) this.showToast(why, 3000);
        this.updateHud();
      },
    }).setDepth(1400);
    world.stable.on('change', () => this.updateHud());
    world.stable.on('born', (id: string) => this.showArea('NASCEU UM FILHOTE!', `${MOUNTS[id]?.name ?? ''} · no estábulo, pronto para montar ou virar cavaleiro`));

    // --- direita: minimapa, relógio e menu
    this.minimap = new Minimap(this, world);
    this.minimap.onTap = () => this.togglePanel('map');
    this.clock = label(this, '', 10, COLOR.text).setOrigin(1, 0).setDepth(1401);
    const menuDefs: [PanelId, number, 'dark' | 'red'][] = [
      ['bag', 0, 'dark'],
      ['attrs', 1, 'dark'],
      ['army', 2, 'dark'],
      ['hq', 23, 'dark'],
      ['market', 22, 'dark'],
      ['stable', 26, 'dark'],
      ['missions', 18, 'dark'],
      ['clans', 19, 'dark'],
      ['map', 3, 'dark'],
      ['debug', 4, 'red'],
    ];
    this.menuBar = frame(this, 'frame').setDepth(1399);
    for (const [id, icon, color] of menuDefs) this.menu.push({ id, b: new Button(this, { icon, color, onTap: () => this.togglePanel(id) }).setDepth(1400) });
    this.stableBadge = this.add.text(0, 0, 'NOVA', { fontFamily: FONT, fontSize: '9px', fontStyle: 'bold', color: COLOR.ink }).setOrigin(0.5).setDepth(1405).setBackgroundColor('#9cff8a').setVisible(false);
    this.pointsBadge = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '9px', fontStyle: 'bold', color: COLOR.ink }).setOrigin(0.5).setDepth(1405).setBackgroundColor('#ffd77a');

    // --- centro
    this.areaText = label(this, '', 22, COLOR.gold).setOrigin(0.5).setAlpha(0).setDepth(1500);
    this.areaSub = label(this, '', 12, COLOR.text).setOrigin(0.5).setAlpha(0).setDepth(1500);
    this.toast = label(this, '', 13, COLOR.text).setOrigin(0.5).setAlpha(0).setDepth(1500);
    // versão (commit) — confere se o PWA pegou a atualização
    this.version = label(this, `v ${__BUILD_ID__}`, 8, COLOR.dim, 1, false).setOrigin(0.5, 0).setAlpha(0.6);
    if (DEBUG) this.fps = label(this, '', 9, COLOR.dim, 1, false).setOrigin(0.5, 0);
    // crônica do mundo: uma linha discreta no alto
    this.news = label(this, '', 9, COLOR.dim, 1, false).setOrigin(0.5, 0).setAlpha(0).setDepth(1500);

    // --- painéis
    this.bag = new InventoryPanel(this, world.inventory);
    this.bag.market = world.market;
    this.attrs = new AttributesPanel(this, world);
    this.armyPanel = new ArmyPanel(this, world);
    this.mapPanel = new MapPanel(this, world);
    this.debug = new DebugPanel(this, world);
    this.debug.onMap = () => {
      this.closePanels();
      this.mapPanel.setOpen(true, true);
    };
    this.missionsPanel = new MissionsPanel(this, world);
    this.clansPanel = new ClansPanel(this, world);
    this.clansPanel.onMap = () => this.togglePanel('map');
    this.hqPanel = new HQPanel(this, world);
    this.marketPanel = new MarketPanel(this, world);
    this.stablePanel = new StablePanel(this, world);
    this.clanCreate = new ClanCreate(this, world);
    this.reveal = new MountReveal(this, world);
    this.dialog = new Dialog(this);
    world.events.on('dialog', (spec: DialogSpec) => this.dialog.show(spec));
    world.stable.on('change', () => this.updateHud());
    this.armyPanel.onClans = () => this.togglePanel('clans');
    this.panels = { bag: this.bag, attrs: this.attrs, army: this.armyPanel, hq: this.hqPanel, market: this.marketPanel, stable: this.stablePanel, missions: this.missionsPanel, clans: this.clansPanel, map: this.mapPanel, debug: this.debug };
    this.controls.blocker = (x, y) =>
      this.clanCreate.open ||
      this.reveal.open ||
      this.dialog.open ||
      Object.values(this.panels).some((p) => p.open && p.contains(x, y)) ||
      this.minimap.contains(x, y) ||
      this.menuBar.getBounds().contains(x, y) ||
      [...this.menu.map((m) => m.b), ...this.orders.map((o) => o.b), this.rideBtn, this.formBtn].some((b) => b.contains(x, y));

    // --- eventos do mundo
    army.on('mode', () => this.updateHud());
    army.on('change', () => this.updateHud());
    army.on('war', (w: War) => !w.clan && this.showArea('GUERRA!', `${w.house} marcha com ${w.start} soldados`));
    army.on('war-end', (w: War & { won: boolean; glory: number; fled?: boolean; left?: number }) => {
      if (w.fled) {
        this.showArea('FUGA', `você escapou do ${w.house} · ${w.left ?? 0} soldados seguem pelo mapa`);
        this.updateHud();
        return;
      }
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
      this.lastAction = null;
      this.controls.setButton('attack', w.attackLabel, w.attackIcon);
      (['flame', 'skill2', 'skill3'] as const).forEach((id, i) => this.controls.setButton(id, w.skills[i].label, w.skills[i].icon));
    };
    // montado: a esquiva vira disparada (atropela quem estiver no caminho)
    world.events.on('mount', (def: unknown) => this.controls.setButton('dodge', def ? 'DISPARADA' : 'ESQUIVA', def ? 9 : 1));
    if (world.player.mount) this.controls.setButton('dodge', 'DISPARADA', 9);
    // ação de contexto (mercador…): o botão de golpe muda de nome e abre o painel
    world.events.on('action', (id: string) => {
      // fortes: atacar o rival ou deixar/chamar a guarda no seu
      if (id === 'fort-siege' || id === 'fort-guard') {
        const f = world.forts.fortAtGate();
        if (!f) return;
        const msg = id === 'fort-siege' ? world.forts.startSiege(f) : world.forts.toggleGuards(f);
        if (msg) this.showToast(msg);
        return;
      }
      const pid = id as PanelId;
      if (!this.panels[pid]?.open) this.togglePanel(pid);
    });
    world.events.on('weapon', (w: WeaponDef) => {
      onWeapon(w);
      this.showToast(`Agora você é ${w.className} (${w.name})`);
    });
    onWeapon(world.player.weapon);
    world.events.on('outfit', () => this.showToast(`Vestiu: ${ITEMS[world.inventory.gear.armor].name}`));
    // clãs, missões e saque
    world.clans.on('chronicle', (text: string, loud: boolean) => (loud ? this.showToast(text, 3600) : this.showNews(text)));
    world.clans.on('change', () => this.updateHud());
    world.clans.on('founded', (c: Clan) => {
      this.updateHud();
      this.showArea(c.name, `clã fundado em ${c.city} · rumo a virar Casa`);
    });
    world.missions.on('change', () => this.updateHud());
    world.hq.on('gold', () => this.updateHud());
    world.hq.on('change', () => this.updateHud());
    world.hq.on('fall', (name: string) => {
      this.closePanels();
      this.showArea('A SEDE CAIU', `${name} se desfez · soldados dispersos · Glória e atributos perdidos`);
    });
    world.clans.on('fallen', () => this.time.delayedCall(3500, () => this.clanCreate.setOpen(true)));
    world.missions.on('complete', (m: Mission) => this.showArea('MISSÃO CUMPRIDA', `${m.title} · +${m.reward} Glória · +${m.recruits} recrutas`));
    world.events.on('loot', (d: ItemDef, R: Rarity) => this.showToast(`Saque: ${d.name} (${R.name}) — veja na mochila`, 3000));

    // --- teclado: B mochila · C patentes · G exército · M mapa · 1/2/3/4 ordens
    const kb = this.input.keyboard;
    const K = Phaser.Input.Keyboard.KeyCodes;
    kb?.addKey(K.B).on('down', () => this.togglePanel('bag'));
    kb?.addKey(K.C).on('down', () => this.togglePanel('attrs'));
    kb?.addKey(K.G).on('down', () => this.togglePanel('army'));
    kb?.addKey(K.M).on('down', () => this.togglePanel('map'));
    kb?.addKey(K.T).on('down', () => this.togglePanel('missions'));
    kb?.addKey(K.H).on('down', () => this.togglePanel('hq'));
    kb?.addKey(K.V).on('down', () => this.togglePanel('market'));
    kb?.addKey(K.X).on('down', () => this.rideBtn.bg.emit('pointerdown', null, 0, 0, null));
    kb?.addKey(K.R).on('down', () => this.togglePanel('clans'));
    kb?.addKey(K.ONE).on('down', () => army.setMode('follow'));
    kb?.addKey(K.TWO).on('down', () => army.setMode('attack'));
    kb?.addKey(K.THREE).on('down', () => army.setMode('hold'));
    kb?.addKey(K.FOUR).on('down', () => this.orders[3].b.bg.emit('pointerdown', null, 0, 0, null));

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    // de volta ao jogo: o que a sede produziu enquanto isso
    if (world.hq.awayMin > 0) this.time.delayedCall(3200, () => this.showToast(`Fora por ${world.hq.awayMin} min: os coletores encheram o estoque da sede`, 3600));
    // começo do jogo: fundar o clã
    if (!world.clans.founded) this.clanCreate.setOpen(true);
    else this.time.delayedCall(600, () => this.showArea('Brumavale', 'Capital de Greenland'));
    if (!touch) this.time.delayedCall(2600, () => this.showToast('WASD mover · J golpe · K esquiva · L/U/I habilidades · B C G M menus · 1–4 ordens', 4600));
  }

  private lastAction: typeof inputState.action = null;

  /** Um painel por vez. */
  private togglePanel(which: PanelId) {
    const p = this.panels[which];
    const was = p.open;
    this.closePanels();
    if (!was) p.setOpen(true);
    if (!was && which === 'stable') this.world.stable.markSeen();
  }

  private showNews(text: string) {
    this.news.setText(text).setAlpha(0);
    this.tweens.killTweensOf(this.news);
    this.tweens.chain({
      targets: this.news,
      tweens: [
        { alpha: 0.95, duration: 300 },
        { alpha: 0.95, duration: 4500 },
        { alpha: 0, duration: 800 },
      ],
    });
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
    this.crest.place(m + this.badge.displayWidth / 2, m + this.badge.displayHeight / 2 + u, Math.max(1, Math.round(1.6 * u)));
    // insígnia da patente no canto do brasão do clã
    this.insignia.setScale(Math.max(1, Math.round(1.4 * u))).setPosition(m + this.badge.displayWidth - 6 * u, m + this.badge.displayHeight - 6 * u);
    this.hpX = m + this.badge.displayWidth + 12 * u;
    this.hpY = m + 4 * u;
    this.hpW = Math.min(170 * u, width * 0.24);
    this.hpH = 12 * u;
    this.heart.setScale(Math.max(1, Math.round(1.25 * u))).setPosition(this.hpX - 2 * u, this.hpY + this.hpH / 2);
    fit(this.hpText, 10, u).setPosition(this.hpX + this.hpW / 2, this.hpY + this.hpH / 2);
    const row2 = this.hpY + this.hpH + 13 * u;
    this.gloryIcon.setScale(Math.max(1, Math.round(u))).setPosition(this.hpX + 6 * u, row2);
    fit(this.gloryText, 11, u).setPosition(this.hpX + 16 * u, row2);
    this.goldIcon.setScale(Math.max(1, Math.round(u))).setPosition(this.hpX + 86 * u, row2);
    fit(this.goldText, 11, u).setPosition(this.hpX + 96 * u, row2);
    fit(this.rankText, 10, u).setPosition(this.hpX, row2 + 15 * u);
    const oy = m + this.badge.displayHeight + 8 * u;
    fit(this.armyText, 10, u).setPosition(m, oy + 8 * u);
    // montar fica sempre no começo da fileira; as ordens do exército vêm depois
    this.rideBtn.place(m, oy + 18 * u, u, 34 * u, 30 * u);
    let ox = m + 38 * u;
    for (const o of this.orders) {
      o.b.place(ox, oy + 18 * u, u, 34 * u, 30 * u);
      ox += o.b.w + 4 * u;
    }
    this.formBtn.place(ox, oy + 18 * u, u, undefined, 30 * u);
    fit(this.missionText, 9, u).setPosition(m, oy + 54 * u);
    fit(this.objText, 9, u).setPosition(m, oy + 54 * u);
    // --- direita
    // barra de menu no alto, numa moldura só; o minimapa logo abaixo
    const ms = 28 * u;
    const gap = 3 * u;
    const bp = 6 * u;
    const barW = this.menu.length * ms + (this.menu.length - 1) * gap + bp * 2;
    const barH = ms + bp * 2;
    sizeFrame(this.menuBar, width - m - barW, m, barW, barH, u);
    let bx = width - m - bp;
    for (const it of [...this.menu].reverse()) {
      it.b.place(bx - ms, m + bp, u, ms, ms);
      bx -= ms + gap;
    }
    this.stableBadge.setFontSize(Math.round(9 * u)).setPadding(Math.round(3 * u), Math.round(1 * u), Math.round(3 * u), Math.round(1 * u));
    this.reveal.layout(u);
    this.dialog.layout(u);
    this.pointsBadge.setFontSize(Math.round(10 * u)).setPadding(Math.round(3 * u), Math.round(1 * u), Math.round(3 * u), Math.round(1 * u));
    const mw = Math.min(150 * u, width * 0.2);
    const mh = Math.round(mw * 0.72);
    this.minimap.layout(u, width - m - mw, m + this.menuBar.displayHeight + 4 * u, mw, mh);
    fit(this.clock, 10, u).setPosition(width - m, this.minimap.bottom + 2 * u);
    this.hudBottom = this.clock.y + this.clock.height;
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
    this.missionsPanel.layout(u);
    this.clansPanel.layout(u);
    this.hqPanel.layout(u);
    this.marketPanel.layout(u);
    this.stablePanel.layout(u);
    this.clanCreate.layout(u);
    fit(this.news, 9, u).setPosition(width / 2, 26 * u).setWordWrapWidth(width * 0.5);
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
    this.rideBtn.setColor(w.stable.riding ? 'gold' : 'dark');
    const clan = w.clans.player;
    this.crest.set(clan.crest, clan.color);
    const ms = w.missions.active;
    this.missionText.setText(ms.map((mm) => `> ${w.missions.summary(mm)}`).join('\n'));
    this.gloryText.setText(`${Math.round(P.glory).toLocaleString('pt-BR')}`);
    this.goldText.setText(`${w.hq.gold.toLocaleString('pt-BR')}`);
    this.rankText.setText(P.rank.name);
    const field = a.size - a.garrison.length;
    const show = a.size > 0;
    this.armyText.setVisible(show).setText(
      a.garrison.length && !field ? `Exército aquartelado (${a.garrison.length})` : `Exército ${field}/${P.armyCap}${a.war ? ` · inimigos ${a.foes.length}` : ''}`,
    );
    this.formBtn.setVisible(show && field > 1);
    for (const o of this.orders) {
      o.b.setVisible(show);
      if (o.mode === 'camp') o.b.setIcon(a.garrison.length ? 11 : 10).setColor(a.garrison.length ? 'gold' : 'dark');
      else o.b.setColor(o.mode === a.mode && field > 0 ? 'blue' : 'dark').setEnabled(field > 0);
    }
    // pontos de atributo para distribuir: selo dourado no botão de patentes
    const free = P.free;
    const pb = this.menu.find((m) => m.id === 'attrs')!.b;
    this.pointsBadge.setVisible(free > 0).setText(`+${free}`).setPosition(pb.x + pb.w - 2 * this.u, pb.y + 2 * this.u);
    const sb = this.menu.find((m) => m.id === 'stable')!.b;
    this.stableBadge.setVisible(w.stable.unseen.size > 0).setPosition(sb.x + sb.w - 4 * this.u, sb.y + 2 * this.u);
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
    this.reveal.update(now);
    this.dialog.update();
    this.clock.setText(`${this.registry.get('clock') ?? ''} · ${this.registry.get('weather') ?? ''}`);
    this.minimap.update(now);
    // botão de golpe ↔ ação de contexto (COMPRAR perto do mercador…)
    const act = inputState.action;
    if (act !== this.lastAction) {
      this.lastAction = act;
      const w = this.world.player.weapon;
      if (act) this.controls.setButton('attack', act.label, act.icon);
      else this.controls.setButton('attack', w.attackLabel, w.attackIcon);
    }
    this.controls.update();
    this.debug.update();
    this.attrs.update(now);
    this.armyPanel.update(now);
    this.missionsPanel.update(now);
    this.clansPanel.update(now);
    this.hqPanel.update(now);
    this.marketPanel.update(now);
    this.stablePanel.update(now);
    // alvo mais perto: nome, distância e direção (vai embaixo das missões)
    if (now - this.objAt > 500) {
      this.objAt = now;
      const p = this.world.player;
      const objs = this.world.objectives().map((o) => ({ ...o, d: Math.hypot(o.x - p.x, o.y - p.y) })).sort((a, b) => a.d - b.d);
      const o = objs[0];
      if (o) {
        const a = Math.atan2(o.y - p.y, o.x - p.x);
        const dirs = ['leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste', 'norte', 'nordeste'];
        const dir = dirs[(Math.round(a / (Math.PI / 4)) + 8) % 8];
        this.objText.setText(`* ${o.name} · ${Math.round(o.d / 16)} tiles a ${dir}`).setVisible(true);
      } else this.objText.setVisible(false);
      this.objText.setY(this.missionText.y + (this.missionText.text ? this.missionText.height + 2 * this.u : 0));
    }
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
