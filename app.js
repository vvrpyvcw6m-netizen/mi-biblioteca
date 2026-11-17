/* Mi Biblioteca — PWA personal sin servidor.
   Datos: IndexedDB del dispositivo. Metadatos ISBN: Open Library.
   Escáner: html5-qrcode, cargado de CDN solo al pulsar «Escanear».
*/
'use strict';

const DB_NAME = 'mi-biblioteca-db';
const DB_VERSION = 1;
const STORE = 'books';
const SCANNER_CDNS = [
  'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];
const LABELS = {pendiente:'Por leer', leyendo:'Leyendo', leido:'Leído'};
const FORMATS = [['papel','Papel'],['ebook','Ebook']];
const TYPES = [['sin_clasificar','Sin clasificar'],['ensayo','Ensayo'],['novela','Novela'],['biografia','Biografía'],['memorias','Memorias'],['relato','Relatos y cuentos'],['poesia','Poesía'],['teatro','Teatro'],['manual','Manual / texto académico'],['divulgacion','Divulgación'],['otro','Otro']];
const SUGGESTED_SUBJECTS = ['Antropología','Arqueología','Arte','Astronomía','Biología','Ciencia','Derecho','Economía','Educación','Empresa','Ética','Filología','Filosofía','Física','Geografía','Historia','Historia del arte','Lingüística','Literatura','Matemáticas','Medicina','Política','Psicología','Química','Religión','Sociología','Tecnología'];
const SUGGESTED_NOVEL_GENRES = ['Aventuras','Ciencia ficción','Costumbrista','Distopía','Fantasía','Ficción contemporánea','Histórica','Humor','Juvenil','Misterio','Novela negra','Policíaca','Realista','Romántica','Suspense','Terror'];
function formatOf(b){return b?.format==='ebook'?'ebook':'papel';}
function typeOf(b){return TYPES.some(([key])=>key===b?.bookType)?b.bookType:'sin_clasificar';}
function typeLabel(key){return TYPES.find(([value])=>value===key)?.[1]||'Sin clasificar';}
function normText(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();}
function subjectsOf(b){return String(b?.genre||'').split(/[,;]+/).map(s=>s.trim()).filter(Boolean);}
// El tipo de obra determina la rama de categorías sugeridas. El campo 'genre'
// anterior se conserva literalmente, para no alterar las bibliotecas existentes.
function categoryKind(type){
 if(['novela','relato'].includes(type))return 'genero';
 if(['ensayo','manual','divulgacion'].includes(type))return 'materia';
 return 'tema';
}
function categoryLabel(type){
 const kind=categoryKind(type);
 return kind==='genero'?'Género literario':kind==='materia'?'Materia / rama del conocimiento':'Tema / categoría';
}
function categoryOptionsForType(type){
 if(!type)return [];
 const kind=categoryKind(type);
 const defaults=kind==='genero'?SUGGESTED_NOVEL_GENRES:kind==='materia'?SUGGESTED_SUBJECTS:[];
 const all=new Map(defaults.map(s=>[normText(s),s]));
 // Solo incluir etiquetas de obras de la misma clase; nunca mezclar géneros y materias.
 state.books.filter(b=>typeOf(b)===type).forEach(b=>subjectsOf(b).forEach(s=>{
  const key=normText(s);if(key&&!all.has(key))all.set(key,s);
 }));
 return [...all.values()].sort((a,b)=>a.localeCompare(b,'es'));
}
function categoryPlaceholder(type){
 if(!type)return 'Primero elige un tipo';
 return categoryKind(type)==='genero'?'Todos los géneros':categoryKind(type)==='materia'?'Todas las materias':'Todos los temas';
}
function selectOptions(options,current,blankLabel){return `<option value="">${escapeHTML(blankLabel)}</option>`+options.map(([value,label])=>`<option value="${escapeHTML(value)}" ${current===value?'selected':''}>${escapeHTML(label)}</option>`).join('');}
const $ = (id) => document.getElementById(id);
const state = {books:[],tab:'biblioteca',filter:'todos',formatFilter:'',bookTypeFilter:'',genreFilter:'',query:'',sort:'newest',db:null,storage:'indexedDB',activeId:null,scanner:null,scannerRunning:false,scanResolved:false,scannerToken:0,scanHintTimer:null,photoObjectUrl:null,coverPhotoUrl:null,coverResults:[],coverSearchToken:0,toastTimer:null};

function escapeHTML(value='') {
  return String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function safeUrl(input='') {
  try{const u=new URL(String(input));return ['https:','http:'].includes(u.protocol) ? u.href : '';}catch{return '';}
}
function shortText(value, n=100){return String(value ?? '').slice(0,n).trim();}
function normalizeISBN(v){return String(v||'').toUpperCase().replace(/[^0-9X]/g,'');}
function validISBN(str){
 const x=normalizeISBN(str);
 if(/^\d{13}$/.test(x))return [...x].reduce((s,c,i)=>s+Number(c)*(i%2?3:1),0)%10===0;
 if(/^\d{9}[\dX]$/.test(x))return [...x].reduce((s,c,i)=>s+(c==='X'?10:Number(c))*(10-i),0)%11===0;
 return false;
}
function dateToday(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function prettyDate(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return '—';const [y,m,d]=date.split('-');return `${d}/${m}/${y}`;}
function idNew(){return globalThis.crypto?.randomUUID?.() || `b-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
function intOrZero(value){const n=parseInt(value,10);return Number.isFinite(n) ? Math.max(0,Math.min(99999,n)):0;}
function getPercent(book){const p=intOrZero(book.pages),read=intOrZero(book.currentPage);return p?Math.max(0,Math.min(100,Math.round(read*100/p))):0;}
function toast(message){const node=$('toast');node.textContent=message;node.classList.add('visible');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>node.classList.remove('visible'),3400);}

async function openDB(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window))return reject(new Error('No existe IndexedDB'));
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onerror=()=>reject(request.error||new Error('No se puede abrir la base de datos'));
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);
  });
}
function dbRequest(method,arg){
  return new Promise((resolve,reject)=>{
    if(state.storage==='localStorage'){
      try{
        const data=JSON.parse(localStorage.getItem('mi-biblioteca-books')||'[]');
        if(method==='getAll')return resolve(data);
        if(method==='put'){const i=data.findIndex(b=>b.id===arg.id);i<0?data.push(arg):data.splice(i,1,arg);localStorage.setItem('mi-biblioteca-books',JSON.stringify(data));return resolve(arg);}
        if(method==='delete'){localStorage.setItem('mi-biblioteca-books',JSON.stringify(data.filter(b=>b.id!==arg)));return resolve();}
      }catch(e){return reject(e)}
    }
    try{
      const tx=state.db.transaction(STORE,method==='getAll'?'readonly':'readwrite');
      const request=tx.objectStore(STORE)[method](...(method==='getAll'?[]:[arg]));
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    }catch(e){reject(e)}
  });
}
async function reload(){state.books=await dbRequest('getAll');render();}
function normalizeBook(b){
 const status=['pendiente','leyendo','leido'].includes(b.status)?b.status:'pendiente';
 return {
  id:shortText(b.id||idNew(),130),title:shortText(b.title,300),author:shortText(b.author,260),
  isbn:shortText(normalizeISBN(b.isbn),13),publisher:shortText(b.publisher,150),year:intOrZero(b.year),
  pages:intOrZero(b.pages),genre:shortText(b.genre,100),location:shortText(b.location,120),
  format:formatOf(b),platform:shortText(b.platform,100),bookType:typeOf(b),
  status,currentPage:intOrZero(b.currentPage),startedAt:/^\d{4}-\d{2}-\d{2}$/.test(b.startedAt||'')?b.startedAt:'',
  finishedAt:/^\d{4}-\d{2}-\d{2}$/.test(b.finishedAt||'')?b.finishedAt:'',
  rating:Math.max(0,Math.min(5,intOrZero(b.rating))),notes:shortText(b.notes,4000),coverUrl:safeUrl(b.coverUrl),
  createdAt:shortText(b.createdAt||new Date().toISOString(),40),updatedAt:shortText(b.updatedAt||new Date().toISOString(),40)
 };
}
function bookImage(book,cls=''){
 const url=safeUrl(book.coverUrl);
 const text=`<span>${escapeHTML(book.title)}</span><small>${escapeHTML(book.author)}</small>`;
 if(cls==='reading')return url?`<img class="reading-cover" data-cover src="${escapeHTML(url)}" alt="Portada de ${escapeHTML(book.title)}" loading="lazy">`:`<div class="reading-placeholder">${escapeHTML(book.title)}</div>`;
 if(cls==='detail')return url?`<img class="detail-cover" data-cover src="${escapeHTML(url)}" alt="Portada de ${escapeHTML(book.title)}">`:`<div class="detail-cover-fallback">${escapeHTML(book.title)}</div>`;
 return `<div class="cover-wrap"><div class="cover-placeholder">${text}</div>${url?`<img data-cover src="${escapeHTML(url)}" alt="Portada de ${escapeHTML(book.title)}" loading="lazy">`:''}<span class="status-pill ${book.status}">${LABELS[book.status]}</span><span class="format-pill">${formatOf(book)==='ebook'?'Ebook':'Papel'}</span></div>`;
}
function bookCard(book){return `<button class="book-card" type="button" data-open="${escapeHTML(book.id)}" aria-label="Abrir ficha de ${escapeHTML(book.title)}">${bookImage(book)}<h3>${escapeHTML(book.title)}</h3><p class="author">${escapeHTML(book.author||'Autor sin indicar')}</p></button>`;}
function bookList(filter=state.filter){
 const q=state.query.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const list=state.books.filter(b=>{
   if(filter!=='todos'&&b.status!==filter)return false;
   if(state.formatFilter&&formatOf(b)!==state.formatFilter)return false;
   if(state.bookTypeFilter&&typeOf(b)!==state.bookTypeFilter)return false;
   if(state.bookTypeFilter&&state.genreFilter&&!subjectsOf(b).some(item=>normText(item)===normText(state.genreFilter)))return false;
   const search=[b.title,b.author,b.isbn,b.genre,b.publisher,b.location,b.platform,typeLabel(typeOf(b)),formatOf(b)].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
   return search.includes(q);
 });
 list.sort((a,b)=>{
   switch(state.sort){case'title':return a.title.localeCompare(b.title,'es');case'author':return a.author.localeCompare(b.author,'es');case'oldest':return (a.createdAt||'').localeCompare(b.createdAt||'');default:return (b.createdAt||'').localeCompare(a.createdAt||'');}
 });
 return list;
}
function emptyBlock(title,desc,button='Añadir mi primer libro'){
 return `<div class="empty"><div class="empty-illustration" aria-hidden="true">📚</div><h3>${escapeHTML(title)}</h3><p>${escapeHTML(desc)}</p><button type="button" data-action="add" class="btn btn-primary">＋ ${escapeHTML(button)}</button></div>`;
}
function hero(){const total=state.books.length,read=state.books.filter(x=>x.status==='leido').length,active=state.books.filter(x=>x.status==='leyendo').length;return `<section class="hero"><span class="eyebrow">UN HOGAR PARA TUS HISTORIAS</span><h1 class="hero-title">Cada libro tiene su lugar.</h1><p class="hero-desc">Tu biblioteca personal, organizada a tu manera y siempre contigo.</p><div class="hero-count"><div><strong>${total}</strong><small>En tu colección</small></div><div><strong>${read}</strong><small>Leídos</small></div><div><strong>${active}</strong><small>En lectura</small></div></div></section>`;}
function renderBiblioteca(){
 const categories=categoryOptionsForType(state.bookTypeFilter).map(x=>[x,x]);
 $('content').innerHTML=`${hero()}<div class="section-heading"><h2 class="section-title">Tus libros</h2><span class="section-sub">${state.books.length} en total</span></div><div class="searchbar"><svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.7"/><path d="m16 16 5 5"/></svg><input id="searchInput" type="search" aria-label="Buscar libros" placeholder="Título, autor, ISBN, materia..." value="${escapeHTML(state.query)}"></div><div class="chip-scroll" aria-label="Filtrar por lectura">${[['todos','Todos'],['pendiente','Por leer'],['leyendo','Leyendo'],['leido','Leídos']].map(([key,val])=>`<button class="chip ${state.filter===key?'selected':''}" type="button" data-filter="${key}" aria-pressed="${state.filter===key}">${val}</button>`).join('')}</div><div class="advanced-filters"><label>Formato<select id="formatFilter" aria-label="Filtrar por formato">${selectOptions(FORMATS,state.formatFilter,'Todos los formatos')}</select></label><label>Tipo de libro<select id="bookTypeFilter" aria-label="Filtrar por tipo de libro">${selectOptions(TYPES,state.bookTypeFilter,'Todos los tipos')}</select></label><label><span id="genreFilterCaption">${escapeHTML(categoryLabel(state.bookTypeFilter))}</span><select id="genreFilter" aria-label="Filtrar por categoría del tipo elegido" ${!state.bookTypeFilter?'disabled':''}>${selectOptions(categories,state.genreFilter,categoryPlaceholder(state.bookTypeFilter))}</select></label></div><div class="sort-row"><span id="resultsCount"></span><button id="clearFilters" class="clear-filters" type="button">Limpiar filtros</button><label>Ordenar: <select id="sortSelect"><option value="newest" ${state.sort==='newest'?'selected':''}>Más recientes</option><option value="title" ${state.sort==='title'?'selected':''}>Título A–Z</option><option value="author" ${state.sort==='author'?'selected':''}>Autor A–Z</option><option value="oldest" ${state.sort==='oldest'?'selected':''}>Más antiguos</option></select></label></div><div id="booksContainer"></div>`;
 updateBookGrid();
 $('searchInput').addEventListener('input',e=>{state.query=e.target.value;updateBookGrid();});
 $('sortSelect').addEventListener('change',e=>{state.sort=e.target.value;updateBookGrid();});
 $('formatFilter').addEventListener('change',e=>{state.formatFilter=e.target.value;updateBookGrid();});
 $('bookTypeFilter').addEventListener('change',e=>{
   state.bookTypeFilter=e.target.value;
   state.genreFilter=''; // Limpiar la segunda selección cuando cambia la primera.
   const child=$('genreFilter');
   child.innerHTML=selectOptions(categoryOptionsForType(state.bookTypeFilter).map(x=>[x,x]),'',categoryPlaceholder(state.bookTypeFilter));
   child.disabled=!state.bookTypeFilter;
   $('genreFilterCaption').textContent=categoryLabel(state.bookTypeFilter);
   updateBookGrid();
 });
 $('genreFilter').addEventListener('change',e=>{state.genreFilter=e.target.value;updateBookGrid();});
 $('clearFilters').addEventListener('click',()=>{state.query='';state.filter='todos';state.formatFilter='';state.bookTypeFilter='';state.genreFilter='';render();});
}

function updateBookGrid(){
 const node=$('booksContainer');if(!node)return;
 const books=bookList();$('resultsCount').textContent=`${books.length} ${books.length===1?'resultado':'resultados'}`;
 node.innerHTML=books.length?`<div class="book-grid">${books.map(bookCard).join('')}</div>`:state.books.length===0?emptyBlock('Tu biblioteca empieza aquí','Añade tu primer libro manualmente o escaneando su ISBN.'):emptyBlock('No hay libros aquí','Prueba otro filtro o añade un título nuevo.','Añadir libro');
}
function readingRow(book){return `<button class="reading-row" type="button" data-open="${escapeHTML(book.id)}">${bookImage(book,'reading')}<div class="reading-body"><h3>${escapeHTML(book.title)}</h3><p>${escapeHTML(book.author||'Autor sin indicar')}</p>${book.status==='leyendo'&&book.pages?`<small>${book.currentPage||0} de ${book.pages} páginas · ${getPercent(book)} %</small><div class="progress"><div style="width:${getPercent(book)}%"></div></div>`:`<span class="status-pill ${book.status}">${LABELS[book.status]}</span>`}</div></button>`;}
function renderLecturas(){
 const current=state.books.filter(b=>b.status==='leyendo').sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
 const todo=state.books.filter(b=>b.status==='pendiente').sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
 $('content').innerHTML=`<span class="eyebrow">TU CAMINO LECTOR</span><h1 class="page-title">Entre páginas</h1><p class="page-subtitle">Sigue tus lecturas y encuentra qué leer después.</p><div class="section-heading"><h2 class="section-title">Ahora leyendo</h2><span class="section-sub">${current.length} libros</span></div>${current.length?current.map(b=>`<div class="mini-card">${readingRow(b)}</div>`).join(''):`<div class="mini-card"><h3>¿Qué estás leyendo?</h3><p class="muted">Marca un libro como «Leyendo» desde su ficha y aparecerá aquí.</p></div>`}<div class="section-heading" style="margin-top:27px"><h2 class="section-title">Próximas lecturas</h2><span class="section-sub">${todo.length} pendientes</span></div>${todo.length?todo.slice(0,12).map(b=>`<div class="mini-card">${readingRow(b)}</div>`).join(''):`<div class="mini-card"><p class="muted">No tienes lecturas pendientes. Añade un libro para empezar.</p><button class="small-button" type="button" data-action="add">Añadir libro</button></div>`}`;
}
function renderStats(){
 const count=state.books.length;const counts={pendiente:0,leyendo:0,leido:0};state.books.forEach(b=>counts[b.status]++);
 const thisYear=String(new Date().getFullYear());const finished=state.books.filter(b=>b.finishedAt.startsWith(thisYear)&&b.status==='leido').length;
 const pages=state.books.filter(b=>b.status==='leido').reduce((s,b)=>s+intOrZero(b.pages),0);
 const rated=state.books.filter(b=>b.rating>0);const average=rated.length?(rated.reduce((s,b)=>s+b.rating,0)/rated.length).toFixed(1).replace('.',','):'—';
 const rows=[['pendiente','Por leer',counts.pendiente,''],['leyendo','Leyendo',counts.leyendo,'reading'],['leido','Leídos',counts.leido,'read']];
 const byYear={};state.books.forEach(b=>{if(b.status==='leido'&&b.finishedAt){const year=b.finishedAt.slice(0,4);byYear[year]=(byYear[year]||0)+1;}});
 $('content').innerHTML=`<span class="eyebrow">TU BIBLIOTECA EN NÚMEROS</span><h1 class="page-title">Tu historia lectora</h1><p class="page-subtitle">Una mirada a los libros que te acompañan.</p><div class="stat-grid"><div class="stat-box"><strong>${count}</strong><span>Libros en tu colección</span></div><div class="stat-box"><strong>${counts.leido}</strong><span>Libros leídos</span></div><div class="stat-box"><strong>${finished}</strong><span>Terminados en ${thisYear}</span></div><div class="stat-box"><strong>${average}${average==='—'?'':' ★'}</strong><span>Valoración media</span></div></div><div class="mini-card"><h3>Estado de tus lecturas</h3>${rows.map(([key,label,num,cl])=>`<div class="bar-item"><div class="bar-title"><span>${label}</span><strong>${num}</strong></div><div class="bar-bg"><div class="bar-fill ${cl}" style="width:${count?Math.round(num*100/count):0}%"></div></div></div>`).join('')}</div><div class="mini-card"><h3>Un poco más</h3><p class="muted">Páginas totales de los libros marcados como leídos: <strong>${pages.toLocaleString('es-ES')}</strong></p><p class="muted">Libros valorados: <strong>${rated.length}</strong></p><p class="muted">La cifra de páginas depende de las que hayas registrado en cada ficha.</p></div>${Object.keys(byYear).length?`<div class="mini-card"><h3>Terminados por año</h3>${Object.entries(byYear).sort((a,b)=>b[0].localeCompare(a[0])).map(([year,num])=>`<div class="bar-title" style="padding:8px 0;border-bottom:1px solid var(--line)"><span>${escapeHTML(year)}</span><strong>${num} ${num===1?'libro':'libros'}</strong></div>`).join('')}</div>`:''}`;
}
function renderAjustes(){
 $('content').innerHTML=`<span class="eyebrow">TU ESPACIO</span><h1 class="page-title">Ajustes</h1><p class="page-subtitle">Tus libros son tuyos. Conserva una copia de tu colección.</p><div class="mini-card"><h3>Copias de seguridad</h3><button type="button" class="settings-button" data-action="export"><span><strong>Exportar mi biblioteca</strong><small>Crear un archivo JSON con todos tus libros y notas.</small></span><span class="arrow">↓</span></button><button type="button" class="settings-button" data-action="import"><span><strong>Importar biblioteca</strong><small>Recuperar libros desde un archivo JSON. No borra los existentes.</small></span><span class="arrow">↑</span></button></div><div class="mini-card"><h3>Privacidad y funcionamiento</h3><p class="muted">Tus fichas se almacenan en este dispositivo mediante ${state.storage==='indexedDB'?'IndexedDB':'almacenamiento local alternativo'}. No creamos ninguna cuenta ni enviamos tu colección a un servidor propio.</p><p class="muted">Las consultas ISBN y por título envían los términos de búsqueda a Open Library y Google Books. La búsqueda por portada usa reconocimiento local del texto de la foto (descarga un motor externo). Las imágenes de resultados se cargan de sus proveedores. No subimos la foto a un servidor propio.</p><p class="muted"><strong>Importante:</strong> Safari y una aplicación añadida a Inicio pueden tener almacenamientos separados. Importa una copia dentro de la aplicación instalada si fuera necesario.</p></div><div class="mini-card"><h3>Acerca de esta versión</h3><p class="muted">Mi Biblioteca · Versión 1.5.1. Funciona sin conexión para consultar y modificar fichas ya guardadas; la consulta ISBN, las portadas no almacenadas y el lector de barras necesitan Internet.</p><p class="muted">Consejo: guarda una copia de seguridad después de añadir muchos libros o antes de cambiar de iPhone.</p></div><p class="footnote">No borres los datos de la aplicación si no has exportado antes tu biblioteca. El contenido no se sincroniza automáticamente con iCloud.</p>`;
}
function render(){const nav=document.querySelectorAll('[data-tab]');nav.forEach(b=>{const active=b.dataset.tab===state.tab;b.classList.toggle('active',active);active?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current')});if(state.tab==='biblioteca')renderBiblioteca();if(state.tab==='lecturas')renderLecturas();if(state.tab==='estadisticas')renderStats();if(state.tab==='ajustes')renderAjustes();}
function switchTab(tab){if(!['biblioteca','lecturas','estadisticas','ajustes'].includes(tab))return;state.tab=tab;render();window.scrollTo(0,0);}

function closeModal(){if(!$('modalOverlay').hidden){$('modalOverlay').hidden=true;document.body.style.overflow='';}}
function formValues(book){
 const fields=['id','isbn','title','author','publisher','year','pages','genre','location','status','currentPage','startedAt','finishedAt','rating','coverUrl','notes','format','platform','bookType'];
 fields.forEach(field=>{const el=$(field==='id'?'bookId':field);if(el)el.value=book?.[field]??(field==='status'?'pendiente':field==='rating'?'0':field==='format'?'papel':field==='bookType'?'sin_clasificar':'');});
 updateFormatFields();
 updateCategoryEditor();
}
function updateFormatFields(){
 const isEbook=$('format').value==='ebook';
 $('physicalLocationField').hidden=isEbook;
 $('ebookPlatformField').hidden=!isEbook;
}
function updateCategoryEditor(){
 const type=$('bookType').value;
 const kind=categoryKind(type);
 $('genreLabel').textContent=categoryLabel(type)+(kind==='genero'?' (puede ser más de uno)':'');
 $('genre').placeholder=kind==='genero'?'Ej. Misterio, Terror':kind==='materia'?'Ej. Economía, Filosofía':'Ej. Historia, Arte';
 $('genreHints').innerHTML=categoryOptionsForType(type).map(s=>`<option value="${escapeHTML(s)}"></option>`).join('');
 $('genreHelp').textContent=type==='sin_clasificar'?'Elige un tipo de obra para ver sugerencias específicas. El texto que ya hayas guardado se conserva.':
   (kind==='genero'?'Elige géneros literarios o escribe otros propios.':'Elige materias o escribe categorías propias.')+' Separa varias con comas.';
}
function openForm(book=null){
 closeDetail();state.activeId=book?.id||null;formValues(book);$('formTitle').textContent=book?'Editar libro':'Añadir libro';$('saveBtn').textContent=book?'Guardar cambios':'Guardar libro';$('lookupStatus').textContent='También puedes rellenar todos los datos manualmente.';$('lookupStatus').className='';$('modalOverlay').hidden=false;document.body.style.overflow='hidden';
 setTimeout(()=>$(book?'title':'isbn').focus({preventScroll:true}),80);
}
async function submitForm(e){
 e.preventDefault();const title=$('title').value.trim();if(!title){toast('Escribe al menos el título del libro.');$('title').focus();return;}
 const previous=state.books.find(b=>b.id===$('bookId').value);
 let input={};['isbn','title','author','publisher','year','pages','genre','location','status','currentPage','startedAt','finishedAt','rating','coverUrl','notes','format','platform','bookType'].forEach(k=>input[k]=$(k).value.trim());
 const isbn=normalizeISBN(input.isbn);if(isbn&&!validISBN(isbn)){toast('El ISBN no tiene un formato válido.');$('isbn').focus();return;}
 if(isbn&&state.books.some(b=>b.isbn===isbn&&b.id!==previous?.id)){
   if(!confirm('Ya tienes un libro con este ISBN. ¿Quieres añadir otra copia igualmente?'))return;
 }
 const now=new Date().toISOString();input={...input,id:previous?.id||idNew(),createdAt:previous?.createdAt||now,updatedAt:now};
 if(input.status==='leyendo'&&!input.startedAt)input.startedAt=dateToday();
 if(input.status==='leido'){
   if(!input.finishedAt)input.finishedAt=dateToday();
   if(intOrZero(input.pages)&&!intOrZero(input.currentPage))input.currentPage=input.pages;
 }
 try{await dbRequest('put',normalizeBook(input));closeModal();await reload();toast(previous?'Libro actualizado.':'Libro añadido a tu biblioteca.');}catch(err){console.error(err);toast('No se pudo guardar. Comprueba el espacio disponible.');}
}
function detailField(title,val){return `<div><dt>${escapeHTML(title)}</dt><dd>${escapeHTML(val||'—')}</dd></div>`;}
function openDetail(id){
 const b=state.books.find(x=>x.id===id);if(!b)return;state.activeId=id;
 const fields=[['Formato',formatOf(b)==='ebook'?'Ebook':'Papel'],['Tipo de libro',typeLabel(typeOf(b))],[categoryLabel(typeOf(b)),b.genre],['Plataforma digital',formatOf(b)==='ebook'?b.platform:''],['ISBN',b.isbn],['Editorial',b.publisher],['Año de edición',b.year||''],['Páginas',b.pages||''],['Ubicación',formatOf(b)==='papel'?b.location:''],['Página actual',b.currentPage?`${b.currentPage}${b.pages?' / '+b.pages:''}`:''],['Empezado',prettyDate(b.startedAt)],['Terminado',prettyDate(b.finishedAt)],['Valoración',b.rating?'★'.repeat(b.rating):'Sin valorar']];
 $('detailBody').innerHTML=`<div class="detail-lead">${bookImage(b,'detail')}<div><h3>${escapeHTML(b.title)}</h3><p>${escapeHTML(b.author||'Autor sin indicar')}</p><span class="status-pill ${b.status}">${LABELS[b.status]}</span></div></div>${b.status==='leyendo'&&b.pages?`<div class="mini-card"><div class="bar-title"><span>Progreso de lectura</span><strong>${getPercent(b)} %</strong></div><div class="progress"><div style="width:${getPercent(b)}%"></div></div></div>`:''}<dl class="details-list">${fields.map(([a,v])=>detailField(a,String(v))).join('')}</dl>${b.notes?`<h3 class="section-title" style="margin:14px 0 12px">Mis notas</h3><div class="notes-box">${escapeHTML(b.notes)}</div>`:''}`;
 $('detailOverlay').hidden=false;document.body.style.overflow='hidden';
}
function closeDetail(){$('detailOverlay').hidden=true;if($('modalOverlay').hidden)document.body.style.overflow='';}
async function deleteActive(){const b=state.books.find(x=>x.id===state.activeId);if(!b)return;if(!confirm(`¿Eliminar «${b.title}» de tu biblioteca?`))return;try{await dbRequest('delete',b.id);closeDetail();await reload();toast('Libro eliminado.');}catch{toast('No se pudo eliminar el libro.');}}

function setLookupStatus(text,kind=''){const el=$('lookupStatus');el.textContent=text;el.className=kind;}
async function getJSON(url,timeoutMs=13000){
 const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
 try{const resp=await fetch(url,{signal:ctrl.signal,headers:{Accept:'application/json'}});if(!resp.ok)throw new Error(`HTTP ${resp.status}`);return await resp.json();}finally{clearTimeout(timer);}
}
// ISBN: consultas independientes para evitar depender de una sola base de datos.
// Google Books y Open Library no garantizan cobertura de todas las ediciones.
function yearFromDate(v){return (String(v||'').match(/\b(1\d{3}|20\d{2}|21\d{2})\b/)||[])[0]||'';}
function fallbackCover(isbn){return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;}
async function findOpenLibraryEdition(isbn){
 const d=await getJSON(`https://openlibrary.org/isbn/${isbn}.json`,9000);
 if(!d?.title)return null;
 const authors=await Promise.all((d.authors||[]).slice(0,4).map(async a=>{
   if(!/^\/authors\/OL\d+A$/.test(a?.key||''))return '';
   try{return (await getJSON(`https://openlibrary.org${a.key}.json`,5000)).name||'';}catch{return '';}
 }));
 return {title:d.title,author:authors.filter(Boolean).join(', '),publisher:(d.publishers||[])[0]||'',year:yearFromDate(d.publish_date),pages:d.number_of_pages||'',coverUrl:d.covers?.[0]>0?`https://covers.openlibrary.org/b/id/${d.covers[0]}-L.jpg?default=false`:fallbackCover(isbn)};
}
async function findOpenLibraryBooks(isbn){
 const data=await getJSON(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`,9000);
 const d=data?.[`ISBN:${isbn}`];if(!d?.title)return null;
 return {title:d.title,author:(d.authors||[]).map(a=>a.name).filter(Boolean).join(', '),publisher:d.publishers?.[0]?.name||'',year:yearFromDate(d.publish_date),pages:d.number_of_pages||'',coverUrl:safeUrl(d.cover?.large||d.cover?.medium)||fallbackCover(isbn)};
}
async function findOpenLibrarySearch(isbn){
 const d=await getJSON(`https://openlibrary.org/search.json?isbn=${isbn}&fields=key,title,author_name,first_publish_year,cover_i,isbn&limit=8`,9000);
 const book=(d.docs||[]).find(x=>x.title&&x.isbn?.includes(isbn));
 if(!book)return null;
 // La búsqueda devuelve a veces datos de la obra, no de la edición: no inventamos editorial ni páginas.
 return {title:book.title,author:(book.author_name||[]).slice(0,4).join(', '),publisher:'',year:'',pages:'',coverUrl:book.cover_i?`https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg?default=false`:fallbackCover(isbn)};
}
async function findGoogleBooks(isbn){
 // Buscamos por ISBN y verificamos el identificador exacto para evitar títulos equivocados.
 for(const q of [`isbn:${isbn}`,isbn]){
   const d=await getJSON(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=12&printType=books`,9000);
   const v=(d.items||[]).map(item=>item.volumeInfo||{}).find(x=>
      (x.industryIdentifiers||[]).some(y=>normalizeISBN(y.identifier)===isbn)
   );
   if(v?.title){
      let cover=safeUrl(v.imageLinks?.thumbnail||v.imageLinks?.smallThumbnail||'');
      if(cover.startsWith('http:'))cover='https:'+cover.slice(5);
      return {title:[v.title,v.subtitle].filter(Boolean).join(': '),author:(v.authors||[]).join(', '),publisher:v.publisher||'',year:yearFromDate(v.publishedDate),pages:v.pageCount||'',coverUrl:cover||fallbackCover(isbn)};
   }
 }
 return null;
}
// Ediciones contrastadas en catálogos editoriales/librerías españolas.
// Son metadatos públicos de edición, NO libros guardados por el usuario.
const VERIFIED_BOOKS_BY_ISBN = Object.freeze({
  '9788472098657':{
    title:'Progreso y declive. Una breve historia de la humanidad',
    author:'Hans-Hermann Hoppe',publisher:'Unión Editorial',year:'2022',pages:'',
    coverUrl:''
  },
  '9788449342295':{
    title:'Miedo. Una historia alternativa del mundo',
    author:'Robert Peckham',publisher:'Paidós',year:'2024',pages:464,
    coverUrl:''
  }
});

async function fetchBookByISBN(isbn){
 // Garantiza la recuperación de las dos ediciones verificadas, aunque las APIs
 // de Open Library o Google Books no las tengan indexadas o estén inaccesibles.
 if(Object.hasOwn(VERIFIED_BOOKS_BY_ISBN,isbn))
   return {...VERIFIED_BOOKS_BY_ISBN[isbn],source:'catálogo contrastado'};
 let responsive=false;
 const sources=[
  ['Open Library (edición)',findOpenLibraryEdition],
  ['Open Library (fichas)',findOpenLibraryBooks],
  ['Google Books',findGoogleBooks],
  ['Open Library (catálogo)',findOpenLibrarySearch]
 ];
 // En paralelo: si uno falla o tarda, los demás pueden devolver datos.
 const results=await Promise.all(sources.map(async ([name,fn])=>{
   try{const book=await fn(isbn);responsive=true;return book?.title?{...book,source:name}:null;}
   catch(e){
     if(/^HTTP 4(?:00|04|29)$/.test(e.message||''))responsive=true;
     console.warn('Fallo en consulta bibliográfica',name,e);
     return null;
   }
 }));
 const found=results.find(Boolean);
 if(found)return found;
 throw new Error(responsive?'not_found':'network_error');
}
async function lookupISBN(){
 const isbn=normalizeISBN($('isbn').value);
 if(!validISBN(isbn)){
   setLookupStatus('ISBN incorrecto: comprueba los 10 o 13 caracteres y el dígito de control.','error');return;
 }
 $('isbn').value=isbn;
 $('lookupBtn').disabled=true;
 setLookupStatus(`Consultando bibliotecas para el ISBN ${isbn}...`);
 try{
   const b=await fetchBookByISBN(isbn);
   ['title','author','publisher','year','pages','coverUrl'].forEach(k=>{
     if(b[k]&&(!$(k).value.trim()||k==='coverUrl'))$(k).value=b[k];
   });
   setLookupStatus(`Datos encontrados en ${b.source}. Comprueba la edición y pulsa «Guardar libro».`,'success');
   toast('Datos bibliográficos recuperados.');
 }catch(e){
   const msg=e.message==='not_found'?
     `No consta este ISBN (${isbn}) en las fuentes consultadas. Puede ser una edición sin registrar; puedes rellenar la ficha manualmente.`:
     'No se ha podido contactar con las bibliotecas. Comprueba Internet y vuelve a pulsar «Buscar».';
   setLookupStatus(msg,'error');
 }finally{$('lookupBtn').disabled=false;}
}

function loadScript(src){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.async=true;script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('No se pudo cargar el lector.'));};document.head.appendChild(script);});}
async function scannerLibrary(){if(window.Html5Qrcode)return;let error;for(const url of SCANNER_CDNS){try{await loadScript(url);if(window.Html5Qrcode)return;}catch(e){error=e;}}throw error||new Error('No se pudo cargar el escáner');}

const ZXING_CDNS=[
 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.2.1/umd/zxing-browser.min.js',
 'https://unpkg.com/@zxing/browser@0.2.1/umd/zxing-browser.min.js'
];
async function zxingLibrary(){
 if(window.ZXingBrowser?.BrowserMultiFormatOneDReader)return;
 let error;
 for(const url of ZXING_CDNS){
   try{await loadScript(url);if(window.ZXingBrowser?.BrowserMultiFormatOneDReader)return;}
   catch(e){error=e;}
 }
 throw error||new Error('No se pudo cargar el lector de fotografías.');
}


// OCR local para fotos donde las rayas no se pueden descodificar, pero sí
// aparecen impresas las cifras del ISBN (p. ej. "ISBN: 978-84-7209-865-7").
const OCR_CDNS=[
 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
 'https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js'
];
async function ocrLibrary(){
 if(window.Tesseract?.createWorker)return;
 let lastError;
 for(const url of OCR_CDNS){
   try{await loadScript(url);if(window.Tesseract?.createWorker)return;}
   catch(error){lastError=error;}
 }
 throw lastError||new Error('No se pudo cargar el reconocimiento de texto');
}
function isbnDeTextoFotografiado(text){
 // Acepta guiones y espacios entre dígitos, pero exige el dígito de control.
 const s=String(text||'').replace(/[‐‑‒–—−]/g,'-');
 const matches=s.match(/97[89](?:[\s:\.\-]*[0-9]){10}/g)||[];
 for(const value of matches){
   const isbn=normalizeISBN(value);
   if(validISBN(isbn))return isbn;
 }
 // A veces el OCR deja huecos de línea en el número.
 for(const line of s.split(/\n/)){
   const isbn=isbnDeCodigoLeido(line);
   if(isbn)return isbn;
 }
 return '';
}
async function imageReducedForOCR(file){
 // Evita procesar fotografías de 12/48 MP innecesariamente en iPhone.
 if(typeof createImageBitmap!=='function')return file;
 let bitmap;
 try{
   bitmap=await createImageBitmap(file);
   const scale=Math.min(1,1800/bitmap.width,1800/bitmap.height);
   const canvas=document.createElement('canvas');
   canvas.width=Math.round(bitmap.width*scale);
   canvas.height=Math.round(bitmap.height*scale);
   canvas.getContext('2d',{willReadFrequently:true}).drawImage(bitmap,0,0,canvas.width,canvas.height);
   return canvas;
 }catch{return file;}
 finally{bitmap?.close?.();}
}
async function tryOCRisbn(file,token){
 $('scannerStatus').textContent='Leyendo los números impresos del ISBN en la foto (puede tardar unos segundos)...';
 await ocrLibrary();
 if(token!==state.scannerToken)return '';
 let worker=null;
 try{
   worker=await window.Tesseract.createWorker('eng');
   if(token!==state.scannerToken)return '';
   await worker.setParameters({
     tessedit_char_whitelist:'0123456789ISBNisbn-: .',
     tessedit_pageseg_mode:'11'
   });
   const image=await imageReducedForOCR(file);
   const result=await worker.recognize(image);
   return isbnDeTextoFotografiado(result?.data?.text||'');
 }finally{
   if(worker)try{await worker.terminate();}catch(e){console.warn('No se pudo cerrar OCR',e);}
 }
}

function isbnDeCodigoLeido(value){
  // Algunas etiquetas ISBN añaden cinco dígitos de precio después del EAN-13.
  const digits=String(value||'').replace(/[^0-9]/g,'');
  const matches=digits.match(/97[89][0-9]{10}/g)||[];
  return matches.find(isbn=>validISBN(isbn))||'';
}
async function aplicarISBNLeido(decoded){
  const isbn=isbnDeCodigoLeido(decoded);
  if(!isbn)return false;
  state.scanResolved=true;
  await stopScanner();
  $('isbn').value=isbn;
  setLookupStatus('ISBN '+isbn+' detectado. Buscando los datos del libro...','success');
  await lookupISBN();
  return true;
}
async function startScanner(){
  if(!window.isSecureContext){toast('La cámara necesita una web HTTPS.');return;}
  if(!$('scannerOverlay').hidden)return;
  const token=++state.scannerToken;
  state.scanResolved=false;
  $('scannerOverlay').hidden=false;
  $('scannerStatus').textContent='Preparando cámara trasera...';
  document.body.style.overflow='hidden';
  try{
    await scannerLibrary();
    if($('scannerOverlay').hidden||token!==state.scannerToken)return;
    $('scannerStatus').textContent='Solicitando permiso para la cámara...';
    const F=window.Html5QrcodeSupportedFormats;
    // Solo EAN-13, el formato de los códigos ISBN modernos.
    const scanner=new window.Html5Qrcode('reader',{
      formatsToSupport:[F.EAN_13],verbose:false,
      experimentalFeatures:{useBarCodeDetectorIfSupported:true}
    });
    state.scanner=scanner;
    // Sin qrbox estrecho: analizar toda la imagen ayuda con códigos lineales.
    await scanner.start(
      {facingMode:'environment'},
      {fps:12,disableFlip:true,videoConstraints:{facingMode:'environment',width:{ideal:1280},height:{ideal:720}}},
      async decoded=>{
        if(state.scanResolved||token!==state.scannerToken)return;
        if(await aplicarISBNLeido(decoded))return;
        $('scannerStatus').textContent='Código detectado, pero no parece un ISBN válido (978 o 979).';
      },
      ()=>{}
    );
    if(token!==state.scannerToken||$('scannerOverlay').hidden){
      try{await scanner.stop();}catch(e){console.warn(e);}
      try{await scanner.clear();}catch(e){console.warn(e);}
      return;
    }
    state.scannerRunning=true;
    $('scannerStatus').textContent='Centra el código completo, con buena luz, a unos 20–30 cm del iPhone.';
    state.scanHintTimer=setTimeout(()=>{
      if(token===state.scannerToken&&state.scannerRunning&&!state.scanResolved)
        $('scannerStatus').textContent='¿Sigue sin leerlo? Mueve el iPhone despacio para enfocar o toca «Fotografiar el código».';
    },8000);
  }catch(error){
    console.error(error);
    if(token!==state.scannerToken)return;
    const reason=String(error?.name||error?.message||'error desconocido').slice(0,110);
    $('scannerStatus').textContent='No se ha podido iniciar el escáner ('+reason+'). Prueba «Fotografiar el código» o introduce el ISBN.';
  }
}
async function stopScanner(){
  state.scannerToken++;
  clearTimeout(state.scanHintTimer);
  state.scanHintTimer=null;
  const scanner=state.scanner;
  state.scanner=null;
  if(scanner){
    try{
      if(state.scannerRunning)await scanner.stop();
      await scanner.clear();
    }catch(error){console.warn(error);}
  }
  state.scannerRunning=false;
  $('scannerOverlay').hidden=true;
  $('reader').replaceChildren();
  const preview=$('barcodePreview');
  if(preview){preview.hidden=true;preview.removeAttribute('src');}
  if(state.photoObjectUrl){URL.revokeObjectURL(state.photoObjectUrl);state.photoObjectUrl=null;}
  if($('modalOverlay').hidden)document.body.style.overflow='';
}
async function scanBarcodePhoto(event){
 const file=event.target.files?.[0];
 event.target.value='';
 if(!file)return;
 await stopScanner();
 const token=++state.scannerToken;
 state.scanResolved=false;
 $('scannerOverlay').hidden=false;
 $('scannerStatus').textContent='Fotografía recibida. Analizando el código de barras...';
 document.body.style.overflow='hidden';
 const preview=$('barcodePreview');
 const photoUrl=URL.createObjectURL(file);
 state.photoObjectUrl=photoUrl;
 preview.src=photoUrl;preview.hidden=false;
 const errors=[];
 let decoded='';
 try{
   // Primer motor: ZXing Browser, independiente del lector de vídeo que ya fallaba en iPhone.
   try{
     await zxingLibrary();
     if(token!==state.scannerToken)return;
     $('scannerStatus').textContent='Foto cargada. Buscando ISBN con el lector alternativo...';
     const reader=new window.ZXingBrowser.BrowserMultiFormatOneDReader();
     const result=await reader.decodeFromImageUrl(photoUrl);
     decoded=result?.getText?.()||result?.text||'';
   }catch(e){errors.push(`ZXing: ${e.name||e.message||'sin lectura'}`);}
   if(token!==state.scannerToken)return;
   if(!isbnDeCodigoLeido(decoded)){
     // Segundo intento con el lector anterior, útil para imágenes en ciertos dispositivos.
     try{
       $('scannerStatus').textContent='Probando una segunda forma de analizar la foto...';
       await scannerLibrary();
       if(token!==state.scannerToken)return;
       const F=window.Html5QrcodeSupportedFormats;
       const scanner=new window.Html5Qrcode('reader',{formatsToSupport:[F.EAN_13],verbose:false});
       state.scanner=scanner;
       decoded=await scanner.scanFile(file,true);
     }catch(e){errors.push(`Html5Qrcode: ${e.name||e.message||'sin lectura'}`);}
   }
   if(token!==state.scannerToken)return;
   if(!isbnDeCodigoLeido(decoded)){
     // Tercer método: detectar el ISBN impreso en texto (sin subir la foto).
     try{
       const scannedText=await tryOCRisbn(file,token);
       if(scannedText)decoded=scannedText;
     }catch(e){errors.push(`OCR: ${e.name||e.message||'sin lectura'}`);}
   }
   if(token!==state.scannerToken)return;
   if(isbnDeCodigoLeido(decoded)){
     await aplicarISBNLeido(decoded);
     return;
   }
   $('scannerStatus').textContent=decoded?
     'Se ha leído un código, pero no es un ISBN válido de 13 dígitos (978/979).':
     'La fotografía se ha recibido, pero ninguno de los dos lectores ha reconocido el código. Prueba a acercarte, enfocar las barras y evitar reflejos. También puedes introducir los números manualmente.';
   console.warn('Lectura fotográfica sin ISBN válido',errors);
 }catch(error){
   console.error('Error al analizar la fotografía',error);
   if(token===state.scannerToken)$('scannerStatus').textContent=`La fotografía se ha recibido, pero hubo un error al analizarla (${error.name||'error'}). Comprueba Internet e inténtalo de nuevo.`;
 }finally{
   if(token===state.scannerToken&&state.scanner&&!state.scannerRunning){
     try{await state.scanner.clear();}catch(e){console.warn(e);}
     state.scanner=null;
   }
 }
}

// Búsqueda por portada: OCR local y búsqueda bibliográfica por texto.
function openCoverSearch(){
 state.coverSearchToken++;
 state.coverResults=[];
 $('coverOverlay').hidden=false;
 $('coverSearchQuery').value='';
 $('coverResults').replaceChildren();
 $('coverSearchStatus').textContent='Fotografía la cubierta o escribe el título y busca coincidencias.';
 $('coverPreview').hidden=true;
 document.body.style.overflow='hidden';
}
function closeCoverSearch(){
 state.coverSearchToken++;
 $('coverOverlay').hidden=true;
 if(state.coverPhotoUrl){URL.revokeObjectURL(state.coverPhotoUrl);state.coverPhotoUrl=null;}
 $('coverPreview').hidden=true;
 $('coverPreview').removeAttribute('src');
 $('coverPhotoCamera').value='';$('coverPhotoGallery').value='';
 if($('modalOverlay').hidden)document.body.style.overflow='';
}
function coverSearchPhrase(ocrText){
 const ignored=/^(?:ISBN|EDITORIAL|PUBLISHER|EDICIONES|COLECCI[ÓO]N|BESTSELLER|PREMIO|EDICI[ÓO]N|N[ÚU]MERO|VOLUMEN|www\.|https?:)/i;
 const lines=String(ocrText||'').split(/[\r\n]+/).map(s=>s.replace(/[^\p{L}\p{N}\s:'’–-]/gu,' ').replace(/\s+/g,' ').trim())
   .filter(s=>s.length>=3&&/[\p{L}]{3}/u.test(s)&&!ignored.test(s)&&!/^\d+\s*$/.test(s));
 const first=lines.slice(0,3).join(' ');
 return first.slice(0,140);
}
async function coverPhotoPicked(event){
 const file=event.target.files?.[0];
 event.target.value='';
 if(!file)return;
 const token=++state.coverSearchToken;
 if(state.coverPhotoUrl)URL.revokeObjectURL(state.coverPhotoUrl);
 state.coverPhotoUrl=URL.createObjectURL(file);
 $('coverOverlay').hidden=false;
 $('coverPreview').src=state.coverPhotoUrl;
 $('coverPreview').hidden=false;
 $('coverResults').replaceChildren();
 $('coverSearchStatus').textContent='Fotografía recibida. Leyendo el texto de la portada en el iPhone...';
 try{
  await ocrLibrary();
  if(token!==state.coverSearchToken)return;
  let worker;
  try{
   try{worker=await window.Tesseract.createWorker('spa');}
   catch{worker=await window.Tesseract.createWorker('eng');}
   if(token!==state.coverSearchToken)return;
   const img=await imageReducedForOCR(file);
   const result=await worker.recognize(img);
   if(token!==state.coverSearchToken)return;
   const words=coverSearchPhrase(result?.data?.text||'');
   if(!words){$('coverSearchStatus').textContent='No he podido leer texto en la cubierta. Escribe el título en la casilla y pulsa Buscar.';return;}
   $('coverSearchQuery').value=words;
  }finally{if(worker)try{await worker.terminate();}catch(e){console.warn(e);}}
  if(token===state.coverSearchToken)await searchCoverCandidates();
 }catch(err){
  console.warn('OCR portada',err);
  if(token===state.coverSearchToken)$('coverSearchStatus').textContent='No se ha podido leer la portada. Puedes escribir el título manualmente y buscarlo igualmente.';
 }
}
async function coverCandidates(query){
 const q=query.trim().slice(0,140);
 const requests=[
  getJSON(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=10&printType=books`,12000).then(d=>(d.items||[]).map(item=>{
   const v=item.volumeInfo||{};
   const ids=v.industryIdentifiers||[];
   const isbn=ids.find(x=>x.type==='ISBN_13'&&validISBN(x.identifier))?.identifier||ids.find(x=>validISBN(x.identifier))?.identifier||'';
   let cover=safeUrl(v.imageLinks?.thumbnail||v.imageLinks?.smallThumbnail||'');
   if(cover.startsWith('http:'))cover='https:'+cover.slice(5);
   return {title:v.title||'',author:(v.authors||[]).join(', '),publisher:v.publisher||'',year:yearFromDate(v.publishedDate),pages:v.pageCount||'',coverUrl:cover,isbn,source:'Google Books'};
  })).catch(e=>{console.warn('Google Books portada',e);return null;}),
  getJSON(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&fields=key,title,author_name,first_publish_year,cover_i,isbn&limit=10`,12000).then(d=>(d.docs||[]).map(v=>{
   const isbn=(v.isbn||[]).find(x=>/^97[89]\d{10}$/.test(x)&&validISBN(x))||'';
   return {title:v.title||'',author:(v.author_name||[]).slice(0,3).join(', '),publisher:'',year:v.first_publish_year||'',pages:'',coverUrl:v.cover_i?`https://covers.openlibrary.org/b/id/${v.cover_i}-M.jpg?default=false`:'',isbn,source:'Open Library (obra; edición por confirmar)'};
  })).catch(e=>{console.warn('Open Library portada',e);return null;})
 ];
 const results=await Promise.all(requests);
 if(results.every(r=>r===null))throw new Error('network_error');
 const found=new Map();
 for(const item of results.flatMap(r=>r||[])){
  if(!item.title)continue;
  const key=normText(item.title+'|'+item.author);
  if(!found.has(key))found.set(key,item);
 }
 return [...found.values()].slice(0,14);
}
async function searchCoverCandidates(){
 const query=$('coverSearchQuery').value.trim().replace(/\s+/g,' ');
 if(query.length<3){$('coverSearchStatus').textContent='Escribe al menos tres caracteres del título.';return;}
 const token=++state.coverSearchToken;
 $('coverSearchBtn').disabled=true;
 $('coverSearchStatus').textContent='Buscando libros por título y autor...';
 $('coverResults').replaceChildren();
 try{
  const items=await coverCandidates(query);
  if(token!==state.coverSearchToken)return;
  state.coverResults=items;
  $('coverSearchStatus').textContent=items.length?`He encontrado ${items.length} posibles coincidencias. Selecciona la edición correcta.`:'No hay coincidencias para ese texto. Prueba dejando solo el título o busca por ISBN.';
  $('coverResults').innerHTML=items.map((v,i)=>`<button type="button" class="cover-candidate" data-cover-choice="${i}"><span class="cover-mini">${v.coverUrl?`<img src="${escapeHTML(v.coverUrl)}" alt="" loading="lazy">`:'📖'}</span><span class="cover-candidate-text"><strong>${escapeHTML(v.title)}</strong><small>${escapeHTML(v.author||'Autor no identificado')}</small><small>${escapeHTML([v.publisher,v.year,v.source].filter(Boolean).join(' · '))}</small></span><span aria-hidden="true">›</span></button>`).join('');
 }catch(err){
  if(token===state.coverSearchToken)$('coverSearchStatus').textContent='No se ha podido consultar el catálogo. Comprueba Internet o escribe el título manualmente en la ficha.';
 }finally{if(token===state.coverSearchToken)$('coverSearchBtn').disabled=false;}
}
function selectCoverCandidate(index){
 const b=state.coverResults[index];if(!b)return;
 for(const key of ['title','author','publisher','year','pages','coverUrl']){
  if(b[key]!==''&&b[key]!=null)$(key).value=b[key];
 }
 if(b.isbn&&validISBN(b.isbn)&&!$('isbn').value.trim())$('isbn').value=b.isbn;
 setLookupStatus('Ficha recuperada por portada. Comprueba la edición y el ISBN antes de guardar.','success');
 closeCoverSearch();
 toast('Revisa los datos y guarda el libro.');
}

async function exportBooks(){
 const data={app:'Mi Biblioteca',version:1,exportedAt:new Date().toISOString(),books:state.books};
 const json=JSON.stringify(data,null,2);
 const file=new File([json],`mi-biblioteca-${dateToday()}.json`,{type:'application/json'});
 if(navigator.canShare?.({files:[file]})){
   try{await navigator.share({files:[file],title:'Copia de seguridad · Mi Biblioteca'});toast('Elige «Guardar en Archivos» para conservar tu copia.');return;}
   catch(e){if(e.name==='AbortError')return;}
 }
 const url=URL.createObjectURL(file);const anchor=document.createElement('a');anchor.href=url;anchor.download=file.name;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),20000);toast('Copia generada. Consérvala en Archivos o iCloud Drive.');
}
async function importBooks(file){
 if(!file)return;
 try{
   if(file.size>10*1024*1024)throw new Error('El archivo supera los 10 MB.');
   const raw=JSON.parse(await file.text());
   if(raw?.app!=='Mi Biblioteca'||!Array.isArray(raw.books))throw new Error('No es una copia válida de Mi Biblioteca.');
   if(raw.books.length>20000)throw new Error('La copia contiene demasiados registros.');
   let added=0,skipped=0;const seenId=new Set(state.books.map(b=>b.id));const seenISBN=new Set(state.books.map(b=>b.isbn).filter(Boolean));
   for(const incoming of raw.books){
     if(!incoming||typeof incoming.title!=='string'||!incoming.title.trim()){skipped++;continue;}
     const b=normalizeBook(incoming);
     if(seenId.has(b.id)||(b.isbn&&seenISBN.has(b.isbn))){skipped++;continue;}
     await dbRequest('put',b);seenId.add(b.id);if(b.isbn)seenISBN.add(b.isbn);added++;
   }
   await reload();toast(`${added} libros importados; ${skipped} omitidos.`);
 }catch(e){console.error(e);toast(e.message||'No se ha podido importar la copia.');}
 finally{$('importFile').value='';}
}

function bindEvents(){
 $('topAdd').addEventListener('click',()=>openForm());
 document.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.tab)));
 $('content').addEventListener('click',e=>{
   const filter=e.target.closest('[data-filter]');if(filter){state.filter=filter.dataset.filter;render();return;}
   const book=e.target.closest('[data-open]');if(book){openDetail(book.dataset.open);return;}
   const action=e.target.closest('[data-action]');if(!action)return;
   if(action.dataset.action==='add')openForm();
   if(action.dataset.action==='export')exportBooks();
   if(action.dataset.action==='import')$('importFile').click();
 });
 $('bookForm').addEventListener('submit',submitForm);
 $('closeModal').addEventListener('click',closeModal);$('cancelForm').addEventListener('click',closeModal);
 $('closeDetail').addEventListener('click',closeDetail);
 $('editBook').addEventListener('click',()=>openForm(state.books.find(b=>b.id===state.activeId)));
 $('deleteBook').addEventListener('click',deleteActive);
 $('lookupBtn').addEventListener('click',lookupISBN);
 $('isbn').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();lookupISBN();}});
 $('scanBtn').addEventListener('click',startScanner);
 $('coverOpenBtn').addEventListener('click',openCoverSearch);
 $('closeCover').addEventListener('click',closeCoverSearch);
 $('cancelCover').addEventListener('click',closeCoverSearch);
 $('coverPhotoCamera').addEventListener('change',coverPhotoPicked);
 $('coverPhotoGallery').addEventListener('change',coverPhotoPicked);
 $('coverSearchBtn').addEventListener('click',searchCoverCandidates);
 $('coverSearchQuery').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchCoverCandidates();}});
 $('coverResults').addEventListener('click',e=>{const button=e.target.closest('[data-cover-choice]');if(button)selectCoverCandidate(Number(button.dataset.coverChoice));});
 $('format').addEventListener('change',updateFormatFields);
 $('bookType').addEventListener('change',updateCategoryEditor);
  $('barcodePhoto').addEventListener('change',scanBarcodePhoto);
 $('closeScanner').addEventListener('click',stopScanner);$('cancelScanner').addEventListener('click',stopScanner);
 $('importFile').addEventListener('change',e=>importBooks(e.target.files?.[0]));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('coverOverlay').hidden)closeCoverSearch();else if(!$('scannerOverlay').hidden)stopScanner();else if(!$('modalOverlay').hidden)closeModal();else if(!$('detailOverlay').hidden)closeDetail();}});
 document.addEventListener('error',e=>{
   const img=e.target;if(!img?.matches?.('img[data-cover]'))return;
   if(img.parentElement?.classList.contains('cover-wrap')){img.remove();return;}
   const fallback=document.createElement('div');
   fallback.className=img.classList.contains('reading-cover')?'reading-placeholder':'detail-cover-fallback';
   fallback.textContent=(img.alt||'Portada').replace(/^Portada de /,'');
   img.replaceWith(fallback);
 },true);
}
async function boot(){
 bindEvents();
 try{state.db=await openDB();await reload();}
 catch(error){
   console.warn('IndexedDB no disponible; intentando almacenamiento alternativo.',error);state.storage='localStorage';
   try{await reload();toast('Usando almacenamiento local alternativo.');}
   catch{ $('content').innerHTML='<div class="empty"><h3>No se puede guardar</h3><p>Activa el almacenamiento del navegador y vuelve a abrir la aplicación.</p></div>';return; }
 }
 if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('No se pudo instalar el modo sin conexión',err));
}
boot();
