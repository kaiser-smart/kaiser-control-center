// Mobile presentation only; no authentication, permissions or API changes.
export const mobileViewportQuery = '(max-width: 720px), (pointer: coarse) and (max-height: 500px) and (max-width: 1000px)';
export const isMobileViewport = () => matchMedia(mobileViewportQuery).matches;
const mapSelector = '.gm-style, .tracking-google-map, .H_map, [data-collection-routes-driver-map], [data-collection-routes-test-tablet-map], .collection-daily-driver-map__controls';
const isMap = target => target instanceof Element && Boolean(target.closest(mapSelector));
const editable = target => target instanceof Element && target.matches('input, textarea, select, [contenteditable="true"]');
let frame;

function syncViewport() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const mobile = isMobileViewport();
    // Do not turn accessible browser pinch zoom into a layout resize.
    const zoomed = viewport && Math.abs(viewport.scale - 1) > 0.05;
    const keyboard = mobile && !zoomed && editable(document.activeElement) && viewport && innerHeight - viewport.height > 120;
    root.classList.toggle('mobile-keyboard', Boolean(keyboard));
    if (mobile && !zoomed) {
      root.style.setProperty('--mobile-viewport-height', `${viewport?.height || innerHeight}px`);
      root.style.setProperty('--mobile-viewport-top', `${viewport?.offsetTop || 0}px`);
    } else if (!mobile) {
      root.style.removeProperty('--mobile-viewport-height');
      root.style.removeProperty('--mobile-viewport-top');
    }
    if (keyboard) {
      const field = document.activeElement;
      const rect = field.getBoundingClientRect();
      const top = (viewport.offsetTop || 0) + (field.closest('dialog') ? 8 : 60);
      const bottom = viewport.offsetTop + viewport.height - 16;
      if (rect.top < top || rect.bottom > bottom) field.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', syncViewport, { passive: true });
  window.visualViewport?.addEventListener('resize', syncViewport, { passive: true });
  window.visualViewport?.addEventListener('scroll', syncViewport, { passive: true });
  document.addEventListener('focusin', syncViewport);
  document.addEventListener('focusout', syncViewport);
  syncViewport();

  // WebKit gesture events apply only to installed iOS apps, outside map canvases.
  // Browser pinch zoom and the iOS system Zoom/VoiceOver remain available.
  let mapGesture = false;
  document.addEventListener('touchstart', event => { mapGesture = isMap(event.target); }, { passive: true, capture: true });
  const gesture = event => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
    if (ios && standalone && isMobileViewport() && !mapGesture && !isMap(event.target) && event.cancelable) event.preventDefault();
  };
  document.addEventListener('gesturestart', gesture, { passive: false });
  document.addEventListener('gesturechange', gesture, { passive: false });

  // Suppress rapid repeat activation, including a button replaced by a render.
  // Paging, toggles and map zoom intentionally allow repeated interaction.
  let previous = null;
  // A corrected field starts a new attempt, even within the repeat window.
  document.addEventListener('input', () => { previous = null; }, true);
  document.addEventListener('change', () => { previous = null; }, true);
  document.addEventListener('click', event => {
    const control = event.target instanceof Element && event.target.closest('button, input[type=submit], a[data-link]');
    if (!isMobileViewport() || !control || isMap(control) || control.closest('.mobile-pager') || control.matches('[aria-expanded], [aria-pressed]')) return;
    const attributes = [...control.attributes].filter(a => a.name.startsWith('data-') || ['href','name','value','type','id'].includes(a.name)).map(a => `${a.name}=${a.value}`).join('|');
    const key = `${location.pathname}${location.hash}|${control.form?.id || ''}|${attributes}|${control.textContent.trim()}`;
    const now = performance.now();
    if (previous?.key === key && now - previous.time < 400) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    previous = { key, time: now };
  }, true);
}
