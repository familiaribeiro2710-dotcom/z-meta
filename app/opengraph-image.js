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
          backgroundColor: "#f5f3ee",
          backgroundImage:
            "radial-gradient(circle at 12% 8%, rgba(124,58,237,0.22) 0%, rgba(124,58,237,0) 45%), radial-gradient(circle at 90% 12%, rgba(236,72,153,0.20) 0%, rgba(236,72,153,0) 42%), radial-gradient(circle at 50% 108%, rgba(13,148,136,0.18) 0%, rgba(13,148,136,0) 48%)",
        }}
      >
        <div
          style={{
            display: "flex",
            position: "relative",
            width: 172,
            height: 172,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 40,
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 172,
              height: 172,
              borderRadius: 999,
              border: "13px solid #7c3aed",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: 106,
              height: 106,
              borderRadius: 999,
              border: "13px solid #ec4899",
            }}
          />
          <div
            style={{
              display: "flex",
              width: 42,
              height: 42,
              borderRadius: 999,
              backgroundColor: "#7c3aed",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 92,
            fontWeight: 800,
            color: "#12203a",
            letterSpacing: -2,
            fontFamily: "Inter",
          }}
        >
          Z META
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 32,
            fontWeight: 700,
            color: "#5b6578",
            marginTop: 20,
            fontFamily: "Inter",
          }}
        >
          Tarefas, metas e comissão da equipe em um só lugar
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
