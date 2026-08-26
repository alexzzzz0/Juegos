(function () {
'use strict';
const { TILE, COLS, ROWS, buildLevel } = window.Levels;
const W = COLS * TILE;
const H = ROWS * TILE;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ==========================================
// FÍSICA DEL SALTO
// ==========================================
// gravedad = 1080 (ver update del jugador). altura = v0²/(2·gravedad).
// BASE_JUMP_VY=526 → 526²/(2·1080) ≈ 128.1px = 4.0 tiles exactos (antes 456 → 3.0 tiles; el
// usuario reportó que 3 tiles seguía quedando "por un pelo" corto en varios bloques, así que
// se sube el salto en sí en vez de depender del impulso de correr para cerrar la distancia).
const BASE_JUMP_VY = 526;
// Impulso de carrera al estilo Mario NES: al saltar corriendo a tope, se suma este extra de
// velocidad vertical, dando un salto más alto sin tocar la gravedad ni el salto "de pie".
// RUN_JUMP_BOOST=40 → a velocidad máxima de carrera añade ≈16px (~0.5 tile) extra de altura.
const RUN_JUMP_BOOST = 40;
const RUN_BOOST_SPEED = 285; // topSpeed corriendo (ver updatePlayer) — referencia para escalar el impulso.

function makePlayer(id, active = true) {
  return { id, active, x: 72 + id * 45, y: 360, w: 24, h: 30, vx: 0, vy: 0, onGround: false, jumpHeld: false, jumpBuffer: 0, coyoteTime: 0, facing: 1, lives: 3, maxLives: 5, coins: 0, score: 0, power: 'small', starTimer: 0, invincible: 0, fireCooldown: 0, blink: 0, running: false, checkpointX: 65, ducking: false, sliding: false, slideTimer: 0 };
}

class PixelQuest {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.callbacks = callbacks;
    this.controls = [{ left: false, right: false, jump: false, fire: false, down: false }, { left: false, right: false, jump: false, fire: false, down: false }];
    this.players = [makePlayer(0), makePlayer(1, false)];
    this.level = buildLevel(0);
    this.projectiles = [];
    this.items = [];
    this.running = false;
    this.mode = 'solo';
    this.lastTime = 0;
    this.network = null;
    this.remoteInput = { left: false, right: false, jump: false, fire: false, down: false };
    this.snapshotTimer = 0;
    this.banner = null;
    this.transition = 0;
    this.cameraX = 0;
    this.paused = false;
    this.particles = [];
    this.popups = [];
    this.shake = 0;
    this.flagSlide = null;
    this.timeUpFlash = 0;
    this.raf = requestAnimationFrame((time) => this.loop(time));
    this.bindKeys();
    this.draw();
  }

  bindKeys() {
    const set = (event, value) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.code === 'Escape' || event.code === 'KeyP') {
        if (value) this.togglePause();
        event.preventDefault();
        return;
      }
      const p2 = this.mode === 'solo' ? 0 : 1;
      const map = {
        KeyA: [0, 'left'], KeyD: [0, 'right'], KeyW: [0, 'jump'], Space: [0, 'jump'], ShiftLeft: [0, 'fire'], ShiftRight: [0, 'fire'], KeyS: [0, 'down'],
        ArrowLeft: [p2, 'left'], ArrowRight: [p2, 'right'], ArrowUp: [p2, 'jump'], Slash: [p2, 'fire'], Enter: [p2, 'fire'], ArrowDown: [p2, 'down'],
      };
      const entry = map[event.code];
      if (!entry) return;
      event.preventDefault();
      this.controls[entry[0]][entry[1]] = value;
    };
    window.addEventListener('keydown', (event) => set(event, true));
    window.addEventListener('keyup', (event) => set(event, false));
  }

  setNetwork(network) { this.network = network; }
  setRemoteInput(input) { this.remoteInput = { ...this.remoteInput, ...input }; }
  sound(effect) { this.callbacks.onSound?.(effect); }
  setPaused(paused) {
    if (!this.running) return;
    this.paused = paused;
    this.callbacks.onPause?.(paused);
  }
  togglePause() { this.setPaused(!this.paused); }
  restartCurrentLevel() {
    for (const player of this.players) {
      player.active = this.mode === 'solo' ? player.id === 0 : true;
      player.lives = 3; player.power = 'small'; player.h = 30; player.starTimer = 0; player.invincible = 0; player.ducking = false; player.sliding = false; player.slideTimer = 0;
    }
    this.paused = false;
    this.callbacks.onPause?.(false);
    this.loadLevel(this.level.index);
  }

  start(mode) {
    this.mode = mode;
    this.players = [makePlayer(0), makePlayer(1, mode !== 'solo')];
    this.projectiles = [];
    this.items = [];
    this.running = true;
    this.transition = 0;
    this.paused = false;
    this.callbacks.onPause?.(false);
    this.controls = [{ left: false, right: false, jump: false, fire: false, down: false }, { left: false, right: false, jump: false, fire: false, down: false }];
    this.loadLevel(0);
  }

  loadLevel(index, silent = false) {
    this.level = buildLevel(index);
    this.level.timeLeft = this.level.timeLimit;
    this.projectiles = [];
    this.items = this.level.items.map((item) => ({ ...item }));
    this.cameraX = 0;
    this.particles = [];
    this.popups = [];
    this.shake = 0;
    this.flagSlide = null;
    for (const player of this.players) {
      player.x = 65 + player.id * 44;
      player.checkpointX = player.x;
      player.y = 380;
      player.vx = 0;
      player.vy = 0;
      player.onGround = false;
      player.wasOnGround = false;
      player.fireCooldown = 0;
      player.jumpHeld = false;
      player.jumpBuffer = 0;
      player.coyoteTime = 0;
      player.walkPhase = 0;
      player.squash = 0;
      player.frozen = false;
      player.dustTimer = 0;
      player.ducking = false;
      player.sliding = false;
      player.slideTimer = 0;
    }
    this.banner = { title: `NIVEL ${this.level.number}`, subtitle: this.level.name, time: 2.5 };
    if (!silent) this.callbacks.onLevel?.(this.level);
  }

  receiveSnapshot(snapshot) {
    if (!snapshot || !Number.isInteger(snapshot.level) || snapshot.level < 0 || snapshot.level > 14) return;
    if (!this.level || snapshot.level !== this.level.index) this.level = buildLevel(snapshot.level);
    this.players = snapshot.players;
    this.level.enemies = snapshot.enemies;
    this.level.coins = snapshot.coins;
    this.level.blocks = snapshot.blocks;
    this.level.goal.locked = snapshot.goalLocked;
    this.items = snapshot.items;
    this.projectiles = snapshot.projectiles;
    this.level.activeCheckpoint = snapshot.activeCheckpoint || 0;
    if (snapshot.checkpoints) this.level.checkpoints = snapshot.checkpoints;
    this.transition = snapshot.transition || 0;
    this.level.timeLeft = snapshot.timeLeft ?? this.level.timeLeft;
    this.level.goal.flag = snapshot.goalFlag ?? 1;
    this.running = true;
    this.updateCamera();
    this.callbacks.onLevel?.(this.level);
  }

  snapshot() {
    return {
      level: this.level.index,
      players: this.players,
      enemies: this.level.enemies,
      coins: this.level.coins,
      blocks: this.level.blocks,
      goalLocked: this.level.goal.locked,
      items: this.items,
      projectiles: this.projectiles,
      activeCheckpoint: this.level.activeCheckpoint,
      checkpoints: this.level.checkpoints,
      transition: this.transition,
      timeLeft: this.level.timeLeft,
      goalFlag: this.level.goal.flag,
    };
  }

  loop(now) {
    const delta = Math.min(0.033, (now - this.lastTime || 0) / 1000);
    this.lastTime = now;
    if (this.running && !this.paused) {
      this.update(delta);
      this.draw();
    }
    this.raf = requestAnimationFrame((time) => this.loop(time));
  }

  update(dt) {
    this.elapsed = (this.elapsed || 0) + dt;
    this.updateParticles(dt);
    this.updatePopups(dt);
    this.shake = Math.max(0, this.shake - dt * 28);
    for (const player of this.players) if (!player.active && player.deathTimer > 0) {
      player.deathTimer -= dt;
      player.vy += 900 * dt;
      player.y += player.vy * dt;
    }
    if (this.mode === 'lan-guest') {
      if (this.banner) {
        this.banner.time -= dt;
        if (this.banner.time <= 0) this.banner = null;
      }
      this.network?.input(this.controls[1]);
      return;
    }
    if (this.transition > 0) {
      this.transition -= dt;
      this.updateFlagSlide(dt);
      if (this.transition <= 0) this.advanceLevel();
      if (this.mode === 'lan-host') {
        this.snapshotTimer += dt;
        if (this.snapshotTimer > 0.05) {
          this.snapshotTimer = 0;
          this.network?.state(this.snapshot());
        }
      }
      return;
    }
    if (this.banner) {
      this.banner.time -= dt;
      if (this.banner.time <= 0) this.banner = null;
    }
    this.updateTimer(dt);
    const inputs = [this.controls[0], this.mode === 'lan-host' ? this.remoteInput : this.controls[1]];
    for (const player of this.players) if (player.active) this.updatePlayer(player, inputs[player.id], dt);
    this.updateItems(dt);
    this.updateBlocks(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.checkCollections();
    this.checkCheckpoints();
    this.checkEnemyTouches();
    this.checkGoal();
    this.updateCamera();
    if (this.mode === 'lan-host') {
      this.snapshotTimer += dt;
      if (this.snapshotTimer > 0.05) {
        this.snapshotTimer = 0;
        this.network?.state(this.snapshot());
      }
    }
  }

  updateTimer(dt) {
    if (this.level.timeLeft === undefined) return;
    this.level.timeLeft -= dt;
    if (this.level.timeLeft <= 0) {
      this.shake = Math.max(this.shake, 10);
      this.banner = { title: '¡SE ACABÓ EL TIEMPO!', subtitle: 'El reloj castigó a los héroes', time: 1.6 };
      this.sound('hurt');
      for (const player of this.players) if (player.active) this.damagePlayer(player, true);
      this.level.timeLeft = this.level.timeLimit;
    }
  }

  updateFlagSlide(dt) {
    if (!this.flagSlide) return;
    const player = this.players[this.flagSlide.playerId];
    const progress = clamp(1 - this.transition / this.flagSlide.duration, 0, 1);
    this.level.goal.flag = clamp(1 - progress * 1.3, 0, 1);
    if (!player) return;
    if (progress < .6) {
      player.y = this.flagSlide.startY + (this.flagSlide.groundY - this.flagSlide.startY) * (progress / .6);
      player.facing = 1;
    } else {
      player.y = this.flagSlide.groundY;
      player.x += 95 * dt;
      player.walkPhase = (player.walkPhase || 0) + 95 * dt * .05;
    }
  }

  spawnPopup(x, y, text, color = '#fff') {
    this.popups.push({ x, y, text, color, life: 1, vy: -42 });
  }

  updatePopups(dt) {
    for (const popup of this.popups) { popup.life -= dt; popup.vy += 50 * dt; popup.y += popup.vy * dt; }
    this.popups = this.popups.filter((popup) => popup.life > 0);
  }

  spawnParticles(x, y, count, color, opts = {}) {
    const life = opts.life ?? .45;
    for (let n = 0; n < count; n++) {
      const baseAngle = opts.angle ?? Math.random() * Math.PI * 2;
      const angle = opts.spread ? baseAngle + (Math.random() - .5) * opts.spread : baseAngle;
      const speed = (opts.speed ?? 90) + Math.random() * (opts.speedVar ?? 60);
      this.particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life, maxLife: life, color, size: opts.size ?? 4, gravity: opts.gravity ?? 480,
      });
    }
  }
  

  updateParticles(dt) {
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.vy += particle.gravity * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  rectSolid(rect) {
    const left = Math.floor(rect.x / TILE);
    const right = Math.floor((rect.x + rect.w - 0.001) / TILE);
    const top = Math.floor(rect.y / TILE);
    const bottom = Math.floor((rect.y + rect.h - 0.001) / TILE);
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      if (y < 0 || x < 0 || x >= this.level.cols || y >= ROWS) continue;
      if (this.level.map[y][x]) return true;
    }
    return this.level.blocks.some((block) => !block.destroyed && hit(rect, { x: block.x, y: block.y, w: TILE, h: TILE }));
  }

  updatePlayer(p, input, dt) {
    p.previousBottom = p.y + p.h;
    const wasOnGround = p.onGround;
    p.invincible = Math.max(0, p.invincible - dt);
    p.starTimer = Math.max(0, p.starTimer - dt);
    p.fireCooldown = Math.max(0, p.fireCooldown - dt);
    p.squash = (p.squash || 0) * Math.max(0, 1 - dt * 11);

    // Agacharse: Pequeño ya cabe en huecos bajos, así que solo cambia la hitbox con Hongo/Flor.
    const duckHeight = 30;
    const fullHeight = p.power === 'small' ? 30 : 50;
    const wantsDuck = Boolean(input.down) && p.onGround && p.power !== 'small';
    if (wantsDuck && !p.ducking) {
      // Si venía corriendo al agacharse, arranca un derrape: conserva (e incluso estira) el impulso
      // para cruzar huecos bajos sin frenar en seco, en vez de quedar clavado bajo el techo.
      const slideBoost = Math.abs(p.vx) > 130;
      p.y += p.h - duckHeight;
      p.h = duckHeight;
      p.ducking = true;
      if (slideBoost) {
        p.sliding = true;
        p.slideTimer = .5;
        p.vx = clamp(p.vx * 1.15, -320, 320);
        this.spawnParticles(p.x + p.w / 2, p.y + p.h - 3, 5, '#d8f7ff', { speed: 60, speedVar: 40, life: .3, size: 3, gravity: 30, angle: p.facing > 0 ? Math.PI : 0, spread: .5 });
        this.sound('skid');
      }
    } else if (!wantsDuck && p.ducking) {
      // Solo se levanta si hay techo libre encima; si no, sigue agachado hasta salir del túnel.
      const grownBox = { x: p.x, y: p.y - (fullHeight - p.h), w: p.w, h: fullHeight };
      if (!this.rectSolid(grownBox)) {
        p.y -= (fullHeight - p.h);
        p.h = fullHeight;
        p.ducking = false;
        p.sliding = false;
      }
    }
    // Red de seguridad: si el cuerpo grande quedó incrustado en un bloque -por ejemplo, al aterrizar
    // bajo un techo con poco espacio, o justo después de crecer cerca de uno- se agacha al instante
    // en vez de temblar o quedar trabado contra la pared. Así ningún tramo del nivel puede "buguear".
    if (!p.ducking && p.power !== 'small' && this.rectSolid(p)) {
      p.y += p.h - duckHeight;
      p.h = duckHeight;
      p.ducking = true;
      p.sliding = false;
    }
    if (p.sliding) {
      p.slideTimer = (p.slideTimer || 0) - dt;
      if (p.slideTimer <= 0 || Math.abs(p.vx) < 55 || !p.ducking) p.sliding = false;
    }

    // Agachado sin derrapar: Grande avanza despacio bajo el techo en vez de quedar totalmente inmóvil.
    const direction = p.sliding ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0);
    // La misma tecla de acción acelera al héroe y, tras conseguir una flor, dispara.
    p.running = Boolean(direction && input.fire) && !p.ducking;
    const topSpeed = p.sliding ? 320 : p.ducking ? 100 : (p.running ? 285 : 175);
    if (direction) p.facing = direction;
    const acceleration = p.ducking ? 900 : (p.onGround ? 1450 : 720);
    const friction = p.sliding ? 210 : (p.onGround ? 1850 : 230);
    if (direction) p.vx = clamp(p.vx + direction * acceleration * dt, -topSpeed, topSpeed);
    else if (p.vx > 0) p.vx = Math.max(0, p.vx - friction * dt);
    else if (p.vx < 0) p.vx = Math.min(0, p.vx + friction * dt);
    p.walkPhase = (p.walkPhase || 0) + Math.abs(p.vx) * dt * .05;
    if (p.sliding && p.onGround) {
      p.dustTimer = (p.dustTimer || 0) - dt;
      if (p.dustTimer <= 0) {
        p.dustTimer = .045;
        this.spawnParticles(p.x + (p.vx > 0 ? 0 : p.w), p.y + p.h - 2, 2, '#eafcff', { speed: 45, speedVar: 30, life: .25, size: 3, gravity: 20, angle: p.facing > 0 ? Math.PI : 0, spread: .55 });
      }
    } else if (p.onGround && Math.abs(p.vx) > 130) {
      p.dustTimer = (p.dustTimer || 0) - dt;
      if (p.dustTimer <= 0) {
        p.dustTimer = p.running ? .06 : .1;
        this.spawnParticles(p.x + (p.vx > 0 ? 2 : p.w - 2), p.y + p.h - 2, 1, '#f4efe0', { speed: 16, speedVar: 12, life: .3, size: 3, gravity: 40, angle: Math.PI, spread: .7 });
      }
    } else p.dustTimer = 0;
    // Buffer de salto: registra una pulsación un instante antes de aterrizar.
    p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
    if (input.jump && !p.jumpHeld) p.jumpBuffer = .14;
    p.jumpHeld = input.jump;
    p.coyoteTime = p.onGround ? .11 : Math.max(0, p.coyoteTime - dt);
    if (!input.jump && p.vy < -170) p.vy += 950 * dt;
    p.vy += 1080 * dt;
    p.vy = Math.min(p.vy, 640);

    p.x += p.vx * dt;
    if (this.rectSolid(p)) {
      if (p.vx > 0) p.x = Math.floor((p.x + p.w - .001) / TILE) * TILE - p.w;
      if (p.vx < 0) p.x = Math.floor(p.x / TILE + 1) * TILE;
      p.vx = 0;
    }
    p.x = clamp(p.x, 0, this.level.width - p.w);
    p.onGround = false;
    const fallSpeed = p.vy;
    p.y += p.vy * dt;
    if (this.rectSolid(p)) {
      if (p.vy > 0) {
        p.y = Math.floor((p.y + p.h - .001) / TILE) * TILE - p.h;
        p.onGround = true;
        p.coyoteTime = .11;
        if (!wasOnGround && fallSpeed > 260) {
          p.squash = -Math.min(.45, fallSpeed / 1200);
          this.spawnParticles(p.x + p.w / 2, p.y + p.h, fallSpeed > 480 ? 6 : 3, '#f4efe0', { speed: 60, speedVar: 40, life: .35, size: 3, gravity: 90, spread: 2.4, angle: -Math.PI / 2 });
        }
      } else if (p.vy < 0) {
        p.y = Math.floor(p.y / TILE + 1) * TILE;
        this.hitBlock(p);
      }
      p.vy = 0;
    }
    // También permite saltar justo después de tocar el piso, sin depender de un "cooldown".
    if (p.jumpBuffer > 0 && p.coyoteTime > 0) {
      // Impulso de carrera: cuanto más rápido viene el jugador, más alto salta — igual que el
      // "impulso" del Mario de NES, donde correr antes de saltar te da un salto más grande.
      // Escala de forma continua con la velocidad horizontal actual (no solo con el flag
      // `running`), así que incluso ir a paso normal da un empujoncito, y correr a tope da el
      // impulso completo.
      const runBoost = clamp(Math.abs(p.vx) / RUN_BOOST_SPEED, 0, 1) * RUN_JUMP_BOOST;
      p.vy = -(BASE_JUMP_VY + runBoost);
      p.onGround = false;
      p.jumpBuffer = 0;
      p.coyoteTime = 0;
      p.squash = .3;
      this.spawnParticles(p.x + p.w / 2, p.y + p.h, 4, '#f4efe0', { speed: 50, speedVar: 30, life: .3, size: 3, gravity: 60, spread: 2.2, angle: Math.PI / 2 });
      this.sound('jump');
    }
    // Shift/acción solamente dispara al tener la Flor; la estrella es invencibilidad, no una pistola.
    if (input.fire && p.fireCooldown === 0 && p.power === 'flower') {
      p.fireCooldown = .38;
      this.projectiles.push({ x: p.x + (p.facing > 0 ? p.w : -9), y: p.y + 13, w: 10, h: 10, vx: p.facing * 420, vy: -30, owner: 'player', from: p.id, life: 1.7 });
      this.sound('shoot');
    }
    if (p.y > H + 45) this.damagePlayer(p, true);
  }

  hitBlock(p) {
    for (const block of this.level.blocks) {
      if (block.destroyed) continue;
      const box = { x: block.x, y: block.y, w: TILE, h: TILE };
      const belowBlock = p.y >= box.y + TILE - 2 && p.y <= box.y + TILE + 2;
      const horizontal = p.x + p.w > box.x + 3 && p.x < box.x + box.w - 3;
      if (!belowBlock || !horizontal) continue;
      if (block.kind === 'brick') {
        if (p.power !== 'small') {
          block.destroyed = true;
          p.score += 25;
          this.spawnPopup(block.x + 10, block.y - 6, '+25', '#ffb774');
          this.spawnParticles(block.x + 16, block.y + 16, 6, '#a85a4a', { speed: 150, speedVar: 90, life: .5, size: 6, gravity: 700 });
          this.sound('break');
        } else {
          block.bump = .12;
          this.sound('block');
        }
        break;
      }
      if (!block.used) {
        block.used = true;
        this.items.push({ type: block.power, x: block.x + 4, y: block.y - 4, w: 24, h: 24, vy: -105, born: .4 });
        p.score += 50;
        this.spawnPopup(block.x + 10, block.y - 6, '+50', '#fff096');
        this.spawnParticles(block.x + 16, block.y, 5, '#fff3b0', { speed: 55, speedVar: 35, life: .35, size: 3, gravity: 100, angle: -Math.PI / 2, spread: 1.4 });
        this.sound('block');
        break;
      }
    }
  }

  updateItems(dt) {
    for (const item of this.items) {
      if (item.static) continue;
      item.born -= dt;
      item.vy += 650 * dt;
      item.y += item.vy * dt;
      const test = { x: item.x, y: item.y, w: item.w, h: item.h };
      if (this.rectSolid(test)) {
        item.y = Math.floor((item.y + item.h - .001) / TILE) * TILE - item.h;
        item.vy = 0;
      }
    }
  }

  updateBlocks(dt) {
    for (const block of this.level.blocks) if (block.bump > 0) block.bump = Math.max(0, block.bump - dt);
  }

  enemyBox(e) {
    const size = e.type === 'boss' ? 50 : e.type === 'beetle' ? 27 : e.type === 'hopper' ? 26 : 24;
    return { x: e.x, y: e.y, w: size, h: size };
  }

  updateEnemies(dt) {
    for (const e of this.level.enemies) {
      if (e.dead) { e.fade = (e.fade ?? .4) - dt; continue; }
      e.timer -= dt * 60;
      if (e.type === 'flyer' || e.type === 'ghost') {
        e.x += e.dir * (e.type === 'ghost' ? 48 : 70) * dt;
        e.y = e.baseY + Math.sin((e.timer || 0) / (e.type === 'ghost' ? 17 : 22)) * (e.type === 'ghost' ? 34 : 26);
        if (Math.abs(e.x - e.homeX) > 90) e.dir *= -1;
      } else if (e.type === 'hopper') {
        e.x += e.dir * 58 * dt;
        e.y = e.baseY - Math.abs(Math.sin((e.timer || 0) / 18)) * 42;
        if (Math.abs(e.x - e.homeX) > 76) e.dir *= -1;
      } else if (e.type === 'turret') {
        if (e.timer <= 0) {
          e.timer = 150;
          const target = this.nearestPlayer(e.x, e.y);
          this.projectiles.push({ x: e.x + 10, y: e.y + 8, w: 10, h: 10, vx: (target.x < e.x ? -1 : 1) * 180, vy: -60, owner: 'enemy', life: 4 });
        }
      } else if (e.type === 'boss') {
        e.x += e.dir * (55 + this.level.world * 12) * dt;
        const arena = this.level.bossArena || { left: 580, right: 850 };
        if (e.x < arena.left || e.x > arena.right) e.dir *= -1;
        if (e.timer <= 0) {
          e.timer = Math.max(62, 130 - this.level.world * 18);
          const target = this.nearestPlayer(e.x, e.y);
          this.projectiles.push({ x: e.x + 21, y: e.y + 21, w: 13, h: 13, vx: (target.x < e.x ? -1 : 1) * 205, vy: -120, owner: 'enemy', life: 4 });
        }
      } else {
        const speed = e.type === 'beetle' ? 45 : 63;
        e.x += e.dir * speed * dt;
        const box = this.enemyBox(e);
        const wall = this.rectSolid(box);
        const aheadX = e.dir > 0 ? e.x + box.w + 2 : e.x - 2;
        const groundAhead = this.rectSolid({ x: aheadX, y: e.y + box.h + 1, w: 2, h: 3 });
        if (wall || !groundAhead) { e.x -= e.dir * speed * dt; e.dir *= -1; }
      }
    }
    this.level.enemies = this.level.enemies.filter((e) => !e.dead || e.fade > 0);
  }

  nearestPlayer(x, y) {
    return this.players.filter((p) => p.active).sort((a, b) => Math.abs(a.x - x) + Math.abs(a.y - y) - Math.abs(b.x - x) - Math.abs(b.y - y))[0] || this.players[0];
  }

  updateProjectiles(dt) {
    for (const ball of this.projectiles) {
      ball.life -= dt;
      ball.vy += ball.owner === 'enemy' ? 330 * dt : 100 * dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (this.rectSolid(ball)) ball.life = 0;
      if (ball.owner === 'player') {
        for (const enemy of this.level.enemies) if (!enemy.dead && hit(ball, this.enemyBox(enemy))) {
          this.hurtEnemy(enemy, ball.from); ball.life = 0; break;
        }
      } else {
        for (const player of this.players) if (player.active && hit(ball, player)) { this.damagePlayer(player); ball.life = 0; break; }
      }
    }
    this.projectiles = this.projectiles.filter((ball) => ball.life > 0 && ball.x > -30 && ball.x < this.level.width + 30 && ball.y < H + 30);
  }

  checkCollections() {
    for (const player of this.players) if (player.active) {
      for (const coin of this.level.coins) if (!coin.taken && hit(player, { x: coin.x, y: coin.y, w: 11, h: 15 })) {
        coin.taken = true; player.coins++; player.score += 10;
        this.spawnPopup(coin.x, coin.y - 4, '+10', '#ffe36c');
        this.spawnParticles(coin.x + 5, coin.y + 6, 4, '#ffe36c', { speed: 80, speedVar: 50, life: .35, size: 3, gravity: 260 });
        this.sound('coin');
        if (player.coins % 25 === 0) {
          player.lives = Math.min(player.maxLives, player.lives + 1);
          this.spawnPopup(player.x + player.w / 2, player.y - 18, '1UP', '#7cfc9a');
          this.sound('oneup');
        }
      }
      for (const item of this.items) if (!item.taken && item.born <= 0 && hit(player, item)) {
        item.taken = true; this.givePower(player, item.type);
      }
    }
    this.items = this.items.filter((item) => !item.taken);
  }

  checkCheckpoints() {
    for (let index = 0; index < this.level.checkpoints.length; index++) {
      const checkpoint = this.level.checkpoints[index];
      if (checkpoint.active || !this.players.some((player) => player.active && player.x + player.w >= checkpoint.x)) continue;
      checkpoint.active = true;
      this.level.activeCheckpoint = index + 1;
      for (const player of this.players) if (player.active) player.checkpointX = checkpoint.x + TILE;
      this.banner = { title: 'PUNTO DE CONTROL', subtitle: 'Si pierdes una vida volverás aquí', time: 1.5 };
      this.sound('coin');
    }
  }

  givePower(player, type) {
    if (type === 'mushroom' || type === 'flower') {
      player.power = type;
      if (player.h < 45) {
        // Antes de estirar la hitbox comprobamos que haya techo libre; si no, crece "en modo agachado"
        // (compacto) y se pondrá de pie solo (misma lógica que al soltar S/↓) en cuanto haya espacio.
        const grownBox = { x: player.x, y: player.y - 20, w: player.w, h: 50 };
        if (!this.rectSolid(grownBox)) {
          player.y -= 20; player.h = 50; player.ducking = false;
        } else {
          player.h = 30; player.ducking = true;
        }
      }
    }
    if (type === 'star') { player.starTimer = 9; player.invincible = 9; }
    player.score += 100;
    const glow = type === 'star' ? '#ffec62' : type === 'flower' ? '#ff8060' : '#f15d57';
    this.spawnPopup(player.x + player.w / 2, player.y - 18, '+100', '#fff5a5');
    this.spawnParticles(player.x + player.w / 2, player.y + player.h / 2, 10, glow, { speed: 130, speedVar: 90, life: .5, size: 4, gravity: 200 });
    this.sound('power');
  }

  checkEnemyTouches() {
    for (const player of this.players) if (player.active) for (const enemy of this.level.enemies) {
      const playerBox = { x: player.x + 3, y: player.y + 3, w: player.w - 6, h: player.h - 4 };
      if (enemy.dead || !hit(playerBox, this.enemyBox(enemy))) continue;
      const enemyBox = this.enemyBox(enemy);
      const stomp = player.vy > 25 && player.previousBottom <= enemyBox.y + 9 && player.y + player.h >= enemyBox.y;
      if (player.starTimer > 0 || stomp) {
        this.hurtEnemy(enemy, player.id, enemy.type === 'boss' ? 1 : 99);
        player.vy = -290;
      } else this.damagePlayer(player);
    }
  }

  hurtEnemy(enemy, playerId = 0, amount = 1) {
    enemy.hp -= amount;
    const player = this.players[playerId];
    if (enemy.hp <= 0) {
      enemy.dead = true;
      enemy.fade = .4;
      const box = this.enemyBox(enemy);
      const gain = enemy.type === 'boss' ? 1000 : 100;
      player && (player.score += gain);
      this.spawnPopup(box.x + box.w / 2, box.y - 4, `+${gain}`, '#ffd9e0');
      if (enemy.type === 'boss') {
        this.level.goal.locked = false;
        this.banner = { title: '¡JEFE VENCIDO!', subtitle: 'La salida se ha desbloqueado', time: 2.3 };
        this.shake = Math.max(this.shake, 16);
        this.spawnParticles(box.x + box.w / 2, box.y + box.h / 2, 28, '#ffcd6b', { speed: 220, speedVar: 140, life: .8, size: 5, gravity: 260 });
        this.sound('boss');
      } else {
        this.spawnParticles(box.x + box.w / 2, box.y + box.h / 2, 8, '#d7b9f5', { speed: 130, speedVar: 80, life: .4, size: 4, gravity: 320 });
        this.sound('enemy');
      }
    }
  }

  damagePlayer(player, fell = false) {
    if (player.invincible > 0 && !fell) return;
    this.shake = Math.max(this.shake, 6);
    if (!fell && player.power === 'flower') {
      player.power = 'mushroom'; player.invincible = 1.8; this.sound('hurt');
      this.spawnParticles(player.x + player.w / 2, player.y + player.h / 2, 6, '#ff8060', { speed: 100, speedVar: 60, life: .35, size: 3 });
      return;
    }
    if (!fell && player.power === 'mushroom') {
      player.power = 'small'; player.h = 30; player.y += 20; player.invincible = 1.8; player.ducking = false; player.sliding = false; this.sound('hurt');
      this.spawnParticles(player.x + player.w / 2, player.y + player.h / 2, 6, '#f15d57', { speed: 100, speedVar: 60, life: .35, size: 3 });
      return;
    }
    player.lives--;
    this.shake = Math.max(this.shake, 10);
    if (player.lives <= 0) {
      player.lives = 0;
      player.active = false;
      player.deathTimer = 1.1;
      player.vx = 0; player.vy = -360;
      if (!this.players.some((other) => other.active)) {
        this.running = false;
        this.paused = false;
        this.callbacks.onPause?.(false);
        this.sound('gameover');
        this.callbacks.onEnd?.({ type: 'lost', level: this.level });
      } else {
        this.banner = { title: `${player.id === 0 ? 'NOVA' : 'BYTE'} SIN VIDAS`, subtitle: 'Tu compañero aún puede llegar a la salida', time: 2.2 };
      }
      return;
    }
    player.x = player.checkpointX + player.id * 36; player.y = 340; player.vx = 0; player.vy = -180; player.invincible = 2.2; player.ducking = false;
    this.banner = { title: '¡VIDA PERDIDA!', subtitle: `Quedan ${player.lives} ${player.lives === 1 ? 'vida' : 'vidas'}`, time: 1.4 };
    this.sound('hurt');
  }

  checkGoal() {
    if (this.level.goal.locked || this.flagSlide) return;
    for (const player of this.players) if (player.active && hit(player, { x: this.level.goal.x, y: this.level.goal.y, w: 40, h: 130 })) {
      const bonus = Math.max(0, Math.round(this.level.timeLeft)) * 10;
      player.score += bonus;
      const duration = 1.7;
      this.transition = duration;
      this.flagSlide = { playerId: player.id, startY: player.y, groundY: 15 * TILE - player.h, duration };
      player.x = this.level.goal.x + 5;
      player.vx = 0; player.vy = 0;
      this.level.timeLeft = 0;
      this.spawnPopup(player.x + 10, player.y - 16, `TIEMPO +${bonus}`, '#ffe36c');
      this.spawnParticles(this.level.goal.x + 21, this.level.goal.y - 18, 12, '#bfe8ff', { speed: 90, speedVar: 70, life: .6, size: 4, gravity: 160 });
      this.banner = { title: this.level.isBoss ? 'GEMA RECUPERADA' : 'NIVEL SUPERADO', subtitle: `Bono de tiempo +${bonus}`, time: duration };
      this.sound('clear');
      break;
    }
  }

  advanceLevel() {
    const next = this.level.index + 1;
    if (next >= 15) {
      this.running = false;
      this.paused = false;
      this.callbacks.onPause?.(false);
      this.callbacks.onEnd?.({ type: 'won', level: this.level });
      return;
    }
    this.loadLevel(next);
  }

  updateCamera() {
    const active = this.players.filter((player) => player.active);
    if (!active.length) return;
    const focus = active.reduce((sum, player) => sum + player.x + player.w / 2, 0) / active.length;
    const target = clamp(focus - W * .42, 0, Math.max(0, this.level.width - W));
    this.cameraX += (target - this.cameraX) * .13;
  }

  draw() {
    const c = this.ctx;
    const level = this.level;
    const [top, bottom] = level.theme.sky;
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, top); sky.addColorStop(1, bottom);
    c.fillStyle = sky; c.fillRect(0, 0, W, H);
    this.drawBackdrop(c, level);
    c.save();
    const shakeX = this.shake > 0 ? (Math.random() - .5) * this.shake : 0;
    const shakeY = this.shake > 0 ? (Math.random() - .5) * this.shake * .6 : 0;
    c.translate(Math.round(shakeX - this.cameraX), Math.round(shakeY));
    this.drawMap(c, level);
    this.drawGoal(c, level);
    this.drawCheckpoints(c, level);
    for (const coin of level.coins) if (!coin.taken) this.drawCoin(c, coin.x, coin.y);
    for (const block of level.blocks) this.drawBlock(c, block);
    for (const item of this.items) this.drawItem(c, item);
    for (const enemy of level.enemies) {
      if (!enemy.dead) this.drawEnemy(c, enemy);
      else if (enemy.fade > 0) this.drawSquashedEnemy(c, enemy);
    }
    for (const ball of this.projectiles) this.drawProjectile(c, ball);
    for (const particle of this.particles) this.drawParticle(c, particle);
    for (const player of this.players) if (player.active || player.deathTimer > 0) this.drawPlayer(c, player);
    for (const popup of this.popups) this.drawPopup(c, popup);
    c.restore();
    this.drawPixelFinish(c);
    if (this.banner) this.drawBanner(c);
    if (!this.running) this.drawIdle(c);
    this.callbacks.onHud?.(this.players, level, this.mode);
  }

  drawParticle(c, particle) {
    const t = clamp(particle.life / particle.maxLife, 0, 1);
    c.save();
    c.globalAlpha = t;
    c.fillStyle = particle.color;
    const size = particle.size * (.5 + t * .5);
    c.fillRect(particle.x - size / 2, particle.y - size / 2, size, size);
    c.restore();
  }

  drawPopup(c, popup) {
    c.save();
    c.globalAlpha = clamp(popup.life, 0, 1);
    c.textAlign = 'center';
    c.font = '10px "Press Start 2P"';
    c.fillStyle = '#171531';
    c.fillText(popup.text, popup.x + 1, popup.y + 1);
    c.fillStyle = popup.color;
    c.fillText(popup.text, popup.x, popup.y);
    c.restore();
  }

  drawSquashedEnemy(c, enemy) {
    const box = this.enemyBox(enemy);
    const t = clamp(enemy.fade / .4, 0, 1);
    c.save();
    c.globalAlpha = t;
    c.translate(box.x + box.w / 2, box.y + box.h);
    c.scale(1 + (1 - t) * .5, Math.max(.08, t * .3));
    c.fillStyle = '#4b3a5c';
    c.fillRect(-box.w / 2, -box.h, box.w, box.h);
    c.restore();
  }

  // ---------- Utilidades de parallax ----------
  // Repite drawFn a lo largo de toda la pantalla en una capa que se desplaza a `factor`
  // de la velocidad de la cámara real (0 = fija, 1 = se mueve igual que el primer plano).
  // `drift` (px/seg) hace que la capa siga moviéndose sola aunque la cámara esté quieta
  // (nubes que navegan, humo que sube, etc.), para que el fondo se sienta vivo en reposo.
  parallaxRepeat(c, factor, spacing, drawFn, drift = 0) {
    const offset = this.cameraX * factor - (this.elapsed || 0) * drift;
    const start = Math.floor(offset / spacing) - 1;
    const end = Math.ceil((offset + W) / spacing) + 1;
    for (let i = start; i <= end; i++) drawFn(i * spacing - offset, i);
  }

  // Silueta ondulada continua (colinas/techo de cueva) sin costuras, usando dos senos
  // superpuestos para que no se vea como una onda perfecta y repetitiva.
  rollingSilhouette(c, baseY, amp, wave, factor, color, ceiling) {
    const cam = this.cameraX * factor;
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(0, ceiling ? 0 : H);
    for (let x = 0; x <= W; x += 14) {
      const wx = x + cam;
      const y = baseY + Math.sin(wx / wave) * amp + Math.sin(wx / (wave * .43) + 1.7) * amp * .4;
      c.lineTo(x, y);
    }
    c.lineTo(W, ceiling ? 0 : H);
    c.closePath();
    c.fill();
  }

  // Borde dentado (estalactitas/estalagmitas) colgando del techo o subiendo del suelo.
  jaggedEdge(c, baseY, toothH, toothW, factor, color, hangDown) {
    const cam = this.cameraX * factor;
    const start = Math.floor(cam / toothW) - 1;
    const end = Math.ceil((cam + W) / toothW) + 1;
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(start * toothW - cam, hangDown ? 0 : H);
    for (let i = start; i <= end; i++) {
      const x = i * toothW - cam;
      const h = toothH * (.55 + ((i * 37) % 5) / 5 * .5);
      c.lineTo(x + toothW / 2, hangDown ? baseY + h : baseY - h);
      c.lineTo(x + toothW, hangDown ? 0 : H);
    }
    c.closePath();
    c.fill();
  }

  softCloud(c, x, y, s, color) {
    c.fillStyle = color;
    c.beginPath(); c.ellipse(x, y, 30 * s, 14 * s, 0, 0, Math.PI * 2);
    c.ellipse(x + 22 * s, y - 6 * s, 20 * s, 12 * s, 0, 0, Math.PI * 2);
    c.ellipse(x - 20 * s, y - 3 * s, 18 * s, 11 * s, 0, 0, Math.PI * 2);
    c.fill();
  }

  glowSpot(c, x, y, r, color) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'transparent');
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }

  gearShape(c, x, y, r, teeth, rot, color) {
    c.save(); c.translate(x, y); c.rotate(rot);
    c.fillStyle = color;
    c.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const rr = i % 2 === 0 ? r : r * .78;
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
    }
    c.closePath(); c.fill();
    // Anillo del cubo central: un trazo más claro en vez de perforar el canvas
    // (destination-out borraría también el cielo detrás, no solo el engranaje).
    c.strokeStyle = color; c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, r * .34, 0, Math.PI * 2); c.stroke();
    c.restore();
  }

  drawAmbientDust(c, level) {
    const drift = this.cameraX * .1;
    for (let n = 0; n < 16; n++) {
      const seed = n * 131 + level.world * 71;
      const span = W + 40;
      const x = ((seed - drift) % span + span) % span - 20;
      const y = 30 + (seed * 7) % 240;
      const twinkle = .12 + Math.abs(Math.sin((this.elapsed || 0) * 2 + n)) * .22;
      c.fillStyle = `rgba(255,255,255,${twinkle.toFixed(2)})`;
      const s = n % 3 === 0 ? 3 : 2;
      c.fillRect(x, y, s, s);
    }
  }

  // ---------- Fondos por mundo ----------
  drawBackdrop(c, level) {
    if (level.world === 0) this.drawMeadowBackdrop(c);
    else if (level.world === 1) this.drawCavernBackdrop(c);
    else this.drawMechanicalBackdrop(c);
    this.drawAmbientDust(c, level);
  }

// MUNDO 1 · Praderas de Luz: Gradiente atmosférico, rayos de sol, montañas con capas profundas y flora detallada
  drawMeadowBackdrop(c) {
    const t = this.elapsed || 0;

    // Sol radiante con resplandor que "respira" suavemente
    const sunBreath = .45 + Math.sin(t * .7) * .06;
    this.glowSpot(c, W - 130 - this.cameraX * .02, 70, 210 + Math.sin(t * .7) * 14, `rgba(255, 238, 160, ${sunBreath.toFixed(2)})`);

    // Rayos de sol inclinados (God Rays) con ligero balanceo y parpadeo
    for (let i = 0; i < 3; i++) {
      const sway = Math.sin(t * .35 + i * 1.4) * 18;
      const flicker = .03 + Math.abs(Math.sin(t * .5 + i)) * .025;
      const rx = (W * 0.5 + i * 140 - this.cameraX * 0.015 + sway) % (W + 200) - 100;
      c.fillStyle = `rgba(255, 255, 255, ${flicker.toFixed(3)})`;
      c.beginPath();
      c.moveTo(rx, 0); c.lineTo(rx - 80, H); c.lineTo(rx - 10, H);
      c.fill();
    }

    // Siluetas lejanas (Montañas azulosas)
    this.rollingSilhouette(c, 170, 32, 230, .08, 'rgba(38, 62, 105, 0.22)');

    // Nubes suaves de fondo, navegando solas aunque la cámara esté quieta
    this.parallaxRepeat(c, .18, 240, (x, i) => {
      const bob = Math.sin(t * .5 + i * 1.7) * 4;
      this.softCloud(c, x, 45 + (i % 4) * 22 + bob, 1.2 + (i % 3) * .18, 'rgba(255, 255, 255, 0.28)');
    }, 9);

    // Cresta intermedia de colinas
    this.rollingSilhouette(c, 250, 24, 160, .26, 'rgba(42, 98, 66, 0.35)');
    
    // Arboles de fondo en capa media, meciéndose con la brisa
    this.parallaxRepeat(c, .28, 120, (x, i) => {
      const th = 38 + (i % 3) * 12;
      const sway = Math.sin(t * 1.1 + i * 2.1) * .05;
      c.save();
      c.translate(x + 6, 255);
      c.rotate(sway);
      c.fillStyle = 'rgba(32, 78, 48, 0.42)';
      c.fillRect(-1, -th, 6, th);
      c.beginPath(); c.arc(2, -th, 18, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(52, 118, 72, 0.35)';
      c.beginPath(); c.arc(-1, -th + 3, 12, 0, Math.PI * 2); c.fill();
      c.restore();
    });

    // Cresta cercana de colinas
    this.rollingSilhouette(c, 335, 18, 110, .42, 'rgba(38, 110, 64, 0.48)');
    
    // Arbustos detallados con flores al frente, con leve balanceo y brillo pulsante
    this.parallaxRepeat(c, .45, 80, (x, i) => {
      const sway = Math.sin(t * 1.4 + i * 1.3) * 2;
      c.fillStyle = i % 2 === 0 ? 'rgba(52, 138, 80, 0.5)' : 'rgba(68, 158, 98, 0.5)';
      c.beginPath(); c.arc(x + 10 + sway, 338, 11, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(x + 18 + sway, 342, 8, 0, Math.PI * 2); c.fill();

      // Flores silvestres que titilan como luciérnagas diurnas
      if (i % 3 === 0) {
        const twinkle = .35 + Math.abs(Math.sin(t * 2.4 + i * 3)) * .5;
        c.fillStyle = `rgba(255, 235, 150, ${twinkle.toFixed(2)})`;
        c.fillRect(x + 8 + sway, 332, 3, 3);
      }
    });

    // Mariposas revoloteando en la capa cercana
    this.parallaxRepeat(c, .5, 260, (x, i) => {
      const fx = x + Math.sin(t * 1.8 + i * 2.2) * 22;
      const fy = 300 + (i % 3) * 20 + Math.sin(t * 3.2 + i) * 10;
      const flap = Math.abs(Math.sin(t * 9 + i * 4));
      c.fillStyle = i % 2 === 0 ? 'rgba(255, 205, 110, 0.55)' : 'rgba(255, 255, 255, 0.5)';
      c.save();
      c.translate(fx, fy);
      c.scale(.4 + flap * .6, 1);
      c.beginPath(); c.ellipse(-3, 0, 4, 3, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(3, 0, 4, 3, 0, 0, Math.PI * 2); c.fill();
      c.restore();
    }, 4);
  }

  // MUNDO 2 · Cavernas de Cobre: Fondo oscuro cavernoso, cristales animados con pulso y brasas vivas
  drawCavernBackdrop(c) {
    const t = this.elapsed || 0;
    const pulse = .5 + Math.sin(t * 1.8) * .5;

    // Brillos de lava o magma subterráneo, burbujeando lentamente
    this.glowSpot(c, 180 - this.cameraX * .03 + Math.sin(t * .6) * 12, 420 + Math.sin(t * .9) * 6, 210, `rgba(255, 110, 50, ${(.18 + pulse * .12).toFixed(2)})`);
    this.glowSpot(c, 650 - this.cameraX * .05 + Math.cos(t * .5) * 14, 460 + Math.cos(t * .8) * 6, 180, `rgba(255, 185, 80, ${(.15 + pulse * .09).toFixed(2)})`);

    // Niebla mineral flotando a la deriva en capas medias
    this.parallaxRepeat(c, .16, 260, (x, i) => {
      const drift = Math.sin(t * .3 + i) * 8;
      c.fillStyle = 'rgba(120, 90, 150, 0.06)';
      c.beginPath(); c.ellipse(x + drift, 200 + (i % 3) * 60, 140, 30, 0, 0, Math.PI * 2); c.fill();
    }, 5);

    // Techo y suelo rocoso muy distante
    this.jaggedEdge(c, 0, 52, 110, .12, 'rgba(18, 12, 32, 0.88)', true);
    this.jaggedEdge(c, H, 45, 120, .18, 'rgba(15, 9, 28, 0.75)', false);

    // Cristales gigantes pulsantes en las paredes
    this.parallaxRepeat(c, .28, 180, (x, i) => {
      const y = 140 + (i * 67) % 220;
      const flick = .4 + Math.sin((this.elapsed || 0) * 4 + i * 2) * .6;
      
      // Resplandor del cristal
      c.fillStyle = `rgba(80, 220, 240, ${(.12 + flick * .2).toFixed(2)})`;
      c.beginPath(); c.arc(x, y, 16, 0, Math.PI * 2); c.fill();

      // Diamante del cristal
      c.fillStyle = `rgba(160, 245, 255, ${(.4 + flick * .5).toFixed(2)})`;
      c.beginPath();
      c.moveTo(x, y - 12); c.lineTo(x + 6, y); c.lineTo(x, y + 12); c.lineTo(x - 6, y);
      c.closePath(); c.fill();
    });

    // Partículas de ascuas/brasas ascendentes (Efecto fuego/polvo)
    this.parallaxRepeat(c, .48, 60, (x, i) => {
      const y = ((this.elapsed || 0) * 22 + i * 53) % (H + 40);
      const alpha = (.2 + .3 * Math.abs(Math.sin(i + (this.elapsed || 0)))).toFixed(2);
      c.fillStyle = i % 2 === 0 ? `rgba(255, 160, 60, ${alpha})` : `rgba(255, 210, 110, ${alpha})`;
      c.fillRect(x, H - y, 2.5, 2.5);
    });

    // Silueta rocosa en capa cercana (Techo)
    this.jaggedEdge(c, 28, 35, 70, .52, 'rgba(12, 8, 22, 0.82)', true);
  }

  // MUNDO 3 · Cielo Mecánico: Nubes industriales, maquinaria compleja, estructuras de vapor e iluminación neon
  drawMechanicalBackdrop(c) {
    const t = this.elapsed || 0;

    // Nubes lejanas y neblina industrial, a la deriva por sí solas
    this.parallaxRepeat(c, .12, 300, (x, i) => {
      const bob = Math.sin(t * .4 + i * 1.6) * 5;
      this.softCloud(c, x, 40 + (i % 3) * 35 + bob, 1.3, 'rgba(160, 195, 240, 0.18)');
    }, 7);

    // Engranajes grandes de fondo (Giro opuesto según posición)
    this.parallaxRepeat(c, .22, 200, (x, i) => {
      const rot = t * (i % 2 === 0 ? .2 : -.2);
      const size = 38 + (i % 2) * 12;
      this.gearShape(c, x + 30, 110 + (i % 3) * 60, size, 10, rot, 'rgba(18, 35, 68, 0.38)');
    });

    // Columnas metálicas con remaches y luces
    this.parallaxRepeat(c, .38, 140, (x, i) => {
      c.fillStyle = 'rgba(48, 64, 98, 0.32)';
      c.fillRect(x, 0, 18, H);
      c.fillStyle = 'rgba(110, 150, 225, 0.28)';
      for (let y = 15; y < H; y += 42) c.fillRect(x + 4, y, 10, 6);

      // Pequeño indicador luminoso tipo LED
      const blink = Math.sin(t * 5 + i) > 0;
      c.fillStyle = blink ? 'rgba(255, 90, 90, 0.6)' : 'rgba(40, 70, 100, 0.4)';
      c.fillRect(x + 7, 60 + (i % 4) * 50, 4, 4);
    });

    // Tuberías y pasarelas metálicas con pulso de energía viajando por dentro
    this.parallaxRepeat(c, .5, 240, (x, i) => {
      const y = 190 + (i % 2) * 130;
      c.fillStyle = 'rgba(140, 230, 255, 0.22)';
      c.fillRect(x, y, 160, 12);
      c.fillStyle = 'rgba(18, 35, 68, 0.3)';
      for (let px = x + 6; px < x + 160; px += 18) c.fillRect(px, y + 3, 5, 6);

      // Pulso de energía que recorre la tubería
      const pulseX = x + ((t * 90 + i * 40) % 190) - 15;
      c.fillStyle = 'rgba(255, 255, 255, 0.55)';
      c.fillRect(clamp(pulseX, x, x + 154), y + 4, 6, 4);
    });

    // Chorros de vapor saliendo de las tuberías
    this.parallaxRepeat(c, .5, 240, (x, i) => {
      const baseY = 190 + (i % 2) * 130;
      for (let s = 0; s < 2; s++) {
        const rise = ((t * 30 + i * 70 + s * 130) % 130);
        const puffX = x + 40 + s * 90;
        const alpha = Math.max(0, .28 - rise * .0022);
        if (alpha <= 0) continue;
        c.fillStyle = `rgba(220, 235, 250, ${alpha.toFixed(2)})`;
        c.beginPath(); c.arc(puffX, baseY - rise, 6 + rise * .06, 0, Math.PI * 2); c.fill();
      }
    });
  }

  drawMap(c, level) {
    const from = Math.max(0, Math.floor(this.cameraX / TILE) - 2);
    const to = Math.min(level.cols, Math.ceil((this.cameraX + W) / TILE) + 2);
    for (let y = 0; y < ROWS; y++) for (let x = from; x < to; x++) if (level.map[y][x]) {
      const px = x * TILE, py = y * TILE;
      const above = y === 0 || !level.map[y - 1][x];
      c.fillStyle = above ? level.theme.ground : level.theme.dirt;
      c.fillRect(px, py, TILE, TILE);
      c.fillStyle = above ? level.theme.accent : '#00000022';
      if (above) c.fillRect(px, py, TILE, 6);
      c.fillStyle = '#00000025'; c.fillRect(px + 5, py + 14, 4, 4); c.fillRect(px + 22, py + 23, 4, 4);
      if (above) { c.fillStyle = '#ffffff28'; c.fillRect(px + 4, py + 7, 8, 3); c.fillRect(px + 20, py + 7, 5, 3); }
      c.strokeStyle = '#191b2a55'; c.strokeRect(px + .5, py + .5, TILE - 1, TILE - 1);
    }
  }

  drawGoal(c, level) {
    const { x, y, locked } = level.goal;
    const poleTop = y - 25, poleBottom = y + 131;
    const flagT = level.goal.flag ?? 1;
    c.fillStyle = '#e8effa'; c.fillRect(x + 16, poleTop, 5, poleBottom - poleTop);
    c.fillStyle = '#fff6d8'; c.fillRect(x + 12, poleTop - 7, 13, 7);
    const flagY = poleTop + 6 + (poleBottom - poleTop - 32) * (1 - flagT);
    c.fillStyle = locked ? '#c83e58' : '#6ce28b'; c.fillRect(x + 21, flagY, 36, 26);
    c.fillStyle = '#101632'; c.font = '14px "Press Start 2P"'; c.textAlign = 'left'; c.fillText(locked ? '!' : '✓', x + 32, flagY + 18);
    if (locked) { c.fillStyle = '#2d1733'; c.fillRect(x - 8, y + 75, 50, 41); c.fillStyle = '#f5bf58'; c.fillRect(x + 9, y + 91, 15, 10); }
  }

  drawCheckpoints(c, level) {
    for (const checkpoint of level.checkpoints) {
      // El poste mide 86px de alto y antes se anclaba en y=14*TILE, lo que dejaba su base
      // flotando 1 tile (32px) por encima del suelo real. Con y=15*TILE la base del poste
      // (y - 54 + 86 = y + 32) coincide exactamente con la superficie del suelo (fila 16).
      const x = checkpoint.x, y = 15 * TILE;
      c.fillStyle = '#eaf4ff'; c.fillRect(x + 10, y - 54, 4, 86);
      c.fillStyle = checkpoint.active ? '#78dd7a' : '#e9b44e'; c.fillRect(x + 14, y - 48, 28, 18);
      c.fillStyle = '#17203c'; c.fillRect(x + 19, y - 42, 5, 5);
    }
  }

  drawCoin(c, x, y) {
    c.fillStyle = '#8b4f20'; c.fillRect(x + 2, y + 2, 9, 13);
    c.fillStyle = '#ffd35e'; c.fillRect(x, y + 3, 11, 9); c.fillStyle = '#fff5a5'; c.fillRect(x + 3, y + 4, 3, 6);
  }

  drawBlock(c, block) {
    if (block.destroyed) return;
    const lift = block.bump ? -Math.sin((block.bump / .12) * Math.PI) * 7 : 0;
    c.save(); c.translate(0, lift);
    if (block.kind === 'brick') {
      c.fillStyle = '#723c3b'; c.fillRect(block.x + 1, block.y + 1, 30, 30);
      c.fillStyle = '#be684d'; c.fillRect(block.x + 4, block.y + 4, 24, 24);
      c.fillStyle = '#6d3540'; c.fillRect(block.x + 4, block.y + 14, 24, 3); c.fillRect(block.x + 14, block.y + 4, 3, 10); c.fillRect(block.x + 8, block.y + 17, 3, 11); c.fillRect(block.x + 22, block.y + 17, 3, 11);
    } else {
      c.fillStyle = block.used ? '#7d5a47' : '#f1aa42'; c.fillRect(block.x + 1, block.y + 1, 30, 30);
      c.fillStyle = block.used ? '#563a36' : '#fff096'; c.fillRect(block.x + 4, block.y + 4, 24, 24);
      if (!block.used) { c.fillStyle = '#b45a36'; c.font = '20px "Press Start 2P"'; c.fillText('?', block.x + 7, block.y + 24); }
    }
    c.restore();
  }

  drawItem(c, item) {
    if (item.static) { c.fillStyle = '#fff4ae55'; c.fillRect(item.x - 3, item.y - 3, 30, 30); }
    if (item.type === 'mushroom') { c.fillStyle = '#f15d57'; c.fillRect(item.x, item.y, 24, 13); c.fillStyle = '#fff0cc'; c.fillRect(item.x + 5, item.y + 13, 14, 11); c.fillStyle = '#fff'; c.fillRect(item.x + 4, item.y + 3, 5, 4); }
    if (item.type === 'flower') { c.fillStyle = '#69d765'; c.fillRect(item.x + 10, item.y + 11, 5, 14); c.fillStyle = '#ff8060'; c.fillRect(item.x + 4, item.y + 3, 17, 16); c.fillStyle = '#fff2a7'; c.fillRect(item.x + 9, item.y + 8, 7, 7); }
    if (item.type === 'star') { c.fillStyle = '#ffec62'; c.fillRect(item.x + 7, item.y, 10, 24); c.fillRect(item.x, item.y + 7, 24, 10); c.fillStyle = '#fff'; c.fillRect(item.x + 8, item.y + 8, 8, 8); }
  }

  drawEnemy(c, e) {
    const box = this.enemyBox(e);
    if (e.type === 'slime') { c.fillStyle = '#c55bd3'; c.fillRect(e.x, e.y + 9, 24, 15); c.fillRect(e.x + 4, e.y + 4, 16, 10); c.fillStyle = '#191532'; c.fillRect(e.x + 5, e.y + 13, 4, 4); c.fillRect(e.x + 15, e.y + 13, 4, 4); }
    if (e.type === 'beetle') { c.fillStyle = '#4b2639'; c.fillRect(e.x + 2, e.y + 7, 23, 20); c.fillStyle = '#d56554'; c.fillRect(e.x + 6, e.y + 3, 15, 19); c.fillStyle = '#f7c159'; c.fillRect(e.x + 12, e.y + 4, 3, 16); }
    if (e.type === 'flyer') { c.fillStyle = '#b7e9ff'; c.fillRect(e.x - 5, e.y + 4, 10, 7); c.fillRect(e.x + 19, e.y + 4, 10, 7); c.fillStyle = '#707ee7'; c.fillRect(e.x + 4, e.y + 7, 16, 16); c.fillStyle = '#16214d'; c.fillRect(e.x + 8, e.y + 11, 3, 3); c.fillRect(e.x + 15, e.y + 11, 3, 3); }
    if (e.type === 'hopper') { c.fillStyle = '#60bc72'; c.fillRect(e.x + 2, e.y + 10, 22, 16); c.fillRect(e.x + 5, e.y + 4, 16, 12); c.fillStyle = '#e5f49e'; c.fillRect(e.x + 7, e.y + 12, 12, 7); c.fillStyle = '#20314e'; c.fillRect(e.x + 7, e.y + 8, 3, 3); c.fillRect(e.x + 16, e.y + 8, 3, 3); }
    if (e.type === 'ghost') { c.fillStyle = '#d7b9f5aa'; c.fillRect(e.x + 3, e.y + 3, 18, 19); c.fillRect(e.x, e.y + 10, 24, 12); c.fillStyle = '#3a2858'; c.fillRect(e.x + 6, e.y + 10, 3, 4); c.fillRect(e.x + 15, e.y + 10, 3, 4); }
    if (e.type === 'turret') { c.fillStyle = '#697187'; c.fillRect(e.x + 2, e.y + 9, 21, 15); c.fillStyle = '#c9d4d8'; c.fillRect(e.x + 7, e.y + 3, 10, 12); c.fillStyle = '#243047'; c.fillRect(e.x + 10, e.y + 6, 12, 4); }
    if (e.type === 'boss') { c.fillStyle = '#471f5d'; c.fillRect(e.x, e.y + 13, 50, 37); c.fillStyle = '#d85666'; c.fillRect(e.x + 7, e.y + 4, 36, 35); c.fillStyle = '#ffcd6b'; c.fillRect(e.x + 12, e.y + 10, 7, 7); c.fillRect(e.x + 31, e.y + 10, 7, 7); c.fillStyle = '#282044'; c.fillRect(e.x + 20, e.y + 23, 11, 5); this.drawHealth(c, e); }
  }

  drawHealth(c, enemy) {
    const width = 84, x = enemy.x - 17, y = enemy.y - 15;
    c.fillStyle = '#1b1833'; c.fillRect(x, y, width, 7); c.fillStyle = '#e45f61'; c.fillRect(x + 1, y + 1, (width - 2) * (enemy.hp / enemy.maxHp), 5);
  }

  drawProjectile(c, ball) {
    c.fillStyle = ball.owner === 'player' ? '#ffea6c' : '#ff6a76'; c.fillRect(ball.x, ball.y, ball.w, ball.h);
    c.fillStyle = '#fff'; c.fillRect(ball.x + 2, ball.y + 2, 3, 3);
  }

drawPlayer(c, p) {
    if (p.active && p.invincible > 0 && Math.floor(p.invincible * 12) % 2 === 0 && p.starTimer <= 0) return;
    
    const bright = p.starTimer > 0;
    const big = p.power !== 'small';
    const main = bright ? `hsl(${Math.floor((this.elapsed || 0) * 720 + p.id * 180) % 360}, 90%, 65%)` : (p.id === 0 ? '#6578ef' : '#4acfb4');
    const suit = p.id === 0 ? '#d95877' : '#f3bc58';
    const trim = p.id === 0 ? '#ffd2a8' : '#cdeaff';
    
    // Solo el jugador que realmente tocó la bandera reproduce la animación de victoria;
    // antes se comprobaba `this.flagSlide` sin comparar playerId, así que en cooperativo
    // el compañero que seguía corriendo por el nivel también quedaba "trepando" el asta.
    const isVictorious = this.flagSlide?.playerId === p.id;

    const moving = p.onGround && Math.abs(p.vx) > 8;
    const airborne = !p.onGround;
    const speedRatio = clamp(Math.abs(p.vx) / 285, 0, 1);
    
    const bodyTilt = isVictorious ? 0 : (airborne ? (p.vy < 0 ? -0.08 * p.facing : 0.05 * p.facing) : (moving ? (p.vx * 0.0008) : 0));
    const walkBounce = moving ? Math.abs(Math.sin(p.walkPhase * 2)) * (1.2 + speedRatio * 1.2) : 0;
    const squash = (p.squash || 0);

    const cx = p.x + p.w / 2;
    const cy = p.y + p.h;

    c.save();
    c.translate(cx, cy);

    if (p.active) {
      const shadowW = Math.max(8, p.w - (airborne ? Math.min(12, Math.abs(p.vy) * 0.03) : 0));
      c.fillStyle = '#11173544';
      c.fillRect(-shadowW / 2, 0, shadowW, 3);
    }

    if (!p.active && p.deathTimer > 0) {
      c.rotate(Math.min(1.4, (1.1 - p.deathTimer) * 2.6));
    } else if (p.sliding) {
      c.rotate(p.facing * 0.4);
    } else {
      c.rotate(bodyTilt);
    }

    c.scale(1 - squash * 0.55, 1 + squash);
    c.translate(-cx, -cy);

    const headY = p.y + walkBounce;

    // --- ANIMACIÓN DE VICTORIA ADAPTATIVA ---
    if (isVictorious) {
      // Fase 1: Deslizándose por el tubo / aste de la bandera (En el aire)
      if (airborne || Math.abs(p.vy) > 10) {
        // Cabeza e inclinación de agarre
        c.fillStyle = suit; c.fillRect(p.x + 3, headY, 19, 9); c.fillRect(p.x, headY + 4, 24, 6);
        c.fillStyle = '#f7c58e'; c.fillRect(p.x + 5, headY + 9, 15, 10);
        
        // Mirada enfocada hacia el poste/tubo
        c.fillStyle = '#17203c'; c.fillRect(p.x + (p.facing > 0 ? 15 : 6), headY + 11, 3, 3);

        // Cuerpo y capa ajustada
        c.fillStyle = main; c.fillRect(p.x + 3, headY + 18, 18, p.h - 22);

        // Brazos sujetando el asta/bandera
        c.fillStyle = main;
        c.fillRect(p.x + (p.facing > 0 ? 18 : -2), headY + 12, 7, 6);
        c.fillRect(p.x + (p.facing > 0 ? 14 : 2), headY + 20, 7, 6);

        // Piernas cruzadas estilo escalada
        c.fillStyle = '#17203c';
        c.fillRect(p.x + 4, p.y + p.h - 8, 8, 4);
        c.fillRect(p.x + 10, p.y + p.h - 5, 8, 4);
      } 
      // Fase 2: Celebración firme en el suelo
      else {
        const victoryJump = Math.max(0, Math.sin((this.elapsed || 0) * 10) * 3); // Pequeño rebotecito de alegría
        const victY = headY - victoryJump;

        const spark = Math.sin((this.elapsed || 0) * 15) * 4;
        c.fillStyle = '#fff7c2';
        c.fillRect(p.x - 6, victY - 8 + spark, 4, 4);
        c.fillRect(p.x + p.w + 2, victY - 4 - spark, 4, 4);

        // Cabeza mirando al frente
        c.fillStyle = suit; c.fillRect(p.x + 3, victY, 19, 9); c.fillRect(p.x, victY + 4, 24, 6);
        c.fillStyle = '#f7c58e'; c.fillRect(p.x + 5, victY + 9, 15, 10);
        
        // Ojos felices (^ ^)
        c.fillStyle = '#17203c'; 
        c.fillRect(p.x + 7, victY + 11, 4, 2);
        c.fillRect(p.x + 14, victY + 11, 4, 2);

        // Torso
        c.fillStyle = main; 
        c.fillRect(p.x + 3, victY + 18, 18, p.h - 22);

        // Brazos arriba festejando
        c.fillRect(p.x - 3, victY + 8, 5, 11); 
        c.fillRect(p.x + 22, victY + 8, 5, 11);

        // Pies apoyados de forma natural
        c.fillStyle = '#17203c';
        c.fillRect(p.x + 2, p.y + p.h - 4, 8, 4);
        c.fillRect(p.x + 14, p.y + p.h - 4, 8, 4);
      }

      c.restore();
      return;
    }

    // --- Estela de Velocidad ---
    if (p.running && Math.abs(p.vx) > 200 && !p.ducking) {
      c.fillStyle = main + '44';
      c.fillRect(p.x - p.facing * 8, headY + 4, p.w, p.h - 4);
      c.fillStyle = suit + '33';
      c.fillRect(p.x - p.facing * 14, headY + 8, p.w * 0.8, p.h - 8);
    }

    if (p.ducking) {
      c.fillStyle = suit; c.fillRect(p.x + 2, headY, 20, 8);
      c.fillStyle = '#f7c58e'; c.fillRect(p.x + 5, headY + 6, 15, 8);
      c.fillStyle = '#17203c'; c.fillRect(p.x + (p.facing > 0 ? 14 : 7), headY + 10, 3, 2);

      c.fillStyle = main; c.fillRect(p.x, headY + 14, 24, p.h - 14);
      c.fillStyle = trim; c.fillRect(p.x, headY + 14, 24, 3);

      if (p.sliding) {
        c.fillStyle = '#d8f7ffcc';
        for (let n = 0; n < 3; n++) c.fillRect(p.x - p.facing * (9 + n * 7), p.y + p.h - 3 - n, 6 - n, 2);
        c.fillStyle = '#17203c'; c.fillRect(p.x - p.facing * 7, p.y + p.h - 4, 10, 4);
        c.fillStyle = main; c.fillRect(p.x + (p.facing > 0 ? 17 : -7), headY + 16, 9, 6);
      } else {
        c.fillStyle = '#17203c'; c.fillRect(p.x + 3, p.y + p.h - 4, 8, 4); c.fillRect(p.x + 13, p.y + p.h - 4, 8, 4);
      }
    } else {
      // --- Torso y Casco ---
      c.fillStyle = suit; c.fillRect(p.x + 3, headY, 19, 9); c.fillRect(p.x, headY + 4, 24, 6);
      c.fillStyle = '#f7c58e'; c.fillRect(p.x + 5, headY + 9, 15, 10);
      
      const eyeYOffset = airborne ? (p.vy < 0 ? -1 : 1) : 0;
      c.fillStyle = '#17203c'; 
      c.fillRect(p.x + (p.facing > 0 ? 15 : 7), headY + 12 + eyeYOffset, 3, 3);

      if (big) {
        const capeWave = Math.sin((this.elapsed || 0) * 10 + p.id * 2) * 4;
        const capeOffset = moving ? -p.facing * (6 + speedRatio * 8) : 0;
        c.fillStyle = trim + 'cc';
        c.fillRect(p.x - p.facing * 3, headY + 17, 6, 13 + Math.abs(capeWave));
        c.fillRect(p.x - p.facing * (5 + capeOffset * 0.5), headY + 22, 5, 9);
        c.fillStyle = suit; c.fillRect(p.x - 2, headY + 17, 6, 6); c.fillRect(p.x + 20, headY + 17, 6, 6);
      }

      c.fillStyle = main; 
      c.fillRect(p.x + 3, headY + 18, 18, p.h - 22); 
      c.fillRect(p.x, headY + 20, 4, 10); 
      c.fillRect(p.x + 20, headY + 20, 4, 10);
      
      c.fillStyle = big ? '#fff7c2' : '#ffffff55'; 
      c.fillRect(p.x + 10, headY + 22, 4, 4);

      // --- Brazos ---
      const armSwing = moving ? Math.sin(p.walkPhase * 2) * 5 : 0;
      c.fillStyle = main;
      if (airborne) {
        const raise = clamp(Math.abs(p.vy) / 80, 2, 6);
        c.fillRect(p.x - 2, headY + 17 - raise, 5, 9);
        c.fillRect(p.x + 21, headY + 17 - raise, 5, 9);
      } else {
        c.fillRect(p.x - 2 + armSwing, headY + 19, 5, 8);
        c.fillRect(p.x + 21 - armSwing, headY + 19, 5, 8);
      }

      // --- Piernas ---
      c.fillStyle = '#17203c';
      if (airborne) {
        c.fillRect(p.x + 4, p.y + p.h - 5, 7, 5); 
        c.fillRect(p.x + 13, p.y + p.h - 4, 7, 4); 
      } else if (moving) {
        const legStep1X = Math.cos(p.walkPhase * 2) * 5;
        const legStep1Y = Math.max(0, -Math.sin(p.walkPhase * 2) * 2.5);
        
        const legStep2X = Math.cos(p.walkPhase * 2 + Math.PI) * 5;
        const legStep2Y = Math.max(0, -Math.sin(p.walkPhase * 2 + Math.PI) * 2.5);

        c.fillRect(p.x + 4 + legStep1X, p.y + p.h - 5 - legStep1Y, 7, 5);
        c.fillRect(p.x + 13 + legStep2X, p.y + p.h - 5 - legStep2Y, 7, 5);
      } else {
        c.fillRect(p.x + 3, p.y + p.h - 5, 8, 5);
        c.fillRect(p.x + 13, p.y + p.h - 5, 8, 5);
      }
    }

    if (p.power === 'flower') { c.fillStyle = '#f5f0d3'; c.fillRect(p.x + 3, headY + (p.ducking ? 14 : 18), 18, 5); }
    if (p.running && !p.ducking) { c.fillStyle = '#f6ecd280'; c.fillRect(p.x - p.facing * 11, p.y + p.h - 4, 7, 3); c.fillRect(p.x - p.facing * 18, p.y + p.h - 2, 4, 2); }
    
    c.restore();
  }
  drawPixelFinish(c) {
    c.save();
    c.fillStyle = '#0a0d2a16';
    for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 1);
    c.strokeStyle = '#f5e6bd25'; c.lineWidth = 6; c.strokeRect(3, 3, W - 6, H - 6);
    c.restore();
  }

  drawBanner(c) {
    c.save(); c.textAlign = 'center';
    c.fillStyle = '#101432d9'; c.fillRect(200, 190, 560, 108); c.strokeStyle = '#fff0c4'; c.lineWidth = 3; c.strokeRect(200, 190, 560, 108);
    c.fillStyle = '#ffdf68'; c.font = '20px "Press Start 2P"'; c.fillText(this.banner.title, W / 2, 230);
    c.fillStyle = '#f6f2e4'; c.font = '13px "Press Start 2P"'; c.fillText(this.banner.subtitle, W / 2, 268); c.restore();
  }

  drawIdle(c) {
    c.save(); c.fillStyle = '#080a1b88'; c.fillRect(0, 0, W, H); c.textAlign = 'center';
    c.fillStyle = '#fff3d0'; c.font = '17px "Press Start 2P"'; c.fillText('LISTO PARA UNA AVENTURA', W / 2, 100); c.restore();
  }
}

window.PixelQuest = PixelQuest;
})();
