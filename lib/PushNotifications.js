"use client";
import { useEffect, useState } from "react";
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

// Sino de notificações no header (AppShell.js) — só aparece se o navegador suporta Web Push.
// Sempre visível (ativado ou não), com toggle: clique ativa se estiver desligado, desativa se
// já estiver ligado. Bug real corrigido aqui (2026-07-20): antes o botão simplesmente
// desaparecia (`if (!supported || subscribed) return null`) assim que o usuário ativava,
// sem nenhuma forma de desativar pela UI — o único jeito era revogar a permissão manualmente
// nas configurações do navegador. Agora o estado "ativado" tem visual próprio (sino
// preenchido, dourado) e um clique chama `deactivate()`, que cancela a subscription no
// navegador E apaga a linha correspondente de `push_subscriptions` (não deixa órfã esperando
// a Edge Function limpar sozinha no próximo envio).
//
// Nota sobre o idioma do prompt de permissão: `Notification.requestPermission()` abre o diálogo
// NATIVO do navegador/sistema operacional (ex.: "site quer: mostrar notificações" / "Allow"/
// "Block") — o texto dele é controlado pelo idioma configurado no PRÓPRIO navegador do usuário
// (ex. chrome://settings/languages), não pela página. Não existe API web que traduza esse
// diálogo — é fora do alcance de qualquer app rodando no navegador. Se aparece em inglês, o
// navegador do usuário está com o idioma em inglês; o app já está com `lang="pt-BR"` (
// `app/layout.js`) e isso não influencia esse diálogo específico.
export default function NotificationBell({ userId }) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState("default"); // "default" | "granted" | "denied"
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !userId) return;
    const ok = "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
    setSupported(ok);
    if (!ok) return;
    setPermission(Notification.permission);
    navigator.serviceWorker
      .register("/sw.js")
      .then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      })
      .catch(() => {});
  }, [userId]);

  async function activate() {
    if (!userId || loading) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setLoading(false);
        return;
      }
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
    } catch (e) {
      console.error("falha ao ativar notificações push:", e);
    } finally {
      setLoading(false);
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

  // Verde (borda + ícone, incluindo as "aspas" do sino tocando) quando ativado;
  // vermelho quando desativado — pedido explícito do Felipe, feedback visual imediato
  // de estado sem precisar ler o title/tooltip.
  return (
    <button
      type="button"
      onClick={subscribed ? deactivate : activate}
      disabled={loading}
      title={subscribed ? "Desativar notificações" : "Ativar notificações"}
      aria-label={subscribed ? "Desativar notificações" : "Ativar notificações"}
      className={`p-1.5 rounded-full border-2 transition-colors shrink-0 disabled:opacity-50 ${
        subscribed
          ? "border-success text-success hover:bg-success/10"
          : "border-danger text-danger hover:bg-danger/10"
      }`}
    >
      {subscribed ? <BellRing size={16} /> : <Bell size={16} />}
    </button>
  );
}
