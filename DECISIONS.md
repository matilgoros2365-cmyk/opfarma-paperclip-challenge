# Decisiones

**Qué elegí y por qué.** La opción B2, WhatsApp con la Cloud API de Meta: el
número de prueba no exige verificación de negocio, y el enunciado valora un
flujo que una persona aprueba. Como objetivo elegí colocar lotes de insumos
médicos próximos a vencer, una tarea que a mano no se llega a hacer porque exige
cruzar cada lote con la rotación de cada cuenta. El precio lo calcula código con
tests, no el modelo, y el `draft_id` es el hash del mensaje: sale exactamente lo
que se aprobó.

**Qué funcionó.**

- Un script idempotente crea la compañía: dos agentes, conexiones MCP, políticas
  de aprobación y tres tareas, una con revisión de agente y aprobación humana.
- **La oferta llegó a un celular real.** Con mi aprobación en Paperclip, salió
  por la Cloud API; Meta avisó por webhook que se entregó y que se leyó, y el
  agente lo registró en la tarea.
- **Corre en macOS y en Windows.** En Windows los agentes de Paperclip no
  arrancan; encontré la causa en su código (el runner nativo sólo soporta Linux
  y macOS) y lo resolví corriendo Paperclip en Ubuntu dentro de WSL2, con los
  mismos resultados que en la Mac.
- El canal quedó listo para producción en la cuenta de la empresa
  ([`docs/PRODUCCION.md`](docs/PRODUCCION.md)).
- 183 tests, con una verificación independiente del motor
  ([`VERIFICATION.md`](VERIFICATION.md)).

**Qué no funcionó.**

- El control del envío no venía configurado: Paperclip lo marcaba como riesgoso
  pero lo dejaba pasar. Lo detectó el agente; lo resolví con una política.
- Con workspace aislado, cada respuesta a una tarjeta requiere Retry.
- La imagen de Paperclip supera el límite de Fly; el control plane quedó local.
- La primera cuenta de WhatsApp de prueba quedó bloqueada por Meta, y las
  plantillas siguen en revisión: la oferta viajó como texto, dentro de la
  ventana de 24 horas.

El detalle está en [`docs/BITACORA.md`](docs/BITACORA.md).

**Qué haría la semana siguiente.** Activar el canal en la cuenta de Meta de la
empresa; repartir la demanda entre lotes del mismo producto; darle a la compañía
un workspace de git para eliminar el Retry; sacar la clave del MCP de la URL, y
conectar el sistema de gestión real.
