import React, { useState } from "react";
import { Button, Input } from "@niagara/ui";
import { loginSchema } from "@niagara/core";
import { useAuthStore } from "@/stores/authStore";

/**
 * Página de login.
 * Pantalla oscura de boliche con CTA verde lima.
 */
export function LoginPage() {
  const { login, cargando, error, limpiarError } = useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erroresForm, setErroresForm] = useState<{ email?: string; password?: string }>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    limpiarError();
    setErroresForm({});

    // Validar con Zod antes de enviar
    const resultado = loginSchema.safeParse({ email, password });
    if (!resultado.success) {
      const errores = resultado.error.flatten().fieldErrors;
      setErroresForm({
        email: errores.email?.[0],
        password: errores.password?.[0],
      });
      return;
    }

    await login(email, password);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Gradiente de fondo sutil */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(123,63,255,0.12) 0%, transparent 60%)",
        }}
      />

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-surface rounded-3xl border border-border mb-6 shadow-purple-glow">
            <span className="text-4xl font-black text-lime tracking-tighter">N</span>
          </div>
          <h1 className="text-3xl font-black text-text-primary">
            Club Niágara
          </h1>
          <p className="text-text-secondary mt-1">
            Sistema de gestión para boliches
          </p>
        </div>

        {/* Card de login */}
        <div className="bg-surface border border-border rounded-3xl p-8 shadow-card">
          <h2 className="text-xl font-bold text-text-primary mb-6">
            Iniciar sesión
          </h2>

          <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-5">
            <Input
              label="Email"
              type="email"
              placeholder="admin@tuboliche.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={erroresForm.email}
              autoComplete="email"
              autoFocus
            />

            <Input
              label="Contraseña"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={erroresForm.password}
              autoComplete="current-password"
            />

            {/* Error del servidor */}
            {error && (
              <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-danger text-sm">
                {error}
              </div>
            )}

            <Button
              type="submit"
              variante="lime"
              tamaño="lg"
              cargando={cargando}
              className="w-full mt-2"
            >
              {cargando ? "Ingresando..." : "Ingresar"}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-text-muted text-xs mt-6">
          Club Niágara v0.1 · Solo para personal autorizado
        </p>
      </div>
    </div>
  );
}
