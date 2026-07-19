"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, Wallet, Loader2, CalendarDays, CheckSquare } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import AppShell from "../../lib/AppShell";
import ChangePassword from "../../lib/ChangePassword";
import ColaboradorView from "../../lib/ColaboradorView";
import ColaboradorViewConsorcio from "../../lib/ColaboradorViewConsorcio";

const TABS_VESTUARIO = [
  { key: "atividades", label: "Início", Icon: Home },
  { key: "metas", label: "Metas", Icon: Wallet },
];

const TABS_CONSORCIO = [
  { key: "atividades", label: "Início", Icon: Home },
  { key: "calendario", label: "Calendário", Icon: CalendarDays },
  { key: "tarefas", label: "Tarefas", Icon: CheckSquare },
];

export default function ColaboradorPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("atividades");
  const [profile, setProfile] = useState(null);
  const [categoriaSlug, setCategoriaSlug] = useState("vestuario");

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (!prof || prof.role !== "colaborador") {
        router.replace(
          prof?.role === "master_admin"
            ? "/admin"
            : prof?.role === "gerente"
              ? "/gerente"
              : prof?.role === "socio"
                ? "/socio"
                : prof?.role === "supervisor"
                  ? "/supervisor"
                  : "/login"
        );
        return;
      }
      if (!active) return;

      // categoria da empresa decide qual experiência renderizar (vestuário = padrão atual,
      // consórcio = funil de ligações). Empresas antigas sem categoria (não deveria acontecer,
      // categoria_id é not null) caem no fallback "vestuario".
      if (prof.empresa_id) {
        const { data: empresaRow } = await supabase.from("empresas").select("categoria_id").eq("id", prof.empresa_id).single();
        if (empresaRow?.categoria_id) {
          const { data: categoriaRow } = await supabase
            .from("categorias_empresa")
            .select("slug")
            .eq("id", empresaRow.categoria_id)
            .single();
          if (categoriaRow?.slug && active) setCategoriaSlug(categoriaRow.slug);
        }
      }

      setProfile(prof);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [router]);

  const isConsorcio = categoriaSlug === "consorcio";
  const TABS = isConsorcio ? TABS_CONSORCIO : TABS_VESTUARIO;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-xs text-muted gap-2">
        <Loader2 size={16} className="animate-spin" /> carregando…
      </div>
    );
  }

  if (profile.must_change_password) {
    return (
      <ChangePassword
        force
        onDone={() => setProfile((p) => ({ ...p, must_change_password: false }))}
      />
    );
  }

  return (
    <AppShell
      userName={profile.full_name}
      userId={profile.id}
      userUsername={profile.username}
      userAvatarUrl={profile.avatar_url}
      onNameChange={(name) => setProfile((p) => ({ ...p, full_name: name }))}
      onAvatarChange={(url) => setProfile((p) => ({ ...p, avatar_url: url }))}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
    >
      {isConsorcio ? (
        <ColaboradorViewConsorcio key={profile.id} profile={profile} tab={tab} />
      ) : (
        <ColaboradorView key={profile.id} profile={profile} tab={tab} />
      )}
    </AppShell>
  );
}
