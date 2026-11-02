/* main.js - menu, scoreboard, sound, pause, full time, and the game loop. */
(function () {
  const G = window.G;
  const $ = (id) => document.getElementById(id);
  const stage = $('stage'), cv = $('c'), ctx = cv.getContext('2d'), gl = $('gl'), hud2 = $('hud2d'), h2 = hud2.getContext('2d');
  const menu = $('menu'), pauseEl = $('pause'), endEl = $('end'), hud = $('hud'), touch = $('touch');
  const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
  const sel = { game: 'football', mode: 'solo', team: 0, home: 0, away: 1, half: 180, diff: 'normal', pace: 0.62 };
  let paused = false, endTimer = 0, endShown = false;

  /* ---------------- sound (all synthesised, nothing to download) ---------------- */
  let ac = null, crowd = null, cheer = 0, muted = false;
  function audio() {
    if (ac) return ac;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 0.6;
      crowd = ac.createGain(); crowd.gain.value = 0;
      src.connect(f); f.connect(crowd); crowd.connect(ac.destination); src.start();
    } catch (e) { ac = null; }
    return ac;
  }
  function tone(f, dur, type, vol, delay, f2) {
    if (muted || !G.running) return;
    try {
      const a = audio(); if (!a) return;
      const t0 = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f2 || f, t0 + dur);
      g.gain.setValueAtTime(vol || 0.15, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) { /* sound is optional */ }
  }
  G.tone = tone;
  const whistle = () => { tone(2750, 0.32, 'sine', 0.12, 0, 2700); tone(2950, 0.32, 'sine', 0.09, 0.01, 2900); };

  /* ---------------- scoreboard messages ---------------- */
  let toastT = 0, bannerT = 0, cardT = 0;
  function toast(text) { const t = $('toast'); t.textContent = text; t.classList.add('show'); toastT = 2.4; }
  function banner(h, p, cls) { const b = $('banner'); b.className = 'banner show ' + (cls || ''); $('banner-h').textContent = h; $('banner-p').textContent = p || ''; bannerT = 3.2; }
  function cardFlash(card, who) {
    const el = $('cardflash'), T = G.TEAMS[who.team];
    el.className = 'cardflash show ' + (card === 'yellow' ? 'yellow' : 'red');
    $('cf-t').textContent = card === 'yellow' ? 'Yellow card' : card === 'second' ? 'Second yellow, sent off' : 'Red card, sent off';
    $('cf-p').textContent = '#' + who.num + ' ' + who.name + ' (' + T.short + ')';
    cardT = 2.6;
  }
  const RS = { freekick: 'Free kick', penalty: 'Penalty!', corner: 'Corner', throwin: 'Throw-in', goalkick: 'Goal kick' };

  const last2 = (p) => p.name.split(' ')[1];
  G.hooks = {
    kick: (sp) => { tone(120 + sp * 0.05, 0.09, 'sine', 0.16, 0, 60); },
    shot: (p) => { tone(150, 0.14, 'sine', 0.3, 0, 50); cheer = Math.max(cheer, 0.35); if (G.running) { toast(last2(p) + ' shoots!'); if (G.rumble) G.rumble(120, 0.4, 0.2); if (G.R3.shake) G.R3.shake(0.12); } },
    save: (caught, k) => { tone(240, 0.12, 'square', 0.07, 0, 120); cheer = Math.max(cheer, 0.5); if (G.running && k) toast(caught ? 'Great save, ' + last2(k) + '!' : last2(k) + ' parries it away'); },
    miss: (p, kind) => { if (G.running) toast(kind === 'over' ? 'Over the bar!' : 'Just wide!'); },
    post: () => { if (G.rumble) G.rumble(250, 0.7, 0.3); tone(1100, 0.3, 'triangle', 0.16, 0, 700); cheer = Math.max(cheer, 0.6); if (G.running) { toast('Off the woodwork!'); G.R3.shake(0.3); } },
    tackle: () => tone(90, 0.12, 'sine', 0.2, 0, 50),
    slide: () => tone(110, 0.25, 'sawtooth', 0.04, 0, 60),
    whistle,
    foul: (off, vic, card, pen) => {
      if (!G.running) return;
      toast(off.name + ' fouls ' + vic.name + (pen ? ', penalty!' : ''));
      if (card) cardFlash(card, off);
      cheer = Math.max(cheer, 0.3);
    },
    restart: (rs) => {
      if (!G.running) return;
      if (RS[rs.type]) toast(RS[rs.type] + ', ' + G.TEAMS[rs.team].name);
      if (rs.type === 'penalty') {
        const mm = G.m;
        if (G.isH(rs.team)) setTimeout(() => G.running && mm === G.m && toast('Aim with the stick, hold SHOOT for power'), 1400);
        else if (G.isH(1 - rs.team)) setTimeout(() => G.running && mm === G.m && toast('Keeper: lean with the stick, then dive left or right as he shoots!'), 1400);
      }
    },
    goal: (t, who, og) => {
      if (!G.running) return;
      const sc = who && who.team === t ? who : null;
      G.gc = sc ? { p: sc, x: sc.x, y: sc.y, fx: G.atkDir(t), fy: 0, id: sc.celeb } : null;
      banner(sc && sc.celeb === 0 ? 'Siuuuu!' : 'Goal!', (who ? who.name : '') + (og ? ' (own goal)' : '') + ", " + G.minute() + "'", 't' + t);
      if (sc && sc.celeb === 0 && !muted) { try { const u = new SpeechSynthesisUtterance('Suuuuuiiii'); u.rate = 0.9; u.pitch = 0.7; u.volume = 0.8; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { /* no speech on this device */ } }
      tone(523, 0.16, 'triangle', 0.18); tone(659, 0.16, 'triangle', 0.18, 0.12); tone(784, 0.4, 'triangle', 0.2, 0.24);
      cheer = 1.4; whistle();
      if (G.R3.confetti) { G.R3.confetti(G.goalX(t)); G.R3.shake(0.5); }
      G.startReplay(); if (G.rumble) G.rumble(700, 0.9, 0.6);
    },
    halftime: () => { if (G.running) banner('Half time', G.TEAMS[0].short + ' ' + G.m.score[0] + ' - ' + G.m.score[1] + ' ' + G.TEAMS[1].short); },
    secondhalf: () => { if (G.running) toast('Second half, teams swap ends'); },
    fulltime: () => { if (G.running) { banner('Full time', G.TEAMS[0].short + ' ' + G.m.score[0] + ' - ' + G.m.score[1] + ' ' + G.TEAMS[1].short); cheer = 1; } },
  };

  /* ---------------- menu, pause, full time ---------------- */
  function startDemo() { G.mode = 'cpu'; G.newMatch({ human: -1, humans: [false, false], halfLen: 75, diff: 'normal' }); }

  function startFB() {
    if (!use3d) { toast('FutBasket needs 3D graphics, which this browser could not start'); return; }
    audio(); G.running = true; paused = false; endShown = false; endTimer = 0;
    G.setTeams(sel.home, sel.away); G.mode = 'solo';
    G.fb.start({ humans: [sel.mode !== 'cpu', false], diff: sel.diff });
    R.fbBuild();
    $('t0').textContent = 'BLU'; $('t1').textContent = 'RED'; $('k0').style.background = '#2f7bff'; $('k1').style.background = '#ff3b4d';
    menu.hidden = true; endEl.hidden = true; pauseEl.hidden = true; hud.hidden = false; touch.hidden = true;
    $('power').hidden = $('power2').hidden = true;
    toast(sel.mode === 'cpu' ? 'FutBasket: watch the CPUs play' : 'FutBasket! A/D run, W jump, click to flick, click again to volley it in');
  }

  function startMatch() {
    if (sel.game === 'futbasket') return startFB();
    audio(); G.running = true; paused = false; endShown = false; endTimer = 0;
    G.setTeams(sel.home, sel.away);
    G.mode = sel.mode;
    G.newMatch({ human: sel.mode === 'cpu' ? -1 : 0, humans: [sel.mode !== 'cpu', sel.mode === 'duo'], halfLen: sel.half, diff: sel.diff });
    G.m.goalDur = 9; rec.length = 0; replay = null;
    $('t0').textContent = G.TEAMS[0].short; $('t1').textContent = G.TEAMS[1].short;
    $('k0').style.background = G.TEAMS[0].color; $('k1').style.background = G.TEAMS[1].color;
    menu.hidden = true; endEl.hidden = true; pauseEl.hidden = true; hud.hidden = false; touch.hidden = !isTouch;
    toast(sel.mode === 'duo' ? 'Kick off! P1 ' + G.TEAMS[0].short + ' vs P2 ' + G.TEAMS[1].short : sel.mode === 'cpu' ? 'Kick off. Sit back and watch' : 'Kick off. You are ' + G.TEAMS[0].name);
    $('power').hidden = $('power2').hidden = true; touch.hidden = !isTouch || sel.mode !== 'solo';
  }

  function leaveFB() {
    if (G.fb.active) { G.fb.stop(); $('clock').style.fontSize = ''; }
  }

  function toMenu() {
    leaveFB();
    G.running = false; paused = false; startDemo();
    menu.hidden = false; endEl.hidden = true; pauseEl.hidden = true; hud.hidden = true; touch.hidden = true;
  }

  function setPause(v) { paused = v; pauseEl.hidden = !v; if (v) $('resume').focus({ preventScroll: true }); }

  function showEnd() {
    endShown = true;
    const m = G.m, s = m.stats, a = G.TEAMS[0], b = G.TEAMS[1];
    const d = m.score[0] - m.score[1], wn = d > 0 ? a.name : b.name;
    $('end-h').textContent = d === 0 ? 'Draw' : sel.mode === 'solo' ? (d > 0 ? 'You win!' : 'You lose') : sel.mode === 'duo' ? (d > 0 ? 'Player 1 wins!' : 'Player 2 wins!') : wn + ' win';
    $('end-score').textContent = a.name + ' ' + m.score[0] + ' - ' + m.score[1] + ' ' + b.name;
    $('end-goals').textContent = m.goals.length ? m.goals.map((g) => g.who + (g.og ? ' (og)' : '') + " " + g.min + "' [" + G.TEAMS[g.team].short + ']').join('   ') : 'No goals';
    const rows = [['Shots', s.shots], ['Saves', s.saves], ['Passes', s.passes], ['Fouls', s.fouls], ['Yellow cards', s.yellow], ['Red cards', s.red]];
    $('end-stats').innerHTML = rows.map((r) => '<div class="row"><b>' + r[1][0] + '</b><span>' + r[0] + '</span><b>' + r[1][1] + '</b></div>').join('');
    endEl.hidden = false; $('again').focus({ preventScroll: true });
  }

  function showEndFB() {
    endShown = true;
    const F = G.fb, d = F.score[0] - F.score[1], s = F.stats;
    $('end-h').textContent = d === 0 ? 'Draw' : sel.mode === 'cpu' ? (d > 0 ? 'Blue win' : 'Red win') : d > 0 ? 'You win!' : 'You lose';
    $('end-score').textContent = 'Blue ' + F.score[0] + ' - ' + F.score[1] + ' Red';
    $('end-goals').textContent = 'Full time at the street court';
    const rows = [['Baskets', s.baskets], ['Volleys', s.volleys], ['Slide tackles', s.tackles], ['Headed blocks', s.blocks]];
    $('end-stats').innerHTML = rows.map((r) => '<div class="row"><b>' + r[1][0] + '</b><span>' + r[0] + '</span><b>' + r[1][1] + '</b></div>').join('');
    endEl.hidden = false; $('again').focus({ preventScroll: true });
  }
  function fbEvents(evs) {
    for (const e of evs) {
      if (e.k === 'flick') tone(300, 0.12, 'triangle', 0.14, 0, 560);
      else if (e.k === 'volley') { tone(120, 0.2, 'sawtooth', 0.2, 0, 45); tone(900, 0.06, 'square', 0.06, 0, 300); }
      else if (e.k === 'bounce') tone(150, 0.09, 'sine', 0.05 + 0.12 * e.v, 0, 80);
      else if (e.k === 'rim') tone(520, 0.22, 'triangle', 0.1 + 0.1 * e.v, 0, 380);
      else if (e.k === 'board') tone(330, 0.12, 'square', 0.07, 0, 200);
      else if (e.k === 'jump') tone(240, 0.08, 'sine', 0.05, 0, 400);
      else if (e.k === 'slide') tone(200, 0.2, 'sawtooth', 0.05, 0, 90);
      else if (e.k === 'tackle') tone(110, 0.22, 'sawtooth', 0.14, 0, 55);
      else if (e.k === 'header') tone(230, 0.1, 'square', 0.08, 0, 150);
      else if (e.k === 'score') { cheer = 1; [1800, 1500, 1200, 900].forEach((f, i) => tone(f, 0.16, 'sine', 0.08, i * 0.05, f * 0.6)); [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.09, 0.2 + i * 0.09)); banner(e.pts === 3 ? 'Three!' : 'Swish!', (e.team === 0 ? 'Blue' : 'Red') + ' +' + e.pts, ''); }
      else if (e.k === 'go') { whistle(); }
      else if (e.k === 'sudden') banner('Golden basket', 'Next basket wins', '');
      else if (e.k === 'end') whistle();
    }
  }
  function fbHud(dt) {
    const F = G.fb; $('s0').textContent = F.score[0]; $('s1').textContent = F.score[1];
    const tl = Math.max(0, Math.ceil(F.timeLeft)), c = $('clock'); c.textContent = F.sudden ? 'GOLD' : Math.floor(tl / 60) + ':' + ('0' + (tl % 60)).slice(-2);
    if (toastT > 0 && (toastT -= dt) <= 0) $('toast').classList.remove('show');
    if (bannerT > 0 && (bannerT -= dt) <= 0) $('banner').classList.remove('show');
    $('replaybadge').hidden = true; $('skip').hidden = true; $('lbt').classList.remove('on'); $('lbb').classList.remove('on');
  }

  function group(sel_, attr, onPick) {
    document.querySelectorAll(sel_).forEach((btn) => btn.addEventListener('click', () => {
      document.querySelectorAll(sel_).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      onPick(btn.dataset[attr]);
    }));
  }
  // team pickers: 15 clubs
  const homeSel = $('homeSel'), awaySel = $('awaySel');
  G.ALL.forEach((T, i) => {
    const label = T.name + ' (' + T.country + ')  ' + G.teamRating(i);
    homeSel.add(new Option(label, i)); awaySel.add(new Option(label, i));
  });
  function picked() {
    if (sel.away === sel.home) sel.away = (sel.home + 1) % G.ALL.length;
    homeSel.value = sel.home; awaySel.value = sel.away;
    G.setTeams(sel.home, sel.away); if (!G.running) startDemo(); buildSquads();
  }
  homeSel.addEventListener('change', () => { sel.home = +homeSel.value; picked(); homeSel.blur(); });
  awaySel.addEventListener('change', () => { sel.away = +awaySel.value; picked(); awaySel.blur(); });
  // controller: d-pad left/right changes your team, up/down the opponent
  G.menuNav = (which, d) => { const n = G.ALL.length; if (which === 'home') sel.home = (sel.home + d + n) % n; else sel.away = (sel.away + d + n) % n; picked(); };
  group('#modes button', 'mode', (v) => {
    sel.mode = v; G.mode = v === 'duo' ? 'duo' : 'solo';
    $('homeLab').textContent = v === 'duo' ? 'Player 1 team' : v === 'cpu' ? 'Home team' : 'Your team';
    $('awayLab').textContent = v === 'duo' ? 'Player 2 team' : 'Opponent';
    $('keyhelp').textContent = v === 'duo' ? G.keyHelp.duo : G.keyHelp.solo;
  });
  group('#games button', 'game', (v) => {
    sel.game = v; const fbk = v === 'futbasket';
    $('menuTitle').textContent = fbk ? 'FutBasket' : 'Pick your teams';
    $('paceRow').hidden = fbk; $('fbhelp').hidden = !fbk; $('halfLab').parentElement.hidden = fbk;
    $('start').textContent = fbk ? "Let's go" : 'Kick off';
    $('keyhelp').parentElement.hidden = fbk;
  });
  group('#halves button', 'half', (v) => { sel.half = +v; });
  group('#diffs button', 'diff', (v) => { sel.diff = v; });
  group('#paces button', 'pace', (v) => { sel.pace = +v; });
  $('start').addEventListener('click', startMatch);
  $('again').addEventListener('click', toMenu);
  $('resume').addEventListener('click', () => setPause(false));
  $('quit').addEventListener('click', toMenu);
  $('pausebtn').addEventListener('click', () => { if (G.running && !endShown) setPause(!paused); });
  $('mute').addEventListener('click', (e) => { muted = !muted; e.currentTarget.textContent = muted ? 'Sound off' : 'Sound on'; e.currentTarget.setAttribute('aria-pressed', String(muted)); });

  /* ---------------- squad cards ---------------- */
  const CELEB_NAMES = ['SIUU', 'aeroplane', 'knee slide', 'backflip', 'spin', 'dab', 'meditation', 'shush', 'arms crossed', 'point to sky'];
  function buildSquads() {
    const root = $('squads'); root.innerHTML = '';
    G.TEAMS.forEach((T, ti) => {
      const sec = document.createElement('section'); sec.className = 'squad';
      const avg = Math.round(G.makePlayers(ti).reduce((a, p) => a + p.ovr, 0) / 11);
      sec.innerHTML = '<h3><i style="background:' + T.color + '"></i>' + T.name + '<span>Team rating ' + avg + '</span></h3><div class="plist"></div>';
      const list = sec.querySelector('.plist');
      G.makePlayers(ti).forEach((p) => {
        const row = document.createElement('div'); row.className = 'pcard';
        const cvp = document.createElement('canvas'); cvp.width = cvp.height = 112; cvp.className = 'face';
        G.drawPortrait(cvp.getContext('2d'), p, 112);
        const txt = document.createElement('div');
        txt.innerHTML = '<b>' + p.name + '</b><small>#' + p.num + ' &middot; ' + p.role + ' &middot; goal dance: ' + CELEB_NAMES[p.celeb] + '</small><small>' +
          (p.grp === 'GK' ? 'KEEP ' + p.keep : 'PAC ' + p.pace + ' &middot; SHO ' + p.shot + ' &middot; PAS ' + p.pass + ' &middot; TCK ' + p.tackle) + '</small>';
        const o = document.createElement('div'); o.className = 'ovr'; o.textContent = p.ovr;
        row.append(cvp, txt, o); list.appendChild(row);
      });
      root.appendChild(sec);
    });
  }

  /* ---------------- 3D view, replay and the loop ---------------- */
  const R = G.R3;
  let use3d = false;
  try { R.setup(gl); use3d = true; } catch (e) { use3d = false; }
  if (use3d) cv.hidden = true; else gl.hidden = true;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), w = stage.clientWidth, h = stage.clientHeight;
    cv.width = hud2.width = Math.max(2, Math.round(w * dpr)); cv.height = hud2.height = Math.max(2, Math.round(h * dpr));
    if (use3d) R.resize(w, h);
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  window.addEventListener('resize', resize);

  // The last few seconds are recorded so a goal can be replayed in slow motion.
  const rec = []; let replay = null, rp = null;
  const rpBall = { x: 0, y: 0, z: 0, vx: 0, vy: 0, spin: 0 }, rpRef = { x: 0, y: 0, fx: 1, fy: 0, moving: 0 }, mixed = [];
  function snap() {
    const m = G.m, b = m.ball, r = m.ref, a = [m.time, b.x, b.y, b.z, b.spin, b.vx, b.vy, r.x, r.y, r.fx, r.fy, r.moving || 0, 0];
    for (const p of m.players) a.push(p.x, p.y, p.fx, p.fy, p.vx, p.vy, p.anim, p.slideT, p.out ? 1 : 0, p.fallT, p.fallMax, p.fallKind);
    return a;
  }
  function pose(t) { // interpolate between two recorded frames
    let i = 0; while (i < replay.frames.length - 2 && replay.frames[i + 1][0] < t) i++;
    const A = replay.frames[i], B = replay.frames[i + 1], f = Math.max(0, Math.min(1, (t - A[0]) / ((B[0] - A[0]) || 1)));
    for (let k = 0; k < A.length; k++) mixed[k] = A[k] + (B[k] - A[k]) * f;
    const s = mixed, m = G.m;
    if (!rp) rp = m.players.map((p) => Object.create(p));
    Object.assign(rpBall, { x: s[1], y: s[2], z: s[3], spin: s[4], vx: s[5], vy: s[6] });
    Object.assign(rpRef, { x: s[7], y: s[8], fx: s[9], fy: s[10], moving: s[11] });
    let o = 13;
    rp.forEach((p, n) => { p.tackleCd = 0; p.x = s[o]; p.y = s[o + 1]; p.fx = s[o + 2]; p.fy = s[o + 3]; p.vx = s[o + 4]; p.vy = s[o + 5]; p.anim = s[o + 6]; p.slideT = s[o + 7]; p.out = A[o + 8] > 0.5; p.fallT = s[o + 9]; p.fallMax = s[o + 10]; p.fallKind = A[o + 11]; o += 12; });
    return { players: rp, ball: rpBall, ref: rpRef };
  }
  function startReplay() {
    const m = G.m, frames = rec.filter((f) => f[0] >= m.time - 3.8);
    if (frames.length > 8) {
      replay = { frames, start: frames[0][0], t: frames[0][0], end: frames[frames.length - 1][0], pass: 0 };
      const len = replay.end - replay.start;
      m.goalDur = 3.8 + len / 0.6 + (len > 2.5 ? 0.3 + 2.2 / 0.4 : 0) + 0.8;
    } else { replay = null; m.goalDur = 4.2; }
  }
  G.startReplay = startReplay;
  $('skip').addEventListener('click', () => { if (G.running) G.m.phaseT = Math.max(G.m.phaseT, G.m.goalDur || 0); });
  $('cambtn').addEventListener('click', (e) => { if (use3d) { toast('Camera: ' + R.nextCam()); } e.currentTarget.blur(); });

  function updateHud(dt) {
    const m = G.m;
    $('s0').textContent = m.score[0]; $('s1').textContent = m.score[1];
    $('clock').textContent = m.phase === 'half' ? 'HT' : m.phase === 'full' ? 'FT' : G.minute() + "'";
    if (toastT > 0 && (toastT -= dt) <= 0) $('toast').classList.remove('show');
    if (bannerT > 0 && (bannerT -= dt) <= 0) $('banner').classList.remove('show');
    if (cardT > 0 && (cardT -= dt) <= 0) $('cardflash').classList.remove('show');
    [['power', 1, m.ctrl], ['power2', 2, m.ctrl2]].forEach(([id, n, ctl]) => {
      const c = G.charge(n), pw = $(id), sure = c.kind === 'shoot' && c.v >= 0.68;
      pw.hidden = c.v <= 0 || !ctl || m.ball.owner !== ctl;
      if (pw.hidden) return;
      $(id + '-fill').style.width = Math.round(c.v * 100) + '%'; pw.className = 'power' + (n === 2 ? ' p2 ' : ' ') + (sure ? 'sure' : c.kind);
      $(id + '-l').textContent = (sel.mode === 'duo' ? 'P' + n + ' ' : '') + (sure ? 'Power shot!' : c.kind === 'shoot' ? 'Shoot' : 'Pass');
    });
  }

  let last = performance.now();
  function frame(now) {
    const rdt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
    const I = G.input;
    if (I.pause) { I.pause = false; if (G.running && !endShown) setPause(!paused); }
    if (I.cam) { I.cam = false; if (use3d && G.running) toast('Camera: ' + R.nextCam()); }
    if (G.fb.active) {
      I.cam = false;
      const F = G.fb;
      if (!paused) F.step(rdt);
      const evs = F.ev; F.ev = [];
      fbEvents(evs);
      R.fbRender(rdt, evs, h2, hud2.width, hud2.height);
      fbHud(rdt);
      if (F.over && !endShown) { endTimer += rdt; if (endTimer > 2) showEndFB(); }
      cheer = Math.max(0, cheer - rdt * 0.45);
      if (crowd) crowd.gain.setTargetAtTime(muted ? 0 : 0.02 + cheer * 0.1, ac.currentTime, 0.15);
      requestAnimationFrame(frame); return;
    }
    const m0 = G.m;
    if (!paused) {
      G.step(rdt * (G.running ? sel.pace : 0.8));
      if (G.running && m0.phase === 'play') { rec.push(snap()); while (rec.length > 4 && rec[0][0] < m0.time - 5) rec.shift(); }
    }
    const m = G.m;
    if (!G.running && m.over) startDemo();
    if (G.running && m.over && !endShown) { endTimer += rdt; if (endTimer > 2) showEnd(); }

    let src = { players: m.players, ball: m.ball, ref: m.ref }, view = {}, replaying = false;
    if (G.running && m.phase === 'goal') {
      if (replay && m.phaseT >= 3.8) {
        if (!paused) {
          replay.t += rdt * (replay.pass === 0 ? 0.6 : 0.4);
          if (replay.t >= replay.end) { if (replay.pass === 0 && replay.end - replay.start > 2.5) { replay.pass = 1; replay.t = replay.end - 2.2; } else replay.t = replay.end; }
        }
        src = pose(replay.t); replaying = true;
        view = replay.pass === 0 ? { replay: true, preset: { back: 17, up: 8, fov: 32 } } : { replay: true, goalCam: { x: G.goalX(m.scorer) } };
      } else {
        const g = G.gc, t = m.phaseT;
        if (g) {
          const pose = Object.create(g.p); pose.x = g.x; pose.y = g.y; pose.fx = g.fx; pose.fy = g.fy; pose.vx = pose.vy = 0; pose.slideT = 0;
          const up = 0;
          view = { preset: { back: 11, up: 4.6, fov: 42 }, celebrateIdx: m.players.indexOf(g.p), celeb: { pose, t, id: g.id }, focus: { x: g.x, y: g.y }, face: t > 0.8 ? g : null };
        } else view = { preset: { back: 11, up: 4.6, fov: 42 } };
      }
    }
    if (G.running && !replaying && (m.phase === 'restart' || m.phase === 'play') && ((m.rs && m.rs.type === 'penalty' && m.rs.taker) || (m.penCamUntil && m.time < m.penCamUntil))) {
      const tk = (m.rs && m.rs.taker) || m.penTaker;
      if (tk) view = { penCam: { x: tk.x, y: tk.y, d: G.atkDir(tk.team), gx: G.goalX(tk.team) } };
    }
    $('replaybadge').hidden = !replaying; $('lbt').classList.toggle('on', replaying); $('lbb').classList.toggle('on', replaying);
    $('replaybadge').textContent = replay && replay.pass === 1 ? 'Replay · goal cam' : 'Replay'; $('skip').hidden = !(G.running && m.phase === 'goal' && m.phaseT > 1.5);
    if (use3d) { R.render(src, rdt, view); h2.clearRect(0, 0, hud2.width, hud2.height); if (G.running && !replaying) G.drawRadar(h2, hud2.width); }
    else G.draw(ctx, cv.width, cv.height, rdt, stage.clientWidth);
    if (G.running) updateHud(rdt);
    if (G.R3) G.R3.cheerLevel = G.running ? cheer * 0.8 : 0.05;
    cheer = Math.max(0, cheer - rdt * 0.45);
    if (crowd) { crowd.gain.setTargetAtTime(muted || !G.running ? 0 : 0.03 + cheer * 0.11, ac.currentTime, 0.15); }
    requestAnimationFrame(frame);
  }

  window.addEventListener('gamepadconnected', () => toast('Controller connected'));
  $('keyhelp').textContent = G.keyHelp.solo;
  picked();
  resize();
  requestAnimationFrame(frame);
})();
