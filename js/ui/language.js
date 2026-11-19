// Interface language: Spanish uses Mexican vocabulary. No external translation service.
export const language = () => localStorage.getItem('tracker-language') === 'es' ? 'es' : 'en';
export const locale = () => language() === 'es' ? 'es-MX' : 'en-US';
const pairs = [
 ['Customize navigation icons','Personalizar iconos de navegación'],
 ['Drag to reorder; double-click to customize backpack','Arrastra para reordenar; haz doble clic para personalizar la mochila'],

 ['Search and go to','Buscar e ir a'], ['Section','Sección'], ['Sections','Secciones'],
 ['Search results','Resultados de búsqueda'], ['Searching saved records…','Buscando en tus registros…'],
 ['Could not load saved records.','No se pudieron cargar tus registros.'],
 ['This record is no longer available.','Este registro ya no está disponible.'],
 ['Could not open this section. Try again.','No se pudo abrir esta sección. Inténtalo de nuevo.'],
 ['Skip to content','Saltar al contenido'], ['Add widgets with Edit layout.','Agrega widgets desde Editar diseño.'],
 ['Temporary session','Sesión temporal'], ['Local','Local'], ['Game','Juego'], ['Book','Libro'], ['Film','Película'], ['Album','Álbum'],

 ['Customize backpack','Personalizar mochila'],
 ['Audio player','Reproductor de audio'],['Music and radio player · available in the Tracker app.','Reproductor de música y radio · disponible en la app Tracker.'],
 ['Boxes','Cajas'],['Box','Caja'],['Add another box','Agregar otra caja'],['Each box has its own quantity and capacity. Your pack shows their combined total.','Cada caja tiene su propia cantidad y capacidad. Tu mochila muestra el total de todas.'],['Each box needs a valid current and maximum quantity.','Cada caja debe tener una cantidad actual y máxima válidas.'],['Remove box?','¿Quitar caja?'],['This removes its quantity from the total when you save.','Su cantidad se restará del total cuando guardes.'],['Quantity is too large.','La cantidad es demasiado grande.'],
 ['Personal Hub','Centro personal'],['Transactions','Movimientos'],['Budgets','Presupuestos'],['Bill calculator','Calculadora de cuentas'],['Reports','Reportes'],['Income','Ingresos'],['Spent','Gastado'],['Net balance','Saldo neto'],['New transaction','Nuevo movimiento'],['Food','Comida'],['Groceries','Supermercado'],['Housing','Vivienda'],['Transport','Transporte'],['Health','Salud'],['Shopping','Compras'],['Entertainment','Entretenimiento'],['Subscriptions','Suscripciones'],['Education','Educación'],['Travel','Viajes'],['Bills','Servicios'],['Other','Otros'],

 ['Library','Biblioteca'],['Books','Libros'],['Films','Películas'],['Albums','Álbumes'],['Recently played','Jugados recientemente'],['Currently playing','Jugando ahora'],
 ['Sky events','Eventos astronómicos'],['Upcoming sky events','Próximos eventos astronómicos'],['Selected location','Ubicación seleccionada'],
 ['Dates are approximate. Check local visibility and the weather.','Las fechas son aproximadas. Consulta la visibilidad en tu ubicación y el pronóstico del clima.'],
 ['Dates are approximate. Visibility at your location is not guaranteed; check the source before planning.','Las fechas son aproximadas. No se garantiza la visibilidad en tu ubicación; consulta la fuente antes de planear.'],
 ['Details and visibility','Detalles y visibilidad'],['Hourly rain timeline','Lluvia por hora'],['next 24 hours','próximas 24 horas'],
 ['Hourly rain data unavailable; refresh Weather to try again.','No hay datos de lluvia por hora. Actualiza la sección de Clima para intentarlo de nuevo.'],
 ['No hourly forecast for the coming day.','No hay pronóstico por hora para las próximas 24 horas.'],
 ['History range','Rango del historial'],['days','días'],['Past weather and ground conditions','Historial del clima y del terreno'],
 ['Past days use weather model data, not measurements at your address.','Los días anteriores usan datos de modelos meteorológicos, no mediciones en tu domicilio.'],
 ['Enter a description first.','Escribe una descripción primero.'],['AI icons need Supabase and an installed Edge Function.','Los iconos generados con IA requieren Supabase y una función Edge instalada.'],
 ['Generating with AI...','Generando con IA...'],['Generate with AI','Generar con IA'],['Please sign in first.','Primero inicia sesión.'],
 ['AI icon ready. Save this item to apply it.','Icono generado con IA. Guarda el objeto para aplicarlo.'],
 ['Open a game in your library to see it here.','Abre un juego en tu biblioteca para verlo aquí.'],
 ['Theme presets','Temas predefinidos'],

 ['Currency Converter','Convertidor de divisas'],['Add pair','Agregar par de monedas'],['Remove','Quitar'],['Swap','Invertir'],['Amount','Cantidad'],['Cached','En caché'],['Rate unavailable','Tipo de cambio no disponible'],['Last updated','Última actualización'],['Choose a place in the Weather tab.','Elige una ubicación en Clima.'],['kinds','tipos'],['lost','perdidos'],['legendary','legendarios'],['Drizzle','Llovizna'],['No weather data','Sin datos del clima'],['Logs','Registros'],
 ['Phrase of the day','Frase del día'],['Dream Diary','Diario de sueños'],['Dreams','Sueños'],['Generate 16×16 icon','Generar icono de 16×16'],['General','General'],['Overview & weather','Inicio y clima'],['Appearance','Apariencia'],['Data & tools','Datos y herramientas'],['Overview','Inicio'],['Pack','Mochila'],['Mud','Clima'],['Calendar','Calendario'],['Feed','Noticias'],
 ['Settings','Configuración'],['Edit layout','Editar diseño'],['Weather','Clima'],['Games','Juegos'],['Game Library','Biblioteca de juegos'],['Clear','Despejado'],['Ground conditions','Condiciones del terreno'],['Mud conditions','Condiciones del terreno'],['Weather and mud','Clima y terreno'],['Tune the mud model','Ajustar el modelo del terreno'],['Observed','Observado'],['Forecast','Pronóstico'],['No big change expected.','No se esperan cambios importantes.'],['No rain over 3 days, soil is dry, drying well','Sin lluvia en los últimos 3 días; el suelo está seco y se está secando bien'],['Current conditions','Condiciones actuales'],
 ['Daily forecast','Pronóstico diario'],['Next six days','Próximos seis días'],['Feels like','Sensación térmica'],
 ['Humidity','Humedad'],['Wind','Viento'],['Rain today','Lluvia acumulada de hoy'],['Today','Hoy'],['Tomorrow','Mañana'],
 ['Sunny','Soleado'],['Clear sky','Cielo despejado'],['Partly cloudy','Parcialmente nublado'],
 ['Cloudy','Nublado'],['Overcast','Nublado'],['Light rain','Lluvia ligera'],['Rain','Lluvia'],
 ['Snow','Nieve'],['Thunderstorm','Tormenta eléctrica'],['Fog','Niebla'],['Storms','Tormentas'],
 ['Mud forecast','Pronóstico del terreno'],['Show quantity as percentage','Mostrar cantidad como porcentaje'],['Show maximum amounts','Mostrar cantidades máximas'],['Show maximum quantity','Mostrar cantidad máxima'],['Inventory icon assets','Iconos de inventario'],['Search icon assets','Buscar iconos'],['Icon category','Categoría de iconos'],['No matching icons','No se encontraron iconos'],["Tracking fields","Campos de seguimiento"],["Pharmacy icon presets","Iconos de farmacia"],["Icon color","Color del icono"],["Automatic / photo","Automático / foto"],["Medicine bottle","Frasco de medicamento"],["Bottle and pills","Frasco y pastillas"],["Bottle with capsule","Frasco con cápsula"],["Bottle with tablet","Frasco con tableta"],["Cross / accent","Color de la cruz"],["Bottle color","Color del frasco"],["Cap and label","Tapa y etiqueta"],["Capsule / tablet color","Color de cápsula / tableta"],["Reset icon colors","Restablecer colores"],["Squeeze nasal spray","Atomizador nasal"],["Generic pixel icon","Icono pixel art genérico"],["Custom icon tools","Herramientas para personalizar iconos"],["Notes & lost status","Notas y estado del objeto perdido"],['MUD OUTLOOK','ESTADO DEL TERRENO'],['WEATHER OUTLOOK','PRONÓSTICO DEL CLIMA'],['LOCAL TIME','HORA LOCAL'],
 ['Change place','Cambiar ubicación'],['Choose a place','Elegir ubicación'],['Refresh','Actualizar'],
 ['Items','Objetos'],['Places','Lugares'],['Add an item','Agregar objeto'],['Add item','Agregar objeto'],
 ['Clear filters','Borrar filtros'],['No items match these filters.','Ningún objeto coincide con estos filtros.'],
 ['Your pack is empty. Add your first item, then note where it lives.','Tu mochila está vacía. Agrega un objeto y anota dónde está.'],
 ['Where is it? Type an item name','¿Dónde está? Escribe el nombre del objeto'],
 ['Grid view','Vista de cuadrícula'],['List view','Vista de lista'],['Sync now','Sincronizar ahora'],
 ['Account and sync','Cuenta y sincronización'],['Sign out','Cerrar sesión'],['Mud forecast','Pronóstico del terreno'],
 ['Overview clocks','Relojes de inicio'],['Save clocks','Guardar relojes'],['Layout','Diseño'],
 ['Wallpaper','Fondo de pantalla'],['Wallpaper access','Acceso al fondo de pantalla'],
 ['Rarity tiers','Niveles de rareza'],['Navigation order','Orden de navegación'],
 ['Typography','Tipografía'],['Backup','Respaldo'],['Download backup','Descargar respaldo'],
 ['Install on your phone','Instalar en tu teléfono'],['Language','Idioma'],
 ['English','English'],['Español','Español'],['Save','Guardar'],['Cancel','Cancelar'],
 ['Add','Agregar'],['Delete','Eliminar'],['Search','Buscar'],['Close','Cerrar'],
 ['Synced','Sincronizado'],['Syncing','Sincronizando'],['Offline','Sin conexión'],['Ready','Listo'],
 ['Coming up','Próximos eventos'],['Headlines','Noticias principales'],['Pack stats','Estadísticas de la mochila'],
 ['Clock and date','Reloj y fecha'],['Loot and lost quests','Hallazgos y objetos perdidos'],
 ['Good morning','Buenos días'],['Good afternoon','Buenas tardes'],['Good evening','Buenas noches'],
 ['Your dashboard at a glance','Tu resumen del día'],['Nothing planned this week.','No hay eventos programados esta semana.'],
 ['No items yet. Add some in the Pack tab.','Aún no hay objetos. Agrega algunos en Mochila.'],
 ['No feed sources yet. Add one in the Feed tab.','Aún no tienes fuentes de noticias. Agrega una en Noticias.'],
 ['No headlines right now.','No hay noticias por ahora.'],['Loading headlines...','Cargando titulares...'],
 ['Loading the forecast...','Cargando el pronóstico...'],['No place chosen yet.','Aún no has seleccionado una ubicación.'],
 ['High','Máxima'],['Low','Mínima'],['Dry','Seco'],['Tacky','Ligeramente lodoso'],['Muddy','Lodoso'],['Swamp','Muy lodoso'],

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
 ['Display','Visualización'],['Accent color','Color de énfasis'],['Panel opacity','Opacidad de los paneles'],
 ['Reduce animations','Reducir animaciones'],['Scanline effect','Efecto de líneas de pantalla CRT'],
 ['Open','Abrir'],['Edit','Editar'],['Complete task','Completar tarea'],
 ['All fields currently inherit the category defaults.','Todos los campos usan la configuración de su categoría.'],
 ['Category defaults saved','Se guardó la configuración de la categoría'],
 ['Local time','Hora local'],['Weather and mud','Clima y terreno'],['Tasks, personal notes, expense records, search, and notifications in one place.','Tareas, notas, gastos, búsqueda y avisos en un solo lugar.'],
 ['Notes','Notas'],['Total','Total'],['New place','Nuevo lugar'],['Save tiers','Guardar niveles'],
 ['Does not repeat','No se repite'],['Every 2 weeks','Cada 2 semanas'],
 ['Every 2 weeks','Cada 2 semanas'],['Does not repeat','No se repite'],['Every day','Cada día'],['Every week','Cada semana'],['Every month','Cada mes'],['Every year','Cada año'],['Repeats','Se repite'],['Every','Cada'],['Stop repeating after (optional)','Fecha de fin de repetición (opcional)'],['Condition','Estado'],['Expiration','Fecha de caducidad'],['Durability','Durabilidad'],['Quantity','Cantidad'],['Remaining','Restantes'],['Maximum quantity','Cantidad máxima'],['Low stock threshold','Avisar si quedan pocas unidades'],['Use category defaults','Usar configuración de la categoría'],['Categories','Categorías'],['Category tracking defaults','Seguimiento predeterminado por categoría'],['Needs attention','Requiere atención'],['Low stock','Quedan pocas unidades'],['Expiring soon','Próximo a vencer'],['Expired','Vencido'],['Good','Bueno'],['Excellent','Excelente'],['Worn','Desgastado'],['Damaged','Dañado'],['Needs repair','Necesita reparación'],['Purchase price','Precio de compra'],['Warranty ends','Vencimiento de la garantía'],['Tasks','Tareas'],['Notes','Notas'],['Expenses','Gastos'],['Notification center','Centro de avisos'],['Personal hub','Centro personal'],['Search everything','Buscar en todo'],['Save changes','Guardar cambios'],['Remaining quantity','Cantidad restante'],['Inventory tracking','Seguimiento de objetos'],['Now','Ahora'],['Local','Local'],['MUD','LODO'],['Change','Cambiar'],['Edit','Editar'],
 // Additional English ⇄ Spanish interface labels; custom user text is never bulk-translated.
 ["All","Todos"],
 ["pieces","unidades"],
 ["Common","Común"],
 ["Uncommon","Poco común"],
 ["Rare","Raro"],
 ["Legendary","Legendario"],
 ["Sort: Newest","Orden: Recientes"],
 ["Sort: Name","Orden: Nombre"],
 ["Sort: Rarity","Orden: Rareza"],
 ["Sort: Place","Orden: Lugar"],
 ["Filter by category","Filtrar por categoría"],
 ["Filter by rarity","Filtrar por rareza"],
 ["Lost only","Solo objetos perdidos"],
 ["No category","Sin categoría"],
 ["No place","Sin ubicación"],
 ["No place yet","Aún sin ubicación"],
 ["Where is it?","¿Dónde está?"],
 ["Where is it? Search your items","¿Dónde está? Busca tus objetos"],
 ["Inventory sections","Secciones de la mochila"],
 ["Inventory view","Vista de la mochila"],
 ["Sort items","Ordenar objetos"],
 ["Name","Nombre"],
 ["Rarity","Rareza"],
 ["New place","Nuevo lugar"],
 ["Add to pack","Agregar a la mochila"],
 ["Place","Lugar"],
 ["Newest","Recientes"],
 ["Lost, last seen:","Perdido; última ubicación:"],
 ["Lost quests","Misiones de objetos perdidos"],
 ["Today's loot","Hallazgo de hoy"],
 ["No items match these filters.","Ningún objeto coincide con estos filtros."],
 ["No places yet. Add the rooms and containers where you keep things, like \"Garage\" and \"Blue bin\".","Todavía no hay lugares. Agrega habitaciones y contenedores donde guardas cosas."],
 ["Add place","Agregar lugar"],
 ["Add a place","Agregar un lugar"],
 ["Edit place","Editar lugar"],
 ["Save place","Guardar lugar"],
 ["Delete place","Eliminar lugar"],
 ["Place saved","Lugar guardado"],
 ["Place added","Lugar agregado"],
 ["Place deleted","Lugar eliminado"],
 ["Unassigned","Sin asignar"],
 ["Top level (not inside anything)","Ubicación principal (no está dentro de otra)"],
 ["Kind (optional)","Tipo (opcional)"],
 ["Inside","Dentro de"],
 ["Notes (optional)","Notas (opcional)"],
 ["Give this place a name.","Escribe un nombre para el lugar."],
 ["A place cannot be put inside itself.","No puedes colocar un lugar dentro de sí mismo."],
 ["Everything stored here moves up to the place above it (or to Unassigned). Nothing else is deleted.","Todo lo que guardaste aquí pasará a la ubicación superior o quedará sin asignar. No se eliminará nada más."],
 ["Add a place inside","Agregar un lugar dentro de"],
 ["Add a place inside ","Agregar un lugar dentro de "],
 ["building","edificio"],
 ["room","cuarto"],
 ["cupboard","gabinete"],
 ["shelf","estante"],
 ["drawer","cajón"],
 ["bin","contenedor"],
 ["box","caja"],
 ["tray","bandeja"],
 ["wall","pared"],
 ["vehicle","vehículo"],
 ["1 item","1 objeto"],
 ["items","objetos"],
 ["item has no place","objeto sin lugar"],
 ["items have no place","objetos sin lugar"],
 ["No items yet","Todavía no hay objetos"],
 ["Item saved","Objeto guardado"],
 ["Added to your pack","Agregado a tu mochila"],
 ["Item deleted","Objeto eliminado"],
 ["Edit item","Editar objeto"],
 ["More details","Más detalles"],
 ["Photo / pixel icon","Foto o icono pixel art"],
 ["Replace photo","Reemplazar foto"],
 ["Take or choose photo","Tomar o elegir foto"],
 ["Selected photo","Foto seleccionada"],
 ["Next maintenance date","Fecha del próximo mantenimiento"],
 ["Maintenance notes","Notas de mantenimiento"],
 ["Pixel art description","Descripción del icono pixel art"],
 ["Suggest one","Sugerir una"],
 ["Copy as image prompt","Copiar descripción para generar imagen"],
 ["Rarity tiers saved","Niveles de rareza guardados"],
 ["New category name","Nombre de nueva categoría"],
 ["Add category","Agregar categoría"],
 ["Category name","Nombre de categoría"],
 ["Choose which inventory fields are enabled by default in each category. Individual items can override any checkbox. Saved values are never deleted when hidden.","Elige los campos predeterminados por categoría. Cada objeto puede modificarlos. Los valores guardados no se borran al ocultar campos."],
 ["Category defaults saved","Se guardó la configuración de la categoría"],
 ["Delete category","Eliminar categoría"],
 ["Items in this category stay in your pack, with no category.","Los objetos de esta categoría permanecerán en tu mochila, sin categoría."],
 ["Select which fields this item uses. They start with your category defaults.","Elige los campos que usa este objeto. Inicialmente heredan la configuración de su categoría."],
 ["Customized for this item. Other fields inherit the category defaults.","Personalizado para este objeto. Los demás campos heredan los valores de la categoría."],
 ["All fields currently inherit the category defaults.","Todos los campos usan la configuración de su categoría."],
 ["I cannot find this (start a lost quest)","No encuentro este objeto (crear una misión de búsqueda)"],
 ["Service, inspection, battery change…","Servicio, revisión, cambio de batería…"],
 ["Optional","Opcional"],
 ["One fewer","Uno menos"],
 ["One more","Uno más"],
 ["No matching results.","No hay resultados."],
 ["Write or suggest a description first","Primero escribe o solicita una descripción"],
 ["Prompt copied","Descripción copiada"],
 ["Press copy on your keyboard to copy the selected text","Usa Copiar en tu teclado para copiar el texto seleccionado"],
 ["Icon creation failed","No se pudo crear el icono"],
 ["Pixel icon ready. Save this item to apply it.","Icono listo. Guarda el objeto para aplicarlo."],
 ["Maximum quantity must be a whole number not smaller than remaining quantity.","La cantidad máxima debe ser un número entero igual o mayor que la cantidad restante."],
 ["Low-stock threshold must be zero or higher.","El mínimo de unidades debe ser cero o mayor."],
 ["Give the item a name.","Escribe un nombre para el objeto."],
 ["Quantity must be a whole number, 0 or more.","La cantidad debe ser un número entero mayor o igual a cero."],
 ["It disappears from every device. Export a backup first if you might want it back.","Desaparecerá de todos los dispositivos. Exporta un respaldo si podrías necesitarlo."],
 ["Grid view","Vista de cuadrícula"],
 ["List view","Vista de lista"],
 ["Easy to replace","Fácil de reemplazar"],
 ["Useful, takes some effort to replace","Útil; no es tan fácil de reemplazar"],
 ["Hard or expensive to replace","Difícil o costoso de reemplazar"],
 ["Irreplaceable","Irreemplazable"],
 ['Freezing drizzle','Llovizna helada'],['Freezing rain','Lluvia helada'],['Snow showers','Chubascos de nieve'],['Rain showers','Chubascos'],['Open day','Abrir día'],['Show all','Ver todos'],['Filter by status','Filtrar por estado'],['Search collection','Buscar en la colección'],['out of','de'],
];
const translations = new Map(pairs);
export const t = (value) => language() === 'es' ? translations.get(value) || value : value;

/* Default categories have fixed IDs, but their saved names can be from either
   language (especially legacy 'Farmacia'). Localize only known default names,
   never arbitrary category names created or renamed by the user. */
const DEFAULT_CATEGORY_LABELS = [
  ['Tools','Herramientas'],
  ['Electronics','Electrónica'],
  ['Outdoor & Garden','Exterior y jardín'],
  ['Clothing & Gear','Ropa y equipo'],
  ['Household','Hogar'],
  ['Keepsakes','Recuerdos'],
  ['Pharmacy','Farmacia'],
];
export function categoryLabel(category) {
  const match = String(category?.id ?? '').match(/^c0000000-0000-4000-8000-00000000000([1-7])$/);
  if (!match) return category?.name ?? '';
  const [en, es] = DEFAULT_CATEGORY_LABELS[Number(match[1]) - 1];
  const savedName = String(category.name ?? '').trim();
  return savedName === en || savedName === es ? (language() === 'es' ? es : en) : savedName;
}

let observer;
export function startTranslations(root = document.body) {
  observer?.disconnect();
  const visit = node => {
    if (node.nodeType === 3) {
      if(node.parentElement?.closest('[data-user-content]')) return;
      const original = node.__originalEnglish ?? node.nodeValue;
      if (!node.__originalEnglish) node.__originalEnglish = original;
      const trimmed = original.trim();
      if (translations.has(trimmed)) node.nodeValue = original.replace(trimmed, t(trimmed));
    } else if (node.nodeType === 1) {
      if (['SCRIPT','STYLE','TEXTAREA'].includes(node.tagName) || node.hasAttribute('data-user-content')) return;
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
