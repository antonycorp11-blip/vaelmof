import Phaser from 'phaser';
import { setupPwa } from './pwa';
import { BootScene } from './scenes/BootScene';
import { UIScene } from './scenes/UIScene';
import { WorldScene } from './scenes/WorldScene';

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
