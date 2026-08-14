/**
 * Módulo 8 — Personal
 * ABM de staff + comisiones RRPP.
 */

import React, { useState, useEffect } from "react";
import { cn } from "@niagara/ui";
import { Icono } from "@/components/Icono";
import {
  usePersonalStore,
  ROL_CONFIG,
  type StaffMiembro,
  type RolStaff,
  type ComisionRrpp,
} from "@/stores/personalStore";
import { useAuthStore } from "@/stores/authStore";

type Tab = "staff" | "clientes" | "comisiones";

const ETIQUETA_TAB: Record<Tab, string> = {
  staff: "Staff",
  clientes: "Clientes de la app",
  comisiones: "Comisiones RRPP",
};

// ── Helpers ───────────────────────────────────────────────────────

function formatPeso(n: number) {
  return `$${n.toLocaleString("es-AR", { minimumFractionDigits: 0 })}`;
}
function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

// ── Componente principal ──────────────────────────────────────────

export function PersonalPage() {
  const [tab, setTab] = useState<Tab>("staff");
  const { staff, error, limpiarError, cargarStaff, cargarComisiones } = usePersonalStore();
  const { staff: miStaff } = useAuthStore();
  const esAdmin = miStaff?.rol === "admin";

  useEffect(() => {
    void cargarStaff();
    void cargarComisiones();
  }, [cargarStaff, cargarComisiones]);

  const activos = staff.filter((s) => s.activo).length;
  const inactivos = staff.filter((s) => !s.activo).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Personal</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {activos} activo{activos !== 1 ? "s" : ""}
            {inactivos > 0 && ` · ${inactivos} inactivo${inactivos !== 1 ? "s" : ""}`}
          </p>
        </div>
        {esAdmin && tab === "staff" && <BotonNuevoStaff />}
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-danger">{error}</p>
          <button onClick={limpiarError} className="text-danger ml-4" aria-label="Cerrar">
            <Icono nombre="cerrar" tamano={16} />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-2 rounded-xl p-1 w-fit">
        {(["staff", "clientes", "comisiones"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-5 py-2 rounded-lg text-sm font-medium transition-all",
              tab === t ? "bg-accent text-white shadow" : "text-text-secondary hover:text-text-primary"
            )}
          >
            {ETIQUETA_TAB[t]}
          </button>
        ))}
      </div>

      {tab === "staff"      && <TabStaff esAdmin={esAdmin} />}
      {tab === "clientes"   && <TabClientes />}
      {tab === "comisiones" && <TabComisiones esAdmin={esAdmin} />}
    </div>
  );
}

// ── Botón nuevo staff ─────────────────────────────────────────────

function BotonNuevoStaff() {
  const [abierto, setAbierto] = useState(false);
  const { crearStaff, procesando } = usePersonalStore();

  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [rol, setRol] = useState<RolStaff>("cajero");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nuevo = await crearStaff({ email, nombre, apellido, rol, password });
    if (nuevo) {
      setEmail(""); setNombre(""); setApellido(""); setPassword(""); setRol("cajero");
      setAbierto(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="px-4 py-2 bg-accent text-white rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors"
      >
        + Nuevo staff
      </button>

      {abierto && (
        <Modal titulo="Nuevo miembro de staff" onCerrar={() => setAbierto(false)}>
          <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Nombre *">
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} required />
              </Campo>
              <Campo label="Apellido *">
                <input value={apellido} onChange={(e) => setApellido(e.target.value)} className={inputCls} required />
              </Campo>
            </div>
            <Campo label="Email *">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} required />
            </Campo>
            <Campo label="Rol">
              <select value={rol} onChange={(e) => setRol(e.target.value as RolStaff)} className={inputCls}>
                {(Object.entries(ROL_CONFIG) as [RolStaff, typeof ROL_CONFIG[RolStaff]][]).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Contraseña temporal *">
              <input
                type="password" minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className={inputCls}
                required
              />
            </Campo>
            <p className="text-xs text-text-secondary">
              No se envía ningún mail: pasale vos el email y la contraseña. Después
              se pueden cambiar desde la ficha de la persona.
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setAbierto(false)} className={btnSecundario}>Cancelar</button>
              <button type="submit" disabled={procesando} className={btnPrimario}>
                {procesando ? "Creando..." : "Crear staff"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ── Tab Staff ─────────────────────────────────────────────────────

function TabStaff({ esAdmin }: { esAdmin: boolean }) {
  const { staff, cargando } = usePersonalStore();
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const { staff: miStaff } = useAuthStore();

  const filtrados = staff.filter((s) => mostrarInactivos || s.activo);

  // Agrupar por rol
  const porRol = Object.keys(ROL_CONFIG) as RolStaff[];

  if (cargando) return <Skeleton />;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 cursor-pointer self-start">
        <input
          type="checkbox"
          checked={mostrarInactivos}
          onChange={(e) => setMostrarInactivos(e.target.checked)}
          className="w-4 h-4 accent-accent"
        />
        <span className="text-sm text-text-secondary">Mostrar inactivos</span>
      </label>

      {porRol.map((rol) => {
        const miembros = filtrados.filter((s) => s.rol === rol);
        if (miembros.length === 0) return null;
        const cfg = ROL_CONFIG[rol];
        return (
          <div key={rol} className="bg-surface rounded-2xl border border-border overflow-hidden">
            <div className="px-4 py-2 bg-surface-2/50 border-b border-border flex items-center gap-2">
              <Icono nombre={cfg.icono} tamano={14} />
              <span className={cn("text-xs font-semibold uppercase tracking-wide", cfg.color)}>{cfg.label}</span>
              <span className="text-xs text-text-secondary">({miembros.length})</span>
            </div>
            <div className="divide-y divide-border">
              {miembros.map((miembro) => (
                <TarjetaStaff
                  key={miembro.id}
                  miembro={miembro}
                  esMio={miembro.id === miStaff?.id}
                  esAdmin={esAdmin}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tarjeta de staff ──────────────────────────────────────────────

function TarjetaStaff({ miembro, esMio, esAdmin }: {
  miembro: StaffMiembro;
  esMio: boolean;
  esAdmin: boolean;
}) {
  const [modalEdit, setModalEdit] = useState(false);
  const { cambiarEstado, procesando } = usePersonalStore();
  const cfg = ROL_CONFIG[miembro.rol];

  return (
    <div className={cn(
      "flex items-center gap-4 px-4 py-3",
      !miembro.activo && "opacity-50"
    )}>
      {/* Avatar */}
      <div className={cn(
        "w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0",
        "bg-surface-2 border border-border"
      )}>
        <Icono nombre={cfg.icono} tamano={16} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-text-primary">
            {miembro.nombre} {miembro.apellido}
          </span>
          {esMio && (
            <span className="text-[10px] bg-accent/10 text-accent border border-accent/20 px-1.5 py-0.5 rounded">
              Tú
            </span>
          )}
          {!miembro.activo && (
            <span className="text-[10px] bg-surface-2 text-text-secondary border border-border px-1.5 py-0.5 rounded">
              Inactivo
            </span>
          )}
        </div>
        <p className="text-xs text-text-secondary">{miembro.user.email}</p>
        {miembro._count && (
          <p className="text-xs text-text-secondary mt-0.5">
            {miembro._count.ventas} ventas · {miembro._count.accesos} accesos
          </p>
        )}
      </div>

      {/* Acciones.
          Editar sí se muestra sobre uno mismo —hace falta para cambiarse la
          propia contraseña—, pero Desactivar no: la API rechaza que alguien se
          deje afuera solo, así que mostrar el botón sería prometer algo falso. */}
      {esAdmin && (
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => setModalEdit(true)}
            className="px-3 py-1.5 text-xs bg-surface-2 border border-border rounded-xl text-text-secondary hover:border-accent transition-colors"
          >
            Editar
          </button>
          {!esMio && (
            <button
              onClick={() => void cambiarEstado(miembro.id, !miembro.activo)}
              disabled={procesando}
              className={cn(
                "px-3 py-1.5 text-xs rounded-xl border transition-colors",
                miembro.activo
                  ? "bg-danger/10 border-danger/30 text-danger hover:bg-danger/20"
                  : "bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20"
              )}
            >
              {miembro.activo ? "Desactivar" : "Activar"}
            </button>
          )}
        </div>
      )}

      {modalEdit && (
        <ModalEditarStaff
          miembro={miembro}
          onCerrar={() => setModalEdit(false)}
          esAdmin={esAdmin}
          esMio={esMio}
        />
      )}
    </div>
  );
}

// ── Modal editar staff ────────────────────────────────────────────

function ModalEditarStaff({ miembro, onCerrar, esAdmin, esMio }: {
  miembro: StaffMiembro;
  onCerrar: () => void;
  esAdmin: boolean;
  esMio: boolean;
}) {
  const { editarStaff, cambiarCredenciales, procesando } = usePersonalStore();
  const [nombre, setNombre] = useState(miembro.nombre);
  const [apellido, setApellido] = useState(miembro.apellido);
  const [rol, setRol] = useState<RolStaff>(miembro.rol);

  const [email, setEmail] = useState(miembro.user.email);
  // Vacío significa "no la toques". Nunca se precarga la contraseña actual
  // porque el servidor no la tiene: guarda un hash, no el texto.
  const [password, setPassword] = useState("");

  const emailCambio = email.trim() !== miembro.user.email;
  const hayCredenciales = emailCambio || password.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const datosCambiaron =
      nombre !== miembro.nombre || apellido !== miembro.apellido || rol !== miembro.rol;

    if (datosCambiaron) {
      const ok = await editarStaff(miembro.id, { nombre, apellido, rol });
      if (!ok) return;
    }

    if (hayCredenciales) {
      const res = await cambiarCredenciales(miembro.id, {
        ...(emailCambio && { email: email.trim() }),
        ...(password && { password }),
      });
      if (!res) return;
    }

    onCerrar();
  };

  return (
    <Modal titulo={`Editar — ${miembro.nombre} ${miembro.apellido}`} onCerrar={onCerrar}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Nombre">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} required />
          </Campo>
          <Campo label="Apellido">
            <input value={apellido} onChange={(e) => setApellido(e.target.value)} className={inputCls} required />
          </Campo>
        </div>

        {esAdmin && (
          <Campo label="Rol">
            <select value={rol} onChange={(e) => setRol(e.target.value as RolStaff)} className={inputCls}>
              {(Object.entries(ROL_CONFIG) as [RolStaff, typeof ROL_CONFIG[RolStaff]][]).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </Campo>
        )}

        {esAdmin && (
          <div className="flex flex-col gap-4 pt-4 border-t border-border">
            <p className="text-xs uppercase tracking-wider text-text-secondary">
              Acceso al sistema
            </p>

            <Campo label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                required
              />
            </Campo>

            <Campo label="Contraseña nueva">
              <input
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Dejar vacío para no cambiarla"
                className={inputCls}
                autoComplete="new-password"
              />
            </Campo>

            {password.length > 0 && (
              <p className="text-xs text-warning">
                {esMio
                  ? "Al guardar se va a cerrar tu sesión y vas a tener que entrar de nuevo con la contraseña nueva."
                  : `Se van a cerrar las sesiones abiertas de ${miembro.nombre}. Pasale la contraseña nueva.`}
              </p>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={onCerrar} className={btnSecundario}>Cancelar</button>
          <button type="submit" disabled={procesando} className={btnPrimario}>
            {procesando ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Tab Clientes de la app ────────────────────────────────────────

/**
 * Gente que se registró desde la app, con lo que compró cada uno.
 *
 * Es distinto del staff: acá no se crea ni se edita nada, solo se consulta.
 * Sirve para saber quién viene seguido y para encontrar a alguien cuando
 * reclama por una entrada.
 */
function TabClientes() {
  const {
    clientes, cargandoClientes, cargarClientes,
    reembolsos, reembolsosMonto, cargarReembolsos,
    cancelarEntrada, marcarReembolsado, procesando,
  } = usePersonalStore();

  const [busqueda, setBusqueda] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<{ id: string; evento: string; pagada: boolean } | null>(null);

  useEffect(() => {
    // Se espera a que deje de tipear: sin esto sale una consulta por tecla.
    const t = setTimeout(() => void cargarClientes(busqueda), 350);
    return () => clearTimeout(t);
  }, [busqueda, cargarClientes]);

  useEffect(() => {
    void cargarReembolsos();
  }, [cargarReembolsos]);

  return (
    <div className="flex flex-col gap-4">
      {/* Plata por devolver. Va arriba de todo y solo aparece si hay algo:
          es lo único de esta pantalla que requiere que alguien haga algo. */}
      {reembolsos.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
          <div className="flex items-start gap-2">
            <Icono nombre="alerta" tamano={18} className="text-warning flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-warning">
                {reembolsos.length} devolución{reembolsos.length !== 1 ? "es" : ""} pendiente
                {reembolsos.length !== 1 ? "s" : ""} · {formatPeso(reembolsosMonto)}
              </p>
              <p className="text-xs text-text-secondary mt-0.5">
                Entradas canceladas que ya estaban pagas. Devolvé la plata desde
                Mercado Pago y marcá cada una acá.
              </p>

              <div className="mt-3 flex flex-col gap-2">
                {reembolsos.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 flex-wrap text-xs bg-surface border border-border rounded-lg px-3 py-2"
                  >
                    <span className="font-bold text-text-primary">{formatPeso(r.monto)}</span>
                    <span className="text-text-secondary flex-1 min-w-0 truncate">
                      {r.cliente ?? "—"} · {r.evento}
                    </span>
                    {r.mpPaymentId && (
                      <span className="font-mono text-text-muted">
                        Pago {r.mpPaymentId}
                      </span>
                    )}
                    <button
                      onClick={() => void marcarReembolsado(r.id)}
                      disabled={procesando}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-success/40 text-success hover:bg-success/10 disabled:opacity-40 transition-colors"
                    >
                      Ya devolví
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="relative max-w-md">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
          <Icono nombre="buscar" tamano={16} />
        </span>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, email o teléfono…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-surface-2 border border-border text-text-primary text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
        />
      </div>

      {cargandoClientes ? (
        <Skeleton />
      ) : clientes.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center">
          <Icono nombre="personal" tamano={40} className="mx-auto mb-3 text-text-muted" />
          <p className="text-text-primary font-semibold">
            {busqueda ? "Nadie coincide con la búsqueda" : "Todavía no se registró nadie"}
          </p>
          <p className="text-sm text-text-secondary mt-2">
            {busqueda
              ? "Probá con otro nombre o email."
              : "Acá van a aparecer los que se registren desde la app."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-text-secondary">
            {clientes.length} cliente{clientes.length !== 1 ? "s" : ""}
          </p>

          {clientes.map((c) => {
            const abierto = expandido === c.id;

            return (
              <div
                key={c.id}
                className="bg-surface border border-border rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setExpandido(abierto ? null : c.id)}
                  className="w-full px-4 py-3 flex items-center gap-4 text-left hover:bg-surface-2 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-purple/20 border border-purple/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-purple-200">
                      {c.nombre.charAt(0).toUpperCase()}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary">
                      {c.nombre} {c.apellido}
                    </p>
                    <p className="text-xs text-text-secondary truncate">
                      {c.email}
                      {c.telefono && ` · ${c.telefono}`}
                    </p>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-accent">
                      {c.entradas.total} entrada{c.entradas.total !== 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {formatPeso(c.entradas.gastado)}
                    </p>
                  </div>

                  {/* Las impagas se marcan en el listado: es lo que el portero
                      va a tener que cobrar en la puerta. */}
                  {c.entradas.impagas > 0 && (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-warning/15 text-warning border border-warning/30 flex-shrink-0">
                      {c.entradas.impagas} sin pagar
                    </span>
                  )}

                  <Icono
                    nombre={abierto ? "volver" : "avanzar"}
                    tamano={16}
                    className="text-text-secondary flex-shrink-0"
                  />
                </button>

                {abierto && (
                  <div className="px-4 pb-4 border-t border-border pt-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                      <Dato etiqueta="Pagadas" valor={String(c.entradas.pagadas)} />
                      <Dato etiqueta="Sin pagar" valor={String(c.entradas.impagas)} />
                      <Dato etiqueta="Usadas" valor={String(c.entradas.usadas)} />
                      <Dato etiqueta="Tarjetas" valor={String(c.tarjetas)} />
                    </div>

                    <p className="text-xs text-text-secondary mb-2">
                      Registrado el{" "}
                      {new Date(c.registradoEn).toLocaleDateString("es-AR", {
                        day: "2-digit", month: "long", year: "numeric",
                      })}
                    </p>

                    {c.ultimas.length > 0 && (
                      <>
                        <p className="text-xs uppercase tracking-wider text-text-secondary mb-2">
                          Últimas entradas
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {c.ultimas.map((e) => (
                            <div
                              key={e.id}
                              className="flex items-center gap-2 text-xs bg-surface-2 rounded-lg px-3 py-2"
                            >
                              <span className="flex-1 text-text-primary truncate">
                                {e.evento}
                              </span>
                              <span className="text-text-secondary">
                                {formatPeso(e.precio)}
                              </span>
                              <span
                                className={cn(
                                  "px-1.5 py-0.5 rounded text-[10px] border",
                                  e.pagada
                                    ? "bg-success/15 text-success border-success/30"
                                    : "bg-warning/15 text-warning border-warning/30"
                                )}
                              >
                                {e.pagada ? "Pagada" : "Sin pagar"}
                              </span>
                              {e.usada && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-surface text-text-secondary border border-border">
                                  Usada
                                </span>
                              )}

                              {/* Una entrada usada no se cancela: ya entró. */}
                              {!e.usada && (
                                <button
                                  onClick={() =>
                                    setConfirmar({
                                      id: e.id,
                                      evento: e.evento,
                                      pagada: e.pagada,
                                    })
                                  }
                                  className="text-text-secondary hover:text-danger transition-colors"
                                  title="Cancelar entrada"
                                  aria-label="Cancelar entrada"
                                >
                                  <Icono nombre="cerrar" tamano={13} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirmar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setConfirmar(null)}
          />
          <div className="relative w-full max-w-sm bg-surface border border-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Icono nombre="alerta" tamano={24} className="text-danger flex-shrink-0" />
              <h2 className="text-base font-bold text-text-primary">Cancelar entrada</h2>
            </div>

            <p className="text-sm text-text-secondary">
              {confirmar.evento}. El QR deja de servir y se libera el cupo.
            </p>

            {confirmar.pagada && (
              <p className="text-sm text-warning">
                Esta entrada está paga. Al cancelarla vas a tener que devolver la
                plata desde Mercado Pago: va a quedar en la lista de devoluciones
                pendientes.
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmar(null)}
                className="flex-1 py-2.5 rounded-xl border border-border text-text-secondary text-sm hover:border-text-secondary transition-colors"
              >
                Volver
              </button>
              <button
                onClick={async () => {
                  const res = await cancelarEntrada(confirmar.id);
                  if (res) setConfirmar(null);
                }}
                disabled={procesando}
                className="flex-1 py-2.5 rounded-xl bg-danger text-white text-sm font-bold hover:brightness-110 disabled:opacity-50 transition-all"
              >
                {procesando ? "Cancelando…" : "Cancelar entrada"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="bg-surface-2 rounded-lg px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-text-secondary">
        {etiqueta}
      </p>
      <p className="text-sm font-bold text-text-primary mt-0.5">{valor}</p>
    </div>
  );
}

// ── Tab Comisiones ────────────────────────────────────────────────

function TabComisiones({ esAdmin }: { esAdmin: boolean }) {
  const { comisiones, cargandoComisiones, staff, pagarComision, calcularComision, procesando } = usePersonalStore();
  const [modalCalcular, setModalCalcular] = useState(false);

  const staffRrpp = staff.filter((s) => s.rol === "rrpp" && s.activo);
  const pendientes = comisiones.filter((c) => !c.pagada);
  const pagadas = comisiones.filter((c) => c.pagada);

  if (cargandoComisiones) return <Skeleton />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-text-secondary">
            {pendientes.length} pendiente{pendientes.length !== 1 ? "s" : ""} de pago
            {pagadas.length > 0 && ` · ${pagadas.length} pagada${pagadas.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        {esAdmin && (
          <button
            onClick={() => setModalCalcular(true)}
            className="px-4 py-2 bg-accent text-white rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors"
          >
            + Calcular comisión
          </button>
        )}
      </div>

      {comisiones.length === 0 ? (
        <div className="py-16 text-center text-text-secondary">
          <Icono nombre="personal" tamano={40} className="mx-auto mb-3 text-text-muted" />
          <p>Sin comisiones registradas</p>
          <p className="text-sm mt-1">Calculá la comisión de un RRPP seleccionando el evento y el porcentaje.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {comisiones.map((c) => (
            <TarjetaComision
              key={c.id}
              comision={c}
              onPagar={() => void pagarComision(c.id)}
              procesando={procesando}
              esAdmin={esAdmin}
            />
          ))}
        </div>
      )}

      {modalCalcular && (
        <ModalCalcularComision
          staffRrpp={staffRrpp}
          onCalcular={async (datos) => {
            const r = await calcularComision(datos);
            if (r) setModalCalcular(false);
          }}
          onCerrar={() => setModalCalcular(false)}
        />
      )}
    </div>
  );
}

// ── Tarjeta de comisión ───────────────────────────────────────────

function TarjetaComision({ comision: c, onPagar, procesando, esAdmin }: {
  // `ReturnType<typeof usePersonalStore>` resuelve a `unknown` (zustand tiene
  // sobrecargas para la versión con selector), así que el tipo del store se
  // importa directo.
  comision: ComisionRrpp;
  onPagar: () => void;
  procesando: boolean;
  esAdmin: boolean;
}) {
  return (
    <div className={cn(
      "bg-surface rounded-xl border p-4 flex flex-col sm:flex-row gap-4",
      c.pagada ? "border-border opacity-70" : "border-accent/20"
    )}>
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="font-semibold text-text-primary">
            {c.staff.nombre} {c.staff.apellido}
          </span>
          <span className={cn(
            "px-2 py-0.5 rounded text-[11px] font-medium",
            c.pagada ? "bg-surface-2 text-text-secondary" : "bg-accent/10 text-accent"
          )}>
            {c.pagada ? "Pagada" : "Pendiente"}
          </span>
        </div>
        <p className="text-xs text-text-secondary">{c.evento.nombre} · {fechaCorta(c.evento.fechaInicio)}</p>
        <p className="text-xs text-text-secondary mt-1">
          {c.entradasVendidas} entradas · {c.porcentajeComision}% · ventas {formatPeso(c.montoTotalVentas)}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-2xl font-bold text-accent">{formatPeso(c.montoComision)}</p>
          <p className="text-xs text-text-secondary">comisión</p>
        </div>
        {!c.pagada && esAdmin && (
          <button
            onClick={onPagar}
            disabled={procesando}
            className="px-4 py-2 bg-green-500/10 border border-green-500/30 text-green-400 rounded-xl text-sm font-medium hover:bg-green-500/20 transition-colors disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-1.5">
              <Icono nombre="ok" tamano={14} />
              Pagar
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Modal calcular comisión ───────────────────────────────────────

function ModalCalcularComision({ staffRrpp, onCalcular, onCerrar }: {
  staffRrpp: StaffMiembro[];
  onCalcular: (datos: { staffId: string; eventoId: string; porcentajeComision: number }) => Promise<void>;
  onCerrar: () => void;
}) {
  const { procesando } = usePersonalStore();
  const [staffId, setStaffId] = useState(staffRrpp[0]?.id ?? "");
  const [eventoId, setEventoId] = useState("");
  const [porcentaje, setPorcentaje] = useState("10");

  // Nota: idealmente cargar eventos desde eventosStore; por ahora input libre
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCalcular({ staffId, eventoId: eventoId.trim(), porcentajeComision: Number(porcentaje) });
  };

  if (staffRrpp.length === 0) {
    return (
      <Modal titulo="Calcular comisión" onCerrar={onCerrar}>
        <p className="text-sm text-text-secondary py-4 text-center">
          No hay staff con rol RRPP activo. Crea un miembro con rol RRPP primero.
        </p>
        <button onClick={onCerrar} className={btnSecundario}>Cerrar</button>
      </Modal>
    );
  }

  return (
    <Modal titulo="Calcular comisión RRPP" onCerrar={onCerrar}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <Campo label="RRPP *">
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className={inputCls} required>
            {staffRrpp.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre} {s.apellido}</option>
            ))}
          </select>
        </Campo>
        <Campo label="ID del evento *">
          <input
            value={eventoId}
            onChange={(e) => setEventoId(e.target.value)}
            placeholder="UUID del evento"
            className={inputCls}
            required
          />
        </Campo>
        <Campo label="Porcentaje de comisión (%)">
          <input
            type="number" min={0} max={100} step={0.5}
            value={porcentaje}
            onChange={(e) => setPorcentaje(e.target.value)}
            className={cn(inputCls, "text-xl font-bold text-center")}
          />
        </Campo>
        <p className="text-xs text-text-secondary">
          Se calculará automáticamente desde las entradas vendidas por este RRPP en el evento.
        </p>
        <div className="flex gap-3">
          <button type="button" onClick={onCerrar} className={btnSecundario}>Cancelar</button>
          <button type="submit" disabled={procesando} className={btnPrimario}>
            {procesando ? "Calculando..." : "Calcular"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Shared UI ─────────────────────────────────────────────────────

function Modal({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCerrar} />
      <div className="relative bg-surface border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-text-primary">{titulo}</h2>
          <button onClick={onCerrar} className="text-text-secondary" aria-label="Cerrar">
            <Icono nombre="cerrar" tamano={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-text-secondary">{label}</label>
      {children}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-16 bg-surface rounded-xl border border-border animate-pulse" />
      ))}
    </div>
  );
}

const inputCls = "w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent transition-colors";
const btnPrimario = "flex-1 py-2.5 bg-accent text-white rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
const btnSecundario = "flex-1 py-2.5 bg-surface-2 border border-border text-text-secondary rounded-xl text-sm hover:border-text-secondary transition-colors";
