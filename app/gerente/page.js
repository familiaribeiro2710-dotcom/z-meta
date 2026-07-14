"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Store,
  Rocket,
  CalendarClock,
  ListTodo,
  Coins,
  Gift,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import AppShell from "../../lib/AppShell";
import ChangePassword from "../../lib/ChangePassword";
import EmpresaDashboard, { EMPRESA_TABS } from "../../lib/EmpresaDashboard";
import { formatBRL } from "../../lib/scoring";
import { greeting, todayStr, firstDayOfMonth, remainingDaysInMonth } from "../../lib/date";

export default function GerentePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState("atividades");
  const [lojaName, setLojaName] = useState("");
  const [hero, setHero] = useState({ metaLoja: 0, soldLoja: 0, pendingToday: 0, commissionSoFar: 0, prizesSoFar: 0, commissionPct: 0, commissionTierLabel: "não atingimento" });
  const greet = greeting();
  const today = todayStr();
  const month = firstDayOfMonth(today);

  const loadStats = useCallback(async (prof) => {
    const { data: loja } = await supabase.from("lojas").select("name").eq("id", prof.loja_id).single();
    setLojaName(loja?.name || "");

    const { data: emps } = await supabase
      .from("profiles")
      .select("id")
      .eq("loja_id", prof.loja_id)
      .eq("role", "colaborador")
      .eq("active", true);
    const empIds = (emps || []).map((e) => e.id);

    const nextMonth = new Date(month + "T00:00:00");
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthStr = nextMonth.toISOString().slice(0, 10);

    // atividades pendentes hoje, somando todos os colaboradores da loja
    let pendingToday = 0;
    const { data: activeTasks } = await supabase
      .from("tasks")
      .select("id")
      .eq("loja_id", prof.loja_id)
      .eq("active", true);
    const taskIds = (activeTasks || []).map((t) => t.id);
    if (taskIds.length) {
      const { data: todayRows } = await supabase
        .from("task_completions")
        .select("task_id, completed")
        .in("task_id", taskIds)
        .eq("completion_date", today);
      const doneTaskIds = new Set((todayRows || []).filter((r) => r.completed).map((r) => r.task_id));
      pendingToday = taskIds.filter((id) => !doneTaskIds.has(id)).length;
    }

    // meta da loja no mês (soma de todas as metas ativas), ordenadas por valor crescente (meta 1, meta 2…)
    const { data: goalRows } = await supabase
      .from("sales_goals")
      .select("id, name, store_total, commission_pct_gerente")
      .eq("loja_id", prof.loja_id)
      .eq("month", month)
      .order("store_total", { ascending: true });
    const metaLoja = (goalRows || []).reduce((s, g) => s + Number(g.store_total || 0), 0);

    let entryRows = [];
    if (empIds.length) {
      const { data } = await supabase
        .from("sales_entries")
        .select("employee_id, daily_amount")
        .in("employee_id", empIds)
        .gte("entry_date", month)
        .lt("entry_date", nextMonthStr);
      entryRows = data || [];
    }
    const soldLoja = entryRows.reduce((s, e) => s + Number(e.daily_amount || 0), 0);

    const { data: commissionRow } = await supabase
      .from("commission_settings")
      .select("*")
      .eq("loja_id", prof.loja_id)
      .eq("month", month)
      .maybeSingle();

    // comissão por nível de meta da loja: quem passa do valor de uma meta, comissiona na taxa (gerente) daquele
    // nível — assim sucessivamente. Enquanto a loja não bate a 1ª meta, usa a taxa de "não atingimento".
    let achievedTier = null;
    (goalRows || []).forEach((g) => {
      if (soldLoja >= Number(g.store_total || 0)) achievedTier = g;
    });
    const commissionPct = achievedTier
      ? Number(achievedTier.commission_pct_gerente) || 0
      : Number(commissionRow?.non_achievement_gerente_pct) || 0;
    const commissionTierLabel = achievedTier ? achievedTier.name : "não atingimento";
    const commissionSoFar = soldLoja * (commissionPct / 100);

    // premiações do mês lançadas pelo próprio gerente (aba Premiações), somando todos os colaboradores da loja
    let prizesSoFar = 0;
    if (empIds.length) {
      const { data: prizeRows } = await supabase
        .from("employee_prizes")
        .select("amount")
        .in("employee_id", empIds)
        .eq("month", month);
      prizesSoFar = (prizeRows || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    }

    setHero({ metaLoja, soldLoja, pendingToday, commissionSoFar, prizesSoFar, commissionPct, commissionTierLabel });
  }, [month, today]);

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
      setProfile(prof);
      if (!prof.must_change_password) await loadStats(prof);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [router, loadStats]);

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

  const remaining = remainingDaysInMonth(today);
  const restoDaMeta = Math.max(0, hero.metaLoja - hero.soldLoja);
  const dailyGoal = remaining > 0 ? restoDaMeta / remaining : 0;

  return (
    <AppShell
      userName={profile.full_name}
      userId={profile.id}
      userUsername={profile.username}
      onNameChange={(name) => setProfile((p) => ({ ...p, full_name: name }))}
      tabs={EMPRESA_TABS}
      activeTab={tab}
      onTabChange={setTab}
    >
      <div className="space-y-6">
        {tab === "atividades" && (
          <>
            <h1 className="text-xl font-bold text-navy flex items-center gap-2">
              <greet.Icon size={20} className="text-orange" /> {greet.word}, {profile.full_name.split(" ")[0]}!
            </h1>

            <div
              className="relative overflow-hidden rounded-3xl p-6 sm:p-7"
              style={{ background: "linear-gradient(135deg, #16a34a 0%, #4ade80 100%)", boxShadow: "0 10px 28px rgba(22,163,74,0.35)" }}
            >
              <div className="absolute -top-14 -right-10 w-48 h-48 rounded-full bg-white/15" />
              <div className="relative flex items-center gap-2 mb-3">
                <Store size={18} className="text-navy" />
                <span className="text-xs font-bold uppercase tracking-wider text-navy">Meta de hoje · {lojaName || "sua loja"}</span>
              </div>
              <p className="relative text-4xl sm:text-5xl font-extrabold text-navy leading-tight">{formatBRL(dailyGoal)}</p>
              <p className="relative text-xs font-semibold text-navy/70 mt-1">pra bater a meta da loja nos {remaining} dia{remaining !== 1 ? "s" : ""} restantes</p>
              <p className="relative text-xs font-semibold text-navy/70 mt-1">Vendido até ontem: {formatBRL(hero.soldLoja)}</p>

              <div className="relative grid grid-cols-2 sm:grid-cols-5 gap-4 mt-6 pt-5 border-t border-navy/15">
                <div>
                  <p className="text-xl font-extrabold text-navy">{formatBRL(restoDaMeta)}</p>
                  <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><Rocket size={11} /> Falta pra meta do mês</p>
                </div>
                <div>
                  <p className="text-xl font-extrabold text-navy">{remaining}</p>
                  <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><CalendarClock size={11} /> Dias restantes no mês</p>
                </div>
                <div>
                  <p className="text-xl font-extrabold text-navy">{hero.pendingToday}</p>
                  <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><ListTodo size={11} /> Atividades pendentes</p>
                </div>
                <div>
                  <p className="text-xl font-extrabold text-navy">{formatBRL(hero.commissionSoFar)}</p>
                  <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><Coins size={11} /> Comissão até agora</p>
                  {hero.metaLoja > 0 && (
                    <p className="text-[10px] text-navy/60 mt-0.5">{hero.commissionPct}% · {hero.commissionTierLabel}</p>
                  )}
                </div>
                <div>
                  <p className="text-xl font-extrabold text-navy">{formatBRL(hero.prizesSoFar)}</p>
                  <p className="text-[11px] font-semibold text-navy/70 mt-0.5 flex items-center gap-1"><Gift size={11} /> Premiações</p>
                </div>
              </div>
            </div>
          </>
        )}

        <EmpresaDashboard lojaId={profile.loja_id} empresaId={profile.empresa_id} viewerRole="gerente" tab={tab} />
      </div>
    </AppShell>
  );
}
