# Decisiones

**Qué elegí y por qué.** Las tres vías, con un solo objetivo, colocar lotes de
insumos médicos antes de que venzan, algo que exige cruzar cada lote con lo que
consume cada cuenta.

- **B2, WhatsApp**, la principal. Le ofrece el lote a la cuenta que lo consume a
  tiempo, por la Cloud API de Meta.
- **B3, LinkedIn simulado.** Ofrece a clínicas nuevas el lote que ninguna cuenta
  absorbe. Elegí LinkedIn porque ahí están los compradores de clínicas. Publicar
  como empresa exige que LinkedIn apruebe la app, así que es un dry-run con el
  pedido exacto.
- **B1, Grokbot.** Es un directorio de plugins, y Grok Bot no recibe órdenes de
  otros sistemas. El agente elige el plugin y deja el traspaso listo para que
  una persona lo pegue en Grok.

El precio lo calcula código con tests, no el modelo, y cada `draft_id` es el
hash de lo que sale, así que sale exactamente lo que se aprobó. Fuentes en
[`research/CANALES.md`](research/CANALES.md).

**Qué funcionó.**

- Un script idempotente crea la compañía con tres agentes (revisor, comercial y
  growth), cada uno limitado a su área, y cinco tareas. La del envío lleva el
  review humano, con dos tarjetas que frenan el margen y el mensaje.
- **La oferta llegó a un celular real**, desde la Mac y desde Windows, y Meta
  avisó por webhook que se entregó y se leyó.
- El posteo aprobado y el traspaso a Grok quedaron registrados en sus tareas.
- Corre en macOS y en Windows (WSL2), con 209 tests y una verificación
  independiente del motor ([`VERIFICATION.md`](VERIFICATION.md)).

**Qué no funcionó, y cómo lo resolví.** Detalle en la
[bitácora](docs/BITACORA.md) y el
[registro de decisiones](docs/REGISTRO-DE-DECISIONES.md).

- **El envío no pedía aprobación.** Paperclip lo marcaba como riesgoso pero lo
  dejaba pasar. Lo detectó el agente y lo resolví con una política.
- **La etapa humana que bloquea el *done* no tiene botón** en esta versión;
  sólo se aprueba por la API. Pasé las decisiones humanas a tarjetas que el
  servidor valida contra el motor.
- **Meta bloqueó la primera cuenta de prueba.** Abrí una sólo de OpFarma y
  llegaron cinco ofertas reales. Las plantillas siguen en revisión, así que la
  oferta viaja como texto dentro de la ventana de 24 horas.
- **Paperclip corre local, a propósito.** Publicarlo sumaba costo y riesgos
  ([`deploy/README.md`](deploy/README.md)).

**Qué haría la semana siguiente.** Activar WhatsApp en la cuenta de la empresa;
una rutina que cree las tareas sola; avisarle a la tarea cuando el cliente
responde; publicar en LinkedIn con la app aprobada; alojar Paperclip en un
servidor, y conectar el sistema de gestión real.

**Cómo lo trabajé.** Usé Claude Code para el código, la plataforma y los
documentos, revisando cada entrega. Me reservé lo que no se delega,
definir dónde interviene una persona, limitar cada agente a sus herramientas,
dar de alta las cuentas reales y aprobar cada acción que afecta a un tercero.
