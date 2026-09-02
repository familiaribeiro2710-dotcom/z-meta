import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "./globals.css";

export const metadata = {
  metadataBase: new URL("https://zmeta.com.br"),
  title: "Z Meta",
  description: "Gestão diária de tarefas, advertências e metas de vendas",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Z Meta",
  },
  openGraph: {
    title: "Z Meta",
    description: "Gestão diária de tarefas, advertências e metas de vendas",
    siteName: "Z Meta",
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Z Meta",
    description: "Gestão diária de tarefas, advertências e metas de vendas",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#7c3aed",
};

// Aplica a classe .dark em <html> antes do primeiro paint, a partir do cache em localStorage
// (lib/ThemeContext.js mantém esse cache em sincronia com profiles.theme_preference) — sem isso
// a página nasceria sempre clara por uma fração de segundo antes do React reconciliar o tema
// de quem já usa o escuro.
const themeInitScript = `
(function () {
  try {
    var t = localStorage.getItem("zmeta_theme");
    if (t === "dark") document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
