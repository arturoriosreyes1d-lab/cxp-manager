import React, { useState, useMemo } from "react";

/**
 * Modal de gestión de Egresos No Facturados (NF).
 * Muestra KPIs, mini-gráfica por clasificación, búsqueda libre y tabla ordenable.
 *
 * Props:
 * - egresos: array de invoices con tipo === 'EgresoNF' de la empresa actual
 * - payments: array de pagos (para calcular pagado vs programado)
 * - onClose: cerrar el modal
 * - onNuevo: abrir modal de captura individual
 * - onImportar: abrir modal de importación
 * - onEditar(egreso): abrir modal de edición con datos pre-llenados
 * - onPagos(egreso): abrir modal de pagos
 * - onEliminar(egreso): eliminar el egreso
 * - currency: moneda actual (MXN/USD/EUR)
 */
export default function EgresosNFModal({
  egresos = [],
  payments = [],
  onClose,
  onNuevo,
  onImportar,
  onEditar,
  onPagos,
  onEliminar,
  currency = "MXN",
}) {
  const [busqueda, setBusqueda] = useState("");
  const [sortCol, setSortCol] = useState("fecha");
  const [sortDir, setSortDir] = useState("desc");

  const fmt = (n) =>
    new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(+n || 0);
  const monedaSym = (m) => (m === "EUR" ? "€" : "$");

  // Helpers
  const today = () => new Date().toISOString().split("T")[0];
  const inicioMesActual = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  };

  // Calcular KPIs
  const kpis = useMemo(() => {
    const totalActivo = { MXN: 0, USD: 0, EUR: 0 };
    const programado = { MXN: 0, USD: 0, EUR: 0 };
    const pagadoMes = { MXN: 0, USD: 0, EUR: 0 };
    const inicioMes = inicioMesActual();
    const hoy = today();

    egresos.forEach((e) => {
      const moneda = e.moneda || "MXN";
      const saldo = (+e.total || 0) - (+e.montoPagado || 0);
      // Total activo = saldo pendiente
      if (saldo > 0) totalActivo[moneda] += saldo;
      // Programado a futuro = pagos programados con fecha > hoy
      payments
        .filter((p) => p.invoiceId === e.id && p.tipo === "programado" && p.fechaPago > hoy)
        .forEach((p) => (programado[moneda] += +p.monto || 0));
      // Pagado este mes = pagos realizados con fecha en el mes actual
      payments
        .filter((p) => p.invoiceId === e.id && p.tipo === "realizado" && p.fechaPago >= inicioMes)
        .forEach((p) => (pagadoMes[moneda] += +p.monto || 0));
    });

    return { totalActivo, programado, pagadoMes, total: egresos.length };
  }, [egresos, payments]);

  // Distribución por Clasificación (para barra)
  const distribClasif = useMemo(() => {
    const map = {};
    egresos.forEach((e) => {
      const clasif = e.categoriaEgreso || e.clasificacion || "Sin clasificar";
      const moneda = e.moneda || "MXN";
      if (moneda !== currency) return; // solo de la moneda activa
      const total = +e.total || 0;
      map[clasif] = (map[clasif] || 0) + total;
    });
    const arr = Object.entries(map)
      .map(([clasif, monto]) => ({ clasif, monto }))
      .sort((a, b) => b.monto - a.monto);
    const total = arr.reduce((s, x) => s + x.monto, 0);
    return arr.map((x) => ({ ...x, pct: total > 0 ? (x.monto / total) * 100 : 0 }));
  }, [egresos, currency]);

  // Filtrar y ordenar
  const filtrados = useMemo(() => {
    let result = egresos.filter((e) => (e.moneda || "MXN") === currency);
    // Filtro búsqueda libre
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase().trim();
      result = result.filter((e) => {
        const concepto = (e.concepto || "").toLowerCase();
        const proveedor = (e.proveedor || "").toLowerCase();
        const segmento = (e.segmentoEgreso || "").toLowerCase();
        const folio = (e.folio || "").toLowerCase();
        const notas = (e.notas || "").toLowerCase();
        const clasif = (e.categoriaEgreso || e.clasificacion || "").toLowerCase();
        const total = String(e.total || "");
        return (
          concepto.includes(q) ||
          proveedor.includes(q) ||
          segmento.includes(q) ||
          folio.includes(q) ||
          notas.includes(q) ||
          clasif.includes(q) ||
          total.includes(q)
        );
      });
    }
    // Ordenamiento
    const dir = sortDir === "asc" ? 1 : -1;
    result.sort((a, b) => {
      let av, bv;
      switch (sortCol) {
        case "fecha":
          av = a.fecha || "";
          bv = b.fecha || "";
          return av.localeCompare(bv) * dir;
        case "folio":
          av = a.folio || "";
          bv = b.folio || "";
          return av.localeCompare(bv) * dir;
        case "concepto":
          av = a.concepto || "";
          bv = b.concepto || "";
          return av.localeCompare(bv) * dir;
        case "clasificacion":
          av = a.categoriaEgreso || a.clasificacion || "";
          bv = b.categoriaEgreso || b.clasificacion || "";
          return av.localeCompare(bv) * dir;
        case "segmento":
          av = a.segmentoEgreso || "";
          bv = b.segmentoEgreso || "";
          return av.localeCompare(bv) * dir;
        case "total":
          return ((+a.total || 0) - (+b.total || 0)) * dir;
        case "estatus":
          av = a.estatus || "";
          bv = b.estatus || "";
          return av.localeCompare(bv) * dir;
        default:
          return 0;
      }
    });
    return result;
  }, [egresos, busqueda, sortCol, sortDir, currency]);

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(col);
      setSortDir("desc");
    }
  };
  const sortIcon = (col) => (sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  const colorClasif = ["#C62828", "#AD1457", "#6A1B9A", "#4527A0", "#283593", "#1565C0", "#00838F", "#2E7D32", "#558B2F", "#9E9D24", "#EF6C00", "#D84315"];

  const estadoMeta = {
    Pagado: { bg: "#E8F5E9", color: "#1B5E20", icon: "✅" },
    Pendiente: { bg: "#FFF8E1", color: "#E65100", icon: "📅" },
    Parcial: { bg: "#E3F2FD", color: "#1565C0", icon: "🔵" },
    Vencido: { bg: "#FFEBEE", color: "#C62828", icon: "⚠️" },
  };

  const inputStyle = {
    width: "100%",
    padding: "8px 12px",
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  };

  const btnPrimary = {
    background: "#C62828",
    color: "#fff",
    border: "none",
    padding: "8px 16px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  };

  const btnSecondary = {
    background: "#1976D2",
    color: "#fff",
    border: "none",
    padding: "8px 16px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          width: "97%",
          maxWidth: 1600,
          maxHeight: "94vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "16px 22px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FFF8F8" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#C62828" }}>💵 Otros Pagos</h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6B7280" }}>
              Pagos como nómina, comisiones, impuestos, etc. que no tienen factura formal
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", fontSize: 22, cursor: "pointer", color: "#6B7280", padding: 4 }}
            title="Cerrar"
          >
            ×
          </button>
        </div>

        {/* Body scrollable */}
        <div style={{ overflow: "auto", padding: 18, flex: 1, background: "#FAFBFC" }}>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 18 }}>
            <div style={{ background: "#fff", border: "1px solid #FFCDD2", borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#C62828", letterSpacing: 0.5 }}>📊 TOTAL ACTIVO {currency}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#C62828", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                {monedaSym(currency)}{fmt(kpis.totalActivo[currency])}
              </div>
              <div style={{ fontSize: 10, color: "#9E9E9E", marginTop: 2 }}>Saldo pendiente de pagar</div>
            </div>
            <div style={{ background: "#fff", border: "1px solid #A5D6A7", borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#1B5E20", letterSpacing: 0.5 }}>💰 PAGADO ESTE MES</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#1B5E20", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                {monedaSym(currency)}{fmt(kpis.pagadoMes[currency])}
              </div>
              <div style={{ fontSize: 10, color: "#9E9E9E", marginTop: 2 }}>Pagos realizados este mes</div>
            </div>
            <div style={{ background: "#fff", border: "1px solid #FFE082", borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#F57F17", letterSpacing: 0.5 }}>📅 PROGRAMADO A FUTURO</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#F57F17", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                {monedaSym(currency)}{fmt(kpis.programado[currency])}
              </div>
              <div style={{ fontSize: 10, color: "#9E9E9E", marginTop: 2 }}>Pagos programados pendientes</div>
            </div>
            <div style={{ background: "#fff", border: "1px solid #B0BEC5", borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#37474F", letterSpacing: 0.5 }}>📈 TOTAL REGISTROS</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#37474F", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                {kpis.total}
              </div>
              <div style={{ fontSize: 10, color: "#9E9E9E", marginTop: 2 }}>Otros pagos totales</div>
            </div>
          </div>

          {/* Distribución por Clasificación */}
          {distribClasif.length > 0 && (
            <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: 14, marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1A237E", marginBottom: 10, letterSpacing: 0.3 }}>
                📊 DISTRIBUCIÓN POR CLASIFICACIÓN ({currency})
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {distribClasif.slice(0, 8).map((d, i) => (
                  <div key={d.clasif} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11 }}>
                    <div style={{ minWidth: 140, fontWeight: 600, color: "#374151" }}>{d.clasif}</div>
                    <div style={{ flex: 1, background: "#F3F4F6", borderRadius: 4, height: 18, position: "relative", overflow: "hidden" }}>
                      <div style={{
                        background: colorClasif[i % colorClasif.length],
                        height: "100%",
                        width: `${d.pct}%`,
                        transition: "width 0.3s",
                        borderRadius: 4,
                      }}/>
                    </div>
                    <div style={{ minWidth: 120, textAlign: "right", fontWeight: 700, color: colorClasif[i % colorClasif.length], fontVariantNumeric: "tabular-nums" }}>
                      {monedaSym(currency)}{fmt(d.monto)}
                    </div>
                    <div style={{ minWidth: 50, textAlign: "right", color: "#9E9E9E", fontSize: 10 }}>
                      {d.pct.toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Toolbar: acciones + búsqueda */}
          <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={onNuevo} style={btnPrimary}>+ Nuevo Otro Pago</button>
            <button onClick={onImportar} style={btnSecondary}>📥 Importar Excel</button>
            <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="🔍 Buscar por concepto, folio, segmento, notas, monto..."
                style={inputStyle}
              />
            </div>
            <div style={{ fontSize: 12, color: "#6B7280", whiteSpace: "nowrap" }}>
              {filtrados.length} de {egresos.filter(e => (e.moneda || "MXN") === currency).length} {currency}
            </div>
          </div>

          {/* Tabla */}
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  {[
                    { k: "fecha", label: "Fecha", align: "left", w: 100 },
                    { k: "folio", label: "Folio", align: "left", w: 90 },
                    { k: "concepto", label: "Concepto", align: "left" },
                    { k: "clasificacion", label: "Clasificación", align: "left", w: 130 },
                    { k: "segmento", label: "Segmento", align: "left", w: 110 },
                    { k: "total", label: "Monto", align: "right", w: 130 },
                    { k: "estatus", label: "Estado", align: "center", w: 110 },
                  ].map((h) => (
                    <th
                      key={h.k}
                      onClick={() => toggleSort(h.k)}
                      style={{
                        padding: "10px 12px",
                        textAlign: h.align,
                        color: "#1A237E",
                        fontWeight: 700,
                        fontSize: 11,
                        textTransform: "uppercase",
                        borderBottom: "2px solid #E5E7EB",
                        cursor: "pointer",
                        userSelect: "none",
                        width: h.w,
                        background: sortCol === h.k ? "#E3F2FD" : "transparent",
                      }}
                    >
                      {h.label}
                      {sortIcon(h.k)}
                    </th>
                  ))}
                  <th style={{ padding: "10px 12px", borderBottom: "2px solid #E5E7EB", width: 110, textAlign: "center", color: "#1A237E", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "32px 16px", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
                      {busqueda ? `No se encontraron egresos NF que coincidan con "${busqueda}"` : "No hay egresos no facturados registrados aún"}
                      <div style={{ marginTop: 10 }}>
                        <button onClick={onNuevo} style={{ ...btnPrimary, fontSize: 12 }}>+ Crear el primer Otro Pago</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtrados.map((e, i) => {
                    const meta = estadoMeta[e.estatus] || { bg: "#F5F5F5", color: "#666", icon: "•" };
                    const moneda = e.moneda || "MXN";
                    return (
                      <tr key={e.id} style={{ borderBottom: "1px solid #F3F4F6", background: i % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                        <td style={{ padding: "9px 12px", whiteSpace: "nowrap", color: "#374151" }}>{e.fecha}</td>
                        <td style={{ padding: "9px 12px", fontFamily: "monospace", fontWeight: 700, color: "#C62828", fontSize: 11 }}>
                          {e.folio}
                        </td>
                        <td style={{ padding: "9px 12px", fontWeight: 600, color: "#1F2937" }}>
                          <div>{e.concepto || e.proveedor || "—"}</div>
                          {e.notas && (
                            <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>{e.notas}</div>
                          )}
                        </td>
                        <td style={{ padding: "9px 12px", color: "#6B7280" }}>
                          {e.categoriaEgreso || e.clasificacion ? (
                            <span style={{ background: "#FCE4EC", color: "#AD1457", padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700 }}>
                              {e.categoriaEgreso || e.clasificacion}
                            </span>
                          ) : (
                            <span style={{ color: "#D1D5DB" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "9px 12px", color: "#6B7280" }}>
                          {e.segmentoEgreso || <span style={{ color: "#D1D5DB" }}>—</span>}
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 800, color: "#C62828", fontFamily: "monospace", fontVariantNumeric: "tabular-nums" }}>
                          {monedaSym(moneda)}{fmt(e.total)}
                          {(+e.montoPagado || 0) > 0 && (+e.montoPagado || 0) < (+e.total || 0) && (
                            <div style={{ fontSize: 10, color: "#1565C0", fontWeight: 600, marginTop: 2 }}>
                              Pag: {monedaSym(moneda)}{fmt(e.montoPagado)}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "center" }}>
                          <span style={{ background: meta.bg, color: meta.color, padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                            {meta.icon} {e.estatus}
                          </span>
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "center", whiteSpace: "nowrap" }}>
                          <button
                            onClick={() => onEditar && onEditar(e)}
                            title="Editar"
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 4, color: "#1976D2" }}
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => onPagos && onPagos(e)}
                            title="Aplicar pagos"
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 4, color: "#2E7D32" }}
                          >
                            💰
                          </button>
                          <button
                            onClick={() => onEliminar && onEliminar(e)}
                            title="Eliminar"
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 4, color: "#C62828" }}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filtrados.length > 0 && (
                <tfoot>
                  <tr style={{ background: "#FFEBEE", borderTop: "2px solid #C62828" }}>
                    <td colSpan={5} style={{ padding: "10px 12px", fontWeight: 700, color: "#C62828", fontSize: 12 }}>
                      TOTAL ({filtrados.length} {filtrados.length === 1 ? "registro" : "registros"})
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, color: "#C62828", fontFamily: "monospace", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>
                      {monedaSym(currency)}{fmt(filtrados.reduce((s, e) => s + (+e.total || 0), 0))}
                    </td>
                    <td colSpan={2}/>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
