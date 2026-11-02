// Interface language: Spanish uses Mexican vocabulary. No external translation service.
export const language = () => localStorage.getItem('tracker-language') === 'es' ? 'es' : 'en';
export const locale = () => language() === 'es' ? 'es-MX' : 'en-US';
const pairs = [
 ['Overview','Inicio'],['Pack','Mochila'],['Mud','Lodo'],['Calendar','Calendario'],['Feed','Noticias'],
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
 ['Now','Ahora'],['Local','Local'],['MUD','LODO'],['Change','Cambiar'],['Edit','Editar']
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
      if (['SCRIPT','STYLE','TEXTAREA','OPTION'].includes(node.tagName)) return;
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
