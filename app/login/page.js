"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Target, Trophy, AlertTriangle } from "lucide-react";
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
      setError("Conta sem perfil configurado. Fale com o gestor.");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }
    if (profile.role === "master_admin") router.replace("/admin");
    else if (profile.role === "gestor") router.replace("/gestor");
    else router.replace("/colaborador");
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <Logo size="lg" />
          <p className="text-sm text-muted mt-3 tracking-wide font-medium flex items-center gap-1.5">
            Sua rotina, seu placar, seu prêmio <Target size={14} className="text-purple" /> <Trophy size={14} className="text-gold" />
          </p>
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
      </div>
    </main>
  );
}
