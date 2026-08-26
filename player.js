// lerp() ahora vive en entities.js (se quitó la copia duplicada de aquí)

const WEAPONS = {
  pistol: {
    name: 'PISTOLA', infinite: true, clipSize: Infinity, maxReserve: Infinity, fireRate: 0.26, bulletSpeed: 460,
    damage: 1, pellets: 1, spread: 0, color: '#ffe066', sfx: 'pistol', kickback: 1.5
  },
  machinegun: {
    name: 'AMETRALLADORA', infinite: false, clipSize: 30, maxReserve: 120, fireRate: 0.08, bulletSpeed: 520,
    damage: 1, pellets: 1, spread: 0.07, color: '#fff29a', sfx: 'machinegun', kickback: 2
  },
  shotgun: {
    name: 'ESCOPETA', infinite: false, clipSize: 8, maxReserve: 32, fireRate: 0.5, bulletSpeed: 420,
    damage: 1, pellets: 5, spread: 0.32, color: '#ffb347', sfx: 'shotgun', kickback: 5
  },
  spread: {
    name: 'SPREAD GUN', infinite: false, clipSize: 10, maxReserve: 40, fireRate: 0.32, bulletSpeed: 480,
    damage: 1, pellets: 5, spread: 0.55, color: '#8fe0ff', sfx: 'spread', fan: true, kickback: 4
  }
};

const WEAPON_KEYS = ['pistol', 'machinegun', 'shotgun', 'spread'];

class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0; this.vy = 0;
    this.w = 10; this.h = 20;
    this.speed = 112;
    this.jumpForce = -320;
    this.gravity = 560;
    this.onGround = false;
    this.wasOnGround = false;
    this.facing = 1;
    this.crouch = false;
    this.pose = 'idle';
    this.legPhase = 0;

    this.maxHealth = 100;
    this.health = 100;
    this.lives = 3;
    this.invuln = 0;
    this.dead = false;
    this.respawnTimer = 0;

    // Control de Inventario y Armas Desbloqueadas
    this.unlockedWeapons = { pistol: true, machinegun: false, shotgun: false, spread: false };
    this.weaponKey = 'pistol';
    this.weapon = WEAPONS['pistol'];

    this.currentClip = { pistol: Infinity, machinegun: 30, shotgun: 8, spread: 10 };
    this.reserveAmmo = { pistol: Infinity, machinegun: 90, shotgun: 24, spread: 30 };

    this.fireCooldown = 0;
    this.muzzleTimer = 0;
    this.aimAngle = 0;

    this.coyote = 0;
    this.jumpBuffer = 0;
    this.score = 0;

    this.scaleX = 1;
    this.scaleY = 1;
    this.kickback = 0;
  }

  currentAmmoLabel() {
    if (this.weapon.infinite) return 'INF';
    const clip = this.currentClip[this.weaponKey] || 0;
    const reserve = this.reserveAmmo[this.weaponKey] || 0;
    return `${clip}/${reserve}`;
  }

  // Cambiar arma manualmente
  selectWeapon(key) {
    if (!WEAPONS[key] || !this.unlockedWeapons[key] || this.weaponKey === key) return;
    this.weaponKey = key;
    this.weapon = WEAPONS[key];
    if (typeof AUDIO !== 'undefined' && AUDIO.reload) AUDIO.reload();
  }

  // Cambiar con la rueda del mouse o ciclo de armas
  cycleWeapon(dir) {
    const available = WEAPON_KEYS.filter(k => this.unlockedWeapons[k]);
    if (available.length <= 1) return;

    let currentIndex = available.indexOf(this.weaponKey);
    currentIndex = (currentIndex + dir + available.length) % available.length;
    this.selectWeapon(available[currentIndex]);
  }

  pickWeapon(key) {
    if (!WEAPONS[key]) return;
    const w = WEAPONS[key];
    if (this.unlockedWeapons[key]) {
      // Ya la tenía desbloqueada: el power-up suma municion en vez de
      // resetear la reserva (antes esto podia hacerte perder municion
      // acumulada).
      this.addAmmo(key, w.clipSize);
    } else {
      this.unlockedWeapons[key] = true;
      this.currentClip[key] = w.clipSize;
      this.reserveAmmo[key] = w.maxReserve - w.clipSize;
    }
    this.selectWeapon(key);
  }

  addAmmo(key, amount) {
    if (this.reserveAmmo[key] === undefined) this.reserveAmmo[key] = 0;
    const maxRes = WEAPONS[key].maxReserve;
    this.reserveAmmo[key] = Math.min(maxRes, this.reserveAmmo[key] + amount);
  }

  reload() {
    const w = this.weapon;
    if (w.infinite) return;

    const clip = this.currentClip[this.weaponKey] || 0;
    const reserve = this.reserveAmmo[this.weaponKey] || 0;

    if (clip < w.clipSize && reserve > 0) {
      const needed = w.clipSize - clip;
      const toReload = Math.min(needed, reserve);

      this.currentClip[this.weaponKey] += toReload;
      this.reserveAmmo[this.weaponKey] -= toReload;

      if (typeof AUDIO !== 'undefined' && AUDIO.reload) AUDIO.reload();
    }
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  takeDamage(amount) {
    if (this.invuln > 0 || this.dead) return;
    this.health -= amount;
    this.invuln = 1.1;
    this.scaleY = 0.8;
    this.scaleX = 1.2;
    if (typeof AUDIO !== 'undefined' && AUDIO.playerHurt) AUDIO.playerHurt();
    if (this.health <= 0) {
      this.health = 0;
      this.die();
    }
  }

  die() {
    this.dead = true;
    this.lives -= 1;
    this.respawnTimer = 1.6;
    if (typeof AUDIO !== 'undefined' && AUDIO.explosion) AUDIO.explosion(false);
  }

  respawn(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.health = this.maxHealth;
    this.dead = false;
    this.invuln = 2.2;
    this.selectWeapon('pistol');
  }

  tryFire(mouseDown, bullets) {
    const w = this.weapon;
    if (!mouseDown || this.dead) return;
    if (this.fireCooldown > 0) return;

    if (!w.infinite && this.currentClip[this.weaponKey] <= 0) {
      if (this.reserveAmmo[this.weaponKey] <= 0) {
        this.selectWeapon('pistol');
      } else if (typeof AUDIO !== 'undefined' && AUDIO.dryFire) {
        AUDIO.dryFire();
      }
      this.fireCooldown = 0.25;
      return;
    }

    this.fireCooldown = w.fireRate;
    this.muzzleTimer = 0.06;
    this.kickback = w.kickback || 2;

    if (!w.infinite) {
      this.currentClip[this.weaponKey]--;
    }

    const shoulderX = this.x + this.facing * 4;
    const shoulderY = this.y - (this.crouch ? 12 : 17);
    const baseAngle = this.aimAngle;

    if (w.fan) {
      const n = w.pellets;
      const spreadTotal = w.spread;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : (i / (n - 1)) - 0.5;
        const a = baseAngle + t * spreadTotal;
        bullets.push(new Bullet(shoulderX, shoulderY, a, w.bulletSpeed, w.damage, true, w.color));
      }
    } else {
      for (let i = 0; i < w.pellets; i++) {
        const a = baseAngle + (Math.random() - 0.5) * w.spread;
        bullets.push(new Bullet(shoulderX, shoulderY, a, w.bulletSpeed, w.damage, true, w.color));
      }
    }
    if (typeof AUDIO !== 'undefined' && AUDIO.shoot) AUDIO.shoot(w.sfx);
  }

  update(dt, input, level) {
    if (this.dead) {
      this.respawnTimer -= dt;
      return;
    }

    // ---- Selección de Armas ----
    if (input.key1) this.selectWeapon('pistol');
    if (input.key2) this.selectWeapon('machinegun');
    if (input.key3) this.selectWeapon('shotgun');
    if (input.key4) this.selectWeapon('spread');

    if (input.wheelDelta) {
      this.cycleWeapon(input.wheelDelta > 0 ? 1 : -1);
      input.wheelDelta = 0; // Reset scroll
    }

    if (input.reloadPressed) {
      this.reload();
    }

    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.muzzleTimer > 0) this.muzzleTimer -= dt;
    if (this.invuln > 0) this.invuln -= dt;

    this.scaleX = lerp(this.scaleX, 1, dt * 10);
    this.scaleY = lerp(this.scaleY, 1, dt * 10);
    this.kickback = lerp(this.kickback, 0, dt * 12);

    // ---- Apuntado ----
    const dx = input.worldMouseX - this.x;
    const dy = input.worldMouseY - (this.y - (this.crouch ? 12 : 17));
    this.aimAngle = Math.atan2(dy, dx);
    if (Math.abs(dx) > 4) this.facing = dx > 0 ? 1 : -1;

    // ---- Movimiento ----
    let moveDir = 0;
    if (input.left) moveDir -= 1;
    if (input.right) moveDir += 1;
    this.crouch = input.down && this.onGround;

    const spd = this.crouch ? 0 : this.speed;
    this.vx = moveDir * spd;

    // ---- Salto ----
    if (this.onGround) this.coyote = 0.12; else this.coyote -= dt;
    if (input.jumpPressed) this.jumpBuffer = 0.12;
    if (this.jumpBuffer > 0) this.jumpBuffer -= dt;

    if (this.jumpBuffer > 0 && this.coyote > 0 && !this.crouch) {
      this.vy = this.jumpForce;
      this.onGround = false;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.scaleY = 1.25;
      this.scaleX = 0.8;
      if (typeof AUDIO !== 'undefined' && AUDIO.jump) AUDIO.jump();
    }

    // ---- Gravedad ----
    this.vy += this.gravity * dt;
    if (this.vy > 500) this.vy = 500;

    // ---- Colisiones ----
    this.x += this.vx * dt;
    this.x = Math.max(level.bounds.left + 8, Math.min(level.bounds.right - 8, this.x));

    const prevBottom = this.y;
    this.y += this.vy * dt;

    this.onGround = false;
    for (let i = 0; i < level.solids.length; i++) {
      const plat = level.solids[i];
      const halfW = this.w / 2;
      if (this.x + halfW > plat.x && this.x - halfW < plat.x + plat.w) {
        if (this.vy >= 0 && prevBottom <= plat.y + 0.5 && this.y >= plat.y) {
          this.y = plat.y;
          this.vy = 0;
          this.onGround = true;
        }
      }
    }

    if (this.y >= level.groundY) {
      this.y = level.groundY;
      this.vy = 0;
      this.onGround = true;
    }

    if (!this.wasOnGround && this.onGround) {
      this.scaleY = 0.8;
      this.scaleX = 1.2;
    }
    this.wasOnGround = this.onGround;

    // ---- Poses ----
    if (!this.onGround) {
      this.pose = 'jump';
    } else if (this.crouch) {
      this.pose = 'crouch';
    } else if (Math.abs(this.vx) > 5) {
      this.pose = 'run';
      this.legPhase += dt * 14;
    } else {
      this.pose = 'idle';
      this.legPhase = 0;
    }

    this.h = this.crouch ? 14 : 20;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    ctx.scale(this.scaleX, this.scaleY);
    ctx.translate(-Math.round(this.x), -Math.round(this.y));

    if (typeof drawHumanoid === 'function') {
      drawHumanoid(ctx, {
        x: this.x, y: this.y, facing: this.facing, pose: this.pose,
        legPhase: this.legPhase, crouch: this.crouch, pal: PAL.player,
        aimAngle: this.aimAngle, muzzle: this.muzzleTimer > 0,
        gunLength: this.weaponKey === 'shotgun' ? 7 : 9,
        kickback: this.kickback,
        hurt: this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0
      });
    }

    ctx.restore();
  }
}