# El problema: lotes que se vencen antes de venderse

Este documento respalda la elección del problema y las constantes del motor.
Lo armé antes de escribir código y lo amplié al cierre con auditorías oficiales,
normativa, estudios, casos y entrevistas del sector. Relevado entre el 8 y el 9
de noviembre de 2026.

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
- **Argentina, AGN.** El informe de gestión 2024-064 sobre vacunas e insumos del
  Ministerio de Salud de la Nación examina la adquisición, el control de stock y
  el descarte, y cita como antecedente una advertencia de la auditoría interna
  sobre más de cuatro millones de vacunas vencidas e insumos.
- **Argentina, SIGEN, 2025.** Una auditoría constató insumos vencidos o no aptos
  para distribución en los operadores logísticos del Ministerio de Salud, con
  costos adicionales de almacenamiento, e irregularidades en la disposición de
  lo vencido. A abril de 2025 figuraba sin acción correctiva informada.
- **Paraguay, Contraloría, 2025.** Detectó medicamentos e insumos vencidos en
  depósitos del Hospital de Clínicas, con pérdidas por 2.207 millones de
  guaraníes, y atribuyó el desperdicio a la falta de controles y procedimientos.
- **Chile, Contraloría.** En 2020 acreditó que la Central de Abastecimiento
  eliminó más de 3.300 millones de pesos chilenos en medicamentos, y en 2021, que
  el sistema de salud desechó 35 millones de medicamentos por vencimiento.

**Documentado.**

- **ProPublica, 2017.** La serie *What Hospitals Waste*, de Marshall Allen,
  mostró que los hospitales de Estados Unidos descartan rutinariamente insumos
  nuevos y sin vencer, entre ellos cajas de suturas sin abrir, como consecuencia
  de los acuerdos de compra y las prácticas de abastecimiento.
- **Estudios en quirófano.** En UCSF, los insumos descartados sin usar promediaron
  653 dólares por cirugía, el 13,1% del costo de insumos, y los autores lo
  extrapolaron a 2,9 millones de dólares por año sólo en neurocirugía. En un
  hospital francés, lo desperdiciado llegó al 20,1% del costo de insumos
  quirúrgicos. En un hospital brasileño, lo descartado entre 2015 y 2019,
  incluido lo vencido, sumó 108.722 dólares.

Estos estudios miden sobre todo insumos abiertos y no usados, no sólo vencidos.
Los incluyo porque muestran la misma falla de fondo: el stock no se corresponde
con el consumo real.

## 2. La magnitud en un distribuidor

**Estimado.** Las cifras que circulan para fabricantes y distribuidores de
dispositivos médicos vienen de proveedores de software: entre el 1% y el 4% del
inventario se da de baja cada año, y entre el 2% y el 4% específicamente por
vencimiento. Un proveedor llega a estimar que hasta el 30% del inventario
hospitalario podría vencer antes de usarse, pero no publica la fuente primaria.
No encontré informes independientes de consultoras ni de cámaras del sector con
este dato.

Lo que no es opinable es la forma de la pérdida. Un lote que vence en depósito no
reduce el margen: se pierde el 100% del costo. A eso se suma la disposición
final, porque los productos vencidos se tratan como residuos peligrosos (Ley
24.051, citada por la AGN en el informe 2024-077).

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
actual es reactiva. Lo que no pueden mostrar es cuánto le cuesta a una
distribuidora concreta ni si sus clientes aceptarían estas ofertas. Para eso
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
- [AGN, informe 2024-064, Ministerio de Salud de la Nación](https://agn.ar/sites/default/files/informes/2024-064-2024-Informe.pdf)
- [AGN, informe 2024-077](https://agn.ar/sites/default/files/informes/2024-077-Informe.pdf)
- [Auditoría de la SIGEN sobre medicamentos e insumos vencidos (Diario Panorama)](https://www.diariopanorama.com/noticia/519548/auditoria-sigen-detecto-graves-fallas-controles-vacunas-vencidas-gestion-kirchnerista.html)
- [Auditora General de Canadá, reserva estratégica de emergencia (2026)](https://www.canada.ca/en/auditor-general/our-work/audit-reports/19-auditor-general-202610-public-health-emergency-stockpile.html)
- [Ontario: baja de 1.400 millones en equipos de protección (CP24)](https://www.cp24.com/politics/queens-park/2025/12/02/ontario-wrote-off-14-billion-of-personal-protective-equipment-auditor-finds/)
- [Contraloría de Paraguay, Hospital de Clínicas (RDN)](https://www.rdn.com.py/2025/12/01/contraloria-revela-perdida-de-g-2-207-millones-por-medicamentos-vencidos-en-clinicas/)
- [Contraloría de Chile, Cenabast (BioBioChile, 2020)](https://www.biobiochile.cl/noticias/nacional/chile/2020/11/10/contraloria-acredita-que-cenabast-elimino-mas-de-3300-millones-en-medicamentos.shtml) y [medicamentos desechados por vencimiento (2021)](https://www.biobiochile.cl/especial/reportajes/2021/04/22/a-la-basura-salud-desecha-35-millones-de-medicamentos-por-vencimiento-descubierto-por-contraloria.shtml)

**Estudios e investigaciones**

- [ProPublica, *What Hospitals Waste*](https://www.propublica.org/article/what-hospitals-waste)
- [Operating room waste in neurosurgical procedures, UCSF (PubMed)](https://pubmed.ncbi.nlm.nih.gov/27153160/)
- [Costs of disposable and reusable supplies wasted during surgeries (PubMed)](https://pubmed.ncbi.nlm.nih.gov/29432971/)
- [Materiales y medicamentos descartados en un hospital brasileño, 2015-2019](https://www.sciencedirect.com/science/article/pii/S277291252200046X)
- [Prototipo de redistribución según vencimiento](https://github.com/shamanthsaravanan/expiry-aware-stock-redistribution-recommender)

**Sector, mercado y entrevistas**

- [CADIEM, carta al Banco Central (La Nación, 2022)](https://www.lanacion.com.ar/economia/la-camara-de-insumos-medicos-pidio-al-banco-central-que-excluya-al-sector-de-la-limitacion-para-nid19072022/)
- [RevMed, entrevista a Andrew Dold (Empowered Patient)](https://empoweredpatientradio.com/medical-marketplace-for-hospitals-and-surgery-centers-of-stale-or-excess-inventory-saves-money-reduces-waste-with-dr-andrew-dold-revmed-transcript)
- [Hospitals In Focus, "Mission Critical"](https://fah.org/podcasts/mission-critical-strengthening-health-cares-supply-chain/)
- [Supply Chain Now, episodio 341 (MedShare)](https://supplychainnow.com/episode-341/)
- [Guía del mercado secundario de stock corto (Primis Medical)](https://primismedical.com/blogs/news/short-dated-medical-supply-marketplace-guide)
- [Valuación de distribuidoras de insumos médicos (CT Acquisitions)](https://ctacquisitions.com/how-to-value-a-medical-supply-company/)
- [Bajas de inventario en dispositivos médicos (ConnectSx)](https://connectsx.com/blog/elminate-expired-inventory-risk)
- [Costo del inventario en consignación vencido (MoveMedical)](https://movemedical.com/post/expired-consignment-inventory-doesnt-disappear-heres-what-it-actually-costs----and-how-leading-medtechs-stopped-it)

*Una advertencia:* las normas las cito a partir del Boletín Oficial, de InfoLEG y
de comunicados oficiales; los informes de auditoría, a partir de sus versiones
publicadas y de la prensa. Antes de usar cualquiera de estos datos en una decisión
real conviene leer el texto completo de cada fuente.
