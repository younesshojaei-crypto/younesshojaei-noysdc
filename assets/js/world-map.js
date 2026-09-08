/* =========================================================
   NOYS - نقشه‌ی تعاملی جهان
   با موس روی هر کشور: اگه اون کشور مطلب داشته باشه، کشور
   هایلایت/برجسته می‌شه و یک باکس شناور با عکس + اسم مطلب/مطلب‌های
   مربوط به همون کشور نمایش داده می‌شه.

   نکته‌ی مهم درباره‌ی کارایی:
   خودِ SVG نقشه حدود ۳۷۰ کیلوبایته. قبلاً مستقیم توی HTML صفحه
   inline می‌شد که هم پارسِ اولیه‌ی صفحه رو کند می‌کرد، هم هیچ‌وقت
   کش نمی‌شد (چون بخشی از خودِ HTML بود، نه یک فایل جدا). این‌جا
   SVG رو به یک فایل جدا (assets/img/world-map.svg) منتقل کردیم؛
   از اون به بعد، مرورگر همین فایل رو کش می‌کنه و دفعات بعد اصلاً
   دوباره دانلودش نمی‌کنه.

   قبلاً اینجا یه لیزی‌لودِ مبتنی بر اسکرول (IntersectionObserver)
   هم بود که فقط وقتی کاربر به این بخش نزدیک می‌شد فایل رو دانلود
   می‌کرد؛ ولی این باعث می‌شد بعد از برگشتن از یک پست (pjax) گاهی
   نقشه دیگه هیچ‌وقت لود نشه. برای رفعِ قطعیِ این مشکل، الان همین
   که این بخش از صفحه ساخته بشه (چه لود اول، چه بعد از pjax)،
   بلافاصله لود می‌شه.
   ========================================================= */

/* -------------------------------------------------------------
   چرا این تابع جداست:
   سایت با pjax سبک خودش (توی default.html) فقط innerHTML خودِ
   #noysWrapper رو عوض می‌کنه، نه کل صفحه رو رفرش می‌کنه. یعنی وقتی
   از خونه می‌ریم توی یک پست و برمی‌گردیم، یک #noysWorldMapWrap کاملاً
   تازه (المنت جدید) ساخته می‌شه، ولی چون این فایل قبلاً فقط یک‌بار
   روی DOMContentLoaded اجرا شده بود، IntersectionObserver قدیمی
   داشت المنتِ قدیمیِ (که دیگه از DOM حذف شده) رو دید می‌زد و
   دیگه هیچ‌وقت trigger نمی‌شد؛ برای همین نقشه فقط با رفرش کامل
   صفحه دوباره لود می‌شد. راه‌حل: منطق init رو توی یک تابع گلوبال
   می‌ذاریم (window.NOYS_INIT_WORLD_MAP) که هم موقع لود اول صفحه،
   هم بعد از هر جابه‌جاییِ pjax (از داخل default.html) صدا زده می‌شه.
   ------------------------------------------------------------- */
function noysInitWorldMap(root) {
  root = root || document;

  var wrap = root.querySelector('#noysWorldMapWrap');
  var dataScript = root.querySelector('#noysCountryData');
  var tooltip = root.querySelector('#noysWorldTooltip');
  var tooltipCountry = root.querySelector('#noysWorldTooltipCountry');
  var tooltipItems = root.querySelector('#noysWorldTooltipItems');
  var loadingEl = root.querySelector('#noysWorldMapLoading');

  // اگه این صفحه اصلاً نقشه نداره (مثلاً یک پست متنی)، کاری نکن.
  if (!wrap || !dataScript || !tooltip) return;

  // اگه این المنت قبلاً init شده (SVG توش هست)، دوباره کاری نکن.
  if (wrap.dataset.noysMapInit === '1') return;
  wrap.dataset.noysMapInit = '1';

  var svgUrl = wrap.getAttribute('data-svg-src');
  if (!svgUrl) return;

  var countryData = {};
  try {
    var parsed = JSON.parse(dataScript.textContent) || [];

    /* داده‌ها ممکنه به‌صورت آرایه‌ای از رکوردها بیاد (هر کدوم با
       فیلد code)، یا مستقیم یک آبجکت کلیدشده با کد کشور باشه.
       این‌جا هر دو حالت رو پشتیبانی می‌کنیم و در نهایت یک آبجکت
       می‌سازیم که با کد کشور (مثلاً "IQ") قابل دسترسیه. */
    if (Array.isArray(parsed)) {
      parsed.forEach(function (entry) {
        if (entry && entry.code) {
          countryData[entry.code] = entry;
        }
      });
    } else {
      countryData = parsed;
    }
  } catch (e) {
    countryData = {};
  }

  var countryCodes = Object.keys(countryData);
  if (!countryCodes.length) return;

  var svgLoaded = false;
  var svgLoading = false;

  function bindMapEvents(svg) {
    countryCodes.forEach(function (code) {
      var path = svg.querySelector('#' + CSS.escape(code));
      if (path) {
        path.classList.add('has-content');
      }
    });

    var activePath = null;

    function showTooltip(code, path, evt) {
      var entry = countryData[code];
      if (!entry) return;

      tooltipCountry.textContent = entry.name || code;

      tooltipItems.innerHTML = entry.items
        .slice(0, 3)
        .map(function (item) {
          return (
            '<a class="noys-world-tooltip-item" href="' +
            item.url +
            '">' +
            '<img src="' +
            item.img +
            '" alt="" loading="lazy">' +
            '<span class="noys-world-tooltip-item-title">' +
            item.title +
            '</span>' +
            '</a>'
          );
        })
        .join('');

      tooltip.hidden = false;
      positionTooltip(evt);
    }

    function hideTooltip() {
      tooltip.hidden = true;
      if (activePath) {
        activePath.classList.remove('is-active');
        activePath = null;
      }
    }

    function positionTooltip(evt) {
      var wrapRect = wrap.getBoundingClientRect();
      var x = evt.clientX - wrapRect.left;
      var y = evt.clientY - wrapRect.top;

      tooltip.style.left = x + 'px';
      tooltip.style.top = y - 10 + 'px';
    }

    svg.addEventListener('mousemove', function (evt) {
      var path = evt.target.closest('path');
      if (!path) return;

      var code = path.id;

      if (!countryData[code]) {
        if (!path.classList.contains('has-content')) {
          hideTooltip();
        }
        return;
      }

      if (activePath !== path) {
        if (activePath) activePath.classList.remove('is-active');
        path.classList.add('is-active');
        activePath = path;
      }

      showTooltip(code, path, evt);
    });

    svg.addEventListener('mouseleave', hideTooltip);
  }

  function loadMapSvg() {
    if (svgLoaded || svgLoading) return;
    svgLoading = true;

    fetch(svgUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('noys-world-map: bad response');
        return res.text();
      })
      .then(function (svgMarkup) {
        var holder = document.createElement('div');
        holder.innerHTML = svgMarkup;
        var svg = holder.querySelector('svg');
        if (!svg) throw new Error('noys-world-map: no <svg> in response');

        if (loadingEl) loadingEl.hidden = true;
        wrap.insertBefore(svg, tooltip);

        bindMapEvents(svg);
        svgLoaded = true;
      })
      .catch(function () {
        if (loadingEl) loadingEl.textContent = 'نقشه لود نشد.';
        svgLoading = false;
      });
  }

  // نکته‌ی مهم: قبلاً اینجا یه IntersectionObserver بود که فقط
  // وقتی کاربر به نزدیکیِ این بخش اسکرول می‌کرد، فایل SVG رو لود
  // می‌کرد (برای صرفه‌جویی توی بار اول لود صفحه). ولی این روش خودش
  // باعث یه مشکل جدید شد: بعد از برگشتن از یک پست (pjax)، یا وقتی
  // کاربر دقیقاً به همون نقطه اسکرول نمی‌کرد، observer درست
  // trigger نمی‌شد و پیام «در حال آماده‌سازی نقشه» می‌موند.
  // برای اینکه این مشکل قطعی حل بشه، دیگه به اسکرول وابسته نیستیم:
  // همین که این تابع صدا زده بشه (چه موقع لود اول صفحه، چه بعد از
  // pjax)، بلافاصله نقشه رو لود می‌کنیم.
  loadMapSvg();
}

document.addEventListener('DOMContentLoaded', function () {
  noysInitWorldMap(document);
});

// در default.html بعد از هر جابه‌جاییِ pjax صدا زده می‌شه تا اگه
// صفحه‌ی جدید نقشه داشت، دوباره init بشه.
window.NOYS_INIT_WORLD_MAP = noysInitWorldMap;
