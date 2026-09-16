(() => {
  'use strict';
  const stage = document.querySelector('.signal-stage-v3');
  if (!stage) return;
  const logos = [...stage.querySelectorAll('.source-logo')];
  const player = stage.querySelector('.hero-player-v3');
  const svg = stage.querySelector('.focus-streams');
  const pause = stage.querySelector('.source-motion-control input');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const NS = 'http://www.w3.org/2000/svg';
  function element(name, attributes) {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }
  function motionState() {
    if (pause.checked || reduced.matches) svg.pauseAnimations();
    else svg.unpauseAnimations();
  }
  function layout() {
    const width = stage.clientWidth, height = stage.clientHeight;
    const cx = width / 2, cy = height / 2;
    let scale = Math.min(1, width * .49 / 348);
    const rx = cx - logos[0].offsetWidth / 2 - 6;
    const ry = cy - 40;
    // Equal arc-length spacing avoids bunching logos at the ellipse's poles.
    const points = [];
    let distance = 0;
    for (let i = 0; i <= 720; i++) {
      const angle = -Math.PI / 2 + i * 2 * Math.PI / 720;
      const point = {x:rx * Math.cos(angle), y:ry * Math.sin(angle)};
      if (i) distance += Math.hypot(point.x - points[i-1].x, point.y - points[i-1].y);
      points.push({...point, distance});
    }
    const positions = logos.map((logo, index) => points.find(p => p.distance >= distance * index / logos.length) || points[0]);
    positions.forEach((p, index) => {
      const safeX = (Math.abs(p.x) - logos[index].offsetWidth / 2 - 12) / 174;
      const safeY = (Math.abs(p.y) - logos[index].offsetHeight / 2 - 12) / (player.offsetHeight / 2);
      scale = Math.min(scale, Math.max(safeX, safeY));
    });
    stage.style.setProperty('--player-scale', scale);
    const halfWidth = 174 * scale + 10;
    const halfHeight = player.offsetHeight * scale / 2 + 10;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.replaceChildren();
    logos.forEach((logo, index) => {
      const point = positions[index];
      const dx = point.x, dy = point.y;
      const x = cx + dx, y = cy + dy;
      logo.style.left = `${x}px`; logo.style.top = `${y}px`;
      // Intersect each ray with the player perimeter, never its content.
      const endRatio = Math.min(halfWidth / Math.max(Math.abs(dx), .001), halfHeight / Math.max(Math.abs(dy), .001));
      const endX = cx + dx * endRatio, endY = cy + dy * endRatio;
      const path = `M ${x} ${y} L ${endX} ${endY}`;
      svg.append(element('path', {d:path, class:'orbit-line'}));
      const dot = element('circle', {r:2.2, class:'orbit-particle', opacity:0});
      const duration = 3.2 + index % 4 * .35;
      dot.append(element('animateMotion', {path, dur:`${duration}s`, begin:`${-index * .47}s`, repeatCount:'indefinite'}));
      dot.append(element('animate', {attributeName:'opacity', values:'0;1;1;0', keyTimes:'0;.14;.8;1', dur:`${duration}s`, begin:`${-index * .47}s`, repeatCount:'indefinite'}));
      svg.append(dot);
    });
    motionState();
  }
  pause.addEventListener('change', motionState);
  reduced.addEventListener('change', motionState);
  new ResizeObserver(layout).observe(stage);
  if (document.fonts) document.fonts.ready.then(layout);
  layout();
})();
