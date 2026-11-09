import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Ops Lab · WhatsApp channel",
  description:
    "Read-only view of a Paperclip company and the WhatsApp channel its agents hand work off to.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          background: "#0b0d10",
          color: "#e8eaed",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          lineHeight: 1.55,
        }}
      >
        <main style={{ maxWidth: 960, margin: "0 auto", padding: "48px 16px 96px" }}>{children}</main>
      </body>
    </html>
  );
}
