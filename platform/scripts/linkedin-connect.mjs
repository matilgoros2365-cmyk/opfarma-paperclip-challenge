#!/usr/bin/env node
/**
 * Conecta una cuenta de LinkedIn y devuelve las dos variables que necesita el
 * canal de redes: LINKEDIN_ACCESS_TOKEN y LINKEDIN_AUTHOR_URN.
 *
 * Hace el flujo OAuth 2.0 de LinkedIn (authorization code) en tu computadora:
 * levanta un servidor en localhost para recibir el código, lo cambia por un
 * token y averigua quién publica. No guarda nada en disco y no manda nada a
 * otro lado que no sea LinkedIn.
 *
 * Uso:
 *   cd platform
 *   LINKEDIN_CLIENT_ID=... LINKEDIN_CLIENT_SECRET=... node scripts/linkedin-connect.mjs
 *
 * Para publicar como página en lugar de como persona (requiere que LinkedIn
 * haya aprobado la app para la Community Management API):
 *   LINKEDIN_AS=organization LINKEDIN_CLIENT_ID=... LINKEDIN_CLIENT_SECRET=... node scripts/linkedin-connect.mjs
 *
 * En la app de LinkedIn tiene que estar registrada esta URL de redirección:
 *   http://localhost:8765/callback
 *
 * El paso a paso completo está en docs/LINKEDIN.md.
 */
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID?.trim();
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET?.trim();
const AS = (process.env.LINKEDIN_AS ?? "person").trim();
const PORT = Number(process.env.LINKEDIN_CALLBACK_PORT ?? 8765);
const VERSION = (process.env.LINKEDIN_API_VERSION ?? "202610").trim();
const REDIRECT = `http://localhost:${PORT}/callback`;

function fatal(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

if (!CLIENT_ID || !CLIENT_SECRET) {
  fatal("Faltan LINKEDIN_CLIENT_ID y LINKEDIN_CLIENT_SECRET. Están en la app, en la pestaña Auth. Ver docs/LINKEDIN.md.");
}
if (AS !== "person" && AS !== "organization") fatal('LINKEDIN_AS tiene que ser "person" u "organization".');

const SCOPES =
  AS === "person"
    ? ["openid", "profile", "w_member_social"]
    : ["openid", "profile", "w_organization_social", "r_organization_social", "rw_organization_admin"];

const state = randomBytes(16).toString("hex");
const authorize = new URL("https://www.linkedin.com/oauth/v2/authorization");
authorize.search = new URLSearchParams({
  response_type: "code",
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT,
  state,
  scope: SCOPES.join(" "),
}).toString();

async function exchange(code) {
  const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`LinkedIn no dio el token (HTTP ${response.status}): ${JSON.stringify(body)}`);
  return body;
}

async function personUrn(token) {
  const response = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.sub) throw new Error(`No se pudo leer quién sos (HTTP ${response.status}).`);
  return { urn: `urn:li:person:${body.sub}`, name: body.name ?? "" };
}

async function organizations(token) {
  const url = "https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED";
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`No se pudieron listar tus páginas (HTTP ${response.status}): ${JSON.stringify(body)}`);
  return (body.elements ?? []).map((e) => e.organization ?? e.organizationTarget).filter(Boolean);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", REDIRECT);
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }
  const finish = (status, text) => {
    res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" }).end(text);
  };

  try {
    if (url.searchParams.get("state") !== state) throw new Error("El parámetro state no coincide. Volvé a correr el script.");
    const error = url.searchParams.get("error");
    if (error) throw new Error(`LinkedIn respondió ${error}: ${url.searchParams.get("error_description") ?? ""}`);
    const code = url.searchParams.get("code");
    if (!code) throw new Error("LinkedIn no mandó el código.");

    const token = await exchange(code);
    const expires = new Date(Date.now() + (token.expires_in ?? 0) * 1000).toISOString().slice(0, 10);

    let author;
    if (AS === "person") {
      const me = await personUrn(token.access_token);
      author = me.urn;
      console.log(`\n  ✓ Conectado como ${me.name || "tu perfil"}.`);
    } else {
      const orgs = await organizations(token.access_token);
      if (orgs.length === 0) throw new Error("Tu usuario no administra ninguna página aprobada, o la app no tiene la Community Management API.");
      author = orgs[0];
      console.log(`\n  ✓ Páginas que administrás: ${orgs.join(", ")}. Uso la primera.`);
    }

    console.log(`
  Cargá estas variables en Vercel (Settings → Environment Variables, Production),
  la del token como Sensitive, y hacé Redeploy:

    LINKEDIN_ACCESS_TOKEN=${token.access_token}
    LINKEDIN_AUTHOR_URN=${author}
    SOCIAL_ALLOW_PUBLISH=true

  El token vence el ${expires} (LinkedIn los da por 60 días). Para renovarlo,
  volvé a correr este script.
`);
    finish(200, "Listo. Volvé a la terminal: ahí están las variables para cargar en Vercel. Ya podés cerrar esta pestaña.");
  } catch (err) {
    console.error(`\n  ✗ ${err.message}\n`);
    finish(500, `No se pudo conectar: ${err.message}`);
  } finally {
    server.close();
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`
  Abrí este link en el navegador, iniciá sesión en LinkedIn y aceptá los permisos:

  ${authorize}

  Esperando la respuesta en ${REDIRECT} ...`);
});
