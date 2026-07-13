"use client";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// cliente principal: mantém a sessão logada no navegador
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// cliente "descartável": usado só para operações que não devem
// interferir na sessão do usuário logado (ex.: nenhuma hoje, mas
// mantido como utilitário seguro caso seja necessário no futuro)
export function createEphemeralClient() {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
