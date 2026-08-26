# Crónicas de Nova & Byte

Juego de plataformas de estética pixel-art para un proyecto escolar. Está hecho con **HTML, CSS y JavaScript** (en el navegador se usa JavaScript, no Java) y no necesita instalar paquetes.

## Iniciar

Para jugar en solitario o en el mismo computador, basta con abrir `index.html` con doble clic en Chrome, Edge o Firefox.

Para usar el modo LAN:

1. Instala [Node.js](https://nodejs.org/) si aún no lo tienes.
2. Abre una terminal en esta carpeta.
3. Ejecuta `npm start`.
4. Abre `http://localhost:3000`.

## Controles

| Persona | Mover | Saltar | Agacharse | Disparar con flor/estrella |
| --- | --- | --- | --- | --- |
| Nova (P1) | A / D | W o Espacio | S | Shift: correr / disparar |
| Byte (P2) | Flechas izquierda / derecha | Flecha arriba | Flecha abajo | / o Enter: correr / disparar |

Agacharse solo cambia la altura del héroe cuando tiene el poder Hongo o Flor (Pequeño ya es lo bastante bajo). Se usa para cruzar los túneles de techo bajo que hay en cada nivel: si no cabes de pie, agáchate y sigue caminando. También puedes soltar la tecla y saltar por encima del túnel si prefieres la ruta alta.

## Cooperativo por red local

1. En el equipo anfitrión ejecuta `npm start`, abre el juego y pulsa **Crear sala**.
2. Comparte el código de cinco caracteres.
3. En el otro equipo, conectado a la **misma red**, abre `http://IP-DEL-ANFITRION:3000` (por ejemplo `http://192.168.1.20:3000`).
4. Pulsa **Unirse**, escribe el código y espera que el anfitrión pulse **Iniciar partida LAN**.

Si Windows pregunta, permite a Node.js usar redes privadas. Para conocer la IP del anfitrión, ejecuta `ipconfig` y busca la dirección IPv4 de Wi-Fi.

## Incluye

- 3 mundos de 5 niveles: 15 niveles totales.
- Jefes: Rey Baba, Escarabajo Magno y Núcleo Omega.
- Enemigos variados: babas, escarabajos, voladores y torretas.
- Hongo (crecer), flor (disparar) y estrella (invencibilidad, ahora con parpadeo arcoíris).
- Temporizador de nivel al estilo NES: si llega a 0 pierdes una vida y el reloj se reinicia. Al llegar a la meta obtienes un bono de puntos por el tiempo restante.
- Poste de meta (flagpole) animado: la bandera baja y el héroe resbala hasta el suelo antes de pasar de nivel.
- Partículas, textos de puntuación flotantes, sacudida de cámara y animación de caminar/salto/aterrizaje.
- Música chiptune y efectos de salto, monedas, poderes, disparos, daño, enemigos, 1UP y victoria; se pueden silenciar desde el botón superior.
- Modos individual, cooperativo local y cooperativo LAN.
