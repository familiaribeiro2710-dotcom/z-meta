import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
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
