# Bitácora técnica

Este es el detalle detrás de [`DECISIONS.md`](../DECISIONS.md). Acá está cada
decisión con su razón, y cada obstáculo con lo que probé, lo que descarté y cómo
lo resolví.

## Qué elegí y por qué

Empecé por la **opción B2, WhatsApp**, a través de la Cloud API de Meta, y al
final sumé las otras dos, **B3 con LinkedIn** y **B1 con Grokbot**. Cómo llegué
a las tres está más abajo, en "Las otras dos vías", y el porqué con fuentes en
[`research/CANALES.md`](../research/CANALES.md). Cada decisión con sus
alternativas está en el [registro de decisiones](REGISTRO-DE-DECISIONES.md).

La elegí porque el enunciado acepta como ideal "evidencia de envío **o** de
flujo listo para aprobar por un humano", y porque el número de prueba de Meta no
exige verificación de negocio. Lo sé por experiencia propia, porque ya hice ese
trámite en otro proyecto y conozco dónde está la verdadera traba. No está en
enviar un mensaje de prueba, sino en registrar un número propio, que es otro
proceso.

El objetivo de la compañía lo definí yo, porque el enunciado lo deja abierto. No
quería una demo del tipo "el agente manda un WhatsApp", en la que el agente hace
lo mismo que una persona, sólo que más lento. Busqué una tarea que a mano,
directamente, no se llega a hacer.

Me quedé con el vencimiento de lotes. **OpFarma** es una distribuidora de
insumos médicos, y en ese rubro un lote que vence en depósito no reduce el
margen, sino que se pierde el **100% del costo**. Según las referencias que
relevé, entre el 2% y el 5% del inventario se descarta cada año.

La dificultad no está en saber qué se vence, porque cualquier sistema lo avisa.
Está en saber **a quién vendérselo** antes de la fecha, y eso implica cruzar
cada lote con la rotación histórica de cada cuenta. Con cientos de cuentas y
miles de productos, esa tarea no se hace mal. Simplemente no se hace.

Revisando qué ofrece el mercado encontré lo que terminó de convencerme. El
software comercial avisa, pero no coloca. Aplica FEFO y alertas de vencimiento,
informa qué se vence y ahí termina. Los proyectos que sí resuelven la asignación
lo hacen **dentro** de una red hospitalaria, redistribuyendo entre sedes, y los
marketplaces de excedentes publican el stock y esperan a que alguien lo compre.
No encontré herramientas que, del lado del distribuidor, busquen activamente al
cliente que va a consumir cada lote a tiempo. El fundamento y las fuentes están
en [`research/EXPIRY.md`](../research/EXPIRY.md).

### Dos decisiones de diseño tempranas

**El precio no lo calcula el modelo.** El piso, el margen y el tramo de
descuento son aritmética, y los resolví en código con tests. El agente elige a
qué cuenta le conviene cada lote y redacta el mensaje, pero no toca los números.
Un modelo que inventa un descuento es la forma más rápida de perder plata sin
advertirlo.

**El `draft_id` es el hash del payload.** Antes de enviar, el servidor recalcula
el hash de lo que recibe y rechaza el envío si no coincide con el borrador
aprobado. De esta forma, lo que una persona aprobó es exactamente lo que sale, y
puedo demostrarlo en lugar de prometerlo. Además, el servidor no necesita base de
datos ni sesión, y por eso puede correr serverless.

También pensé dónde ubicar a las personas, y terminé poniéndolas en dos lugares,
porque son dos riesgos distintos. El agente revisor valida que la cuenta pueda
consumir el lote, que el precio respete el piso y el estado de la cuenta; recién
después una persona aprueba el margen. El envío tiene su propio permiso, a nivel
de la herramienta. Ese permiso no venía configurado. Tuve que crearlo
explícitamente, y más abajo explico cómo lo detecté.

El revisor no aprueba un descuento. Verifica que no le estemos trasladando una
pérdida a una clínica, y que no quede producto próximo a vencer en una estantería
donde se atiende a pacientes. Es una razón clínica, no comercial, y es la que
explica por qué ese paso no se automatiza.

## Qué funcionó

El proyecto quedó cubierto por **209 tests**, que abarcan los tramos de
vencimiento, el consumo calculado a partir del historial de compras, el piso de
precio, los errores de la Graph API simulados y una verificación independiente
del motor, descripta en [`VERIFICATION.md`](../VERIFICATION.md). Me ocupé de que
el dataset incluyera los casos difíciles, no sólo el que sale bien. Hay un lote
que **ninguna** cuenta puede absorber, y otro que el motor se niega a ofrecer
porque está demasiado cerca del vencimiento.

Los dos servidores MCP quedaron conectados a Paperclip, activos y con sus seis
herramientas en el catálogo. Paperclip, además, **clasificó las herramientas por
su cuenta**. Marcó las cinco de lectura como `risk=read` y `whatsapp_send_message`
como `risk=write`, sin que yo configurara nada. En un principio interpreté que
con eso la asimetría que había diseñado quedaba protegida. No era así. La
clasificación por sí sola no frena nada, y el envío terminó necesitando una
política propia. Lo detallo en "Qué no funcionó".

**El circuito de revisión se ejecutó completo**, no quedó sólo configurado.
StockScout trabajó la tarea, la pasó a `in_review` y quedó reasignada a
MarginReviewer; el revisor validó y aprobó; y la tarea quedó a la espera de la
aprobación humana, asignada a mí. Las dos etapas encadenadas, cada una con su
decisión registrada en el hilo.

Corresponde aclarar que **no llegué a provocar la intercepción**.
StockScout pidió `in_review` por su cuenta en lugar de intentar cerrar la tarea,
de modo que el circuito derivó correctamente, pero nunca vi al runtime frenar un
intento de `done`. La documentación indica que lo hace; lo que puedo afirmar es
que la política se aplica y que la aprobación humana es ineludible, no que
presencié la intercepción.

**El envío por WhatsApp se ejecutó completo, con el control humano en el
medio.** En OPF-3, StockScout consultó el estado del canal, armó el borrador con
su `draft_id`, adjuntó el payload al hilo y llamó al envío. Paperclip lo frenó y
me presentó una tarjeta de aprobación en la tarea. La aprobé, Paperclip ejecutó
la llamada y el servidor devolvió `dry_run: true` con el payload exacto que
habría salido. La tarea quedó en `done` con toda esa secuencia en el historial,
que es lo que el enunciado plantea como ideal. Sanatorio del Parque no recibió
nada, porque no hay credenciales de Meta cargadas.

Por último, el setup es reproducible, porque `setup-company.mjs` crea la
compañía completa y se puede ejecutar más de una vez sin duplicar nada.

## Qué no funcionó

Todo lo que sigue tuvo solución, salvo dos cosas que dependen de terceros, y en
esos casos busqué un camino alternativo.

| Obstáculo | Estado | Cómo |
| --- | --- | --- |
| Los agentes no arrancaban en Windows | Resuelto | Paperclip dentro de WSL2 |
| Paperclip no está publicado en internet | Decisión | Lo evalué y no hacía falta; lo público está en Vercel |
| El workspace aislado exige git | Resuelto | El setup crea la carpeta como repositorio |
| Las conexiones no se completan por API | Evitado | La clave del MCP va en la URL, y el setup es automático |
| El diagnóstico útil está escondido | Documentado | Dónde mirarlo, en el README y en la investigación |
| El borrador fallaba sin credenciales (error mío) | Resuelto | El borrador ya no exige credenciales |
| El envío no pedía aprobación | Resuelto | Una política `require_approval`, que crea el setup |
| Cada tarjeta exigía Retry | Resuelto | La misma solución del workspace |
| Meta bloqueó la primera cuenta | Resuelto | Una cuenta nueva, sólo de OpFarma |
| Las plantillas siguen en revisión | Depende de Meta | La oferta viaja como texto en la ventana de 24 horas |
| La aprobación del margen no tenía botón | Resuelto | Una herramienta con tarjeta de aprobación |
| El canal estaba repartido entre la Mac y Vercel | Resuelto | Credenciales sólo en Vercel, con token permanente |
| Publicar como empresa en LinkedIn | Depende de LinkedIn | Simulación creíble, y el camino real listo |
| Lo que trababa la instalación de cero | Resuelto | README y setup corregidos |

**Directamente sobre Windows, no logré que un agente arrancara.** Al final lo
resolví corriendo Paperclip en Ubuntu dentro de WSL2 (ver "Windows, resuelto con
WSL2", más abajo); esta es la historia de cómo llegué a la causa. Los dos
agentes quedaban alternando entre `verifying` y `paused` con
`harness_test_failed`, mientras el CLI de Claude funcionaba correctamente por
fuera. Ejecutado a mano, con el mismo comando y en el mismo directorio,
respondía y terminaba con código 0.

Fui descartando hipótesis una por una.

1. Que el servidor no encontrara el CLI en su PATH. Lo reinicié después de
   instalarlo y confirmé que se ve desde una terminal nueva. Seguía fallando.
2. Que la descarga del puente ACP fallara por una caché de npm corrupta. Limpié
   la caché, que pasó de varios GB a 4,8 MB. Seguía fallando, y más rápido.
3. Que el rango de versión requerido no existiera. Existe.
4. Que la caché se siguiera corrompiendo. Configuré una caché nueva fuera de
   `AppData`. Seguía fallando.
5. Que la ruta del usuario de Windows, que tiene un espacio y una tilde, rompiera
   el lanzamiento del proceso. Armé un acceso en una ruta corta sin espacios y lo
   apunté con `adapterConfig.command`. El test lo reconocía como ejecutable.
   Seguía fallando.
6. Que el identificador del modelo fuera inválido. Figura en la lista que
   devuelve la API.
7. Que hiciera falta una API key y no aceptara el token de suscripción. Probé con
   una key real con saldo. Falló de forma idéntica, así que no era un problema de
   autenticación.
8. Que las credenciales del entorno tuvieran prioridad sobre el login guardado y
   lo rompieran. Arranqué sin ninguna credencial. Seguía fallando.
9. Que Node en Windows no pudiera lanzar un `.cmd` sin shell. Lo apunté al
   `claude.exe` nativo. Seguía fallando.

También probé el camino que propone el producto, que es conectar Anthropic como
proveedor de modelo desde Connectors, en lugar de usar variables de entorno. La
conexión queda en buen estado, pero al vincularla al agente devuelve "The
selected AI connection failed validation in this agent's environment". Es
decir, el bloqueo ocurre antes de la credencial, venga de donde venga.

### La décima hipótesis, que resultó ser la correcta

Me faltaba una, y la encontré recién al levantar todo en una Mac prestada. Está
en el código instalado, en `@paperclipai/shared/dist/agent-runner.js`.

```js
export function paperclipRunnerSupportsPlatform(harness, platform, architecture, ...) {
    return !!paperclipRunnerProfileForHarness(harness)
        && ...
        && ((platform === "linux" && ...) || (platform === "darwin" && (architecture === "arm64" || architecture === "x64")));
}
```

**`win32` no está en esa lista.** El runner nativo de Paperclip soporta Linux y
macOS, y nada más.

En consecuencia, en Windows `agentRunnerAvailability("claude_local")` devuelve un
único runner disponible, **Legacy**, que lanza el CLI y el puente ACP por su
cuenta. Mis agentes se crearon siempre con ese runner, sin que yo lo eligiera y
sin ningún aviso. En la Mac, en cambio, el valor por defecto es el runner nativo.
Los agentes quedaron con `adapterType: paperclip_runner`, `provider: acpx` y
`acpxAgent: claude`, y llegaron al estado `ready` en lugar de alternar entre
`verifying` y `paused`.

Hubo una confirmación adicional. En la Mac, mi propio `setup-company.mjs` falló
con un `422 agent_runner_config_incompatible`, porque `maxTurnsPerRun` es un
ajuste **exclusivo de Legacy**. Es decir, el script funcionaba en Windows
justamente porque allí nunca hubo otra opción.

Las nueve hipótesis anteriores estaban bien descartadas. Lo que faltaba no era
una causa dentro del camino que estaba analizando, sino advertir que **en
Windows ese camino es el único disponible, y es el que falla**.

La prueba final fue la más directa. En la Mac forcé el runner Legacy, es decir,
la misma configuración que tenía en Windows, y **ahí sí funcionó**. El agente
escaneó el inventario, reportó los 7 lotes en riesgo y empezó a llamar a
`inventory_place_lot` para cada uno. La conclusión, entonces, no es que Legacy
no funcione, sino que **Legacy falla en Windows, y en Windows es la única
opción**.

Hay un detalle relevante para quien quiera reproducir esto. Como
`maxTurnsPerRun` es exclusivo de Legacy, el script de setup devolvía
`422 agent_runner_config_incompatible` en Mac o Linux, donde el valor por
defecto es el runner nativo. Lo dejé condicionado a `PAPERCLIP_RUNNER=legacy`,
de modo que el mismo script crea la compañía en los tres sistemas y además
permite reproducir a propósito la configuración de Windows.

### Una observación sobre las credenciales

Mi criterio de no dejar credenciales en el entorno quedó respaldado por el
código, y resultó más importante de lo que pensaba. El chequeo de ejecución arma
su entorno así.

```js
{ ...sanitizeInheritedPaperclipEnv(process.env), ...configEnv }
```

Esa función sólo elimina las variables `PAPERCLIP_*`, y el servidor borra aparte
apenas cuatro variables internas de Claude Code. **Todo el resto del entorno
desde el que se lanza el servidor llega al chequeo.** Por eso en la Mac levanté
los servidores con `env -i` y un PATH mínimo. Si los hubiera lanzado desde una
sesión cualquiera, variables como `ANTHROPIC_BASE_URL` se habrían filtrado sin
que nadie lo advirtiera.

**Paperclip corre local, y lo decidí así.** Evalué publicarlo para que quien
evalúa pudiera abrirlo sin instalar nada, comparando Railway, un servidor propio,
un túnel desde mi computadora y Render. Railway era la mejor opción, pero no lo
hice. El enunciado pide la plataforma en Vercel y que otra persona levante la
compañía en 10 minutos, y aclara que no hace falta que quede *production-ready*.
Publicarlo sumaba costo y puntos de falla sin agregar evidencia, porque el
historial real de las tareas se ve en el Loom y en la página de evidencia. Lo
público quedó en Vercel, y todas las instalaciones de Paperclip mandan por ese
canal. La comparación completa está en [`deploy/README.md`](../deploy/README.md).

Hubo otros tres obstáculos que vale la pena registrar.

**El workspace aislado exige un repositorio de git, y no lo avisa.** Después de
un reintento, Paperclip pasó OPF-2 al modo `fresh_isolated_workspace` por
precaución, porque una corrida anterior había quedado sin efectos verificados, y
la etapa de revisión empezó a fallar pidiendo un `git_worktree` sobre una carpeta
que no era un repositorio. El campo no se puede editar desde la interfaz, y un
`PATCH` a la tarea devuelve 200 pero no lo aplica. Se resuelve con `git init` en
la carpeta de trabajo del agente, pero nada lo anticipa. El modo se activa solo y
el requisito aparece recién cuando algo ya falló. La solución de fondo está más
abajo, en "Cada respuesta a una tarjeta fallaba por el workspace".

**Las conexiones a herramientas se crean por API, pero no se completan por
API.** La ruta que las activa es `/api/tool-connections/{id}`, no está en la
documentación y la encontré leyendo el log del servidor. El último paso del
alta, cuando la conexión usa una credencial propia, sólo se completa desde la
interfaz. Lo evité creando las conexiones sin credencial y con la clave del MCP
en la URL, que es el patrón que Paperclip ya admite para Zapier. Así el setup
queda automático de punta a punta. El costo es que la clave queda en la URL, y
sacarla de ahí es lo primero de la lista para la semana siguiente.

**El diagnóstico útil existe, pero está oculto.** El log del servidor sólo
registra `exitCode 1`. El detalle real (qué chequeo falló, si hay credenciales
del entorno que pisan el login y el comando exacto para reproducirlo) está en
*Agente → Harness / Runtime → Run test → Test details*, a cuatro clics, y ningún
mensaje de error lo menciona. Si hubiera abierto esa pantalla al principio, me
habría ahorrado la mitad de las hipótesis. Esto no lo puedo cambiar yo, así que
lo dejé escrito donde lo va a buscar quien instale el proyecto, en el README, y
como limitación en la investigación de Paperclip.

### Un error propio, detectado al probar el flujo real

No todos los problemas fueron de la plataforma. Antes de pedirle a StockScout que
ejecutara OPF-3, probé las herramientas de WhatsApp con la misma configuración
que tenía la Mac, es decir, sin credenciales de Meta. `whatsapp_draft_message`
fallaba con `not_configured` y se negaba a armar el borrador.

Era un error de diseño mío. Para armar el payload de la Graph API no hacen falta
ni el token ni el número de Meta, sólo el destinatario y el mensaje. Pero el
borrador leía la configuración con la misma función que el envío, que exige
ambas credenciales. Eso contradecía mi propio README, donde Meta figura como
opcional, y dejaba sin canal justamente al dry-run, que es el mínimo que pide el
enunciado.

Lo resolví separando las dos lecturas. El borrador y el estado del canal usan
ahora una que nunca falla por falta de credenciales. Si faltan, informan el
dry-run como un estado válido y no como un error. El envío las sigue exigiendo y,
sin ellas, devuelve `dry_run: true` con el payload exacto que habría salido. La
verificación del `draft_id` no cambió, y si alguien modifica una sola palabra
del mensaje aprobado, el envío se rechaza igual. Agregué los tests de ese caso y
lo verifiqué contra el servidor en ejecución antes de publicarlo.

La lección es que los tests cubrían cada pieza por separado, pero ninguno probaba
la combinación "sin credenciales, armar un borrador", que era la situación real
de la demo. Lo detecté porque probé el flujo tal como se iba a usar, no porque lo
atrapara un test.

### El control del envío no existía, y lo detectó el agente

Fue el hallazgo más importante, y no fui yo quien lo hizo. En la primera corrida
completa de OPF-3, StockScout llamó a `whatsapp_send_message` y el envío pasó
directo, sin pedir aprobación a nadie. No salió ningún mensaje sólo porque el
servidor estaba en dry-run. El agente lo notó y en una tarjeta preguntó si el
control estaba mal configurado, si estaba preaprobado a propósito o si había que
agregarlo.

Lo confirmé en la auditoría de Paperclip, donde la llamada figuraba con
`decision: allow` y `reasonCode: profile_allows_tool`. Yo había dado por hecho
que el permiso venía con la clasificación `risk=write`, y así lo había escrito en
el README. Era incorrecto.

Revisé en el código instalado cómo decide Paperclip. La aprobación humana existe
sólo si hay una política de tipo `require_approval` para esa herramienta y ese
agente. Cuando el acceso a una conexión se otorga desde la interfaz, Paperclip la
crea automáticamente para toda herramienta que no sea de lectura. Mi script
otorgaba el acceso por otra vía, y en ese caso la política no se crea. La creé
explícitamente por API y la verifiqué con el endpoint de prueba de políticas, que
evalúa la decisión sin ejecutar nada. Antes devolvía `allow`, y después,
`require_approval`.

En el proceso apareció otra falla. MarginReviewer también podía enviar mensajes,
aunque su rol establece que nunca le escribe a un cliente. A ese agente le asigné
una política `block`. Las dos políticas quedaron incorporadas en
`setup-company.mjs`, de modo que una instalación nueva ya incluye el control. La
API tiene dos particularidades que no documenta. No acepta `config` en estas
políticas, aunque Paperclip lo use internamente, y el `agentId` tiene que ir
dentro de `conditions.actor`.

La auditoría posterior confirmó el circuito completo. El envío se frenó por la
política, quedó registrada mi aprobación y la ejecución devolvió `dry_run: true`.
Después de crear la política no hubo ningún envío aprobado automáticamente, en
ninguna tarea ni con ningún agente.

La lección es que "configurado" y "aplicado" no son lo mismo. La plataforma
mostraba el envío como riesgoso, yo lo había documentado como protegido, y
ninguna de las dos cosas lo frenaba. Lo que sí funcionó fue que el agente
comparara lo que la tarea decía con lo que efectivamente ocurrió.

### Cada respuesta a una tarjeta fallaba por el workspace

El problema del workspace aislado que describí para OPF-2 no fue un caso
aislado. En OPF-3 se repitió con un patrón claro.

| Qué despertó al agente | Resultado |
| --- | --- |
| Aprobar el margen | Falló en un segundo |
| Retry | Funcionó |
| Responder una tarjeta | Falló dos veces, con el reintento automático |
| Retry | Funcionó |
| Responder otra tarjeta | Falló dos veces |
| Retry | Funcionó y cerró la tarea |

El Retry elige un workspace aislado nuevo y funciona. Responder una tarjeta, en
cambio, dispara una continuación que pide un `git_worktree` sobre la carpeta de
la corrida anterior, y esa carpeta nunca es un repositorio. El `git init` que
había resuelto OPF-2 arregla una sola carpeta, pero cada corrida exitosa crea una
nueva, así que la siguiente continuación vuelve a fallar.

Intenté sacar la tarea de ese modo con un `PATCH`, pero devuelve 200 y no cambia
nada. No encontré la vía soportada, y con el tiempo disponible no tenía sentido
seguir buscándola. Para completar la demo alcanzó con hacer Retry después de cada
respuesta. Hay un dato que verifiqué en el código. Aunque el agente quedaba en
estado `error` después de cada falla, el sistema sólo omite a los agentes
pausados o dados de baja, así que el siguiente Retry se ejecutaba igual.

**Cómo quedó resuelto.** La solución de fondo era que la carpeta de trabajo de
los agentes ya fuera un repositorio de git antes de la primera corrida. El setup
ahora la crea así, con un commit vacío. En Windows, desde ese cambio, el agente
siguió solo después de cada aprobación, sin un solo Retry.

### El envío real, y lo que respondió Meta

Para pasar del dry-run a un envío real armé una app de prueba en Meta. Ahí
aparecieron tres obstáculos, uno detrás del otro, y cada uno volvió al hilo de
la tarea como evidencia.

**La cuenta compartida.** Al crear la app en mi portfolio comercial existente,
Meta la enganchó a la misma cuenta de WhatsApp Business que usa otro proyecto
mío. Intenté crear un portfolio nuevo y Meta respondió que había alcanzado el
máximo; el otro portfolio que tenía estaba restringido para anunciar y no podía
tener apps. Seguí con la cuenta compartida, pero con dos resguardos en el código.
Cada envío anota su identificador y el webhook guarda sólo los avisos de esos
mensajes. Además, con `WHATSAPP_SHARED_ACCOUNT=true` descarta las respuestas
entrantes, que pueden ser del otro proyecto.

**Los tres intentos de OPF-7.** Cada uno lo aprobé yo en Paperclip y fue
dirigido a mi celular, que es el único destinatario cargado en el número de
prueba.

| Intento | Respuesta de Meta | Qué significaba |
| --- | --- | --- |
| Oferta, número con el 9 | 131030, destinatario fuera de la lista | El número de prueba tenía registrado el celular sin el 9 |
| Oferta, número sin el 9 | 132001, la plantilla no existe | La plantilla estaba en revisión; Meta responde así hasta aprobarla |
| `hello_world`, número sin el 9 | Aceptado, con su identificador | El envío salió; un segundo después, el webhook informó `failed`, 131031, cuenta bloqueada |

El tercer intento probó el circuito completo con Meta de verdad. Pasó por la
aprobación en Paperclip, el envío, el identificador que devuelve Meta, el aviso
de estado que llega firmado al webhook en Vercel, el almacén que lo guarda y la
consulta del agente, que dejó el resultado en la tarea. Lo que no llegó fue el mensaje al
celular, porque Meta tenía bloqueada esa cuenta de prueba. Eso no se resuelve
desde el código ni desde Paperclip, porque es un estado de la cuenta del lado de
Meta.

**La cuenta nueva, y la entrega.** Armé todo de nuevo con otra cuenta de Meta.
Creé un portfolio propio de OpFarma, una app nueva y, con ella, una cuenta de
WhatsApp Business y un número de prueba que no comparte nadie. Los scripts
hicieron que fuera rápido. Uno conectó el webhook y la suscripción, y otro dio
de alta las dos plantillas. Como la cuenta ya no estaba compartida, volví
`WHATSAPP_SHARED_ACCOUNT` a `false`.

Hubo dos tropiezos más, los dos útiles. Primero, cargué en la Mac el
identificador de la cuenta en lugar del identificador del número; Meta lo
aceptaba pero no devolvía los datos del número, y eso me hizo revisarlo.
Segundo, el agente intentó repetir el `hello_world` y Paperclip no abrió una
tarjeta nueva. Reconoció que los argumentos eran idénticos a los de un envío ya
ejecutado y devolvió ese resultado. Es la protección contra envíos duplicados, y
obligó a cambiar el mensaje.

Lo cambié para mejor. Le escribí al número de prueba desde mi celular, eso abrió
la ventana de 24 horas, y el agente mandó **la oferta real de L-4028** como
texto, con su borrador y su `draft_id`. La aprobé en Paperclip, llegó al
celular, y Meta avisó por el webhook que se entregó. La plataforma lo muestra y
el agente lo registró en la tarea.

Al leer el mensaje en el teléfono vi que el texto estaba desprolijo, con "120
sobre" en singular, palabras sin tilde, montos sin separador de miles y la fecha
en formato ISO. Lo corregí para que se lea como se escribe en Argentina, con tests,
y unifiqué el formato con el de las plantillas.

**Las plantillas.** Di de alta la oferta completa por API, desde el mismo archivo
que usa el agente. Quedó en revisión manual, así que armé una segunda, corta y
sin precios, que suele pasar la revisión automática. Las dos quedaron en
revisión al cierre, en las dos cuentas; por eso la oferta viajó como texto
dentro de la ventana de 24 horas. El código puede usar cualquiera de las dos con
sólo cambiar una variable.

Corregí dos detalles en el camino. El resultado del envío decía "Delivered"
apenas Meta aceptaba el pedido, y eso no prueba la entrega; ahora dice que el
mensaje fue aceptado y que la entrega la confirma el webhook. El otro fue el
formato de los celulares argentinos. Para enviar, Meta aceptó la forma sin el 9
y la normalizó con el 9.

### Windows, resuelto con WSL2

Saber que el problema de Windows era el runner, y no Windows en sí, abría una
salida, que era correr Paperclip sobre Linux sin salir de la compu. WSL2 es un
Ubuntu real dentro de Windows, y desde ahí Paperclip se usa igual, con el navegador de
Windows en `localhost:3100`. Los agentes usan los servidores MCP de Vercel, así
que no hizo falta levantar la plataforma.

Lo instalé desde cero siguiendo el README, y eso sirvió para encontrar tres cosas
que en la Mac no se veían.

**El servicio no ve la carpeta del usuario.** La configuración inicial de
Paperclip ofrece instalarlo como servicio en segundo plano, y un servicio no
carga la configuración de la sesión. Claude Code estaba instalado en la carpeta
del usuario, así que el chequeo de los agentes falló con "Command not found in
PATH: claude", aunque desde la terminal `claude` respondía. Se resuelve con un
enlace en `/usr/local/bin`, que cualquier servicio ve. Con eso, el chequeo pasó.

**El setup no instalaba las conexiones.** Una conexión creada por API queda
disponible para la organización pero no instalada para nadie, y los agentes no
ven sus herramientas. Según StockScout, las herramientas de WhatsApp "no
existen en este runtime". En la Mac esa instalación se había hecho desde la
interfaz en algún momento, así que el problema nunca apareció. Ahora el setup
instala las dos conexiones para la compañía, y las políticas deciden qué puede
hacer cada agente. Probadas una por una, las decisiones quedaron idénticas a las
de la Mac.

**Una key equivocada quedaba pegada.** La primera vez se pegó una key del MCP que
no correspondía, Vercel la rechazó, y volver a correr el setup reutilizaba la
conexión rota. Ahora el setup detecta que la URL o la key cambiaron, actualiza
la conexión y verifica el catálogo de nuevo, y si el servidor rechaza la key, el
error dice qué revisar en lugar del "This app needs you to sign in" de
Paperclip.

Con las tres resueltas, StockScout corrió en Windows de punta a punta. Escaneó
el inventario con las herramientas de Vercel, colocó cada lote y dejó en la tarea
el mismo resumen que en la Mac, con los mismos números, y una tarjeta con las
decisiones que me tocaban.

### La aprobación del margen no tenía botón

La tarea de la oferta tenía una etapa de aprobación humana en su política de
ejecución, la que impide marcarla como terminada sin una persona. En la Mac, al
intentar aprobarla desde la interfaz, Paperclip respondió con un error. Cambiar
el estado a *done* devolvía un 422, y escribir el comentario en el cuadro de
mensajes reabría la tarea en lugar de aprobarla.

Lo busqué en el código. El servidor exige que la decisión llegue junto con un
comentario en el mismo pedido (`Approving a review or approval stage requires a
comment`), y ningún control de la interfaz manda las dos cosas juntas. La
etiqueta "Approval pending with You" no tiene botón. En esta versión, esa etapa
sólo se aprueba por la API.

Tenía tres caminos.

| Camino | Qué tenía de bueno | Por qué no |
| --- | --- | --- |
| Aprobar por la API, con un comando | Usa la etapa tal como está pensada | Saca la decisión de Paperclip, y en el video se ve una terminal |
| Una aprobación del board, con botón en la bandeja | Tiene botón | No frena nada por sí sola, depende de que el agente espere |
| Una herramienta con política `require_approval` | Tiene botón y Paperclip frena la acción | Hubo que construirla |

Elegí la tercera. `inventory_commit_offer` recibe el lote, la cuenta, el precio,
el margen y el total, y Paperclip la frena con una tarjeta. Para que lo aprobado
sea lo que calculó el código, el servidor recalcula la oferta y rechaza cualquier
número distinto del motor. Es el mismo principio que el `draft_id` del WhatsApp.

Con eso, la tarea del envío pasó a tener dos tarjetas, primero el margen y
después el mensaje. Lo probé en Windows de punta a punta (OPF-5 y OPF-6), y en el
README dejé explicado dónde está el review humano que pide la Tarea A.

### El canal real estaba repartido entre dos lugares

Cuando probé el circuito desde Windows, el canal de Vercel respondió en modo
borrador. No tenía las credenciales de Meta. La Mac mandaba con su propio token,
guardado en su `.env.local` y en un servidor local, y ese token había vencido a
las pocas horas.

Pasé las credenciales a Vercel, para que cualquier instalación de Paperclip
mandara por el mismo canal. En el camino aparecieron dos errores de carga. Una
variable quedó guardada como secreta con un valor que no era `true`, y otra
quedó sin el número. Las dos veces StockScout se negó a enviar y explicó qué
faltaba, en lugar de improvisar un destinatario. Después reemplacé el token de 24
horas por uno permanente, de un usuario del sistema de Meta, y la página explica
en castellano qué pasa si alguna vez vence.

### Las otras dos vías

Con WhatsApp funcionando, sumé LinkedIn y Grokbot. Las elegí para que contaran la
misma historia. WhatsApp coloca el lote en la cuenta que ya lo consume; LinkedIn
lo ofrece a clínicas nuevas cuando ninguna cuenta lo absorbe; y Grokbot recibe
ese posteo para que lo publique un agente de terceros.

**LinkedIn.** Publicar como página de empresa exige que LinkedIn apruebe la app,
así que lo simulé de forma creíble. El servidor arma el pedido exacto a la API,
con su `draft_id`, y publicar pasa por una tarjeta de aprobación. Sin
credenciales devuelve el dry-run. Leyendo la documentación encontré algo que
habría roto el primer posteo real. LinkedIn trata los paréntesis, el `#` y otros
caracteres como reservados, y "(SUT-3010)" se habría leído como parte de una
mención. Ahora se escapan solos. El camino para publicar de verdad quedó en
[`LINKEDIN.md`](LINKEDIN.md).

Probé el control también. Cambié el texto del posteo con la tarjeta pendiente, la
rechacé, y StockScout registró que no se publicó nada. Al rehacerlo, el
`draft_id` era otro, porque el texto había cambiado.

**Grokbot.** Esperaba una herramienta que publicara. Es otra cosa, un directorio
comunitario de plugins para Grok Bot, el producto de agentes de xAI. Grok Bot no
tiene una API para recibir órdenes de otro sistema, pero el directorio sí tiene
un servidor MCP público. Paperclip se conecta a él, el agente busca el plugin que
sirve, explica por qué lo eligió y arma el paquete con el posteo aprobado, para
que una persona lo pegue en Grok. El propio directorio pide que sus prompts nunca
se ejecuten solos, y el agente los transcribió como contenido de referencia, sin
seguir sus instrucciones.

### Un tercer rol, y lo que mostró

Con LinkedIn y Grokbot, StockScout hacía todo. Separé el área de growth en un
agente nuevo, GrowthScout, y armé una matriz de permisos. Cada agente puede usar
sólo las herramientas de su área, y lo que decide algo pide aprobación humana.

Para probarlo le pedí a StockScout que publicara en LinkedIn (OPF-10). Armó el
borrador, que le está permitido, y al intentar publicar Paperclip respondió que
la herramienta no existía. Un bloqueo no es una regla que el agente pueda
ignorar, porque Paperclip le saca la herramienta de la lista. Es uno de los
hallazgos más útiles sobre Paperclip, y lo sumé a la investigación.

### La prueba de los 10 minutos

Seguí el README al pie de la letra con un usuario nuevo de Linux, midiendo cada
paso. Entró en tiempo, pero encontré cuatro cosas que trababan a alguien que
llega de cero.

- `npm install -g` de Claude Code falla en Linux sin permisos de administrador.
  Ahora el README usa el instalador oficial.
- `npx paperclipai run` no arranca una instalación nueva fuera de una terminal
  interactiva. Ahora se usa `npx paperclipai onboard --yes`.
- Si faltaban los servidores MCP, el setup fallaba con un error que no orientaba.
  Ahora lo chequea antes y dice qué hacer.
- El token de administración sobraba en la instalación local, y lo saqué.

## Qué haría la semana que viene

1. **Sacar la clave de la URL.** Hoy la clave del MCP viaja como parámetro de
   query, que es el patrón que Paperclip admite para Zapier. Lo resolví así
   porque `config` y `transportConfig` rechazan campos sensibles y el flujo de
   cuenta sólo existe en la interfaz, pero una URL con clave queda registrada en
   los logs de cualquier proxy intermedio, y un header no.
2. **Pasar WhatsApp a un número propio**, con el portfolio de negocio verificado,
   un medio de pago y una plantilla aprobada. El paso a paso está en
   [`PRODUCCION.md`](PRODUCCION.md).
3. **Publicar en LinkedIn de verdad**, primero como persona y después como página,
   cuando LinkedIn apruebe la app. Está en [`LINKEDIN.md`](LINKEDIN.md).
4. **Que las tareas se creen solas.** Una rutina de Paperclip que escanee el
   inventario cada mañana y abra una tarea por cada lote que conviene mover, y
   que la tarea del envío se abra sola cuando el revisor aprueba la oferta.
5. **Que el webhook le avise a la tarea.** Hoy el agente consulta la entrega un
   minuto después. Si Meta avisa que el cliente leyó o respondió, la tarea
   tendría que actualizarse sola.
6. **Reemplazar el dataset de ejemplo por el sistema de gestión real.** El motor
   consume una interfaz acotada (productos, lotes, cuentas y compras), así que
   se trata de escribir un adaptador, no de rehacer la lógica.
7. **Que el motor reparta la demanda entre lotes del mismo producto.** Hoy busca
   una sola cuenta que absorba cada lote completo, y evalúa cada lote por
   separado. Lo descubrí usándolo. Reportó un lote de 300 suturas como imposible
   de colocar, y mi primera idea fue dividirlo entre dos clínicas. Era un error,
   porque otro lote de la misma sutura ya estaba comprometido con una de ellas y
   ocupaba la mitad de su demanda.
8. **Agrupar las ofertas por cliente.** Sanatorio del Parque terminó con varias
   ofertas separadas. Un solo mensaje por cliente es más claro y cuesta menos.
9. **Reportarle a Paperclip lo que encontré**, con la causa en el código y un
   comando reproducible. El bloqueo de Windows y la etapa de aprobación sin botón
   son los dos más útiles.
