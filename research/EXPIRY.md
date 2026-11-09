# Por qué elegí este problema

Esto lo armé antes de escribir una línea de código, porque quería que las
constantes del motor salieran de algún lado y no de mi intuición. Relevado el 8
de noviembre de 2026. Cada número que está en
`platform/lib/expiry/engine.ts` sale de acá.

## El problema vale lo que cuesta

Los distribuidores de insumos médicos descartan por vencimiento entre el **2% y
el 5% del valor de inventario por año**, y las operaciones bien manejadas
apuntan a menos del 2%. Las cifras varían según el segmento y la mayoría viene
de proveedores de software, así que las tomo como orden de magnitud y no como
dato auditado.

Lo que no es opinable es la forma de la pérdida. Un lote que vence en depósito
no te come el margen: destruye el **100% del costo**. Y el producto es apenas
una parte, porque la disposición y el cumplimiento normativo se pagan aparte.

## La línea de los seis meses

Esta es la decisión de diseño más importante que tomé, y no es arbitraria.
Encontré tres fuentes independientes que ponen el límite de utilidad comercial
en el mismo lugar:

**Lo regulatorio.** La Disposición 2565/25 de ANMAT dice que los productos
médicos importados no pueden entrar al país con menos de 6 meses de
vencimiento. Reemplazó a la 1655/99, que era más permisiva.

**Lo financiero.** En due diligence de distribuidoras, todo lo que está a menos
de 6 meses se valúa en cero.

**El mercado.** El mercado secundario llama *short dated* a lo que vence dentro
de 60 a 90 días, y eso ya es territorio de liquidador: compran "a tasas
extremadamente bajas".

Mi primera idea había sido actuar a 60 o 90 días, que es lo que suena intuitivo.
Las tres fuentes juntas me mostraron que esa es la ventana **reactiva**, donde
la única salida es rematar. La ventana donde todavía podés colocar un lote casi
sin perder margen está antes de cruzar los seis meses.

De ahí salieron los cuatro tramos del motor: `place` entre 181 y 270 días,
`discount` entre 91 y 180, `salvage` entre 31 y 90, y `retire` por debajo de 30.

## El piso de precio no es el costo

Vender por debajo de la mejor alternativa de disposición no tiene sentido, así
que el piso quedó como el mayor entre costo más margen mínimo y valor de
rescate. Los liquidadores compran muy barato; en medicamentos los *reverse
distributors* recuperan entre 50% y 80% del costo de adquisición de lo devuelto,
aunque eso aplica a producto retornable y no a insumos ya facturados.

El motor expone el valor de rescate por separado y no sólo el piso, porque
quiero que la persona que aprueba pueda comparar la oferta contra la
alternativa real y no contra un número que alguien asumió.

## La regla que ordena todo

La propia guía del mercado secundario para comprar stock corto dice que hay que
**empezar por la utilización, no por el precio**, y advierte que un marketplace
responsable tiene que mostrar la condición del producto en vez de asumir que
todo es intercambiable.

Por eso en el motor la cuenta queda descalificada por su tasa de consumo
**antes** de que se calcule cualquier descuento. Un descuento más grande no
arregla un cliente que no lo va a usar: sólo traslada la pérdida.

## La fórmula no la inventé

Los prototipos publicados que atacan este problema convergen en la misma cuenta:
consumo proyectado antes del vencimiento = días hasta el vencimiento × tasa de
consumo diaria, y el excedente en riesgo es la cantidad del lote menos ese
proyectado, con piso en cero.

Le agregué una sola cosa, `safetyDays`, que por defecto son 30: no le ofrezco a
nadie un lote que va a terminar de consumir justo el último día. Si el cliente
se queda con stock vencido en la estantería, la pérdida no desapareció, cambió
de dueño. Y en un contexto clínico eso es peor que una pérdida.

## El hueco que me convenció de construirlo

Esto es lo que me terminó de decidir:

**El software comercial avisa pero no coloca.** Los ERP de distribución y los
sistemas de inventario hospitalario hacen FEFO y alertas de vencimiento. Te
dicen qué se va a vencer. No te dicen a quién vendérselo.

**Los que sí hacen el matching lo hacen puertas adentro.** Los proyectos
abiertos que cruzan lote contra consumo resuelven redistribución dentro de una
red: mover stock de una sede a otra del mismo hospital. Uno de ellos nombra el
problema con precisión, y me gustó cómo lo dice: el FEFO local "evalúa sólo la
demanda local de la clínica, y queda ciego a la demanda regional que podría usar
el medicamento antes de que venza".

**Hacia afuera no encontré a nadie.** De distribuidor a cliente, como acción
comercial, con una persona aprobando el margen. Ese es el movimiento que
convierte una pérdida contable en una venta, y es el que no está construido.

También vi que esos prototipos ya mantienen humano en el loop para las
aprobaciones, y que sus cortes (7, 30, 90 días) son decisiones de cada autor y
no estándares de la industria. Los míos son más tempranos a propósito, porque un
distribuidor tiene un tiempo de reacción que una farmacia frente a la góndola no
tiene.

## Lo normativo, que condiciona el flujo

En Argentina, quienes comercializan y distribuyen productos médicos registrados
ante ANMAT tienen que implementar trazabilidad desde la producción o importación
hasta la aplicación al paciente (Disposición 2175/14, reglamentada por la
2303/2014), inscribiéndose con un código GLN de GS1.

Eso tiene dos consecuencias para este proyecto.

Primero, **"producto próximo a vencer" es un evento informable** dentro del
esquema de trazabilidad. Mover un lote corto no es sólo una decisión comercial:
deja rastro regulatorio. Que la propuesta, la aprobación y el envío queden en el
hilo de una tarea de Paperclip no es prolijidad, es la forma correcta de que eso
sea auditable.

Segundo, **no encontré norma específica sobre la venta interna de dispositivos
próximos a vencer**; el marco remite a las normas sanitarias jurisdiccionales.
Así que el criterio no se puede delegar a una regla publicada: lo tiene que
fijar la empresa y aprobarlo una persona.

Para dimensionar que el riesgo no es teórico: durante 2026 ANMAT prohibió
comercializar productos por irregularidades de identificación y trazabilidad, y
ordenó retiros de mercado por problemas de almacenamiento.

## Y por eso el humano aprueba

Lo digo sin adornos porque es el argumento que sostiene todo el diseño. El
revisor no está aprobando un descuento. Está verificando que no le estemos
mudando una pérdida a una clínica, y que no vaya a quedar producto por vencer en
una estantería donde se atiende gente.

Esa es una razón clínica y regulatoria, no comercial. Y es la que explica por
qué ese paso no se puede automatizar.

---

*Una advertencia sobre las fuentes:* los porcentajes de descarte y las mecánicas
del mercado secundario vienen en su mayoría de páginas de proveedores, que son
parte interesada; no encontré benchmarks independientes ni cifras de cámaras del
sector. Las disposiciones de ANMAT las cito a partir de resúmenes y notas de
prensa. Antes de usar cualquiera de estos números en una decisión real hay que
leer el texto oficial en el Boletín Oficial y en la base de normativa de ANMAT.
