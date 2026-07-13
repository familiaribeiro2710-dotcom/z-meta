import "./globals.css";

export const metadata = {
  title: "Z Meta",
  description: "Gestão diária de tarefas, advertências e metas de vendas",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
