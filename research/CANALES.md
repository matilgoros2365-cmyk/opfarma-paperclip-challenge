# Por qué tres canales, y por qué LinkedIn

El desafío pide al menos una vía entre Grokbot, WhatsApp y redes sociales, y
aclara que más de una es mejor. Hice las tres, pero no como tres demos sueltas.
Cada canal resuelve un caso distinto del mismo problema, colocar un lote antes
de que venza, y los tres pasan por Paperclip con una persona aprobando.

| Caso del lote | Canal | Por qué ese canal |
| --- | --- | --- |
| Una cuenta actual lo consume a tiempo | **WhatsApp (B2)** | Es una oferta directa a un cliente que ya compra, por el canal que todos usan |
| Ninguna cuenta lo absorbe entero | **LinkedIn (B3)** | Hay que encontrar compradores nuevos, y los de clínicas están ahí |
| El posteo aprobado tiene que salir por un agente de terceros | **Grok Bot (B1)** | Muestra cómo se le pasa trabajo a otro agente sin perder el control humano |

Relevado el 10 de noviembre de 2026. Distingo, como en
[`EXPIRY.md`](EXPIRY.md), tres niveles de respaldo.

- **Oficial.** Lo que dice el propio dueño del producto sobre su producto.
- **Documentado.** Informes de la industria con método declarado.
- **Interesado.** Estudios encargados o publicados por quien vende el servicio.
  Los uso como ejemplo, nunca como dato.

## 1. WhatsApp, para la cuenta que ya compra

**Documentado.**

- El 93,5% de los usuarios de internet de Argentina de 16 años o más usó
  WhatsApp en el último mes, la plataforma más usada del país (DataReportal,
  *Digital 2027: Argentina*, con datos de la encuesta de GWI del segundo
  trimestre de 2026). Un año antes, Statista registraba 93,3%, por encima de
  Instagram (87,9%) y Facebook (81,1%).
- Argentina tiene 41,9 millones de usuarios de internet, el 91,1% de la
  población, a fines de 2026 (DataReportal).

**Interesado.**

- Un estudio encargado por Meta a Morning Consult en 2025, con 2.363 empresas de
  Argentina, Brasil, Colombia y México, dice que dos de cada tres empresas
  argentinas consiguieron ventas nuevas con productos de Meta, WhatsApp Business
  entre ellos. No separa ventas entre empresas.
- El Hospital El Cruce, de Florencio Varela, atiende consultas con un asistente
  de WhatsApp Business (caso publicado por el proveedor, Chattigo, sin método).

**Lo que no encontré.** Ningún dato sobre cuánto usan WhatsApp las
distribuidoras para venderles a clínicas y sanatorios. Lo tomo como supuesto de
operación, y es lo primero que preguntaría en una entrevista con el área de
compras de una clínica.

**Por qué no alcanza solo.** WhatsApp sirve para el cliente que ya existe y que
abrió una conversación. Para el lote que ninguna cuenta absorbe hace falta otro
canal, porque no hay a quién escribirle.

## 2. LinkedIn, para el comprador nuevo

**Documentado.**

- LinkedIn tiene 22 millones de miembros en Argentina, el 63,9% de los adultos,
  con un crecimiento de 4 millones en un año (DataReportal, *Digital 2027:
  Argentina*). Son cuentas registradas, no usuarios activos por mes.
- El 85% de los responsables de marketing entre empresas dice que LinkedIn es la
  red que mejor rinde, contra el 21% de Instagram y el 28% de Facebook. El 68%
  aumentó su uso de LinkedIn, contra el 27% que aumentó el de Instagram (Content
  Marketing Institute y MarketingProfs, encuesta a 980 responsables de
  marketing B2B, 2024). La muestra es mayormente norteamericana.

**El contrapunto que conviene decir.** Instagram llega a más gente en
Argentina, 31,2 millones contra 22. La elección no es por alcance sino por a
quién se le habla. Un lote de suturas se le ofrece a la persona que compra para
un servicio de cirugía, y LinkedIn permite llegar a ella por su rol. En
Instagram esa misma persona está como consumidora.

**Interesado.** Un estudio de Edelman y LinkedIn (2024, 3.484 ejecutivos) dice
que el 75% de quienes deciden compras investigó un producto que no tenía en
mente después de leer contenido de una empresa. Lo leí sólo en resúmenes, porque
la página original no cargó, y lo firma la propia LinkedIn.

**Lo que no encontré.** Ningún dato actual, ni argentino, sobre cuántos
compradores de hospitales y clínicas están en LinkedIn.

**Por qué quedó simulado.** Publicar como página de empresa exige que LinkedIn
apruebe la app para la *Community Management API*, y eso no entra en los plazos
del desafío. El canal arma el pedido exacto, pasa por la aprobación humana y
devuelve un dry-run. Publicar como persona sólo exige agregar un producto en el
portal de desarrolladores, y el paso a paso para hacerlo de verdad está en
[`docs/LINKEDIN.md`](../docs/LINKEDIN.md).

## 3. Grok Bot, para pasarle el trabajo a otro agente

**Oficial.**

- Grok Bot es el producto de agentes de xAI, lanzado en beta el 11 de agosto de
  2026 para suscriptores de SuperGrok (anuncio de xAI, *Introducing Grok Bot*).
- grokbot.dev se presenta como un proyecto comunitario independiente, sin
  relación con xAI, con código abierto. Es un directorio de plugins y casos de
  uso, con un servidor MCP público y de sólo lectura.

**Qué se puede y qué no.** Grok Bot no tiene una API para que otro sistema le dé
órdenes, y el propio directorio pide que sus prompts se le muestren a una
persona y nunca se ejecuten solos. Por eso la vía B1 termina en un traspaso. El
agente busca en el directorio el plugin que sirve, explica por qué lo eligió y
arma el paquete con el posteo ya aprobado, para que una persona lo pegue en
Grok.

**Por qué igual vale la pena.** El rol de esta búsqueda es operar una compañía
de agentes que usa herramientas de otros. Este caso muestra el patrón con un
agente de terceros que no controlamos. El trabajo se prepara en Paperclip, la
decisión la toma una persona, y lo que viaja es exactamente lo que se aprobó.

## 4. Cómo lo validaría

Las fuentes justifican los canales, pero no dicen cuál funciona mejor para esta
empresa. Para eso propondría un experimento de dos semanas, que es el tipo de
trabajo del rol.

1. Con los lotes que tienen una cuenta, medir cuántas ofertas por WhatsApp se
   leen y cuántas se responden. El webhook ya registra entregas y lecturas.
2. Con los lotes que no tienen cuenta, publicar en LinkedIn como persona y medir
   cuántos mensajes privados llegan por posteo.
3. Comparar lo recuperado contra lo que habría pagado un liquidador, lote por
   lote.

## Fuentes

**Oficiales**

- [xAI, *Introducing Grok Bot* (agosto de 2026)](https://x.ai/news/introducing-grok-bot)
- [grokbot.dev, página "About"](https://grokbot.dev/about) y [repositorio](https://github.com/ZeroPointRepo/GrokBotDev)
- [LinkedIn, Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api)

**Documentadas**

- [DataReportal, *Digital 2027: Argentina* (noviembre de 2026)](https://datareportal.com/reports/digital-2027-argentina) y [*Digital 2026: Argentina*](https://datareportal.com/reports/digital-2026-argentina)
- [Statista, penetración de redes sociales en Argentina (2025)](https://www.statista.com/statistics/1313074/social-networks-penetration-argentina)
- [Content Marketing Institute y MarketingProfs, *B2B Content Marketing Benchmarks* (para 2025)](https://contentmarketinginstitute.com/b2b-research/b2b-content-marketing-trends-research-2025)

**Interesadas**

- [Meta y Morning Consult, impacto en pymes de América Latina (2025)](https://about.fb.com/br/news/2025/08/26598-pesquisa-revela-o-impacto-da-meta-nas-mpmes-da-america-latina/)
- [Edelman y LinkedIn, *2024 B2B Thought Leadership Impact Report*](https://www.edelman.com/expertise/Business-Marketing/2024-b2b-thought-leadership-report)
- [Chattigo, caso Hospital El Cruce (2023)](https://blog.chattigo.com/chatbots/casos-de-éxito-hospital-el-cruce)
