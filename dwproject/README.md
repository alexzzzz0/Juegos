# Arcade — Menú de juegos

## Estructura

El `index.html` principal vive **afuera** de esta carpeta (`dwproject/`),
un nivel arriba. Todo lo demás vive adentro:

```
raiz-del-repo/
├── index.html               ← Menú principal (abre este archivo)
└── dwproject/
    ├── README.md
    ├── assets/
    │   ├── style.css          ← Estilos del menú
    │   ├── script.js           ← Lista de juegos (EDITA AQUÍ para agregar juegos)
    │   ├── volver.css          ← Estilos del botón "Volver al menú"
    │   └── volver-snippet.html ← Snippet listo para copiar/pegar
    └── juegos/
        └── ejemplo-juego/
            └── index.html      ← Juego de ejemplo con el botón ya integrado
```

`index.html` sabe dónde está `dwproject/` gracias a una línea al inicio
del `<head>`: `window.ARCADE_BASE = 'dwproject/';`. Si renombras la
carpeta `dwproject`, ese es el único lugar que hay que actualizar.

## Subir a GitHub Pages

Sube el contenido de `raiz-del-repo/` (el `index.html` y la carpeta
`dwproject/` juntos) a la raíz del repositorio, y activa GitHub Pages
apuntando a la rama principal. No hace falta ninguna carpeta especial
ni mover nada más: GitHub Pages sirve el `index.html` que encuentre en
la raíz del repo (o en `/docs`, si prefieres esa carpeta).

## Cómo agregar un juego nuevo

1. Copia la carpeta de tu juego dentro de `juegos/` (por ejemplo `juegos/mi-juego/`).
   El juego debe tener un `index.html` como punto de entrada.
2. Abre `assets/script.js` y agrega un objeto nuevo al arreglo `JUEGOS`:

```js
{
  nombre: "Mi Juego",
  carpeta: "juegos/mi-juego/index.html",
  genero: "Arcade",
  icono: "🚀",
  nuevo: true
}
```

3. Guarda. La tarjeta aparece automáticamente en el menú, sin tocar el HTML.

## Cómo agregar el botón "Volver al menú" a un juego

Copia esto dentro del `<head>` de tu juego (ajustando la ruta según la
profundidad de la carpeta):

```html
<link rel="stylesheet" href="../../assets/volver.css">
```

Y esto justo después de `<body>`:

```html
<a href="../../../index.html" class="btn-volver">
  <span class="icono">⬅</span><span class="texto">VOLVER</span>
</a>
```

Ojo: el link al `index.html` lleva un `../` más que el de `assets/`,
porque el `index.html` real está un nivel más arriba (afuera de
`dwproject/`). Si tu juego está más profundo (por ejemplo
`juegos/mi-juego/niveles/nivel1.html`), agrega un `../` extra por cada
nivel de carpeta a ambas rutas.

## Compatibilidad

Todo está hecho en HTML/CSS/JS sin frameworks ni build tools, así que funciona
directamente abriendo `index.html` en cualquier navegador moderno, o subiéndolo
a cualquier hosting estático (GitHub Pages, Netlify, un servidor propio, etc).
