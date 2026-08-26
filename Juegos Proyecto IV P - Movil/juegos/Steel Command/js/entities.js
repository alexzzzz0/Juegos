/* ==========================================================================
   entities.js
   Clases ligeras para proyectiles, particulas, power-ups y cajas
   destructibles. Todas exponen update(dt) y draw(ctx).
   ========================================================================== */

let __uid = 1;
function nextId() { return __uid++; }

// Utilidad compartida (antes estaba duplicada en enemies.js y player.js)
function lerp(start, end, amt) {
  return (1 - amt) * start + amt * end;
}

class Bullet {
  constructor(x, y, angle, speed, damage, fromPlayer, color = '#ffe066') {
    this.id = nextId();
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.angle = angle;
    this.damage = damage;
    this.fromPlayer = fromPlayer;
    this.color = color;
    this.dead = false;
    this.life = 1.4;
    this.w = 5; this.h = 3;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
}

class Particle {
  constructor(x, y, vx, vy, color, size, life) {
    this.id = nextId();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.color = color;
    this.size = size;
    this.life = life;
    this.maxLife = life;
    this.gravity = 220;
    this.dead = false;
  }
  update(dt) {
    this.vy += this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
}

class PowerUp {
  constructor(x, y, kind, payload) {
    this.id = nextId();
    this.x = x; this.y = y;
    this.startY = y;
    this.kind = kind; // 'health' | 'life' | 'weapon'
    this.payload = payload; // e.g. weapon key
    this.vy = -60;
    this.landed = false;
    this.t = Math.random() * 10;
    this.life = 9; // segundos antes de desaparecer si no se recoge
    this.dead = false;
    this.w = 12; this.h = 12;
    this.color = kind === 'health' ? '#e35d4f' : kind === 'life' ? '#4fb3c9' : '#ffd23f';
  }
  update(dt, groundY) {
    this.t += dt;
    if (!this.landed) {
      this.vy += 300 * dt;
      this.y += this.vy * dt;
      if (this.y >= groundY) { this.y = groundY; this.landed = true; this.vy = 0; }
    } else {
      this.life -= dt;
      if (this.life <= 0) this.dead = true;
    }
  }
  draw(ctx) {
    drawPowerup(ctx, this);
  }
}

class Crate {
  constructor(x, y, w, h) {
    this.id = nextId();
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.hp = 3;
    this.damageStage = 0;
    this.dead = false;
  }
  hit() {
    this.hp--;
    this.damageStage = 3 - Math.max(0, this.hp);
    if (this.hp <= 0) this.dead = true;
    return this.dead;
  }
  draw(ctx) {
    drawCrate(ctx, this);
  }
}

// Fisica compartida de suelo/plataformas para cualquier entidad con
// x,y (pies), vx,vy, w y onGround. Usada por jugador y enemigos terrestres.
function applyPlatformPhysics(e, level, dt, gravity = 640) {
  e.vy += gravity * dt;
  if (e.vy > 500) e.vy = 500;
  const prevBottom = e.y;
  e.y += e.vy * dt;
  e.onGround = false;
  for (const plat of level.solids) {
    const halfW = e.w / 2;
    if (e.x + halfW > plat.x && e.x - halfW < plat.x + plat.w) {
      if (e.vy >= 0 && prevBottom <= plat.y + 0.5 && e.y >= plat.y) {
        e.y = plat.y;
        e.vy = 0;
        e.onGround = true;
      }
    }
  }
  if (e.y >= level.groundY) {
    e.y = level.groundY;
    e.vy = 0;
    e.onGround = true;
  }
}

function aabbOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function bulletBoxOverlap(bullet, box) {
  return bullet.x + bullet.w / 2 > box.x && bullet.x - bullet.w / 2 < box.x + box.w &&
         bullet.y + bullet.h / 2 > box.y && bullet.y - bullet.h / 2 < box.y + box.h;
}

// Tope de particulas vivas a la vez, para evitar caidas de rendimiento
// cuando coinciden explosiones grandes (ej. muerte del jefe + fuegos
// artificiales de victoria).
const MAX_PARTICLES = 400;

function spawnExplosion(particles, x, y, count, colors, spread = 120) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 30 + Math.random() * spread;
    const color = colors[Math.floor(Math.random() * colors.length)];
    particles.push(new Particle(x, y, Math.cos(a) * speed, Math.sin(a) * speed - 40, color, 2 + Math.random() * 2, 0.4 + Math.random() * 0.5));
  }
  if (particles.length > MAX_PARTICLES) {
    particles.splice(0, particles.length - MAX_PARTICLES);
  }
}
