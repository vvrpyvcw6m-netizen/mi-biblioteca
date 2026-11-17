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
const $ = (id) => document.getElementById(id);
const state = {books:[],tab:'biblioteca',filter:'todos',query:'',sort:'newest',db:null,storage:'indexedDB',activeId:null,scanner:null,scannerRunning:false,scanResolved:false,scannerToken:0,scanHintTimer:null,toastTimer:null};

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
 return `<div class="cover-wrap"><div class="cover-placeholder">${text}</div>${url?`<img data-cover src="${escapeHTML(url)}" alt="Portada de ${escapeHTML(book.title)}" loading="lazy">`:''}<span class="status-pill ${book.status}">${LABELS[book.status]}</span></div>`;
}
function bookCard(book){return `<button class="book-card" type="button" data-open="${escapeHTML(book.id)}" aria-label="Abrir ficha de ${escapeHTML(book.title)}">${bookImage(book)}<h3>${escapeHTML(book.title)}</h3><p class="author">${escapeHTML(book.author||'Autor sin indicar')}</p></button>`;}
function bookList(filter=state.filter){
 const q=state.query.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const list=state.books.filter(b=>{
   if(filter!=='todos'&&b.status!==filter)return false;
   const search=[b.title,b.author,b.isbn,b.genre,b.publisher,b.location].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
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
 $('content').innerHTML=`${hero()}<div class="section-heading"><h2 class="section-title">Tus libros</h2><span class="section-sub">${state.books.length} en total</span></div><div class="searchbar"><svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.7"/><path d="m16 16 5 5"/></svg><input id="searchInput" type="search" aria-label="Buscar libros" placeholder="Título, autor, ISBN, género..." value="${escapeHTML(state.query)}"></div><div class="chip-scroll" aria-label="Filtrar libros">${[['todos','Todos'],['pendiente','Por leer'],['leyendo','Leyendo'],['leido','Leídos']].map(([key,val])=>`<button class="chip ${state.filter===key?'selected':''}" type="button" data-filter="${key}" aria-pressed="${state.filter===key}">${val}</button>`).join('')}</div><div class="sort-row"><span id="resultsCount"></span><label>Ordenar: <select id="sortSelect"><option value="newest" ${state.sort==='newest'?'selected':''}>Más recientes</option><option value="title" ${state.sort==='title'?'selected':''}>Título A–Z</option><option value="author" ${state.sort==='author'?'selected':''}>Autor A–Z</option><option value="oldest" ${state.sort==='oldest'?'selected':''}>Más antiguos</option></select></label></div><div id="booksContainer"></div>`;
 updateBookGrid();
 $('searchInput').addEventListener('input',e=>{state.query=e.target.value;updateBookGrid()});
 $('sortSelect').addEventListener('change',e=>{state.sort=e.target.value;updateBookGrid()});
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
 $('content').innerHTML=`<span class="eyebrow">TU ESPACIO</span><h1 class="page-title">Ajustes</h1><p class="page-subtitle">Tus libros son tuyos. Conserva una copia de tu colección.</p><div class="mini-card"><h3>Copias de seguridad</h3><button type="button" class="settings-button" data-action="export"><span><strong>Exportar mi biblioteca</strong><small>Crear un archivo JSON con todos tus libros y notas.</small></span><span class="arrow">↓</span></button><button type="button" class="settings-button" data-action="import"><span><strong>Importar biblioteca</strong><small>Recuperar libros desde un archivo JSON. No borra los existentes.</small></span><span class="arrow">↑</span></button></div><div class="mini-card"><h3>Privacidad y funcionamiento</h3><p class="muted">Tus fichas se almacenan en este dispositivo mediante ${state.storage==='indexedDB'?'IndexedDB':'almacenamiento local alternativo'}. No creamos ninguna cuenta ni enviamos tu colección a un servidor propio.</p><p class="muted">La búsqueda por ISBN consulta Open Library. Las portadas se cargan de sus direcciones de origen. Para escanear códigos, se carga una biblioteca de lectura externa al activar la cámara.</p><p class="muted"><strong>Importante:</strong> Safari y una aplicación añadida a Inicio pueden tener almacenamientos separados. Importa una copia dentro de la aplicación instalada si fuera necesario.</p></div><div class="mini-card"><h3>Acerca de esta versión</h3><p class="muted">Mi Biblioteca · Versión 1.2. Funciona sin conexión para consultar y modificar fichas ya guardadas; la consulta ISBN, las portadas no almacenadas y el lector de barras necesitan Internet.</p><p class="muted">Consejo: guarda una copia de seguridad después de añadir muchos libros o antes de cambiar de iPhone.</p></div><p class="footnote">No borres los datos de la aplicación si no has exportado antes tu biblioteca. El contenido no se sincroniza automáticamente con iCloud.</p>`;
}
function render(){const nav=document.querySelectorAll('[data-tab]');nav.forEach(b=>{const active=b.dataset.tab===state.tab;b.classList.toggle('active',active);active?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current')});if(state.tab==='biblioteca')renderBiblioteca();if(state.tab==='lecturas')renderLecturas();if(state.tab==='estadisticas')renderStats();if(state.tab==='ajustes')renderAjustes();}
function switchTab(tab){if(!['biblioteca','lecturas','estadisticas','ajustes'].includes(tab))return;state.tab=tab;render();window.scrollTo(0,0);}

function closeModal(){if(!$('modalOverlay').hidden){$('modalOverlay').hidden=true;document.body.style.overflow='';}}
function formValues(book){
 const fields=['id','isbn','title','author','publisher','year','pages','genre','location','status','currentPage','startedAt','finishedAt','rating','coverUrl','notes'];
 fields.forEach(field=>{const el=$(field==='id'?'bookId':field);if(el)el.value=book?.[field]??(field==='status'?'pendiente':field==='rating'?'0':'');});
}
function openForm(book=null){
 closeDetail();state.activeId=book?.id||null;formValues(book);$('formTitle').textContent=book?'Editar libro':'Añadir libro';$('saveBtn').textContent=book?'Guardar cambios':'Guardar libro';$('lookupStatus').textContent='También puedes rellenar todos los datos manualmente.';$('lookupStatus').className='';$('modalOverlay').hidden=false;document.body.style.overflow='hidden';
 setTimeout(()=>$(book?'title':'isbn').focus({preventScroll:true}),80);
}
async function submitForm(e){
 e.preventDefault();const title=$('title').value.trim();if(!title){toast('Escribe al menos el título del libro.');$('title').focus();return;}
 const previous=state.books.find(b=>b.id===$('bookId').value);
 let input={};['isbn','title','author','publisher','year','pages','genre','location','status','currentPage','startedAt','finishedAt','rating','coverUrl','notes'].forEach(k=>input[k]=$(k).value.trim());
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
 const fields=[['ISBN',b.isbn],['Editorial',b.publisher],['Año de edición',b.year||''],['Páginas',b.pages||''],['Género / materia',b.genre],['Ubicación',b.location],['Página actual',b.currentPage?`${b.currentPage}${b.pages?' / '+b.pages:''}`:''],['Empezado',prettyDate(b.startedAt)],['Terminado',prettyDate(b.finishedAt)],['Valoración',b.rating?'★'.repeat(b.rating):'Sin valorar']];
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
async function fetchBookByISBN(isbn){
 let book=null;
 try{
   const data=await getJSON(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`);
   const authors=await Promise.all((data.authors||[]).slice(0,4).map(async a=>{
     if(!a.key||!/^\/authors\/OL\d+A$/.test(a.key))return '';
     try{return (await getJSON(`https://openlibrary.org${a.key}.json`,8500)).name||'';}catch{return '';}
   }));
   book={title:data.title||'',author:authors.filter(Boolean).join(', '),publisher:(data.publishers||[])[0]||'',year:(String(data.publish_date||'').match(/\b(1\d{3}|20\d{2}|21\d{2})\b/)||[])[0]||'',pages:data.number_of_pages||'',coverUrl:(data.covers||[]).length&&data.covers[0]>0?`https://covers.openlibrary.org/b/id/${data.covers[0]}-L.jpg?default=false`:`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`};
 }catch{ /* Algunas ediciones solo aparecen en la API de libros. */ }
 if(book?.title)return book;
 const result=await getJSON(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`);
 const data=result[`ISBN:${isbn}`];if(!data)throw new Error('not_found');
 return {title:data.title||'',author:(data.authors||[]).map(a=>a.name).filter(Boolean).join(', '),publisher:(data.publishers||[])[0]?.name||'',year:(String(data.publish_date||'').match(/\b(1\d{3}|20\d{2}|21\d{2})\b/)||[])[0]||'',pages:data.number_of_pages||'',coverUrl:safeUrl(data.cover?.large||data.cover?.medium||`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`)};
}
async function lookupISBN(){
 const isbn=normalizeISBN($('isbn').value);
 if(!validISBN(isbn)){setLookupStatus('Introduce un ISBN-10 o ISBN-13 válido, con todos sus dígitos.','error');return;}
 $('isbn').value=isbn;$('lookupBtn').disabled=true;setLookupStatus('Buscando datos del libro en Open Library...');
 try{
   const b=await fetchBookByISBN(isbn);
   ['title','author','publisher','year','pages','coverUrl'].forEach(k=>{if(b[k]&&(!$(k).value.trim()||k==='coverUrl'))$(k).value=b[k];});
   setLookupStatus('Datos encontrados. Revisa la edición y guarda el libro.','success');toast('Ficha recuperada por ISBN.');
 }catch(e){
   const msg=e.message==='not_found'?'No se ha encontrado este ISBN. Puedes introducir los datos a mano.':'No se han podido consultar los datos. Comprueba Internet o rellena la ficha manualmente.';
   setLookupStatus(msg,'error');
 }finally{$('lookupBtn').disabled=false;}
}

function loadScript(src){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.async=true;script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('No se pudo cargar el lector.'));};document.head.appendChild(script);});}
async function scannerLibrary(){if(window.Html5Qrcode)return;let error;for(const url of SCANNER_CDNS){try{await loadScript(url);if(window.Html5Qrcode)return;}catch(e){error=e;}}throw error||new Error('No se pudo cargar el escáner');}
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
  $('scannerStatus').textContent='Analizando la fotografía del código de barras...';
  document.body.style.overflow='hidden';
  try{
    await scannerLibrary();
    if(token!==state.scannerToken)return;
    const F=window.Html5QrcodeSupportedFormats;
    const scanner=new window.Html5Qrcode('reader',{formatsToSupport:[F.EAN_13],verbose:false});
    state.scanner=scanner;
    const decoded=await scanner.scanFile(file,true);
    if(token!==state.scannerToken)return;
    if(!await aplicarISBNLeido(decoded))
      $('scannerStatus').textContent='El código no parece un ISBN válido (978/979). Prueba otra foto.';
  }catch(error){
    console.warn('Fotografía no reconocida',error);
    if(token!==state.scannerToken)return;
    $('scannerStatus').textContent='No se distingue el ISBN. Haz la foto nítida, con buena luz, sin reflejos, y acerca la cámara al código.';
  }finally{
    if(token===state.scannerToken&&state.scanner&&!state.scannerRunning){
      try{await state.scanner.clear();}catch(error){console.warn(error);}
      state.scanner=null;
    }
  }
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
  $('barcodePhoto').addEventListener('change',scanBarcodePhoto);
 $('closeScanner').addEventListener('click',stopScanner);$('cancelScanner').addEventListener('click',stopScanner);
 $('importFile').addEventListener('change',e=>importBooks(e.target.files?.[0]));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('scannerOverlay').hidden)stopScanner();else if(!$('modalOverlay').hidden)closeModal();else if(!$('detailOverlay').hidden)closeDetail();}});
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
