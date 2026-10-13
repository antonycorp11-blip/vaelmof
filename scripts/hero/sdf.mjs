// Primitivas SDF (distância com sinal) usadas para modelar o herói.
// Todas vivem no "espaço do personagem": metros, y para cima, o personagem
// olha para +z (para a câmera) e a mão esquerda dele fica em +x.

export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  /** p + u*x + v*y + w*z em uma base ortonormal {u,v,w}. */
  inBasis: (p, B, x, y, z) => [
    p[0] + B[0][0] * x + B[1][0] * y + B[2][0] * z,
    p[1] + B[0][1] * x + B[1][1] * y + B[2][1] * z,
    p[2] + B[0][2] * x + B[1][2] * y + B[2][2] * z,
  ],
};

/** Base ortonormal a partir de um eixo "para cima" e um "para frente" aproximado. */
export function basis(up, fwd) {
  const y = v3.norm(up);
  let z = v3.sub(fwd, v3.mul(y, v3.dot(fwd, y)));
  if (v3.len(z) < 1e-5) z = Math.abs(y[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  z = v3.norm(z);
  const x = v3.cross(y, z);
  return [x, y, z];
}

/** Base com rotações de Euler (graus): yaw (y), pitch (x), roll (z). */
export function eulerBasis(yaw, pitch = 0, roll = 0) {
  const r = Math.PI / 180;
  const cy = Math.cos(yaw * r), sy = Math.sin(yaw * r);
  const cp = Math.cos(pitch * r), sp = Math.sin(pitch * r);
  const cr = Math.cos(roll * r), sr = Math.sin(roll * r);
  // R = Ry * Rx * Rz aplicado aos eixos canônicos
  const rot = (v) => {
    let [x, y, z] = v;
    [x, y] = [x * cr - y * sr, x * sr + y * cr];
    [y, z] = [y * cp - z * sp, y * sp + z * cp];
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    return [x, y, z];
  };
  return [rot([1, 0, 0]), rot([0, 1, 0]), rot([0, 0, 1])];
}

function bound(prim, c, r) {
  prim.bc = c;
  prim.br = r;
  return prim;
}

/** Cone arredondado entre a (raio r1) e b (raio r2) — membros. */
export function roundCone(a, b, r1, r2, mat, extra = {}) {
  const [ax, ay, az] = a;
  const bax = b[0] - ax, bay = b[1] - ay, baz = b[2] - az;
  const l2 = bax * bax + bay * bay + baz * baz || 1e-8;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const L = Math.sqrt(l2);
  const prim = {
    kind: 'cone',
    mat,
    ...extra,
    a,
    b,
    d(x, y, z) {
      const pax = x - ax, pay = y - ay, paz = z - az;
      const yy = pax * bax + pay * bay + paz * baz;
      const zz = yy - l2;
      const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yy * yy * l2;
      const z2 = zz * zz * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
    },
    /** t ∈ [0,1] ao longo do eixo; ângulo em torno do eixo não é usado. */
    local(x, y, z) {
      const t = ((x - ax) * bax + (y - ay) * bay + (z - az) * baz) * il2;
      return [t, 0, 0];
    },
  };
  return bound(prim, [(ax + b[0]) / 2, (ay + b[1]) / 2, (az + b[2]) / 2], L / 2 + Math.max(r1, r2));
}

/** Elipsoide orientado (centro c, raios r, base B). */
export function ellipsoid(c, r, B, mat, extra = {}) {
  const [cx, cy, cz] = c;
  const [rx, ry, rz] = r;
  const [ux, uy, uz] = B;
  const prim = {
    kind: 'ellipsoid',
    mat,
    ...extra,
    local(x, y, z) {
      const px = x - cx, py = y - cy, pz = z - cz;
      return [
        px * ux[0] + py * ux[1] + pz * ux[2],
        px * uy[0] + py * uy[1] + pz * uy[2],
        px * uz[0] + py * uz[1] + pz * uz[2],
      ];
    },
    d(x, y, z) {
      const px = x - cx, py = y - cy, pz = z - cz;
      const lx = px * ux[0] + py * ux[1] + pz * ux[2];
      const ly = px * uy[0] + py * uy[1] + pz * uy[2];
      const lz = px * uz[0] + py * uz[1] + pz * uz[2];
      const a = lx / rx, b = ly / ry, cc = lz / rz;
      const k0 = Math.sqrt(a * a + b * b + cc * cc);
      const a1 = lx / (rx * rx), b1 = ly / (ry * ry), c1 = lz / (rz * rz);
      const k1 = Math.sqrt(a1 * a1 + b1 * b1 + c1 * c1) || 1e-8;
      return (k0 * (k0 - 1)) / k1;
    },
  };
  return bound(prim, c, Math.max(rx, ry, rz));
}

/** Caixa arredondada orientada (meias-dimensões h, raio de borda rb). */
export function roundBox(c, h, rb, B, mat, extra = {}) {
  const [cx, cy, cz] = c;
  const [hx, hy, hz] = h;
  const [ux, uy, uz] = B;
  const prim = {
    kind: 'box',
    mat,
    ...extra,
    local(x, y, z) {
      const px = x - cx, py = y - cy, pz = z - cz;
      return [
        px * ux[0] + py * ux[1] + pz * ux[2],
        px * uy[0] + py * uy[1] + pz * uy[2],
        px * uz[0] + py * uz[1] + pz * uz[2],
      ];
    },
    d(x, y, z) {
      const px = x - cx, py = y - cy, pz = z - cz;
      const qx = Math.abs(px * ux[0] + py * ux[1] + pz * ux[2]) - hx;
      const qy = Math.abs(px * uy[0] + py * uy[1] + pz * uy[2]) - hy;
      const qz = Math.abs(px * uz[0] + py * uz[1] + pz * uz[2]) - hz;
      const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
      return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - rb;
    },
  };
  return bound(prim, c, Math.hypot(hx, hy, hz) + rb);
}

/**
 * Primitiva genérica definida no espaço local de uma base: `fn(lx,ly,lz)`
 * devolve a distância (deve ser ~1-Lipschitz). Usada para lâmina e capa.
 */
export function custom(o, B, fn, br, bcLocal, mat, extra = {}) {
  const [ox, oy, oz] = o;
  const [ux, uy, uz] = B;
  const local = (x, y, z) => {
    const px = x - ox, py = y - oy, pz = z - oz;
    return [
      px * ux[0] + py * ux[1] + pz * ux[2],
      px * uy[0] + py * uy[1] + pz * uy[2],
      px * uz[0] + py * uz[1] + pz * uz[2],
    ];
  };
  const prim = {
    kind: 'custom',
    mat,
    ...extra,
    local,
    d(x, y, z) {
      const px = x - ox, py = y - oy, pz = z - oz;
      return fn(
        px * ux[0] + py * ux[1] + pz * ux[2],
        px * uy[0] + py * uy[1] + pz * uy[2],
        px * uz[0] + py * uz[1] + pz * uz[2],
      );
    },
  };
  return bound(prim, v3.inBasis(o, B, ...bcLocal), br);
}
