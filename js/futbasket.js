/* futbasket.js - FutBasket: a 3D side-scrolling street arcade game played inside Matchday XI.
   Football meets basketball: dribble a soccer ball along a street court, flick it up, then volley it through the hoop.
   Part 1 is the pure game logic (no drawing). Part 2 is the Three.js scene, the characters and the 2D overlay.
   Units are metres. x runs along the court (Blue attacks the right hoop), y is height, players stay on the x/y plane. */
(function () {
  const G = window.G, T = window.THREE, R = G.R3 || {};
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), hyp = Math.hypot, rnd = Math.random;
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;

  /* ---------------- constants ---------------- */
  const GRAV = 22;            // ball gravity (m/s^2)
  const PGRAV = 28;           // player gravity
  const BR = 0.22;            // ball radius
  const HOOP_Y = 3.05, HOOP_X = 12.6, RIM_R = 0.45, XMAX = 14.4; // rim height, rim centre, rim radius, court end
  const RUN = 5.0, JUMP_V = 9.2; // run speed (m/s) and jump launch speed
  const THREE_PT = 7.5;       // a basket scored from further than this counts 3
  const GAME_LEN = 120;       // 2 minute match
  const BLUE = 0x2f7bff, RED = 0xff3b4d;
  const SKILL = { easy: 0.75, normal: 0.95, hard: 1.12 };

  const FB = (G.fb = { active: false, over: false, ev: [], keys: {}, q: { jump: false, slide: false, act: false, swap: false } });
  const ev = (o) => { if (FB.ev.length < 120) FB.ev.push(o); };
  const dirOf = (t) => (t === 0 ? 1 : -1);

  /* ---------------- setup ---------------- */
  FB.start = function (o) {
    Object.assign(FB, {
      active: true, over: false, ev: [], humans: o.humans || [true, false], skill: SKILL[o.diff] || 0.95,
      timeLeft: GAME_LEN, sudden: false, score: [0, 0], phase: 'intro', phaseT: 0, introLen: 3, time: 0, players: [], chaser: [null, null],
      ball: { x: 0, y: BR, vx: 0, vy: 0, owner: null, last: null, lock: 0, rimCd: 0, shot: null, bounces: 0 },
      winner: -1, last: null, shotId: 0, stats: { baskets: [0, 0], volleys: [0, 0], tackles: [0, 0], blocks: [0, 0] }, ctrl: null,
    });
    FB.q = { jump: false, slide: false, act: false, swap: false };
    for (let t = 0; t < 2; t++) {
      for (let i = 0; i < 2; i++) {
        FB.players.push({
          team: t, idx: i, human: false, x: 0, y: 0, vx: 0, vy: 0, face: dirOf(t), st: 'idle', stT: 0, slCd: 0, kickCd: 0, kickT: 0, kickKind: '',
          immune: 0, sd: 1, slHit: false, anim: rnd() * 6, lane: [0.5, -0.7][i] + t * 0.25, aiT: 0, aiVol: 0, react: null, shootD: 6.5 + rnd() * 3, think: 0,
        });
      }
    }
    FB.ctrl = FB.humans[0] ? FB.players[0] : null;
    if (FB.ctrl) FB.ctrl.human = true;
    FB.kickoff();
    return FB;
  };
  FB.stop = function () { FB.active = false; FB.ev = []; if (R.fbDestroy) R.fbDestroy(); };

  // everyone back to their starting spots, ball on the centre spot
  FB.kickoff = function () {
    const xs = [[-3.5, -9], [3.5, 9]];
    for (const p of FB.players) { p.x = xs[p.team][p.idx]; p.y = 0; p.vx = p.vy = 0; p.face = dirOf(p.team); p.st = 'idle'; p.stT = 0; p.kickT = 0; p.immune = 0; p.kickCd = 0.3; }
    Object.assign(FB.ball, { x: 0, y: BR, vx: 0, vy: 0, owner: null, last: null, lock: 0, shot: null, bounces: 0, rimCd: 0 });
    FB.phase = 'intro'; FB.phaseT = 0; FB.introLen = FB.time < 0.1 ? 3 : 1.6;
  };

  /* ---------------- the shot: a ballistic arc that is aimed at the rim ---------------- */
  // Works out the launch velocity that carries the ball through the hoop, then adds a small aim error.
  // Errors grow with distance, and a nearby defender makes it harder. "volley" is flatter and faster than a lob.
  function shootAt(p, kind) {
    const b = FB.ball, dir = dirOf(p.team), hx = dir * HOOP_X, dist = Math.abs(hx - b.x);
    let sig = (0.03 + 0.009 * dist) * (p.human ? 1 : (1.45 - FB.skill * 0.3) * 1.35);
    if (FB.players.some((q) => q.team !== p.team && Math.abs(q.x - p.x) < 2.2 && q.st !== 'stumble')) sig *= 1.45;
    const tx = hx + gauss() * sig;
    let Tm = clamp(dist / 17 + 0.35, 0.45, 1.6) * (kind === 'volley' ? 0.86 : 1), vx = 0, vy = 0;
    for (let k = 0; k < 22; k++) {
      vx = (tx - b.x) / Tm; vy = (HOOP_Y - b.y + 0.5 * GRAV * Tm * Tm) / Tm;
      const vEnd = vy - GRAV * Tm;                        // vertical speed when the ball reaches the rim (negative = coming down)
      if (vEnd < -Math.abs(vx) * 0.8 || Tm > 2.4) break;  // steep enough entry angle to drop through the net
      Tm += 0.05;
    }
    vx = clamp(vx, -26, 26);
    b.owner = null; b.vx = vx; b.vy = vy; b.lock = 0.25; b.last = p; b.bounces = 0;
    b.shot = { team: p.team, dist, t: 0, id: ++FB.shotId };
    p.face = dir; p.kickT = kind === 'volley' ? 0.5 : 0.32; p.kickKind = kind; p.kickCd = 0.45;
    FB.stats.volleys[p.team]++;
    ev({ k: 'volley', p, power: Math.abs(vx) });
  }

  /* ---------------- the action button (left click) ---------------- */
  function doAct(p) {
    if (p.st === 'stumble' || p.st === 'slide' || p.st === 'recover' || p.kickCd > 0 || FB.phase !== 'play') return false;
    const b = FB.ball;
    if (b.owner === p) { // FLICK: launch the dribbled ball up in a clean arc
      b.owner = null; b.vx = p.face * 2.4 + p.vx * 0.45; b.vy = 8.8; b.lock = 0.3; b.last = p; b.bounces = 0; b.shot = null;
      p.kickT = 0.3; p.kickKind = 'flick'; p.kickCd = 0.35; ev({ k: 'flick', p }); return true;
    }
    if (b.owner) return false;
    const dx = b.x - p.x, dy = b.y - p.y;
    if (Math.abs(dx) < 1.55 && dy > 0.4 && dy < 2.8 && b.y > 0.5) { shootAt(p, 'volley'); return true; } // VOLLEY / bicycle kick
    if (Math.abs(dx) < 0.85 && b.y < 0.5) { // a ball rolling at the feet can also be scooped up
      b.vx = p.face * 2.4 + p.vx * 0.45; b.vy = 8.8; b.lock = 0.3; b.last = p; b.shot = null;
      p.kickT = 0.3; p.kickKind = 'flick'; p.kickCd = 0.35; ev({ k: 'flick', p }); return true;
    }
    return false;
  }

  /* ---------------- computer players ---------------- */
  function aiIntent(p, dt) {
    const it = { mx: 0, jump: false, slide: false, act: false }, b = FB.ball, sk = FB.skill, dir = dirOf(p.team);
    const hx = dir * HOOP_X, own = -hx;
    const foes = FB.players.filter((q) => q.team !== p.team), mates = FB.players.filter((q) => q.team === p.team && q !== p);
    const has = b.owner === p, foeHas = b.owner && b.owner.team !== p.team, teamHas = b.owner && b.owner.team === p.team;
    const chaser = FB.chaser[p.team] === p;
    let tx = p.x; p.aiVol = Math.max(0, p.aiVol - dt);
    if (has) { // dribble towards the hoop, flick it up when in range, then go under it for the volley
      tx = hx - dir * p.shootD;
      if (Math.abs(hx - p.x) <= p.shootD + 0.2) {
        tx = p.x; p.aiT += dt;
        if (p.aiT > 0.18 / sk) { it.act = true; p.aiT = 0; p.aiVol = 1.6; p.shootD = 6.2 + rnd() * 3.6; }
      }
      const sl = foes.find((q) => q.st === 'slide' && Math.abs(q.x - p.x) < 2.3 && (q.x - p.x) * dir > -0.5); // hop over an incoming slide tackle
      if (sl && p.y < 0.01 && rnd() < dt * 9 * sk) it.jump = true; // sometimes hop over an incoming slide
    } else if (!b.owner) {
      const dx = b.x - p.x;
      if (chaser || p.aiVol > 0) {
        tx = b.x + b.vx * 0.18;
        const inRange = Math.abs(hx - p.x) < 12.2;
        const sweet = b.y > 0.9 && b.y < 2.4 && Math.abs(dx) < 1.2 && b.vy < 1.8 && inRange;
        if (sweet && p.kickCd <= 0) { p.react = p.react == null ? (0.05 + rnd() * 0.2) / sk : p.react - dt; if (p.react <= 0) { it.act = true; p.react = null; } } else p.react = null;
        if (!sweet && b.y > 1 && Math.abs(dx) < 0.8) tx = p.x; // wait under a falling ball
      } else { const teamMid = (b.x + own) * 0.5; tx = clamp(teamMid, -11, 11); }
    } else if (foeHas) {
      const o = b.owner;
      if (chaser) {
        tx = o.x + o.vx * 0.22; const dx = o.x - p.x;
        if (Math.abs(dx) < 1.75 && p.slCd <= 0 && dx * p.face > 0 && p.y < 0.01 && rnd() < dt * 4.5 * sk) it.slide = true;
      } else tx = clamp(own * 0.6 + b.x * 0.4, -11.5, 11.5);
    } else if (teamHas) tx = clamp(b.owner.x + dir * 3.4, -11.5, 11.5);
    // rim protection: when a shot is flying at our hoop the nearest defender goes under it and jumps for a header
    if (!has && !b.owner && b.vx * dir < -0.5 && Math.abs(b.x - own) < 8.5 && b.y > 1.4) {
      const mine = FB.players.filter((q) => q.team === p.team).sort((a, c) => Math.abs(a.x - b.x) - Math.abs(c.x - b.x))[0];
      if (mine === p) {
        tx = clamp(b.x + b.vx * 0.3, -XMAX + 1, XMAX - 1);
        if (b.shot && p.rollId !== b.shot.id) { p.rollId = b.shot.id; p.willBlock = rnd() < 0.32 * sk; } // decide once per shot whether to go for the block
        if (p.willBlock && Math.abs(b.x - p.x) < 2.2 && b.y > 1.8 && b.y < 4.2 && p.y < 0.02) it.jump = true;
      }
    }
    const d = tx - p.x; it.mx = Math.abs(d) < 0.14 ? 0 : clamp(d / 0.5, -1, 1);
    return it;
  }

  /* ---------------- human input (keyboard, mouse, controller) ---------------- */
  function humanIntent(p) {
    const K = FB.keys, it = { mx: 0, jump: false, slide: false, act: false };
    it.mx = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0);
    if (FB.pad) it.mx = Math.abs(FB.pad.x) > 0.2 ? FB.pad.x : it.mx;
    if (FB.q.jump) { it.jump = true; FB.q.jump = false; }
    if (FB.q.slide) { it.slide = true; FB.q.slide = false; }
    if (FB.q.act) { it.act = true; FB.q.act = false; }
    return it;
  }

  /* ---------------- player physics ---------------- */
  function updatePlayer(p, it, dt) {
    const b = FB.ball, sk = p.human ? 1 : 0.9 + FB.skill * 0.1;
    p.kickCd = Math.max(0, p.kickCd - dt); p.kickT = Math.max(0, p.kickT - dt); p.slCd = Math.max(0, p.slCd - dt); p.immune = Math.max(0, p.immune - dt);
    p.anim += dt * Math.abs(p.vx) * 2.2;
    const ground = p.y <= 0.0001;
    if (p.st === 'stumble') { // a clean 1 second stagger: slow, no ball, no flashing
      p.stT -= dt; p.vx += (it.mx * RUN * 0.2 - p.vx) * Math.min(1, dt * 5);
      if (p.stT <= 0) { p.st = 'idle'; p.immune = 1.2; }
    } else if (p.st === 'slide') {
      p.stT -= dt; const k = Math.max(0, p.stT / 0.5); p.vx = p.sd * (1.2 + 6.4 * k * k);
      if (!p.slHit) for (const q of FB.players) {
        if (q.team === p.team || q.immune > 0 || q.st === 'stumble' || q.y > 0.6 || Math.abs(q.x - p.x) > 0.85) continue;
        p.slHit = true; q.st = 'stumble'; q.stT = 1.0; q.vx += p.sd * 1.6; q.immune = 9;
        if (b.owner === q) { b.owner = null; b.vx = p.sd * 2.4; b.vy = 2.2; b.lock = 0.4; b.last = q; b.shot = null; }
        FB.stats.tackles[p.team]++; ev({ k: 'tackle', p, q }); break;
      }
      if (p.stT <= 0) { p.st = 'recover'; p.stT = 0.3; p.slCd = 1.3; }
    } else if (p.st === 'recover') { p.stT -= dt; p.vx *= Math.exp(-8 * dt); if (p.stT <= 0) p.st = 'idle'; }
    else {
      const air = ground ? 1 : 0.45, sp = RUN * (b.owner === p ? 0.93 : 1) * (p.human ? 1 : 0.92 + FB.skill * 0.08);
      p.st = 'idle';
      p.vx += (it.mx * sp - p.vx) * Math.min(1, dt * 10 * air);
      if (it.mx) p.face = it.mx > 0 ? 1 : -1; else if (Math.abs(p.vx) > 1.5) p.face = Math.sign(p.vx);
      if (Math.abs(p.vx) > 0.4 && ground) p.st = 'run';
      if (it.jump && ground) { p.vy = JUMP_V; ev({ k: 'jump', p }); }
      if (it.slide && ground && p.slCd <= 0) { p.st = 'slide'; p.stT = 0.5; p.sd = p.face; p.slHit = false; ev({ k: 'slide', p }); }
      if (it.act) doAct(p);
    }
    p.vy -= PGRAV * dt; p.y += p.vy * dt; if (p.y <= 0) { p.y = 0; if (p.vy < -2) ev({ k: 'land', p }); p.vy = 0; }
    p.x = clamp(p.x + p.vx * dt, -XMAX + 0.5, XMAX - 0.5);
  }

  /* ---------------- the ball ---------------- */
  function dropBall(vx, vy) { const b = FB.ball; b.last = b.owner; b.owner = null; b.vx = vx; b.vy = vy; b.lock = 0.35; }

  function stepBall(dt, live) {
    const b = FB.ball; b.lock = Math.max(0, b.lock - dt); b.rimCd = Math.max(0, b.rimCd - dt);
    const o = b.owner;
    if (o) { // dribbling: the ball is magnetised to a rolling spot just ahead of the feet
      if (o.st === 'stumble' || o.st === 'slide') dropBall(o.face * 1.2, 1.5);
      else { const tx = o.x + o.face * 0.62; b.x += (tx - b.x) * Math.min(1, dt * 16); b.y = BR; b.vx = o.vx; b.vy = 0; return; }
    }
    const py = b.y;
    b.vy -= GRAV * dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y <= BR) {
      b.y = BR;
      if (b.vy < -2.5) { ev({ k: 'bounce', v: Math.min(1, -b.vy / 14) }); b.vy = -b.vy * 0.56; b.vx *= 0.96; b.bounces++; } else b.vy = 0;
    }
    if (b.y <= BR + 0.002 && Math.abs(b.vy) < 0.01) { b.vx *= Math.exp(-1.5 * dt); if (Math.abs(b.vx) < 0.04) b.vx = 0; } // rolling friction
    else b.vx *= Math.exp(-0.05 * dt);
    if (b.bounces >= 2) b.shot = null;
    if (b.shot) b.shot.t += dt;
    if (b.x > XMAX) { b.x = XMAX; b.vx = -Math.abs(b.vx) * 0.45; ev({ k: 'fence' }); }
    if (b.x < -XMAX) { b.x = -XMAX; b.vx = Math.abs(b.vx) * 0.45; ev({ k: 'fence' }); }
    for (const s of [1, -1]) {
      // backboard
      const bx = s * (HOOP_X + 0.5);
      if (b.y > 2.85 && b.y < 4.3 && b.vx * s > 0 && (s > 0 ? b.x + BR > bx : b.x - BR < bx)) { b.x = bx - s * BR; b.vx = -b.vx * 0.55; ev({ k: 'board' }); }
      // the two rim points the ball can clang off
      for (const rx of [s * (HOOP_X - RIM_R), s * (HOOP_X + RIM_R)]) {
        const dx = b.x - rx, dy = b.y - HOOP_Y, d = hyp(dx, dy);
        if (d < BR + 0.03 && d > 0.001) {
          const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
          if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vy -= 1.6 * vn * ny; ev({ k: 'rim', v: Math.min(1, -vn / 10) }); }
          b.x = rx + nx * (BR + 0.03); b.y = HOOP_Y + ny * (BR + 0.03);
        }
      }
      // through the hoop, coming down inside the rim = basket
      if (live && b.rimCd <= 0 && b.vy < 0 && py >= HOOP_Y && b.y < HOOP_Y && Math.abs(b.x - s * HOOP_X) < 0.3) score(s > 0 ? 0 : 1, s);
    }
  }

  function score(team, side) {
    const b = FB.ball, shot = b.shot && b.shot.team === team ? b.shot : null, pts = shot && shot.dist >= THREE_PT ? 3 : 2;
    FB.score[team] += pts; FB.stats.baskets[team]++; b.rimCd = 1.2; b.vx *= 0.2;
    FB.phase = 'goal'; FB.phaseT = 0; FB.last = { team, pts, side, by: shot ? shot.by : b.last };
    ev({ k: 'score', team, pts, side, x: side * HOOP_X });
  }

  function endMatch() { FB.over = true; FB.phase = 'end'; FB.winner = FB.score[0] === FB.score[1] ? -1 : FB.score[0] > FB.score[1] ? 0 : 1; ev({ k: 'end' }); }

  /* ---------------- controller polling ---------------- */
  let padPrev = [];
  function pollPad() {
    FB.pad = null;
    const pads = navigator.getGamepads ? navigator.getGamepads() : []; const gp = pads && [...pads].find((q) => q && q.connected);
    if (!gp) return;
    const B = (n) => !!(gp.buttons[n] && gp.buttons[n].pressed), edge = (n) => B(n) && !padPrev[n];
    let x = gp.axes[0] || 0; if (B(14)) x = -1; if (B(15)) x = 1;
    FB.pad = { x };
    if (edge(0) || edge(7)) FB.q.jump = true;      // Cross / R2: jump
    if (edge(2) || edge(5)) FB.q.act = true;       // Square / R1: flick and volley
    if (edge(1)) FB.q.slide = true;                // Circle: slide
    if (edge(4)) FB.q.swap = true;                 // L1: swap player
    padPrev = gp.buttons.map((q, i) => B(i));
  }

  /* ---------------- main step ---------------- */
  FB.step = function (dt) {
    if (!FB.active || FB.over) return;
    dt = Math.min(dt, 0.05); FB.time += dt; FB.phaseT += dt; pollPad();
    const b = FB.ball;
    if (FB.phase === 'intro') {
      for (const p of FB.players) updatePlayer(p, { mx: 0, jump: false, slide: false, act: false }, dt);
      if (FB.phaseT >= FB.introLen) { FB.phase = 'play'; FB.phaseT = 0; ev({ k: 'go' }); }
      FB.q.act = FB.q.jump = FB.q.slide = FB.q.swap = false; return;
    }
    if (FB.phase === 'goal') {
      stepBall(dt, false);
      for (const p of FB.players) updatePlayer(p, { mx: 0, jump: false, slide: false, act: false }, dt);
      if (FB.phaseT > 2.4) { if (FB.sudden || FB.timeLeft <= 0) return endMatch(); FB.kickoff(); }
      return;
    }
    FB.timeLeft -= dt;
    if (FB.timeLeft <= 0) { if (FB.score[0] === FB.score[1]) { if (!FB.sudden) { FB.sudden = true; FB.timeLeft = 0; ev({ k: 'sudden' }); } } else return endMatch(); }
    // swap which team-mate you control
    if (FB.q.swap) { FB.q.swap = false; const other = FB.players.find((q) => q.team === 0 && q !== FB.ctrl); if (FB.ctrl && other) { FB.ctrl.human = false; FB.ctrl = other; other.human = true; ev({ k: 'swap', p: other }); } }
    for (let t = 0; t < 2; t++) FB.chaser[t] = FB.players.filter((q) => q.team === t && q.st !== 'stumble').sort((a, c) => Math.abs(a.x - b.x) - Math.abs(c.x - b.x))[0] || null;
    for (const p of FB.players) updatePlayer(p, p.human ? humanIntent(p) : aiIntent(p, dt), dt);
    // players are soft circles on the ground: they ease apart instead of overlapping or vibrating
    for (let i = 0; i < FB.players.length; i++) for (let j = i + 1; j < FB.players.length; j++) {
      const p = FB.players[i], q = FB.players[j]; if (p.y > 1 || q.y > 1) continue;
      const dx = q.x - p.x, ov = 0.7 - Math.abs(dx);
      if (ov > 0) { const sgn = dx === 0 ? (i < j ? 1 : -1) : Math.sign(dx), m = ov * 0.5 * Math.min(1, dt * 14); p.x = clamp(p.x - sgn * m, -XMAX + 0.5, XMAX - 0.5); q.x = clamp(q.x + sgn * m, -XMAX + 0.5, XMAX - 0.5); }
    }
    stepBall(dt, true);
    if (FB.phase !== 'play') return;
    // picking up a ball on the ground and heading it away
    let best = null;
    for (const p of FB.players) {
      if (b.owner || p.st === 'stumble' || p.st === 'slide' || p.st === 'recover' || p.y > 0.5 || b.y > 0.55 || Math.abs(b.vy) > 5 || Math.abs(b.vx) > 10) continue;
      if (b.lock > 0 && b.last === p) continue;
      const d = Math.abs(b.x - p.x); if (d < 0.58 && (!best || d < Math.abs(b.x - best.x))) best = p;
    }
    if (best) { b.owner = best; b.last = best; b.shot = null; b.bounces = 0; ev({ k: 'pickup', p: best }); }
    if (!b.owner) for (const p of FB.players) { // header: a jumping player meets the ball at head height
      if (p.y < 0.3 || (b.lock > 0 && b.last === p) || (b.shot && b.shot.team === p.team)) continue;
      if (hyp(b.x - p.x, b.y - (p.y + 1.72)) < 0.62) {
        const d = dirOf(p.team), toOwn = b.vx * d < -0.5 && Math.abs(b.x + d * HOOP_X) < 9;
        b.vx = d * 5.2 + p.vx * 0.3; b.vy = Math.max(3.6, Math.abs(b.vy) * 0.3); b.lock = 0.25; b.last = p; b.shot = null;
        if (toOwn) FB.stats.blocks[p.team]++; ev({ k: 'header', p, block: toOwn }); break;
      }
    }
  };

  /* =================================================================================================
     PART 2: Three.js view. Its own scene, camera, characters and 2D overlay. The renderer is shared with the football game.
     ================================================================================================= */
  let S = null; // everything that exists while FutBasket is running

  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const ctex = (c) => R.canvasTex ? R.canvasTex(c) : new T.CanvasTexture(c);
  const std = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.8, metalness: 0.05, flatShading: true }, o || {}));
  const basic = (c, o) => new T.MeshBasicMaterial(Object.assign({ color: c }, o || {}));

  /* ----- textures ----- */
  function courtTexture() { // concrete with neon paint. 30 m x 13 m
    const PW = 2040, PH = 884, sx = PW / 30, sy = PH / 13, c = cv(PW, PH), x = c.getContext('2d');
    x.fillStyle = '#585d69'; x.fillRect(0, 0, PW, PH);
    for (let i = 0; i < 14000; i++) { const g = 70 + Math.random() * 60; x.fillStyle = 'rgba(' + g + ',' + g + ',' + (g + 8) + ',' + (0.05 + Math.random() * 0.1) + ')'; x.fillRect(Math.random() * PW, Math.random() * PH, 1 + Math.random() * 3, 1 + Math.random() * 3); }
    x.strokeStyle = 'rgba(20,22,28,0.35)'; x.lineWidth = 1.5; // slab joints and cracks
    for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo(i * PW / 6, 0); x.lineTo(i * PW / 6, PH); x.stroke(); }
    for (let i = 1; i < 3; i++) { x.beginPath(); x.moveTo(0, i * PH / 3); x.lineTo(PW, i * PH / 3); x.stroke(); }
    const X = (wx) => (wx + 15) * sx, Z = (wz) => (wz + 6.5) * sy;
    x.fillStyle = 'rgba(255,60,140,0.20)'; x.fillRect(X(8.2), Z(-2.4), 5.8 * sx, 4.8 * sy); x.fillRect(X(-14), Z(-2.4), 5.8 * sx, 4.8 * sy); // the two keys
    x.fillStyle = 'rgba(61,242,255,0.08)'; x.beginPath(); x.arc(X(0), Z(0), 1.9 * sx, 0, 6.283); x.fill();
    const neon = (col, w, fn) => { x.save(); x.strokeStyle = col; x.lineWidth = w; x.shadowColor = col; x.shadowBlur = 16; x.lineCap = 'round'; fn(); x.restore(); };
    neon('#3df2ff', 6, () => { // court boundary, half-way line and circle
      x.strokeRect(X(-14), Z(-6), 28 * sx, 12 * sy); x.beginPath(); x.moveTo(X(0), Z(-6)); x.lineTo(X(0), Z(6)); x.stroke();
      x.beginPath(); x.arc(X(0), Z(0), 1.9 * sx, 0, 6.283); x.stroke();
    });
    neon('#ff4d9d', 5, () => { // keys and free-throw circles
      x.strokeRect(X(8.2), Z(-2.4), 5.8 * sx, 4.8 * sy); x.strokeRect(X(-14), Z(-2.4), 5.8 * sx, 4.8 * sy);
      x.beginPath(); x.arc(X(8.2), Z(0), 1.8 * sx, Math.PI / 2, Math.PI * 1.5); x.stroke(); x.beginPath(); x.arc(X(-8.2), Z(0), 1.8 * sx, -Math.PI / 2, Math.PI / 2); x.stroke();
    });
    neon('#ffe14a', 5, () => { // the 3-point arcs (7.5 m from the hoop)
      for (const s of [1, -1]) { x.save(); x.beginPath(); x.rect(X(-14), Z(-6), 28 * sx, 12 * sy); x.clip(); x.beginPath(); x.arc(X(s * HOOP_X), Z(0), THREE_PT * sx, s > 0 ? Math.PI / 2 : -Math.PI / 2, s > 0 ? Math.PI * 1.5 : Math.PI / 2); x.stroke(); x.restore(); }
    });
    x.fillStyle = 'rgba(255,255,255,0.55)'; x.font = '900 60px Impact, "Arial Black", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.save(); x.translate(X(0), Z(0)); x.fillText('FUTBASKET', 0, 0); x.restore();
    return ctex(c);
  }
  function fenceTexture() { const c = cv(128, 128), x = c.getContext('2d'); x.strokeStyle = 'rgba(190,200,215,0.9)'; x.lineWidth = 2.2; for (let i = -1; i < 5; i++) { x.beginPath(); x.moveTo(0, i * 32); x.lineTo(128, i * 32 + 128); x.stroke(); x.beginPath(); x.moveTo(0, i * 32 + 128); x.lineTo(128, i * 32); x.stroke(); } const t = ctex(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t; }
  function skylineTexture() {
    const c = cv(2048, 512), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#0a0f2a'); g.addColorStop(0.7, '#3a1a5a'); g.addColorStop(1, '#a8366e'); x.fillStyle = g; x.fillRect(0, 0, 2048, 512);
    for (let i = 0; i < 90; i++) { x.fillStyle = 'rgba(255,255,255,' + Math.random() * 0.7 + ')'; x.fillRect(Math.random() * 2048, Math.random() * 200, 2, 2); }
    let px = 0; while (px < 2048) { const w = 70 + Math.random() * 110, h = 150 + Math.random() * 270; x.fillStyle = 'rgb(' + (14 + Math.random() * 14) + ',' + (14 + Math.random() * 12) + ',' + (30 + Math.random() * 20) + ')'; x.fillRect(px, 512 - h, w, h);
      for (let yy = 512 - h + 14; yy < 500; yy += 20) for (let xx = px + 8; xx < px + w - 10; xx += 16) if (Math.random() < 0.4) { x.fillStyle = Math.random() < 0.7 ? 'rgba(255,215,120,0.85)' : 'rgba(110,230,255,0.85)'; x.fillRect(xx, yy, 7, 10); } px += w + 4; }
    return ctex(c);
  }
  function wallTexture() { // brick wall with graffiti blocks
    const c = cv(1024, 256), x = c.getContext('2d'); x.fillStyle = '#2c2430'; x.fillRect(0, 0, 1024, 256);
    for (let r = 0; r < 16; r++) for (let k = 0; k < 18; k++) { const o = (r % 2) * 28; x.fillStyle = 'rgba(' + (60 + Math.random() * 30) + ',' + (40 + Math.random() * 20) + ',' + (50 + Math.random() * 20) + ',0.55)'; x.fillRect(k * 56 + o + 2, r * 16 + 2, 52, 12); }
    const cols = ['#ff4d9d', '#3df2ff', '#ffe14a', '#7dff7a']; x.font = '900 70px Impact, sans-serif'; x.textBaseline = 'middle';
    [['HOOPS', 120, 130, 0], ['GOAL', 480, 120, 1], ['SWISH', 760, 135, 2]].forEach(([t, px, py, ci]) => { x.save(); x.translate(px, py); x.rotate(-0.08 + ci * 0.05); x.lineWidth = 8; x.strokeStyle = '#111'; x.strokeText(t, 0, 0); x.fillStyle = cols[ci]; x.fillText(t, 0, 0); x.restore(); });
    return ctex(c);
  }
  function signTexture() { const c = cv(1024, 256), x = c.getContext('2d'); x.clearRect(0, 0, 1024, 256); x.font = '900 170px Impact, "Arial Black", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = '#3df2ff'; x.shadowBlur = 34; x.fillStyle = '#e8fdff'; x.fillText('FUT', 270, 132); x.shadowColor = '#ff4d9d'; x.fillStyle = '#ffe4f0'; x.fillText('BASKET', 690, 132); return ctex(c); }

  /* ----- the court, fences, backdrop and hoops ----- */
  function buildWorld(scene) {
    scene.background = new T.Color(0x0b0f22); scene.fog = new T.Fog(0x120f2a, 38, 95);
    scene.add(new T.HemisphereLight(0xb8c8ff, 0x2a2438, 0.85));
    const sun = new T.DirectionalLight(0xfff0dc, 0.95); sun.position.set(6, 16, 10); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 9, bottom: -9, near: 3, far: 50 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; scene.add(sun, sun.target); S.sun = sun;
    const floor = new T.Mesh(new T.PlaneGeometry(30, 13), new T.MeshStandardMaterial({ map: courtTexture(), roughness: 0.92, metalness: 0 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const apron = new T.Mesh(new T.PlaneGeometry(140, 70), std(0x1c1a26, { flatShading: false })); apron.rotation.x = -Math.PI / 2; apron.position.y = -0.03; apron.receiveShadow = true; scene.add(apron);
    // low neon-lit kerb along the front edge
    const kerb = new T.Mesh(new T.BoxGeometry(30, 0.14, 0.25), std(0x30303c)); kerb.position.set(0, 0.07, 6.6); scene.add(kerb);
    const strip = new T.Mesh(new T.BoxGeometry(30, 0.03, 0.05), basic(0x3df2ff)); strip.position.set(0, 0.15, 6.7); scene.add(strip);
    // chain-link fences: back and both ends, with posts and a top rail
    const fenceTex = fenceTexture(), fenceMat = new T.MeshBasicMaterial({ map: fenceTex, transparent: true, alphaTest: 0.2, side: T.DoubleSide });
    const postMat = std(0x3b4150), railMat = std(0x7b8498);
    const fence = (len, h, rotY, px, pz) => {
      const g = new T.Group(), t = fenceTex.clone(); t.needsUpdate = true; t.repeat.set(len / 1.1, h / 1.1); t.wrapS = t.wrapT = T.RepeatWrapping;
      const m = new T.Mesh(new T.PlaneGeometry(len, h), new T.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.2, side: T.DoubleSide })); m.position.y = h / 2; g.add(m);
      const n = Math.round(len / 3.5);
      for (let i = 0; i <= n; i++) { const p = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, h + 0.3, 8), postMat); p.position.set(-len / 2 + (len * i) / n, (h + 0.3) / 2, 0); p.castShadow = true; g.add(p); }
      const rail = new T.Mesh(new T.BoxGeometry(len, 0.08, 0.08), railMat); rail.position.y = h; g.add(rail);
      g.rotation.y = rotY; g.position.set(px, 0, pz); scene.add(g);
    };
    fence(31, 4.6, 0, 0, -6.9); fence(14, 4.6, Math.PI / 2, -15.2, 0); fence(14, 4.6, Math.PI / 2, 15.2, 0);
    // brick wall with graffiti, then the skyline and the big neon sign
    const wall = new T.Mesh(new T.PlaneGeometry(46, 10), new T.MeshStandardMaterial({ map: wallTexture(), roughness: 0.95 })); wall.position.set(0, 5, -9.5); scene.add(wall);
    const sky = new T.Mesh(new T.PlaneGeometry(190, 48), basic(0xffffff, { map: skylineTexture(), fog: false })); sky.position.set(0, 20, -40); scene.add(sky);
    const sign = new T.Mesh(new T.PlaneGeometry(14, 3.5), basic(0xffffff, { map: signTexture(), transparent: true })); sign.position.set(0, 8.2, -9.3); scene.add(sign);
    S.signMat = sign.material;
    // street lamps with a warm glow
    [[-9, -6], [9, -6], [-15.5, 5.5], [15.5, 5.5]].forEach(([lx, lz]) => {
      const pole = new T.Mesh(new T.CylinderGeometry(0.08, 0.12, 7.5, 8), postMat); pole.position.set(lx, 3.75, lz); pole.castShadow = true; scene.add(pole);
      const head = new T.Mesh(new T.BoxGeometry(1.1, 0.14, 0.5), basic(0xfff1c8)); head.position.set(lx + (lx < 0 ? 0.5 : -0.5), 7.5, lz); scene.add(head);
      const glow = new T.Sprite(new T.SpriteMaterial({ map: S.glowTex, color: 0xffd28a, transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false })); glow.scale.set(5, 5, 1); glow.position.copy(head.position); scene.add(glow);
    });
    const warm = new T.PointLight(0xffc27a, 0.6, 30); warm.position.set(0, 7, 3); scene.add(warm);
    S.hoops = [1, -1].map((s) => buildHoop(scene, s));
  }

  function buildHoop(scene, s) { // s = +1 right hoop (Blue attacks it), -1 left hoop
    const g = new T.Group(), steel = std(0x4a5163, { flatShading: false, metalness: 0.4 });
    const pole = new T.Mesh(new T.CylinderGeometry(0.1, 0.12, 3.9, 10), steel); pole.position.set(s * 14.1, 1.95, 0); pole.castShadow = true; g.add(pole);
    const arm = new T.Mesh(new T.BoxGeometry(0.9, 0.1, 0.1), steel); arm.position.set(s * 13.65, 3.75, 0); g.add(arm);
    const board = new T.Mesh(new T.BoxGeometry(0.06, 1.1, 1.8), new T.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.32, roughness: 0.1, metalness: 0.2 })); board.position.set(s * (HOOP_X + 0.53), 3.55, 0); g.add(board);
    const frame = (w, h, d, y, z) => { const m = new T.Mesh(new T.BoxGeometry(0.07, h, d), basic(0x3df2ff)); m.position.set(s * (HOOP_X + 0.5), y, z); g.add(m); };
    frame(0, 0.06, 1.8, 4.1, 0); frame(0, 0.06, 1.8, 3.0, 0); frame(0, 1.1, 0.06, 3.55, 0.9); frame(0, 1.1, 0.06, 3.55, -0.9);
    const sq = new T.Mesh(new T.BoxGeometry(0.07, 0.4, 0.06), basic(0xff4d9d)); sq.position.set(s * (HOOP_X + 0.49), 3.25, 0.3); g.add(sq); const sq2 = sq.clone(); sq2.position.z = -0.3; g.add(sq2);
    const rimMat = new T.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5a00, emissiveIntensity: 0.6, roughness: 0.4 });
    const rim = new T.Mesh(new T.TorusGeometry(RIM_R, 0.035, 8, 28), rimMat); rim.rotation.x = Math.PI / 2; rim.position.set(s * HOOP_X, HOOP_Y, 0); rim.castShadow = true; g.add(rim);
    const brace = new T.Mesh(new T.BoxGeometry(0.15, 0.04, 0.1), rimMat); brace.position.set(s * (HOOP_X + RIM_R + 0.04), HOOP_Y, 0); g.add(brace);
    const net = new T.Mesh(new T.CylinderGeometry(RIM_R, 0.27, 0.55, 14, 4, true), basic(0xffffff, { wireframe: true, transparent: true, opacity: 0.85 })); net.position.set(s * HOOP_X, HOOP_Y - 0.28, 0); g.add(net);
    scene.add(g);
    return { s, net, rim, rimMat, t: 0, sway: 0 };
  }

  /* ----- the characters: low-poly blocks and capsules ----- */
  const SKIN = [0xf0c8a0, 0xd9a47a, 0xb97a54, 0x8a5538, 0x5e3a26], HAIR = [0x1c1410, 0x3a2418, 0xe8c44a, 0x7a2a1a, 0x222a44];
  function makePlayer(p) {
    const col = p.team === 0 ? BLUE : RED, dark = p.team === 0 ? 0x1c4fb0 : 0xb01d30, skin = SKIN[(p.idx * 2 + p.team * 3 + 1) % SKIN.length], hair = HAIR[(p.idx * 3 + p.team) % HAIR.length];
    const root = new T.Group(), body = new T.Group(); body.position.y = 0.95; root.add(body);
    const part = (geo, mat, x, y, z, parent) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; (parent || body).add(m); return m; };
    const jersey = std(col, { roughness: 0.6 }), shorts = std(dark), skinM = std(skin, { roughness: 0.7 }), white = std(0xf4f6ff), hairM = std(hair);
    // torso, jersey stripe and a number panel on the side
    part(new T.CylinderGeometry(0.27, 0.22, 0.62, 8), jersey, 0, 0.3, 0);
    part(new T.BoxGeometry(0.54, 0.09, 0.34), white, 0, 0.36, 0);
    part(new T.BoxGeometry(0.46, 0.26, 0.34), shorts, 0, 0.0, 0);
    // head with hair, headband and a face that points along +x
    const head = part(new T.SphereGeometry(0.18, 12, 10), skinM, 0.02, 0.86, 0);
    part(new T.SphereGeometry(0.19, 12, 8, 0, 6.283, 0, 1.35), hairM, 0.0, 0.88, 0);
    part(new T.CylinderGeometry(0.195, 0.195, 0.05, 14), std(col), 0.02, 0.84, 0);
    part(new T.BoxGeometry(0.05, 0.05, 0.05), basic(0x15151a), 0.17, 0.87, 0.07); part(new T.BoxGeometry(0.05, 0.05, 0.05), basic(0x15151a), 0.17, 0.87, -0.07);
    const mkLeg = (z) => { const g = new T.Group(); g.position.set(0, -0.02, z); body.add(g); part(new T.BoxGeometry(0.2, 0.52, 0.2), skinM, 0, -0.28, 0, g); part(new T.BoxGeometry(0.22, 0.4, 0.22), shorts, 0, -0.1, 0, g); part(new T.BoxGeometry(0.34, 0.11, 0.22), white, 0.06, -0.58, 0, g); part(new T.BoxGeometry(0.22, 0.06, 0.23), std(col), 0, -0.44, 0, g); return g; };
    const mkArm = (z) => { const g = new T.Group(); g.position.set(0, 0.56, z); body.add(g); part(new T.BoxGeometry(0.15, 0.55, 0.15), skinM, 0, -0.28, 0, g); part(new T.BoxGeometry(0.17, 0.2, 0.17), jersey, 0, -0.05, 0, g); part(new T.SphereGeometry(0.09, 8, 6), skinM, 0, -0.58, 0, g); return g; };
    const o = { root, body, head, legF: mkLeg(0.13), legB: mkLeg(-0.13), armF: mkArm(0.33), armB: mkArm(-0.33) };
    // flat team ring on the ground, plus a shadow blob
    o.ring = new T.Mesh(new T.RingGeometry(0.55, 0.7, 32), basic(col, { transparent: true, opacity: 0.95, side: T.DoubleSide, depthWrite: false })); o.ring.rotation.x = -Math.PI / 2; o.ring.position.y = 0.025; S.scene.add(o.ring);
    o.pz = { tilt: 0, bodyY: 0, lf: 0, lb: 0, af: 0, ab: 0, ang: p.face > 0 ? 0 : Math.PI }; o.lastX = p.x;
    S.scene.add(root); return o;
  }

  /* ----- effects ----- */
  function spawnP(x, y, z, col, vx, vy, vz, life, size, g) {
    const q = S.parts.find((a) => !a.live); if (!q) return;
    Object.assign(q, { live: true, t: 0, life, vx, vy, vz, g: g == null ? 8 : g, size }); q.m.material = S.pmats[col]; q.m.position.set(x, y, z); q.m.scale.setScalar(size); q.m.visible = true;
  }
  const burstP = (x, y, z, n, sp, life, size, cols) => { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, u = 0.4 + Math.random() * 0.8; spawnP(x, y, z, cols[i % cols.length], Math.cos(a) * sp * u, Math.sin(a) * sp * u + 1, (Math.random() - 0.5) * sp * 0.8, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8)); } };

  R.fbBuild = function () {
    R.fbDestroy();
    const scene = new T.Scene(), cam = new T.PerspectiveCamera(40, 16 / 9, 0.3, 200);
    const c = cv(64, 64), x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    S = { scene, cam, glowTex: new T.CanvasTexture(c), fx: 0, camAng: 0, shake: 0, floaters: [], parts: [], flashes: [], v3: new T.Vector3(), ballRot: 0, trailT: 0, started: false };
    S.pmats = { cyan: basic(0x3df2ff, { transparent: true, blending: T.AdditiveBlending, depthWrite: false }), pink: basic(0xff4d9d, { transparent: true, blending: T.AdditiveBlending, depthWrite: false }), gold: basic(0xffe14a, { transparent: true, blending: T.AdditiveBlending, depthWrite: false }), white: basic(0xffffff, { transparent: true, blending: T.AdditiveBlending, depthWrite: false }) };
    buildWorld(scene);
    S.figs = FB.players.map((p) => makePlayer(p));
    const bm = R.makeBall(); S.ball = bm.mesh; S.ball.scale.setScalar(BR / 0.2); S.ball.castShadow = true; scene.add(S.ball);
    S.ballShadow = new T.Mesh(new T.CircleGeometry(0.3, 16), basic(0x000000, { transparent: true, opacity: 0.4, depthWrite: false })); S.ballShadow.rotation.x = -Math.PI / 2; S.ballShadow.position.y = 0.03; scene.add(S.ballShadow);
    const pg = new T.SphereGeometry(0.1, 6, 6); for (let i = 0; i < 160; i++) { const m = new T.Mesh(pg, S.pmats.cyan); m.visible = false; scene.add(m); S.parts.push({ m, live: false }); }
    S.marker = new T.Mesh(new T.ConeGeometry(0.2, 0.45, 10), basic(0xffd23f)); S.marker.rotation.x = Math.PI; scene.add(S.marker);
    for (let i = 0; i < 4; i++) { const m = new T.Mesh(new T.RingGeometry(0.85, 1, 40), basic(0x3df2ff, { transparent: true, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false })); m.visible = false; scene.add(m); S.flashes.push({ m, live: false, t: 0 }); }
    if (R.setMatchVisible) R.setMatchVisible(false);
  };
  R.fbDestroy = function () { if (!S) return; S = null; if (R.setMatchVisible) R.setMatchVisible(true); };

  /* ----- events -> effects ----- */
  function handleEvents(evs) {
    for (const e of evs) {
      if (e.k === 'flick') { burstP(e.p.x, 0.2, e.p.lane, 6, 3, 0.4, 0.8, ['white', 'cyan']); S.floaters.push({ x: e.p.x, y: 2.5, txt: 'FLICK', col: '#3df2ff', t: 0.8 }); }
      else if (e.k === 'volley') { S.shake = Math.max(S.shake, 0.22); burstP(FB.ball.x, FB.ball.y, 0, 14, 5, 0.5, 1, ['gold', 'white', e.p.team ? 'pink' : 'cyan']); S.floaters.push({ x: e.p.x, y: 2.9, txt: 'VOLLEY!', col: '#ffe14a', t: 1 }); }
      else if (e.k === 'tackle') { S.shake = Math.max(S.shake, 0.18); burstP(e.q.x, 0.3, e.q.lane, 12, 4, 0.5, 0.9, ['white', 'gold']); S.floaters.push({ x: e.q.x, y: 2.4, txt: 'TACKLED!', col: '#ffffff', t: 1 }); }
      else if (e.k === 'header') { burstP(e.p.x, e.p.y + 1.7, e.p.lane, 8, 3, 0.4, 0.8, ['white', 'cyan']); if (e.block) S.floaters.push({ x: e.p.x, y: e.p.y + 2.8, txt: 'BLOCKED!', col: '#ff4d9d', t: 1 }); }
      else if (e.k === 'rim') { burstP(FB.ball.x, FB.ball.y, 0, 5, 2.5, 0.35, 0.6, ['gold']); }
      else if (e.k === 'land') { burstP(e.p.x, 0.05, e.p.lane, 3, 1.5, 0.3, 0.7, ['white']); }
      else if (e.k === 'score') {
        const h = S.hoops[e.side > 0 ? 0 : 1]; h.t = 1; S.shake = Math.max(S.shake, 0.5);
        burstP(e.x, HOOP_Y, 0, 60, 9, 1.1, 1.2, ['cyan', 'pink', 'gold', 'white']);
        const f = S.flashes.find((q) => !q.live); if (f) { f.live = true; f.t = 0; f.m.position.set(e.x - Math.sign(e.x) * 0.0, HOOP_Y, 0.2); f.m.visible = true; }
        S.floaters.push({ x: e.x - e.side * 1.4, y: 4.4, txt: 'SWISH! +' + e.pts, col: e.pts === 3 ? '#ffe14a' : '#3df2ff', t: 1.6, big: true });
      } else if (e.k === 'swap') S.floaters.push({ x: e.p.x, y: 2.6, txt: 'YOU', col: '#ffd23f', t: 0.8 });
    }
  }

  /* ----- the frame ----- */
  const proj = (x, y, z, w, h) => { S.v3.set(x, y, z).project(S.cam); return S.v3.z > 1 ? null : [(S.v3.x * 0.5 + 0.5) * w, (-S.v3.y * 0.5 + 0.5) * h]; };
  const shortAng = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

  function posePlayer(p, o, dt) {
    const z = o.pz, k = 1 - Math.exp(-dt * 16);
    let tilt = 0, bodyY = 0, lf = 0, lb = 0, af = 0, ab = 0, lift = 0;
    const run = clamp(Math.abs(p.vx) / RUN, 0, 1), sw = Math.sin(p.anim) * 0.95 * run;
    if (p.st === 'slide') { tilt = -1.25; bodyY = -0.5; lf = 1.35; lb = 1.1; af = -0.6; ab = -0.8; }
    else if (p.st === 'stumble') { const wob = Math.sin(FB.time * 9) * 0.05; tilt = 0.6 + wob; lf = 0.25; lb = -0.15; af = 0.9; ab = 0.8; }
    else if (p.st === 'recover') { tilt = -0.2; lf = 0.5; lb = -0.3; af = 0.3; ab = -0.2; }
    else if (p.y > 0.05) { lf = 0.6; lb = -0.5; af = 2.5; ab = 2.7; tilt = -0.06; }
    else { lf = sw; lb = -sw; af = -sw * 0.8; ab = sw * 0.8; tilt = 0.12 * run + Math.sin(FB.time * 2 + p.idx) * 0.012; }
    if (p.kickT > 0) { // flick: quick leg swing; volley: a bicycle kick, body leaning back with the leg high
      const u = p.kickKind === 'volley' ? clamp(1 - p.kickT / 0.5, 0, 1) : clamp(1 - p.kickT / 0.3, 0, 1), arc = Math.sin(u * Math.PI);
      if (p.kickKind === 'volley') { tilt = -1.15 * arc; lf = 2.2 * arc; lb = 0.4; af = 1.6 * arc; ab = -1.0 * arc; lift = 0.45 * arc; }
      else { lf = 1.5 * arc; af = -0.7 * arc; }
    }
    z.tilt += (tilt - z.tilt) * k; z.bodyY += (bodyY - z.bodyY) * k; z.lf += (lf - z.lf) * k; z.lb += (lb - z.lb) * k; z.af += (af - z.af) * k; z.ab += (ab - z.ab) * k;
    z.ang += shortAng(z.ang, p.face > 0 ? 0 : Math.PI) * (1 - Math.exp(-dt * 14)); // turn smoothly, never snap
    o.root.position.set(p.x, p.y + lift * (p.kickKind === 'volley' ? 1 : 0), p.lane); o.root.rotation.y = z.ang;
    o.body.rotation.z = z.tilt; o.body.position.y = 0.95 + z.bodyY;
    o.legF.rotation.z = z.lf; o.legB.rotation.z = z.lb; o.armF.rotation.z = z.af; o.armB.rotation.z = z.ab;
    o.ring.position.set(p.x, 0.025, p.lane); o.ring.scale.setScalar(p === FB.ball.owner ? 1.2 : 1);
    o.ring.material.color.setHex(FB.ball.owner === p ? 0xffd23f : p.team === 0 ? BLUE : RED);
  }

  R.fbRender = function (dt, evs, ctx, cw, ch) {
    if (!S) return;
    handleEvents(evs);
    const b = FB.ball, t = FB.time;
    FB.players.forEach((p, i) => posePlayer(p, S.figs[i], dt));
    // ball: sits where the physics says, spins as it rolls
    S.ball.position.set(b.x, b.y, 0); S.ballRot += -b.vx * dt / BR; S.ball.rotation.z = S.ballRot; S.ball.rotation.y += dt * 2 * (b.owner ? 0 : Math.sign(b.vx));
    S.ballShadow.position.x = b.x; S.ballShadow.scale.setScalar(clamp(1.2 - b.y * 0.12, 0.4, 1.2)); S.ballShadow.material.opacity = clamp(0.45 - b.y * 0.05, 0.1, 0.45);
    if (hyp(b.vx, b.vy) > 13 && !b.owner) { S.trailT -= dt; if (S.trailT <= 0) { S.trailT = 0.025; spawnP(b.x, b.y, 0, b.last && b.last.team ? 'pink' : 'cyan', 0, 0, 0, 0.35, 1.5, 0); } }
    // marker over the player you control
    const c = FB.ctrl; S.marker.visible = !!c && FB.phase !== 'end'; if (c) S.marker.position.set(c.x, c.y + 2.5 + Math.sin(t * 5) * 0.08, c.lane);
    // hoops: net swish and rim glow
    for (const h of S.hoops) {
      h.t = Math.max(0, h.t - dt * 0.9); const u = h.t, wob = Math.abs(Math.sin((1 - u) * 16)) * u;
      h.net.scale.set(1 - 0.22 * wob, 1 + 0.65 * wob, 1 - 0.22 * wob); h.net.position.y = HOOP_Y - 0.28 * h.net.scale.y; h.net.rotation.z = Math.sin((1 - u) * 20) * 0.1 * u * h.s;
      h.rimMat.emissiveIntensity = 0.6 + u * 3;
    }
    S.signMat.opacity = 0.9 + Math.sin(t * 3) * 0.1;
    // particles and shock rings
    for (const q of S.parts) {
      if (!q.live) continue; q.t += dt; const u = q.t / q.life; if (u >= 1) { q.live = false; q.m.visible = false; continue; }
      q.vy -= q.g * dt; q.m.position.x += q.vx * dt; q.m.position.y = Math.max(0.05, q.m.position.y + q.vy * dt); q.m.position.z += q.vz * dt; q.m.scale.setScalar(Math.max(0.01, q.size * (1 - u)));
    }
    for (const f of S.flashes) { if (!f.live) continue; f.t += dt; const u = f.t / 0.55; if (u >= 1) { f.live = false; f.m.visible = false; continue; } f.m.scale.setScalar(0.4 + u * 3.2); f.m.material.opacity = (1 - u) * 0.9; }
    for (const f of S.floaters) f.t -= dt; S.floaters = S.floaters.filter((f) => f.t > 0);

    /* camera: a side view that tracks the ball and swings slightly towards the direction of play for depth */
    const asp = cw / ch, dist = 13 * Math.max(1, 1.55 / asp);
    let tx = clamp(b.x * 0.88 + (b.owner ? b.owner.face * 1.3 : clamp(b.vx * 0.12, -2.4, 2.4)), -6.9, 6.9), ty = 1.7, fov = 40;
    const sc = FB.phase === 'goal' && FB.last ? FB.last : null;
    if (sc) { tx = sc.side * 9.6; ty = 3.0; fov = 32; }
    S.fx += (tx - S.fx) * (1 - Math.exp(-dt * (sc ? 3 : 4.4)));
    const trend = clamp(b.vx / 10, -1, 1); S.camAng += ((FB.phase === 'play' ? trend * 0.3 : sc ? -sc.side * 0.25 : 0) - S.camAng) * (1 - Math.exp(-dt * 1.6));
    const cx = S.fx + Math.sin(S.camAng) * dist, cz = Math.cos(S.camAng) * dist, cy = 3.9 + (sc ? -0.8 : 0);
    if (!S.started) { S.cam.position.set(cx, cy, cz); S.started = true; }
    S.cam.position.x += (cx - S.cam.position.x) * (1 - Math.exp(-dt * 6)); S.cam.position.y += (cy - S.cam.position.y) * (1 - Math.exp(-dt * 4)); S.cam.position.z += (cz - S.cam.position.z) * (1 - Math.exp(-dt * 6));
    S.shake = Math.max(0, S.shake - dt * 1.8); if (S.shake > 0) S.cam.position.add(S.v3.set((Math.random() - 0.5) * S.shake * 0.4, (Math.random() - 0.5) * S.shake * 0.4, 0));
    if (Math.abs(S.cam.fov - fov) > 0.05) S.cam.fov += (fov - S.cam.fov) * Math.min(1, dt * 4);
    const el = R.renderer.domElement, a2 = (el.clientWidth || cw) / (el.clientHeight || ch); if (Math.abs(S.cam.aspect - a2) > 0.001 || Math.abs(S.cam.fov - fov) > 0.05) { S.cam.aspect = a2; }
    S.cam.updateProjectionMatrix(); S.cam.lookAt(S.fx, ty, 0);
    S.sun.position.set(S.fx + 6, 16, 10); S.sun.target.position.set(S.fx, 0, 0);
    R.renderer.render(S.scene, S.cam);
    drawHud(ctx, cw, ch);
  };

  /* ----- 2D overlay: countdown, floating words, volley prompt, controls hint ----- */
  function drawHud(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    const u = Math.max(0.7, h / 540), font = (px, wt) => (wt || 900) + ' ' + Math.round(px * u) + 'px "Big Shoulders Display", Impact, "Arial Narrow", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const b = FB.ball, c = FB.ctrl;
    if (c && FB.phase === 'play' && !b.owner && Math.abs(b.x - c.x) < 1.55 && b.y > 0.5 && b.y - c.y > 0.4 && b.y - c.y < 2.8) { // you can volley right now
      const s = proj(b.x, b.y, 0, w, h); if (s) {
        const pulse = 1 + Math.sin(performance.now() / 90) * 0.12; ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 4 * u; ctx.beginPath(); ctx.arc(s[0], s[1], 26 * u * pulse, 0, 6.283); ctx.stroke();
        ctx.font = font(18); ctx.lineWidth = 5 * u; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText('CLICK!', s[0], s[1] - 40 * u); ctx.fillStyle = '#ffe14a'; ctx.fillText('CLICK!', s[0], s[1] - 40 * u);
      }
    }
    for (const f of S.floaters) {
      const age = 1 - f.t / 1.6, s = proj(f.x, f.y + age * 0.9, 0, w, h); if (!s) continue;
      ctx.globalAlpha = clamp(f.t * 2.2, 0, 1); ctx.font = font(f.big ? 44 : 26); ctx.lineWidth = 6 * u; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(f.txt, s[0], s[1]); ctx.fillStyle = f.col; ctx.fillText(f.txt, s[0], s[1]); ctx.globalAlpha = 1;
    }
    if (FB.phase === 'intro') {
      const left = FB.introLen - FB.phaseT, n = Math.ceil(left), txt = FB.introLen > 2 ? (n > 0 ? String(n) : 'GO') : (left > 0.5 ? 'READY' : 'GO'), k = 1 + (1 - (left % 1)) * 0.3;
      ctx.font = font(110 * k); ctx.lineWidth = 8 * u; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(txt, w / 2, h * 0.36); ctx.fillStyle = '#ffe14a'; ctx.fillText(txt, w / 2, h * 0.36);
    }
    if (FB.phase === 'goal' && FB.last) { const s = FB.last; ctx.font = font(70); ctx.lineWidth = 8 * u; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; const txt = (s.team === 0 ? 'BLUE' : 'RED') + ' +' + s.pts; ctx.strokeText(txt, w / 2, h * 0.3); ctx.fillStyle = s.team === 0 ? '#5aa0ff' : '#ff6677'; ctx.fillText(txt, w / 2, h * 0.3); }
    if (FB.time < 14 && FB.phase !== 'end') { // controls hint
      ctx.globalAlpha = clamp((14 - FB.time) / 2, 0, 1); ctx.fillStyle = 'rgba(8,10,24,0.78)'; const txt = 'A / D run     W or Space jump     S slide     CLICK flick, CLICK again to volley     Q swap', tw = Math.min(w - 20 * u, 760 * u);
      ctx.fillRect(w / 2 - tw / 2, h - 46 * u, tw, 32 * u); ctx.font = font(15, 700); ctx.fillStyle = '#e9f3ff'; ctx.fillText(txt, w / 2, h - 30 * u, tw - 16 * u); ctx.globalAlpha = 1;
    }
    // scorers' hoop arrow
    if (c && FB.phase === 'play') { ctx.font = font(13, 800); ctx.fillStyle = 'rgba(233,243,255,0.8)'; ctx.fillText(FB.ctrl.team === 0 ? 'SHOOT AT THE RIGHT HOOP  >' : '<  SHOOT AT THE LEFT HOOP', w / 2, h - (FB.time < 14 ? 60 : 14) * u); }
  }

  /* ----- keyboard and mouse ----- */
  window.addEventListener('keydown', (e) => {
    if (!FB.active) return;
    if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    if (e.repeat) return; FB.keys[e.code] = true;
    if (e.code === 'KeyW' || e.code === 'Space' || e.code === 'ArrowUp') FB.q.jump = true;
    if (e.code === 'KeyS' || e.code === 'ArrowDown' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') FB.q.slide = true;
    if (e.code === 'KeyK' || e.code === 'KeyJ') FB.q.act = true;
    if (e.code === 'KeyQ') FB.q.swap = true;
  });
  window.addEventListener('keyup', (e) => { FB.keys[e.code] = false; });
  window.addEventListener('blur', () => { FB.keys = {}; });
  window.addEventListener('pointerdown', (e) => { // left click (or a tap) on the game = flick / volley
    if (!FB.active || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.target.closest && e.target.closest('button,a,select,input')) return;
    if (e.target.closest && e.target.closest('.stage')) FB.q.act = true;
  });
})();
