
const ArcadeSound = (() => {
  let ctx = null;
  let enabled = true;

  try {
    const guardado = localStorage.getItem("arcadeSoundEnabled");
    enabled = guardado === null ? true : JSON.parse(guardado);
  } catch (e) {
    enabled = true;
  }

  function obtenerContexto() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  function tono(frecuencia, duracion, tipo = "square", volumen = 0.05, retraso = 0) {
    if (!enabled) return;
    const c = obtenerContexto();
    // No se programan notas mientras el navegador tenga el audio bloqueado;
    // evita que se acumulen y suenen todas juntas al reanudarlo.
    if (!c || c.state !== "running") return;
    const osc = c.createOscillator();
    const gain = c.createGain();

    osc.type = tipo;
    osc.frequency.setValueAtTime(frecuencia, c.currentTime + retraso);

    gain.gain.setValueAtTime(volumen, c.currentTime + retraso);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + retraso + duracion);

    osc.connect(gain).connect(c.destination);
    osc.start(c.currentTime + retraso);
    osc.stop(c.currentTime + retraso + duracion);
  }

  /* ---------- Música de fondo: loop chiptune Am - F - C - G ---------- */
  const BPM = 128;
  const DURACION_PASO = 60 / BPM / 2; // corcheas

  // 16 pasos = 4 pasos por acorde. "null" = silencio en ese paso.
  const PATRON_BAJO = [
    110, null, null, null,     // Am
    87.31, null, null, null,   // F
    130.81, null, null, null,  // C
    98, null, null, null,      // G
  ];
  const PATRON_LEAD = [
    220, 261.63, 329.63, 261.63,   // arpegio Am
    174.61, 220, 261.63, 220,      // arpegio F
    261.63, 329.63, 392.0, 329.63, // arpegio C
    196, 246.94, 293.66, 246.94,   // arpegio G
  ];

  const VOLUMEN_MUSICA = 3.1; 

  let musicaSonando = false;
  let musicaTimeoutId = null;
  let pasoActual = 0;

  function programarPaso() {
    if (!enabled || !musicaSonando) return;

    const bajo = PATRON_BAJO[pasoActual % PATRON_BAJO.length];
    const lead = PATRON_LEAD[pasoActual % PATRON_LEAD.length];

    if (bajo) tono(bajo, DURACION_PASO * 3.6, "triangle", 0.05 * VOLUMEN_MUSICA); // sostenido, tipo pad
    if (lead) tono(lead, DURACION_PASO * 0.55, "square", 0.018 * VOLUMEN_MUSICA); // arpegio

    pasoActual++;
    musicaTimeoutId = setTimeout(programarPaso, DURACION_PASO * 1000);
  }

  function iniciarMusica() {
    if (!enabled || musicaSonando) return;
    musicaSonando = true;
    pasoActual = 0;
    programarPaso();
  }

  function detenerMusica() {
    musicaSonando = false;
    clearTimeout(musicaTimeoutId);
  }

  return {
    hover() {
      tono(880, 0.045, "square", 0.025);
    },
    select() {
      tono(523.25, 0.09, "square", 0.05, 0);
      tono(659.25, 0.09, "square", 0.05, 0.08);
      tono(783.99, 0.14, "square", 0.05, 0.16);
    },
    back() {
      tono(600, 0.07, "triangle", 0.045, 0);
      tono(380, 0.11, "triangle", 0.045, 0.07);
    },
    coin() {
      tono(988, 0.09, "square", 0.05, 0);
      tono(1318, 0.16, "square", 0.05, 0.09);
    },
    iniciarMusica,
    detenerMusica,
    musicaActiva() {
      return musicaSonando;
    },
    activarConPrimeraInteraccion() {
      const arrancar = () => {
        obtenerContexto();
        if (enabled) iniciarMusica();
        document.removeEventListener("pointerdown", arrancar);
        document.removeEventListener("keydown", arrancar);
      };
      // `pointerdown` se produce antes del click de una tarjeta, por lo que la
      // música ya está activa mientras el usuario permanece en el menú.
      document.addEventListener("pointerdown", arrancar, { once: true });
      document.addEventListener("keydown", arrancar, { once: true });
    },
    intentarIniciarMusica() {
      if (!enabled) return;
      obtenerContexto();
      iniciarMusica();
    },
    toggle() {
      enabled = !enabled;
      try {
        localStorage.setItem("arcadeSoundEnabled", JSON.stringify(enabled));
      } catch (e) {
        /* si localStorage no está disponible, simplemente no se guarda */
      }
      if (enabled) {
        this.select();
        iniciarMusica();
      } else {
        detenerMusica();
      }
      return enabled;
    },
    isEnabled() {
      return enabled;
    },
  };
})();
