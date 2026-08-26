
const JUEGOS = [
  {
    nombre: "Nova & Byte",
    carpeta: "juegos/cronicas-nova-byte/index.html",
    genero: "Plataformas",
    icono: "🕹️",
    nuevo: true,
    preview: "juegos/cronicas-nova-byte/preview.mp4",
  },
    {
    nombre: "Steel Command",
    carpeta: "juegos/Steel Command/index.html",
    genero: "Run and Gun",
    icono: "🕹️",
    nuevo: true,
    preview: "juegos/Steel Command/preview.mp4",
  },
    {
    nombre: "Outbreak Zero Patient",
    carpeta: "juegos/Outbreak Zero Patient/index.html",
    genero: "Apocalipsis Zombie",
    icono: "🕹️",
    nuevo: true,
    preview: "juegos/Outbreak Zero Patient/preview.mp4",
  },
   {
    nombre: "Ocean Catch",
    carpeta: "juegos/ocean catch/Ocean Catch.html",
    genero: "Pesca",
    icono: "🕹️",
    nuevo: true,
    preview: "juegos/ocean catch/preview.mp4",
  },
     {
    nombre: "Pixel Bite",
    carpeta: "juegos/pacman/Pacman.html",
    genero: "laberintos",
    icono: "🕹️",
    nuevo: true,
    preview: "juegos/pacman/preview.mp4",
  },

  {
    nombre: "Apex Rush",
    carpeta: "juegos/Apex/Apex Rush.html",
    genero: "Carreras",
    icono: "🦆",
    nuevo: true,
    preview: "juegos/Apex/preview.mp4",
  },

  {
    nombre: "Duck Hunt Carnival",
    carpeta: "juegos/duckhunt/duckhunt-carnival.html",
    genero: "Tiro al blanco",
    icono: "🦆",
    nuevo: true,
    preview: "juegos/duckhunt/preview.mp4",
  },
    {
    nombre: "Memory Match",
    carpeta: "juegos/memory/Memory-Match.html",
    genero: "Memoria",
    icono: "🦆",
    nuevo: true,
    preview: "juegos/memory/preview.mp4",
  },
   {
    nombre: "Flappy Pixel",
    carpeta: "juegos/flappy/flappy pixel bird.html",
    genero: "casual",
    icono: "🦆",
    nuevo: true,
    preview: "juegos/flappy/preview.mp4",
  },
  {
    nombre: "Pixel Brawl",
    carpeta: "juegos/ppt/ppt.html",
    genero: "Piedra, papel o tijeras",
    icono: "✊",
    nuevo: true,
    preview: "juegos/ppt/preview.mp4",

  },
  

  // {
  //   nombre: "Space Runner",
  //   carpeta: "juegos/space-runner/index.html",
  //   genero: "Arcade",
  //   icono: "🚀",
  //   nuevo: false,
  //   preview: "juegos/space-runner/preview.mp4", // opcional
  // },
];

/* Extensiones que se tratan como video (autoplay muted en loop)
   vs. las que se tratan como imagen animada (gif/webp/apng). */
const EXTENSIONES_VIDEO = ["mp4", "webm", "ogg", "mov"];

function tipoDePreview(ruta) {
  const ext = ruta.split(".").pop().toLowerCase();
  return EXTENSIONES_VIDEO.includes(ext) ? "video" : "imagen";
}

function crearTarjeta(juego) {
  const a = document.createElement("a");
  a.className = "cabinet";
  a.href = juego.carpeta;
  a.setAttribute("aria-label", `Jugar ${juego.nombre}`);


  let previewHTML = "";
  if (juego.preview) {
    if (tipoDePreview(juego.preview) === "video") {
      previewHTML = `<video class="vista-previa" src="${juego.preview}" muted loop playsinline preload="auto" aria-hidden="true"></video>`;
    } else {
      previewHTML = `<img class="vista-previa" src="${juego.preview}" alt="" aria-hidden="true" loading="eager">`;
    }
  }

  a.innerHTML = `
    ${juego.nuevo ? '<span class="cinta">NUEVO</span>' : ""}
    <div class="pantalla">
      <span class="icono-defecto">${juego.icono}</span>
      ${previewHTML}
    </div>
    <div class="titulo-juego">${juego.nombre}</div>
    <span class="genero">${juego.genero}</span>
    <span class="botones-control" aria-hidden="true">
      <span></span><span></span><span></span>
    </span>
  `;
  if (juego.preview) a.classList.add("has-preview");

  const videoPreview = a.querySelector("video.vista-previa");
  const imagePreview = a.querySelector("img.vista-previa");

  a.addEventListener("mouseenter", () => ArcadeSound.hover());
  a.addEventListener("focus", () => ArcadeSound.hover());

 
  if (juego.preview) {
    const activarPreview = () => {
      if (videoPreview) {
        videoPreview.currentTime = 0;
        videoPreview.play().catch(() => {});
        return;
      }
      if (imagePreview && !imagePreview.src) imagePreview.src = juego.preview;
    };

    const desactivarPreview = () => {
      if (videoPreview) {
        videoPreview.pause();
        videoPreview.currentTime = 0;
      }

    };

    a.addEventListener("mouseenter", activarPreview);
    a.addEventListener("mouseleave", desactivarPreview);

    a.addEventListener("focus", activarPreview);
    a.addEventListener("blur", desactivarPreview);

  }

  let inclinacionPendiente = 0;
  let limitesTarjeta = null;
  let punteroX = 0;
  let punteroY = 0;

  const actualizarInclinacion = () => {
    inclinacionPendiente = 0;
    const r = limitesTarjeta || a.getBoundingClientRect();
    const x = (punteroX - r.left) / r.width - 0.5;
    const y = (punteroY - r.top) / r.height - 0.5;
    a.classList.add("tilting");
    a.style.transform = `translateY(-6px) scale(1.015) rotateX(${(-y * 10).toFixed(2)}deg) rotateY(${(x * 12).toFixed(2)}deg)`;
  };

  a.addEventListener("pointerenter", () => {
    limitesTarjeta = a.getBoundingClientRect();
  });

  a.addEventListener("pointermove", (e) => {
    punteroX = e.clientX;
    punteroY = e.clientY;
    if (!inclinacionPendiente) {
      inclinacionPendiente = requestAnimationFrame(actualizarInclinacion);
    }
  });

  a.addEventListener("pointerleave", () => {
    if (inclinacionPendiente) cancelAnimationFrame(inclinacionPendiente);
    inclinacionPendiente = 0;
    limitesTarjeta = null;
    a.classList.remove("tilting");
    a.style.transform = "";
  });

  a.addEventListener("click", (e) => {
    e.preventDefault();
    ArcadeSound.select();
    const flash = document.querySelector(".flash-transition");
    flash.classList.add("activo");
    setTimeout(() => {
      window.location.href = juego.carpeta;
    }, 320); 
  });

  return a;
}

function iniciarBotonSonido() {
  const boton = document.getElementById("btn-sonido");
  if (!boton) return;

  const actualizarIcono = () => {
    boton.textContent = ArcadeSound.isEnabled() ? "🔊" : "🔇";
    boton.setAttribute(
      "aria-label",
      ArcadeSound.isEnabled() ? "Silenciar sonido" : "Activar sonido"
    );
  };

  actualizarIcono();

  boton.addEventListener("click", () => {
    ArcadeSound.toggle();
    actualizarIcono();
  });
}

function iniciarTituloFijo() {
  const marquee = document.querySelector(".marquee");
  if (!marquee) return;

  let actualizacionPendiente = false;

  const actualizarTitulo = () => {
    actualizacionPendiente = false;
    const tituloSalioDeVista = marquee.getBoundingClientRect().bottom <= 0;
    document.body.classList.toggle("titulo-fijo-visible", tituloSalioDeVista);
  };

  const programarActualizacion = () => {
    if (!actualizacionPendiente) {
      actualizacionPendiente = true;
      requestAnimationFrame(actualizarTitulo);
    }
  };

  actualizarTitulo();
  window.addEventListener("scroll", programarActualizacion, { passive: true });
}

function renderizarJuegos() {
  const grid = document.getElementById("games-grid");
  grid.innerHTML = "";
  JUEGOS.forEach((juego) => grid.appendChild(crearTarjeta(juego)));
}

function iniciarNavegacionTeclado() {
  const grid = document.getElementById("games-grid");
  if (!grid) return;

  const tarjetas = Array.from(grid.querySelectorAll(".cabinet"));
  let indice = -1;

  function columnas() {
    const estilo = getComputedStyle(grid);
    return estilo.gridTemplateColumns.split(" ").length || 1;
  }

  function marcarCursor(nuevoIndice) {
    if (!tarjetas.length) return;

    tarjetas.forEach((t) => t.classList.remove("cursor-arcade"));

    indice = Math.max(0, Math.min(nuevoIndice, tarjetas.length - 1));
    const activa = tarjetas[indice];
    activa.classList.add("cursor-arcade");
    activa.scrollIntoView({ behavior: "smooth", block: "nearest" });

    activa.focus({ preventScroll: true });
  }

  grid.addEventListener("focusin", (e) => {
    const cabinet = e.target.closest(".cabinet");
    if (!cabinet) return;
    const i = tarjetas.indexOf(cabinet);
    if (i !== -1) indice = i;
  });

  document.addEventListener("keydown", (e) => {
    if (!tarjetas.length) return;

    const teclasUsadas = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Enter", " "];
    if (!teclasUsadas.includes(e.key)) return;


    const activo = document.activeElement;
    const esControlPropio =
      activo && (activo.id === "btn-sonido" || activo.classList.contains("coin-slot"));
    if (esControlPropio) return;

    e.preventDefault();
    const cols = columnas();

    if (indice === -1) {
      marcarCursor(0);
      return;
    }

    switch (e.key) {
      case "ArrowRight":
        marcarCursor(indice + 1);
        break;
      case "ArrowLeft":
        marcarCursor(indice - 1);
        break;
      case "ArrowDown":
        marcarCursor(indice + cols);
        break;
      case "ArrowUp":
        marcarCursor(indice - cols);
        break;
      case "Enter":
      case " ":
        tarjetas[indice].click();
        break;
    }
  });
}

function iniciarRanuraMoneda() {
  const slot = document.querySelector(".coin-slot");
  if (!slot) return;

  let creditos = 0;
  let temporizadorInsercion = 0;

  slot.setAttribute("role", "button");
  slot.setAttribute("tabindex", "0");
  slot.setAttribute("aria-label", "Insertar moneda");

  function insertarMoneda() {
    creditos++;
    ArcadeSound.coin();
    slot.classList.add("insertada");
    slot.innerHTML = `<span class="moneda-fx">🪙</span> CREDITOS: <span class="creditos">${String(creditos).padStart(2, "0")}</span>`;
    clearTimeout(temporizadorInsercion);
    temporizadorInsercion = setTimeout(() => slot.classList.remove("insertada"), 400);
  }

  slot.addEventListener("click", insertarMoneda);
  slot.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      insertarMoneda();
    }
  });
}

/* ---------- Secuencia de encendido del monitor al cargar la página ---------- */
function iniciarSecuenciaEncendido() {
  document.body.classList.add("boot-secuencia");
  setTimeout(() => document.body.classList.remove("boot-secuencia"), 950);
}

/* ---------- Glitch cromático aleatorio en el título, como un tubo CRT viejo ---------- */
function iniciarGlitchTitulo() {
  const h1 = document.querySelector(".marquee h1");
  if (!h1 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  h1.setAttribute("data-text", h1.textContent.trim());

  const programarGlitch = () => {
    setTimeout(() => {
      h1.classList.add("glitch-tic");
      setTimeout(() => h1.classList.remove("glitch-tic"), 230);
      programarGlitch();
    }, 6000 + Math.random() * 4000);
  };

  programarGlitch();
}

/* ---------- Easter egg: código Konami activa un "modo secreto" arcoíris ---------- */
function iniciarCodigoKonami() {
  const secuencia = [
    "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
    "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
    "b", "a",
  ];
  let progreso = 0;

  const mensaje = document.createElement("div");
  mensaje.className = "mensaje-secreto";
  mensaje.textContent = "MODO SECRETO ACTIVADO";
  document.body.appendChild(mensaje);

  document.addEventListener("keydown", (e) => {
    const tecla = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    progreso = tecla === secuencia[progreso] ? progreso + 1 : (tecla === secuencia[0] ? 1 : 0);

    if (progreso === secuencia.length) {
      progreso = 0;
      document.body.classList.toggle("modo-secreto");
      ArcadeSound.select();
      mensaje.textContent = document.body.classList.contains("modo-secreto")
        ? "MODO SECRETO ACTIVADO"
        : "MODO SECRETO DESACTIVADO";
      mensaje.classList.add("visible");
      setTimeout(() => mensaje.classList.remove("visible"), 1800);
    }
  });
}

/* ---------- Inyecta los elementos decorativos nuevos sin tocar el HTML ---------- */
function inyectarDecoracion() {
  // Curvatura de tubo CRT + barrido de luz, agregados una sola vez al body
  if (!document.querySelector(".crt-curve")) {
    const curva = document.createElement("div");
    curva.className = "crt-curve";
    document.body.appendChild(curva);
  }
  if (!document.querySelector(".crt-sweep")) {
    const barrido = document.createElement("div");
    barrido.className = "crt-sweep";
    document.body.appendChild(barrido);
  }

  // Foquitos de marquesina, justo antes del título
  const h1 = document.querySelector(".marquee h1");
  if (h1 && !document.querySelector(".marquee-lights")) {
    const luces = document.createElement("div");
    luces.className = "marquee-lights";
    luces.setAttribute("aria-hidden", "true");
    luces.innerHTML = "<span></span>".repeat(9);
    h1.parentElement.insertBefore(luces, h1);
  }

  // Aviso de controles de teclado, después de la ficha de moneda
  const coin = document.querySelector(".coin-slot");
  if (coin && !document.querySelector(".aviso-controles")) {
    const aviso = document.createElement("p");
    aviso.className = "aviso-controles";
    aviso.innerHTML = 'Navega con <kbd>◀</kbd><kbd>▶</kbd><kbd>▲</kbd><kbd>▼</kbd> y elige con <kbd>Enter</kbd>';
    coin.insertAdjacentElement("afterend", aviso);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  inyectarDecoracion();
  renderizarJuegos();
  iniciarBotonSonido();
  iniciarTituloFijo();
  iniciarNavegacionTeclado();
  iniciarRanuraMoneda();
  iniciarSecuenciaEncendido();
  iniciarGlitchTitulo();
  iniciarCodigoKonami();
  ArcadeSound.intentarIniciarMusica();
  ArcadeSound.activarConPrimeraInteraccion();
});
