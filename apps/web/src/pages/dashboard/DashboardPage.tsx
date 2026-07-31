import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KpiCard, Badge } from "@niagara/ui";
import { useAuthStore } from "@/stores/authStore";
import { api } from "@/lib/apiClient";
import { socket } from "@/lib/socketClient";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface KpisResponse {
  evento: {
    id: string;
    nombre: string;
    estado: string;
    capacidad: number;
    fechaInicio: string;
  };
  kpis: {
    aforoActual: number;
    aforoMaximo: number;
    porcentajeAforo: number;
    totalIngresos: number;
    totalEgresos: number;
    ventasBarra: { total: number; cantidad: number };
    boleteria: { total: number; cantidad: number };
    recaudacionTotal: number;
  };
}

interface AccesoFeed {
  id: string;
  tipo: "ingreso" | "egreso";
  metodo: string;
  createdAt: string;
  clienteNombre?: string | null;
  entradaTipo?: string;
}

/** Recaudación de un cajero, tal como la devuelve GET /reportes/por-cajero */
interface RecaudacionCajero {
  staffId: string;
  nombre: string;
  rol: string;
  barra: string | null;
  cantidadVentas: number;
  total: number;
  porMetodo: Record<string, { cantidad: number; monto: number }>;
}

/**
 * Dashboard principal con KPIs en tiempo real.
 * Usa Socket.io para aforo y ventas en vivo.
 */
export function DashboardPage() {
  const { staff } = useAuthStore();
  const queryClient = useQueryClient();
  const [aforoActual, setAforoActual] = useState<number | null>(null);
  const [feedAccesos, setFeedAccesos] = useState<AccesoFeed[]>([]);

  const localId = staff?.localId;

  // KPIs del evento activo
  const { data: kpisData, isLoading } = useQuery({
    queryKey: ["dashboard-kpis", localId],
    queryFn: () => api.get<KpisResponse>("/dashboard/kpis", localId),
    enabled: !!localId,
    refetchInterval: 60_000, // fallback polling cada 60s
  });

  // Inicializar aforo desde la respuesta HTTP
  useEffect(() => {
    if (kpisData?.kpis.aforoActual !== undefined) {
      setAforoActual(kpisData.kpis.aforoActual);
    }
  }, [kpisData]);

  // Suscribirse a eventos Socket.io
  useEffect(() => {
    if (!localId) return;

    // Aforo actualizado en tiempo real
    const onAforoActualizado = (data: { eventoId: string; aforoActual: number }) => {
      if (kpisData?.evento?.id === data.eventoId) {
        setAforoActual(data.aforoActual);
      }
    };

    // Nueva venta → refrescar KPIs y la recaudación por cajero
    const onVentaNueva = () => {
      void queryClient.invalidateQueries({ queryKey: ["dashboard-kpis", localId] });
      void queryClient.invalidateQueries({ queryKey: ["recaudacion-cajeros", localId] });
    };

    // Cambio de estado de evento → refrescar todo
    const onEstadoCambiado = () => {
      void queryClient.invalidateQueries({ queryKey: ["dashboard-kpis", localId] });
    };

    // Ingreso en la puerta → al feed. Se cortan en 20 para no acumular
    // memoria durante una noche entera.
    const onAccesoNuevo = (data: {
      tipo: "ingreso" | "egreso";
      metodo: string;
      clienteNombre: string | null;
      entradaTipo?: string;
      createdAt: string;
    }) => {
      setFeedAccesos((previos) =>
        [
          {
            id: `${data.createdAt}-${Math.random().toString(36).slice(2, 8)}`,
            tipo: data.tipo,
            metodo: data.metodo,
            createdAt: data.createdAt,
            clienteNombre: data.clienteNombre,
            ...(data.entradaTipo !== undefined && { entradaTipo: data.entradaTipo }),
          },
          ...previos,
        ].slice(0, 20)
      );
    };

    socket.on("aforo:actualizado", onAforoActualizado);
    socket.on("venta:nueva", onVentaNueva);
    socket.on("evento:estado_cambiado", onEstadoCambiado);
    socket.on("acceso:nuevo", onAccesoNuevo);

    return () => {
      socket.off("aforo:actualizado", onAforoActualizado);
      socket.off("venta:nueva", onVentaNueva);
      socket.off("evento:estado_cambiado", onEstadoCambiado);
      socket.off("acceso:nuevo", onAccesoNuevo);
    };
  }, [localId, kpisData?.evento?.id, queryClient]);

  // Recaudación por cajero — es lo que se mira desde la oficina para saber
  // cómo va cada puesto de la barra.
  const { data: recaudacion } = useQuery({
    queryKey: ["recaudacion-cajeros", localId],
    queryFn: () =>
      api.get<{ cajeros: RecaudacionCajero[]; totalGeneral: number }>(
        `/reportes/por-cajero${kpisData?.evento?.id ? `?eventoId=${kpisData.evento.id}` : ""}`,
        localId
      ),
    enabled: !!localId,
    refetchInterval: 60_000,
  });

  // Formatear moneda ARS
  const formatPesos = (monto: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(monto);

  const aforo = aforoActual ?? kpisData?.kpis.aforoActual ?? 0;
  const aforoMax = kpisData?.kpis.aforoMaximo ?? 0;
  const pctAforo = aforoMax > 0 ? Math.round((aforo / aforoMax) * 100) : 0;
  const eventoActivo = kpisData?.evento;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-lime border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-text-primary">Dashboard</h1>
          {eventoActivo ? (
            <div className="flex items-center gap-2 mt-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-lime" />
              </span>
              <p className="text-text-secondary text-sm">
                {eventoActivo.nombre} · En vivo
              </p>
            </div>
          ) : (
            <p className="text-text-muted text-sm mt-1">Sin evento activo</p>
          )}
        </div>
        <Badge variante={eventoActivo ? "lime" : "neutral"}>
          {eventoActivo ? "En vivo" : "Sin evento"}
        </Badge>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          titulo="Aforo actual"
          valor={aforo}
          subtitulo={`de ${aforoMax} máx.`}
          acento={pctAforo >= 90 ? "danger" : pctAforo >= 70 ? "warning" : "lime"}
          enVivo={!!eventoActivo}
          icono="🚪"
        />
        <KpiCard
          titulo="% Capacidad"
          valor={`${pctAforo}%`}
          subtitulo={pctAforo >= 90 ? "¡Casi lleno!" : undefined}
          acento={pctAforo >= 90 ? "danger" : "lime"}
          icono="📊"
        />
        <KpiCard
          titulo="Recaudación total"
          valor={formatPesos(kpisData?.kpis.recaudacionTotal ?? 0)}
          subtitulo={`${kpisData?.kpis.ventasBarra.cantidad ?? 0} transacciones`}
          acento="lime"
          icono="💰"
        />
        <KpiCard
          titulo="Entradas vendidas"
          valor={kpisData?.kpis.boleteria.cantidad ?? 0}
          subtitulo={formatPesos(kpisData?.kpis.boleteria.total ?? 0)}
          acento="purple"
          icono="🎟️"
        />
      </div>

      {/* Barra de aforo visual */}
      {eventoActivo && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-text-secondary">
              Aforo en tiempo real
            </span>
            <span className="text-sm font-bold text-text-primary">
              {aforo} / {aforoMax}
            </span>
          </div>
          <div className="h-4 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(pctAforo, 100)}%`,
                backgroundColor:
                  pctAforo >= 90 ? "#EF4444" :
                  pctAforo >= 70 ? "#F59E0B" :
                  "#C2FF00",
              }}
            />
          </div>
        </div>
      )}

      {/* Desglose + Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recaudación por tipo */}
        <div className="card">
          <h3 className="text-sm font-semibold text-text-secondary mb-4">
            Recaudación por tipo
          </h3>
          <div className="flex flex-col gap-3">
            {[
              { label: "🍺 Barra", monto: kpisData?.kpis.ventasBarra.total ?? 0 },
              { label: "🎟️ Boletería", monto: kpisData?.kpis.boleteria.total ?? 0 },
            ].map(({ label, monto }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">{label}</span>
                <span className="text-sm font-bold text-text-primary">
                  {formatPesos(monto)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recaudación por cajero — lo que se mira desde la oficina */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-secondary">
              Recaudación por cajero
            </h3>
            {recaudacion && recaudacion.cajeros.length > 0 && (
              <span className="text-xs font-bold text-lime">
                {formatPesos(recaudacion.totalGeneral)}
              </span>
            )}
          </div>

          {!recaudacion || recaudacion.cajeros.length === 0 ? (
            <p className="text-text-muted text-sm">Sin ventas registradas todavía</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {recaudacion.cajeros.map((c) => {
                const efectivo = c.porMetodo["efectivo"]?.monto ?? 0;
                const porcentaje =
                  recaudacion.totalGeneral > 0
                    ? (c.total / recaudacion.totalGeneral) * 100
                    : 0;

                return (
                  <li key={c.staffId} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-primary truncate">
                          {c.nombre}
                        </p>
                        <p className="text-xs text-text-muted">
                          {c.barra ?? "Sin barra"} · {c.cantidadVentas} venta
                          {c.cantidadVentas === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-text-primary">
                          {formatPesos(c.total)}
                        </p>
                        {/* El efectivo se destaca porque es lo único que
                            después hay que contar contra la caja física. */}
                        {efectivo > 0 && (
                          <p className="text-xs text-warning">
                            {formatPesos(efectivo)} en efectivo
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="h-1 rounded-full bg-surface-2 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-lime transition-all duration-500"
                        style={{ width: `${porcentaje}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Feed de últimos accesos (en tiempo real via Socket.io) */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-secondary">
              Últimos accesos
            </h3>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-lime" />
            </span>
          </div>

          {feedAccesos.length === 0 ? (
            <p className="text-text-muted text-sm">Sin movimientos aún</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {feedAccesos.map((acceso) => (
                <li
                  key={acceso.id}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-bold ${
                        acceso.tipo === "ingreso" ? "text-lime" : "text-danger"
                      }`}
                    >
                      {acceso.tipo === "ingreso" ? "▲ ENTRA" : "▼ SALE"}
                    </span>
                    <span className="text-xs text-text-muted">{acceso.metodo}</span>
                  </div>
                  <span className="text-xs text-text-muted">
                    {format(new Date(acceso.createdAt), "HH:mm:ss", { locale: es })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Estado vacío */}
      {!eventoActivo && !isLoading && (
        <div className="card text-center py-12">
          <div className="text-4xl mb-4">🎉</div>
          <h3 className="text-lg font-bold text-text-primary mb-2">
            No hay evento activo
          </h3>
          <p className="text-text-secondary text-sm">
            Activá un evento desde la sección Eventos para ver el dashboard en tiempo real.
          </p>
        </div>
      )}
    </div>
  );
}
