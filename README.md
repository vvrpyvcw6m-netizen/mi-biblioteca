# Mi Biblioteca — versión 1.5

PWA para gestionar una biblioteca personal de libros **en papel y ebook** desde un iPhone. No incluye audiolibros.

## Novedades de la versión 1.5

- **Formato:** Papel o Ebook. Para Papel, «Ubicación física»; para Ebook, «Plataforma / ubicación digital» (Kindle, Apple Books, Kobo, PDF u otro texto libre).
- **Tipo de obra:** Ensayo, novela, biografía, memorias, relatos y cuentos, poesía, teatro, manual, divulgación, otro o sin clasificar.
- **Materias / ramas del conocimiento:** campo editable (por ejemplo «Economía, Filosofía, Derecho»). Admite varias materias separadas por comas y conserva las que ya hayas escrito.
- **Tres filtros combinables** en Biblioteca: formato, tipo y materia. Se combinan también con «Por leer / Leyendo / Leídos» y con la búsqueda de texto. Botón de limpieza.
- **Buscar por portada:** fotografiarla con el iPhone, elegir imagen de Fotos o escribir título/autor. El sistema extrae texto mediante OCR local y consulta posibles coincidencias en Open Library y Google Books. **Debes elegir la coincidencia y revisar edición/ISBN** antes de guardar.

## Compatibilidad con libros ya guardados

La app sigue usando el MISMO nombre y versión de base de datos (`mi-biblioteca-db`, versión 1). La actualización NO limpia ni reemplaza los libros guardados.

- Libros antiguos sin formato: **Papel**.
- Libros antiguos sin tipo: **Sin clasificar**, hasta que edites su ficha.
- La antigua información del campo `genre` sigue siendo la **materia** en la versión nueva; no se borra.
- Los datos nuevos se guardan en las fichas cuando las editas o creas.

**Haz una copia de seguridad en Ajustes → Exportar mi biblioteca antes de actualizar. No borres la PWA, no vacíes sus datos web y no publiques el JSON de copia en GitHub.**

## Actualización desde iPhone

1. Desde la app anterior, **exporta la biblioteca** y guarda el `.json` en la app Archivos.
2. Descomprime `Mi-Biblioteca-actualizacion-v1.5.zip` con Archivos del iPhone.
3. Accede a tu repositorio: `https://github.com/vvrpyvcw6m-netizen/mi-biblioteca`.
4. Sube o reemplaza los **cuatro archivos** directamente en la raíz, no dentro de una carpeta: `app.js`, `index.html`, `styles.css` y `sw.js`. En Safari puede resultar necesario «Solicitar sitio web de escritorio» para ver `Add file → Upload files`.
5. Confirma `Commit changes` y abre `https://vvrpyvcw6m-netizen.github.io/mi-biblioteca/` en Safari. Cuando se publiquen los cambios, entra en **Ajustes** y confirma **Versión 1.5**. Es posible que debas cerrar y volver a abrir la app instalada para cargar la actualización.
6. Prueba los filtros, busca por portada y verifica que los libros anteriores siguen allí.

## Privacidad y límites

- GitHub Pages aloja el código públicamente, pero las fichas personales viven en el almacenamiento local (IndexedDB; fallback localStorage) **del navegador específico donde las registraste**. Safari, DuckDuckGo y la PWA instalada pueden tener bases de datos separadas.
- El OCR procesa la fotografía en el navegador, pero primero carga código/lenguajes del motor Tesseract desde una CDN. La aplicación no tiene servidor propio ni incorpora una función para subir tu fotografía.
- La app **sí envía el texto de la búsqueda** a Open Library y Google Books. Las portadas sugeridas se descargan desde sus proveedores externos. Esos proveedores pueden registrar las consultas o accesos según sus políticas.
- Es una búsqueda de posibles coincidencias, no un identificador infalible de ediciones. La portada puede ser difícil de leer o los catálogos incompletos. En esos casos, escribe parte del título en el buscador por portada o completa la ficha manualmente.
- Almacenamiento local no equivale a copia en iCloud ni a una cuenta sincronizada; realiza copias `.json` periódicas.

## Archivos

- `index.html`: interfaz y formularios.
- `app.js`: catálogo, filtros, ISBN, OCR, búsqueda por portada, importación/exportación.
- `styles.css`: diseño móvil.
- `sw.js`: caché PWA con nombre v1.5, red primero y fallback sin conexión.
- `manifest.webmanifest`, `icon-192.png`, `icon-512.png`: instalación y iconos.
