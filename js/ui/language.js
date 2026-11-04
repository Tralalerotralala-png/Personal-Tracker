// Interface language: Spanish uses Mexican vocabulary. No external translation service.
export const language = () => localStorage.getItem('tracker-language') === 'es' ? 'es' : 'en';
export const locale = () => language() === 'es' ? 'es-MX' : 'en-US';
const pairs = [
 ['Dream Diary','Diario de sueños'],['Dreams','Sueños'],['Generate 16×16 icon','Generar icono de 16×16'],['General','General'],['Overview & weather','Inicio y clima'],['Appearance','Apariencia'],['Data & tools','Datos y herramientas'],['Overview','Inicio'],['Pack','Mochila'],['Mud','Lodo'],['Calendar','Calendario'],['Feed','Noticias'],
 ['Settings','Configuración'],['Edit layout','Editar diseño'],['Weather','Clima'],['Current conditions','Condiciones actuales'],
 ['Daily forecast','Pronóstico diario'],['Next six days','Próximos seis días'],['Feels like','Sensación térmica'],
 ['Humidity','Humedad'],['Wind','Viento'],['Rain today','Lluvia de hoy'],['Today','Hoy'],['Tomorrow','Mañana'],
 ['Sunny','Soleado'],['Clear sky','Cielo despejado'],['Partly cloudy','Parcialmente nublado'],
 ['Cloudy','Nublado'],['Overcast','Cubierto'],['Light rain','Lluvia ligera'],['Rain','Lluvia'],
 ['Snow','Nieve'],['Thunderstorm','Tormenta eléctrica'],['Fog','Niebla'],['Storms','Tormentas'],
 ['Mud forecast','Pronóstico de lodo'],['MUD OUTLOOK','PRONÓSTICO DE LODO'],['LOCAL TIME','HORA LOCAL'],
 ['Change place','Cambiar lugar'],['Choose a place','Elegir lugar'],['Refresh','Actualizar'],
 ['Items','Objetos'],['Places','Lugares'],['Add an item','Agregar objeto'],['Add item','Agregar objeto'],
 ['Clear filters','Borrar filtros'],['No items match these filters.','Ningún objeto coincide con estos filtros.'],
 ['Your pack is empty. Add your first item, then note where it lives.','Tu mochila está vacía. Agrega un objeto y anota dónde está.'],
 ['Where is it? Type an item name','¿Dónde está? Escribe el nombre del objeto'],
 ['Grid view','Vista de cuadrícula'],['List view','Vista de lista'],['Sync now','Sincronizar ahora'],
 ['Account and sync','Cuenta y sincronización'],['Sign out','Cerrar sesión'],['Mud forecast','Pronóstico de lodo'],
 ['Overview clocks','Relojes de inicio'],['Save clocks','Guardar relojes'],['Layout','Diseño'],
 ['Wallpaper','Fondo de pantalla'],['Wallpaper access','Acceso al fondo de pantalla'],
 ['Rarity tiers','Niveles de rareza'],['Navigation order','Orden de navegación'],
 ['Typography','Tipografía'],['Backup','Respaldo'],['Download backup','Descargar respaldo'],
 ['Install on your phone','Instalar en tu teléfono'],['Language','Idioma'],
 ['English','English'],['Español','Español'],['Save','Guardar'],['Cancel','Cancelar'],
 ['Add','Agregar'],['Delete','Eliminar'],['Search','Buscar'],['Close','Cerrar'],
 ['Synced','Sincronizado'],['Syncing','Sincronizando'],['Offline','Sin conexión'],['Ready','Listo'],
 ['Coming up','Próximos eventos'],['Headlines','Titulares'],['Pack stats','Estadísticas'],
 ['Clock and date','Reloj y fecha'],['Loot and lost quests','Hallazgos y objetos perdidos'],
 ['Good morning','Buenos días'],['Good afternoon','Buenas tardes'],['Good evening','Buenas noches'],
 ['Your dashboard at a glance','Tu resumen del día'],['Nothing planned this week.','No hay eventos esta semana.'],
 ['No items yet. Add some in the Pack tab.','Aún no hay objetos. Agrega algunos en Mochila.'],
 ['No feed sources yet. Add one in the Feed tab.','Aún no hay fuentes. Agrégalas en Noticias.'],
 ['No headlines right now.','No hay titulares por ahora.'],['Loading headlines...','Cargando titulares...'],
 ['Loading the forecast...','Cargando el pronóstico...'],['No place chosen yet.','Aún no has elegido un lugar.'],
 ['High','Máxima'],['Low','Mínima'],['Dry','Seco'],['Tacky','Pegajoso'],['Muddy','Lodoso'],['Swamp','Pantano'],

 ['Alerts','Avisos'],['Insights','Estadísticas'],['Task','Tarea'],['Note','Nota'],['Expense','Gasto'],
 ['Items','Objetos'],['Events','Eventos'],['Your day','Tu día'],['Open personal hub','Abrir centro personal'],
 ['Due date','Fecha límite'],['Due today','Para hoy'],['Task due today','Tarea para hoy'],['Overdue task','Tarea atrasada'],
 ['Upcoming event','Próximo evento'],['Warranty ending soon','La garantía está por vencer'],
 ['Category','Categoría'],['Purchase & warranty','Compra y garantía'],['Purchase date','Fecha de compra'],['Currency','Moneda'],
 ['Date','Fecha'],['Amount','Importe'],['Details','Detalles'],['Title','Título'],['Content','Contenido'],
 ['Add entry','Agregar registro'],['Edit entry','Editar registro'],['Delete entry?','¿Eliminar registro?'],
 ['Nothing needs attention right now.','No hay avisos pendientes.'],
 ['No entries yet. Select Add to create one.','Todavía no hay registros. Selecciona Agregar para crear uno.'],
 ['No matching results.','No hay resultados.'],
 ['Type to search your items, events, tasks, notes and expenses.','Escribe para buscar objetos, eventos, tareas, notas y gastos.'],
 ['Items by category','Objetos por categoría'],['Inventory items','Objetos registrados'],['Tasks open','Tareas pendientes'],
 ['Expenses tracked (MXN)','Gastos registrados (MXN)'],['Uncategorized','Sin categoría'],
 ['Display','Pantalla'],['Accent color','Color de acento'],['Panel opacity','Opacidad de los paneles'],
 ['Reduce animations','Reducir animaciones'],['Scanline effect','Efecto de líneas de pantalla'],
 ['Open','Abrir'],['Edit','Editar'],['Complete task','Completar tarea'],
 ['All fields currently inherit the category defaults.','Todos los campos usan la configuración de su categoría.'],
 ['Category defaults saved','Se guardaron los valores predeterminados de la categoría'],
 ['Local time','Hora local'],['Weather and mud','Clima y lodo'],['Tasks, personal notes, expense records, search, and notifications in one place.','Tareas, notas, gastos, búsqueda y avisos en un solo lugar.'],
 ['Notes','Notas'],['Total','Total'],['New place','Nuevo lugar'],['Save tiers','Guardar niveles'],
 ['Does not repeat','No se repite'],['Every 2 weeks','Cada 2 semanas'],
 ['Every 2 weeks','Cada 2 semanas'],['Does not repeat','No se repite'],['Every day','Cada día'],['Every week','Cada semana'],['Every month','Cada mes'],['Every year','Cada año'],['Repeats','Se repite'],['Every','Cada'],['Stop repeating after (optional)','Dejar de repetir después de (opcional)'],['Condition','Estado'],['Expiration','Caducidad'],['Durability','Durabilidad'],['Quantity','Cantidad'],['Remaining','Restantes'],['Maximum quantity','Cantidad máxima'],['Low stock threshold','Avisar cuando queden'],['Use category defaults','Usar valores predeterminados de la categoría'],['Categories','Categorías'],['Category tracking defaults','Campos predeterminados por categoría'],['Needs attention','Requiere atención'],['Low stock','Pocas unidades'],['Expiring soon','Próximo a caducar'],['Expired','Caducado'],['Good','Bueno'],['Excellent','Excelente'],['Worn','Desgastado'],['Damaged','Dañado'],['Needs repair','Necesita reparación'],['Purchase price','Precio de compra'],['Warranty ends','Fin de garantía'],['Tasks','Tareas'],['Notes','Notas'],['Expenses','Gastos'],['Notification center','Centro de avisos'],['Personal hub','Centro personal'],['Search everything','Buscar en todo'],['Save changes','Guardar cambios'],['Remaining quantity','Cantidad restante'],['Inventory tracking','Seguimiento de objetos'],['Now','Ahora'],['Local','Local'],['MUD','LODO'],['Change','Cambiar'],['Edit','Editar']
];
const translations = new Map(pairs);
export const t = (value) => language() === 'es' ? translations.get(value) || value : value;
let observer;
export function startTranslations(root = document.body) {
  observer?.disconnect();
  const visit = node => {
    if (node.nodeType === 3) {
      const original = node.__originalEnglish ?? node.nodeValue;
      if (!node.__originalEnglish) node.__originalEnglish = original;
      const trimmed = original.trim();
      if (translations.has(trimmed)) node.nodeValue = original.replace(trimmed, t(trimmed));
    } else if (node.nodeType === 1) {
      if (['SCRIPT','STYLE','TEXTAREA'].includes(node.tagName)) return;
      for (const attr of ['placeholder','aria-label','title']) {
        const key = '__original_' + attr;
        const original = node[key] || node.getAttribute(attr);
        if (original && translations.has(original)) { node[key] = original; node.setAttribute(attr, t(original)); }
      }
      node.childNodes.forEach(visit);
    }
  };
  visit(root);
  observer = new MutationObserver(records => {
    observer.disconnect();
    for (const rec of records) {
      if (rec.type === 'characterData') visit(rec.target);
      else rec.addedNodes.forEach(visit);
    }
    observer.observe(root, { childList:true, subtree:true, characterData:true });
  });
  observer.observe(root, { childList:true, subtree:true, characterData:true });
}
