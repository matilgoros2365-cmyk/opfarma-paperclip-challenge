# Bitácora técnica

Este es el detalle detrás de [`DECISIONS.md`](../DECISIONS.md): cada decisión con
su razón, y cada obstáculo con lo que probé, lo que descarté y cómo lo resolví.

## Qué elegí y por qué

Elegí la **opción B2, WhatsApp**, a través de la Cloud API de Meta.

La elegí porque el enunciado acepta como ideal "evidencia de envío **o** de
flujo listo para aprobar por un humano", y porque el número de prueba de Meta no
exige verificación de negocio. Lo sé por experiencia propia: ya hice ese trámite
en otro proyecto y conozco dónde está la verdadera traba. No está en enviar un
mensaje de prueba, sino en registrar un número propio, que es otro proceso.

El objetivo de la compañía lo definí yo, porque el enunciado lo deja abierto. No
quería una demo del tipo "el agente manda un WhatsApp", en la que el agente hace
lo mismo que una persona, sólo que más lento. Busqué una tarea que a mano,
directamente, no se llega a hacer.

Me quedé con el vencimiento de lotes. **OpFarma** es una distribuidora de
insumos médicos, y en ese rubro un lote que vence en depósito no reduce el
margen: se pierde el **100% del costo**. Según las referencias que relevé, entre
el 2% y el 5% del inventario se descarta cada año.

La dificultad no está en saber qué se vence, porque cualquier sistema lo avisa.
Está en saber **a quién vendérselo** antes de la fecha, y eso implica cruzar
cada lote con la rotación histórica de cada cuenta. Con cientos de cuentas y
miles de productos, esa tarea no se hace mal: simplemente no se hace.

Revisando qué ofrece el mercado encontré lo que terminó de convencerme. El
software comercial avisa, pero no coloca: aplica FEFO y alertas de vencimiento,
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
de la herramienta. Ese permiso no venía configurado: tuve que crearlo
explícitamente, y más abajo explico cómo lo detecté.

El revisor no aprueba un descuento. Verifica que no le estemos trasladando una
pérdida a una clínica, y que no quede producto próximo a vencer en una estantería
donde se atiende a pacientes. Es una razón clínica, no comercial, y es la que
explica por qué ese paso no se automatiza.

## Qué funcionó

El proyecto quedó cubierto por **173 tests**: los tramos de vencimiento, el
consumo calculado a partir del historial de compras, el piso de precio, los
errores de la Graph API simulados y una verificación independiente del motor,
descripta en [`VERIFICATION.md`](../VERIFICATION.md). Me ocupé de que el dataset
incluyera los casos difíciles, no sólo el que sale bien: hay un lote que
**ninguna** cuenta puede absorber, y otro que el motor se niega a ofrecer porque
está demasiado cerca del vencimiento.

Los dos servidores MCP quedaron conectados a Paperclip, activos y con sus seis
herramientas en el catálogo. Paperclip, además, **clasificó las herramientas por
su cuenta**: marcó las cinco de lectura como `risk=read` y `whatsapp_send_message`
como `risk=write`, sin que yo configurara nada. En un principio interpreté que
con eso la asimetría que había diseñado quedaba protegida. No era así: la
clasificación por sí sola no frena nada, y el envío terminó necesitando una
política propia. Lo detallo en "Qué no funcionó".

**El circuito de revisión se ejecutó completo**, no quedó sólo configurado.
StockScout trabajó la tarea, la pasó a `in_review` y quedó reasignada a
MarginReviewer; el revisor validó y aprobó; y la tarea quedó a la espera de la
aprobación humana, asignada a mí. Las dos etapas encadenadas, cada una con su
decisión registrada en el hilo.

Corresponde hacer una aclaración: **no llegué a provocar la intercepción**.
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

Por último, el setup es reproducible: `setup-company.mjs` crea la compañía
completa y se puede ejecutar más de una vez sin duplicar nada.

## Qué no funcionó

**No logré que un agente arrancara en Windows.** Los dos quedaban alternando
entre `verifying` y `paused` con `harness_test_failed`, mientras el CLI de
Claude funcionaba correctamente por fuera: ejecutado a mano, con el mismo
comando y en el mismo directorio, respondía y terminaba con código 0.

Fui descartando hipótesis una por una:

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

También probé el camino que propone el producto: conectar Anthropic como
proveedor de modelo desde Connectors, en lugar de usar variables de entorno. La
conexión queda en buen estado, pero al vincularla al agente devuelve "The
selected AI connection failed validation in this agent's environment". Es
decir, el bloqueo ocurre antes de la credencial, venga de donde venga.

### La décima hipótesis, que resultó ser la correcta

Me faltaba una, y la encontré recién al levantar todo en una Mac prestada. Está
en el código instalado, en `@paperclipai/shared/dist/agent-runner.js`:

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
sin ningún aviso. En la Mac, en cambio, el valor por defecto es el runner nativo:
los agentes quedaron con `adapterType: paperclip_runner`, `provider: acpx` y
`acpxAgent: claude`, y llegaron al estado `ready` en lugar de alternar entre
`verifying` y `paused`.

Hubo una confirmación adicional. En la Mac, mi propio `setup-company.mjs` falló
con un `422 agent_runner_config_incompatible`, porque `maxTurnsPerRun` es un
ajuste **exclusivo de Legacy**. Es decir, el script funcionaba en Windows
justamente porque allí nunca hubo otra opción.

Las nueve hipótesis anteriores estaban bien descartadas. Lo que faltaba no era
una causa dentro del camino que estaba analizando, sino advertir que **en
Windows ese camino es el único disponible, y es el que falla**.

La prueba final fue la más directa: en la Mac forcé el runner Legacy, es decir,
la misma configuración que tenía en Windows, y **ahí sí funcionó**. El agente
escaneó el inventario, reportó los 7 lotes en riesgo y empezó a llamar a
`inventory_place_lot` para cada uno. La conclusión, entonces, no es que Legacy
no funcione, sino que **Legacy falla en Windows, y en Windows es la única
opción**.

Un detalle relevante para quien quiera reproducir esto: como `maxTurnsPerRun` es
exclusivo de Legacy, el script de setup devolvía
`422 agent_runner_config_incompatible` en Mac o Linux, donde el valor por
defecto es el runner nativo. Lo dejé condicionado a `PAPERCLIP_RUNNER=legacy`,
de modo que el mismo script crea la compañía en los tres sistemas y además
permite reproducir a propósito la configuración de Windows.

### Una observación sobre las credenciales

Mi criterio de no dejar credenciales en el entorno quedó respaldado por el
código, y resultó más importante de lo que pensaba. El chequeo de ejecución arma
su entorno así:

```js
{ ...sanitizeInheritedPaperclipEnv(process.env), ...configEnv }
```

Esa función sólo elimina las variables `PAPERCLIP_*`, y el servidor borra aparte
apenas cuatro variables internas de Claude Code. **Todo el resto del entorno
desde el que se lanza el servidor llega al chequeo.** Por eso en la Mac levanté
los servidores con `env -i` y un PATH mínimo: si los hubiera lanzado desde una
sesión cualquiera, variables como `ANTHROPIC_BASE_URL` se habrían filtrado sin
que nadie lo advirtiera.

Mientras Windows seguía bloqueado, intenté mover todo a Linux, lo que de paso
resolvía el link público a la plataforma. Monté la aplicación en Fly con la
imagen que publica Paperclip, el volumen y las variables, y ahí apareció otro
límite: **la imagen de Paperclip no entra en Fly**. Pesa 5,3 GB comprimida y, al
descomprimirse, supera el máximo de 8 GiB que admite la plataforma. Probé ampliar
el disco raíz con `--rootfs-size`, que es la única opción disponible para eso, y
el error fue idéntico: el límite no depende del disco solicitado, sino de Fly.
Para una imagen que incluye cuatro CLI de agentes, ese techo resulta corto.

Hubo otros tres obstáculos que vale la pena registrar:

**El workspace aislado exige un repositorio de git, y no lo avisa.** Después de
un reintento, Paperclip pasó OPF-2 al modo `fresh_isolated_workspace` por
precaución, porque una corrida anterior había quedado sin efectos verificados, y
la etapa de revisión empezó a fallar pidiendo un `git_worktree` sobre una carpeta
que no era un repositorio. El campo no se puede editar desde la interfaz, y un
`PATCH` a la tarea devuelve 200 pero no lo aplica. Se resuelve con `git init` en
la carpeta de trabajo del agente, pero nada lo anticipa: el modo se activa solo y
el requisito aparece recién cuando algo ya falló.

**Las conexiones a herramientas se crean por API, pero no se completan por
API.** La ruta que las activa es `/api/tool-connections/{id}`, no está en la
documentación y la encontré leyendo el log del servidor. El último paso del
alta, cuando la conexión usa una credencial propia, sólo se completa desde la
interfaz. Por eso el setup no puede ser 100% automatizable, y lo dejé indicado en
el README en lugar de disimularlo.

**El diagnóstico útil existe, pero está oculto.** El log del servidor sólo
registra `exitCode 1`. El detalle real (qué chequeo falló, si hay credenciales
del entorno que pisan el login y el comando exacto para reproducirlo) está en
*Agente → Harness / Runtime → Run test → Test details*: a cuatro clics, y ningún
mensaje de error lo menciona. Si hubiera abierto esa pantalla al principio, me
habría ahorrado la mitad de las hipótesis.

### Un error propio, detectado al probar el flujo real

No todos los problemas fueron de la plataforma. Antes de pedirle a StockScout que
ejecutara OPF-3, probé las herramientas de WhatsApp con la misma configuración
que tenía la Mac, es decir, sin credenciales de Meta. `whatsapp_draft_message`
fallaba con `not_configured`: se negaba a armar el borrador.

Era un error de diseño mío. Para armar el payload de la Graph API no hacen falta
ni el token ni el número de Meta, sólo el destinatario y el mensaje. Pero el
borrador leía la configuración con la misma función que el envío, que exige
ambas credenciales. Eso contradecía mi propio README, donde Meta figura como
opcional, y dejaba sin canal justamente al dry-run, que es el mínimo que pide el
enunciado.

Lo resolví separando las dos lecturas. El borrador y el estado del canal usan
ahora una que nunca falla por falta de credenciales: si faltan, informan el
dry-run como un estado válido y no como un error. El envío las sigue exigiendo y,
sin ellas, devuelve `dry_run: true` con el payload exacto que habría salido. La
verificación del `draft_id` no cambió: si alguien modifica una sola palabra del
mensaje aprobado, el envío se rechaza igual. Agregué los tests de ese caso y lo
verifiqué contra el servidor en ejecución antes de publicarlo.

La lección es que los tests cubrían cada pieza por separado, pero ninguno probaba
la combinación "sin credenciales, armar un borrador", que era la situación real
de la demo. Lo detecté porque probé el flujo tal como se iba a usar, no porque lo
atrapara un test.

### El control del envío no existía, y lo detectó el agente

Fue el hallazgo más importante, y no fui yo quien lo hizo. En la primera corrida
completa de OPF-3, StockScout llamó a `whatsapp_send_message` y el envío pasó
directo, sin pedir aprobación a nadie. No salió ningún mensaje sólo porque el
servidor estaba en dry-run. El agente lo notó y lo planteó en una tarjeta: si el
control estaba mal configurado, si estaba preaprobado a propósito o si había que
agregarlo.

Lo confirmé en la auditoría de Paperclip: la llamada figuraba con
`decision: allow` y `reasonCode: profile_allows_tool`. Yo había dado por hecho
que el permiso venía con la clasificación `risk=write`, y así lo había escrito en
el README. Era incorrecto.

Revisé en el código instalado cómo decide Paperclip. La aprobación humana existe
sólo si hay una política de tipo `require_approval` para esa herramienta y ese
agente. Cuando el acceso a una conexión se otorga desde la interfaz, Paperclip la
crea automáticamente para toda herramienta que no sea de lectura. Mi script
otorgaba el acceso por otra vía, y en ese caso la política no se crea. La creé
explícitamente por API y la verifiqué con el endpoint de prueba de políticas, que
evalúa la decisión sin ejecutar nada: antes devolvía `allow`, después
`require_approval`.

En el proceso apareció otra falla: MarginReviewer también podía enviar mensajes,
aunque su rol establece que nunca le escribe a un cliente. A ese agente le asigné
una política `block`. Las dos políticas quedaron incorporadas en
`setup-company.mjs`, de modo que una instalación nueva ya incluye el control. La
API tiene dos particularidades que no documenta: no acepta `config` en estas
políticas, aunque Paperclip lo use internamente, y el `agentId` tiene que ir
dentro de `conditions.actor`.

La auditoría posterior confirmó el circuito completo: el envío se frenó por la
política, quedó registrada mi aprobación y la ejecución devolvió `dry_run: true`.
Después de crear la política no hubo ningún envío aprobado automáticamente, en
ninguna tarea ni con ningún agente.

La lección es que "configurado" y "aplicado" no son lo mismo. La plataforma
mostraba el envío como riesgoso, yo lo había documentado como protegido, y
ninguna de las dos cosas lo frenaba. Lo que sí funcionó fue que el agente
comparara lo que la tarea decía con lo que efectivamente ocurrió.

### Cada respuesta a una tarjeta fallaba por el workspace

El problema del workspace aislado que describí para OPF-2 no fue un caso
aislado. En OPF-3 se repitió con un patrón claro:

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

Intenté sacar la tarea de ese modo con un `PATCH`: devuelve 200 y no cambia
nada. No encontré la vía soportada, y con el tiempo disponible no tenía sentido
seguir buscándola. Para completar la demo alcanzó con hacer Retry después de cada
respuesta. Un dato que verifiqué en el código: aunque el agente quedaba en estado
`error` después de cada falla, el sistema sólo omite a los agentes pausados o
dados de baja, así que el siguiente Retry se ejecutaba igual.

## Qué haría la semana que viene

1. **Sacar la clave de la URL.** Hoy la clave del MCP viaja como parámetro de
   query, que es el patrón que Paperclip admite para Zapier. Lo resolví así
   porque `config` y `transportConfig` rechazan campos sensibles y el flujo de
   cuenta sólo existe en la interfaz, pero una URL con clave queda registrada en
   los logs de cualquier proxy intermedio, y un header no.
2. **Pasar del número de prueba a uno propio.** Implica verificar el portfolio
   de negocio con la constancia fiscal, cargar un medio de pago (los mensajes
   iniciados por la empresa se cobran por conversación) y usar un token de
   usuario del sistema, porque el de la consola vence a las 24 horas. Además,
   una oferta iniciada por OpFarma necesita una plantilla aprobada por Meta.
3. **Cerrar el circuito con el webhook de estado de Meta**, para que la tarea no
   termine en "enviado" sino en "entregado" o "leído", y que un rechazo vuelva al
   hilo como evidencia.
4. **Darle a la compañía un proyecto con workspace de git.** Es lo que pide el
   error de las continuaciones, y eliminaría el Retry manual después de cada
   respuesta a una tarjeta.
5. **Reemplazar el dataset de ejemplo por el sistema de gestión real.** El motor
   consume una interfaz acotada (productos, lotes, cuentas y compras), así que
   se trata de escribir un adaptador, no de rehacer la lógica.
6. **Que el motor reparta la demanda entre lotes del mismo producto.** Hoy busca
   una sola cuenta que absorba cada lote completo, y evalúa cada lote por
   separado. Lo descubrí usándolo: reportó un lote de 300 suturas como imposible
   de colocar, y mi primera idea fue dividirlo entre dos clínicas. Era un error,
   porque otro lote de la misma sutura ya estaba comprometido con una de ellas y
   ocupaba la mitad de su demanda. El motor tiene que distribuir la demanda de
   cada cuenta entre todos los lotes del mismo producto, consumiendo primero el
   que vence antes, poder dividir un lote entre varias cuentas, y
   `inventory_draft_offer` tiene que aceptar una cantidad.
7. **Agrupar las ofertas por cliente.** Sanatorio del Parque terminó con tres
   ofertas separadas. Un solo mensaje por cliente es más claro para quien lo
   recibe y reduce el costo por conversación.
8. **Reportar el bloqueo de Windows al equipo de Paperclip.** Nueve hipótesis
   descartadas con evidencia, la causa en el código y un comando reproducible
   constituyen un issue útil.
