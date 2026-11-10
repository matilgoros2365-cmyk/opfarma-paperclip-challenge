/**
 * Los documentos del repositorio que amplían cada parte de la plataforma. Van
 * al lado de lo que explican, para que quien evalúa no tenga que buscarlos.
 */
export const REPO = "https://github.com/matilgoros2365-cmyk/opfarma-paperclip-challenge";
export const DOC = (path: string) => `${REPO}/blob/main/${path}`;

export type Documento = { path: string; titulo: string; detalle: string };

export function Documentos({ items }: { items: Documento[] }) {
  return (
    <aside className="docs" aria-label="Documentos de esta parte">
      <p className="docs-head">Para leer más</p>
      <ul>
        {items.map((d) => (
          <li key={d.path}>
            <a href={d.path.startsWith("http") ? d.path : DOC(d.path)} target="_blank" rel="noopener noreferrer">
              <span className="docs-t">{d.titulo}</span>
              <span className="docs-d">{d.detalle}</span>
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
