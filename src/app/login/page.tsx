"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError("E-mail ou mot de passe incorrect.");
    router.push(new URLSearchParams(window.location.search).get("next") ?? "/installer");
    router.refresh();
  };

  const input = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-base";
  return (
    <main className="grid min-h-[70vh] place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-panel p-6">
        <h1 className="text-xl font-extrabold">Se connecter</h1>
        <label className="block text-sm">
          E-mail
          <input type="email" required className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block text-sm">
          Mot de passe
          <input type="password" required className={input} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="text-sm text-alert">{error}</p>}
        <button disabled={loading} className="w-full rounded-lg bg-ink px-4 py-2.5 font-semibold text-white disabled:opacity-60">
          {loading ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </main>
  );
}
