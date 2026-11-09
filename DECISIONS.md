# Decisiones

## Qué elegí y por qué

Fui por la **opción B2, WhatsApp**, con la Cloud API de Meta.

Elegí esa porque el enunciado acepta como ideal "evidencia de envío **o** de
flujo listo para aprobar por un humano", y porque el número de prueba de Meta no
exige verificación de negocio. Eso lo sé de primera mano: ya pasé por ese
trámite en otro proyecto y conozco bien dónde está el muro. No está en mandar un
mensaje de prueba, está en registrar un número propio, que es otra cosa.

El objetivo de la company lo elegí yo, porque el enunciado lo deja libre. No
quería hacer "el agente manda un WhatsApp", que es una demo donde el agente hace
algo que una persona hacía igual, sólo que más lento. Busqué una tarea que a
mano directamente no se haga.

Me quedé con el vencimiento de lotes. **OpFarma** es una distribuidora de
insumos médicos, y ahí un lote que vence en depósito no te come margen: te come
el **100% del costo**. Según las referencias que encontré, se descarta entre el
2% y el 5% del inventario por año.

Lo difícil no es saber qué se vence, porque eso cualquier sistema te lo avisa.
Lo difícil es saber **a quién vendérselo** antes de la fecha, y eso significa
cruzar cada lote contra la rotación histórica de cada cuenta. Con cientos de
cuentas y miles de SKUs eso no se hace mal: no se hace.

Estuve leyendo qué hace el mercado y encontré una cosa que me terminó de
convencer. El software comercial avisa pero no coloca: hace FEFO y alertas de
vencimiento, te dice qué se vence y ahí termina. Los proyectos que sí hacen el
matching resuelven redistribución **dentro** de una red hospitalaria, de una
sede a otra. Hacia afuera, de distribuidor a cliente y como acción comercial,
no encontré a nadie. El fundamento y las fuentes están en
[`research/EXPIRY.md`](research/EXPIRY.md).

### Dos cosas que decidí al principio

**El precio no lo calcula el modelo.** El piso, el margen y el tramo de
descuento son aritmética, y la dejé en código testeado. El agente elige a qué
cuenta le conviene el lote y escribe el mensaje, pero no toca los números. Un
modelo que inventa un descuento es la forma más rápida de perder plata sin
enterarte.

**El `draft_id` es el hash del payload.** Antes de enviar, el servidor recalcula
el hash de lo que le pasaron y se niega si no coincide con el draft que se
aprobó. Así lo que una persona aprobó es exactamente lo que sale, y lo puedo
demostrar en vez de prometerlo. De yapa, eso hace que el servidor no necesite
base de datos ni sesión, y por eso puede correr serverless.

También me importó dónde poner al humano, y terminé poniéndolo en dos lugares
distintos porque son dos riesgos distintos: el revisor valida absorción, piso de
precio y estado de cuenta, y recién después una persona aprueba el margen. El
envío tiene su propio permiso aparte, a nivel de la conexión.

El revisor no está aprobando un descuento. Está verificando que no le estemos
mudando una pérdida a una clínica, y que no quede producto por vencer en una
estantería donde se atiende gente. Esa es una razón clínica, no comercial, y es
la que explica por qué ese paso no se puede automatizar.

## Qué funcionó

El motor de colocación quedó con **81 tests**: los tramos de vencimiento, el
consumo derivado del historial de compras, el piso de precio y los errores de la
Graph API mockeados. Me preocupé de que el dataset incluyera los casos
incómodos, no sólo el que sale bien: hay un lote que **nadie** puede absorber, y
otro que el motor se niega a ofrecer porque está demasiado cerca del
vencimiento.

Los dos servidores MCP quedaron conectados a Paperclip, activos y con sus seis
tools en el catálogo. Hay algo de eso que me gustó y que no busqué: **Paperclip
clasificó las tools solo**. Marcó los cinco de lectura como `risk=read` y
`whatsapp_send_message` como `risk=write`, sin que yo configurara nada. O sea
que la asimetría que había diseñado sobrevivió al pasaje a la plataforma y no
depende de que alguien se acuerde de configurarla.

**El gate de revisión corrió de punta a punta**, no quedó sólo configurado.
StockScout trabajó la tarea, pasó a `in_review` y fue reasignada a
MarginReviewer; el revisor validó y aprobó; y la tarea quedó en espera de la
aprobación humana, asignada a mí. Las dos etapas encadenadas, cada una con su
decisión registrada en el hilo.

Una precisión que corresponde hacer: **no llegué a provocar la intercepción**.
StockScout pidió `in_review` por su cuenta en vez de intentar cerrar la tarea,
así que el gate enrutó correctamente pero nunca vi al runtime frenar un intento
de `done`. La documentación dice que lo hace; yo puedo afirmar que la política
se aplica y que la aprobación humana es inevitable, no que presencié la
intercepción.

Y el setup es reproducible por comandos: `setup-company.mjs` levanta la compañía
entera y lo podés correr dos veces sin romper nada.

## Qué no funcionó

**No conseguí que un agente arrancara en Windows.** Los dos quedan ciclando
entre `verifying` y `paused` con `harness_test_failed`, mientras el CLI de
Claude funciona perfecto por fuera: si lo corro a mano con el mismo comando y en
el mismo directorio, responde y sale con código 0.

Fui descartando hipótesis una por una:

1. Que el servidor no viera el CLI en su PATH. Lo reinicié después de instalarlo
   y confirmé que se ve desde una terminal nueva. Falla igual.
2. Que la descarga del puente ACP no llegara por caché de npm corrupta. Limpié
   la caché, que pasó de varios GB a 4,8 MB. Falla igual, y rápido.
3. Que el rango de versión que pide no existiera. Existe.
4. Que la caché se siguiera corrompiendo. Le di una caché nueva fuera de
   `AppData`. Falla igual.
5. Que el espacio en `C:\Users\Natalia Martínez\` rompiera el spawn. Armé un
   shim en una ruta 8.3 sin espacios y se lo apunté con `adapterConfig.command`.
   El test lo reconoce como ejecutable. Falla igual.
6. Que el id de modelo fuera inválido. Está en la lista que devuelve la API.
7. Que necesitara una API key y no aceptara el token de suscripción. Probé con
   una key real con saldo. Falla idéntico, así que no es autenticación.
8. Que las credenciales de entorno le ganaran al login guardado y lo rompieran.
   Arranqué sin ninguna credencial. Falla igual.
9. Que Node en Windows no pudiera spawnear un `.cmd` sin shell. Le apunté al
   `claude.exe` nativo. Falla igual.

También probé el camino que el producto propone, que es conectar Anthropic como
proveedor de modelo en Connectors en vez de usar variables de entorno. La
conexión queda sana, pero al vincularla al agente devuelve "The selected AI
connection failed validation in this agent's environment". O sea que el bloqueo
es anterior a la credencial, venga por donde venga.

### La décima hipótesis, que era la buena

Me faltaba una, y la encontré recién cuando levanté todo en una Mac prestada.
Está en el código instalado, en `@paperclipai/shared/dist/agent-runner.js`:

```js
export function paperclipRunnerSupportsPlatform(harness, platform, architecture, ...) {
    return !!paperclipRunnerProfileForHarness(harness)
        && ...
        && ((platform === "linux" && ...) || (platform === "darwin" && (architecture === "arm64" || architecture === "x64")));
}
```

**`win32` no está en esa lista.** El Paperclip Runner nativo soporta Linux y
macOS, y nada más.

La consecuencia es que en Windows `agentRunnerAvailability("claude_local")`
devuelve un único runner disponible, **Legacy**, que es el que spawnea el CLI y
el puente ACP a mano. Mis agentes nacieron siempre ahí, sin que yo lo eligiera y
sin que nada me lo dijera. En la Mac, en cambio, el default es el runner nativo:
los agentes quedaron con `adapterType: paperclip_runner`, `provider: acpx`,
`acpxAgent: claude`, y llegaron a lifecycle `ready` en vez de ciclar entre
`verifying` y `paused`.

Lo terminó de confirmar un detalle lindo: en la Mac mi propio
`setup-company.mjs` se rompió con un `422 agent_runner_config_incompatible`,
porque `maxTurnsPerRun` es un ajuste **exclusivo de Legacy**. O sea que el
script funcionaba en Windows justamente porque allá nunca hubo otra opción.

Las nueve hipótesis anteriores estaban bien descartadas. Lo que me faltaba no
era una causa dentro del camino que estaba mirando: era que **en Windows ese
camino es el único que hay, y es el que está roto**.

Y quedó confirmado de la forma más limpia posible: en la Mac forcé el runner
Legacy a mano, o sea la configuración exacta que tenía en Windows, y **ahí sí
funcionó**. El agente escaneó el inventario, reportó los 7 lotes en riesgo y
empezó a llamar `inventory_place_lot` por cada uno. Así que la conclusión no es
"Legacy está roto": es que **Legacy en Windows está roto, y en Windows es lo
único que hay**.

Hay un detalle más que vale para cualquiera que quiera reproducir esto: como
`maxTurnsPerRun` es exclusivo de Legacy, mi script de setup tira
`422 agent_runner_config_incompatible` en Mac o Linux, donde el default es el
runner nativo. Lo dejé condicionado a `PAPERCLIP_RUNNER=legacy`, así el mismo
script levanta la compañía en los tres sistemas y además permite reproducir a
propósito la configuración de Windows.

### Una cosa más sobre las credenciales

Mi regla de no dejar credenciales en el entorno quedó confirmada por el código,
y es más delicada de lo que pensaba. El probe arma su entorno así:

```js
{ ...sanitizeInheritedPaperclipEnv(process.env), ...configEnv }
```

Esa función de sanitizado sólo saca las variables `PAPERCLIP_*`, y el servidor
borra aparte apenas cuatro de anidamiento de Claude Code. **Todo el resto del
shell que lanza el servidor le llega al probe.** Por eso en la Mac levanté los
servidores con `env -i` y un PATH mínimo: si los hubiera lanzado desde una
sesión cualquiera, variables como `ANTHROPIC_BASE_URL` se habrían colado sin que
nadie se entere.

Como en Windows no salía, probé mover todo a Linux, que de paso me resolvía el
link a la plataforma. Monté la app en Fly con la imagen que ellos publican, el
volumen y las variables, y ahí me choqué con otra cosa: **la imagen de Paperclip
no entra en Fly**. Pesa 5,3 GB comprimidos y al desempaquetarse supera el límite
de 8 GiB que impone la plataforma. Probé agrandar el disco raíz con
`--rootfs-size`, que es la única opción que existe para eso, y el error es
idéntico — o sea que el tope no es del disco que pedís sino de Fly. Con una
imagen que trae adentro cuatro CLI de agentes, ese techo queda corto.

Hay otras tres cosas que me frenaron y que vale anotar:

**El workspace aislado exige un checkout de git, y no lo dice antes.** Después
de un reintento, Paperclip puso OPF-2 en modo `fresh_isolated_workspace` por
precaución —porque una corrida previa había quedado sin efectos verificados— y
la etapa de revisión empezó a fallar pidiendo un `git_worktree` sobre una
carpeta que no era un repositorio. El campo no es editable desde la interfaz y
un `PATCH` a la tarea devuelve 200 pero lo ignora. Se resuelve haciendo
`git init` en la carpeta de trabajo del agente, pero no hay nada que lo
anticipe: el modo se activa solo y el requisito aparece recién cuando algo ya
falló.

**Las conexiones a herramientas se crean por API pero no se terminan por API.**
La ruta real es `/api/tool-connections/{id}`, no está en la documentación, y la
encontré leyendo el log del servidor. El último tramo del alta, cuando la
conexión usa credencial propia, sólo se completa desde la interfaz. Por eso el
setup no puede ser 100% scriptable y lo dejé escrito en el README en vez de
disimularlo.

**El diagnóstico útil existe, pero está escondido.** El log del servidor sólo
escribe `exitCode 1`. El detalle de verdad —qué chequeo falló, si hay
credenciales en el entorno pisando el login, y el comando exacto para
reproducirlo a mano— está en *Agente → Harness / Runtime → Run test → Test
details*. A cuatro clics, y ningún mensaje de error lo menciona. Si hubiera
abierto esa pantalla al principio me ahorraba la mitad de las hipótesis.

## Qué haría la semana que viene

1. **Sacar el token de la URL.** Hoy la key del MCP viaja como parámetro de
   query, que es el patrón que Paperclip soporta para Zapier. Lo hice así porque
   `config` y `transportConfig` rechazan campos sensibles y el flujo de cuenta
   es sólo UI, pero una URL con token queda en los logs de cualquier proxy
   intermedio y un header no.
2. **Pasar del número de prueba a uno propio.** Verificación del portfolio con
   la constancia fiscal, método de pago —el mensaje iniciado por la empresa se
   cobra por conversación— y token de Usuario del sistema, porque el de consola
   vence a las 24 horas.
3. **Cerrar el loop con el webhook de estado de Meta**, para que la tarea no
   termine en "enviado" sino en "entregado" o "leído", y que un rechazo vuelva
   al hilo como evidencia.
4. **Reemplazar el dataset sembrado por el ERP real.** El motor consume una
   interfaz chica —productos, lotes, cuentas, compras— así que es escribir un
   adapter, no rehacer la lógica.
5. **Que el motor reparta la demanda entre lotes del mismo producto.** Hoy busca
   una sola cuenta que absorba cada lote completo, y lo evalúa en forma aislada.
   Lo descubrí usándolo: me reportó un lote de 300 suturas como imposible de
   colocar, y mi primera reacción fue partirlo entre dos clínicas. Estaba mal,
   porque otro lote de la misma sutura ya estaba comprometido con una de ellas y
   le comía la mitad de la demanda. El motor tiene que repartir la demanda de
   cada cuenta entre todos los lotes del mismo SKU, consumiendo primero el que
   vence antes, poder partir un lote entre varias cuentas, y que
   `inventory_draft_offer` acepte cantidad.
6. **Reportarles el bloqueo del adapter.** Nueve hipótesis descartadas con
   evidencia y un comando reproducible es un issue útil, no una queja.
