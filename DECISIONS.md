# Decisiones

**Qué elegí y por qué.** La opción B2, WhatsApp con la Cloud API de Meta: el
enunciado acepta como ideal un flujo listo para que una persona lo apruebe, y el
número de prueba de Meta no exige verificación de negocio. Como objetivo elegí
colocar lotes de insumos médicos próximos a vencer, una tarea que a mano no se
llega a hacer porque exige cruzar cada lote con la rotación de cada cuenta. El
precio lo calcula código con tests, no el modelo, y el `draft_id` es el hash del
mensaje, así que sale exactamente lo que se aprobó.

**Qué funcionó.**

- Un script idempotente crea la compañía: dos agentes, dos conexiones MCP y
  tres tareas, una con revisión de agente y aprobación humana.
- La revisión se ejecutó de punta a punta en OPF-2.
- En OPF-3 Paperclip frenó el envío, pidió aprobación y, al aprobarlo, el
  servidor devolvió el mensaje exacto en dry-run. La auditoría lo confirma.
- **La oferta llegó a un celular real.** En OPF-7, con mi aprobación en
  Paperclip, la oferta de L-4028 salió por la Cloud API desde el número de
  prueba de una cuenta de WhatsApp Business propia de OpFarma. Meta avisó por el
  webhook que se entregó, la plataforma lo muestra y el agente lo registró en la
  tarea.
- El canal quedó listo para producción: plantillas definidas en el código,
  webhook de estado con firma verificada y el procedimiento para activarlo en la
  cuenta de la empresa ([`docs/PRODUCCION.md`](docs/PRODUCCION.md)).
- 183 tests, con una verificación independiente del motor
  ([`VERIFICATION.md`](VERIFICATION.md)).

**Qué no funcionó.**

- Directamente en Windows los agentes no arrancan: el runner de Paperclip para
  Windows falla. Lo resolví corriendo Paperclip en Ubuntu dentro de WSL2, donde
  los agentes trabajan con las mismas herramientas; la demo grabada es en Mac.
- El control del envío no venía configurado: Paperclip lo marcaba como riesgoso
  pero lo dejaba pasar. Lo detectó el agente y lo resolví con una política.
- Con workspace aislado, cada respuesta a una tarjeta falla y requiere Retry.
- La imagen de Paperclip supera el límite de Fly; el control plane quedó local.
- La primera cuenta de WhatsApp de prueba, compartida con otro proyecto porque
  Meta no me dejó crear un portfolio nuevo, respondió "cuenta bloqueada"
  (131031). La entrega salió recién con una cuenta nueva. Las plantillas de la
  oferta quedaron en revisión de Meta, así que la oferta viajó como texto,
  dentro de la ventana de 24 horas.

El detalle está en [`docs/BITACORA.md`](docs/BITACORA.md).

**Qué haría la semana siguiente.** Activar el canal en la cuenta de Meta de la
empresa, con su CUIT y un número propio; repartir la demanda entre lotes del
mismo producto; darle a la compañía un workspace de git para eliminar el Retry;
sacar la clave del MCP de la URL, y conectar el sistema de gestión real.
