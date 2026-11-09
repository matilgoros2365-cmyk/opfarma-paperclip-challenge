import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

// Atkinson Hyperlegible la diseñó el Braille Institute para que se lea bien con
// baja visión: distingue la l de la I y el 0 de la O, que en códigos de lote y
// en montos importa.
const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ["latin", "latin-ext"],
  variable: "--font-atkinson",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OpFarma: lotes por vencer",
  description:
    "Qué lotes de insumos médicos se vencen en depósito, a qué cuenta se le pueden colocar a tiempo y quién aprueba cada paso.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-AR" className={atkinson.variable}>
      <body>{children}</body>
    </html>
  );
}
