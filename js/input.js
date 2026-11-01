/* input.js - keyboard, touch and gamepad controls for up to two players. The engine reads G.input (player 1, team 0) and G.input2 (player 2, team 1). */
(function () {
  const G = window.G;
  const mk = () => ({ x: 0, y: 0, sprint: false, rel: null, tackle: false, slide: false, sw: false, shootStart: 0, passStart: 0, shootDown: false, passDown: false });
  const I1 = (G.input = Object.assign(mk(), { pause: false, cam: false })), I2 = (G.input2 = mk());
  const S = [
    { I: I1, joy: { x: 0, y: 0 }, pj: { x: 0, y: 0 }, held: {}, prev: [], t: {} },
    { I: I2, joy: { x: 0, y: 0 }, pj: { x: 0, y: 0 }, held: {}, prev: [], t: {} },
  ];
  const keys = {};
  G.mode = 'solo'; // 'solo' | 'duo' | 'cpu'
  G.fire = G.fire || [false, false]; // held fire button per player (Illegal Soccer)

  // keyboard layouts. Solo: everything on one set of keys. Two players: P1 on the left, P2 on the right.
  const SOLO = [{ l: ['ArrowLeft', 'KeyA'], r: ['ArrowRight', 'KeyD'], u: ['ArrowUp', 'KeyW'], d: ['ArrowDown', 'KeyS'], pass: ['Space', 'KeyJ'], shoot: ['KeyK'], tackle: ['KeyL', 'KeyX'], slide: ['KeyI', 'KeyC'], sw: ['KeyQ', 'Tab'], sprint: ['ShiftLeft', 'ShiftRight'] }];
  const DUO = [
    { l: ['KeyA'], r: ['KeyD'], u: ['KeyW'], d: ['KeyS'], pass: ['KeyF'], shoot: ['KeyG'], tackle: ['KeyR'], slide: ['KeyT'], sw: ['KeyQ'], sprint: ['ShiftLeft'] },
    { l: ['ArrowLeft'], r: ['ArrowRight'], u: ['ArrowUp'], d: ['ArrowDown'], pass: ['Comma'], shoot: ['Period'], tackle: ['Slash'], slide: ['Semicolon'], sw: ['Quote'], sprint: ['ShiftRight'] },
  ];
  G.keyHelp = {
    solo: 'Move WASD or arrows. Pass Space or J (hold for a lofted ball). Shoot K (hold: at 70% the bar turns green and the shot cannot be saved). Tackle L. Slide I. Switch player Q. Sprint Shift.',
    duo: 'Player 1 (left side): move WASD, pass F, shoot G (hold to charge), tackle R, slide T, switch Q, sprint left Shift. Player 2 (right side): move arrows, pass comma, shoot full stop (hold), tackle slash, slide semicolon, switch apostrophe, sprint right Shift. Two PS5 pads also work: pad 1 is Player 1, pad 2 is Player 2.',
  };
  const maps = () => (G.mode === 'duo' ? DUO : SOLO);
  const anyDown = (codes) => codes.some((c) => keys[c]);

  function refresh(i) {
    const s = S[i], m = maps()[i];
    let kx = 0, ky = 0;
    if (m) { kx = (anyDown(m.r) ? 1 : 0) - (anyDown(m.l) ? 1 : 0); ky = (anyDown(m.d) ? 1 : 0) - (anyDown(m.u) ? 1 : 0); }
    s.I.x = s.pj.x || s.joy.x || kx; s.I.y = s.pj.y || s.joy.y || ky;
    s.I.sprint = !!((m && anyDown(m.sprint)) || s.held.sprint || s.held.pad);
  }
  const refreshAll = () => { refresh(0); refresh(1); };

  // charge a pass or shot while the button is down; release fires it
  function down(i, kind) {
    const I = S[i].I, now = performance.now();
    if (kind === 'shoot' && !I.shootDown) { I.shootDown = true; I.shootStart = now; }
    if (kind === 'pass' && !I.passDown) { I.passDown = true; I.passStart = now; }
  }
  function up(i, kind) {
    const I = S[i].I, now = performance.now();
    if (kind === 'shoot' && I.shootDown) { I.shootDown = false; I.rel = { kind, t: (now - I.shootStart) / 1000 }; }
    if (kind === 'pass' && I.passDown) { I.passDown = false; I.rel = { kind, t: (now - I.passStart) / 1000 }; }
  }
  // how full the charge bar is (0..1) and which kind; n = 1 or 2 for the player
  G.charge = (n) => {
    const I = n === 2 ? I2 : I1, now = performance.now();
    if (I.shootDown) return { kind: 'shoot', v: Math.min(1, (now - I.shootStart) / 850) };
    if (I.passDown) return { kind: 'pass', v: Math.min(1, (now - I.passStart) / 850) };
    return { kind: '', v: 0 };
  };

  const typing = (e) => e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  window.addEventListener('keydown', (e) => {
    if (typing(e)) return;
    const live = !!G.running;
    if (live && (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Tab' || e.code === 'Slash' || e.code === 'Quote')) e.preventDefault();
    if (e.repeat) return;
    keys[e.code] = true;
    if (!live) return;
    if (e.code === 'KeyP' || e.code === 'Escape') I1.pause = true;
    else if (e.code === 'KeyV') I1.cam = true;
    maps().forEach((m, i) => {
      if (!G.m || !G.isH(i === 0 && G.mode !== 'duo' ? 0 : i)) return;
      if (m.pass.includes(e.code)) down(i, 'pass');
      else if (m.shoot.includes(e.code)) down(i, 'shoot');
      else if (m.tackle.includes(e.code)) { S[i].I.tackle = true; G.fire[i] = true; }
      else if (m.slide.includes(e.code)) S[i].I.slide = true;
      else if (m.sw.includes(e.code)) S[i].I.sw = true;
    });
    refreshAll();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    maps().forEach((m, i) => { if (m.pass.includes(e.code)) up(i, 'pass'); if (m.shoot.includes(e.code)) up(i, 'shoot'); if (m.tackle.includes(e.code)) G.fire[i] = false; });
    refreshAll();
  });
  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    S.forEach((s) => { s.I.shootDown = s.I.passDown = false; s.joy.x = s.joy.y = 0; }); G.fire[0] = G.fire[1] = false;
    refreshAll();
  });

  /* ---------- gamepads (standard mapping: 0 Cross, 1 Circle, 2 Square, 3 Triangle, 4 L1, 5 R1, 7 R2, 9 Options, 11 R3) ---------- */
  const $id = (n) => document.getElementById(n);
  G.rumble = (ms, strong, weak) => {
    try {
      [].forEach.call(navigator.getGamepads(), (gp) => { if (gp && gp.connected && gp.vibrationActuator) gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak == null ? strong : weak }); });
    } catch (e) { /* not every browser supports rumble */ }
  };
  function padFor(gp, i) {
    const s = S[i], pv = s.prev;
    const B = (n) => !!(gp.buttons[n] && gp.buttons[n].pressed);
    const hit = (n) => B(n) && !pv[n], rel = (n) => !B(n) && pv[n];
    let ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const mag = Math.hypot(ax, ay);
    if (mag < 0.2) { ax = ay = 0; } else { const k = (Math.min(1, mag) - 0.2) / 0.8 / mag; ax *= k; ay *= k; }
    if (!ax && !ay) { ax = (B(15) ? 1 : 0) - (B(14) ? 1 : 0); ay = (B(13) ? 1 : 0) - (B(12) ? 1 : 0); }
    const sprint = B(5) || B(7);
    if (ax !== s.pj.x || ay !== s.pj.y || sprint !== !!s.held.pad) { s.pj.x = ax; s.pj.y = ay; s.held.pad = sprint; refresh(i); }
    const m = G.m;
    if (i === 0) { // menus and pause are driven by the first pad
      const menu = $id('menu'), pause = $id('pause'), end = $id('end');
      if (menu && !menu.hidden) {
        if (hit(0) || hit(9)) $id('start').click();
        if (G.menuNav) { if (hit(14)) G.menuNav('home', -1); if (hit(15)) G.menuNav('home', 1); if (hit(12)) G.menuNav('away', -1); if (hit(13)) G.menuNav('away', 1); }
        for (let n = 0; n < gp.buttons.length; n++) pv[n] = B(n); return;
      }
      if (end && !end.hidden) { if (hit(0) || hit(9)) $id('again').click(); for (let n = 0; n < gp.buttons.length; n++) pv[n] = B(n); return; }
      if (pause && !pause.hidden) { if (hit(0) || hit(9)) I1.pause = true; if (hit(1)) $id('quit').click(); for (let n = 0; n < gp.buttons.length; n++) pv[n] = B(n); return; }
      if (G.running) { if (hit(9)) I1.pause = true; if (hit(11)) I1.cam = true; }
    }
    const team = G.mode === 'duo' ? i : 0;
    if (G.il && G.il.active && G.running) { // Illegal Soccer: Cross pass, Circle shoot, Square or L2 fire, Triangle dash, L1 swap player
      const I = s.I;
      if (hit(0)) down(i, 'pass'); if (rel(0)) up(i, 'pass');
      if (hit(1)) down(i, 'shoot'); if (rel(1)) up(i, 'shoot');
      G.fire[i] = B(2) || B(6); if (hit(3)) I.slide = true; if (hit(4)) I.sw = true;
      for (let n = 0; n < gp.buttons.length; n++) pv[n] = B(n); return;
    }
    if (m && G.running && G.isH(team)) {
      const I = s.I, ctrl = team === 0 ? m.ctrl : m.ctrl2, has = m.ball.owner && m.ball.owner === ctrl, now = performance.now();
      if (hit(0)) { if (has) down(i, 'pass'); else I.sw = true; }
      if (rel(0)) up(i, 'pass');
      if (hit(1)) { if (has) down(i, 'shoot'); else I.slide = true; }
      if (rel(1)) up(i, 'shoot');
      if (hit(2)) { s.t.sq = now; if (!has) I.tackle = true; }
      if (rel(2) && has) I.rel = { kind: 'pass', t: 0.36 + Math.min(0.45, (now - s.t.sq) / 1000) }; // lob
      if (rel(3) && has) I.rel = { kind: 'pass', t: 0.7 }; // through ball
      if (hit(4)) I.sw = true;
    }
    for (let n = 0; n < gp.buttons.length; n++) pv[n] = B(n);
  }
  function pollPad() {
    requestAnimationFrame(pollPad);
    let pads = [];
    try { pads = [].filter.call(navigator.getGamepads ? navigator.getGamepads() : [], (g) => g && g.connected); } catch (e) { /* ignore */ }
    if (!pads.length) { S.forEach((s, i) => { if (s.pj.x || s.pj.y || s.held.pad) { s.pj.x = s.pj.y = 0; s.held.pad = false; refresh(i); } }); return; }
    padFor(pads[0], 0);
    if (pads[1] && G.mode === 'duo') padFor(pads[1], 1);
  }
  requestAnimationFrame(pollPad);

  /* ---------- touch: a thumb stick and buttons (player 1) ---------- */
  const pad = document.getElementById('stick'), knob = document.getElementById('knob');
  if (pad) {
    let id = null, cx = 0, cy = 0;
    const R = 46, joy = S[0].joy;
    const move = (e) => {
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      joy.x = Math.abs(dx) / R < 0.18 ? 0 : dx / R; joy.y = Math.abs(dy) / R < 0.18 ? 0 : dy / R;
      refresh(0);
    };
    pad.addEventListener('pointerdown', (e) => {
      id = e.pointerId; pad.setPointerCapture(id);
      const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      move(e); e.preventDefault();
    });
    pad.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null; joy.x = joy.y = 0; knob.style.transform = ''; refresh(0);
    };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
  }

  document.querySelectorAll('[data-act]').forEach((btn) => {
    const act = btn.dataset.act;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); btn.setPointerCapture(e.pointerId); btn.classList.add('on');
      if (act === 'shoot' || act === 'pass') down(0, act);
      else if (act === 'tackle') { I1.tackle = true; G.fire[0] = true; }
      else if (act === 'slide') I1.slide = true;
      else if (act === 'switch') I1.sw = true;
      else if (act === 'sprint') { S[0].held.sprint = true; refresh(0); }
      else if (act === 'pause') I1.pause = true;
    });
    const end = () => {
      btn.classList.remove('on');
      if (act === 'shoot' || act === 'pass') up(0, act);
      else if (act === 'sprint') { S[0].held.sprint = false; refresh(0); }
      else if (act === 'tackle') G.fire[0] = false;
    };
    btn.addEventListener('pointerup', end); btn.addEventListener('pointercancel', end);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });
})();
