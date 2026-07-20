"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, BellOff, BellRing } from "lucide-react";
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
  // "Tarefas concluídas" é o mesmo evento nas duas categorias (mecanismo de tarefas é
  // compartilhado entre vestuário e consórcio) — por isso vive direto no papel, sem depender
  // de isConsorcio, diferente de "Novo lead"/"Nova meta"/"Nova tarefa" abaixo.
  gerente: [
    { key: "venda_equipe", label: "Venda registrada pela equipe" },
    { key: "tarefas_completas", label: "Colaborador concluiu todas as tarefas do dia" },
  ],
  socio: [
    { key: "venda_loja", label: "Venda registrada na loja" },
    { key: "meta_batida", label: "Meta batida" },
    { key: "tarefas_completas", label: "Colaborador concluiu todas as tarefas do dia" },
  ],
  supervisor: [
    { key: "venda_loja", label: "Venda registrada na loja" },
    { key: "meta_batida", label: "Meta batida" },
    { key: "tarefas_completas", label: "Colaborador concluiu todas as tarefas do dia" },
  ],
};
// "Novo lead cadastrado" só existe no funil do segmento consórcio. "Nova meta"/"Nova tarefa
// atribuída" (2026-07-20) só existem hoje no segmento vestuário (metas em sales_goals/
// sales_goal_allocations e tarefas atribuídas por gestor de loja de vestuário) — nenhum dos
// dois toggles aparece pro colaborador da categoria que não os recebe.
const LEAD_NOVO_OPTION = { key: "lead_novo", label: "Novo lead cadastrado" };
const NOVA_META_OPTION = { key: "nova_meta", label: "Nova meta atribuída" };
const NOVA_TAREFA_OPTION = { key: "nova_tarefa", label: "Nova tarefa atribuída" };

function optionsForRole(role, isConsorcio) {
  const base = ROLE_OPTIONS[role] || [];
  if (role === "colaborador") {
    return isConsorcio ? [...base, LEAD_NOVO_OPTION] : [...base, NOVA_META_OPTION, NOVA_TAREFA_OPTION];
  }
  return base;
}

// Sino de notificações no header (AppShell.js) — só aparece se o navegador suporta Web Push.
// Sempre visível (ativado ou não), com toggle: clique ativa se estiver desligado, desativa se
// já estiver ligado. Verde = ativado, vermelho = desativado (pedido explícito do Felipe).
//
// Preferências por hierarquia (2026-07-20, ajustado em 2026-07-20): o clique no sino SEMPRE
// abre o painel de preferências — ativado ou não, a qualquer momento, um único ponto de
// entrada (antes existia um ícone de engrenagem separado só pra reabrir o painel já ativado, e
// o clique no sino desativava direto sem chance de ajustar nada; unificado pra ficar mais
// fácil de achar). Dentro do painel, o usuário escolhe (checkboxes) quais eventos do PRÓPRIO
// papel quer receber — colaborador entre advertência/premiação(/lead novo, só em consórcio;
// /nova meta+nova tarefa, só em vestuário), gerente "venda da equipe"/"tarefas concluídas",
// sócio/supervisor "venda na loja"/"meta batida"/"tarefas concluídas" — e tem um botão à parte
// "Desativar notificações" (ação geral, cancela a subscription inteira) sempre visível quando
// já está ativado, separado dos botões de Cancelar/Salvar pra não confundir "ajustar" com
// "desligar tudo". Preferência é por USUÁRIO (tabela `push_preferences`, PK `profile_id`), não
// por dispositivo — troca de aparelho não perde a escolha. Sem linha salva ainda = tudo
// habilitado (default do banco), mesmo comportamento de antes dessa feature existir.
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
  const [mounted, setMounted] = useState(false);

  // O painel é renderizado via portal direto em `document.body` (ver `panelOpen && ...` mais
  // abaixo) — o sino vive dentro do `<header>` do AppShell, que tem `backdrop-blur`
  // (`backdrop-filter`). Em navegadores baseados em WebKit (Safari/iOS), um ancestral com
  // `backdrop-filter` vira o containing block de qualquer `position: fixed` dentro dele, então
  // sem o portal o overlay ficava preso dentro da caixinha do header (bug real reportado pelo
  // Felipe: painel cortado, espremido no topo da tela). `mounted` evita tentar acessar
  // `document` durante SSR.
  useEffect(() => setMounted(true), []);

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

  // Clique no sino SEMPRE abre o painel (ativado ou não) — antes, com notificação já ativa,
  // o clique desativava na hora sem abrir nada, e o único jeito de ajustar preferência
  // específica era um ícone de engrenagem à parte, fácil de não notar. Agora é um único
  // ponto de entrada, acessível a qualquer momento, com as duas ações (geral e específica)
  // dentro do mesmo painel.
  async function handleBellClick() {
    if (loading || !roleLoaded) return;
    if (options.length > 0) {
      await openPanel();
    } else if (subscribed) {
      // papel sem nenhuma preferência configurável hoje (ex.: master_admin) — toggle direto.
      await deactivate();
    } else {
      setLoading(true);
      await doSubscribe();
      setLoading(false);
    }
  }

  async function deactivateFromPanel() {
    await deactivate();
    setPanelOpen(false);
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
      {/* Verde (borda + ícone, incluindo as "aspas" do sino tocando) quando ativado; vermelho
          quando desativado — pedido explícito do Felipe, feedback visual imediato de estado
          sem precisar ler o title/tooltip. Único ponto de entrada pro painel de preferências —
          acessível a qualquer momento, ativado ou não. */}
      <button
        type="button"
        onClick={handleBellClick}
        disabled={loading || !roleLoaded}
        title={options.length > 0 ? "Preferências de notificação" : subscribed ? "Desativar notificações" : "Ativar notificações"}
        aria-label={options.length > 0 ? "Preferências de notificação" : subscribed ? "Desativar notificações" : "Ativar notificações"}
        className={`p-1.5 rounded-full border-2 transition-colors shrink-0 disabled:opacity-50 ${
          subscribed
            ? "border-success text-success hover:bg-success/10"
            : "border-danger text-danger hover:bg-danger/10"
        }`}
      >
        {subscribed ? <BellRing size={16} /> : <Bell size={16} />}
      </button>

      {panelOpen && mounted && createPortal(
        // Overlay inteiro rolável (não só o card) — no mobile, `vh` pode ser calculado contra
        // a altura "estática" do viewport (antes da barra de endereço do navegador recolher),
        // deixando o card mais alto que a área realmente visível. Com `max-h-[85vh]` sozinho
        // (padrão usado em outros modais do app) os botões do rodapé podiam ficar inacessíveis
        // nesse cenário — a rolagem ficava só dentro do card, mas o próprio card podia nascer
        // deslocado pra fora da tela pela centralização do flex. Rolar o overlay inteiro
        // garante que qualquer parte do painel sempre é alcançável, independente do cálculo de
        // viewport do navegador. Renderizado via portal em `document.body` — ver comentário
        // no useEffect de `mounted` acima (escapa do containing block criado pelo
        // `backdrop-blur` do header).
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-navy/70 p-4 sm:p-6"
          onClick={() => !savingPrefs && !loading && setPanelOpen(false)}
        >
          <div className="min-h-full flex items-start sm:items-center justify-center">
            <div className="card max-w-sm w-full my-8 sm:my-0" onClick={(e) => e.stopPropagation()}>
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
                <button type="button" className="btn-outline flex-1" disabled={savingPrefs || loading} onClick={() => setPanelOpen(false)}>
                  Cancelar
                </button>
                <button type="button" className="btn flex-1" disabled={savingPrefs || loading} onClick={confirmPanel}>
                  {savingPrefs ? "Salvando…" : subscribed ? "Salvar" : "Ativar notificações"}
                </button>
              </div>
              {subscribed && (
                <button
                  type="button"
                  className="w-full mt-3 text-xs font-semibold text-danger hover:underline disabled:opacity-50"
                  disabled={savingPrefs || loading}
                  onClick={deactivateFromPanel}
                >
                  {loading ? "Desativando…" : "Desativar notificações"}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
