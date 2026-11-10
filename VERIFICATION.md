# Cómo lo verifiqué

No di nada por bueno porque haya funcionado una vez. Cada afirmación de esta
entrega la chequeé desde al menos dos ángulos distintos, y lo que no pude
comprobar lo dejo dicho al final. Todo lo que es automático se puede repetir con
los comandos que indico.

## Resumen

| Ángulo | Qué verifiqué | Resultado |
| --- | --- | --- |
| Corrección del motor | Tests por módulo, una verificación independiente y pruebas de mutación | 209 tests en verde; 8 de 8 roturas detectadas |
| Webhook de WhatsApp | Firma, suscripción y lectura de avisos, en tests y contra el servidor | Sólo acepta avisos firmados por Meta |
| Cálculo a mano | Cada oferta, recalculada antes de aprobarla | 5 ofertas y un rechazo, los 6 coinciden con el motor |
| Integración con Paperclip | Revisión, aprobación y envío, contra la auditoría de Paperclip | Circuito completo con evidencia en el historial |
| Políticas de aprobación | Cada agente contra el endpoint de prueba de políticas | StockScout requiere aprobación para el margen, el envío y el posteo; MarginReviewer bloqueado en los tres |
| Reproducibilidad | Clon limpio del repo público, instalación, build y setup repetido | Todo pasa; el setup no duplica nada |
| Prueba de humo | Las herramientas de los tres servidores, como las usaría un agente, incluidos los rechazos | 23 de 23 en producción |
| Windows con WSL2 | Instalación desde cero siguiendo el README, una corrida real de un agente y un envío real | Agentes funcionando y oferta entregada y leída; tres fallas del setup encontradas y corregidas |
| Dependencias y configuración | Vulnerabilidades conocidas y variables de entorno contra la documentación | 0 vulnerabilidades; una variable sin documentar, corregida |
| Deploy | La plataforma y los MCP en producción | Página en línea; MCP rechazan sin clave y responden con ella |
| Seguridad | Credenciales en el historial de git y valores por defecto | Ninguna credencial publicada; envío apagado por defecto |
| Documentación | Cada documento contra el enunciado, y los números entre sí | Inconsistencias encontradas y corregidas |

## En números

Todo lo que sigue está detallado más abajo; acá lo junto para que se vea la
escala.

| Qué | Cuántas veces |
| --- | --- |
| Tests automáticos, en 10 archivos | 209, todos en verde |
| Combinaciones de lote y cuenta recalculadas por una verificación independiente | 48 de 48 |
| Días recorridos uno por uno para probar los bordes de los tramos | 401, del 0 al 400 |
| Errores introducidos a propósito en el motor para ver si los tests los detectan | 8, detectados los 8 |
| Ofertas recalculadas a mano antes de aprobarlas | 6 de 6 coinciden |
| Fuentes de Paperclip cruzadas para auditar el envío | 4 |
| Decisiones de política probadas sin ejecutar nada | 3 por instalación, en 2 instalaciones, idénticas |
| Chequeos de la prueba de humo | 16 de 16 al principio; 23 de 23 con el margen y las redes |
| Pedidos al webhook con firmas válidas, alteradas o ausentes | 5, cada uno con la respuesta esperada |
| Pedidos de control contra producción | 5 en el deploy y otros 5 en la revisión final |
| Entornos donde corrió el setup | 3 (Windows, macOS y Ubuntu en WSL2) |
| Corridas del setup sobre una compañía existente, sin duplicar nada | 3 |
| Clones limpios del repo público, instalados y compilados desde cero | 3, uno de ellos con reloj siguiendo el README |
| Mensajes reales entregados en un celular | 5, tres desde la Mac y dos desde Windows |
| Veces que el agente se negó a enviar con una configuración incorrecta, en vez de improvisar | 2 |
| Inconsistencias de documentación encontradas y corregidas | 6 |
| Informes y estudios del problema leídos en su texto original | 9 (7 completos y 2 hasta sus conclusiones) |

## Los tipos de prueba

Ninguna prueba sola alcanza, porque cada una ve un tipo de error y es ciega a
otros. Por eso combiné estas, cada una desde un ángulo distinto.

| Tipo | Qué pregunta responde | Dónde |
| --- | --- | --- |
| Tests unitarios | ¿Cada pieza hace lo que dice? | Sección 1 |
| Verificación independiente (un segundo cálculo, escrito aparte) | ¿El motor da lo mismo que alguien que hace las cuentas desde la especificación, sin mirar su código? | Sección 1 |
| Barrido de bordes | ¿Qué pasa justo en el límite de cada tramo, día por día? | Sección 1 |
| Pruebas de mutación | ¿Los tests detectan un error si lo hay, o pasan siempre? | Sección 1 |
| Cálculo a mano | ¿Una persona llega a los mismos números antes de aprobar? | Sección 2 |
| Segunda revisión de cada decisión | ¿Mi respuesta al agente tiene un error que yo no vi? | Sección 2 |
| Auditoría cruzada | ¿Lo que dice el hilo coincide con los registros de Paperclip? | Sección 3 |
| Pruebas de política sin ejecutar | ¿Cada agente puede hacer exactamente lo que debe, y nada más? | Sección 3 |
| Pruebas negativas y de manipulación | ¿Se rechaza lo que tiene que rechazarse, como un pedido sin clave, una firma alterada o un mensaje cambiado después de aprobar? | Secciones 3 y 4 |
| Punta a punta con Meta real | ¿El mensaje llega de verdad a un celular, y el aviso vuelve? | Sección 3 |
| Prueba de humo | ¿Las herramientas responden bien, usadas como las usaría un agente? | Sección 4 |
| Reproducibilidad | ¿Funciona en una carpeta vacía, a partir del repo público? | Sección 4 |
| Multiplataforma | ¿Funciona en Windows, macOS y Linux? | Sección 4 |
| Idempotencia | ¿Correr el setup de nuevo rompe o duplica algo? | Sección 4 |
| Auditoría de dependencias | ¿Hay vulnerabilidades conocidas? | Sección 4 |
| Producción | ¿Lo deployado se comporta como lo local? | Sección 5 |
| Búsqueda de secretos | ¿Quedó alguna credencial o dato personal en el repo? | Secciones 6 y 8 |
| Coherencia de documentos | ¿Los documentos dicen la verdad y coinciden entre sí? | Secciones 7 y 8 |

## 1. Corrección del motor

**Tests por módulo.** El motor, la construcción de ofertas, los borradores, el
canal de WhatsApp y su configuración tienen sus propios tests, con los errores
de la Graph API simulados.

**Una verificación independiente.** El archivo `platform/test/oracle.test.ts`
rehace todas las cuentas desde la especificación escrita, sin importar ninguna
función de cálculo del motor, y cuenta los días con otro método. En las 48
combinaciones de lote y cuenta del dataset compara con el motor los días al
vencimiento, el tramo, el consumo mensual, la capacidad, la cobertura, los
motivos de descalificación, el precio y el valor en riesgo. También recorre los
bordes de los tramos día por día, de 0 a 400, y fija los números que citan los
documentos y la página ($3.004.000 en riesgo, 5 lotes colocables por
$1.888.000, L-7703 de baja).

**Pruebas de mutación.** Para comprobar que esa verificación detecta errores de
verdad, rompí el motor a propósito de ocho formas y corrí los tests cada vez.

| Rotura introducida | Detectada |
| --- | --- |
| Días de resguardo, de 30 a 29 | Sí, 17 tests fallan |
| Descuento del tramo "descuento", de 20% a 25% | Sí, 18 tests fallan |
| Margen mínimo, de 5% a 4% | Sí, 7 tests fallan |
| La deuda deja de descalificar | Sí, 8 tests fallan |
| Borde del tramo "colocar", de 181 a 180 días | Sí, después de agregar el test de bordes |
| Borde del tramo "descuento", de 91 a 92 días | Sí |
| Borde del tramo "rescate", de 31 a 30 días | Sí |
| Borde del tramo "sano", de 271 a 270 días | Sí |

En la primera ronda, correr un borde en un día pasaba inadvertido, porque ningún
lote del dataset cae justo en un límite. Por eso agregué el recorrido de 0 a 400
días, y desde entonces se detectan las ocho.

```bash
cd platform && npm test
```

## 2. Cálculo a mano

Antes de aprobar cada oferta en Paperclip, la recalculé por mi cuenta. Conté los
días hasta el vencimiento mes por mes, apliqué el descuento del tramo y verifiqué
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
propuesta para L-6612. Dividir el lote entre dos clínicas contaba dos veces la
demanda de una de ellas, que ya tenía comprometido otro lote de la misma sutura.
La respuesta final se corrigió, y el caso quedó como mejora pendiente del motor.

## 3. Integración con Paperclip

**El circuito de revisión (OPF-2).** StockScout pasó la tarea a `in_review`,
Paperclip la reasignó a MarginReviewer, el revisor aprobó y la tarea quedó a la
espera de la aprobación humana. Las dos decisiones quedaron en el hilo.

**El envío (OPF-3), contra la auditoría de Paperclip.** No me alcanzó con lo que
decía el hilo, así que lo crucé con cuatro fuentes, que son la actividad de la
tarea, la de toda la compañía, el registro de la acción y la tarjeta de
aprobación.

| Hora (UTC) | Evento |
| --- | --- |
| 06:01:48 | Se crea la política `require_approval` para StockScout |
| 06:20:14 | StockScout llama al envío, que queda en `require_approval` con motivo `requires_approval_policy` |
| 06:21:12 | Apruebo la tarjeta |
| 06:21:12 | Paperclip ejecuta la llamada, que pasa por `approved` → `executing` → `executed` |
| 06:23:50 | El agente deja en el hilo la respuesta del servidor, con `dry_run: true` y el payload exacto |

Después de crear la política no hubo ninguna llamada al envío aprobada
automáticamente, en ninguna tarea ni con ningún agente. La única que pasó sin
aprobación es anterior, y es la que llevó a crear la política.

**Las políticas, una por una.** Las probé con el endpoint de prueba de
políticas de Paperclip, que decide sin ejecutar nada.

| Agente y herramienta | Antes | Después |
| --- | --- | --- |
| StockScout → `whatsapp_send_message` | `allow` | `require_approval` |
| MarginReviewer → `whatsapp_send_message` | `allow` | `deny` |
| StockScout → `whatsapp_draft_message` | `allow` | `allow` (el borrador no se ve afectado) |

Con la aprobación del margen convertida en herramienta, repetí la prueba en
Windows con las dos herramientas que deciden.

| Agente y herramienta | Decisión |
| --- | --- |
| StockScout → `inventory_commit_offer` | `require_approval` |
| MarginReviewer → `inventory_commit_offer` | `deny` |
| StockScout → `inventory_draft_offer` | `allow` (armar la oferta no se ve afectado) |
| StockScout → `whatsapp_send_message` | `require_approval` |
| MarginReviewer → `whatsapp_send_message` | `deny` |
| StockScout → `social_publish_post` | `require_approval` |
| MarginReviewer → `social_publish_post` | `deny` |
| StockScout → `social_draft_post` | `allow` (armar el posteo no se ve afectado) |
| StockScout → `search_directory` de Grokbot | `allow` (es de sólo lectura) |

**El hash del borrador.** Contra el servidor en ejecución, un envío con el
`draft_id` correcto devuelve el dry-run, y el mismo envío con una palabra
cambiada se rechaza.

**El envío real (OPF-7).** Contra Meta, con la cuenta de prueba, el primer
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
producción mostró los avisos de Meta de enviado y entregado y, cuando abrí el
mensaje con las confirmaciones de lectura activadas, el de leído. Aparecieron
con el número enmascarado y cada estado una sola vez. Antes, Paperclip se había
negado a repetir un envío con argumentos idénticos a uno ya ejecutado, que es su
protección contra duplicados.

**La entrega desde Windows (OPF-4).** El mismo circuito, con Paperclip en Ubuntu
dentro de WSL2 y el canal de WhatsApp en Vercel, sin credenciales en la máquina
local. La prueba sirvió además como control. Con el canal todavía sin
credenciales, y luego con una variable mal cargada, StockScout se negó a enviar
y explicó por qué, en lugar de improvisar un destinatario. Con la configuración
corregida, armó el borrador hacia el único número habilitado, esperó mi
aprobación, y el mensaje llegó al celular; la plataforma mostró enviado,
entregado y leído a las 21:36.

**Las dos aprobaciones con tarjeta, sin terminal (OPF-5 y OPF-6, Windows).**
Con la aprobación del margen convertida en herramienta, corrí el flujo nuevo de
punta a punta con el lote L-8890.

| Paso | Quién | Qué pasó |
| --- | --- | --- |
| OPF-5 | StockScout | Armó la oferta de $427.200, a $7.120 por unidad y con 32% de margen |
| OPF-5 | MarginReviewer | Recalculó consumo, piso y cuenta desde el dataset; aprobó, y Paperclip cerró la tarea sola |
| OPF-6 | StockScout | Llamó a `inventory_commit_offer` con los números del motor; Paperclip la frenó con una tarjeta |
| OPF-6 | Yo | Aprobé el margen con **Approve & run** |
| OPF-6 | StockScout | Verificó que la ventana de 24 horas estuviera abierta, armó el borrador y pidió el envío |
| OPF-6 | Yo | Aprobé el mensaje con **Approve & run** |
| Meta | — | El mensaje llegó al celular; la plataforma mostró enviado y entregado |

Ninguna corrida necesitó Retry, y no hizo falta abrir una terminal.

**El posteo en LinkedIn y el traspaso a Grok Bot (OPF-7 y OPF-8, Windows).**
Las vías B3 y B1, con el lote L-6612, que ninguna cuenta absorbe entero.

| Paso | Qué pasó |
| --- | --- |
| OPF-7 | StockScout mostró por qué ninguna cuenta alcanza y armó el posteo con el pedido exacto a LinkedIn |
| OPF-7 | Cambié el texto del posteo en el servidor con la tarjeta pendiente. La rechacé, y StockScout lo registró sin publicar nada |
| OPF-7 | Armó el borrador de nuevo, con otro `draft_id`, y lo aprobé. La respuesta fue el dry-run con el pedido que habría recibido LinkedIn |
| OPF-8 | StockScout buscó en el directorio de Grokbot por su MCP, eligió el caso de uso que publica en LinkedIn con confirmación humana y explicó por qué |
| OPF-8 | Transcribió el prompt de la ficha marcado como contenido de referencia, sin seguir sus instrucciones, y adjuntó el paquete para pegar en Grok |

La publicación real quedó preparada y sin probar contra LinkedIn, porque
requiere conectar una cuenta. El paso a paso está en
[`docs/LINKEDIN.md`](docs/LINKEDIN.md).

**El tercer rol y los permisos por área (OPF-9 y OPF-10, Windows).** Sumé a
GrowthScout para LinkedIn y Grok, y probé la matriz entera con el endpoint de
prueba de políticas.

| Herramienta | StockScout | GrowthScout | MarginReviewer |
| --- | --- | --- | --- |
| `inventory_commit_offer` | `require_approval` | `deny` | `deny` |
| `whatsapp_send_message` | `require_approval` | `deny` | `deny` |
| `social_publish_post` | `deny` | `require_approval` | `deny` |
| Borradores y búsqueda en Grokbot | `allow` | `allow` | `allow` |

Después lo probé en vivo. En OPF-9, GrowthScout armó un posteo, pidió
aprobación, lo aprobé y devolvió el dry-run. En OPF-10 le pedí a StockScout que
publicara. Armó el borrador, que le está permitido, y al intentar publicar
Paperclip respondió que la herramienta no existe para él. El bloqueo no depende
de que el agente obedezca, porque la herramienta directamente no le aparece.

**El webhook de estado.** Los tests cubren la firma (válida, con otro secreto,
con el cuerpo modificado después de firmar, ausente o mal formada), el
handshake de suscripción, la lectura de cada estado y que una respuesta del
cliente se registre sin guardar su contenido. También lo probé contra el
servidor en ejecución, con un aviso firmado como lo manda Meta.

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
  Paperclip ya configurada. Cada recurso respondió "ya existía" y no se duplicó
  nada. La política nueva del revisor se creó en esa misma corrida.
- **Tres entornos.** El setup corrió en Windows, en macOS y en Ubuntu dentro de
  WSL2. En macOS exigió un ajuste, el runner, que dejé configurable y
  documentado.
- **Una instalación desde cero en WSL2, siguiendo el README.** Sirvió para
  encontrar tres cosas que en la Mac no se veían. El servicio de Paperclip no
  encontraba Claude Code, el setup no instalaba las conexiones para los agentes
  y una key equivocada quedaba pegada al volver a correrlo. Corregidas las tres,
  el chequeo de los agentes pasó, las decisiones de política coincidieron una
  por una con las de la Mac, una segunda corrida del setup no duplicó nada, y
  StockScout completó OPF-1 con las herramientas de Vercel y los mismos números.
- **La prueba de los 10 minutos, con reloj.** Creé un usuario nuevo en Ubuntu,
  sin nada instalado en su carpeta, y seguí el README al pie de la letra.
  - **Tiempos.** `git clone` en 1 segundo, `npm install` en 3 minutos y 50
    segundos, Paperclip configurado y andando en menos de un minuto, los
    servidores MCP en 42 segundos y el setup en 4 segundos. Con la lectura de los
    pasos, entra en 10 minutos.
  - **Lo que trababa, ya corregido.**
    - `npm install -g` de Claude Code falla en Linux sin permisos de
      administrador. Ahora el README usa el instalador oficial.
    - `npx paperclipai run` no arranca una instalación nueva si la terminal no
      es interactiva. Ahora el README usa `npx paperclipai onboard --yes`, que
      configura y deja el servidor andando en un paso.
    - Si los servidores MCP no estaban levantados, el setup fallaba con un error
      que no orientaba. Ahora lo chequea antes y dice qué falta.
    - El token de administración ya no hace falta en la instalación local, y el
      README tiene un paso menos.
  - **Resultado.** La compañía con sus agentes, las cuatro conexiones MCP,
    las seis políticas de aprobación y las cinco tareas.
- **Un segundo clon limpio** al cierre, con todo lo agregado después, instala,
  compila sin errores, pasa los tests y genera el build con las rutas del
  webhook incluidas.

**La prueba de humo.** `platform/scripts/smoke.mjs` usa las herramientas
como las usaría un agente, contra cualquier instancia, y verifica también lo que
tiene que fallar. Prueba pedidos sin clave y con una clave incorrecta (401), un
lote a punto de vencer, una cuenta bloqueada, un mensaje cambiado después de
aprobar y un envío sin confirmar. Está hecha para no poder mandar un mensaje
real, porque los únicos envíos que prueba son los que el servidor debe rechazar
antes de llegar a Meta. Pasó 16 de 16 contra el servidor local y contra
producción, en Vercel. Con la herramienta del margen sumó dos verificaciones
(que el margen se fija con los números del motor y que uno inflado se rechaza)
y pasó 18 de 18 en producción. Con el canal de redes sumó cinco más (el borrador
del posteo, el rechazo de otro `draft_id`, un lote de menos de un mes y un
traspaso que no viene de grokbot.dev) y pasó 23 de 23. Nunca llama a publicar.

```bash
cd platform && SMOKE_BASE_URL=http://127.0.0.1:3200 MCP_API_KEY=... node scripts/smoke.mjs
```

**Dependencias y configuración.** `npm audit` sobre las dependencias de
producción no encontró vulnerabilidades. Crucé cada variable de entorno que lee
el código con `.env.example`. Faltaba una, la que elige la plantilla de la
oferta, y la agregué. Las demás que no figuran ahí son de los scripts de setup,
y cada script las documenta en su encabezado.

## 5. Deploy

Hice estos pedidos contra <https://opfarma-paperclip-challenge.vercel.app>.

| Pedido | Respuesta esperada | Respuesta |
| --- | --- | --- |
| La página | 200 | 200 |
| `/api/mcp/inventory` sin clave | 401 | 401 |
| `/api/mcp/whatsapp` sin clave | 401 | 401 |
| Con una clave incorrecta | 401 | 401 |
| Con la clave correcta | 200 y cuatro herramientas por servidor | 200 y cuatro herramientas por servidor |

Los números de la página coinciden con los del motor, porque los calcula el mismo
código, y los fija el test de la sección 1. La revisé en escritorio y en ancho de
celular, sin desplazamiento horizontal.

## 6. Seguridad

- Busqué credenciales en todo el historial de git (claves de Anthropic, tokens de
  Paperclip y de Meta) y no encontré ninguna publicada. Los archivos con
  secretos locales están excluidos del repo.
- El envío está apagado por defecto. Sólo se habilita con
  `WHATSAPP_ALLOW_SEND=true` exacto, y aun así exige credenciales de Meta, la
  aprobación en Paperclip y un `draft_id` que coincida.
- El revisor no puede enviar, porque tiene el envío bloqueado por política.

## 7. Documentación

Revisé cada documento contra el enunciado y los crucé entre sí. Esto es lo que
encontré y corregí.

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
  de excedentes que no había considerado, y precisé la afirmación. Lo que existe
  son vidrieras, no colocación activa del lado del distribuidor. También separé
  lo que está comprobado, lo documentado y lo estimado, y marqué qué constantes
  del motor salen de una fuente y cuáles son supuestos míos.

## 8. La revisión final

Al cierre, con todo terminado, volví a pasar por todo una vez más.

- Los tests, que hoy son 209, y el chequeo de tipos, en verde.
- El repo público, archivo por archivo. No hay ningún número de teléfono real,
  ningún token, clave ni archivo de entorno. Los únicos números son los
  ficticios de las cuentas del dataset.
- Cada link interno de los documentos apunta a un archivo que existe.
- En producción, la página responde, los dos MCP rechazan sin clave, el webhook
  rechaza una suscripción falsa y el canal informa el envío habilitado con el
  número de prueba en calidad verde.
- Los documentos, contra lo que cambió en los últimos días. El canal real pasó
  a vivir en Vercel y lo comparten la Mac y Windows, y así quedó escrito.

Y me adelanté a dos fallas que todavía no habían pasado.

- **El token de prueba de Meta vence a las 24 horas.** Cuando pasa, la página
  mostraba el error crudo de la Graph API, en inglés. Ahora explica qué pasó y
  aclara que los avisos de abajo son de envíos ya hechos. Lo cubren tres tests
  nuevos.
- **Paperclip publica versiones casi todos los días.** La dependencia admitía
  versiones nuevas, y una instalación futura podía traer una que rompiera el
  setup. Quedó fijada en la versión con la que se probó todo, v2026.1106.0.

## 9. Lo que no pude verificar

- **La publicación real en LinkedIn.** El código, el formato de texto y el
  script de conexión están listos y probados con tests, pero el posteo real
  necesita conectar una cuenta. Hasta entonces el canal responde con el dry-run.

- **Las plantillas aprobadas.** Las dos plantillas de la oferta seguían en
  revisión de Meta al cierre, así que la oferta viajó como texto; el envío con
  plantilla está probado en código y en los tests, no contra Meta.
- **La intercepción de `done`.** El agente pidió revisión por su cuenta en lugar
  de intentar cerrar la tarea, así que nunca vi al runtime frenarlo.
- **Linux fuera de WSL2.** Los agentes corrieron en macOS y en Ubuntu dentro de
  WSL2; no lo probé en un servidor Linux.
- **Los 10 minutos con otra persona.** Lo probé con un usuario nuevo de Linux,
  sin nada instalado, pero no con una persona que no conozca el proyecto.
- **Las fuentes del problema, una por una.** La normativa la verifiqué contra el
  Boletín Oficial y los sitios de ANMAT. Leí completos los dos informes de la
  AGN, el informe sectorial de CADIEM, los de Hacienda y CEPAL, el artículo de
  Vázquez y el estudio de Belo Horizonte; los de Riad y Uganda, hasta sus
  conclusiones. Las auditorías de Ontario, Paraguay y Chile y los casos
  argentinos recientes los cito a partir de la prensa, y los estudios de
  quirófano, a partir de sus resúmenes. El detalle está en
  [`research/EXPIRY.md`](research/EXPIRY.md).
- **El problema con una distribuidora real.** Las fuentes muestran que existe y
  que es caro, pero no cuánto le cuesta a una empresa concreta. Eso requiere
  entrevistas y datos propios, y lo dejé planteado como próximo paso.
