# Paperclip, en una página

*Elaborado con Claude Code a partir del sitio, la documentación y el código de
Paperclip, y de dos días de uso para levantar OpFarma. Versión v2026.1106.0,
relevada el 7 y 8 de noviembre de 2026. La versión extendida está en
[PAPERCLIP.md](PAPERCLIP.md).*

**Qué es y qué no es.** Paperclip es un control plane open source (MIT) para
operar un equipo de agentes. Es un servidor Node con interfaz en React que se
autohospeda. Los agentes los traés vos (Claude Code, Codex, Cursor, Gemini CLI o
cualquier bot que responda un webhook), y Paperclip les pone organigrama, tareas,
presupuesto, etapas de revisión y un registro de todo. No es un framework para
construir agentes, no es un chatbot ni un gestor de prompts, y no corre el
modelo. Ellos mismos dicen que con un solo agente no hace falta. Rinde cuando
varios agentes comparten trabajo, presupuesto o revisores.

**Cómo organiza el trabajo.** La compañía tiene un objetivo, un presupuesto y
agentes en un organigrama donde cada uno reporta a un solo manager. El rol es una
lista cerrada de doce valores pensada para una empresa de software (`ceo`,
`engineer`, `qa`…), así que en una operación comercial el peso lo lleva el
título, que es libre. El trabajo son tareas con un único responsable, que pasan
por `backlog → todo → in_progress → in_review → done`. Los agentes no corren todo
el tiempo. Se despiertan por asignación, por mención, por schedule, a mano o
cuando se resuelve una aprobación. La gobernanza vive en la política de ejecución
de cada tarea, con etapas de revisión de un agente y de aprobación de una persona
que el runtime aplica al cierre en vez de depender de que el agente se acuerde.

**Dónde corre y qué keys hacen falta.** Se instala con
`npx paperclipai onboard` y queda como un proceso Node con PostgreSQL embebido en
`~/.paperclip`, atado a `127.0.0.1:3100` sin login. Hay modos autenticados para
red privada o pública, y una imagen Docker. En tu servidor quedan las tareas,
los documentos, las aprobaciones y los secretos, cifrados con una master key que
si perdés, perdés todo. Al proveedor del modelo van los prompts y los resultados
de las tools, con tus propias keys. Yo usé el login de Claude Code, y también
acepta una API key de Anthropic. La telemetría anónima viene encendida y se apaga
con `DO_NOT_TRACK=1`.

**Limitaciones.** Dos las declara el producto. Los presupuestos se calculan
sobre el gasto reportado, así que se pueden pasar, y la revisión gobierna el
cierre de la tarea, no cada acción. El resto lo encontré usándolo.

- **El permiso de cada acción no siempre viene configurado.** Una tool de
  escritura pide aprobación sólo si hay una política `require_approval`, que
  Paperclip crea cuando el acceso se da desde la interfaz, no por API. Mi envío
  de WhatsApp pasaba directo, y lo detectó el propio agente.
- **En Windows nativo los agentes no arrancan.** El runner nativo sólo soporta
  Linux y macOS, y el que queda, Legacy, falla en Windows. La salida es WSL2.
  Con Paperclip dentro de Ubuntu, los agentes funcionan igual que en la Mac.
- **La aprobación humana de una tarea no se puede dar desde la interfaz.** El
  servidor exige la decisión con un comentario en el mismo pedido, y ningún
  control de la interfaz lo manda. El menú de estado da error y el cuadro de
  mensajes reabre la tarea. La salida es una herramienta con aprobación.
- **No hay conector de WhatsApp, Instagram ni X.** Hace falta un servidor MCP
  propio o un agregador como Zapier.
- **Las conexiones se crean por API, pero el alta con credencial se termina en la
  interfaz**, y la ruta que las activa no está documentada.
- **El workspace aislado pide git.** Cada respuesta a una tarjeta dispara una
  continuación que exige un repositorio git; si la carpeta no lo es, falla. Se
  evita creándola como repositorio.
- **El diagnóstico útil está escondido.** El log dice `exitCode 1`; la causa real
  está en *Run test → Test details*, a cuatro clics.

Nada de esto lo vuelve inservible, y es esperable en un proyecto de ocho meses.
Pero marca la diferencia entre "se instala en un comando" y "anda en un comando".
