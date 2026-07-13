"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import Logo from "../../lib/Logo";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const email = `${username.trim().toLowerCase()}@zmeta.local`;
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setError("Usuário ou senha incorretos.");
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();
    if (!profile) {
      setError("Conta sem perfil configurado. Fale com o gerente.");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }
    if (profile.role === "master_admin") router.replace("/admin");
    else if (profile.role === "socio") router.replace("/socio");
    else if (profile.role === "supervisor") router.replace("/supervisor");
    else if (profile.role === "gerente") router.replace("/gerente");
    else router.replace("/colaborador");
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <div className="-translate-x-2">
            <Logo size="lg" />
          </div>
        </div>
        <form onSubmit={handleSubmit} className="card space-y-4 border-purple/20">
          <div>
            <label className="label">Usuário</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              required
            />
          </div>
          <div>
            <label className="label">Senha</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-xs text-danger flex items-center gap-1.5"><AlertTriangle size={13} /> {error}</p>}
          <button type="submit" className="btn w-full" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <div className="mt-6 flex justify-center">
          <a
            href="https://wa.me/5511953893938?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20Z%20Meta%20para%20minha%20empresa."
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold tracking-wide border-2 active:scale-95 transition-all"
            style={{ borderColor: "#22c55e", color: "#22c55e", background: "rgba(34,197,94,0.07)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.472-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12.001 2C6.478 2 2 6.477 2 12c0 1.892.526 3.657 1.437 5.164L2 22l4.933-1.394A9.94 9.94 0 0 0 12.001 22c5.523 0 10-4.477 10-10s-4.477-10-10-10zm0 18.166a8.12 8.12 0 0 1-4.146-1.135l-.297-.176-3.055.863.868-2.98-.194-.307A8.13 8.13 0 0 1 3.834 12c0-4.505 3.663-8.166 8.167-8.166 4.505 0 8.167 3.661 8.167 8.166 0 4.505-3.662 8.166-8.167 8.166z" />
            </svg>
            Entrar em contato
          </a>
        </div>
      </div>
    </main>
  );
}
