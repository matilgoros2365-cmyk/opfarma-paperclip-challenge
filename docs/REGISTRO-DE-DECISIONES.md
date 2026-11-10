# Registro de decisiones

[`DECISIONS.md`](../DECISIONS.md) resume en media página, como pide el
enunciado. Acá está cada decisión importante con lo que había para elegir, lo
que elegí y por qué. Los obstáculos y cómo los fui resolviendo, con el detalle
técnico, están en la [bitácora](BITACORA.md).

## El problema

**1. Qué problema resolver.**
- *Opciones.* Una demo del tipo "el agente manda un WhatsApp", o un problema
  real del rubro de la empresa.
- *Elegí* colocar lotes de insumos médicos antes de que venzan.
- *Por qué.* El rol es para una empresa de dispositivos e insumos médicos. Un
  lote que vence en depósito pierde el 100% del costo, y saber a quién
  vendérselo a tiempo exige cruzar cada lote con lo que consume cada cuenta,
  algo que a mano no se hace. Lo respaldan auditorías de la AGN, normativa de
  ANMAT y estudios, en [`research/EXPIRY.md`](../research/EXPIRY.md).

**2. Dónde se calcula el precio.**
- *Opciones.* Que lo proponga el modelo, o que lo calcule código.
- *Elegí* código con tests, y el agente nunca toca los números.
- *Por qué.* El piso, el margen y el descuento son aritmética. Un modelo que
  inventa un descuento pierde plata sin que nadie lo advierta.

**3. Cuándo actuar sobre un lote.**
- *Opciones.* A 60 o 90 días del vencimiento, como hace el mercado secundario, o
  antes.
- *Elegí* tramos que empiezan a los nueve meses, con la línea fuerte en los seis.
- *Por qué.* Tres fuentes independientes ponen el límite en seis meses (la
  Disposición ANMAT 2565/2025, la valuación de distribuidoras y la definición
  de vencimiento corto). A 60 días sólo queda rematar.

**4. Datos reales o de ejemplo.**
- *Opciones.* Conectar un sistema de gestión, o un dataset armado.
- *Elegí* un dataset de ejemplo con forma de sistema de gestión.
- *Por qué.* No tengo acceso al sistema de la empresa, y los datos de lotes y
  vencimientos no los expone ninguna API pública. El motor consume una interfaz
  acotada, así que conectar el real es escribir un adaptador.

## Paperclip

**5. Qué roles y cuántos agentes.**
- *Opciones.* Los dos que sugiere el enunciado, o más.
- *Elegí* tres. MarginReviewer revisa, StockScout vende a quien ya compra y
  GrowthScout busca compradores nuevos.
- *Por qué.* Son tres áreas reales de una distribuidora, y cada una tiene un
  riesgo distinto. No sumé más porque el enunciado aclara que no hace falta una
  agencia de 50 agentes.

**6. Cómo se limita lo que hace cada agente.**
- *Opciones.* Por instrucciones en la tarea, o por políticas de Paperclip.
- *Elegí* políticas, con una matriz de agente por herramienta.
- *Por qué.* Una instrucción el agente la puede ignorar. Una política no, porque
  Paperclip le saca la herramienta de la lista. Lo comprobé en OPF-10.

**7. Dónde está la aprobación humana.**
- *Opciones.* La etapa de aprobación de la política de ejecución, que bloquea el
  *done*; una aprobación del board; o una herramienta con política
  `require_approval`.
- *Elegí* herramientas con aprobación, una para el margen
  (`inventory_commit_offer`), otra para el mensaje y otra para el posteo.
- *Por qué.* La etapa que bloquea el *done* no tiene botón en esta versión de
  Paperclip y sólo se aprueba por la API. La aprobación del board no frena nada
  por sí sola. La tarjeta de una herramienta tiene botón y además frena la
  acción, no sólo el cierre.

**8. Cómo se garantiza que sale lo aprobado.**
- *Opciones.* Confiar en que el agente manda lo mismo, o verificarlo.
- *Elegí* que cada borrador tenga un `draft_id`, el hash de lo que sale, y que el
  servidor rechace cualquier cosa distinta.
- *Por qué.* Así lo puedo demostrar en lugar de prometerlo. Lo mismo hace
  `inventory_commit_offer` con el margen, que recalcula la oferta y rechaza
  números distintos del motor.

**9. Cómo se arma la compañía.**
- *Opciones.* A mano en la interfaz, o con un script.
- *Elegí* un script idempotente que usa la API.
- *Por qué.* Es lo que permite que otra persona la levante en 10 minutos, y se
  puede correr de nuevo sin duplicar nada. Lo único que la API no completa es el
  alta de una conexión con credencial propia, y por eso la clave del MCP va en
  la URL.

**10. Dónde corre Paperclip.**
- *Opciones.* En un servidor en la nube, o en cada máquina.
- *Elegí* cada máquina, y en Windows dentro de WSL2.
- *Por qué.* La imagen de Paperclip no entra en Fly, y Paperclip está pensado
  para correr local. En Windows nativo los agentes no arrancan, porque el runner
  sólo soporta Linux y macOS. Todo lo que tiene que estar en internet quedó en
  Vercel.

## Los canales

**11. Cuántas vías.**
- *Opciones.* Una, como mínimo, o las tres.
- *Elegí* las tres, contando una sola historia.
- *Por qué.* El enunciado dice que más de una es mejor, y cada canal resuelve un
  caso distinto del mismo lote. El detalle y las fuentes están en
  [`research/CANALES.md`](../research/CANALES.md).

**12. WhatsApp, cómo.**
- *Opciones.* Un agregador como Zapier, o la Cloud API de Meta directa.
- *Elegí* la Cloud API, con un servidor MCP propio.
- *Por qué.* El número de prueba no exige verificación de negocio, y un servidor
  propio me deja controlar el `draft_id`, la lista de destinatarios y el
  webhook de estado.

**13. Plantilla o texto.**
- *Opciones.* Esperar a que Meta apruebe la plantilla, o mandar texto.
- *Elegí* texto dentro de la ventana de 24 horas que abre el cliente, con las
  plantillas creadas y listas.
- *Por qué.* Meta no aprobó las plantillas en el plazo. Pasar a plantilla es
  cambiar una variable.

**14. Qué red social.**
- *Opciones.* Instagram, que llega a más gente, o LinkedIn.
- *Elegí* LinkedIn.
- *Por qué.* Los compradores de clínicas están ahí, y es la red que mejor rinde
  entre empresas (85% contra 21% de Instagram, según el Content Marketing
  Institute). Instagram llega a más personas, pero no por su rol.

**15. LinkedIn real o simulado.**
- *Opciones.* Esperar la aprobación de LinkedIn para publicar como empresa, o
  simularlo de forma creíble.
- *Elegí* la simulación creíble. El pedido exacto a la API, con aprobación
  humana y un dry-run explícito, y el camino real listo en
  [`docs/LINKEDIN.md`](LINKEDIN.md).
- *Por qué.* Publicar como página exige la Community Management API, que LinkedIn
  aprueba. Publicar como persona sólo exige agregar un producto, y queda a un
  script de distancia.

**16. Grokbot, qué hacer con él.**
- *Opciones.* Ignorarlo, o integrarlo hasta donde se puede.
- *Elegí* conectar Paperclip a su MCP público y dejar el traspaso listo en la
  tarea.
- *Por qué.* Grokbot es un directorio de plugins para Grok Bot, sin API para
  recibir órdenes, y pide que sus prompts se le muestren a una persona. El
  agente elige el plugin y arma el paquete con el posteo ya aprobado.

## La plataforma

**17. Dónde viven las credenciales.**
- *Opciones.* En cada máquina, o en un solo lugar.
- *Elegí* Vercel, con un token permanente de Meta.
- *Por qué.* Al principio la Mac mandaba con su propio token, que venció. Con
  las credenciales en un solo lugar, cualquier instalación de Paperclip manda
  por el mismo canal, y renovarlas es un solo cambio.

**18. Cómo se ve el resultado sin Paperclip.**
- *Opciones.* Una página que sólo describe, o una que corre el motor.
- *Elegí* una página que corre el mismo motor que los agentes, con un explorador
  de lotes y una barra de tiempo, más los avisos de entrega de Meta.
- *Por qué.* Quien evalúa no puede abrir mi Paperclip, pero sí puede ver cómo
  decide el motor y qué pasó con los mensajes reales.

## Cómo lo verifiqué

**19. Cuánto verificar.**
- *Opciones.* Que funcione una vez, o probarlo desde varios ángulos.
- *Elegí* 18 tipos de prueba, desde tests y mutación hasta envíos reales y una
  instalación desde cero con reloj.
- *Por qué.* Cada prueba ve un tipo de error y es ciega a otros. El detalle está
  en [`VERIFICATION.md`](../VERIFICATION.md).

**20. Qué hacer con lo que no funcionó.**
- *Opciones.* Esconderlo, o documentarlo.
- *Elegí* documentar cada obstáculo con lo que probé y cómo lo resolví, y lo que
  no pude verificar con su razón.
- *Por qué.* El enunciado valora entender los límites de Paperclip, y varios de
  los hallazgos más útiles salieron de lo que no funcionó.
