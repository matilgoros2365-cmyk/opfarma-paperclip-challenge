import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next, IBM_Plex_Sans_Condensed } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

// Atkinson Hyperlegible la diseñó el Braille Institute para que se lea bien con
// baja visión: distingue la l de la I y el 0 de la O, que en códigos de lote y
// en montos importa. Va en el texto y en los números.
const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ["latin", "latin-ext"],
  variable: "--font-atkinson",
  display: "swap",
});

// IBM Plex Sans Condensed es una grotesca angosta, de esquinas rectas, pensada
// para documentación técnica. Va en los títulos y en los códigos de lote.
const plex = IBM_Plex_Sans_Condensed({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OpFarma: lotes por vencer",
  description:
    "Qué lotes de insumos médicos se vencen en depósito, a qué cuenta se le pueden colocar a tiempo y quién aprueba cada paso.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-AR" className={`${atkinson.variable} ${plex.variable}`}>
      <body>{children}</body>
    </html>
  );
}
