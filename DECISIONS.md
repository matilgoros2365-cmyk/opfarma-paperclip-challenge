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
  de aprobación y tres tareas, con un revisor agente y dos aprobaciones humanas.
- **La oferta llegó a un celular real**, desde la Mac y desde Windows: salió con
  mi aprobación, y Meta avisó por webhook que se entregó y se leyó.
- **Corre en macOS y en Windows**, en Windows dentro de WSL2, porque el runner
  nativo de Paperclip no lo soporta.
- El canal quedó listo para producción en la cuenta de la empresa
  ([`docs/PRODUCCION.md`](docs/PRODUCCION.md)).
- 193 tests, con una verificación independiente del motor
  ([`VERIFICATION.md`](VERIFICATION.md)).

**Qué no funcionó, y cómo lo resolví.**

- **El envío no pedía aprobación.** Paperclip lo marcaba como riesgoso pero lo
  dejaba pasar. Lo detectó el agente; lo resolví con una política, que el setup
  ya crea.
- **La aprobación del margen no tenía botón.** La etapa humana de una tarea
  sólo se aprueba por la API. La pasé a una herramienta con aprobación, que sí
  tiene tarjeta, y el servidor rechaza números distintos de los del motor.
- **Cada respuesta a una tarjeta exigía Retry.** Con workspace aislado, Paperclip
  pide que la carpeta de trabajo sea un repositorio de git. El setup ahora la crea
  así, y en Windows el agente siguió solo después de mi aprobación.
- **Paperclip no entra en Fly.** Publiqué en Vercel lo que tiene que estar en
  internet: la página, los MCP, el webhook y las credenciales de Meta. Paperclip
  corre en cada máquina, como está pensado, y todas mandan por ese canal.
- **Meta bloqueó la primera cuenta de prueba.** Abrí una sólo de OpFarma, y desde
  ahí llegaron dos ofertas reales. Las plantillas siguen en revisión de Meta:
  mientras tanto la oferta viaja como texto dentro de la ventana de 24 horas, y
  pasar a plantilla es cambiar una variable.

El detalle está en [`docs/BITACORA.md`](docs/BITACORA.md).

**Qué haría la semana siguiente.** Activar el canal en la cuenta de Meta de la
empresa; alojar Paperclip en un servidor para que el equipo entre sin instalar
nada; repartir la demanda entre lotes del mismo producto; sacar la clave del MCP
de la URL, y conectar el sistema de gestión real.
