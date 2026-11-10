# Pasar LinkedIn de la simulación a publicar de verdad

Hoy el canal de redes arma el posteo, lo valida y, con la aprobación de una
persona en Paperclip, devuelve el pedido exacto que recibiría LinkedIn sin
mandarlo. Para que publique de verdad no hay que tocar código. Hay que conectar
una cuenta y cargar tres variables en Vercel.

Hay dos caminos, según quién firma el posteo.

| | Como persona | Como página de empresa |
| --- | --- | --- |
| Autor | `urn:li:person:...`, tu perfil | `urn:li:organization:...`, la página de OpFarma |
| Producto de LinkedIn | *Share on LinkedIn* y *Sign In with LinkedIn using OpenID Connect* | *Community Management API* |
| Permiso | `w_member_social` | `w_organization_social` |
| Aprobación de LinkedIn | Se agregan desde el portal de desarrolladores | LinkedIn revisa el pedido antes de habilitarlo |
| Para qué sirve | Probar el circuito completo ya | El uso real de la empresa |

El código es el mismo para los dos. Sólo cambia la variable `LINKEDIN_AUTHOR_URN`.

## Antes de empezar

- Una cuenta de LinkedIn.
- Una página de LinkedIn de la empresa. LinkedIn pide asociar cada app a una
  página al crearla, aunque después se publique como persona.
- Acceso al proyecto en Vercel.

## 1. Crear la app

1. Entrá a <https://www.linkedin.com/developers/apps> y tocá **Create app**.
2. Completá el nombre (por ejemplo *OpFarma Redes*), la página de la empresa y
   un logo. Aceptá los términos.
3. En la pestaña **Products**, agregá los productos del camino que elegiste.
   - Como persona, *Share on LinkedIn* y *Sign In with LinkedIn using OpenID
     Connect*.
   - Como página, pedí *Community Management API* y completá el formulario. Hasta
     que LinkedIn lo apruebe, este camino no anda. Mientras tanto se puede probar
     como persona.
4. En la pestaña **Auth**, en *Authorized redirect URLs for your app*, agregá
   `http://localhost:8765/callback`.
5. En la misma pestaña están el **Client ID** y el **Client Secret**. Los vas a
   necesitar en el paso siguiente. No los pegues en ningún chat.

## 2. Conectar la cuenta

El script hace el inicio de sesión con LinkedIn en tu computadora y te devuelve
las variables. No guarda nada y sólo habla con LinkedIn.

En una terminal, desde la raíz del repo (en macOS o Linux):

```bash
cd platform && read -rs -p "Client ID: " LINKEDIN_CLIENT_ID; echo; read -rs -p "Client Secret: " LINKEDIN_CLIENT_SECRET; echo; LINKEDIN_CLIENT_ID="$LINKEDIN_CLIENT_ID" LINKEDIN_CLIENT_SECRET="$LINKEDIN_CLIENT_SECRET" node scripts/linkedin-connect.mjs; unset LINKEDIN_CLIENT_ID LINKEDIN_CLIENT_SECRET
```

Para publicar como página, agregá `LINKEDIN_AS=organization` antes de `node`.

El script imprime un link. Abrilo, iniciá sesión en LinkedIn y aceptá los
permisos. Al volver, la terminal muestra las tres variables.

## 3. Cargar las variables en Vercel

En el proyecto, en *Settings → Environment Variables*, entorno **Production**.

| Variable | Valor | Tipo |
| --- | --- | --- |
| `LINKEDIN_ACCESS_TOKEN` | el que imprimió el script | Sensitive |
| `LINKEDIN_AUTHOR_URN` | el que imprimió el script | normal |
| `SOCIAL_ALLOW_PUBLISH` | `true` | normal |

Después, **Redeploy** desde *Deployments*. Sin redeploy no toman el cambio.

## 4. Probarlo

1. En Paperclip, en la tarea del posteo, pedile a StockScout que llame a
   `social_channel_status`. Tiene que decir que la publicación está configurada
   y habilitada, con el autor que cargaste.
2. Pedile que vuelva a armar el borrador. El `draft_id` cambia, porque ahora el
   autor es real.
3. Aprobá la tarjeta. El posteo sale, y StockScout deja en el hilo el
   identificador que devolvió LinkedIn (`urn:li:share:...`).

## Lo que conviene saber

- **El token dura 60 días.** LinkedIn no da tokens renovables a las apps comunes.
  Para renovarlo se vuelve a correr el script.
- **Publicar es público.** La tarjeta de aprobación en Paperclip es el único
  paso que lo frena, y la prueba de humo nunca llama a publicar.
- **Para apagarlo,** `SOCIAL_ALLOW_PUBLISH=false` y redeploy. El canal vuelve a
  devolver el dry-run.
- **El texto ya sale en el formato que pide LinkedIn.** Sus caracteres
  reservados, como los paréntesis de "(SUT-3010)", se escapan solos, y los
  hashtags quedan como hashtags.
- **La versión de la API** es `202610`, vigente hasta octubre de 2027. Se cambia
  con `LINKEDIN_API_VERSION`.
- **Lo que no pude verificar sin una cuenta conectada.** La documentación de
  LinkedIn no dice cuánto tarda en aprobar la Community Management API. Tampoco
  confirma que el identificador que devuelve el inicio de sesión sea siempre el
  mismo que pide el autor de un posteo. Lo confirma el primer posteo real.

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| `redirect_uri` no coincide | Falta la URL en la pestaña Auth | Agregar `http://localhost:8765/callback` |
| `unauthorized_scope_error` | La app no tiene el producto del permiso | Agregar el producto en *Products* |
| El script no encuentra páginas | La app no tiene la Community Management API, o no sos administradora | Esperar la aprobación o publicar como persona |
| HTTP 401 al publicar | El token venció o es de otra app | Volver a correr el script |
| HTTP 422 al publicar | El autor no coincide con el token | Usar el `LINKEDIN_AUTHOR_URN` que dio el script |
