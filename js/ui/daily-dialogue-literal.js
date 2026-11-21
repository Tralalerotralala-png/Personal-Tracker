// Curated literal lexical/chunk glosses for B2 dialogues, not machine output.
// Each row: speaker A Mandarin, A German, speaker B Mandarin, B German.
// Within each turn: target text ~ direct English gloss ~ direct Spanish gloss.
// These are meaningful word/phrase units, rather than misleading character-by-
// character readings of idioms. The original utterance remains unchanged.
const parse=s=>s.split('|').filter(Boolean).map(part=>{
 const [word,en,es]=part.split('~');
 return {word,en,es};
});
const G=(za,da,zb,db)=>({a:{zh:parse(za),de:parse(da)},b:{zh:parse(zb),de:parse(db)}});
export const B2_LITERAL=[
 G(
 "要是~if~si|我们~we~nosotros|截止日期~deadline~fecha límite|往后推~push backward~aplazar|能不能~can or cannot?~¿se puede?|检查~check~revisar|更仔细~more carefully~con más cuidado",
 "Wenn~if~si|die Frist~the deadline~la fecha límite|um zwei Tage~by two days~dos días|verschieben~shift/postpone~aplazar|könnten wir~could we~¿podríamos?|gründlicher~more thoroughly~más a fondo",
 "原则上~on principle~en principio|没问题~no problem~sin problema|不过~however~sin embargo|先~first~primero|确认~verify~confirmar",
 "Grundsätzlich~in principle~en principio|allerdings~however~sin embargo|müssten wir~we would have to~tendríamos que|mit dem Kunden~with the client~con el cliente|abklären~clarify/check~aclarar"
 ),
 G(
 "我明白~I understand~entiendo|为什么~why~por qué|但~but~pero|是不是~is it or not?~¿será que?|忽略~overlook~pasar por alto|长期的~long-term~a largo plazo",
 "Ich verstehe~I understand~entiendo|warum~why~por qué|allerdings~however~sin embargo|übersehen~overlook~pasar por alto|vielleicht~perhaps~quizá|langfristigen~long-term~a largo plazo",
 "有道理~has reason / makes sense~tiene sentido|要不~how about~¿qué tal si?|两种方案~two approaches~dos opciones|比较~compare~comparar",
 "Da ist etwas dran~there is something to it~algo de razón tiene|Sollen wir~shall we~¿y si?|die beiden Möglichkeiten~the two possibilities~las dos opciones|gegenüberstellen~place side by side~comparar"
 ),
 G(
 "尽快~as quickly as possible~lo antes posible|具体~specific~concretamente|是指~means/refers to~se refiere a|之前~before~antes|下周初~next week's start~principios de la próxima semana",
 "möglichst bald~as soon as possible~lo antes posible|meinst du~do you mean~¿te refieres a?|bis Freitag~by Friday~para el viernes|wäre~would be~sería|in Ordnung~in order / okay~bien",
 "最好~best if~lo ideal sería|来不及~not enough time~no dar tiempo|重新安排~arrange again~reorganizar",
 "wäre ideal~would be ideal~sería ideal|Falls~in case~en caso de que|knapp wird~becomes tight~se complica el tiempo|umplanen~replan~reorganizar"
 ),
 G(
 "与其~rather than~en vez de|所有事情~all things~todas las cosas|做一半~do halfway~hacer a medias|不如~better to~mejor|先~first~primero|最重要~most important~lo más importante",
 "Statt~instead of~en vez de|nur halb~only halfway~solo a medias|erledigen~complete~terminar|sinnvoller~more sensible~más razonable|zuerst~first~primero|abzuschließen~bring to a close~terminar",
 "我同意~I agree~estoy de acuerdo|只是~only / except that~solo que|说清楚~say clearly~dejar claro|可以等~can wait~puede esperar",
 "stimme ich zu~I agree~estoy de acuerdo|sollten~should~deberíamos|klar festlegen~clearly establish~dejar claro|warten kann~can wait~puede esperar"
 ),
 G(
 "整体~overall~en general|思路~train of thought~hilo de ideas|简洁~concise~breve|重点~main point~punto principal|更突出~stand out more~destacar más",
 "Gedankengang~line of thought~razonamiento|klar~clear~claro|knapper~more concise~más breve|Hauptaussage~main statement~idea principal|zur Geltung~to prominence~destacar",
 "建议~suggestion~sugerencia|具体~specific~concreta|试着~try to~intentar|第一段~first paragraph~primer párrafo|压缩~compress~resumir",
 "konkreter Hinweis~specific suggestion~sugerencia concreta|Ich versuche~I try~voy a intentar|ersten Absatz~first paragraph~primer párrafo|straffen~tighten~resumir"
 ),
 G(
 "刚才~just now~hace un momento|不太准确~not very precise~no muy preciso|本来~originally~originalmente|想说~wanted to say~quería decir|有点突然~a bit sudden~algo repentino",
 "vorhin~earlier~hace rato|ungeschickt ausgedrückt~expressed clumsily~me expresé mal|eigentlich~actually~en realidad|meinte~meant~quería decir|plötzlich~suddenly~de repente",
 "原来如此~so that's how it is~ah ya entiendo|还以为~had thought wrongly~había pensado|完全~completely~por completo|反对~oppose~oponerse",
 "Ach so~oh I see~ah ya veo|ich dachte~I thought~pensé|schon~indeed/already~ya|grundsätzlich~in principle~de fondo|gegen den Plan~against the plan~contra el plan"
 ),
 G(
 "方便的时候~when convenient~cuando te venga bien|能不能~can or cannot?~¿podrías?|看一眼~look once~echar un vistazo|不急~not urgent~no urge|确认~confirm~confirmar|方向没错~direction not wrong~ir bien encaminado",
 "Könntest du~could you~¿podrías?|einen Blick~a glance~un vistazo|wenn~when/if~cuando/si|Es eilt nicht~it does not hurry~no urge|richtig liege~am right~voy bien",
 "当然~of course~claro|下午~afternoon~por la tarde|应该~probably/should~probablemente|抽出~set aside~sacar|十分钟~ten minutes~diez minutos",
 "Klar~sure~claro|Nachmittag~afternoon~tarde|wahrscheinlich~probably~probablemente|freimachen~make free~liberar tiempo"
 ),
 G(
 "既然~given that~ya que|天气~weather~clima|变差~become worse~empeorar|不如~better~mejor|徒步~hike~caminata|改成~change into~cambiar por",
 "Wenn~if/since~si/ya que|ohnehin~anyway~de todos modos|schlechter werden~become worse~empeorar|statt~instead of~en vez de|Wanderung~hike~caminata|Museum~museum~museo",
 "也好~that's good too~también está bien|这样~this way~así|不用~no need to~no hace falta|一直~constantly~todo el tiempo|盯着~stare at~estar pendiente de",
 "Gute Idee~good idea~buena idea|Dann~then~entonces|nicht ständig~not continually~no constantemente|Wettervorhersage~weather forecast~pronóstico|im Blick behalten~keep in sight~tener presente"
 ),
 G(
 "确实~indeed~efectivamente|便宜一些~a bit cheaper~algo más barato|不过~however~sin embargo|经常~often~seguido|耐用性~durability~durabilidad|更重要~more important~más importante",
 "zwar~admittedly~si bien|günstiger~cheaper~más barato|aber~but~pero|oft~often~a menudo|Haltbarkeit~durability~durabilidad|vielleicht~perhaps~quizá",
 "也是~that's true too~es cierto|宁愿~rather~preferiría|多花一点~spend a little more~gastar un poco más|半年后~six months later~seis meses después|换~replace~reemplazar",
 "Stimmt~right~cierto|lieber~rather~prefiero|etwas mehr~a bit more~un poco más|in sechs Monaten~in six months~dentro de seis meses|ersetzen~replace~reemplazar"
 ),
 G(
 "据我了解~according to what I know~por lo que sé|规定~rule~norma|去年~last year~año pasado|改过~has been changed~cambió|不确定~not certain~no estoy seguro|是否~whether~si",
 "Soweit ich weiß~as far as I know~por lo que sé|Regel~rule~norma|letztes Jahr~last year~año pasado|geändert~changed~cambió|allerdings~however~sin embargo|noch gilt~still applies~sigue vigente",
 "先~first~primero|查一下~check a little~revisar|官方说明~official explanation~información oficial|再~then~luego|决定~decide~decidir",
 "Dann~then~entonces|lieber erst~rather first~mejor primero|offiziellen Hinweise~official notices~indicaciones oficiales|bevor~before~antes de|entscheiden~decidir~decidir"
 ),
 G(
 "如果~if~si|再晚~late again~retrasarse más|十分钟~ten minutes~diez minutos|恐怕~I'm afraid~me temo que|赶不上~unable to catch~perder|换乘~transfer~conexión",
 "Wenn~if~si|noch zehn Minuten~ten more minutes~otros diez minutos|Verspätung~delay~retraso|verpassen~miss~perder|vermutlich~probably~probablemente|Anschluss~connection~conexión",
 "先看看~look first~revisar primero|别的路线~other route~otra ruta|免得~so as not to~para evitar|手忙脚乱~hands and feet in chaos~andar a las carreras",
 "lieber schon mal~preferably already~mejor desde ahora|Alternative~alternative~alternativa|damit~so that~para que|später~later~después|Hektik~rush/confusion~prisas"
 ),
 G(
 "不好意思~excuse me~disculpe|之前~earlier~antes|不能吃~cannot eat~no puedo comer|坚果~nuts~frutos secos|确认~confirm~verificar|配料~ingredients~ingredientes",
 "Entschuldigung~excuse me~disculpe|erwähnt~mentioned~mencioné|keine Nüsse~no nuts~sin frutos secos|Könnten Sie~could you formal~¿podría usted?|Zutaten~ingredients~ingredientes|prüfen~check~revisar",
 "当然~of course~claro|马上~right away~enseguida|厨房~kitchen~cocina|确认之前~before confirming~antes de confirmar|不上菜~not serve dish~no servir",
 "Selbstverständlich~of course~por supuesto|sofort~immediately~enseguida|Küche~kitchen~cocina|serviere~serve~servir|Rückmeldung~response/confirmation~confirmación"
 ),
 G(
 "除了~apart from~además de|房租~rent~renta|以外~outside of~aparte de|每个月~each month~cada mes|固定费用~fixed expenses~gastos fijos|考虑~consider~considerar",
 "Welche~which~qué|festen Kosten~fixed costs~gastos fijos|außer~besides~además de|Miete~rent~renta|jeden Monat~every month~cada mes",
 "水电费~water/electricity charges~servicios de agua y luz|另外算~count separately~cobrar aparte|网络费用~internet fee~costo de internet|已经~already~ya|包含~included~incluido",
 "Strom und Wasser~electricity and water~luz y agua|extra abgerechnet~charged separately~se cobran aparte|Internet~internet~internet|bereits enthalten~already included~ya incluido"
 ),
 G(
 "明晚~tomorrow evening~mañana en la noche|改时间~change time~cambiar hora|临时~at short notice~de improviso|实在~really~de verdad|不好意思~sorry~lo siento",
 "Könnten wir~could we~¿podríamos?|morgen Abend~tomorrow evening~mañana por la noche|verschieben~reschedule~reprogramar|kurzfristig~at short notice~de imprevisto|dazwischengekommen~something intervened~surgió algo",
 "没关系~no matter / okay~no pasa nada|忙完~finish being busy~terminar pendientes|再说~talk again~hablar después|周末~weekend~fin de semana",
 "Kein Problem~no problem~no hay problema|Melde dich~get in touch~avísame|Luft hast~have air/time~tener respiro|am Wochenende~at the weekend~el fin de semana"
 ),
 G(
 "打扰~disturb~molestar|最近~lately~últimamente|晚上~evening~por la noche|声音~sound~ruido|十点以后~after ten~después de las diez|小声~low voice~bajo volumen",
 "Entschuldigen Sie~excuse me formal~disculpe|Störung~disturbance~molestia|in letzter Zeit~lately~últimamente|recht laut~quite loud~bastante ruidoso|nach zehn~after ten~después de las diez|leiser~quieter~más bajo",
 "当然可以~of course can~claro que sí|没注意到~did not notice~no nos dimos cuenta|声音~sound~sonido|这么远~so far~tan lejos",
 "Natürlich~of course~claro|nicht klar~not clear~no sabíamos|so deutlich~so clearly~tan claramente|hört~hears~se escucha"
 ),
 G(
 "问题~problem~problema|不是~is not~no es|密码~password~contraseña|而是~but rather~sino que|登录以后~after signing in~después de entrar|一直~continually~una y otra vez|重新加载~reload~recargar",
 "Das Problem~the problem~el problema|nicht~not~no|Passwort~password~contraseña|sondern~but rather~sino que|nach dem Einloggen~after login~después de entrar|ständig~constantly~constantemente|neu lädt~reloads~recarga",
 "明白了~understood~entendido|能否~can or not formal~¿podría?|浏览器~browser~navegador|大概~approximately~aproximadamente|发生的时间~time occurred~hora del problema",
 "Verstanden~understood~entendido|Könnten Sie~could you formal~¿podría usted?|welchen Browser~which browser~qué navegador|ungefähr~approximately~aproximadamente|passiert ist~happened~ocurrió"
 ),
 G(
 "今天~today~hoy|提纲~outline~esquema|整理好~put in order~organizar|但~but~pero|完整报告~full report~informe completo|明天才能~only tomorrow can~no antes de mañana",
 "Gliederung~outline~esquema|heute~today~hoy|fertig machen~finish~terminar|vollständigen Bericht~complete report~informe completo|allerdings~however~sin embargo|erst morgen~only tomorrow~hasta mañana",
 "这样也行~this works too~así también sirve|先~first~primero|根据~based on~según|讨论~discuss~discutir|方向~direction~enfoque",
 "Das passt auch~that fits too~también está bien|Dann~then~entonces|zunächst~first~primero|anhand~on the basis of~con base en|Richtung~direction~enfoque"
 ),
 G(
 "确认~confirm~confirmar|费用~fee~cargo|额外~additional~extra|收取~collect/charge~cobrar|之前~earlier~antes|报价~quote~cotización|好像没有~seems not there~al parecer no estaba",
 "würde gern~would like to~quisiera|klären~clarify~aclarar|Gebühr~fee~cargo|zusätzlich~additional~adicional|ursprünglichen Angebot~original quote~cotización original|nicht aufgeführt~not listed~no incluido",
 "明细~itemized details~desglose|如果~if~si|算错了~calculated wrong~se calculó mal|立即~immediately~de inmediato|更正~correct~corregir",
 "Aufstellung~breakdown~desglose|Sollte~should it happen / if~si resulta que|Fehler~error~error|vorliegen~be present~existir|korrigieren~correct~corregir|umgehend~immediately~de inmediato"
 ),
 G(
 "大家~everyone~todos|意见~opinions~opiniones|不太一样~not quite the same~no muy iguales|要不~how about~¿qué tal si?|先确定~first decide~acordar primero|标准~criteria~criterios",
 "Meinungen~opinions~opiniones|auseinander~apart~distintas|zuerst~first~primero|Kriterien~criteria~criterios|festlegen~establish~establecer|Auswahl~choice~elección",
 "这样~this way~así|至少~at least~por lo menos|避免~avoid~evitar|只凭~only based on~solo basándose en|个人喜好~personal taste~preferencias personales",
 "Gute Idee~good idea~buena idea|zumindest~at least~por lo menos|nicht nur~not only~no solo|persönlichem Geschmack~personal taste~gusto personal"
 ),
 G(
 "原本以为~originally thought~al principio pensé|预算~budget~presupuesto|后来发现~later found~después descubrí|其实~actually~en realidad|沟通~communication~comunicación|不够及时~not timely enough~no suficientemente oportuna",
 "Zuerst~first~al principio|dachte~thought~pensé|Budget~budget~presupuesto|Inzwischen~by now~ahora|glaube~believe~creo|zu spät~too late~demasiado tarde|kommuniziert~communicated~comunicamos",
 "至少~at least~por lo menos|知道~know~sabemos|下次~next time~la próxima vez|改进~improve~mejorar|环节~stage~etapa",
 "Dann~then~entonces|immerhin~at least~por lo menos|an welcher Stelle~at which point~en qué parte|nächsten Mal~next time~la próxima vez|ansetzen~start tackling~empezar a mejorar"
 ),
 G(
 "刚才~just now~hace rato|需要~need~necesitar|空间~space~espacio|是指~means~quiere decir|今天~today~hoy|一个人待着~stay alone~estar a solas|最近~lately~últimamente",
 "vorhin~earlier~hace rato|bräuchtest~would need~necesitarías|Abstand~distance/space~espacio|Bezieht sich~refers to~se refiere a|heute~today~hoy|generell~in general~en general",
 "主要是~mostly~principalmente|整理~sort~ordenar|思路~thoughts~ideas|不是针对你~not directed at you~no es contra ti",
 "Vor allem~above all~sobre todo|Gedanken~thoughts~pensamientos|sortieren~sort~ordenar|nichts mit dir zu tun~nothing to do with you~no tiene que ver contigo"
 ),
 G(
 "如果~if~si|购买凭证~purchase proof~comprobante de compra|一起~together~junto|愿意~willing~dispuesto|按这个价格~at this price~a ese precio|成交~close the transaction~cerrar trato",
 "Wenn~if~si|Kaufbeleg~purchase receipt~comprobante|mitgeben~give along~incluir|wäre ich bereit~would be willing~estaría dispuesto|genannten Preis~stated price~precio mencionado|zahlen~pay~pagar",
 "没问题~no problem~sin problema|留着~still kept~conservo|电子收据~digital receipt~recibo digital|现在~now~ahora|发给您~send to you formal~enviárselo",
 "Kein Problem~no problem~sin problema|digitale Quittung~digital receipt~recibo digital|noch~still~todavía|sofort~immediately~enseguida|schicken~send~enviar"
 ),
 G(
 "根据~according to~según|物流信息~tracking information~seguimiento|包裹~package~paquete|昨天就该~should already yesterday~debió ayer|到现在~up to now~hasta ahora|还没收到~still not received~todavía no recibo",
 "Laut~according to~según|Sendungsverfolgung~shipment tracking~seguimiento|hätte~would have~habría|gestern~yesterday~ayer|ankommen sollen~should have arrived~debió llegar|noch nicht erhalten~not yet received~todavía no recibido",
 "签收记录~delivery signature record~comprobante de entrega|找不到~cannot find~no encontrar|提交~submit~presentar|调查申请~investigation request~solicitud de investigación",
 "Zustellnachweis~proof of delivery~comprobante de entrega|Falls~if~si|fehlt~is missing~falta|Nachforschung~investigation~investigación|leite ich eine Nachforschung ein~I initiate an investigation~inicio una investigación"
 ),
 G(
 "不介意~do not mind~no te molesta|更想~prefer/want more~preferiría|安静的地方~quiet place~lugar tranquilo|而不是~rather than~en lugar de|那么吵~so noisy~tan ruidoso|酒吧~bar~bar",
 "Wenn~if~si|nichts ausmacht~doesn't mind~no molesta|lieber~rather~preferiría|ruhigen Ort~quiet place~lugar tranquilo|unterhalten~converse~platicar|lauten Bar~loud bar~bar ruidoso",
 "也是~also~también|好好聊聊~have a good talk~platicar bien|地点~place~lugar|并不重要~not really important~no muy importante",
 "Klar~sure~claro|Gespräch~conversation~plática|Wo wir sitzen~where we sit~dónde nos sentamos|zweitrangig~second-ranking~secundario"
 ),
 G(
 "一方面~on one hand~por un lado|数据~data~datos|另一方面~on the other hand~por otro lado|样本~sample~muestra|太少~too few~muy poca|下结论~draw conclusion~sacar conclusión",
 "Einerseits~on one hand~por un lado|Zahlen~figures~cifras|andererseits~on the other~por otro lado|Stichprobe~sample~muestra|zu klein~too small~demasiado pequeña|abzuleiten~derive~deducir",
 "先~first~primero|看看~have a look~revisar|有没有~whether exists~si hay|更大规模~larger scale~mayor escala|研究~research~estudio",
 "Dann~then~entonces|zuerst~first~primero|Untersuchung~study~estudio|größerer Stichprobe~larger sample~muestra más grande"
 ),
 G(
 "倒觉得~rather think~más bien pienso|不是故意~not deliberately~no a propósito|冷淡~cold/distant~distante|只是~only~solo|最近~lately~últimamente|压力~pressure/stress~estrés",
 "sehe das etwas anders~see it differently~lo veo distinto|Vielleicht~perhaps~quizá|absichtlich~intentionally~a propósito|distanziert~distant~distante|sondern~but instead~sino|gestresst~stressed~estresado",
 "也有可能~also possible~también puede ser|可能~maybe~quizá|语气~tone~tono|太严重~too serious~demasiado grave",
 "Kann sein~could be~puede ser|Vielleicht~perhaps~quizá|zu viel~too much~demasiado|Tonfall~tone of voice~tono de voz|hineininterpretiert~interpreted into~interpreté de más"
 ),
 G(
 "说起来~speaking of~ahora que lo mencionas|之前~earlier~antes|提到~mention~mencionar|换工作~change jobs~cambiar trabajo|后来~since then~desde entonces|进展~progress~novedades",
 "Wo wir gerade davon sprechen~while speaking of that~ahora que lo mencionas|Jobwechsel~job change~cambio de trabajo|nachgedacht~thought about~considerado|inzwischen~in the meantime~desde entonces|etwas ergeben~something came up~hay novedades",
 "还在考虑~still considering~aún lo considero|不过~however~sin embargo|已经开始~already begun~ya empecé|认真~seriously~seriamente|不同的机会~different opportunities~distintas oportunidades",
 "überlege noch~still considering~todavía lo pienso|inzwischen~meanwhile~ya|verschiedene Möglichkeiten~different possibilities~distintas opciones|genauer an~more carefully~con más detalle"
 ),
 G(
 "本来打算~originally intended~tenía pensado|每天~every day~todos los días|一个小时~one hour~una hora|没想到~didn't expect~no esperaba|反而~instead/contrary to expectation~contrariamente|更现实~more realistic~más realista",
 "Eigentlich~actually/originally~en realidad|hatte ich vor~I had intended~yo había planeado|jeden Tag~every day~cada día|Mittlerweile~by now~ahora|langfristig~long term~a largo plazo|realistischer~more realistic~más realista",
 "长期~long-term~a largo plazo|坚持~keep at it~mantener constancia|比~compared with~más que|一开始~at the start~al principio|更重要~more important~más importante",
 "Genau~exactly~exacto|Dranzubleiben~sticking with it~mantenerse constante|wichtiger~more important~más importante|am Anfang~in the beginning~al principio|vorzunehmen~set oneself a goal~proponerse"
 ),
 G(
 "界面~interface~interfaz|既要~must both~debe tanto|又不能~yet cannot~pero no debe|拥挤~cluttered~saturado|确实~indeed~en efecto|平衡~balance~equilibrar",
 "Oberfläche~interface~interfaz|sowohl~both~tanto|als auch~as well as~como|übersichtlich~clear/organized~ordenado|gar nicht so leicht~not so easy at all~nada fácil|auszubalancieren~balance~equilibrar",
 "要不~how about~¿qué tal si?|先~first~primero|突出~highlight~destacar|最常用~most used~más usadas|需要时~when needed~cuando se necesiten|展开~expand~desplegar",
 "Vielleicht~perhaps~quizá|häufigsten~most frequent~más frecuentes|hervor~out/front~destacar|Rest~rest~resto|bei Bedarf~as needed~cuando haga falta|klappen den Rest erst bei Bedarf auf~unfold the rest only when needed~desplegamos el resto cuando haga falta"
 ),
 G(
 "邮件~email~correo|坚定~firm~firme|一点~a little~un poco|又不希望~yet don't want~pero no quiero|显得~appear/seem~parecer|强硬~harsh~brusco",
 "E-Mail~email~correo|bestimmt~firm~firme|klingen~sound~sonar|aber~but~pero|nicht zu~not too~no demasiado|schroff wirken~seem harsh~parecer brusco",
 "直接~directly~directamente|说清楚~make clear~dejar claro|要求~request~petición|同时~at the same time~al mismo tiempo|对方~other party~otra persona|余地~room/margin~margen",
 "Dann~then~entonces|formulier~formulate (imperative)~formula (imperativo)|Bitte~request~petición|klar~clearly~claramente|zugleich~at the same time~a la vez|Spielraum~room to maneuver~margen"
 ),
 G(
 "知道~know~sé|不是故意~not intentionally~no a propósito|更在意~care more about~me importa más|以后~in the future~en adelante|提前~ahead of time~con anticipación|说一声~say a word / let know~avisar",
 "Ich weiß~I know~sé|nicht mit Absicht~not on purpose~no a propósito|Mir wäre aber wichtig~but would matter to me~pero me importaría|nächstes Mal~next time~la próxima vez|früher Bescheid~give notice earlier~avisar antes",
 "你说得对~you said right~tienes razón|以后~from now on~en adelante|尽量~try one's best~intentar|提前~early~con tiempo|通知~notify~avisar",
 "Du hast recht~you are right~tienes razón|werde versuchen~will try~intentaré|künftig~in future~de ahora en adelante|rechtzeitig~in time~a tiempo|informieren~informar~informar"
 ),
 G(
 "机会~opportunity~oportunidad|听起来~sounds~suena|不错~not bad~bien|不过~however~sin embargo|答应之前~before agreeing~antes de aceptar|弄清楚~make clear~aclarar|职责~responsibilities~responsabilidades",
 "Angebot~offer~oferta|klingt interessant~sounds interesting~suena interesante|allerdings~however~sin embargo|vor einer Zusage~before accepting~antes de aceptar|genauen Aufgaben~exact duties~funciones concretas|klären~clarify~aclarar",
 "有道理~makes sense~tiene sentido|尤其~especially~sobre todo|问清楚~ask clearly~preguntar bien|工作时间~working hours~horarios|发展空间~growth room~oportunidades de crecimiento",
 "Stimmt~that's right~cierto|vor allem~above all~sobre todo|Arbeitszeiten~work hours~horarios laborales|Entwicklungsmöglichkeiten~development possibilities~posibilidades de crecimiento|nachfragen~ask follow-up~preguntar"
 ),
 G(
 "与其~rather than~en lugar de|一直~continually~todo el tiempo|抱怨~complain~quejarse|流程~process~proceso|不如~better~mejor|找出~find~identificar|改进~improve~mejorar",
 "Statt~instead of~en vez de|ständig~constantly~constantemente|beschweren~complain~quejarse|langsamen Ablauf~slow process~proceso lento|könnten wir~could we~podríamos|Verbesserungsschritt~improvement step~paso para mejorar",
 "从~from~desde|审批环节~approval step~etapa de aprobación|开始~begin~empezar|最容易~most easily~más probable|耽误时间~waste/delay time~perder tiempo",
 "Dann~then~entonces|fangen wir mit der Freigabe an~let us begin with approval~empecemos con la autorización|Freigabe~approval~autorización|vermutlich~probably~probablemente|am meisten Zeit~most time~más tiempo"
 ),
 G(
 "如果~if~si|周末~weekend~fin de semana|有空~be free~tener tiempo|打算~plan~planear|展览~exhibition~exposición|不用特意~no need especially~sin necesidad de|调整~adjust~cambiar",
 "Falls~if~si|am Wochenende~at weekend~el fin de semana|Lust und Zeit~desire and time~ganas y tiempo|Ausstellung~exhibition~exposición|Du musst aber nichts extra~you don't have to do anything extra~no tienes que hacer nada extra|umplanen~reschedule~cambiar planes",
 "听起来~sounds~suena|有意思~interesting~interesante|看一下时间~check time~revisar agenda|晚点~a little later~más tarde|回复~reply~contestar",
 "klingt spannend~sounds exciting~suena interesante|Kalender~calendar~agenda|kurz~briefly~un momento|später~later~después|Bescheid~notification~aviso"
 ),
 G(
 "虽然~although~aunque|修理~repair~reparación|不便宜~not cheap~no barato|从长远看~from long-term view~a largo plazo|划算~worth the cost~conviene",
 "Auch wenn~even if~aunque|Reparatur~repair~reparación|nicht billig~not cheap~no es barato|lohnt sie sich~it is worth it~conviene|langfristig~long term~a largo plazo|Neukauf~new purchase~compra nueva",
 "而且~furthermore~además|如果~if~si|几年~few years~unos años|少浪费~waste less~desperdiciar menos|资源~resources~recursos",
 "Und wenn~and if~y si|Gerät~device~aparato|ein paar Jahre~a few years~unos años|hält~lasts~dura|sparen~save~ahorrar|Ressourcen~resources~recursos"
 ),
 G(
 "项目~project~proyecto|感兴趣~interested~interesado|目前~currently~actualmente|实在~really~de verdad|精力~energy/capacity~energía/capacidad|接~take on~asumir",
 "Projekt~project~proyecto|interessiert mich~interests me~me interesa|momentan~at the moment~por ahora|leider~unfortunately~lamentablemente|keine Kapazität~no capacity~sin capacidad|zusätzliche Aufgaben~additional tasks~tareas adicionales",
 "谢谢~thanks~gracias|这么直接~so direct~tan directo|找个时间~find a time~buscar un momento|再谈~talk again~retomar charla",
 "Danke~thanks~gracias|klare Rückmeldung~clear feedback~respuesta clara|späteren Zeitpunkt~later point in time~más adelante|darüber~about it~sobre eso|sprechen~talk~hablar"
 ),
 G(
 "这件事~this matter~este asunto|对我们都~for both of us~para ambos|重要~important~importante|不用马上~need not immediately~no necesitas de inmediato|回答~answer~responder|想一想~think a little~pensarlo",
 "Die Sache~the matter~el asunto|uns beiden~both of us~los dos|wichtig~important~importante|nicht sofort~not immediately~no de inmediato|in Ruhe~in peace~con calma|darüber nach~think about it~pensarlo",
 "想~want~querer|先~first~primero|自己的想法~own thoughts~mis propias ideas|理清楚~sort out clearly~ordenar bien|明天~tomorrow~mañana|再聊~talk again~volver a hablar",
 "Danke~thanks~gracias|Gedanken~thoughts~pensamientos|erst sortieren~first sort~ordenar primero|morgen~tomorrow~mañana|in Ruhe~calmly~con calma"
 )
];
