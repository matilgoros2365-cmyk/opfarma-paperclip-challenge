# Hostear Paperclip: qué intenté y dónde se frenó

El control plane de Paperclip no puede ir en Vercel. Es un servidor con estado
(PostgreSQL, archivos, una cola de heartbeats y tareas programadas), y el único
despliegue en la nube que documentan es Docker sobre contenedores persistentes.
En Vercel corre la otra mitad, que sí es HTTP sin estado: los dos servidores MCP,
el webhook de WhatsApp y la plataforma.

Dejo registrado el intento, porque lo que no funcionó también dice algo sobre
cómo se despliega este producto.

## Lo que aprendí antes de intentarlo

**No hace falta construir una imagen.** Paperclip publica
`ghcr.io/paperclipai/paperclip:latest`, para `linux/amd64` y `arm64`, y trae
incluidos el servidor, el PostgreSQL embebido y los CLI de los adapters locales
(`claude`, `codex`, `opencode` y `gemini`). Eso último era justamente lo que me
interesaba, porque en Windows el adapter de Claude nunca pasó su chequeo.

**Hace falta un volumen persistente.** Todo el estado vive en `PAPERCLIP_HOME`:
la base, los archivos y la clave maestra de secretos. Sin volumen, cada deploy
arranca de cero y lo cifrado queda ilegible.

**No puede suspenderse entre visitas.** Tiene una base de datos y una cola de
heartbeats corriendo; si la máquina se suspende, corta las ejecuciones a la
mitad.

## Fly.io: hasta dónde llegué

Creé la app y un volumen cifrado de 3 GB en São Paulo (no hay región en Buenos
Aires: `eze` no figura en el catálogo), y dejé la configuración en
[`fly.toml`](fly.toml) con las variables que indica la documentación.

El despliegue se frenó con este error:

```
Not enough space to unpack image, ghcr.io/paperclipai/paperclip:latest,
possibly exceeds maximum of 8GiB uncompressed
```

La imagen pesa **5,3 GB comprimida** y, al descomprimirse, supera el límite de
**8 GiB** de la plataforma. Probé ampliar el disco raíz con `--rootfs-size 20`,
que es la única opción disponible para eso (y que `fly deploy` ni siquiera
expone: hay que usar `fly machine run`), y el error fue idéntico. Es decir, el
límite no depende del disco solicitado, sino de Fly.

Para una imagen que incluye cuatro CLI de agentes, ese techo resulta corto, y no
se resuelve con configuración.

En el camino aparecieron dos detalles menores que vale la pena registrar: la
sintaxis de puertos de `fly machine run` exige el protocolo
(`443:3100/tcp:http:tls`, no `443:3100/tls:http`), y la prueba gratuita pide una
tarjeta antes de crear el primer release.

## Qué haría con más tiempo

Un servidor virtual con Docker, sin límite de tamaño de imagen, que es el
escenario que asume la documentación de Paperclip. Railway sería otra opción,
pero habría que verificar si impone un límite parecido.

Con el servidor en línea, crear la compañía completa es un solo comando:

```bash
PAPERCLIP_API_URL=https://.../api PAPERCLIP_BOARD_TOKEN=... MCP_API_KEY=... MCP_BASE_URL=https://opfarma-paperclip-challenge.vercel.app node scripts/setup-company.mjs
```

Un detalle importante sobre `MCP_BASE_URL`: si apunta a `127.0.0.1:3200`, las
conexiones funcionan sólo en local. Un Paperclip hosteado necesita la URL pública
de Vercel para poder llamar a las herramientas.
