import Phaser from 'phaser';
import { setupPwa } from './pwa';
import { BootScene } from './scenes/BootScene';
import { UIScene } from './scenes/UIScene';
import { WorldScene } from './scenes/WorldScene';
import { restoreBackup, saves } from './systems/SaveManager';

/**
 * O jogo usa Phaser.Scale.FIT com uma resolução interna que acompanha a
 * proporção da tela (px CSS × devicePixelRatio, limitado a 2). Assim o canvas
 * ocupa a tela inteira sem tarjas, nítido em telas retina, e o zoom da câmera
 * mantém a área de mundo visível (~20×12 tiles).
 */
function viewportSize() {
  const vv = window.visualViewport;
  const cssW = Math.max(320, Math.round(vv?.width ?? window.innerWidth));
  const cssH = Math.max(180, Math.round(vv?.height ?? window.innerHeight));
  const r = Math.min(window.devicePixelRatio || 1, 2);
  return { w: Math.round(cssW * r), h: Math.round(cssH * r), r };
}

// Um snapshot consolidado recupera chaves ausentes/corrompidas antes que cada
// sistema leia o seu save individual.
restoreBackup();
const size = viewportSize();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1e1a24',
  pixelArt: true,
  roundPixels: false,
  width: size.w,
  height: size.h,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { activePointers: 4 },
  // passo variável: um passo de física por quadro desenhado (telas de 120 Hz do iPhone
  // com física fixa em 60 Hz faziam o herói andar "aos trancos" contra a câmera)
  physics: { default: 'arcade', arcade: { debug: false, fixedStep: false } },
  fps: { target: 60 },
  render: { powerPreference: 'high-performance', antialias: false },
  scene: [BootScene, WorldScene, UIScene],
});
game.registry.set('uiScale', size.r);

// Rede de proteção: no Phaser, um erro dentro de um quadro impede o próximo de ser
// agendado e o jogo congela para sempre. Aqui o erro é engolido, o jogo segue e a
// mensagem aparece num canto (e fica salva) para dar para corrigir a causa.
const step = game.step.bind(game);
let lastErr = '';
game.step = (time: number, delta: number) => {
  try {
    step(time, delta);
  } catch (e) {
    const err = e as Error;
    const msg = `${err?.message ?? err} ${(err?.stack ?? '').split('\n')[1]?.trim() ?? ''}`;
    if (msg !== lastErr) {
      lastErr = msg;
      console.error(err);
      try {
        localStorage.setItem('vaelmor.lastError', `${new Date().toISOString()} ${msg}`);
      } catch {
        /* sem espaço */
      }
      frameError(msg);
    }
  }
};
function frameError(msg: string) {
  let d = document.getElementById('frame-error');
  if (!d) {
    d = document.createElement('div');
    d.id = 'frame-error';
    d.style.cssText = 'position:fixed;left:6px;bottom:6px;max-width:60vw;padding:4px 6px;background:rgba(30,10,20,.8);color:#ff9a8a;font:10px monospace;z-index:98;pointer-events:none;border-radius:4px';
    document.body.appendChild(d);
  }
  d.textContent = `erro (o jogo seguiu): ${msg.slice(0, 220)}`;
  window.setTimeout(() => d?.remove(), 15000);
}

let resizeTimer = 0;
function onResize() {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    const s = viewportSize();
    game.registry.set('uiScale', s.r);
    if (s.w !== game.scale.width || s.h !== game.scale.height) game.scale.setGameSize(s.w, s.h);
    game.scale.refresh();
  }, 120);
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);
window.visualViewport?.addEventListener('resize', onResize);

setupPwa();

// Se algo quebrar enquanto o jogo abre, mostra o erro na tela (no iPhone não há
// console) em vez de ficar parado na tela de carregamento sem explicação.
let opened = false;
game.events.once('vaelmor-ready', () => {
  opened = true;
  saves.start();
});
function bootError(msg: string) {
  if (opened || document.getElementById('boot-error')) return;
  const d = document.createElement('div');
  d.id = 'boot-error';
  d.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;background:#1e1a24;color:#f3ead2;font:14px monospace;text-align:center;z-index:99';
  d.innerHTML = `<b style="color:#ffd77a">O jogo não conseguiu abrir</b><span style="opacity:.8;max-width:640px;word-break:break-word"></span><button style="font:inherit;padding:10px 18px;background:#3a6ea8;color:#fff;border:0;border-radius:6px">Tentar de novo</button>`;
  (d.querySelector('span') as HTMLElement).textContent = msg;
  (d.querySelector('button') as HTMLButtonElement).onclick = () => location.reload();
  document.body.appendChild(d);
}
window.addEventListener('error', (e) => bootError(String(e.message || e.error)));
window.addEventListener('unhandledrejection', (e) => bootError(String(e.reason)));
