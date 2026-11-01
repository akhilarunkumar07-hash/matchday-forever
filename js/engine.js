/* engine.js - the match itself: state, movement, ball physics, goals, restarts, halves. */
(function () {
  const G = window.G, { W, H, GOAL, BOX } = G;
  const clamp = G.clamp, hyp = Math.hypot, rnd = Math.random, hook = G.hook;

  // Team directions swap at half time, so everything asks these instead of hard-coding left/right.
  G.atkDir = (t) => ((t === 0) !== G.m.flip ? 1 : -1);
  G.goalX = (t) => (G.atkDir(t) > 0 ? W : 0);
  G.ownX = (t) => (G.atkDir(t) > 0 ? 0 : W);
  G.home = (p) => {
    const f = G.FORMATION[p.i];
    let x = f[2] * W, y = f[3] * H;
    if (G.atkDir(p.team) < 0) { x = W - x; y = H - y; }
    return { x, y };
  };
  G.minute = () => { const m = G.m; return Math.min(90, Math.floor((((m.half - 1) * m.halfLen + m.clock) / (2 * m.halfLen)) * 90)); };

  // human: 0 or 1 for the team you control, -1 for computer vs computer (the menu background).
  G.isH = (t) => !!(G.m && G.m.humans && G.m.humans[t]); // is this team controlled by a person?
  G.newMatch = function (o) {
    const m = (G.m = {
      humans: o.humans || [o.human === 0, o.human === 1], ctrl2: null, ctrlLock2: 0, sure: null,
      human: o.human, halfLen: o.halfLen, diff: G.DIFF[o.diff] || G.DIFF.normal || G.DIFF[Object.keys(G.DIFF)[0]], flip: false, players: [], score: [0, 0], half: 1, clock: 0,
      phase: 'restart', phaseT: 0, rs: null, pending: null, time: 0, lastTouch: null, ctrl: null, ctrlLock: 0, lastShot: null,
      stats: { shots: [0, 0], saves: [0, 0], fouls: [0, 0], yellow: [0, 0], red: [0, 0], passes: [0, 0] },
      goals: [], flash: null, foulAt: null, foulDur: 1.4, ref: { x: W / 2 - 70, y: H / 2 + 50, fx: 1, fy: 0 }, over: false,
      chaser: [null, null], second: [null, null],
      ball: { x: W / 2, y: H / 2, px: W / 2, z: 0, vx: 0, vy: 0, vz: 0, owner: null, spin: 0 },
    });
    for (let t = 0; t < 2; t++) G.makePlayers(t).forEach((p) => m.players.push(p));
    startRestart('kickoff', 0, W / 2, H / 2);
    return m;
  };

  /* ---------------- restarts ---------------- */

  const nearestTo = (list, x, y) => list.reduce((a, c) => (hyp(c.x - x, c.y - y) < hyp(a.x - x, a.y - y) ? c : a));

  function placeKickoff(team) {
    for (const p of G.m.players) {
      if (p.out) continue;
      const h = G.home(p), d = G.atkDir(p.team);
      p.x = h.x; p.y = h.y; p.vx = p.vy = 0; p.fx = d; p.fy = 0;
      p.x = d > 0 ? Math.min(p.x, W / 2 - 14) : Math.max(p.x, W / 2 + 14);
      if (p.team !== team) { // the other team stays outside the centre circle
        const dd = hyp(p.x - W / 2, p.y - H / 2);
        if (dd < G.CIRC + 10) { const k = (G.CIRC + 12) / (dd || 1); p.x = W / 2 + (p.x - W / 2) * k; p.y = H / 2 + (p.y - H / 2) * k; }
        p.x = d > 0 ? Math.min(p.x, W / 2 - 14) : Math.max(p.x, W / 2 + 14);
      }
    }
  }

  function startRestart(type, team, x, y) {
    const m = G.m, b = m.ball, d = G.atkDir(team);
    const rs = (m.rs = { type, team, x, y, t: 0, taker: null });
    m.phase = 'restart'; m.phaseT = 0;
    Object.assign(b, { x, y, px: x, z: 0, vx: 0, vy: 0, vz: 0, owner: null });
    m.players.forEach((p) => { p.wall = null; p.penY = null; p.penT = 0; p.slideT = 0; p.fallT = 0; });
    if (type === 'kickoff') placeKickoff(team);

    const mates = m.players.filter((p) => p.team === team && !p.out);
    const outf = mates.filter((p) => p.grp !== 'GK');
    let k;
    if (type === 'goalkick') k = mates.find((p) => p.grp === 'GK');
    else if (type === 'kickoff') k = mates.find((p) => p.i === 9 && !p.out) || outf[0];
    else if (type === 'penalty') k = outf.reduce((a, c) => (c.shot > a.shot ? c : a));
    else if (type === 'corner') { const w = outf.filter((p) => p.role === 'LM' || p.role === 'RM'); k = nearestTo(w.length ? w : outf, x, y); }
    else k = nearestTo(outf, x, y);
    rs.taker = k; k.vx = k.vy = 0;

    if (type === 'throwin') { k.x = x; k.y = y < H / 2 ? -7 : H + 7; k.fx = 0; k.fy = y < H / 2 ? 1 : -1; }
    else if (type === 'corner') { k.x = x + (x === 0 ? 7 : -7); k.y = y + (y < H / 2 ? 7 : -7); k.fx = x === 0 ? 1 : -1; k.fy = 0; }
    else if (type === 'kickoff') { k.x = W / 2 - d * 10; k.y = H / 2; k.fx = d; k.fy = 0; const s = mates.find((p) => p.i === 10 && p !== k); if (s) { s.x = W / 2 - d * 12; s.y = H / 2 + 32; } }
    else if (type === 'penalty') { k.x = x - d * 16; k.y = y; k.fx = d; k.fy = 0; setPenaltyLine(team, k); }
    else { k.x = clamp(x - d * 14, 4, W - 4); k.y = y; k.fx = d; k.fy = 0; }
    b.owner = k; // the taker holds the ball until he kicks it

    if (type === 'freekick') formWall(team, x, y);
    hook('restart', rs);
  }
  G.startRestart = startRestart;

  function setPenaltyLine(team, taker) {
    const gx = G.goalX(team), d = G.atkDir(team), line = gx - d * (BOX.d + 42);
    let n = 0;
    for (const p of G.m.players) {
      if (p === taker || p.out) continue;
      if (p.grp === 'GK' && p.team !== team) { p.x = gx - d * 6; p.y = H / 2; continue; }
      p.x = line; p.y = 120 + (n++ % 11) * 44; p.vx = p.vy = 0;
    }
  }

  function formWall(team, x, y) { // defenders line up 9 metres from a free kick near their goal
    const gx = G.goalX(team);
    if (hyp(gx - x, H / 2 - y) > 330) return;
    const ux = (gx - x) / (hyp(gx - x, H / 2 - y) || 1), uy = (H / 2 - y) / (hyp(gx - x, H / 2 - y) || 1);
    const def = G.m.players.filter((p) => p.team !== team && !p.out && p.grp !== 'GK')
      .sort((a, c) => hyp(a.x - x, a.y - y) - hyp(c.x - x, c.y - y)).slice(0, 3);
    def.forEach((p, i) => { p.wall = { x: x + ux * 92 + -uy * (i - 1) * 18, y: y + uy * 92 + ux * (i - 1) * 18 }; });
  }

  G.beginPlay = function () {
    const m = G.m;
    m.phase = 'play'; m.phaseT = 0; m.rs = null;
    m.players.forEach((p) => { p.wall = null; });
  };

  function restartTick(dt) {
    const m = G.m, rs = m.rs;
    if (!rs || !rs.taker || rs.taker.out) return;
    rs.t += dt;
    const human = G.isH(rs.team);
    const delay = rs.type === 'penalty' ? 2.0 : rs.type === 'kickoff' ? 1.8 : 1.3;
    if ((!human && rs.t > delay + rs.taker.think) || (human && rs.t > 12)) G.aiTake(rs.taker);
  }

  /* ---------------- ball ---------------- */

  G.takeBall = function (p) {
    const b = G.m.ball;
    b.owner = p; b.vx = b.vy = b.vz = 0; b.z = 0; G.m.lastTouch = p;
  };

  function updateBall(dt) {
    const m = G.m, b = m.ball, o = b.owner;
    b.px = b.x;
    if (m.phase === 'restart' && m.rs) { b.x = m.rs.x; b.y = m.rs.y; b.z = 0; b.vx = b.vy = b.vz = 0; return; }
    if (m.phase === 'half' || m.phase === 'full') return;
    if (o) { // dribbling: the ball sticks near his feet
      const k = Math.min(1, dt * 22);
      let tx = o.x + o.fx * 11, ty = o.y + o.fy * 11;
      if (o.grp === 'GK') { tx = clamp(tx, 4, W - 4); ty = clamp(ty, 4, H - 4); } // a keeper holding the ball stays in play
      b.x += (tx - b.x) * k; b.y += (ty - b.y) * k; b.z = 0; b.vx = o.vx; b.vy = o.vy;
      b.spin += hyp(o.vx, o.vy) * dt * 0.2;
      return;
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.z > 0 || b.vz > 0) { // in the air: gravity, no rolling friction
      b.vz -= 700 * dt; b.z += b.vz * dt;
      if (b.z <= 0) { b.z = 0; if (Math.abs(b.vz) > 90) { b.vz = -b.vz * 0.5; b.vx *= 0.85; b.vy *= 0.85; } else b.vz = 0; }
    } else {
      const f = Math.exp(-0.75 * dt);
      b.vx *= f; b.vy *= f;
      if (hyp(b.vx, b.vy) < 6) { b.vx = 0; b.vy = 0; }
    }
    b.spin += hyp(b.vx, b.vy) * dt * 0.2;
    if (m.phase === 'goal') { // the net holds the ball in
      const lim = GOAL.depth - 3;
      if (b.x < -lim) { b.x = -lim; b.vx *= -0.2; }
      if (b.x > W + lim) { b.x = W + lim; b.vx *= -0.2; }
    }
  }

  function pickups() {
    const m = G.m, b = m.ball;
    if (b.owner || m.phase !== 'play') return;
    const sp = hyp(b.vx, b.vy);
    let best = null, bd = 1e9;
    for (const p of m.players) {
      if (p.out || p.kickCd > 0 || p.stun > 0 || p.slideT > 0 || p.fallT > 0) continue;
      const keeper = p.grp === 'GK', reach = keeper ? (p.penLock > 0 && p.penY === null ? 15 : 24) : 12.5;
      const d = hyp(b.x - p.x, b.y - p.y);
      if (d < reach && b.z < (keeper ? 34 : 14) && d < bd) { best = p; bd = d; }
    }
    if (!best) return;
    const lim = 330 + (best.drib - 60) * 4;
    if (best.grp === 'GK') { if (sp <= 330) G.takeBall(best); else G.keeperSave(best); }
    else if (sp <= lim) G.takeBall(best);
    else if (m.sure && m.sure.team !== best.team && m.time < m.sure.t) { /* a power shot flies straight through */ }
    else { // too fast to control: it deflects off him
      b.vx = b.vx * 0.55 + (rnd() - 0.5) * 120; b.vy = b.vy * 0.55 + (rnd() - 0.5) * 120;
      best.kickCd = 0.25; m.lastTouch = best;
    }
  }

  function scored(lineX) {
    const m = G.m, t = G.goalX(0) === lineX ? 0 : 1;
    const lt = m.lastTouch, og = !!(lt && lt.team !== t);
    m.score[t]++;
    m.goals.push({ team: t, who: lt ? lt.name : '', min: G.minute(), og });
    m.phase = 'goal'; m.phaseT = 0; m.scorer = t;
    m.ball.owner = null;
    hook('goal', t, lt, og);
  }

  function checkBounds() {
    const m = G.m, b = m.ball;
    if (m.phase !== 'play' || (b.owner && b.owner.grp === 'GK')) return;
    const crossL = b.px >= 0 && b.x < 0, crossR = b.px <= W && b.x > W;
    if (crossL || crossR) {
      const inY = b.y > GOAL.top && b.y < GOAL.bot;
      const post = Math.abs(b.y - GOAL.top) < 3.5 || Math.abs(b.y - GOAL.bot) < 3.5;
      const bar = inY && Math.abs(b.z - GOAL.h) < 4;
      if ((post && b.z < GOAL.h + 2) || bar) { // hit the woodwork
        b.x = crossL ? 1 : W - 1; b.vx *= -0.55; b.vy += (rnd() - 0.5) * 80;
        if (bar) b.vz = -Math.abs(b.vz) * 0.6 - 40;
        hook('post'); return;
      }
      const lineX = crossL ? 0 : W;
      if (inY && b.z < GOAL.h) { scored(lineX); return; }
      const def = G.ownX(0) === lineX ? 0 : 1, lt = m.lastTouch ? m.lastTouch.team : def;
      if (m.lastShot && m.time - m.lastShot.t < 3 && m.lastShot.p.team !== def) hook('miss', m.lastShot.p, b.z > GOAL.h ? 'over' : 'wide');
      if (lt === def) startRestart('corner', 1 - def, lineX, b.y < H / 2 ? 2 : H - 2);
      else { const d = G.atkDir(def); startRestart('goalkick', def, G.ownX(def) + d * 50, H / 2); }
      return;
    }
    if (b.y < 0 || b.y > H) {
      const team = 1 - (m.lastTouch ? m.lastTouch.team : 0);
      startRestart('throwin', team, clamp(b.x, 8, W - 8), b.y < 0 ? 0 : H);
    }
  }

  /* ---------------- players ---------------- */

  function steer(p, dt) { // accelerate towards (tx, ty)
    const m = G.m, dx = p.tx - p.x, dy = p.ty - p.y, d = hyp(dx, dy);
    let sp = 0;
    if (d > 2.5) {
      const sprinting = p.sprint && p.stamina > 0.03;
      sp = (96 + (p.pace - 60) * 0.9) * (sprinting ? 1.3 : 1) * p.mul;
      if (!G.isH(p.team)) sp *= m.diff.speed;
      if (m.ball.owner === p) sp *= 0.94;
      if (p.stun > 0) sp *= 0.25;
      if (p.fallT > 0) sp = 0;
      sp = Math.min(sp, d * 6 + 25);
      p.stamina = sprinting ? Math.max(0, p.stamina - dt * 0.14) : Math.min(1, p.stamina + dt * 0.05);
    } else p.stamina = Math.min(1, p.stamina + dt * 0.07);
    const k = Math.min(1, dt * 8), ux = d > 0.001 ? dx / d : 0, uy = d > 0.001 ? dy / d : 0;
    p.vx += (ux * sp - p.vx) * k; p.vy += (uy * sp - p.vy) * k;
    const v = hyp(p.vx, p.vy);
    if (v > 15) {
      const f = Math.min(1, dt * 14);
      p.fx += (p.vx / v - p.fx) * f; p.fy += (p.vy / v - p.fy) * f;
      const n = hyp(p.fx, p.fy) || 1; p.fx /= n; p.fy /= n;
    }
  }

  function humanUpdate(p) {
    const m = G.m, I = (p.team === 0 ? G.input : G.input2) || {};
    let ix = I.x || 0, iy = I.y || 0;
    const mag = hyp(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; }
    p.mul = 1; p.sprint = !!I.sprint;
    const penTake = m.phase === 'restart' && m.rs && m.rs.type === 'penalty' && m.rs.taker === p;
    if (penTake) { p.tx = p.x; p.ty = p.y; p.mul = 0; p.sprint = false; ix = (I.x || 0); iy = 0; }
    else if (m.phase === 'restart' && m.rs && m.rs.type === 'penalty') { p.tx = p.x; p.ty = p.y; p.mul = 0; }
    else if (mag > 0.12) { p.tx = p.x + ix * 120; p.ty = p.y + iy * 120; p.mul = Math.min(1, mag); } else { p.tx = p.x; p.ty = p.y; }
    if (I.tackle) { I.tackle = false; G.tackle(p, false); }
    if (I.slide) { I.slide = false; G.tackle(p, true); }
    if (I.rel) {
      const r = I.rel; I.rel = null;
      if (m.ball.owner === p) {
        const dx = mag > 0.2 ? ix : p.fx, dy = mag > 0.2 ? iy : p.fy, pw = clamp(r.t / 0.85, 0.4, 1);
        if (r.kind === 'shoot') G.doShot(p, pw, dx, dy, penTake ? (Math.abs(ix) > 0.3 ? Math.sign(ix) * G.atkDir(p.team) : 0) : mag > 0.2 ? iy : 0);
        else G.doPass(p, pw, dx, dy, r.t > 0.3);
      }
    }
    if (I.sw) { I.sw = false; switchCtrl(p.team); }
  }

  function updatePlayer(p, dt) {
    const m = G.m, ph = m.phase;
    if (p.out) { p.x = -400; p.y = -400; return; }
    p.tackleCd = Math.max(0, p.tackleCd - dt); p.stun = Math.max(0, p.stun - dt); p.kickCd = Math.max(0, p.kickCd - dt); p.fallT = Math.max(0, p.fallT - dt);
    if (p.penT > 0) { p.penT -= dt; if (p.penT <= 0) p.penY = null; }
    if (p.slideT > 0) {
      p.slideT -= dt;
      const k = Math.max(0, p.slideT / 0.45);
      p.vx = p.sdx * (60 + 260 * k * k); p.vy = p.sdy * (60 + 260 * k * k);
      if (ph === 'play') G.slideContact(p);
    } else if (ph === 'play' || ph === 'restart') {
      if (p.fallT > 0) { p.tx = p.x; p.ty = p.y; p.mul = 0; p.sprint = false; if (p.grp === 'GK') G.aiKeeper(p, dt); }
      else if ((p === m.ctrl && G.isH(0)) || (p === m.ctrl2 && G.isH(1))) humanUpdate(p);
      else if (p.grp === 'GK') G.aiKeeper(p, dt);
      else if (ph === 'restart') G.aiRestart(p, dt);
      else G.ai(p, dt);
      steer(p, dt);
      if (p.grp === 'GK' && p.penY !== null && p.penT > 0 && ph === 'play' && p.fallT <= 0) { // penalty dive: a quick lunge across the goal
        const cap = 300 + (p.keep - 70) * 4; p.vy = clamp((p.penY - p.y) * 7, -cap, cap); p.vx *= 0.5; p.fy = Math.sign(p.vy) || p.fy; p.fx = 0.2;
      }
    } else { // goal, foul, half time: stand still, or jog back after a goal
      p.sprint = false; p.mul = 0.5;
      if (ph === 'goal' || ph === 'half') { const h = G.home(p); p.tx = h.x; p.ty = h.y; } else { p.tx = p.x; p.ty = p.y; }
      steer(p, dt);
    }
    p.x = clamp(p.x + p.vx * dt, -14, W + 14);
    p.y = clamp(p.y + p.vy * dt, -14, H + 14);
    p.anim += hyp(p.vx, p.vy) * dt * 0.09;
  }

  function separate() { // players cannot stand inside each other
    const ps = G.m.players;
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i]; if (a.out) continue;
      for (let j = i + 1; j < ps.length; j++) {
        const c = ps[j]; if (c.out) continue;
        const dx = c.x - a.x, dy = c.y - a.y, d = hyp(dx, dy);
        if (d < 13 && d > 0.01) {
          const push = (13 - d) / 2, ux = dx / d, uy = dy / d;
          if (a.slideT <= 0) { a.x -= ux * push; a.y -= uy * push; }
          if (c.slideT <= 0) { c.x += ux * push; c.y += uy * push; }
        }
      }
    }
  }

  function switchCtrl(t) {
    const m = G.m, b = m.ball, cur = t === 0 ? m.ctrl : m.ctrl2;
    const list = m.players.filter((p) => p.team === t && !p.out && p.grp !== 'GK' && p !== cur)
      .sort((a, c) => hyp(a.x - b.x, a.y - b.y) - hyp(c.x - b.x, c.y - b.y));
    if (list[0]) { if (t === 0) { m.ctrl = list[0]; m.ctrlLock = 1.2; } else { m.ctrl2 = list[0]; m.ctrlLock2 = 1.2; } }
  }

  function ctrlLogic() { // which of your players you are controlling (one per human team)
    for (let ht = 0; ht < 2; ht++) {
      if (!G.isH(ht)) continue;
      const m = G.m, b = m.ball, key = ht === 0 ? 'ctrl' : 'ctrl2', lk = ht === 0 ? 'ctrlLock' : 'ctrlLock2';
      if (m.phase === 'restart' && m.rs && m.rs.team === ht) { m[key] = m.rs.taker; continue; }
      const own = m.players.filter((p) => p.team === ht && !p.out && p.grp !== 'GK');
      if (!own.length) continue;
      if (b.owner && b.owner.team === ht && b.owner.grp !== 'GK') { m[key] = b.owner; continue; }
      const cur = m[key];
      if (m[lk] > 0 && cur && !cur.out && cur.grp !== 'GK') continue;
      const c = nearestTo(own, b.x + b.vx * 0.2, b.y + b.vy * 0.2);
      if (!cur || cur.out || cur.grp === 'GK' || hyp(c.x - b.x, c.y - b.y) < hyp(cur.x - b.x, cur.y - b.y) - 45) m[key] = c;
    }
  }

  function rankChasers() { // who is closest to the ball on each team (the computer sends them to press)
    const m = G.m, b = m.ball, bx = b.x + b.vx * 0.2, by = b.y + b.vy * 0.2;
    for (let t = 0; t < 2; t++) {
      const l = m.players.filter((p) => p.team === t && !p.out && p.grp !== 'GK' && p !== m.ctrl && p !== m.ctrl2)
        .sort((a, c) => hyp(a.x - bx, a.y - by) - hyp(c.x - bx, c.y - by));
      m.chaser[t] = l[0] || null; m.second[t] = l[1] || null;
    }
  }

  function referee(dt) {
    const m = G.m, r = m.ref, b = m.ball;
    let tx = b.x - 60, ty = b.y + 55;
    if (m.phase === 'foul' && m.foulAt) { tx = m.foulAt.x - 28; ty = m.foulAt.y + 22; }
    const k = Math.min(1, dt * (m.phase === 'foul' ? 3 : 1.3));
    const ox = r.x, oy = r.y;
    r.x += (tx - r.x) * k; r.y += (ty - r.y) * k;
    const fx = b.x - r.x, fy = b.y - r.y, d = hyp(fx, fy) || 1;
    r.fx = fx / d; r.fy = fy / d; r.moving = hyp(r.x - ox, r.y - oy) / (dt || 1);
  }

  /* ---------------- half time and full time ---------------- */

  function endHalf() {
    const m = G.m;
    m.ball.owner = null; m.ball.vx = m.ball.vy = 0;
    hook('whistle'); hook('whistle');
    if (m.half === 1) { m.phase = 'half'; m.phaseT = 0; hook('halftime'); }
    else { m.phase = 'full'; m.phaseT = 0; m.over = true; hook('fulltime'); }
  }

  function secondHalf() {
    const m = G.m;
    m.half = 2; m.flip = true; m.clock = 0;
    startRestart('kickoff', 1, W / 2, H / 2);
    hook('secondhalf');
  }

  /* ---------------- main step ---------------- */

  G.step = function (dt) {
    const m = G.m;
    if (!m) return;
    dt = Math.min(dt, 0.05);
    m.time += dt; m.phaseT += dt;
    if (m.ctrlLock > 0) m.ctrlLock -= dt;
    if (m.ctrlLock2 > 0) m.ctrlLock2 -= dt;
    if (m.phase === 'play') { m.clock += dt; if (m.clock >= m.halfLen) endHalf(); }
    if (m.phase === 'foul' && m.phaseT > m.foulDur) { const pd = m.pending; startRestart(pd.type, pd.team, pd.x, pd.y); }
    if (m.phase === 'goal' && m.phaseT > (m.goalDur || 3.6)) startRestart('kickoff', 1 - m.scorer, W / 2, H / 2);
    if (m.phase === 'half' && m.phaseT > 4.5) secondHalf();
    if (m.phase === 'restart') restartTick(dt);
    ctrlLogic(); rankChasers();
    for (const p of m.players) updatePlayer(p, dt);
    separate();
    updateBall(dt); pickups(); checkBounds(); referee(dt);
  };
})();
