# Mi Biblioteca · versión 1.0

Una biblioteca personal para iPhone, sin cuentas ni servidor de datos.

## Archivos incluidos
- `index.html` — aplicación y formularios.
- `styles.css` — diseño adaptable a móvil.
- `app.js` — lógica de libros, búsqueda ISBN, escáner y copias.
- `manifest.webmanifest` — instalación en pantalla de inicio.
- `sw.js` — caché para uso sin conexión de la interfaz y fichas.
- `icon-192.png` / `icon-512.png` — iconos.

## Instalación usando **solo el iPhone**

1. Descarga el ZIP y ábrelo en **Archivos** de iOS. Púlsalo para descomprimirlo.
2. En Safari, entra en https://github.com/new e inicia sesión o crea una cuenta de GitHub.
3. Crea un repositorio **público**, por ejemplo `mi-biblioteca`, con la rama `main`.
4. En el repositorio pulsa **Add file → Upload files** (en Safari quizá tengas que usar **Solicitar sitio web de escritorio**). Desde **Elegir archivos → Explorar** elige todos los archivos de la carpeta `mi-biblioteca` descomprimida, incluido `index.html`, y confirma la subida («Commit changes»). Deben quedar en la **raíz del repositorio**, no en una subcarpeta.
5. En **Settings → Pages → Build and deployment**, selecciona **Deploy from a branch**, rama `main`, carpeta `/ (root)` y guarda.
6. Tu dirección será `https://TU-USUARIO.github.io/mi-biblioteca/` (sustituye TU-USUARIO por el nombre real de tu cuenta). La publicación puede tardar unos minutos.
7. Abre ese enlace en **Safari**. Toca **Compartir → Añadir a pantalla de inicio** y, si sale la opción, activa **Abrir como aplicación web**. Pulsa **Añadir**.
8. Abre «Mi Biblioteca» desde el icono y añade tu primer libro.

Si GitHub no permite seleccionar muchos archivos juntos en Safari, súbelos en varias tandas con **Add file → Upload files**.

**Importante**: no abras `index.html` directamente desde Archivos para instalarla. El modo PWA y la cámara requieren una dirección HTTPS. Las fichas pueden funcionar localmente en un archivo, pero la instalación real exige la web publicada.

## Funcionalidad

- Añadir, editar, ver y eliminar libros.
- ISBN-10 y ISBN-13, con comprobación de dígitos; búsqueda en la API de Open Library.
- Lectura con cámara de códigos EAN/UPC que contengan ISBN, mediante `html5-qrcode`.
- Portadas, autor, editorial, año, género, ubicación física, páginas, estado de lectura, fechas, puntuación y notas.
- Búsqueda por texto, filtros y ordenación.
- Lecturas en curso, progreso por páginas y pendientes.
- Estadísticas de colección, libros terminados y valoraciones.
- Exportar e importar JSON de copias de seguridad.
- Uso sin conexión de la interfaz y fichas guardadas después de la primera carga.

## Privacidad y límites importantes

- **Los libros se guardan localmente en el iPhone** mediante IndexedDB, o localStorage como alternativa. GitHub Pages aloja solamente el código público de la app, **no** tus fichas ni tus notas.
- **No hay sincronización automática** entre dispositivos. Exporta copias JSON periódicas desde Ajustes y guárdalas en Archivos o iCloud Drive.
- **Safari y la PWA instalada pueden usar almacenamientos diferentes.** Añade los libros desde la app instalada, no desde Safari. Si ya has añadido libros en Safari, exporta la copia allí e impórtala en la app.
- Si eliminas la aplicación, borras sus datos web o cambias de iPhone sin copia, podrías perder la colección.
- La consulta ISBN requiere Internet y depende de los datos que tenga Open Library: puede faltar información o existir una edición diferente.
- Las portadas requieren conexión si no se han guardado en la caché del navegador.
- Al pulsar «Escanear», el navegador descarga desde jsDelivr o unpkg la biblioteca externa `html5-qrcode` (versión 2.3.8), y solicita permiso para acceder a la cámara. El escaneo puede fallar en determinados iPhone o versiones de iOS; siempre puedes escribir el ISBN a mano.
- Los datos se exportan en texto JSON: **no están cifrados**. Guarda las copias en un lugar privado.
- GitHub Pages publica el código de forma pública, pero **nunca incluyas archivos de tus copias de seguridad en el repositorio**.

## Datos guardados de cada libro (versión 1)

`id`, `title`, `author`, `isbn`, `publisher`, `year`, `pages`, `genre`, `location`, `status` (`pendiente` / `leyendo` / `leido`), `currentPage`, `startedAt`, `finishedAt`, `rating` (0–5), `notes`, `coverUrl`, `createdAt`, `updatedAt`.

## Tecnología

HTML, CSS, JavaScript nativo, IndexedDB, Service Worker y Web App Manifest.

Fuentes: https://openlibrary.org/dev/docs/api/books · https://github.com/mebjas/html5-qrcode · https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
