const KEY = 'vaelmor.save.v2';
const VERSION = 2;

interface Snapshot {
  version: number;
  savedAt: number;
  data: Record<string, string>;
  checksum: string;
}

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
};

const validJson = (v: string | null) => {
  if (v === null) return false;
  try {
    JSON.parse(v);
    return true;
  } catch {
    return false;
  }
};

function parse(raw: string | null): Snapshot | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Snapshot;
    if (s?.version !== VERSION || !s.data || typeof s.data !== 'object') return null;
    const body = JSON.stringify(s.data);
    return hash(body) === s.checksum ? s : null;
  } catch {
    return null;
  }
}

/** Recupera chaves ausentes/corrompidas antes que os sistemas sejam criados. */
export function restoreBackup() {
  try {
    const snap = parse(localStorage.getItem(KEY));
    if (!snap) return;
    for (const [k, v] of Object.entries(snap.data)) if (!validJson(localStorage.getItem(k))) localStorage.setItem(k, v);
  } catch {
    /* armazenamento bloqueado: o jogo continua sem save */
  }
}

function platformOrigin(): string | null {
  try {
    const u = new URL(document.referrer);
    return u.hostname === 'athg.antonycorp11.workers.dev' ? u.origin : null;
  } catch {
    return null;
  }
}

export class SaveManager {
  private timer = 0;
  private loadRequested = false;

  start() {
    this.save();
    this.timer = window.setInterval(() => this.save(), 12_000);
    window.addEventListener('pagehide', this.save);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('message', this.onMessage);
    this.send('GAME_READY', { version: VERSION });
    this.send('GAME_STARTED', { version: VERSION });
    this.requestCloudLoad();
  }

  stop() {
    window.clearInterval(this.timer);
    window.removeEventListener('pagehide', this.save);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('message', this.onMessage);
  }

  private onVisibility = () => document.visibilityState === 'hidden' && this.save();

  private collect(): Record<string, string> {
    const data: Record<string, string> = {};
    try {
      for (const k of Object.keys(localStorage)) {
        if (!k.startsWith('vaelmor.') || k === KEY || k === 'vaelmor.lastError') continue;
        const v = localStorage.getItem(k);
        if (v !== null) data[k] = v;
      }
    } catch {
      /* iframe sem storage */
    }
    return data;
  }

  save = () => {
    try {
      const data = this.collect();
      const snap: Snapshot = { version: VERSION, savedAt: Date.now(), data, checksum: hash(JSON.stringify(data)) };
      localStorage.setItem(KEY, JSON.stringify(snap));
      this.send('SAVE_GAME', { slot: 'default', data: snap }, `save-${snap.savedAt}`);
    } catch {
      /* o restante do jogo ainda funciona */
    }
  };

  exportFile() {
    this.save();
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    a.download = `vaelmor-save-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return true;
  }

  importFile(done: (ok: boolean) => void) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      try {
        const snap = parse(await input.files?.[0]?.text()!);
        if (!snap) return done(false);
        for (const [k, v] of Object.entries(snap.data)) localStorage.setItem(k, v);
        localStorage.setItem(KEY, JSON.stringify(snap));
        done(true);
      } catch {
        done(false);
      }
    };
    input.click();
  }

  achievement(id: string) {
    this.send('ACHIEVEMENT_UNLOCKED', { id });
  }

  private send(type: string, payload: unknown, requestId?: string) {
    const origin = platformOrigin();
    if (origin && window.parent !== window) window.parent.postMessage({ source: 'athg-game', game: 'vaelmor', type, payload, ...(requestId ? { requestId } : {}) }, origin);
  }

  private requestCloudLoad() {
    if (this.loadRequested) return;
    this.loadRequested = true;
    this.send('LOAD_GAME', { slot: 'default' }, 'load-default');
  }

  private onMessage = (event: MessageEvent) => {
    const origin = platformOrigin();
    if (!origin || event.origin !== origin || event.source !== window.parent) return;
    const msg = event.data;
    if (msg?.source !== 'athg-portal') return;
    if (msg.type === 'PORTAL_INIT') {
      this.send('GAME_READY', { version: VERSION });
      this.loadRequested = false;
      this.requestCloudLoad();
      return;
    }
    if (msg.type !== 'LOAD_RESULT' || msg.requestId !== 'load-default') return;
    const data = msg.payload?.data;
    const snap = typeof data === 'string' ? parse(data) : parse(JSON.stringify(data));
    const local = parse(localStorage.getItem(KEY));
    if (!snap || (local && local.savedAt >= snap.savedAt)) return;
    for (const [k, v] of Object.entries(snap.data)) localStorage.setItem(k, v);
    localStorage.setItem(KEY, JSON.stringify(snap));
    location.reload();
  };
}

export const saves = new SaveManager();
