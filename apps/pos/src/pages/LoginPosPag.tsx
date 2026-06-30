import React, { useState } from "react";
import { Button, Input } from "@niagara/ui";
import { useAuthStore } from "@/stores/authPosStore";

/** Pantalla de login del POS — simple, optimizada para touch */
export function LoginPosPag() {
  const { login, cargando, error } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(194,255,0,0.08) 0%, transparent 60%)",
        }}
      />
      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-surface rounded-3xl border border-lime/30 mb-5 shadow-lime-glow">
            <span className="text-2xl font-black text-lime">POS</span>
          </div>
          <h1 className="text-2xl font-black text-text-primary">Club Niágara Caja</h1>
          <p className="text-text-secondary text-sm mt-1">Sistema offline-first</p>
        </div>

        <div className="card">
          <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            <Input label="Contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />

            {error && (
              <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-danger text-sm">
                {error}
              </div>
            )}

            <Button type="submit" variante="lime" tamaño="lg" cargando={cargando} className="w-full mt-2">
              Ingresar a la caja
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
