"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Settings } from "lucide-react";
import { supabase } from "./supabaseClient";

// Chave pública VAPID — não é segredo por design (é feita pra ser distribuída pro navegador,
// só a privada fica no servidor/Edge Function). Hardcoded aqui de propósito, pra não depender
// de configurar env var no Vercel só pra isso.
const VAPID_PUBLIC_KEY = "BKqlB-XRmWGkdsTMOkWa45epAKfMDTqW0uctz20yeNV30j4-kO-lr5iW7U-09k8Y4OCKLUrTAPCTPq9XqHTJj20";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// Opções de notificação por papel (2026-07-20) — obedece a hierarquia: cada papel só escolhe
// entre os eventos que ele de fato recebe (nunca aparece um toggle de algo que aquele papel
// nunca vai receber). Espelha 1:1 as chaves de `push_preferences`/`push_pref_enabled` no banco.
const ROLE_OPTIONS = {
  colaborador: [
    { key: "advertencia", label: "Advertências" },
    { key: "premiacao", label: "Premiações" },
  ],
  gerente: [{ key: "venda_equipe", label: "Venda registrada pela equipe" }],
  socio: [
    { key: "venda_loja", label: "Venda registrada na loja" },
    { key: "meta_batida", label: "Meta batida" },
  ],
  supervisor: [
    { key: "venda_loja", label: "Venda registrada na loja" },
    { key: "meta_batida", label: "Meta batida" },
  ],
};
// "Novo lead cadastrado" só existe no funil do segmento consórcio — não faz sentido oferecer
// esse toggle pro colaborador de uma empresa de vestuário, que nunca recebe esse evento.
const LEAD_NOVO_OPTION = { key: "lead_novo", label: "Novo lead cadastrado" };

function optionsForRole(role, isConsorcio) {
  const base = ROLE_OPTIONS[role] || [];
  if (role === "colaborador" && isConsorcio) return [...base, LEAD_NOVO_OPTION];
  return base;
}

// Sino de notificações no header (AppShell.js) — só aparece se o navegador suporta Web Push.
// Sempre visível (ativado ou não), com toggle: clique ativa se estiver desligado, desativa se
// já estiver ligado. Verde = ativado, vermelho = desativado (pedido explícito do Felipe).
//
// Preferências por hierarquia (2026-07-20): antes de pedir a permissão do navegador pela
// primeira vez, o usuário escolhe (checkboxes) quais dos eventos do PRÓPRIO papel ele quer
// receber — colaborador escolhe entre advertência/premiação(/lead novo, só em consórcio),
// gerente só tem "venda da equipe", sócio/supervisor têm "venda na loja"/"meta batida". Depois
// de ativado, o mesmo painel reabre pelo ícone de engrenagem, pra ajustar sem precisar
// desativar e reativar a subscription inteira. Preferência é por USUÁRIO (tabela
// `push_preferences`, PK `profile_id`), não por dispositivo — troca de aparelho não perde a
// escolha. Sem linha salva ainda = tudo habilitado (default do banco), mesmo comportamento de
// antes dessa feature existir.
//
// Nota sobre o idioma do prompt de permissão: `Notification.requestPermission()` abre o diálogo
// NATIVO do navegador/sistema operacional — o texto dele é controlado pelo idioma configurado
// no PRÓPRIO navegador do usuário, não pela página. Não existe API web que traduza esse
// diálogo específico.
export default function NotificationBell({ userId }) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState("default"); // "default" | "granted" | "denied"
  const [loading, setLoading] = useState(false);

  const [role, setRole] = useState(null);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [isConsorcio, setIsConsorcio] = useState(false);

  const [panelOpen, setPanelOpen] = useState(false);
  const [prefs, setPrefs] = useState({});
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !userId) return;
    const ok = "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
    setSupported(ok);
    if (ok) {
      setPermission(Notification.permission);
      navigator.serviceWorker
        .register("/sw.js")
        .then(async (reg) => {
          const sub = await reg.pushManager.getSubscription();
          setSubscribed(!!sub);
        })
        .catch(() => {});
    }

    // papel + categoria da empresa decidem quais opções de preferência mostrar.
    (async () => {
      const { data: prof } = await supabase.from("profiles").select("role, empresa_id").eq("id", userId).single();
      if (prof) {
        setRole(prof.role);
        if (prof.role === "colaborador" && prof.empresa_id) {
          const { data: empresaRow } = await supabase.from("empresas").select("categoria_id").eq("id", prof.empresa_id).single();
          if (empresaRow?.categoria_id) {
            const { data: categoriaRow } = await supabase.from("categorias_empresa").select("slug").eq("id", empresaRow.categoria_id).single();
            setIsConsorcio(categoriaRow?.slug === "consorcio");
          }
        }
      }
      setRoleLoaded(true);
    })();
  }, [userId]);

  const options = optionsForRole(role, isConsorcio);

  async function doSubscribe() {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return false;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }
      const json = sub.toJSON();
      await supabase.from("push_subscriptions").upsert(
        { profile_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
        { onConflict: "endpoint" }
      );
      setSubscribed(true);
      return true;
    } catch (e) {
      console.error("falha ao ativar notificações push:", e);
      return false;
    }
  }

  async function deactivate() {
    if (!userId || loading) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await supabase.from("push_subscriptions").delete().eq("profile_id", userId).eq("endpoint", endpoint);
      }
      setSubscribed(false);
    } catch (e) {
      console.error("falha ao desativar notificações push:", e);
    } finally {
      setLoading(false);
    }
  }

  // Abre o painel de preferências — pré-marca com o que já está salvo em `push_preferences`
  // (ou tudo marcado, se o usuário nunca configurou nada ainda).
  async function openPanel() {
    if (!options.length) return;
    const { data: row } = await supabase.from("push_preferences").select("*").eq("profile_id", userId).maybeSingle();
    const next = {};
    options.forEach((o) => { next[o.key] = row ? !!row[o.key] : true; });
    setPrefs(next);
    setPanelOpen(true);
  }

  function togglePref(key) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  }

  // Confirma o painel: se ainda não tinha subscription, pede permissão/assina agora (dentro do
  // clique do usuário, gesture válido); depois salva as preferências escolhidas.
  async function confirmPanel() {
    setSavingPrefs(true);
    try {
      if (!subscribed) {
        const ok = await doSubscribe();
        if (!ok) { setSavingPrefs(false); return; }
      }
      const payload = { profile_id: userId, updated_at: new Date().toISOString() };
      options.forEach((o) => { payload[o.key] = !!prefs[o.key]; });
      await supabase.from("push_preferences").upsert(payload, { onConflict: "profile_id" });
      setPanelOpen(false);
    } finally {
      setSavingPrefs(false);
    }
  }

  async function handleBellClick() {
    if (loading || !roleLoaded) return;
    if (subscribed) {
      await deactivate();
    } else if (options.length > 0) {
      await openPanel();
    } else {
      // papel sem nenhuma preferência configurável hoje (ex.: master_admin) — ativa direto.
      setLoading(true);
      await doSubscribe();
      setLoading(false);
    }
  }

  if (!supported) return null;

  // Usuário já negou a permissão no navegador — não dá pra reabrir o prompt via JS
  // (limitação da Web Notifications API), só avisar onde resolver. Mantém a família de cor
  // "vermelho = desativado", mas sem hover/cursor de clicável (não faz nada de verdade).
  if (permission === "denied" && !subscribed) {
    return (
      <button
        type="button"
        title="Notificações bloqueadas pelo navegador — habilite manualmente nas configurações do site"
        aria-label="Notificações bloqueadas pelo navegador"
        className="p-1.5 rounded-full border-2 border-danger/50 text-danger/50 cursor-not-allowed shrink-0"
        onClick={() => {}}
      >
        <BellOff size={16} />
      </button>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1 shrink-0">
        {subscribed && options.length > 0 && (
          <button
            type="button"
            onClick={openPanel}
            title="Preferências de notificação"
            aria-label="Editar preferências de notificação"
            className="p-2 rounded-full text-muted hover:text-gold hover:bg-line/60 transition-colors"
          >
            <Settings size={14} />
          </button>
        )}
        {/* Verde (borda + ícone, incluindo as "aspas" do sino tocando) quando ativado; vermelho
            quando desativado — pedido explícito do Felipe, feedback visual imediato de estado
            sem precisar ler o title/tooltip. */}
        <button
          type="button"
          onClick={handleBellClick}
          disabled={loading || !roleLoaded}
          title={subscribed ? "Desativar notificações" : "Ativar notificações"}
          aria-label={subscribed ? "Desativar notificações" : "Ativar notificações"}
          className={`p-1.5 rounded-full border-2 transition-colors disabled:opacity-50 ${
            subscribed
              ? "border-success text-success hover:bg-success/10"
              : "border-danger text-danger hover:bg-danger/10"
          }`}
        >
          {subscribed ? <BellRing size={16} /> : <Bell size={16} />}
        </button>
      </div>

      {panelOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 p-6"
          onClick={() => !savingPrefs && setPanelOpen(false)}
        >
          <div className="card max-w-sm w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-navy">Notificações</h2>
            <p className="text-xs text-muted mt-1">
              Escolha o que você quer ser avisado.{" "}
              {!subscribed && "Na sequência, o navegador vai pedir permissão pra mostrar notificações."}
            </p>
            <div className="space-y-2 mt-4">
              {options.map((o) => (
                <label key={o.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={!!prefs[o.key]} onChange={() => togglePref(o.key)} />
                  {o.label}
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button type="button" className="btn-outline flex-1" disabled={savingPrefs} onClick={() => setPanelOpen(false)}>
                Cancelar
              </button>
              <button type="button" className="btn flex-1" disabled={savingPrefs} onClick={confirmPanel}>
                {savingPrefs ? "Salvando…" : subscribed ? "Salvar" : "Ativar notificações"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
