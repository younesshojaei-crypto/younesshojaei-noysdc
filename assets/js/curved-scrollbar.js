/**
 * NOYS — Curved (border-radius-aware) SVG scrollbar
 * ----------------------------------------------------------------
 * روی هر container ای که:
 *   1) overflow-y: auto/scroll داشته باشه
 *   2) ارتفاع مشخص (max-height یا height) داشته باشه
 *   3) صفت data-noys-scrollbar روش گذاشته بشه
 * این اسکریپت به‌جای اسکرول‌بار پیش‌فرض مرورگر، یک منحنی SVG می‌کشه
 * که دقیقاً از روی border-radius واقعی همون container عبور می‌کنه
 * (گوشه‌ی بالا و پایین رو "می‌پیچه")، و طول/موقعیت thumb با
 * getTotalLength + stroke-dasharray محاسبه می‌شه.
 *
 * استفاده:
 *   <div class="my-box" data-noys-scrollbar
 *        data-noys-scrollbar-side="right"   (پیش‌فرض: left)
 *        data-noys-scrollbar-color-start="#fff200"
 *        data-noys-scrollbar-color-end="#3d1e8c">
 *     ...محتوای بلند...
 *   </div>
 *
 * رنگ‌ها رو هم می‌شه سراسری با متغیرهای CSS ست کرد:
 *   :root { --noys-scrollbar-start:#fff200; --noys-scrollbar-end:#3d1e8c; }
 */
(function () {
  'use strict';

  var SELECTOR = '[data-noys-scrollbar]';
  var STROKE = 4;      // ضخامت خط
  var PAD = 6;         // فاصله‌ی ابتدا/انتهای مسیر از لبه‌ی بالا/پایین
  var MIN_THUMB = 26;  // حداقل طول thumb به پیکسل (تا خیلی کوچیک نشه)
  var MAX_RADIUS = 40; // سقف شعاعی که دنبال می‌کنیم (برای گردی‌های خیلی بزرگ)

  var instances = new WeakMap();
  var gradientCounter = 0;

  function px(v) {
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  function cornerRadius(el, side) {
    var cs = getComputedStyle(el);
    var topProp = side === 'right' ? 'borderTopRightRadius' : 'borderTopLeftRadius';
    var botProp = side === 'right' ? 'borderBottomRightRadius' : 'borderBottomLeftRadius';
    var r = Math.max(px(cs[topProp]), px(cs[botProp]));
    return Math.max(0, Math.min(r, MAX_RADIUS));
  }

  function buildPathD(side, r, W, H) {
    var xVert = side === 'right' ? (W - STROKE / 2 - 1) : (STROKE / 2 + 1);
    var xCap = side === 'right' ? (xVert - r) : (xVert + r);
    var sweep = side === 'right' ? 1 : 0;
    var yTop = PAD + r;
    var yBot = H - PAD - r;

    if (yBot < yTop || r < 1) {
      // ارتفاع کافی برای گوشه‌ی گرد نیست؛ فقط یه خط صاف بکش
      return 'M ' + xVert + ',' + PAD + ' L ' + xVert + ',' + (H - PAD);
    }

    return [
      'M', xCap, PAD,
      'A', r, r, 0, 0, sweep, xVert, yTop,
      'L', xVert, yBot,
      'A', r, r, 0, 0, sweep, xCap, (H - PAD)
    ].join(' ');
  }

  function ensureSvg(el, side) {
    var existing = el.querySelector(':scope > .noys-curved-scrollbar-sticky');
    if (existing) return existing;

    var sticky = document.createElement('div');
    sticky.className = 'noys-curved-scrollbar-sticky';
    sticky.setAttribute('aria-hidden', 'true');

    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'noys-curved-scrollbar ' + ('side-' + side));
    svg.setAttribute('xmlns', svgNS);
    svg.setAttribute('focusable', 'false');

    var defs = document.createElementNS(svgNS, 'defs');
    var gradId = 'noysCurvedScrollbarGrad' + (++gradientCounter);
    var grad = document.createElementNS(svgNS, 'linearGradient');
    grad.setAttribute('id', gradId);
    grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');

    var stop1 = document.createElementNS(svgNS, 'stop');
    stop1.setAttribute('offset', '0%');
    var stop2 = document.createElementNS(svgNS, 'stop');
    stop2.setAttribute('offset', '100%');

    grad.appendChild(stop1);
    grad.appendChild(stop2);
    defs.appendChild(grad);
    svg.appendChild(defs);

    var track = document.createElementNS(svgNS, 'path');
    track.setAttribute('class', 'noys-curved-scrollbar-track');
    var thumb = document.createElementNS(svgNS, 'path');
    thumb.setAttribute('class', 'noys-curved-scrollbar-thumb');
    thumb.style.stroke = 'url(#' + gradId + ')';

    svg.appendChild(track);
    svg.appendChild(thumb);
    sticky.appendChild(svg);
    el.insertBefore(sticky, el.firstChild);

    return sticky;
  }

  function init(el) {
    if (instances.has(el)) return instances.get(el);

    var side = (el.getAttribute('data-noys-scrollbar-side') === 'right') ? 'right' : 'left';
    var colorStart = el.getAttribute('data-noys-scrollbar-color-start');
    var colorEnd = el.getAttribute('data-noys-scrollbar-color-end');

    if (getComputedStyle(el).position === 'static') {
      el.style.position = 'relative';
    }
    el.classList.add('noys-curved-scrollbar-host');

    var sticky = ensureSvg(el, side);
    var svg = sticky.querySelector('svg');
    var track = svg.querySelector('.noys-curved-scrollbar-track');
    var thumb = svg.querySelector('.noys-curved-scrollbar-thumb');
    var stops = svg.querySelectorAll('stop');

    stops[0].style.stopColor = colorStart || 'var(--noys-scrollbar-start, #fff200)';
    stops[1].style.stopColor = colorEnd || 'var(--noys-scrollbar-end, #3d1e8c)';

    var state = { el: el, side: side, svg: svg, track: track, thumb: thumb, dragging: false };

    function refresh() {
      var H = el.clientHeight;
      var S = el.scrollHeight;
      var T = el.scrollTop;
      var W = STROKE + cornerRadius(el, side) + 6;

      if (!H || S <= H + 1) {
        svg.classList.remove('is-active');
        return;
      }

      svg.classList.add('is-active');
      svg.setAttribute('width', W);
      svg.setAttribute('height', H);
      svg.style.width = W + 'px';
      svg.style.height = H + 'px';

      var r = cornerRadius(el, side);
      var d = buildPathD(side, r, W, H);
      track.setAttribute('d', d);
      thumb.setAttribute('d', d);

      var totalLen = thumb.getTotalLength();
      var ratio = H / S;
      var thumbLen = Math.max(MIN_THUMB, Math.min(totalLen, ratio * totalLen));
      var maxTravel = Math.max(0, totalLen - thumbLen);
      var scrollableDist = S - H;
      var offset = scrollableDist > 0 ? (T / scrollableDist) * maxTravel : 0;

      thumb.setAttribute('stroke-dasharray', thumbLen + ' ' + (totalLen - thumbLen));
      thumb.setAttribute('stroke-dashoffset', String(-offset));

      state.totalLen = totalLen;
      state.thumbLen = thumbLen;
      state.maxTravel = maxTravel;
    }

    el.addEventListener('scroll', refresh, { passive: true });
    window.addEventListener('resize', refresh);

    if ('ResizeObserver' in window) {
      new ResizeObserver(refresh).observe(el);
    }
    if ('MutationObserver' in window) {
      new MutationObserver(refresh).observe(el, { childList: true, subtree: true, characterData: true });
    }

    var dragStartY = 0;
    var dragStartOffset = 0;

    thumb.addEventListener('pointerdown', function (e) {
      state.dragging = true;
      dragStartY = e.clientY;
      var currentOffset = -(parseFloat(thumb.getAttribute('stroke-dashoffset')) || 0);
      dragStartOffset = currentOffset;
      thumb.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    thumb.addEventListener('pointermove', function (e) {
      if (!state.dragging || !state.maxTravel) return;
      var deltaY = e.clientY - dragStartY;
      var newOffset = Math.min(state.maxTravel, Math.max(0, dragStartOffset + deltaY));
      var fraction = newOffset / state.maxTravel;
      el.scrollTop = fraction * (el.scrollHeight - el.clientHeight);
    });

    function endDrag(e) {
      if (!state.dragging) return;
      state.dragging = false;
      try { thumb.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    thumb.addEventListener('pointerup', endDrag);
    thumb.addEventListener('pointercancel', endDrag);

    state.refresh = refresh;
    instances.set(el, state);
    requestAnimationFrame(refresh);
    return state;
  }

  function scanAndInit(root) {
    (root || document).querySelectorAll(SELECTOR).forEach(init);
  }

  function refreshAll() {
    document.querySelectorAll(SELECTOR).forEach(function (el) {
      var inst = instances.get(el);
      if (inst) inst.refresh();
    });
  }

  window.NoysCurvedScrollbar = { init: init, scan: scanAndInit, refreshAll: refreshAll };

  document.addEventListener('DOMContentLoaded', function () {
    scanAndInit(document);
  });

  window.addEventListener('load', refreshAll);

  // چون سایت با pjax صفحه‌ها رو داخل #noysWrapper جایگزین می‌کنه،
  // بعد از هر تعویض محتوا دوباره اسکن می‌کنیم تا اسکرول‌بارهای صفحه‌ی
  // جدید هم فعال بشن.
  var wrapper = document.getElementById('noysWrapper');
  if (wrapper && 'MutationObserver' in window) {
    var debounceId = null;
    new MutationObserver(function () {
      clearTimeout(debounceId);
      debounceId = setTimeout(function () { scanAndInit(wrapper); }, 60);
    }).observe(wrapper, { childList: true, subtree: true });
  }
})();
