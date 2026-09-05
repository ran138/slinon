// slinon.me — sample-episode player + signup stub
(function () {
  var TOTAL = 708; // 11:48 in seconds
  var HEIGHTS = [18,34,52,28,64,44,72,38,86,56,42,66,30,78,48,90,36,58,70,26,62,44,80,34,54,68,22,74,46,88,32,60,50,76,28,66,40,84,56,30,72,48,62,26,80,44,68,36,58,52,74,30];

  var wave = document.querySelector('[data-wave]');
  var playBtn = document.querySelector('[data-play]');
  var elapsedEl = document.querySelector('[data-elapsed]');
  var remainingEl = document.querySelector('[data-remaining]');
  var bars = [];
  var t = 0;
  var playing = false;
  var timer = null;

  function fmt(s) {
    var m = Math.floor(s / 60);
    var r = Math.floor(s % 60);
    return m + ':' + String(r).padStart(2, '0');
  }

  if (wave) {
    HEIGHTS.forEach(function (h) {
      var b = document.createElement('span');
      b.style.height = h + '%';
      wave.appendChild(b);
      bars.push(b);
    });
  }

  function paint() {
    var prog = t / TOTAL;
    bars.forEach(function (b, i) {
      b.classList.toggle('on', i / bars.length < prog);
    });
    if (elapsedEl) elapsedEl.textContent = fmt(t);
    if (remainingEl) remainingEl.textContent = '-' + fmt(TOTAL - t);
  }

  function tick() {
    t = (t + 1) % TOTAL;
    paint();
  }

  if (playBtn) {
    playBtn.addEventListener('click', function () {
      playing = !playing;
      playBtn.innerHTML = playing ? '&#10073;&#10073;' : '&#9654;';
      playBtn.setAttribute('aria-label', playing ? 'Pause sample episode' : 'Play sample episode');
      clearInterval(timer);
      if (playing) timer = setInterval(tick, 1000);
    });
  }
  paint();

  // Signup: replace the stub with a POST to your list/CRM endpoint.
  document.querySelectorAll('[data-signup]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button');
      var note = document.querySelector('[data-note]');
      btn.textContent = 'Sent \u2713';
      btn.disabled = true;
      if (note) note.textContent = "Check your inbox — we'll ask which account to read first.";
      // fetch('/api/waitlist', { method: 'POST', body: new FormData(form) });
    });
  });
})();
