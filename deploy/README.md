# Hostear Paperclip: lo que intenté y dónde me frené

El control plane de Paperclip no va en Vercel. Es un servidor con estado
—PostgreSQL, archivos, cola de heartbeats y cron— y el único cloud que ellos
documentan es Docker sobre contenedores persistentes. En Vercel va la otra
mitad, que sí es HTTP sin estado: los dos servidores MCP y el dashboard de
lectura.

Dejo acá lo que probé, porque el intento fallido también dice algo sobre
desplegar este producto.

## Lo que aprendí antes de intentarlo

**No hace falta construir ninguna imagen.** Paperclip publica
`ghcr.io/paperclipai/paperclip:latest`, para `linux/amd64` y `arm64`, y adentro
ya vienen el servidor, el PostgreSQL embebido y los CLI de los adapters locales
(`claude`, `codex`, `opencode`, `gemini`). Eso último es justamente lo que me
interesaba, porque en Windows el adapter de Claude nunca pasó su chequeo.

**Hace falta un volumen persistente.** Todo el estado vive bajo
`PAPERCLIP_HOME`: la base, los archivos y la clave maestra de secretos. Sin
volumen, cada deploy arranca de cero y lo cifrado queda ilegible para siempre.

**No puede dormirse entre visitas.** Tiene una base corriendo adentro y una cola
de heartbeats; si se suspende, corta las corridas por la mitad.

## Fly.io: hasta dónde llegué

Creé la app, un volumen cifrado de 3 GB en São Paulo —no existe región en Buenos
Aires, `eze` no está en el catálogo— y configuré todo en [`fly.toml`](fly.toml)
con las variables que saqué de la documentación.

Ahí me frené con esto:

```
Not enough space to unpack image, ghcr.io/paperclipai/paperclip:latest,
possibly exceeds maximum of 8GiB uncompressed
```

La imagen pesa **5,3 GB comprimidos** y al desempaquetarse supera el límite de
**8 GiB** de la plataforma. Probé agrandar el disco raíz con `--rootfs-size 20`,
que es la única opción que existe para eso y que `fly deploy` ni siquiera
expone —hay que usar `fly machine run`—, y el error salió idéntico. O sea que el
tope no es del disco que pedís sino de Fly.

Con una imagen que trae cuatro CLI de agentes adentro, ese techo queda corto.
No es algo que se arregle con configuración.

En el camino aprendí dos cosas menores que igual sirven: la sintaxis de puertos
de `fly machine run` necesita el protocolo (`443:3100/tcp:http:tls`, no
`443:3100/tls:http`), y el trial de un dólar exige tarjeta antes de crear el
primer release.

## Qué haría con más tiempo

Un VPS con Docker, sin límite de tamaño de imagen, que es el escenario que la
documentación de Paperclip asume. O Railway, que habría que verificar si impone
un techo parecido.

Con el servidor arriba, levantar la compañía entera es un comando:

```bash
PAPERCLIP_API_URL=https://.../api PAPERCLIP_BOARD_TOKEN=... MCP_API_KEY=... MCP_BASE_URL=https://<app>.vercel.app node scripts/setup-company.mjs
```

Ojo con `MCP_BASE_URL`: apuntando a `127.0.0.1:3200` las conexiones funcionan
sólo en local. Un Paperclip hosteado necesita la URL pública de Vercel o no va a
poder llamar a las tools.
