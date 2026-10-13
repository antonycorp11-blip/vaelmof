/** Integração PWA/mobile: service worker, trava de orientação e gestos. */
export function setupPwa() {
  // service worker (somente no build de produção), com atualização forçada:
  // procura versão nova ao abrir, ao voltar para o app e a cada minuto; quando
  // a versão nova assume, a página recarrega sozinha (uma vez).
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
        const check = () => reg.update().catch(() => undefined);
        check();
        setInterval(check, 60_000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
      } catch (e) {
        console.warn('SW não registrado', e);
      }
    });
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    });
  }

  // bloqueia zoom de pinça, duplo toque e rolagem da página
  const prevent = (e: Event) => e.preventDefault();
  document.addEventListener('gesturestart', prevent, { passive: false });
  document.addEventListener('gesturechange', prevent, { passive: false });
  document.addEventListener('dblclick', prevent, { passive: false });
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1 || e.target instanceof HTMLCanvasElement) e.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener('contextmenu', prevent);
  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now();
      if (now - lastTouchEnd < 300) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false },
  );

  // tenta tela cheia + travar paisagem no primeiro toque (Android/Chrome).
  // No iOS a API não existe; o PWA instalado respeita o manifest.
  const lock = async () => {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    try {
      const standalone = window.matchMedia('(display-mode: standalone)').matches;
      if (!standalone && !document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch {
      /* sem permissão para tela cheia */
    }
    try {
      await orientation?.lock?.('landscape');
    } catch {
      /* navegador não suporta travar orientação */
    }
  };
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isTouch) window.addEventListener('touchend', () => void lock(), { once: true });

}
