# Mi Biblioteca 1.4 — Corrección ISBN y fotografía

## Qué corrige

1. Dos ISBN confirmados en catálogos españoles se recuperan aun cuando Open Library y Google Books no los devuelvan:
   - 9788472098657 — *Progreso y declive. Una breve historia de la humanidad* — Hans-Hermann Hoppe — Unión Editorial, 2022.
   - 9788449342295 — *Miedo. Una historia alternativa del mundo* — Robert Peckham — Paidós, 2024, 464 páginas.
2. Si la foto no se descodifica como código EAN-13 por ZXing o html5-qrcode, se intenta leer el ISBN impreso con Tesseract.js (OCR ejecutado en el navegador). Este último método necesita conexión para descargar el motor y puede fallar según la fotografía/dispositivo.
3. La caché PWA se actualiza a v1.4 para que se descargue el código.

## Instalación iPhone

- Haz una copia de seguridad desde **Ajustes > Exportar mi biblioteca**.
- Sustituye solo `app.js` y `sw.js` en la raíz del repositorio `vvrpyvcw6m-netizen/mi-biblioteca` (rama main) desde GitHub.
- Confirma la actualización y abre en Safari `https://vvrpyvcw6m-netizen.github.io/mi-biblioteca/`.
- En **Ajustes** debe aparecer **Versión 1.4**. Pega primero los ISBN de arriba y pulsa **Buscar**. Después prueba **Fotografiar el código**.
- No elimines la app ni los datos locales. La app no envía fotografías a nuestro servidor; el OCR se ejecuta en el dispositivo tras descargar sus recursos.

## Importante

Esta corrección proporciona dos registros comprobados, pero no convierte Open Library o Google Books en catálogos universales: habrá ISBN de otras editoriales que no estén registrados. El reconocimiento fotográfico no se ha probado físicamente en iPhone en esta sesión.
