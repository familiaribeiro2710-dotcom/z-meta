import { ImageResponse } from "next/og";
import fs from "node:fs/promises";
import path from "node:path";

export const alt = "Z Meta — gestão de equipes de varejo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const fontsDir = path.join(process.cwd(), "node_modules/@fontsource/inter/files");
  const [bold, extrabold] = await Promise.all([
    fs.readFile(path.join(fontsDir, "inter-latin-700-normal.woff")),
    fs.readFile(path.join(fontsDir, "inter-latin-800-normal.woff")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#12203a",
        }}
      >
        <div
          style={{
            display: "flex",
            position: "relative",
            width: 140,
            height: 140,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 36,
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 140,
              height: 140,
              borderRadius: 999,
              border: "11px solid #7c3aed",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: 86,
              height: 86,
              borderRadius: 999,
              border: "11px solid #ec4899",
            }}
          />
          <div
            style={{
              display: "flex",
              width: 34,
              height: 34,
              borderRadius: 999,
              backgroundColor: "#7c3aed",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 80,
            fontWeight: 800,
            color: "#e4c789",
            letterSpacing: -2,
            fontFamily: "Inter",
          }}
        >
          Z META
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 30,
            fontWeight: 700,
            color: "rgba(255,255,255,0.7)",
            marginTop: 22,
            fontFamily: "Inter",
            textAlign: "center",
            maxWidth: 820,
          }}
        >
          Sua rede de lojas rodando no controle, não na planilha
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Inter", data: bold, weight: 700, style: "normal" },
        { name: "Inter", data: extrabold, weight: 800, style: "normal" },
      ],
    }
  );
}
