/**
 * Carta — alta, edición y baja de productos.
 *
 * Es lo que ve el cajero en la caja: cambiar un precio acá cambia lo que se
 * cobra en la próxima venta. Por eso no hay guardado automático, y la baja
 * pide confirmación.
 *
 * La baja es lógica: el producto deja de aparecer en la caja pero sigue en la
 * base, porque las ventas viejas lo referencian y los reportes históricos
 * quedarían con huecos si desapareciera.
 */

import React, { useEffect, useMemo, useState } from "react";
import { cn } from "@niagara/ui";
import {
  useProductosStore,
  type Producto,
  type DatosProducto,
} from "@/stores/productosStore";
import { useAuthStore } from "@/stores/authStore";
import { Icono } from "@/components/Icono";

const ARS = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);

export function ProductosPage() {
  const {
    productos, categorias, cargando, error,
    cargar, darDeBaja, reactivar, limpiarError, procesando,
  } = useProductosStore();

  const { staff } = useAuthStore();
  const puedeEditar = staff?.rol === "admin" || staff?.rol === "encargado";
  const esAdmin = staff?.rol === "admin";

  const [verInactivos, setVerInactivos] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [modal, setModal] = useState<{ producto: Producto | null } | null>(null);
  const [confirmarBaja, setConfirmarBaja] = useState<Producto | null>(null);

  useEffect(() => {
    void cargar(verInactivos);
  }, [cargar, verInactivos]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) || p.categoria.toLowerCase().includes(q)
    );
  }, [productos, busqueda]);

  // Agrupadas para que se lea como una carta y no como una planilla suelta.
  const porCategoria = useMemo(() => {
    const mapa = new Map<string, Producto[]>();
    for (const p of filtrados) {
      const lista = mapa.get(p.categoria) ?? [];
      lista.push(p);
      mapa.set(p.categoria, lista);
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b, "es"));
  }, [filtrados]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Carta</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {productos.filter((p) => p.activo).length} productos a la venta
          </p>
        </div>

        {puedeEditar && (
          <button
            onClick={() => setModal({ producto: null })}
            className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:brightness-110 transition-all inline-flex items-center gap-1.5"
          >
            <Icono nombre="agregar" tamano={16} />
            Nuevo producto
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl px-4 py-3 flex items-start justify-between gap-4 border border-danger/30 bg-danger/10 text-sm text-danger">
          <p>{error}</p>
          <button onClick={limpiarError} className="hover:opacity-70" aria-label="Cerrar">
            <Icono nombre="cerrar" tamano={16} />
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
            <Icono nombre="buscar" tamano={16} />
          </span>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o categoría…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-surface-2 border border-border text-text-primary text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={verInactivos}
            onChange={(e) => setVerInactivos(e.target.checked)}
            className="accent-accent"
          />
          Ver dados de baja
        </label>
      </div>

      {cargando ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-16 bg-surface rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      ) : porCategoria.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center">
          <Icono nombre="producto" tamano={40} className="mx-auto mb-3 text-text-muted" />
          <p className="text-text-primary font-semibold">
            {busqueda ? "Ningún producto coincide" : "La carta está vacía"}
          </p>
          <p className="text-sm text-text-secondary mt-2">
            {busqueda
              ? "Probá con otro nombre o categoría."
              : "Agregá el primer producto para que aparezca en la caja."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {porCategoria.map(([categoria, items]) => (
            <div key={categoria}>
              <p className="text-xs uppercase tracking-wider text-text-secondary mb-2">
                {categoria}
              </p>
              <div className="flex flex-col gap-2">
                {items.map((p) => (
                  <div
                    key={p.id}
                    className={cn(
                      "bg-surface border border-border rounded-xl px-4 py-3",
                      "flex items-center gap-4",
                      !p.activo && "opacity-50"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-text-primary">
                          {p.nombre}
                        </span>
                        {!p.activo && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 border border-border text-text-secondary">
                            Dado de baja
                          </span>
                        )}
                      </div>
                      {p.descripcion && (
                        <p className="text-xs text-text-secondary mt-0.5 truncate">
                          {p.descripcion}
                        </p>
                      )}
                      {p.costo !== null && (
                        <p className="text-xs text-text-muted mt-0.5">
                          Costo {ARS(p.costo)} · Margen {ARS(p.precio - p.costo)}
                        </p>
                      )}
                    </div>

                    <span className="text-sm font-bold text-accent flex-shrink-0">
                      {ARS(p.precio)}
                    </span>

                    {puedeEditar && (
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => setModal({ producto: p })}
                          className="px-2.5 py-1 rounded-lg text-xs text-text-secondary hover:text-accent border border-transparent hover:border-accent/40 transition-all"
                        >
                          Editar
                        </button>
                        {esAdmin && (
                          p.activo ? (
                            <button
                              onClick={() => setConfirmarBaja(p)}
                              className="px-2.5 py-1 rounded-lg text-xs text-text-secondary hover:text-danger border border-transparent hover:border-danger/40 transition-all"
                            >
                              Dar de baja
                            </button>
                          ) : (
                            <button
                              onClick={() => void reactivar(p.id)}
                              disabled={procesando}
                              className="px-2.5 py-1 rounded-lg text-xs text-text-secondary hover:text-success border border-transparent hover:border-success/40 transition-all disabled:opacity-40"
                            >
                              Reactivar
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <ModalProducto
          producto={modal.producto}
          categorias={categorias}
          onCerrar={() => setModal(null)}
        />
      )}

      {confirmarBaja && (
        <ModalConfirmarBaja
          producto={confirmarBaja}
          procesando={procesando}
          onCancelar={() => setConfirmarBaja(null)}
          onConfirmar={async () => {
            const ok = await darDeBaja(confirmarBaja.id);
            if (ok) setConfirmarBaja(null);
          }}
        />
      )}
    </div>
  );
}

// ── Modal de alta / edición ──────────────────────────────────────

function ModalProducto({
  producto,
  categorias,
  onCerrar,
}: {
  producto: Producto | null;
  categorias: string[];
  onCerrar: () => void;
}) {
  const { crear, editar, procesando } = useProductosStore();
  const esEdicion = producto !== null;

  const [nombre, setNombre] = useState(producto?.nombre ?? "");
  const [categoria, setCategoria] = useState(producto?.categoria ?? "");
  const [precio, setPrecio] = useState(producto ? String(producto.precio) : "");
  const [costo, setCosto] = useState(
    producto?.costo != null ? String(producto.costo) : ""
  );
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? "");

  const precioNum = Number(precio);
  const costoNum = costo.trim() === "" ? null : Number(costo);

  const valido =
    nombre.trim().length >= 2 &&
    categoria.trim().length >= 2 &&
    Number.isFinite(precioNum) &&
    precioNum > 0 &&
    (costoNum === null || (Number.isFinite(costoNum) && costoNum > 0));

  // Vender por debajo del costo no se bloquea —puede ser una promoción— pero se
  // avisa, porque casi siempre es un dedo mal puesto.
  const pierdePlata = costoNum !== null && costoNum > precioNum;

  const guardar = async () => {
    if (!valido) return;

    const datos: DatosProducto = {
      nombre: nombre.trim(),
      categoria: categoria.trim(),
      precio: precioNum,
      ...(descripcion.trim() && { descripcion: descripcion.trim() }),
      ...(costoNum !== null && { costo: costoNum }),
    };

    const ok = esEdicion && producto
      ? await editar(producto.id, datos)
      : await crear(datos);

    if (ok) onCerrar();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCerrar} />

      <div className="relative w-full max-w-md bg-surface border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary">
            {esEdicion ? "Editar producto" : "Nuevo producto"}
          </h2>
          <button
            onClick={onCerrar}
            className="text-text-secondary hover:text-text-primary"
            aria-label="Cerrar"
          >
            <Icono nombre="cerrar" tamano={18} />
          </button>
        </div>

        <div>
          <label className="text-xs text-text-secondary uppercase tracking-wider">
            Nombre *
          </label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Fernet con Coca"
            autoFocus
            className={inputCls}
          />
        </div>

        <div>
          <label className="text-xs text-text-secondary uppercase tracking-wider">
            Categoría *
          </label>
          {/* Lista con sugerencias pero escribible: agregar una categoría nueva
              no tiene que obligar a pasar por otra pantalla. */}
          <input
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            placeholder="Tragos"
            list="categorias-existentes"
            className={inputCls}
          />
          <datalist id="categorias-existentes">
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-secondary uppercase tracking-wider">
              Precio *
            </label>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              placeholder="0"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary uppercase tracking-wider">
              Costo
            </label>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
              placeholder="Opcional"
              className={inputCls}
            />
          </div>
        </div>

        {pierdePlata && (
          <p className="text-xs text-warning">
            El costo es mayor que el precio de venta. Si no es una promoción,
            revisá los números.
          </p>
        )}

        <div>
          <label className="text-xs text-text-secondary uppercase tracking-wider">
            Descripción
          </label>
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Opcional"
            className={inputCls}
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={onCerrar}
            className="flex-1 py-2.5 rounded-xl border border-border text-text-secondary text-sm hover:border-text-secondary transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => void guardar()}
            disabled={!valido || procesando}
            className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {procesando ? "Guardando…" : esEdicion ? "Guardar cambios" : "Crear producto"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirmación de baja ─────────────────────────────────────────

function ModalConfirmarBaja({
  producto,
  procesando,
  onCancelar,
  onConfirmar,
}: {
  producto: Producto;
  procesando: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancelar} />

      <div className="relative w-full max-w-sm bg-surface border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Icono nombre="alerta" tamano={24} className="text-warning flex-shrink-0" />
          <h2 className="text-base font-bold text-text-primary">
            Dar de baja {producto.nombre}
          </h2>
        </div>

        <p className="text-sm text-text-secondary">
          Deja de aparecer en la caja, pero las ventas ya hechas siguen contando
          en los reportes. Se puede volver a activar después.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancelar}
            className="flex-1 py-2.5 rounded-xl border border-border text-text-secondary text-sm hover:border-text-secondary transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            disabled={procesando}
            className="flex-1 py-2.5 rounded-xl bg-danger text-white text-sm font-bold hover:brightness-110 disabled:opacity-50 transition-all"
          >
            {procesando ? "Dando de baja…" : "Dar de baja"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "mt-1 w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-text-primary text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors";
