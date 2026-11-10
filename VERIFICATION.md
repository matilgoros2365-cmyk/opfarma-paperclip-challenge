# Cómo lo verifiqué

No di nada por bueno porque haya funcionado una vez. Cada afirmación de esta
entrega la chequeé desde al menos dos ángulos distintos, y lo que no pude
comprobar lo dejo dicho al final. Todo lo que es automático se puede repetir con
los comandos que indico.

## Resumen

| Ángulo | Qué verifiqué | Resultado |
| --- | --- | --- |
| Corrección del motor | Tests por módulo, una verificación independiente y pruebas de mutación | 183 tests en verde; 8 de 8 roturas detectadas |
| Webhook de WhatsApp | Firma, suscripción y lectura de avisos, en tests y contra el servidor | Sólo acepta avisos firmados por Meta |
| Cálculo a mano | Cada oferta, recalculada antes de aprobarla | 5 de 5 coinciden con el motor |
| Integración con Paperclip | Revisión, aprobación y envío, contra la auditoría de Paperclip | Circuito completo con evidencia en el historial |
| Políticas de aprobación | Cada agente contra el endpoint de prueba de políticas | StockScout requiere aprobación; MarginReviewer bloqueado |
| Reproducibilidad | Clon limpio del repo público, instalación, build y setup repetido | Todo pasa; el setup no duplica nada |
| Prueba de humo | Las siete herramientas, como las usaría un agente, incluidos los rechazos | 16 de 16, en local y en producción |
| Windows con WSL2 | Instalación desde cero siguiendo el README, una corrida real de un agente y un envío real | Agentes funcionando y oferta entregada y leída; tres fallas del setup encontradas y corregidas |
| Dependencias y configuración | Vulnerabilidades conocidas y variables de entorno contra la documentación | 0 vulnerabilidades; una variable sin documentar, corregida |
| Deploy | La plataforma y los MCP en producción | Página en línea; MCP rechazan sin clave y responden con ella |
| Seguridad | Credenciales en el historial de git y valores por defecto | Ninguna credencial publicada; envío apagado por defecto |
| Documentación | Cada documento contra el enunciado, y los números entre sí | Inconsistencias encontradas y corregidas |

## 1. Corrección del motor

**Tests por módulo.** El motor, la construcción de ofertas, los borradores, el
canal de WhatsApp y su configuración tienen sus propios tests, con los errores
de la Graph API simulados.

**Una verificación independiente.** El archivo `platform/test/oracle.test.ts`
rehace todas las cuentas desde la especificación escrita, sin importar ninguna
función de cálculo del motor, y cuenta los días con otro método. Las compara con
el motor en las 48 combinaciones de lote y cuenta del dataset: días al
vencimiento, tramo, consumo mensual, capacidad, cobertura, motivos de
descalificación, precio y valor en riesgo. También recorre los bordes de los
tramos día por día, de 0 a 400, y fija los números que citan los documentos y la
página ($3.004.000 en riesgo, 5 lotes colocables por $1.888.000, L-7703 de baja).

**Pruebas de mutación.** Para comprobar que esa verificación detecta errores de
verdad, rompí el motor a propósito de ocho formas y corrí los tests cada vez:

| Rotura introducida | Detectada |
| --- | --- |
| Días de resguardo: 30 → 29 | Sí, 17 tests fallan |
| Descuento del tramo "descuento": 20% → 25% | Sí, 18 tests fallan |
| Margen mínimo: 5% → 4% | Sí, 7 tests fallan |
| La deuda deja de descalificar | Sí, 8 tests fallan |
| Borde del tramo "colocar": 181 → 180 días | Sí, después de agregar el test de bordes |
| Borde del tramo "descuento": 91 → 92 días | Sí |
| Borde del tramo "rescate": 31 → 30 días | Sí |
| Borde del tramo "sano": 271 → 270 días | Sí |

En la primera ronda, correr un borde en un día pasaba inadvertido, porque ningún
lote del dataset cae justo en un límite. Por eso agregué el recorrido de 0 a 400
días, y desde entonces se detectan las ocho.

```bash
cd platform && npm test
```

## 2. Cálculo a mano

Antes de aprobar cada oferta en Paperclip, la recalculé por mi cuenta: conté los
días hasta el vencimiento mes por mes, apliqué el descuento del tramo, verifiqué
el piso de margen, la capacidad de consumo con los 30 días de resguardo y el
valor de rescate.

| Lote | Cuenta | Días | Precio | Total | Coincide |
| --- | --- | --- | --- | --- | --- |
| L-4028 | Sanatorio del Parque | 75 | $1.260 (frenado en el piso) | $151.200 | Sí |
| L-6612 | Ninguna lo absorbe entero | 98 | — | — | Sí |
| L-8890 | Sanatorio del Parque | 114 | $7.120 | $427.200 | Sí |
| L-5511 | Sanatorio del Parque | 153 | $11.920 | $476.800 | Sí |
| L-3345 | Laboratorio Centro | 193 | $62.560 | $625.600 | Sí |
| L-2201 | Centro Odontológico Belgrano | 222 | $4.784 | $956.800 | Sí |

Además, cada respuesta que le di al agente en OPF-1 pasó por una segunda revisión
independiente antes de enviarla. Esa revisión encontró un error en mi primera
propuesta para L-6612: dividir el lote entre dos clínicas contaba dos veces la
demanda de una de ellas, que ya tenía comprometido otro lote de la misma sutura.
La respuesta final se corrigió, y el caso quedó como mejora pendiente del motor.

## 3. Integración con Paperclip

**El circuito de revisión (OPF-2).** StockScout pasó la tarea a `in_review`,
Paperclip la reasignó a MarginReviewer, el revisor aprobó y la tarea quedó a la
espera de la aprobación humana. Las dos decisiones quedaron en el hilo.

**El envío (OPF-3), contra la auditoría de Paperclip.** No me alcanzó con lo que
decía el hilo, así que lo crucé con cuatro fuentes: la actividad de la tarea, la
de toda la compañía, el registro de la acción y la tarjeta de aprobación.

| Hora (UTC) | Evento |
| --- | --- |
| 06:01:48 | Se crea la política `require_approval` para StockScout |
| 06:20:14 | StockScout llama al envío: `require_approval`, motivo `requires_approval_policy` |
| 06:21:12 | Apruebo la tarjeta |
| 06:21:12 | Paperclip ejecuta la llamada: `approved` → `executing` → `executed` |
| 06:23:50 | El agente deja en el hilo la respuesta del servidor: `dry_run: true` y el payload exacto |

Después de crear la política no hubo ninguna llamada al envío aprobada
automáticamente, en ninguna tarea ni con ningún agente. La única que pasó sin
aprobación es anterior, y es la que llevó a crear la política.

**Las políticas, una por una.** Las probé con el endpoint de prueba de
políticas de Paperclip, que decide sin ejecutar nada:

| Agente y herramienta | Antes | Después |
| --- | --- | --- |
| StockScout → `whatsapp_send_message` | `allow` | `require_approval` |
| MarginReviewer → `whatsapp_send_message` | `allow` | `deny` |
| StockScout → `whatsapp_draft_message` | `allow` | `allow` (el borrador no se ve afectado) |

**El hash del borrador.** Contra el servidor en ejecución: un envío con el
`draft_id` correcto devuelve el dry-run; el mismo envío con una palabra cambiada
se rechaza.

**El envío real (OPF-7).** Contra Meta, con la cuenta de prueba: el primer
intento volvió con 131030 (formato del número), el segundo con 132001 (plantilla
en revisión) y el tercero, con `hello_world`, fue aceptado y Meta devolvió su
identificador. Un segundo después, el aviso de estado llegó firmado al webhook en
Vercel con `failed` y el error 131031 (cuenta bloqueada), se guardó en el almacén
y el agente lo leyó con `whatsapp_delivery_status` y lo registró en la tarea. El
circuito de ida y vuelta quedó probado con Meta real; el mensaje no llegó al
celular por el bloqueo de esa cuenta.

**La entrega, con una cuenta propia.** Con una cuenta de WhatsApp Business nueva,
sólo de OpFarma, el cuarto intento mandó la oferta real de L-4028 como texto,
dentro de la ventana de 24 horas que abrió el destinatario. Después de mi
aprobación en Paperclip, el mensaje llegó al celular, y la plataforma en
producción mostró los avisos de Meta: enviado y entregado y, cuando abrí el
mensaje con las confirmaciones de lectura activadas, leído; con el número
enmascarado y cada estado una sola vez. Antes, Paperclip se había negado a repetir un envío con argumentos
idénticos a uno ya ejecutado, que es su protección contra duplicados.

**La entrega desde Windows (OPF-4).** El mismo circuito, con Paperclip en Ubuntu
dentro de WSL2 y el canal de WhatsApp en Vercel, sin credenciales en la máquina
local. La prueba sirvió además como control: con el canal todavía sin
credenciales y luego con una variable mal cargada, StockScout se negó a enviar y
explicó por qué, en lugar de improvisar un destinatario. Con la configuración
corregida, armó el borrador hacia el único número habilitado, esperó mi
aprobación, y el mensaje llegó al celular; la plataforma mostró enviado,
entregado y leído a las 21:36.

**El webhook de estado.** Los tests cubren la firma (válida, con otro secreto,
con el cuerpo modificado después de firmar, ausente o mal formada), el
handshake de suscripción, la lectura de cada estado y que una respuesta del
cliente se registre sin guardar su contenido. Contra el servidor en ejecución,
con un aviso firmado como lo manda Meta:

| Pedido | Respuesta |
| --- | --- |
| Suscripción con el token correcto | Devuelve el desafío |
| Suscripción con otro token | 403 |
| Aviso firmado | 200 |
| Aviso sin firma | 401 |
| Aviso con la firma alterada | 401 |

**La plantilla.** Los tests verifican que cumpla las reglas de Meta (variables
numeradas sin saltos, que no empiece ni termine con una variable, un ejemplo por
variable y los límites de largo) y que cada una de las cinco ofertas complete las
siete variables sin saltos de línea.

## 4. Reproducibilidad

- **Clon limpio.** Cloné el repo público en una carpeta vacía, instalé con
  `npm ci` (2 minutos), compilé sin errores de tipos, corrí los tests y generé el
  build de producción. Todo pasó sin tocar nada.
- **El setup, dos veces.** Corrí `setup-company.mjs` contra una instancia real de
  Paperclip ya configurada: cada recurso respondió "ya existía" y no se duplicó
  nada. La política nueva del revisor se creó en esa misma corrida.
- **Tres entornos.** El setup corrió en Windows, en macOS y en Ubuntu dentro de
  WSL2. En macOS exigió un ajuste, el runner, que dejé configurable y
  documentado.
- **Una instalación desde cero en WSL2, siguiendo el README.** Sirvió para
  encontrar lo que en la Mac no se veía: el servicio de Paperclip no encontraba
  Claude Code, el setup no instalaba las conexiones para los agentes y una key
  equivocada quedaba pegada al volver a correrlo. Corregidas las tres, el
  chequeo de los agentes pasó, las decisiones de política coincidieron una por
  una con las de la Mac, una segunda corrida del setup no duplicó nada, y
  StockScout completó OPF-1 con las herramientas de Vercel y los mismos números.
- **Un segundo clon limpio** al cierre, con todo lo agregado después: instala,
  compila sin errores, pasa los tests y genera el build con las rutas del
  webhook incluidas.

**La prueba de humo.** `platform/scripts/smoke.mjs` usa las siete herramientas
como las usaría un agente, contra cualquier instancia, y verifica también lo que
tiene que fallar: sin clave y con una clave incorrecta (401), un lote a punto de
vencer, una cuenta bloqueada, un mensaje cambiado después de aprobar y un envío
sin confirmar. Está hecha para no poder mandar un mensaje real: los únicos
envíos que prueba son los que el servidor debe rechazar antes de llegar a Meta.
Pasó 16 de 16 contra el servidor local y 16 de 16 contra producción, en Vercel.

```bash
cd platform && SMOKE_BASE_URL=http://127.0.0.1:3200 MCP_API_KEY=... node scripts/smoke.mjs
```

**Dependencias y configuración.** `npm audit` sobre las dependencias de
producción no encontró vulnerabilidades. Crucé cada variable de entorno que lee
el código con `.env.example`: faltaba una, la que elige la plantilla de la
oferta, y la agregué. Las demás que no figuran ahí son de los scripts de setup,
y cada script las documenta en su encabezado.

## 5. Deploy

Contra <https://opfarma-paperclip-challenge.vercel.app>:

| Pedido | Respuesta esperada | Respuesta |
| --- | --- | --- |
| La página | 200 | 200 |
| `/api/mcp/inventory` sin clave | 401 | 401 |
| `/api/mcp/whatsapp` sin clave | 401 | 401 |
| Con una clave incorrecta | 401 | 401 |
| Con la clave correcta | 200 y tres herramientas por servidor | 200 y tres herramientas por servidor |

Los números de la página coinciden con los del motor, porque los calcula el mismo
código, y los fija el test de la sección 1. La revisé en escritorio y en ancho de
celular, sin desplazamiento horizontal.

## 6. Seguridad

- Busqué credenciales en todo el historial de git (claves de Anthropic, tokens de
  Paperclip y de Meta): no hay ninguna publicada. Los archivos con secretos
  locales están excluidos del repo.
- El envío está apagado por defecto: sólo se habilita con
  `WHATSAPP_ALLOW_SEND=true` exacto, y aun así exige credenciales de Meta, la
  aprobación en Paperclip y un `draft_id` que coincida.
- El revisor no puede enviar: tiene el envío bloqueado por política.

## 7. Documentación

Revisé cada documento contra el enunciado y los crucé entre sí. Encontré y
corregí lo siguiente:

- El README afirmaba que el envío pedía aprobación cuando todavía no era cierto.
  Se corrigió al encontrarlo, y hoy es cierto.
- `DECISIONS.md` tenía siete páginas y el enunciado pide media. Quedó en media
  página, y el detalle pasó a [`docs/BITACORA.md`](docs/BITACORA.md).
- Las instrucciones de instalación estaban pensadas para Windows, donde los
  agentes no arrancan. Las reescribí para macOS y Linux, con los ajustes que
  efectivamente funcionaron.
- La ruta de trabajo de los agentes estaba fija a una carpeta de Windows. Ahora
  se calcula desde el repo, y el setup la crea como repositorio de git.
- El ejemplo de variables de entorno describía una forma de autenticación que el
  setup no usa, y le faltaba la fecha del inventario.
- La investigación del problema afirmaba que nadie hacía esta colocación. Al
  ampliarla con auditorías, normas, estudios y entrevistas, encontré marketplaces
  de excedentes que no había considerado, y precisé la afirmación: existen
  vidrieras, no colocación activa del lado del distribuidor. También separé lo que
  está comprobado, lo documentado y lo estimado, y marqué qué constantes del
  motor salen de una fuente y cuáles son supuestos míos.

## 8. Lo que no pude verificar

- **Las plantillas aprobadas.** Las dos plantillas de la oferta seguían en
  revisión de Meta al cierre, así que la oferta viajó como texto; el envío con
  plantilla está probado en código y en los tests, no contra Meta.
- **La intercepción de `done`.** El agente pidió revisión por su cuenta en lugar
  de intentar cerrar la tarea, así que nunca vi al runtime frenarlo.
- **Linux fuera de WSL2.** Los agentes corrieron en macOS y en Ubuntu dentro de
  WSL2; no lo probé en un servidor Linux.
- **Los 10 minutos con otra persona.** Las instrucciones las validé en mi propio
  recorrido, no con alguien que las siga desde cero.
- **Las fuentes del problema, una por una.** La normativa la verifiqué contra el
  Boletín Oficial y los sitios de ANMAT. Leí completos los dos informes de la
  AGN, el informe sectorial de CADIEM, los de Hacienda y CEPAL, el artículo de
  Vázquez, y los estudios de Belo Horizonte, Riad y Uganda. Las auditorías de Ontario,
  Paraguay y Chile y los casos argentinos recientes los cito a partir de la
  prensa, y los estudios de quirófano, a partir de sus resúmenes. El detalle
  está en [`research/EXPIRY.md`](research/EXPIRY.md).
- **El problema con una distribuidora real.** Las fuentes muestran que existe y
  que es caro, pero no cuánto le cuesta a una empresa concreta. Eso requiere
  entrevistas y datos propios, y lo dejé planteado como próximo paso.
