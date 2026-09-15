(() => {
  const topics = {
    stocks: { label: 'מניות', time: 68, title: 'מה זז במניות שמעניינות אתכם', text: 'בדוגמה הזו נסכם את השינויים המרכזיים במניות שנבחרו, נסביר מה עשוי לעמוד מאחוריהם ונפנה למקורות המופיעים לצד הפרק.' },
    macro: { label: 'שווקים ומאקרו', time: 74, title: 'התמונה הרחבה של השווקים', text: 'נחבר בין הנתונים הכלכליים, החלטות הבנקים המרכזיים והתגובה בשווקים — בלי להפוך את הפרק לסקירה של כל מה שקרה.' },
    rates: { label: 'ריבית', time: 57, title: 'ריבית, אינפלציה ומה שביניהן', text: 'נזקק את העדכונים שעשויים להשפיע על עלות הכסף ועל השווקים, ונפריד בין עובדות, ציפיות ופרשנות.' },
    realestate: { label: 'נדל״ן', time: 63, title: 'העדכונים שחשובים לשוק הנדל״ן', text: 'נציג בקצרה נתונים ושינויים רלוונטיים בשוק, עם הקשר ברור ומבלי להציג תחזית כעובדה.' },
    pension: { label: 'פנסיה וחיסכון', time: 61, title: 'פנסיה, גמל וחיסכון', text: 'נרכז שינויים ועדכונים שעשויים להיות רלוונטיים לחיסכון ארוך הטווח, בשפה בהירה וללא המלצה אישית.' },
    crypto: { label: 'קריפטו', time: 66, title: 'הסיפור שמאחורי תנועות הקריפטו', text: 'נבחר את העדכונים הבולטים בנכסים ובמדיניות, ונספק הקשר במקום רצף של התראות מחיר.' },
    gold: { label: 'זהב', time: 48, title: 'זהב ונכסים חלופיים', text: 'נציג את הגורמים המרכזיים סביב מחיר הזהב ואת הקשר שלהם לריבית, מטבעות ואי־ודאות בשווקים.' },
    sectors: { label: 'סקטורים', time: 58, title: 'הסקטורים שבחרתם', text: 'נמקד את העדכון במגמות ובאירועים של הסקטורים שמעניינים אתכם, ולא בכל מדד או חברה בשוק.' }
  };
  const fallback = ['stocks', 'macro', 'rates'];
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  function track(name, detail = {}) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: name, ...detail });
    window.dispatchEvent(new CustomEvent('slinon:analytics', { detail: { event: name, ...detail } }));
  }

  const header = $('.site-header');
  if (header) {
    const setHeader = () => header.classList.toggle('scrolled', scrollY > 10);
    setHeader(); addEventListener('scroll', setHeader, { passive: true });
  }
  const menu = $('.menu-toggle');
  const nav = $('.nav-links');
  if (menu && nav) {
    menu.addEventListener('click', () => {
      const open = menu.getAttribute('aria-expanded') !== 'true';
      menu.setAttribute('aria-expanded', String(open)); nav.classList.toggle('open', open);
    });
    nav.addEventListener('click', e => { if (e.target.closest('a')) { menu.setAttribute('aria-expanded', 'false'); nav.classList.remove('open'); } });
  }

  $$('[data-event]').forEach(el => el.addEventListener('click', () => track(el.dataset.event, { location: el.dataset.location || location.pathname })));
  if (location.pathname.includes('/compare')) track('compare_page_visit', { path: location.pathname });

  $$('.faq-button').forEach(button => button.addEventListener('click', () => {
    const answer = document.getElementById(button.getAttribute('aria-controls'));
    const open = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!open)); answer.hidden = open;
  }));

  const reveal = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('revealed'); observer.unobserve(e.target); } }), { threshold: .12 });
    reveal.forEach(el => observer.observe(el));
  } else reveal.forEach(el => el.classList.add('revealed'));

  function selected(root = document) {
    const keys = $$('[data-topic][aria-pressed="true"]', root).map(b => b.dataset.topic).filter(k => topics[k]);
    return keys.length ? keys : fallback;
  }
  function duration(keys) { return Math.max(4, Math.round((keys.reduce((n, k) => n + topics[k].time, 0) + 105) / 60)); }
  function renderPreview(root = document) {
    const keys = selected(root);
    const target = $('[data-preview-sections]', root) || $('[data-preview-sections]');
    const time = $('[data-duration]', root) || $('[data-duration]');
    const count = $('[data-topic-count]', root) || $('[data-topic-count]');
    if (time) time.textContent = `${duration(keys)} דקות`;
    if (count) count.textContent = `${keys.length} נושאים נבחרו`;
    if (target) target.innerHTML = keys.map((k, i) => `<div class="preview-section"><b>${i + 1}</b><span>${topics[k].label}</span><small>${Math.ceil(topics[k].time / 60)} דק׳</small></div>`).join('');
    const outline = $('[data-outline]');
    if (outline) outline.innerHTML = keys.map((k, i) => `<article class="outline-item"><header><h3>${i + 1}. ${topics[k].title}</h3><small>${Math.ceil(topics[k].time / 60)} דק׳</small></header><p>${topics[k].text}</p></article>`).join('');
  }
  $$('[data-topic]').forEach(button => button.addEventListener('click', () => {
    button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
    if (!$$('[data-topic][aria-pressed="true"]').length) button.setAttribute('aria-pressed', 'true');
    renderPreview(button.closest('[data-topic-lab]') || document);
    track('topic_selection', { topic: button.dataset.topic, selected: button.getAttribute('aria-pressed') === 'true' });
  }));
  if ($('[data-preview-sections]') || $('[data-outline]')) renderPreview();

  let utterance = null;
  const playButtons = $$('[data-speech]');
  function stopSpeech() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    utterance = null;
    playButtons.forEach(b => { b.textContent = '▶'; b.setAttribute('aria-label', 'השמעת הדוגמה'); });
    $$('.product-ui').forEach(x => x.classList.remove('is-speaking'));
    const bar = $('[data-progress]'); if (bar) bar.style.width = '22%';
  }
  playButtons.forEach(button => button.addEventListener('click', () => {
    if (!('speechSynthesis' in window)) {
      const status = $('[data-speech-status]'); if (status) status.textContent = 'הדפדפן הזה אינו תומך בהקראה.';
      return;
    }
    if (utterance) { stopSpeech(); return; }
    const keys = selected();
    const intro = 'זוהי המחשה קולית מוכנה מראש של מבנה vestory, המוקראת באמצעות קול המכשיר. ';
    const text = intro + keys.map(k => `${topics[k].title}. ${topics[k].text}`).join(' ');
    utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'he-IL'; utterance.rate = .94;
    utterance.onend = stopSpeech; utterance.onerror = stopSpeech;
    speechSynthesis.speak(utterance);
    button.textContent = '■'; button.setAttribute('aria-label', 'עצירת ההדגמה');
    $$('.product-ui').forEach(x => x.classList.add('is-speaking'));
    const status = $('[data-speech-status]'); if (status) status.textContent = 'הדגמת ההקראה פועלת. זהו אינו פרק חדשות חי.';
    const bar = $('[data-progress]'); if (bar) bar.style.width = '62%';
    track('audio_play', { type: 'device_speech_demo', topics: keys.join(',') });
  }));
  addEventListener('beforeunload', stopSpeech);
})();
