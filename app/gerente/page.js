"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import AppShell from "../../lib/AppShell";
import ChangePassword from "../../lib/ChangePassword";
import GerenteView, { EMPRESA_TABS } from "../../lib/GerenteView";
import GerenteViewConsorcio, { CONSORCIO_TABS } from "../../lib/GerenteViewConsorcio";

export default function GerentePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState("atividades");
  const [categoriaSlug, setCategoriaSlug] = useState("vestuario");

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (!prof || prof.role !== "gerente") {
        router.replace(
          prof?.role === "master_admin" ? "/admin" : prof?.role === "socio" ? "/socio" : prof?.role === "supervisor" ? "/supervisor" : "/colaborador"
        );
        return;
      }
      if (!active) return;

      // mesma lógica de app/colaborador/page.js: categoria da empresa decide qual dashboard de
      // gestão renderizar.
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
  const TABS = isConsorcio ? CONSORCIO_TABS : EMPRESA_TABS;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-xs text-muted gap-2">
        <Loader2 size={16} className="animate-spin" /> carregando…
      </div>
    );
  }

  if (profile.must_change_password) {
    return <ChangePassword force onDone={() => setProfile({ ...profile, must_change_password: false })} />;
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
        <GerenteViewConsorcio key={profile.id} profile={profile} tab={tab} />
      ) : (
        <GerenteView key={profile.id} profile={profile} tab={tab} />
      )}
    </AppShell>
  );
}
