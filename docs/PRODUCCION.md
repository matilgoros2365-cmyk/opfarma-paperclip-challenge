# Pasar WhatsApp a producción

El canal quedó listo para conectar: el código arma y valida cada mensaje, lo
manda sólo con la aprobación de una persona en Paperclip, y recibe por webhook
el estado de entrega. Lo probé de punta a punta con el número de prueba de Meta.

Lo que falta para usarlo con clientes reales depende de la empresa, no del
código: una cuenta de Meta verificada a su nombre, un número propio y la
plantilla aprobada en esa cuenta. Nada de eso se puede transferir desde una
cuenta personal, así que este documento es el procedimiento para hacerlo en la
cuenta de la empresa.

## Lo que la empresa necesita tener a mano

- **CUIT y constancia de inscripción en AFIP.** El nombre legal y el domicilio
  que se carguen en Meta tienen que coincidir carácter por carácter con la
  constancia. El nombre comercial se usa sólo como nombre visible.
- **Un dominio propio**, con un correo en ese dominio. Un subdominio de Vercel
  puede no alcanzar para la verificación.
- **Un número de teléfono que no esté activo en WhatsApp.** Al registrarlo en la
  Cloud API queda fuera de la aplicación de WhatsApp, y un número que ya está en
  la aplicación no se puede registrar sin borrar esa cuenta antes.
- **Un medio de pago.** Los mensajes que inicia la empresa se cobran por
  mensaje de plantilla entregado, según la categoría; las de marketing son las
  más caras. Conviene revisar las tarifas vigentes para Argentina.
- **Al menos dos administradores** del portfolio de Meta, para que el canal no
  dependa de una sola cuenta personal.

## Paso a paso

### 1. Verificar el negocio

En el Centro de seguridad del portfolio comercial de Meta, iniciar la
verificación con la constancia de AFIP. Sin ella, Meta bloquea el registro del
número propio aunque la documentación diga que sólo limita la cantidad de
números.

### 2. Crear la app y registrar el número

En Meta for Developers, crear una app del tipo "Empresa" en el portfolio
verificado y agregarle el producto WhatsApp. En **Configuración de la API**,
agregar el número propio, verificarlo por SMS o llamada y cargar el nombre
visible, que Meta revisa.

### 3. Generar un token permanente

El token que muestra la consola vence a las 24 horas. En la configuración del
negocio, crear un **usuario del sistema**, asignarle la app y la cuenta de
WhatsApp Business, y generar un token con los permisos
`whatsapp_business_messaging` y `whatsapp_business_management`.

### 4. Dar de alta la plantilla

El texto está en `platform/data/offer-template.json`, que es el mismo archivo que
usa el agente. La forma más segura de darla de alta es con el script, que lo lee
de ahí y lo envía por la API, sin copiar nada a mano:

```bash
cd platform && META_WABA_ID=<id de la cuenta de WhatsApp Business> META_WHATSAPP_TOKEN=<token> node scripts/create-template.mjs
```

Queda como `oferta_lote_por_vencer`, categoría Marketing, en español de
Argentina, con su pie y un ejemplo por variable. Si se prefiere la interfaz, en
el **WhatsApp Manager → Plantillas de mensajes** se cargan los mismos campos del
archivo. La aprobación suele tardar minutos.

Antes de mandar mensajes de marketing, Meta exige que el cliente haya aceptado
recibirlos por WhatsApp. Ese consentimiento tiene que quedar registrado por
cuenta, y también corresponde por la ley de protección de datos personales.

### 5. Suscribir el webhook

En la app, **WhatsApp → Configuración → Webhook**:

- URL de devolución: `https://<dominio-de-la-plataforma>/api/whatsapp/webhook`
- Token de verificación: el valor de `META_WEBHOOK_VERIFY_TOKEN`
- Campo: `messages`

El secreto de la app, que el webhook usa para verificar la firma de cada aviso,
está en **Configuración de la app → Básica → Clave secreta de la app**.

### 6. Guardar los estados de entrega

En Vercel, **Storage → Create → Upstash Redis** (el plan gratuito alcanza) y
conectarlo al proyecto. La integración crea `KV_REST_API_URL` y
`KV_REST_API_TOKEN`.

### 7. Cargar las variables

| Variable | En Vercel | En la instancia junto a Paperclip |
| --- | --- | --- |
| `MCP_API_KEY` | Sí | Sí, la misma |
| `META_APP_SECRET` | Sí | No hace falta |
| `META_WEBHOOK_VERIFY_TOKEN` | Sí | No hace falta |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Sí, las crea la integración | Sí, para que el agente lea los estados |
| `META_PHONE_NUMBER_ID` | No | Sí |
| `META_WHATSAPP_TOKEN` | No | Sí, el token permanente |
| `META_CHANNEL_MODE` | — | `own_number` |
| `META_ALLOWED_RECIPIENTS` | — | Vacío: el número propio no tiene lista |
| `WHATSAPP_ALLOW_SEND` | `false` | `true` |
| `WHATSAPP_SHARED_ACCOUNT` | `false` con cuenta propia | — |

La separación es a propósito: la plataforma pública recibe los avisos de Meta,
pero no puede enviar. Sólo envía la instancia que usan los agentes, y siempre
con la aprobación de una persona en Paperclip.

### 8. Prueba de humo

1. Desde una tarea de Paperclip, pedirle al agente que llame a
   `whatsapp_channel_status`. Tiene que informar el número y "envío habilitado".
2. Armar un borrador con `whatsapp_draft_message`, con la plantilla y un número
   interno de la empresa como destinatario.
3. Llamar a `whatsapp_send_message`. Paperclip tiene que frenar la llamada y
   pedir aprobación; al aprobarla, devuelve el `wamid` del mensaje.
4. Con ese `wamid`, `whatsapp_delivery_status` tiene que mostrar "delivered" y,
   cuando se abra el mensaje, "read". Los mismos estados aparecen en la
   plataforma.

## Errores frecuentes

| Código | Qué significa | Qué hacer |
| --- | --- | --- |
| `#2494070` al registrar el número | El negocio no está verificado | Completar el paso 1 |
| `131030` | El destinatario no está en la lista del número de prueba | Agregarlo en Configuración de la API, o pasar al número propio |
| `131047` | Texto libre fuera de la ventana de 24 horas | Mandar la plantilla |
| `131026` | El mensaje no se pudo entregar | El número no tiene WhatsApp o bloqueó al remitente |
| `190` | Token vencido | Usar el token permanente del paso 3 |
