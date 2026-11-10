# El problema: lotes que se vencen antes de venderse

Este documento respalda la elección del problema y las constantes del motor.
Lo armé antes de escribir código y lo amplié al cierre con auditorías oficiales,
normativa, estudios, casos argentinos recientes, datos de mercado y entrevistas
del sector. Relevado entre el 8 y el 9 de noviembre de 2026.

Distingo tres niveles de respaldo, porque no todo pesa lo mismo:

- **Comprobado:** normativa vigente y auditorías de organismos de control.
- **Documentado:** estudios publicados, investigaciones periodísticas y
  entrevistas con nombre y apellido.
- **Estimado:** cifras de proveedores de software, que son parte interesada.
  Las uso como orden de magnitud, nunca como dato.

## 1. El vencimiento le cuesta caro incluso a quien tiene controles

Los casos más contundentes vienen de organismos públicos, que tienen auditorías
externas, sistemas de stock y personal dedicado. Aun así, pierden plata por
vencimiento de forma sistemática.

**Comprobado.**

- **Canadá, 2026.** La Auditora General concluyó que la Agencia de Salud Pública
  no gestionó de forma efectiva la reserva estratégica de emergencia. En el
  ejercicio 2025-26 dio de baja 331 millones de dólares canadienses en insumos
  vencidos o dañados, más de doce veces los 27 millones que distribuyó ese año.
  Al 31 de marzo de 2026 conservaba unos 84 millones de artículos vencidos, y
  almacenarlos durante dos años costó 6,3 millones.
- **Ontario, 2025.** La auditoría provincial informó la baja de 1.400 millones de
  dólares canadienses en equipos de protección personal.
- **Argentina, AGN, informe 2024-064.** Es el caso más completo que encontré, y
  describe en un organismo público exactamente la falla que OpFarma ataca. La
  Auditoría General de la Nación evaluó la compra, el almacenaje, la
  distribución y el descarte de vacunas del Ministerio de Salud entre 2016 y
  2019 (informe fechado el 20 de mayo de 2024). Lo que constató por su cuenta:
  - De 1.932.564 dosis de vacuna DPTA compradas en 2016, 624.060 se vencieron en
    el depósito central sin distribuirse, con un costo de 6.989.060 dólares.
    Cuatro de los seis lotes nunca salieron, y las planillas de control de 2019
    ni siquiera los listaban, lo que "impidió detectar su vencimiento".
  - No hubo evidencia de que se usara el criterio FEFO previsto en el propio
    manual. Según la AGN, con FEFO el vencimiento de lo almacenado "no habría
    tenido lugar".
  - No había un control de stock sistemático ni periódico, y los sistemas del
    Ministerio y del depósito no se hablaban entre sí.
  - Los lotes llegaron a pasar 232 días en la terminal aduanera y 281 hasta su
    liberación, que es vida útil que se consume antes de que el producto esté
    disponible.
  - Citando un informe conjunto de la SIGEN y la auditoría interna de 2020, la
    AGN registra 4.141.343 unidades de vacunas vencidas "ocupando espacio
    rentado" en la cámara frigorífica central. El costo de ese almacenaje no se
    pudo cuantificar por falta de datos.
- **Argentina, AGN, informe 2024-077.** En el programa de VIH del mismo
  Ministerio, con datos del propio organismo, la AGN contabilizó 1.895.801
  unidades de medicamentos "no conformes" entre 2017 y 2019, una categoría que
  suma lo vencido con lo roto o dañado. Lo vencido se dispone como residuo
  peligroso bajo la Ley 24.051, con un servicio contratado para eso.
- **Paraguay, Contraloría, 2025.** Detectó medicamentos e insumos vencidos en
  depósitos del Hospital de Clínicas, con pérdidas por 2.207 millones de
  guaraníes, y atribuyó el desperdicio a la falta de controles y procedimientos.
- **Chile, Contraloría.** En 2020 acreditó que la Central de Abastecimiento
  eliminó más de 3.300 millones de pesos chilenos en medicamentos, y en 2021, que
  el sistema de salud desechó 35 millones de medicamentos por vencimiento.
- **Argentina, vacunas después de 2019.** El hallazgo de los 4 millones de
  dosis se hizo público en agosto de 2020, cuando el Ministerio y la SIGEN lo
  anunciaron. En 2022, el informe de gestión de la Jefatura de Gabinete al Senado
  contabilizó 349.916 dosis contra el COVID vencidas en 2021 y 2022, sobre
  574.017 descartadas en total. En octubre de 2024, el Ministerio estimó ante el
  Consejo Federal de Salud una pérdida de 30 millones de dólares en vacunas
  vencidas en los cuatro años anteriores.

Las vacunas no son el mercado de OpFarma, y cada gobierno usó estas cifras
contra el anterior. Las incluyo por lo que tienen en común: las pérdidas cruzan
al menos dos gestiones de distinto signo, con depósitos propios y organismos de
control. El problema es de proceso, no de una administración.

**Documentado.**

- **ProPublica, 2017.** La serie *What Hospitals Waste*, de Marshall Allen,
  mostró que los hospitales de Estados Unidos descartan rutinariamente insumos
  nuevos y sin vencer, entre ellos cajas de suturas sin abrir, como consecuencia
  de los acuerdos de compra y las prácticas de abastecimiento.
- **Estudios en quirófano.** En UCSF, los insumos descartados sin usar promediaron
  653 dólares por cirugía, el 13,1% del costo de insumos, y los autores lo
  extrapolaron a 2,9 millones de dólares por año sólo en neurocirugía. En un
  hospital francés, lo desperdiciado llegó al 20,1% del costo de insumos
  quirúrgicos.
- **Un hospital universitario de Belo Horizonte, 2015 a 2019.** Santos y otros
  (*Cleaner Waste Systems*, 2022) relevaron 1.485 registros de materiales y
  medicamentos descartados sin usar en un hospital de 509 camas, por 108.722
  dólares. El 61,8% de los registros fue por vencimiento, y lo vencido sumó
  78.470 dólares, cerca del 72% del valor. Los autores lo atribuyen a un stock
  mal dimensionado frente a la demanda real, a la falta de coordinación entre
  quien planifica la compra y quien distribuye, y a registros débiles. Una
  salvedad: en su definición, "vencido" incluye también lo que quedó sin usar
  porque se reemplazó por un producto más nuevo.
- **Siete años de inventario en un hospital de Riad.** Alanazi y otros
  (*Risk Management and Healthcare Policy*, 2024) analizaron 2015 a 2021 en King
  Abdulaziz Medical City. Lo vencido explicó el 79,8% del valor desperdiciado,
  muy por encima de lo inmovilizado (14,3%) y lo obsoleto (5,9%). Las causas que
  señalan son el sobrestock en depósito, las epidemias que frenaron la rotación y
  la llegada de productos nuevos que dejan viejo al anterior. Con una estrategia
  activa de reducción, el desperdicio total quedó en el 0,21% del gasto.
- **Bulletin of the World Health Organization, 2017.** Un análisis desde Uganda
  describe depósitos públicos que guardaban medicamentos vencidos durante un
  promedio de seis años, y atribuye el problema a pronósticos de demanda pobres,
  compras paralelas de distintos programas y donaciones que no coinciden con la
  necesidad.

Los estudios de quirófano miden sobre todo insumos abiertos y no usados, no sólo
vencidos. Los incluyo porque muestran la misma falla de fondo que el resto: el
stock no se corresponde con el consumo real. El de Riad agrega un dato que
conviene no esconder: cuando hay una estrategia sostenida, la pérdida baja
mucho. Eso es un argumento a favor de actuar, no en contra del problema.

## 2. La magnitud en un distribuidor

**Estimado.** Las cifras que circulan para fabricantes y distribuidores de
dispositivos médicos vienen de proveedores de software: entre el 1% y el 4% del
inventario se da de baja cada año, y entre el 2% y el 4% específicamente por
vencimiento. Un proveedor llega a estimar que hasta el 30% del inventario
hospitalario podría vencer antes de usarse, pero no publica la fuente primaria.
GHX, que hace recuentos físicos de inventario en hospitales, informó que en 2024
identificó casi 9 millones de dólares en productos vencidos, con un promedio de
90 mil por organización; no dice cuántas organizaciones contó. No encontré
informes independientes de consultoras ni de cámaras del sector con este dato, y
el estudio de Riad (0,21% del gasto) sugiere que las cifras de proveedores están
en el extremo alto.

**Comprobado y documentado.** El terreno en Argentina:

- **CADIEM, informe sectorial (febrero de 2019, datos de 2017).** El sector
  facturó 2.160 millones de dólares, y el 75% fueron productos importados. Lo
  forman 929 empresas: 274 productores y 655 importadores y comercializadores,
  con 10 empleados en promedio. La importación está atomizada: las diez
  primeras empresas explican sólo el 24% de lo importado. Las importaciones de
  insumos, el segmento de OpFarma, fueron el 17% de los 840 millones
  importados.
- **Ministerio de Hacienda, informe de cadena de valor (junio de 2019).** Las
  importaciones de equipamiento médico sumaron 701 millones de dólares en 2018
  (en una rama que también incluye óptica e instrumentos de precisión), con un
  déficit comercial que el informe califica de estructural. Distingue tres
  compradores: hospitales públicos, obras sociales y medicina privada.
- **CEPAL, desarrollo de proveedores de dispositivos médicos (2024).** Robbio y
  Resquín estiman el consumo aparente de dispositivos médicos de Argentina en
  unos 2.350 millones de dólares en 2021-2022. Sobre una encuesta a 57
  fabricantes nacionales, el 84% son micro o pequeñas empresas. Anotan además
  un mecanismo de sobrestock, en este caso del lado de los fabricantes: los
  pedidos mínimos de los proveedores del exterior obligan a comprar insumos
  "para varios años de actividad".
- **Vázquez (*H-industria*, 2025).** En su historia de la industria de
  dispositivos médicos, con datos del INDEC, la importación pasó del 52% del
  consumo aparente en 1993 al 72% en 2018. Describe a CADIEM como una cámara de
  importadores, en su mayoría distribuidoras y oficinas comerciales de
  multinacionales, y señala que las multinacionales en Argentina sólo importan
  y comercializan, sin fabricar. Gil (*URVIO*, 2022) llega a una cifra
  parecida: la producción local abastece sólo un tercio de la demanda.
- **Guía comercial del gobierno de Estados Unidos (2025).** Estima el mercado de
  dispositivos médicos en 902 millones de dólares en 2023, con alrededor del 80%
  importado; China y Estados Unidos son los dos primeros orígenes. Toda
  importación tiene que hacerla un importador inscripto en ANMAT.

Las estimaciones de tamaño no coinciden, de 902 a 2.350 millones de dólares,
porque miden cosas distintas: facturación, consumo aparente o sólo
dispositivos, en años diferentes. Lo que sí coincide en todas es la
dependencia de la importación, entre dos tercios y cuatro quintos del mercado.

Estos datos importan por tres razones. El lote lo compra y lo carga el
importador o distribuidor local. Llega con la vida útil que ya consumieron el
viaje y la aduana: en las vacunas auditadas por la AGN, la liberación de un
lote llegó a demorar 281 días. Y quien lo tiene que colocar es, en la mayoría
de los casos, una empresa chica, sin un equipo dedicado a cruzar lotes con
clientes.

Ninguno de estos informes del sector mide el stock vencido, la obsolescencia o
los vencimientos. No es que el problema no exista: es que ninguna fuente
pública que encontré lo mide del lado privado.

Lo que no es opinable es la forma de la pérdida. Un lote que vence en depósito no
reduce el margen: se pierde el 100% del costo. A eso se suma la disposición
final, porque los productos vencidos se tratan como residuos peligrosos (Ley
24.051, que la AGN usa como criterio en los informes 2024-064 y 2024-077).

El riesgo, además, es del distribuidor. En el modelo de consignación lo asume
el fabricante, pero cuando el distribuidor compra el stock, el lote que no rota
es pérdida suya.

## 3. La normativa argentina define la ventana

**Comprobado.**

- **Disposición ANMAT 2565/2025** (Boletín Oficial, 22 de abril de 2025). Los
  productos médicos importados no pueden ingresar al país con menos de seis meses
  de vencimiento; los que tienen una vida útil aprobada de seis meses o menos
  quedan exceptuados mientras no estén vencidos. Derogó la Disposición 1655/99,
  que exigía doce meses. Según la prensa especializada, alcanza a gasas,
  vendas, suturas, jeringas, agujas, catéteres, guantes y otros insumos. El
  artículo 1 lo verifiqué contra el texto publicado en el Boletín Oficial.
- **Resolución 2175/2013 y Disposición ANMAT 2303/2014.** Establecen la
  trazabilidad de productos médicos, con implementación escalonada por criticidad.
  Elaboradores, importadores y distribuidores tienen que gestionar un código GLN
  de GS1. Mover un lote próximo a vencer deja rastro regulatorio, y por eso que la
  propuesta, la aprobación y el envío queden en el hilo de una tarea es la forma
  correcta de que sea auditable.

**Documentado.** CADIEM, la cámara que agrupa a la mayor parte de la industria de
productos médicos del país, le planteó al Banco Central en 2022 que el sector no
se caracteriza por mantener sobrestock, por la obsolescencia de los productos y
por su capacidad financiera. Es la voz del propio sector diciendo que el stock de
más tiene un costo concreto.

No encontré norma específica sobre la venta interna de dispositivos próximos a
vencer: el marco remite a las normas sanitarias jurisdiccionales. Por eso el
criterio lo tiene que fijar la empresa y aprobarlo una persona.

**Casos recientes.** Lo que pasa cuando el lote no se mueve a tiempo:

- **San Juan, noviembre de 2026.** Por la Disposición ANMAT 7133/2026, publicada
  el 4 de noviembre, se prohibió en todo el país el uso y la venta de sistemas
  de aspiración endotraqueal encontrados en un depósito de la ciudad de San
  Juan. El lote había vencido el 31 de diciembre de 2023: casi tres años después
  seguía en stock. ANMAT lo calificó como riesgo potencial para los pacientes y
  giró el caso a su área legal.
- **Castelli, Chaco, enero de 2024.** El gobierno provincial informó insumos y
  medicamentos vencidos o abandonados en el depósito del Hospital Bicentenario
  (jeringas, guantes, sueros, placas radiográficas, larvicidas vencidos en
  2021), con un daño que estimó en unos 100 millones de pesos. Es una denuncia
  de una gestión sobre la anterior, sin auditoría que la confirme todavía.

El caso de San Juan es el más cercano al de OpFarma: un producto médico que
nadie colocó antes de vencer y que, en vez de convertirse en una venta con
descuento, terminó en una prohibición.

## 4. Por qué los tramos empiezan a los seis meses

Tres fuentes independientes ponen el límite de utilidad comercial en el mismo
lugar:

- **Lo regulatorio:** la Disposición 2565/2025 fija seis meses como mínimo para
  importar.
- **Lo financiero:** en la valuación de distribuidoras, el stock con menos de
  seis meses de vida se valúa en cero.
- **El mercado:** el mercado secundario llama *short dated* a lo que vence en 60
  a 90 días, y eso ya es terreno de liquidadores, que compran a valores muy bajos.

Mi primera idea había sido actuar a 60 o 90 días. Las tres fuentes juntas
mostraron que esa es la ventana reactiva, en la que sólo queda rematar. La
ventana en la que todavía se puede colocar un lote casi sin perder margen está
antes de cruzar los seis meses.

## 5. Lo que ya existe, y lo que falta

| Qué existe | Qué hace | Qué no hace |
| --- | --- | --- |
| Sistemas de gestión y de inventario hospitalario | FEFO y alertas de vencimiento | No dicen a quién vendérselo |
| Proyectos de redistribución | Cruzan lote con consumo dentro de una red, entre sedes | No salen de la red |
| Marketplaces de excedentes (RevMed, MEDmarketplace, MedShorts) | Publican stock lento o corto para que otro lo compre | Esperan al comprador; no buscan al cliente |
| Liquidadores y vendedores de stock corto | Compran o venden lo que está por vencer | Recuperan una fracción del costo |
| Donación (MedShare, la red de ProPublica) | Desvían excedentes a hospitales de bajos recursos | No recuperan valor |

Uno de los proyectos de redistribución nombra el problema con precisión: el FEFO
local "evalúa sólo la demanda local de la clínica, y queda ciego a la demanda
regional que podría usar el medicamento antes de que venza".

El hueco es el movimiento activo del lado del distribuidor: cruzar cada lote
con la rotación real de cada cliente, ofrecerlo a quien lo va a consumir a
tiempo y con un precio que no regale margen, con una persona aprobando. No
encontré herramientas que lo hagan. Eso no significa que no existan, sino que no
aparecen en lo que relevé.

## 6. Voces del sector

- **Andrew Dold, cofundador de RevMed**, en el podcast *Empowered Patient*:
  describe un marketplace entre hospitales y centros quirúrgicos para el
  inventario lento o próximo a vencer. Confirma el problema y muestra que la
  respuesta del mercado hoy es una vidriera, no una colocación activa.
- **Federation of American Hospitals**, podcast *Hospitals In Focus*, episodio
  "Mission Critical": los responsables de abastecimiento cuentan que, al revisar
  sus niveles de stock por la inflación y el costo del capital, encontraron
  productos obsoletos, vencidos o inutilizables.
- **MedShare**, en *Supply Chain Now*, episodio 341: su director de operaciones
  explica que un cambio de producto deja stock viejo que los hospitales ya no
  quieren, y que la organización desvía unas 900 toneladas por año que irían a la
  basura.
- **Marshall Allen, ProPublica**, en sus entrevistas sobre *Wasted Medicine*:
  la pérdida no se ve en la factura del paciente, pero termina en el costo total
  del sistema.

No encontré una charla TED dedicada a este tema; lo más cercano es un ensayo de
TED Ideas sobre la huella ambiental de los hospitales. Tampoco encontré una
entrevista a un distribuidor argentino hablando específicamente de vencimientos.

## 7. De dónde salen las constantes del motor

| Constante | Valor | Origen |
| --- | --- | --- |
| Límite del tramo "colocar" | 181 a 270 días | La línea de los seis meses (sección 4) |
| Límite del tramo "rescate" | 31 a 90 días | La definición de *short dated* del mercado secundario |
| No ofrecer con 30 días o menos | 30 días | Criterio clínico: no dejar producto por vencer en una estantería de atención |
| Evaluar el consumo antes que el precio | — | La guía del mercado secundario: empezar por la utilización, no por el precio |
| Descuentos por tramo | 8%, 20% y 45% | Supuesto mío, escalonado; hay que calibrarlo con datos reales |
| Margen mínimo | 5% sobre el costo | Supuesto mío |
| Valor de rescate | 20% del costo | Supuesto mío, coherente con "valores muy bajos" de los liquidadores |
| Resguardo de consumo | 30 días | Supuesto mío: el cliente no tiene que terminar el lote el último día |
| Historial de compras | 180 días | Supuesto mío: suficiente para estimar rotación sin arrastrar estacionalidad vieja |

La fórmula de capacidad (días hasta el vencimiento por consumo diario) no es
mía: es la misma en los prototipos publicados de redistribución. Le agregué el
resguardo de 30 días.

## 8. Qué faltaría para validarlo del todo

Las fuentes muestran que el problema existe, que es caro y que la respuesta
actual es reactiva. En el sector público hay auditorías con cifras; en el
privado, ni la cámara ni los informes oficiales lo miden. Lo que las fuentes no
pueden mostrar es cuánto le cuesta a una distribuidora concreta ni si sus
clientes aceptarían estas ofertas. Para eso
haría falta:

1. Entrevistar a tres a cinco responsables comerciales o de depósito de
   distribuidoras, empezando por la propia empresa.
2. Medir con datos reales cuánto se dio de baja por vencimiento en los últimos
   doce meses, y cuánto de eso tenía un cliente con rotación suficiente.
3. Un piloto con un grupo acotado de lotes y cuentas, midiendo cuántas ofertas
   se aceptan y cuánto margen se recupera frente a liquidar.

## Fuentes

**Normativa y organismos de control**

- [Disposición ANMAT 2565/2025, Boletín Oficial](https://www.boletinoficial.gob.ar/detalleAviso/primera/324250/20250422) y [resumen en InfoLEG](https://www.argentina.gob.ar/normativa/nacional/norma-411929)
- [Comunicado oficial sobre la nueva normativa de vencimientos](https://www.argentina.gob.ar/noticias/nueva-normativa-sobre-fechas-de-vencimiento-de-productos-medicos-importados)
- [ANMAT, trazabilidad de productos médicos: normativa](https://www.anmat.gob.ar/trazabilidad_PM/normativa.asp) y [preguntas frecuentes](https://www.anmat.gob.ar/trazabilidad_PM/faqs.asp)
- [Disposición ANMAT 2303/2014](https://www.argentina.gob.ar/normativa/nacional/norma-229122/texto)
- [AGN, informe 2024-064: necesidades, adquisición, almacenaje, distribución y destrucción al vencimiento de vacunas, 2016-2019](https://agn.ar/sites/default/files/informes/2024-064-2024-Informe.pdf)
- [AGN, informe 2024-077: Programa 22, VIH, ETS e infectocontagiosas, 2017-2019](https://agn.ar/sites/default/files/informes/2024-077-Informe.pdf)
- [Auditora General de Canadá, reserva estratégica de emergencia (2026)](https://www.canada.ca/en/auditor-general/our-work/audit-reports/19-auditor-general-202610-public-health-emergency-stockpile.html)
- [Ontario: baja de 1.400 millones en equipos de protección (CP24)](https://www.cp24.com/politics/queens-park/2025/12/02/ontario-wrote-off-14-billion-of-personal-protective-equipment-auditor-finds/)
- [Contraloría de Paraguay, Hospital de Clínicas (RDN)](https://www.rdn.com.py/2025/12/01/contraloria-revela-perdida-de-g-2-207-millones-por-medicamentos-vencidos-en-clinicas/)
- [Vacunas vencidas en un depósito de la Ciudad, 2020 (Chequeado)](https://chequeado.com/el-explicador/que-se-sabe-sobre-las-vacunas-vencidas-que-se-encontraron/)
- [Dosis contra el COVID vencidas y descartadas, informe de la Jefatura de Gabinete (Infobae, 2022)](https://www.infobae.com/salud/2022/06/03/el-gobierno-confirmo-cuantas-vacunas-covid-se-descartaron-en-argentina/)
- [Pérdida de 30 millones de dólares en vacunas vencidas (La Nación, 2024)](https://es-us.noticias.yahoo.com/gobierno-detect%C3%B3-p%C3%A9rdida-us-30-232311124.html)
- [Disposición ANMAT 7133/2026, depósito en San Juan (El Monterizo)](https://elmonterizo.com/compraron-insumos-medicos-con-un-lote-vencido-hace-tres-anos-la-anmat-allano-un-deposito-en-capital)
- [Insumos vencidos en el Hospital de Castelli, Chaco (Diario Norte, 2024)](https://www.diarionorte.com/250702-hallaron-insumos-y-medicamentos-vencidos-ahora-en-el-hospital-de-castelli-)
- [Contraloría de Chile, Cenabast (BioBioChile, 2020)](https://www.biobiochile.cl/noticias/nacional/chile/2020/11/10/contraloria-acredita-que-cenabast-elimino-mas-de-3300-millones-en-medicamentos.shtml) y [medicamentos desechados por vencimiento (2021)](https://www.biobiochile.cl/especial/reportajes/2021/04/22/a-la-basura-salud-desecha-35-millones-de-medicamentos-por-vencimiento-descubierto-por-contraloria.shtml)

**Estudios e investigaciones**

- [ProPublica, *What Hospitals Waste*](https://www.propublica.org/article/what-hospitals-waste)
- [Operating room waste in neurosurgical procedures, UCSF (PubMed)](https://pubmed.ncbi.nlm.nih.gov/27153160/)
- [Costs of disposable and reusable supplies wasted during surgeries (PubMed)](https://pubmed.ncbi.nlm.nih.gov/29432971/)
- [Santos y otros, materiales y medicamentos descartados en un hospital de Belo Horizonte, 2015-2019 (*Cleaner Waste Systems*, 2022)](https://www.sciencedirect.com/science/article/pii/S277291252200046X)
- [Alanazi y otros, inventario de siete años en King Abdulaziz Medical City (*Risk Management and Healthcare Policy*, 2024)](https://www.dovepress.com/reducing-pharmaceutical-and-non-pharmaceutical-inventory-waste-in-tert-peer-reviewed-fulltext-article-RMHP)
- [Kamba y otros, stocks de medicamentos vencidos en países de ingresos bajos y medios (*Bulletin of the WHO*, 2017)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5537748/)
- [Prototipo de redistribución según vencimiento](https://github.com/shamanthsaravanan/expiry-aware-stock-redistribution-recommender)

**Sector, mercado y entrevistas**

- [CADIEM, informe sectorial (febrero de 2019)](https://cadiem.org.ar)
- [Ministerio de Hacienda, informe de cadena de valor: equipamiento médico (junio de 2019)](https://www.argentina.gob.ar/sites/default/files/sspmicro_cadenas_de_valor_equipamiento_medico_0.pdf)
- [CEPAL, *Desarrollo de proveedores de la industria de dispositivos médicos en la Argentina* (Robbio y Resquín, 2024)](https://ideas.repec.org/p/ecr/col022/81162.html)
- [Vázquez, "De la autonomía sanitaria a la dependencia tecnológica: una historia de la industria de dispositivos médicos en Argentina" (*H-industria*, 2025)](https://doi.org/10.56503/H-Industria/n.36(19)/3291)
- [Gil, "Seguridad, autonomía e industria: el equipamiento médico en el Mercosur" (*URVIO*, 2022)](https://www.redalyc.org/journal/5526/552669898001/)
- [Guía comercial de Estados Unidos: productos médicos en Argentina (2025)](https://www.trade.gov/country-commercial-guides/argentina-medical-products)
- [GHX, recuentos de inventario y productos vencidos (2025)](https://www.ghx.com/the-healthcare-hub/the-hidden-cost-of-expired-supplies-lessons-from-hospital-inventory-counts/)
- [CADIEM, carta al Banco Central (La Nación, 2022)](https://www.lanacion.com.ar/economia/la-camara-de-insumos-medicos-pidio-al-banco-central-que-excluya-al-sector-de-la-limitacion-para-nid19072022/)
- [RevMed, entrevista a Andrew Dold (Empowered Patient)](https://empoweredpatientradio.com/medical-marketplace-for-hospitals-and-surgery-centers-of-stale-or-excess-inventory-saves-money-reduces-waste-with-dr-andrew-dold-revmed-transcript)
- [Hospitals In Focus, "Mission Critical"](https://fah.org/podcasts/mission-critical-strengthening-health-cares-supply-chain/)
- [Supply Chain Now, episodio 341 (MedShare)](https://supplychainnow.com/episode-341/)
- [Guía del mercado secundario de stock corto (Primis Medical)](https://primismedical.com/blogs/news/short-dated-medical-supply-marketplace-guide)
- [Valuación de distribuidoras de insumos médicos (CT Acquisitions)](https://ctacquisitions.com/how-to-value-a-medical-supply-company/)
- [Bajas de inventario en dispositivos médicos (ConnectSx)](https://connectsx.com/blog/elminate-expired-inventory-risk)
- [Costo del inventario en consignación vencido (MoveMedical)](https://movemedical.com/post/expired-consignment-inventory-doesnt-disappear-heres-what-it-actually-costs----and-how-leading-medtechs-stopped-it)

*Cómo leí las fuentes:* las normas, contra el Boletín Oficial, InfoLEG y los
comunicados oficiales. Los informes de la AGN, el de CADIEM, los de Hacienda y
CEPAL, el artículo de Vázquez y el estudio de Belo Horizonte, completos; los de
Riad y Uganda, hasta sus conclusiones. Las auditorías de Ontario, Paraguay y Chile, las cifras de vacunas
posteriores a 2019 y los casos de San Juan y Castelli, a partir de la prensa. Los
estudios de quirófano, a partir de sus resúmenes. Antes de usar cualquiera de
estos datos en una decisión real conviene leer el texto completo de cada fuente.
