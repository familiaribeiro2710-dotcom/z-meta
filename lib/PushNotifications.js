"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
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

// Sino de "ativar notificações" no header (AppShell.js) — só aparece se o navegador suporta
// Web Push e o usuário ainda não está inscrito. Depois de inscrito, some (não tem "desativar"
// pela UI ainda — pra desativar hoje seria preciso revogar a permissão no próprio navegador,
// o que já limpa a subscription; a linha órfã em push_subscriptions se autolimpa da próxima vez
// que a Edge Function tentar mandar um push e receber 404/410 do serviço de push do navegador).
export default function NotificationBell({ userId }) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !userId) return;
    const ok = "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
    setSupported(ok);
    if (!ok) return;
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

  if (!supported || subscribed) return null;

  return (
    <button
      onClick={activate}
      disabled={loading}
      title="Ativar notificações"
      aria-label="Ativar notificações"
      className="p-2 rounded-full text-muted hover:text-gold hover:bg-line/60 transition-colors shrink-0 disabled:opacity-50"
    >
      <Bell size={16} />
    </button>
  );
}
