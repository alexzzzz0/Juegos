/* ============================================================
   Script del botón "Volver al menú".
   Requiere que assets/sound.js esté cargado ANTES que este archivo.
   Busca cualquier elemento con la clase .btn-volver y le agrega
   el sonido + una pequeña espera antes de navegar.
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".btn-volver").forEach((boton) => {
    boton.addEventListener("click", (e) => {
      if (typeof ArcadeSound === "undefined") return; // sin sonido, navega normal
      e.preventDefault();
      ArcadeSound.back();
      const destino = boton.getAttribute("href");
      setTimeout(() => {
        window.location.href = destino;
      }, 180);
    });
  });
});
