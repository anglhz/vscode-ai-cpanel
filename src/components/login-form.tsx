"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Server } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password"),
      }),
    });

    setLoading(false);

    if (!response.ok) {
      setError("Invalid email or password.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,#124f64_0,#09090b_34%,#050505_100%)] px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-white/10 bg-neutral-950/85 p-6 shadow-2xl shadow-cyan-950/30 backdrop-blur sm:p-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-400 text-neutral-950">
            <Server className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-cyan-200">Intuitive</p>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Gamepanel</h1>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-neutral-300">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="h-12 w-full rounded-md border border-white/10 bg-neutral-900 px-3 text-white outline-none ring-cyan-400/30 transition focus:border-cyan-300 focus:ring-4"
              placeholder="admin@intuitive.local"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-neutral-300">Password</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="h-12 w-full rounded-md border border-white/10 bg-neutral-900 px-3 text-white outline-none ring-cyan-400/30 transition focus:border-cyan-300 focus:ring-4"
              placeholder="admin123!"
            />
          </label>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 font-semibold text-neutral-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Lock className="h-4 w-4" />
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
