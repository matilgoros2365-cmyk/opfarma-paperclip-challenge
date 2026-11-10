# Paperclip: research, versión extendida

La versión de una página, que es la que pide el enunciado, está en
[RESEARCH.md](RESEARCH.md).

Este documento lo armé a partir del sitio, la documentación y el código, y
después de levantar Paperclip y operarlo con una compañía real. Corresponde a la
versión **v2026.1106.0**, relevada entre el 7 y el 9 de noviembre de 2026.

## 1. Qué es y qué no es

Paperclip es un **control plane open source para operar un equipo de agentes**:
un servidor Node con interfaz en React, que se autohospeda. Los agentes los
aporta cada uno (Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Hermes, Grok
Build, Kimi o cualquier bot que responda un webhook), y Paperclip les agrega
organigrama, tareas, presupuesto, etapas de revisión y un registro de todo lo
que hacen. Ellos lo resumen así: si OpenClaw es un empleado, Paperclip es la
compañía.

A primera vista parece un gestor de tareas, pero lo que tiene debajo es otra
cosa: organigrama, gobernanza y alineación a objetivos.

También aclaran lo que **no** es: no es un framework de agentes ni define cómo se
construye uno; no es un chatbot ni un gestor de prompts; no es una plataforma de
observabilidad de modelos, y no corre el modelo.

Hay una aclaración que me parece honesta y que vale repetir: no pretende servir
para un solo agente. Su propia página recomienda omitir esta capa si se trabaja
con un único agente local y se revisa la salida a mano. Rinde cuando varios
agentes comparten trabajo, presupuesto o revisores.

## 2. Cómo se organiza el trabajo

**La compañía.** Es la unidad superior: tiene un objetivo, empleados que son
agentes, una estructura de reporte y un presupuesto mensual expresado en
centavos. Una misma instancia puede alojar varias compañías aisladas entre sí.

**Los agentes.** Cada uno tiene un adapter y su configuración (es decir, cómo se
ejecuta), un rol, un título, una línea de reporte, capacidades, presupuesto
propio y un estado. El organigrama es un árbol estricto: cada agente reporta a
exactamente un responsable, salvo el CEO.

El `role` es una lista cerrada de doce valores: `ceo`, `cto`, `cmo`, `cfo`,
`security`, `engineer`, `designer`, `pm`, `qa`, `devops`, `researcher` y
`general`. Como la taxonomía está pensada para una empresa de software, en una
operación comercial el rol dice poco, y el significado real lo termina llevando
el `title`, que es texto libre.

**Las tareas.** Son la unidad de trabajo: título, descripción, prioridad, un
único responsable, una tarea madre que encadena hasta el objetivo y un proyecto.
El ciclo es `backlog → todo → in_progress → in_review → done`, más `blocked` y
`cancelled`. El paso a `in_progress` exige tomar la tarea de forma atómica: si
dos agentes la reclaman a la vez, uno recibe un 409 y no debe reintentar.

**La revisión.** Es lo que más me interesó. Con una *execution policy* que
define una etapa de revisión, marcar una tarea como hecha no la cierra: según la
documentación, el runtime **intercepta la transición**, la deja en `in_review` y
la reasigna al revisor. No depende de que el agente recuerde pedir revisión, así
que el control es real y no una convención. Si el revisor pide cambios, vuelve
al mismo ejecutor. Hay además un detalle fino: si un revisor agente devuelve el
trabajo tres veces seguidas, el runtime deja de rebotarlo y se lo asigna a la
persona responsable; si quien pide cambios es una persona, el contador se
reinicia. El tope existe para frenar ciclos desatendidos entre agentes, no para
limitar la revisión humana.

**Las aprobaciones del board.** Son otra capa, para decisiones de la compañía:
contratar un agente, aprobar la estrategia del CEO o un exceso de presupuesto.
Un dato operativo útil: el CEO no puede mover tareas a `in_progress` hasta que se
apruebe su estrategia, así que si nada arranca, la cola de aprobaciones es el
primer lugar donde mirar.

**Los permisos de cada acción.** Son una tercera capa, independiente de las dos
anteriores. Cada herramienta de una conexión queda clasificada por riesgo
(`read`, `write`, `destructive`), pero la clasificación por sí sola no frena
nada: la aprobación humana existe sólo si hay una política `require_approval`
para esa herramienta y ese agente. Lo detallo en las limitaciones.

**Los presupuestos.** Registran tokens y costo por compañía, agente, proyecto,
objetivo, tarea, proveedor y modelo, con umbrales de alerta y cortes duros.

**Los heartbeats.** Los agentes no corren todo el tiempo: se despiertan por
programación, por asignación de una tarea, por una mención en un comentario, por
una invocación manual o cuando se resuelve una aprobación.

**Las rutinas.** Son trabajo recurrente por cron, webhook o API. Cada ejecución
crea una tarea con responsable e historial.

## 3. Dónde corre, qué claves hacen falta y qué queda local

Se instala con `npx paperclipai@latest onboard --yes` y requiere Node 24.11 o
más nuevo. La configuración por defecto es un único proceso Node con PostgreSQL
embebido y archivos en `~/.paperclip`; arranca en modo `local_trusted`, atado a
127.0.0.1, en el puerto 3100. También se puede ejecutar desde el código fuente con
pnpm, o con Docker.

Tiene tres modos de despliegue: `local_trusted`, sin login y sólo en la propia
máquina; `authenticated + private`, para una red local o Tailscale; y
`authenticated + public`, con una URL pública explícita y controles más
estrictos. El único despliegue en la nube que documentan es con Docker, con una
guía para AWS ECS.

Sobre el reparto de los datos, que era lo que más me interesaba: en el servidor
propio quedan el registro de tareas, los documentos, las aprobaciones y los
secretos cifrados. Al proveedor del modelo van los prompts, el contenido de los
archivos y los resultados de las herramientas que envía cada runtime, porque
Paperclip no ejecuta el modelo. Las claves son propias y se le paga directamente
al proveedor. La telemetría anónima viene **activada** y se desactiva con
`DO_NOT_TRACK=1`. Y hay una clave maestra de secretos: si se pierde, se pierde
todo lo que cifra.

## 4. Limitaciones

Dos las declara el propio producto, y me parece correcto citarlas tal cual: los
presupuestos se calculan sobre el gasto reportado, así que pueden excederse; y
la revisión de una tarea no intercepta cada llamada externa, porque gobierna el
cierre de la tarea y no cada acción.

El resto lo encontré operándolo, y es lo que la documentación no cuenta:

**El permiso de cada acción no siempre viene configurado.** Una herramienta de
escritura pide aprobación sólo si existe una política `require_approval` para
ese agente. Paperclip la crea automáticamente cuando el acceso a la conexión se
otorga desde la interfaz; si se otorga por API, no existe, y la herramienta pasa
sin aprobación aunque esté clasificada como `risk=write`. En mi caso lo detectó
el propio agente, y lo confirmé en la auditoría y en el código.

**En Windows nativo los agentes no arrancan.** Nunca logré que uno pasara su
chequeo de ejecución, con el CLI de Claude funcionando correctamente por fuera.
La causa la encontré recién en una Mac: el runner nativo sólo soporta Linux y
macOS, así que en Windows queda únicamente el Legacy, que es el que falla. La
salida es WSL2: con Paperclip dentro de Ubuntu, los agentes pasan el chequeo y
trabajan igual que en la Mac, con un detalle a tener en cuenta (el servicio de
Paperclip no ve la carpeta del usuario, así que Claude Code tiene que estar en
una ruta del sistema). El detalle, con las nueve hipótesis que descarté antes,
está en [`docs/BITACORA.md`](../docs/BITACORA.md).

**La aprobación humana de una tarea no se puede dar desde la interfaz.** El
servidor exige que la decisión llegue con un comentario en el mismo pedido
(`Approving a review or approval stage requires a comment`), pero el menú de
estado manda sólo el cambio a `done` y recibe un 422, y el cuadro de mensajes
manda sólo el comentario: con la tarea en la etapa de aprobación, la reabre en
lugar de aprobarla. "Approval pending with You" es una etiqueta, sin botón. En
esta versión, esa etapa se aprueba por la API.

**El workspace aislado se traba.** Cuando una tarea pasa a ese modo, cada
respuesta a una tarjeta dispara una continuación que pide un repositorio de git
sobre la carpeta de la corrida anterior, y falla. El Retry manual elige una
carpeta nueva y funciona, pero la solución de fondo es que la carpeta de trabajo
ya sea un repositorio: el setup la crea así, y desde entonces el agente sigue
solo después de una aprobación.

**La instalación es más pesada de lo que promete.** Arrastra 440 paquetes, y con
npm 11 deja cinco scripts de instalación sin aprobar, entre ellos el del
PostgreSQL embebido. Si no se aprueban a mano, el servidor no crea nada y no
explica por qué. En el primer intento me pareció que estaba colgado, cuando en
realidad estaba instalando sin mostrar progreso.

**No hay conector nativo de WhatsApp, Instagram ni X.** El catálogo de
comunicación incluye AgentMail, Resend y Slack, y los canales de chat son
experimentales y vienen desactivados. Para el resto hay cuatro caminos: un
servidor MCP propio, agregadores como Zapier o Composio, skills, o darle al
agente una CLI en su espacio de trabajo.

**Las conexiones se crean por API, pero no se completan por API.** La ruta que
las activa es `/api/tool-connections/{id}`, no está documentada y la encontré
leyendo el log del servidor. El último paso del alta con credencial propia sólo
se completa desde la interfaz, así que hoy no es posible un setup completamente
automatizado.

**El adapter de Claude descarga una dependencia en tiempo de ejecución.** Usa
`npx -y` para traer su puente ACP dentro de un chequeo con tiempo límite. En una
máquina con la red o la caché lentas, falla sin mencionar la descarga.

**El diagnóstico útil existe, pero está oculto.** El log sólo registra
`exitCode 1`. Qué chequeo falló y el comando exacto para reproducirlo están en
*Agente → Harness / Runtime → Run test → Test details*: a cuatro clics, y ningún
mensaje de error lo menciona.

**Windows es un sistema de segunda.** El propio `doctor` avisa que no hay
servicio en segundo plano, y sugiere `chmod` para los permisos de la clave de
secretos.

Nada de esto lo vuelve inservible, y buena parte son asperezas esperables en un
proyecto de ocho meses con desarrollo diario. Pero marca la diferencia entre "se
instala en un comando" y "se instala en un comando si todo sale bien".

---

*Fuentes:* paperclip.ing/product/ y /product/open-source/, docs.paperclip.ing
(connectors, approvals, execution policy, custom MCP servers, adapters), el
repositorio paperclipai/paperclip y el código instalado de
`@paperclipai/server` y `@paperclipai/shared`. Relevado entre el 7 y el 9 de
noviembre de 2026 sobre v2026.1106.0. Licencia MIT, TypeScript, unas 112 mil
estrellas, creado en marzo de 2026.
