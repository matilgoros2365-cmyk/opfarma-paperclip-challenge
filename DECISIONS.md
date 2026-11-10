# Decisiones

**Qué elegí y por qué.** Las tres vías, con una sola historia. El objetivo es
colocar lotes de insumos médicos antes de que venzan, algo que a mano no se hace
porque exige cruzar cada lote con lo que consume cada cuenta.

- **B2, WhatsApp**, la principal. Le ofrece el lote a la cuenta que lo consume a
  tiempo, por la Cloud API de Meta.
- **B3, LinkedIn simulado.** Ofrece a clínicas nuevas el lote que ninguna cuenta
  absorbe. Elegí LinkedIn porque ahí están los compradores de clínicas; como
  publicar como empresa exige que LinkedIn apruebe la app, el envío es un
  dry-run con el pedido exacto.
- **B1, Grokbot.** Es un directorio de plugins para Grok Bot, con un MCP
  público, y Grok Bot no recibe órdenes de otros sistemas. El agente elige el
  plugin y deja el traspaso listo para que una persona lo pegue en Grok.

El precio lo calcula código con tests, no el modelo, y cada `draft_id` es el
hash de lo que sale, así que sale exactamente lo que se aprobó. Las fuentes de
cada elección están en [`research/CANALES.md`](research/CANALES.md).

**Qué funcionó.**

- Un script idempotente crea la compañía con tres agentes (revisor, comercial y
  growth), cada uno limitado a las herramientas de su área, cuatro conexiones
  MCP y cinco tareas. La del envío lleva el review humano, dos tarjetas que
  frenan el margen y el mensaje.
- **La oferta llegó a un celular real**, desde la Mac y desde Windows, y Meta
  avisó por webhook que se entregó y se leyó.
- El posteo aprobado y el traspaso a Grok quedaron en el historial de sus tareas.
- Corre en macOS y en Windows (dentro de WSL2), con 209 tests y una
  verificación independiente del motor ([`VERIFICATION.md`](VERIFICATION.md)).

**Qué no funcionó, y cómo lo resolví.**

- **El envío no pedía aprobación.** Paperclip lo marcaba como riesgoso pero lo
  dejaba pasar. Lo detectó el agente y lo resolví con una política.
- **La etapa humana que bloquea el *done* no tiene botón** en esta versión, y
  sólo se aprueba por la API. Pasé las decisiones humanas a tarjetas, y el
  servidor rechaza cualquier número distinto del motor.
- **Cada respuesta a una tarjeta exigía Retry**, porque Paperclip pide que la
  carpeta de trabajo sea un repositorio git. El setup ahora la crea así.
- **Paperclip no entra en Fly.** Publiqué en Vercel lo que tiene que estar en
  internet; Paperclip corre en cada máquina y todas usan ese canal.
- **Meta bloqueó la primera cuenta de prueba.** Abrí una sólo de OpFarma y
  llegaron cinco ofertas reales. Las plantillas siguen en revisión, así que la
  oferta viaja como texto dentro de la ventana de 24 horas.

Cada decisión con sus alternativas está en el
[registro de decisiones](docs/REGISTRO-DE-DECISIONES.md), y cada obstáculo con lo
que probé, en la [bitácora](docs/BITACORA.md).

**Qué haría la semana siguiente.** Activar WhatsApp en la cuenta de la empresa;
una rutina que cree las tareas sola; que el webhook le avise a la tarea cuando el
cliente lee o responde; publicar en LinkedIn con la app aprobada; alojar
Paperclip en un servidor, y conectar el sistema de gestión real.
