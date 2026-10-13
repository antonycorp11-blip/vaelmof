// Rampas de cor por material (escuro → claro), com variação de matiz:
// sombras mais frias/violetas, luzes mais quentes. Índice 5 (opcional) é o
// brilho especular de metais.
export const MATERIALS = {
  skin: { ramp: ['#4a2630', '#8a4a42', '#c07a5c', '#e6a982', '#f8d2ac'] },
  lips: { ramp: ['#4a2030', '#7a3436', '#a85448', '#c87060', '#e09078'], thin: true },
  eye: { ramp: ['#120e16', '#1a1420', '#241a28', '#2e2232', '#3a2c3e'], thin: true },
  sclera: { ramp: ['#8a8a9a', '#b8b8c4', '#dcdce4', '#f0f0f4', '#ffffff'] },
  hair: { ramp: ['#1e1014', '#3a1e18', '#5e3220', '#86502c', '#ad743e'] },
  linen: { ramp: ['#4a4038', '#7a6c5c', '#a89880', '#cdbfa4', '#ece0c6'] },
  tunic: { ramp: ['#102a34', '#1a4448', '#25645e', '#348a76', '#58b294'] },
  tunicTrim: { ramp: ['#3a2410', '#7a4e18', '#b07a22', '#d8a83a', '#f4d670'] },
  pants: { ramp: ['#141420', '#22223a', '#333352', '#4a4a70', '#666690'] },
  leather: { ramp: ['#1c100c', '#341e14', '#53321e', '#774c2a', '#9c6c3c'] },
  leatherDark: { ramp: ['#140c0a', '#26160f', '#3c2416', '#583620', '#784c2e'] },
  cape: { ramp: ['#24081a', '#4a1022', '#7a1c2e', '#a8303a', '#d0544a'] },
  capeInner: { ramp: ['#1a0612', '#360c1a', '#561424', '#76202e', '#963038'] },
  gold: { ramp: ['#3a2010', '#6e4416', '#a87420', '#dcaa3a', '#f8dc78'], spec: '#fff8d8', thin: true },
  steel: { ramp: ['#1a1e2a', '#353e50', '#5e6a7e', '#95a2b6', '#cfd9e6'], spec: '#ffffff', thin: true },
  gem: { ramp: ['#30040e', '#640a1c', '#a8122a', '#e83a44', '#ff9a9a'], spec: '#ffffff', thin: true },
  fire: { ramp: ['#8a1e10', '#d0481a', '#f08a26', '#ffc44a', '#fff2b0'], emissive: true, thin: true },
};

export const MAT_IDS = Object.keys(MATERIALS);
export const MAT_INDEX = Object.fromEntries(MAT_IDS.map((k, i) => [k, i]));

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const OUTLINE_BASE = hex('#140f1a');

/** Tabela [matId][shade 0..5] → [r,g,b]; shade 6 = cor de contorno. */
export const COLORS = MAT_IDS.map((k) => {
  const m = MATERIALS[k];
  const ramp = m.ramp.map(hex);
  const spec = hex(m.spec ?? m.ramp[4]);
  const o = ramp[0].map((v, i) => Math.round(v * 0.45 + OUTLINE_BASE[i] * 0.55));
  return [...ramp, spec, o];
});
export const THIN = MAT_IDS.map((k) => !!MATERIALS[k].thin);
export const EMISSIVE = MAT_IDS.map((k) => !!MATERIALS[k].emissive);
