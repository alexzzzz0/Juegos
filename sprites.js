/* ==========================================================================
   sprites.js - Rediseño con sombras, bordes y articulaciones fluidas
   ========================================================================== */

const PAL = {
  player: {
    skin: '#e0a976', uniform: '#3d5a2c', uniformDark: '#24391a',
    boots: '#1c1c1c', helmet: '#2b3b22', helmetShine: '#5c7a45',
    gun: '#787d72', gunDark: '#3d3f39', backpack: '#4a3524',
    visor: '#0d0d0d', emblem: '#e0c34b'
  },
  grunt: {
    skin: '#c98a5a', uniform: '#7a2b24', uniformDark: '#4f1b16',
    boots: '#1c1c1c', helmet: '#5a1e18', helmetShine: '#8a3a2c',
    gun: '#6b6b6b', gunDark: '#3d3d3d', backpack: '#3a2418',
    visor: '#0d0d0d', emblem: '#2b2b2b'
  },
  runner: {
    skin: '#c98a5a', uniform: '#555b3f', uniformDark: '#33391f',
    boots: '#1c1c1c', helmet: '#3f4a2c', helmetShine: '#6a7a45',
    gun: '#6b6b6b', gunDark: '#3d3d3d', backpack: '#2c2418',
    visor: '#0d0d0d', emblem: '#b23a2e'
  },
  boss: {
    metal: '#7f8a78', metalDark: '#4c5347', metalLight: '#b7c0ac',
    treads: '#1c1c1c', glass: '#5cc9dd', cannon: '#33362f',
    warning: '#d1332c', rivet: '#2b2e26'
  }
};

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

function pxRotRect(ctx, cx, cy, w, h, angle, color, anchorX = 0) {
  ctx.save();
  ctx.translate(Math.round(cx), Math.round(cy));
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.fillRect(anchorX, -h / 2, w, h);
  ctx.restore();
}

/* -------------------------------------------------------------------- */
/* Dibujado de Humanoide con Sombras y Retroceso                        */
/* -------------------------------------------------------------------- */
function drawHumanoid(ctx, o) {
  const pal = o.pal || PAL.grunt;
  const facing = o.facing || 1;
  const crouch = !!o.crouch;
  const dead = !!o.dead;
  const hurt = !!o.hurt;

  if (dead) {
    drawDeadHumanoid(ctx, o);
    return;
  }

  ctx.save();
  if (hurt) ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 40));

  // 1. Sombra proyectada en el suelo
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(Math.round(o.x), Math.round(o.y), 6, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. Bamboleo del cuerpo
  const running = o.pose === 'run';
  const jumping = o.pose === 'jump';
  const phase = o.legPhase || 0;
  const bodyBob = running ? Math.abs(Math.sin(phase)) * 1.5 : 0;

  const legLen = crouch ? 6 : 10;
  const hipY = o.y - legLen - bodyBob;
  const torsoH = crouch ? 8 : 10;
  const shoulderY = hipY - torsoH;
  const headR = 3.2;
  const headCY = shoulderY - headR - 0.5;

  // ---- Piernas ----
  const swing = running ? Math.sin(phase) * 0.55 : 0;
  const legW = 2.6;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    let ang = jumping ? (side > 0 ? -0.5 : 0.9) : crouch ? (side > 0 ? 0.35 : -0.1) : swing * side;

    ctx.save();
    ctx.translate(o.x, hipY);
    ctx.rotate(ang * 0.6);
    px(ctx, -legW / 2, 0, legW, legLen * 0.55, pal.uniformDark);
    ctx.translate(0, legLen * 0.55);
    ctx.rotate(ang * 0.4);
    px(ctx, -legW / 2, 0, legW, legLen * 0.5, pal.boots);
    ctx.restore();
  }

  // ---- Mochila ----
  px(ctx, o.x - facing * 5.5, shoulderY + 1, 3, torsoH - 2, pal.backpack);

  // ---- Torso ----
  const torsoW = 7;
  px(ctx, o.x - torsoW / 2, shoulderY, torsoW, torsoH, pal.uniform);
  px(ctx, o.x - torsoW / 2, shoulderY + torsoH - 2.5, torsoW, 2.5, pal.uniformDark);
  px(ctx, o.x - 0.8, shoulderY + 1, 1.6, 3, pal.emblem);

  // ---- Cabeza / Casco ----
  px(ctx, o.x - headR, headCY - headR, headR * 2, headR * 2, pal.helmet);
  px(ctx, o.x - headR, headCY - headR, headR * 2, headR * 0.9, pal.helmetShine);
  px(ctx, o.x + facing * (headR - 1.6), headCY - 0.5, 2, 2, pal.skin);
  px(ctx, o.x + facing * (headR - 0.6), headCY - 0.3, 1, 1, pal.visor);

  // ---- Armas y Brazo con Retroceso (`kickback`) ----
  const aimAngle = o.aimAngle !== undefined ? o.aimAngle : (facing > 0 ? 0 : Math.PI);
  const kb = o.kickback || 0;
  const shoulderX = o.x + facing * 1.2 - Math.cos(aimAngle) * kb;
  const shY = shoulderY + 3 - Math.sin(aimAngle) * kb;

  pxRotRect(ctx, shoulderX, shY, 5, 2.4, aimAngle, pal.uniform, -1);
  pxRotRect(ctx, shoulderX, shY, o.gunLength || 9, 1.8, aimAngle, pal.gun, 3);
  pxRotRect(ctx, shoulderX, shY, (o.gunLength || 9) * 0.35, 1.8, aimAngle, pal.gunDark, (o.gunLength || 9) - 1);

  if (o.muzzle) {
    const mx = shoulderX + Math.cos(aimAngle) * ((o.gunLength || 9) + 2);
    const my = shY + Math.sin(aimAngle) * ((o.gunLength || 9) + 2);
    drawMuzzleFlash(ctx, mx, my, aimAngle);
  }

  ctx.restore();
}

function drawDeadHumanoid(ctx, o) {
  const pal = o.pal || PAL.grunt;
  const t = Math.min(1, o.deadT || 1);
  const facing = o.facing || 1;
  const y = o.y - 1.5;
  ctx.save();
  px(ctx, o.x - 6 * facing, y - 2, 12, 3, pal.uniformDark);
  px(ctx, o.x - 4 * facing, y - 3.5, 6, 2.5, pal.uniform);
  px(ctx, o.x + (facing > 0 ? 5 : -8), y - 2.5, 3.5, 2.5, pal.helmet);
  px(ctx, o.x - 9 * facing, y - 1, 3.5, 1.6, pal.boots);
  ctx.restore();
}

function drawMuzzleFlash(ctx, x, y, angle) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(angle);
  ctx.fillStyle = '#fff4b0';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(6, -3);
  ctx.lineTo(8, 0);
  ctx.lineTo(6, 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(0, -1, 4, 2);
  ctx.restore();
}

// Nota: se quitaron drawTurret() y drawBoss(), que eran código muerto:
// Enemy y Boss (en enemies.js) dibujan todo con sus propios métodos
// inline (drawTurretSprite, drawGruntSprite, Boss.draw), así que estas
// dos funciones nunca se llamaban desde ningún lado.

function drawCrate(ctx, o) {
  const dmg = o.damageStage || 0;
  const baseColor = dmg >= 2 ? '#5c3f22' : '#7a5230';
  px(ctx, o.x, o.y, o.w, o.h, baseColor);
  px(ctx, o.x, o.y, o.w, 2, '#8f6a3e');
  px(ctx, o.x, o.y + o.h - 3, o.w, 3, '#4a3018');
  px(ctx, o.x + 1, o.y + o.h / 2 - 1, o.w - 2, 2, '#3d2a17');
  if (dmg >= 1) {
    px(ctx, o.x + 3, o.y + 3, 3, 2, '#2c1e10');
    px(ctx, o.x + o.w - 7, o.y + o.h - 8, 4, 3, '#2c1e10');
  }
  if (dmg >= 2) {
    px(ctx, o.x + o.w / 2 - 2, o.y + 2, 4, o.h - 4, '#1c1108');
  }
}

function drawPowerup(ctx, o) {
  const bob = Math.sin((o.t || 0) * 4) * 2;
  const cx = o.x, cy = o.y + bob;
  ctx.save();
  ctx.translate(Math.round(cx), Math.round(cy));

  ctx.globalAlpha = 0.25 + 0.15 * Math.sin((o.t || 0) * 6);
  ctx.fillStyle = o.color || '#ffd23f';
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  px(ctx, -6, -6, 12, 12, '#1c1c1c');
  px(ctx, -5, -5, 10, 10, o.color || '#ffd23f');

  if (o.kind === 'health') {
    px(ctx, -3, -1, 6, 2, '#fff');
    px(ctx, -1, -3, 2, 6, '#fff');
  } else if (o.kind === 'life') {
    px(ctx, -3, -2, 2, 3, '#fff');
    px(ctx, 1, -2, 2, 3, '#fff');
    px(ctx, -2, 0, 4, 2, '#fff');
  } else {
    px(ctx, -3, -3, 6, 2, '#fff');
    px(ctx, -1, -1, 5, 2, '#fff');
  }
  ctx.restore();
}

function drawBullet(ctx, o) {
  ctx.save();
  ctx.translate(Math.round(o.x), Math.round(o.y));
  ctx.rotate(o.angle || 0);
  ctx.fillStyle = o.color || '#ffe066';
  ctx.fillRect(-3, -1, 6, 2);
  ctx.fillStyle = '#fff8d6';
  ctx.fillRect(2, -0.5, 2, 1);
  ctx.restore();
}

function drawParticle(ctx, o) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, o.life / o.maxLife);
  ctx.fillStyle = o.color;
  const s = Math.max(1, o.size * (o.life / o.maxLife));
  ctx.fillRect(Math.round(o.x - s / 2), Math.round(o.y - s / 2), s, s);
  ctx.restore();
}