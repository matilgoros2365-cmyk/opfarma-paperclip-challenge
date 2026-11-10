# Alojar Paperclip en la nube: qué evalué y por qué no lo hice

Paperclip corre en la máquina de cada persona, que es como está pensado. En
Vercel está todo lo que tiene que estar en internet: la página, los dos
servidores MCP, el webhook de Meta y las credenciales. Así, cualquier
instalación de Paperclip, en macOS, en Linux o en Windows con WSL2, manda por el
mismo canal.

Evalué publicar también Paperclip, para que quien evalúa pudiera abrirlo sin
instalar nada, y decidí no hacerlo.

## Por qué no lo hice

- **El enunciado no lo pide.** Pide la plataforma en Vercel y que otra persona
  levante la compañía en 10 minutos con el README. Las dos cosas están, y la
  segunda la probé con reloj.
- **Aclara que no hace falta que quede *production-ready*.** Un Paperclip
  público, con login, usuarios y un servidor pago, es ir hacia producción.
- **Habría sumado costo y puntos de falla a horas de la entrega**, sin agregar
  evidencia nueva. El historial real de las tareas ya se ve en el Loom y en la
  página de evidencia de la plataforma.

## Las opciones que comparé

| Opción | Costo por mes | Esfuerzo | Lo que pesó en contra |
| --- | --- | --- | --- |
| Railway, plan Hobby, con la plantilla de Paperclip | US$5 de base, unos US$10 con uso | Bajo, ya viene público y con login | La plantilla es de la comunidad, y había que resolver el login de los agentes en el servidor |
| Un servidor propio (DigitalOcean o AWS Lightsail) con Docker | US$24 | Medio, con certificado, dominio y mantenimiento | Costo y mantenimiento para una demo |
| Tailscale Funnel desde mi computadora | Gratis | Bajo | La computadora tiene que estar prendida toda la evaluación, y queda expuesta |
| Cloudflare Tunnel rápido | Gratis | Mínimo | El link cambia en cada reinicio, sin garantía de que la interfaz en vivo funcione |
| Render | US$85 o más | Medio | Caro para lo que aporta |

De todas, Railway era la mejor. Si hiciera falta, es la primera que usaría.

## Lo que haría falta para publicarlo

1. Desplegar Paperclip en modo `authenticated` y `public`, con la dirección
   pública en `PAPERCLIP_PUBLIC_URL`.
2. Reclamar la instancia con el link de un solo uso que aparece en el log
   (`/board-claim/...`), que deja a quien lo abre como dueña.
3. Resolver cómo se autentican los agentes en el servidor, con una API key de
   Anthropic o iniciando sesión en Claude Code ahí.
4. Crear la compañía con el mismo script, apuntando a la dirección pública y a
   los servidores MCP de Vercel.

   ```bash
   PAPERCLIP_API_URL=https://.../api PAPERCLIP_BOARD_TOKEN=... MCP_API_KEY=... MCP_BASE_URL=https://opfarma-paperclip-challenge.vercel.app node scripts/setup-company.mjs
   ```

5. Invitar a quien evalúa con el rol **Viewer**, que es de sólo lectura. Puede
   ver las tareas y los hilos, pero no aprobar tarjetas ni hacer correr a los
   agentes. Hay que elegirlo a mano, porque la invitación viene con *Operator*
   por defecto.

Un detalle sobre `MCP_BASE_URL`. Si apunta a `127.0.0.1:3200`, las conexiones
funcionan sólo en local. Un Paperclip en la nube necesita la dirección de
Vercel para llamar a las herramientas.
