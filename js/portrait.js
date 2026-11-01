/* portrait.js - draws a generated face for each player (used on the squad cards). */
(function () {
  const G = window.G;

  // Draws a 64x64 portrait scaled to size s at (0,0).
  G.drawPortrait = function (ctx, p, s) {
    const L = p.look, T = G.TEAMS[p.team], kit = p.grp === 'GK' ? T.keeper : T.color;
    ctx.save();
    ctx.scale(s / 64, s / 64);
    ctx.beginPath(); ctx.rect(0, 0, 64, 64); ctx.clip();

    const bg = ctx.createLinearGradient(0, 0, 0, 64);
    bg.addColorStop(0, '#26382f'); bg.addColorStop(1, '#101c16');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 64, 64);

    const fill = (c) => { ctx.fillStyle = c; ctx.fill(); };
    const ell = (x, y, rx, ry, c) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 6.283); fill(c); };

    // long hair sits behind the head
    if (L.style === 3) {
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(17, 14, 30, 34, 10) : ctx.rect(17, 14, 30, 34); fill(L.hair);
    }
    // shoulders and shirt
    ell(32, 66, 29, 19, kit);
    ctx.beginPath(); ctx.moveTo(24, 50); ctx.lineTo(32, 58); ctx.lineTo(40, 50); ctx.closePath(); fill(T.trim);
    // neck, ears, head
    ctx.fillStyle = L.skin; ctx.fillRect(27, 38, 10, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(27, 38, 10, 4);
    ell(19, 31, 2.8, 4, L.skin); ell(45, 31, 2.8, 4, L.skin);
    ell(32, 28, 13, 15.5, L.skin);

    // hair styles
    ctx.fillStyle = L.hair;
    if (L.style === 0 || L.style === 3) { // short or long: cap with a fringe
      ctx.beginPath(); ctx.arc(32, 23, 14, Math.PI, 0); ctx.lineTo(44, 24); ctx.lineTo(32, 18); ctx.lineTo(20, 24); ctx.closePath(); ctx.fill();
    } else if (L.style === 1) { // buzz cut
      ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(32, 22, 13.5, Math.PI, 0); ctx.lineTo(44, 22); ctx.lineTo(20, 22); ctx.fill(); ctx.globalAlpha = 1;
    } else if (L.style === 2) { // curly
      for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(32 + (i - 3) * 5, 14 + Math.abs(i - 3) * 1.6, 6.5, 0, 6.283); ctx.fill(); }
    } else if (L.style === 5) { // mohawk
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(28.5, 4, 7, 18, 3) : ctx.rect(28.5, 4, 7, 18); ctx.fill();
    }

    // face
    ell(26, 29, 1.9, 2.2, '#fff'); ell(38, 29, 1.9, 2.2, '#fff');
    ell(26.4, 29.2, 1.1, 1.3, '#1a1410'); ell(37.6, 29.2, 1.1, 1.3, '#1a1410');
    ctx.strokeStyle = L.hair; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(23, 25); ctx.lineTo(29, 24.5); ctx.moveTo(35, 24.5); ctx.lineTo(41, 25); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(32, 30); ctx.lineTo(31, 34); ctx.lineTo(33, 34); ctx.stroke();
    ctx.strokeStyle = '#7a3a2e'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(32, 36.5, 3.5, 0.2, Math.PI - 0.2); ctx.stroke();

    if (L.beard) {
      ctx.globalAlpha = 0.8; ctx.fillStyle = L.hair;
      ctx.beginPath(); ctx.moveTo(19.5, 32); ctx.quadraticCurveTo(21, 46, 32, 46); ctx.quadraticCurveTo(43, 46, 44.5, 32);
      ctx.quadraticCurveTo(40, 40, 32, 40); ctx.quadraticCurveTo(24, 40, 19.5, 32); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.restore();
  };
})();
