/* ==========================================================================
   enemies.js - Animaciones fluidas estilo arcade (Contra / Metal Slug)
   ========================================================================== */

// lerp() ahora vive en entities.js (se quitó la copia duplicada de aquí)

const ENEMY_STATS = {
  grunt:   { hp: 3, speed: 34, w: 10, h: 20, detect: 240, shootRange: 190, fireRate: 1.15, bulletSpeed: 230, damage: 8,  score: 100 },
  runner:  { hp: 2, speed: 92, w: 10, h: 18, detect: 260, contactDamage: 12, score: 130 },
  turret:  { hp: 5, speed: 0,  w: 14, h: 14, detect: 260, fireRate: 0.9,  bulletSpeed: 220, damage: 10, score: 160 }
};

class Enemy {
  constructor(kind, x, y) {
    this.id = nextId();
    this.kind = kind;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    const s = ENEMY_STATS[kind];
    this.stats = s;
    this.w = s.w; this.h = s.h;
    this.hp = s.hp;
    this.maxHp = s.hp;
    this.facing = -1;
    this.pose = 'idle';
    this.legPhase = Math.random() * 10;
    this.fireCooldown = Math.random() * (s.fireRate || 1);
    this.dead = false;
    this.deathTimer = 0.5;
    this.onGround = true;
    this.aimAngle = Math.PI;
    this.targetAngle = Math.PI;
    this.muzzleTimer = 0;
    this.hurtFlash = 0;
    this.activated = false;
    this.jumpTimer = Math.random() * 1.5 + 0.6;

    // Variables de deformación y fluidez
    this.scaleX = 1;
    this.scaleY = 1;
    this.recoil = 0;
    this.wasOnGround = true;
  }

  takeDamage(dmg) {
    this.hp -= dmg;
    this.hurtFlash = 0.1;
    this.scaleY = 0.82; // Compresión por impacto
    this.scaleX = 1.15;
    AUDIO.hit();
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      AUDIO.enemyDeath();
      return true;
    }
    return false;
  }

  update(dt, player, level, bullets) {
    if (this.dead) return;

    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.muzzleTimer > 0) this.muzzleTimer -= dt;
    this.fireCooldown -= dt;

    // Recuperación progresiva de la forma (Squish/Stretch)
    this.scaleX = lerp(this.scaleX, 1, dt * 10);
    this.scaleY = lerp(this.scaleY, 1, dt * 10);
    this.recoil = lerp(this.recoil, 0, dt * 14);

    const dx = player.x - this.x;
    const dy = (player.y - 10) - (this.y - 10);
    const dist = Math.abs(dx);
    
    // Transición suave de apuntado con LERP
    this.targetAngle = Math.atan2(dy, dx);
    this.aimAngle = lerp(this.aimAngle, this.targetAngle, dt * 9);

    if (Math.abs(dx) > 3) this.facing = dx > 0 ? 1 : -1;

    // Detección de caída/aterrizaje para compresión visual
    if (!this.wasOnGround && this.onGround) {
      this.scaleY = 0.85;
      this.scaleX = 1.15;
    }
    this.wasOnGround = this.onGround;

    if (this.kind === 'turret') {
      this.pose = 'idle';
      if (dist < this.stats.detect && this.fireCooldown <= 0) {
        this.fireCooldown = this.stats.fireRate;
        this.muzzleTimer = 0.08;
        this.recoil = 4;
        bullets.push(new Bullet(this.x, this.y - 9, this.aimAngle, this.stats.bulletSpeed, this.stats.damage, false, '#ff6b5c'));
        AUDIO.shoot('pistol');
      }
      return;
    }

    if (this.kind === 'runner') {
      if (dist < this.stats.detect) {
        this.vx = Math.sign(dx) * this.stats.speed;
        this.pose = 'run';
        this.legPhase += dt * 18;
        this.jumpTimer -= dt;
        if (this.jumpTimer <= 0 && this.onGround) {
          this.vy = -140;
          this.scaleY = 1.25; // Estiramiento al saltar
          this.scaleX = 0.8;
          this.jumpTimer = 1.2 + Math.random() * 0.8;
        }
      } else {
        this.vx = 0;
        this.pose = 'idle';
      }
    } else { // grunt
      if (dist < this.stats.detect) {
        if (dist > this.stats.shootRange) {
          this.vx = Math.sign(dx) * this.stats.speed;
          this.pose = 'run';
          this.legPhase += dt * 12;
        } else {
          this.vx = 0;
          this.pose = 'idle';
          if (this.fireCooldown <= 0) {
            this.fireCooldown = this.stats.fireRate + Math.random() * 0.3;
            this.muzzleTimer = 0.08;
            this.recoil = 3;
            bullets.push(new Bullet(this.x + this.facing * 4, this.y - 17, this.aimAngle, this.stats.bulletSpeed, this.stats.damage, false, '#ff6b5c'));
            AUDIO.shoot('pistol');
          }
        }
      } else {
        this.vx = 0;
        this.pose = 'idle';
      }
    }

    this.x += this.vx * dt;
    this.x = Math.max(level.bounds.left + 6, Math.min(level.bounds.right - 6, this.x));
    applyPlatformPhysics(this, level, dt);
  }

  draw(ctx) {
    if (this.dead) return;

    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    
    // Aplicar deformación orgánica
    ctx.scale(this.scaleX, this.scaleY);

    if (this.hurtFlash > 0) {
      ctx.filter = 'brightness(2.5)';
    }

    if (this.kind === 'turret') {
      this.drawTurretSprite(ctx);
    } else if (this.kind === 'runner') {
      this.drawRunnerSprite(ctx);
    } else {
      this.drawGruntSprite(ctx);
    }

    ctx.restore();
  }

  /* --- Sprites con animaciones fluidas --- */

  drawGruntSprite(ctx) {
    ctx.save();
    ctx.scale(this.facing, 1);

    // Sombra
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bamboleo vertical al caminar
    const bodyBob = this.pose === 'run' ? Math.abs(Math.sin(this.legPhase)) * 1.5 : 0;
    ctx.translate(0, -bodyBob);

    // Piernas (Movimiento sinusoidal)
    const legAnim = this.pose === 'run' ? Math.sin(this.legPhase) * 4 : 0;
    ctx.fillStyle = '#1c241b';
    ctx.fillRect(-5 + legAnim, -6, 4, 6);
    ctx.fillRect(1 - legAnim, -6, 4, 6);

    ctx.fillStyle = '#3a4a3b';
    ctx.fillRect(-4 + legAnim, -11, 3, 6);
    ctx.fillRect(1 - legAnim, -11, 3, 6);

    // Torso + Chaleco
    ctx.fillStyle = '#111';
    ctx.fillRect(-5, -18, 9, 8);
    ctx.fillStyle = '#4a5e4b';
    ctx.fillRect(-4, -17, 7, 6);

    // Cabeza con Casco
    ctx.fillStyle = '#c88b66';
    ctx.fillRect(-2, -22, 5, 4);
    ctx.fillStyle = '#223023';
    ctx.fillRect(-4, -25, 8, 4);
    ctx.fillRect(-5, -23, 10, 2);

    // Brazo y Rifle articulado con LERP + Retroceso
    ctx.save();
    ctx.translate(-this.recoil, -14);
    
    const angle = this.facing === 1 ? this.aimAngle : Math.PI - this.aimAngle;
    ctx.rotate(angle);

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, -2, 11, 3);
    ctx.fillStyle = '#555';
    ctx.fillRect(2, -1, 4, 2);

    if (this.muzzleTimer > 0) {
      ctx.fillStyle = '#ffe135';
      ctx.beginPath();
      ctx.arc(13, -0.5, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  }

  drawRunnerSprite(ctx) {
    ctx.save();
    ctx.scale(this.facing, 1);

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    const legAnim = Math.sin(this.legPhase) * 5;
    const bodyBob = Math.abs(Math.sin(this.legPhase)) * 2;
    ctx.translate(0, -bodyBob);

    // Cuerpos cibernéticos
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-4 + legAnim, -7, 3, 7);
    ctx.fillRect(1 - legAnim, -7, 3, 7);

    // Torso Inclinado de carrera
    ctx.fillStyle = '#d93838';
    ctx.fillRect(-4, -15, 8, 8);

    // Cabeza + Visor
    ctx.fillStyle = '#c88b66';
    ctx.fillRect(-3, -19, 6, 4);
    ctx.fillStyle = '#00ffff';
    ctx.fillRect(-1, -18, 4, 2);

    ctx.restore();
  }

  drawTurretSprite(ctx) {
    // Sombra base
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Base
    ctx.fillStyle = '#3a3d40';
    ctx.fillRect(-8, -6, 16, 6);

    // Cúpula con cañón LERP y retroceso
    ctx.save();
    ctx.translate(0, -8);
    ctx.rotate(this.aimAngle);

    const recoilX = -this.recoil;

    ctx.fillStyle = '#111';
    ctx.fillRect(recoilX, -3, 12, 2);
    ctx.fillRect(recoilX, 1, 12, 2);

    ctx.fillStyle = '#5a6268';
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();

    if (this.muzzleTimer > 0) {
      ctx.fillStyle = '#ff4400';
      ctx.beginPath();
      ctx.arc(recoilX + 14, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/* -------------------------------------------------------------------- */
/* Jefe Mech Rediseñado                                                 */
/* -------------------------------------------------------------------- */
class Boss {
  constructor(x, y, hp, name) {
    this.id = nextId();
    this.x = x; this.y = y;
    this.name = name || 'MECH DESTRUCTOR';
    this.hp = hp;
    this.maxHp = hp;
    this.w = 52; this.h = 44;
    this.facing = -1;
    this.aimAngle = Math.PI;
    this.targetAngle = Math.PI;
    this.t = 0;
    this.fireCooldown = 1.5;
    this.burstCount = 0;
    this.hitFlash = 0;
    this.dead = false;
    this.enraged = false;
    this.moveDir = -1;
    this.muzzle = false;
    this.introTimer = 2.2;
    this.arenaLeft = x - 140;
    this.arenaRight = x + 40;
    
    // Variables de amortiguación
    this.recoil = 0;
    this.scaleX = 1;
    this.scaleY = 1;
  }

  takeDamage(dmg) {
    this.hp -= dmg;
    this.hitFlash = 0.08;
    this.scaleX = 1.05;
    this.scaleY = 0.95;
    AUDIO.bossHit();
    if (!this.enraged && this.hp / this.maxHp < 0.4) {
      this.enraged = true;
    }
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      return true;
    }
    return false;
  }

  update(dt, player, bullets) {
    this.t += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.introTimer > 0) { this.introTimer -= dt; return; }
    if (this.dead) return;

    // Recuperación de resorte visual
    this.recoil = lerp(this.recoil, 0, dt * 10);
    this.scaleX = lerp(this.scaleX, 1, dt * 8);
    this.scaleY = lerp(this.scaleY, 1, dt * 8);

    const dx = player.x - this.x;
    this.targetAngle = Math.atan2((player.y - 25) - (this.y - 25), dx);
    this.aimAngle = lerp(this.aimAngle, this.targetAngle, dt * 6); // Seguimiento suave
    this.facing = dx > 0 ? 1 : -1;

    // Movimiento
    this.x += this.moveDir * (this.enraged ? 36 : 22) * dt;
    if (this.x < this.arenaLeft) { this.x = this.arenaLeft; this.moveDir = 1; }
    if (this.x > this.arenaRight) { this.x = this.arenaRight; this.moveDir = -1; }

    this.fireCooldown -= dt;
    this.muzzle = false;
    if (this.fireCooldown <= 0) {
      this.muzzle = true;
      this.recoil = 6;
      const shots = this.enraged ? 5 : 1;
      const spread = this.enraged ? 0.45 : 0;

      for (let i = 0; i < shots; i++) {
        const t = shots === 1 ? 0 : (i / (shots - 1)) - 0.5;
        const a = this.aimAngle + t * spread;
        bullets.push(new Bullet(this.x + this.facing * 12, this.y - 26, a, 220, 16, false, '#ff4d3d'));
      }
      AUDIO.shoot('shotgun');
      this.fireCooldown = this.enraged ? 0.9 : 1.6;
    }
  }

  draw(ctx) {
    if (this.dead) return;

    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    ctx.scale(this.scaleX, this.scaleY);

    if (this.hitFlash > 0) {
      ctx.filter = 'brightness(3)';
    }

    // Sombra
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Partículas de humo al moverse
    if (Math.random() < (this.enraged ? 0.8 : 0.3)) {
      ctx.fillStyle = this.enraged ? 'rgba(255, 60, 0, 0.6)' : 'rgba(100, 100, 100, 0.4)';
      ctx.beginPath();
      ctx.arc(-this.facing * 18 + (Math.random() * 4 - 2), -32 + (Math.random() * 4 - 2), 3 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Patas Mecánicas
    const step = Math.sin(this.t * (this.enraged ? 12 : 7)) * 3;
    ctx.fillStyle = '#111315';
    ctx.fillRect(-22, -12, 44, 8);
    ctx.fillStyle = '#22262a';
    ctx.fillRect(-24 + step, -8, 14, 8);
    ctx.fillRect(10 - step, -8, 14, 8);

    // Balanceo fluido del torso
    const tilt = Math.sin(this.t * 5) * 1.5;
    ctx.save();
    ctx.rotate((tilt * Math.PI) / 180);

    // Chasis Principal
    ctx.fillStyle = '#181b1d';
    ctx.fillRect(-25, -36, 50, 26);
    ctx.fillStyle = this.enraged ? '#6e1a1a' : '#3d454a';
    ctx.fillRect(-23, -34, 46, 22);

    // Placas de blindaje
    ctx.fillStyle = this.enraged ? '#9e2b2b' : '#576269';
    ctx.fillRect(-20, -32, 40, 10);

    // Visor Neón
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(-8, -28, 16, 6);
    ctx.fillStyle = this.enraged ? '#ff0033' : '#00e5ff';
    ctx.fillRect(-6, -26, 12, 2);

    // Cañón Doble Articulado con Retroceso LERP
    ctx.save();
    ctx.translate(0, -22);
    
    const angle = this.facing === 1 ? this.aimAngle : Math.PI - this.aimAngle;
    ctx.scale(this.facing, 1);
    ctx.rotate(angle);

    const recoilX = -this.recoil;

    ctx.fillStyle = '#141618';
    ctx.fillRect(recoilX, -6, 26, 4);
    ctx.fillRect(recoilX, 2, 26, 4);
    ctx.fillStyle = '#2c3135';
    ctx.fillRect(recoilX + 6, -7, 6, 14);

    ctx.fillStyle = '#212529';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();

    if (this.muzzle) {
      ctx.fillStyle = '#ff6600';
      ctx.beginPath();
      ctx.arc(recoilX + 28, -4, 6, 0, Math.PI * 2);
      ctx.arc(recoilX + 28, 4, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    ctx.restore();
    ctx.restore();
  }
}