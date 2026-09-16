(() => {
  const topics = {
    stocks: { label: 'מניות', time: 68, title: 'מה זז במניות שמעניינות אתכם', text: 'השינויים המרכזיים במניות שנבחרו, ההקשר האפשרי ומקורות להמשך בדיקה.' },
    macro: { label: 'שווקים ומאקרו', time: 74, title: 'התמונה הרחבה של השווקים', text: 'החיבור בין נתונים כלכליים, החלטות בנקים מרכזיים והתגובה בשווקים.' },
    rates: { label: 'ריבית', time: 57, title: 'ריבית, אינפלציה ומה שביניהן', text: 'עדכונים על עלות הכסף, ציפיות השוק וההבחנה בין עובדה לפרשנות.' },
    realestate: { label: 'נדל״ן', time: 63, title: 'מה חשוב בשוק הנדל״ן', text: 'נתונים ושינויים רלוונטיים בשוק, עם הקשר וללא הצגת תחזית כעובדה.' },
    pension: { label: 'פנסיה וחיסכון', time: 61, title: 'פנסיה, גמל וחיסכון', text: 'שינויים שעשויים להיות רלוונטיים לחיסכון ארוך הטווח, בשפה בהירה.' },
    crypto: { label: 'קריפטו', time: 66, title: 'הסיפור שמאחורי תנועות הקריפטו', text: 'העדכונים הבולטים בנכסים ובמדיניות, עם הקשר במקום התראות מחיר.' },
    gold: { label: 'זהב', time: 48, title: 'זהב ונכסים חלופיים', text: 'הגורמים המרכזיים סביב זהב והקשר שלהם לריבית, מטבעות ואי־ודאות.' },
    sectors: { label: 'סקטורים', time: 58, title: 'הסקטורים שבחרתם', text: 'מגמות ואירועים בסקטורים שמעניינים אתכם, בלי לסקור את כל השוק.' }
  };
  const fallback = ['stocks', 'macro', 'rates'];
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function track(event, detail = {}) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event, ...detail });
    window.dispatchEvent(new CustomEvent('slinon:analytics', { detail: { event, ...detail } }));
  }

  const header = $('.site-header');
  const progress = $('.scroll-progress span');
  function updateScroll() {
    if (header) header.classList.toggle('scrolled', scrollY > 10);
    if (progress) {
      const max = document.documentElement.scrollHeight - innerHeight;
      progress.style.width = `${max > 0 ? Math.min(100, scrollY / max * 100) : 0}%`;
    }
  }
  updateScroll();
  addEventListener('scroll', updateScroll, { passive: true });

  const menu = $('.menu-toggle');
  const nav = $('.nav-links');
  function closeMenu() {
    if (!menu || !nav) return;
    menu.setAttribute('aria-expanded', 'false');
    nav.classList.remove('open');
  }
  if (menu && nav) {
    menu.addEventListener('click', () => {
      const open = menu.getAttribute('aria-expanded') !== 'true';
      menu.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('open', open);
    });
    nav.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
    addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  }

  $$('[data-event]').forEach(element => element.addEventListener('click', () => {
    track(element.dataset.event, { location: element.dataset.location || location.pathname });
  }));
  if (location.pathname.includes('/compare')) track('compare_page_visit', { path: location.pathname });

  $$('.faq-button').forEach(button => button.addEventListener('click', () => {
    const answer = document.getElementById(button.getAttribute('aria-controls'));
    if (!answer) return;
    const wasOpen = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!wasOpen));
    answer.hidden = wasOpen;
  }));

  const reveals = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    }), { threshold: .1, rootMargin: '0px 0px -35px' });
    reveals.forEach(element => observer.observe(element));
  } else {
    reveals.forEach(element => element.classList.add('revealed'));
  }

  function selected(root) {
    const keys = $$('[data-topic][aria-pressed="true"]', root).map(button => button.dataset.topic).filter(key => topics[key]);
    return keys.length ? keys : fallback;
  }
  function duration(keys) {
    return Math.max(4, Math.round((keys.reduce((total, key) => total + topics[key].time, 0) + 105) / 60));
  }
  function waveMarkup(keys) {
    const bars = Math.min(30, 14 + keys.length * 2);
    return Array.from({ length: bars }, (_, index) => `<i style="--h:${24 + ((index * 29 + keys.length * 13) % 72)}%"></i>`).join('');
  }
  function renderLab(root) {
    const keys = selected(root);
    const time = duration(keys);
    $$('[data-duration]', root).forEach(element => { element.textContent = `${time} דקות`; });
    $$('[data-topic-count]', root).forEach(element => { element.textContent = `${keys.length} נושאים נבחרו`; });
    $$('[data-preview-sections]', root).forEach(target => {
      target.innerHTML = keys.map((key, index) => `<div class="preview-section"><b>${String(index + 1).padStart(2, '0')}</b><span>${topics[key].label}</span><small>${Math.ceil(topics[key].time / 60)} דק׳</small></div>`).join('');
    });
    $$('[data-outline]', root).forEach(outline => {
      outline.innerHTML = keys.map((key, index) => `<article class="outline-item"><header><h3>${index + 1}. ${topics[key].title}</h3><small>${Math.ceil(topics[key].time / 60)} דק׳</small></header><p>${topics[key].text}</p></article>`).join('');
    });
    $$('[data-mini-wave]', root).forEach(wave => { wave.innerHTML = waveMarkup(keys); });
    root.dataset.selectedTopics = keys.join(',');
  }

  $$('[data-topic-lab]').forEach(lab => {
    $$('[data-topic]', lab).forEach(button => button.addEventListener('click', () => {
      const pressed = button.getAttribute('aria-pressed') === 'true';
      const activeCount = $$('[data-topic][aria-pressed="true"]', lab).length;
      if (pressed && activeCount === 1) {
        button.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 240 });
        return;
      }
      button.setAttribute('aria-pressed', String(!pressed));
      renderLab(lab);
      track('topic_selection', { topic: button.dataset.topic, selected: !pressed });
    }));
    renderLab(lab);
  });

  $$('.moment').forEach(button => button.addEventListener('click', () => {
    $$('.moment').forEach(item => item.classList.toggle('active', item === button));
    const tagMap = {
      morning: ['☕ עם הקפה', '↗ לפני היום', '◉ 6 דקות'],
      commute: ['◉ בדרך לעבודה', '▶ האזנה נוחה', '↗ בלי גלילה'],
      research: ['⌕ נקודת פתיחה', '▤ מקורות גלויים', '↗ להעמקה']
    };
    const tags = $$('.moment-tag');
    (tagMap[button.dataset.moment] || []).forEach((text, index) => { if (tags[index]) tags[index].textContent = text; });
  }));

  const modes = {
    listen: {
      badge: 'מצב האזנה', title: 'העדכון ממשיך איתכם.',
      copy: 'פקדי ניגון פשוטים, מעבר בין נושאים וזמן שנותר — בלי צורך לבהות במסך.',
      points: ['חלוקה לפרקים קצרים', 'מעבר ברור בין נושאים', 'מקורות זמינים לבדיקה']
    },
    read: {
      badge: 'מצב קריאה', title: 'כל הפרטים, בקצב שלכם.',
      copy: 'אותה תמצית הופכת לעמוד מסודר שאפשר לסרוק, לעצור בו ולפתוח ממנו מקורות.',
      points: ['כותרת ותמצית לכל נושא', 'זמן ומקור לצד המידע', 'נוח לחזרה ולהעמקה']
    }
  };
  $$('[data-mode-showcase]').forEach(showcase => {
    const screen = $('[data-mode-screen]', showcase);
    $$('[data-mode]', showcase).forEach(button => button.addEventListener('click', () => {
      const mode = button.dataset.mode;
      const data = modes[mode];
      $$('[data-mode]', showcase).forEach(item => item.setAttribute('aria-selected', String(item === button)));
      screen.className = `mode-screen ${mode}-mode`;
      $('.tag', screen).textContent = data.badge;
      $('.mode-copy h3', screen).textContent = data.title;
      $('.mode-copy p', screen).textContent = data.copy;
      $('.mode-copy ul', screen).innerHTML = data.points.map(point => `<li>${point}</li>`).join('');
      const art = $('.mode-art', screen);
      art.innerHTML = mode === 'listen' ? '<span>V</span><i></i>' : '<div class="read-lines"><i></i><i></i><i></i><i></i><i></i><i></i></div>';
      track('product_mode', { mode });
    }));
  });

  let utterance = null;
  const playButtons = $$('[data-speech]');
  function setSpeechState(playing) {
    playButtons.forEach(button => {
      const icon = $('.play-icon', button);
      if (icon) icon.textContent = playing ? '■' : '▶'; else button.textContent = playing ? '■' : '▶';
      button.setAttribute('aria-label', playing ? 'עצירת דוגמת העדכון' : 'השמעת דוגמת העדכון');
    });
    $$('.product-ui').forEach(element => element.classList.toggle('is-speaking', playing));
    $$('[data-speech-status]').forEach(element => { element.textContent = playing ? 'הדגמת ההקראה פועלת' : 'מוכן להאזנה'; });
    $$('[data-progress]').forEach(element => { element.style.width = playing ? '68%' : '22%'; });
  }
  function stopSpeech() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    utterance = null;
    setSpeechState(false);
  }
  playButtons.forEach(button => button.addEventListener('click', () => {
    if (!('speechSynthesis' in window)) {
      $$('[data-speech-status]').forEach(element => { element.textContent = 'הדפדפן אינו תומך בהקראה'; });
      return;
    }
    if (utterance) { stopSpeech(); return; }
    const lab = $('[data-topic-lab]');
    const keys = lab ? selected(lab) : fallback;
    const text = 'זוהי המחשה קולית של מבנה וסטורי. ' + keys.map(key => `${topics[key].title}. ${topics[key].text}`).join(' ');
    utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'he-IL'; utterance.rate = .94;
    utterance.onend = stopSpeech; utterance.onerror = stopSpeech;
    speechSynthesis.speak(utterance);
    setSpeechState(true);
    track('audio_play', { type: 'device_speech_demo', topics: keys.join(',') });
  }));
  addEventListener('beforeunload', stopSpeech);
})();
