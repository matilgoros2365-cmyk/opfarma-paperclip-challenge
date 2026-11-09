# Paperclip — mi research

Lo que sigue lo armé leyendo el sitio, la documentación y el código, y después
levantándolo en mi máquina. Está sobre la versión **v2026.1106.0**, relevado
entre el 7 y el 8 de noviembre de 2026.

## 1. Qué es y qué no es

Paperclip es un **control plane open source para operar un equipo de agentes**:
un servidor Node con una UI en React, que se autohospeda. Vos traés los agentes
—Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Hermes, Grok Build, Kimi, o
cualquier bot que responda un webhook— y Paperclip les pone organigrama, tareas,
presupuesto, etapas de revisión y un registro de todo. Ellos lo resumen así: si
OpenClaw es un empleado, Paperclip es la compañía.

Parece un gestor de tareas cuando lo abrís, pero abajo es otra cosa: organigrama,
gobernanza y alineación a objetivos.

Lo que **no** es, y lo aclaran ellos mismos: no es un framework de agentes, no
define cómo se construye uno. No es un chatbot ni un prompt manager. No es una
plataforma de observabilidad de modelos. Y no corre el modelo.

Hay algo que me pareció honesto de su parte y que conviene repetir: tampoco
pretende servir para un solo agente. Su propia página dice que si corrés un
único agente local y revisás vos la salida, te saltees esta capa. Paga cuando
hay varios agentes compartiendo trabajo, presupuesto o revisores.

## 2. Cómo se organiza el trabajo

**Organization (company).** Es la unidad de más arriba: tiene un objetivo,
empleados que son agentes, estructura de reporte y presupuesto mensual en
centavos. Una instancia puede correr varias compañías aisladas entre sí.

**Agents.** Cada uno tiene adapter y config —o sea cómo corre—, rol, título,
línea de reporte, capacidades, presupuesto propio y estado. El organigrama es un
árbol estricto: cada agente reporta a exactamente un manager, salvo el CEO.

El `role` es un enum cerrado de doce valores: `ceo`, `cto`, `cmo`, `cfo`,
`security`, `engineer`, `designer`, `pm`, `qa`, `devops`, `researcher`,
`general`. Como la taxonomía está pensada para una empresa de software, en una
operación comercial el rol nombra poco y el peso lo termina llevando el `title`,
que es texto libre.

**Issues.** Son la unidad de trabajo: título, descripción, prioridad, un único
responsable, un issue padre que encadena hasta el objetivo, y proyecto. El ciclo
es `backlog → todo → in_progress → in_review → done`, más `blocked` y
`cancelled`. El paso a `in_progress` exige un checkout atómico: si dos agentes
reclaman la misma tarea, uno recibe un 409 y no debe reintentar.

**Revisión.** Acá hay algo que me gustó más de lo que esperaba. Con una
*execution policy* que define etapa de review, marcar "done" no cierra la tarea:
el runtime **intercepta la transición**, la deja en `in_review` y la reasigna al
revisor. No depende de que el agente se acuerde de pedir revisión, así que el
gate es real y no una convención. Si el revisor pide cambios, vuelve al mismo
ejecutor. Y hay un detalle fino: si un revisor agente devuelve el trabajo tres
veces seguidas, el runtime deja de rebotarlo y se lo asigna al humano
responsable; pero si quien pide cambios es una persona, el contador se resetea.
El tope existe para frenar loops desatendidos entre agentes, no para limitar la
revisión humana.

**Approvals de board.** Es otra capa, para decisiones de la compañía: contratar
un agente, la estrategia del CEO, override de presupuesto. Un dato operativo que
me ahorró una tarde: el CEO no puede mover tareas a `in_progress` hasta que
apruebes su estrategia, así que si nada arranca, la cola de approvals es el
primer lugar donde mirar.

**Budgets.** Tracking de tokens y costo por compañía, agente, proyecto, objetivo,
issue, provider y modelo, con umbrales de alerta y cortes duros.

**Heartbeats.** Los agentes no corren continuo: despiertan por schedule, por
asignación de tarea, por mención en un comentario, por un "Invoke" manual o
cuando se resuelve un approval.

**Routines.** Trabajo recurrente por cron, webhook o API. Cada corrida crea un
issue con dueño e historial.

## 3. Dónde corre, qué keys hacen falta, qué queda local

Se instala con `npx paperclipai@latest onboard --yes` sobre Node 24.11 o más
nuevo. El default es un único proceso Node con PostgreSQL embebido y archivos en
`~/.paperclip`; arranca en modo `local_trusted`, atado a 127.0.0.1, en el puerto
3100. También se puede correr desde el fuente con pnpm, o con Docker.

Hay tres modos de despliegue: `local_trusted` sin login y sólo loopback,
`authenticated + private` para LAN o Tailscale, y `authenticated + public` con
URL pública explícita y chequeos más estrictos. El único cloud que documentan es
Docker, con una guía para AWS ECS.

Sobre el reparto del dato, que es lo que más me interesaba: en tu servidor
quedan el registro de tareas, los documentos, los approvals y los secretos
cifrados. Al provider van los prompts, el contenido de los archivos y los
resultados de las tools que manda cada runtime, porque Paperclip no corre el
modelo. Las keys son tuyas y le pagás directo al proveedor. La telemetría
anónima viene **encendida** y se apaga con `DO_NOT_TRACK=1`. Y hay una master
key de secretos: si la perdés, perdés todo lo que cifra.

## 4. Limitaciones

Dos las declara el propio producto y me parece bien citarlas tal cual: los
presupuestos se calculan sobre gasto reportado, así que pueden pasarse; y el
review de tarea no intercepta toda llamada externa, porque gobierna el cierre de
la tarea y no cada acción. Las acciones de conector tienen su propio permiso,
aparte, pero ojo: ese permiso es una política `require_approval` por tool y por
agente. Paperclip la crea solo cuando el acceso se da desde la interfaz; si se da
por API, no existe, y una tool de escritura pasa sin aprobación aunque esté
clasificada como `risk=write`.

Después está lo que encontré yo levantándolo, que es lo que la documentación no
cuenta:

**El setup es más pesado de lo que promete.** Arrastra 440 paquetes, y en npm 11
deja cinco postinstall sin aprobar, entre ellos el del PostgreSQL embebido. Sin
aprobarlos a mano el servidor no crea nada y no explica por qué. A mí el primer
intento me pareció que estaba colgado cuando en realidad estaba instalando en
silencio.

**No hay conector nativo de WhatsApp, Instagram ni X.** El catálogo de
comunicación son AgentMail, Resend y Slack, y los chat channels son
experimentales y vienen apagados. Para el resto quedan cuatro caminos: servidor
MCP propio, agregadores como Zapier o Composio, skills, o darle al agente una
CLI en un workspace.

**Las conexiones a herramientas se crean por API pero no se terminan por API.**
La ruta real es `/api/tool-connections/{id}` —no la que uno busca, y no está
documentada: la encontré leyendo el log del servidor—. El último tramo del alta
con credencial propia sólo se completa desde la interfaz, así que un setup
totalmente scriptable hoy no se puede.

**El adapter de Claude baja una dependencia en tiempo de ejecución.** Usa
`npx -y` para traer su puente ACP dentro de un probe con timeout. En una máquina
con la red o la caché lentas falla sin nombrar la descarga.

**Nunca logré que un agente pasara su chequeo de ejecución en Windows**, con el
CLI de Claude funcionando perfecto por fuera. Descarté nueve hipótesis con
evidencia; está detallado en `DECISIONS.md`.

**El diagnóstico útil existe pero está escondido.** El log sólo escribe
`exitCode 1`. Qué chequeo falló y el comando exacto para reproducirlo están en
*Agente → Harness / Runtime → Run test → Test details*, a cuatro clics, y ningún
mensaje de error lo menciona.

**Windows es ciudadano de segunda.** El propio `doctor` avisa que no hay servicio
en background, y sugiere `chmod` para los permisos de la clave de secretos.

Nada de esto lo vuelve inservible, y la mitad son asperezas esperables en un
proyecto de ocho meses con desarrollo diario. Pero marca la diferencia entre "se
instala en un comando" y "se instala en un comando si todo sale bien".

---

*Fuentes:* paperclip.ing/product/ y /product/open-source/, docs.paperclip.ing
(connectors, approvals, execution policy, custom MCP servers, adapters) y el
repo paperclipai/paperclip. Relevado el 7 y 8 de noviembre de 2026 sobre
v2026.1106.0. MIT, TypeScript, unas 112 mil estrellas, creado en marzo de 2026.
