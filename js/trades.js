/* ============================================================
   TRADES - CRUD de operaciones
   ============================================================ */

import { generarId, escapeHtml, formatMoney, formatPct, formatR, obtenerMomentoEntrada } from './utils.js';
import { 
  getOperaciones, setOperaciones, persistirOperaciones, 
  generarSiguienteIdTrade, persistirContadorTrades,
  getCuentas
} from './storage.js';
import { actualizarDashboard } from './dashboard.js';
import { 
  guardarTradeSupabase, 
  actualizarTradeSupabase, 
  eliminarTradeSupabase,
  cargarTradesDesdeSupabase 
} from './supabase.js';
import { getCuentas as getCuentasList } from './storage.js';
import { showToast } from './ui.js';

// --- Variables de estado ---
let editingId = null;
let imagenTemporal = null;

// --- Calcular operación ---
export function calcularOperacion(datos) {
  const resultado = {
    pnl: null,
    pnlNeto: null,
    riesgoDinero: null,
    rewardDinero: null,
    rrPlanificado: null,
    rMultiple: null,
    resultadoPct: null,
    estado: null
  };

  if (datos.estadoTrade === 'Abierto') {
    resultado.estado = 'Abierto';
    return resultado;
  }

  const entrada = parseFloat(datos.precioEntrada);
  const salida = parseFloat(datos.precioSalida);
  const tamano = parseFloat(datos.tamanoPosicion);
  const direccion = datos.direccion;

  let comisionFinal;
  if (datos.comisionApertura !== undefined || datos.comisionCierre !== undefined || datos.costoAdicional !== undefined) {
    const comisionApertura = parseFloat(datos.comisionApertura) || 0;
    const comisionCierre = parseFloat(datos.comisionCierre) || 0;
    const costoAdicional = parseFloat(datos.costoAdicional) || 0;
    comisionFinal = comisionApertura + comisionCierre + costoAdicional;
  } else {
    const comisionVal = parseFloat(datos.comision);
    comisionFinal = isNaN(comisionVal) ? 0 : comisionVal;
  }

  if (isNaN(entrada) || entrada === 0 || isNaN(salida) || isNaN(tamano) || tamano === 0) {
    return resultado;
  }

  const cantidad = tamano / entrada;
  const variacion = (direccion === 'Venta') ? (entrada - salida) : (salida - entrada);

  const pnl = cantidad * variacion;
  const pnlNeto = pnl - comisionFinal;

  resultado.pnl = pnl;
  resultado.pnlNeto = pnlNeto;
  resultado.resultadoPct = (pnlNeto / tamano) * 100;

  if (pnlNeto === 0) { resultado.estado = 'Break Even'; }
  else if (pnlNeto > 0) { resultado.estado = 'Ganadora'; }
  else { resultado.estado = 'Perdedora'; }

  const stopLoss = parseFloat(datos.stopLoss);
  if (datos.stopLoss !== '' && datos.stopLoss !== undefined && !isNaN(stopLoss)) {
    const riesgoUnitario = (direccion === 'Venta') ? (stopLoss - entrada) : (entrada - stopLoss);
    const riesgoDinero = Math.abs(cantidad * riesgoUnitario);
    resultado.riesgoDinero = riesgoDinero;

    if (riesgoDinero !== 0) {
      resultado.rMultiple = pnlNeto / riesgoDinero;
    }

    const takeProfit = parseFloat(datos.takeProfit);
    if (datos.takeProfit !== '' && datos.takeProfit !== undefined && !isNaN(takeProfit)) {
      const rewardUnitario = (direccion === 'Venta') ? (entrada - takeProfit) : (takeProfit - entrada);
      const rewardDinero = Math.abs(cantidad * rewardUnitario);
      resultado.rewardDinero = rewardDinero;

      if (riesgoDinero !== 0) {
        resultado.rrPlanificado = rewardDinero / riesgoDinero;
      }
    }
  }

  return resultado;
}

// --- Guardar operación ---
export async function guardarOperacion(data, resetFormCallback) {
  const completitud = verificarCompletitudRegistro(data);

  if (editingId) {
    await actualizarOperacion(editingId, data, resetFormCallback);
  } else {
    const nuevaOperacion = Object.assign(
      { id: generarId(), idTrade: generarSiguienteIdTrade() },
      data,
      { calculos: calcularOperacion(data) }
    );
    
    // 1. Guardar en LocalStorage (siempre)
    const ops = getOperaciones();
    ops.push(nuevaOperacion);
    setOperaciones(ops);
    await persistirContadorTrades();
    await persistirOperaciones();
    
    // 2. Guardar en Supabase (si falla, solo advierte)
    try {
      const resultado = await guardarTradeSupabase(nuevaOperacion);
      if (!resultado.success) {
        console.warn('⚠️ La operación se guardó en LocalStorage pero falló en Supabase:', resultado.error);
      } else {
        console.log('✅ Operación sincronizada con Supabase');
      }
    } catch (error) {
      console.warn('⚠️ Error al sincronizar con Supabase:', error);
    }
    
    renderTable();
    mostrarAvisoEstadoTrade(data);
    mostrarAvisoCompletitud(completitud);
    if (resetFormCallback) resetFormCallback();
  }
}

// --- Actualizar operación ---
export async function actualizarOperacion(id, data, resetFormCallback) {
  const ops = getOperaciones();
  const index = ops.findIndex(op => op.id === id);
  if (index === -1) return;
  const idTradeExistente = ops[index].idTrade;
  ops[index] = Object.assign({ id, idTrade: idTradeExistente }, data, { calculos: calcularOperacion(data) });
  setOperaciones(ops);
  
  await persistirOperaciones();
  renderTable();
  
  try {
    await actualizarTradeSupabase(id, ops[index]);
  } catch (error) {
    console.warn('⚠️ Error al sincronizar actualización con Supabase:', error);
  }
  
  const completitud = verificarCompletitudRegistro(data);
  mostrarAvisoEstadoTrade(data);
  mostrarAvisoCompletitud(completitud);
  if (resetFormCallback) resetFormCallback();
}

// --- Eliminar operación ---
export async function eliminarOperacion(id) {
  const ops = getOperaciones();
  setOperaciones(ops.filter(op => op.id !== id));
  await persistirOperaciones();
  renderTable();
  
  try {
    await eliminarTradeSupabase(id);
  } catch (error) {
    console.warn('⚠️ Error al sincronizar eliminación con Supabase:', error);
  }
  
  showToast('success', 'Operación eliminada', 'El registro se quitó de tu historial.');
  if (editingId === id) {
    editingId = null;
    document.getElementById('editModeBadge').style.display = 'none';
    document.getElementById('saveBtnLabel').textContent = 'Guardar operación';
  }
}

// --- Editar operación ---
export function editarOperacion(id, populateFormCallback) {
  const ops = getOperaciones();
  const op = ops.find(o => o.id === id);
  if (!op) return;
  editingId = id;
  establecerModoCierre(false);
  populateFormCallback(op);
  document.getElementById('editModeBadge').style.display = 'inline-flex';
  document.getElementById('saveBtnLabel').textContent = 'Actualizar operación';
  document.querySelector('.form-tab[data-tab="operacion"]').click();
  document.getElementById('nueva-operacion').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// --- Cerrar Trade ---
export function cerrarTrade(id, populateFormCallback) {
  editarOperacion(id, populateFormCallback);
  establecerModoCierre(true);
  const fechaSalidaEl = document.querySelector('[data-field="fechaSalida"]');
  if (fechaSalidaEl) fechaSalidaEl.focus();
}

// --- Renderizar tabla ---
export function renderTable() {
  const tbody = document.getElementById('operationsTableBody');
  const ops = getOperaciones();

  const filtroEstadoTradeEl = document.getElementById('filtroEstadoTrade');
  const filtroResultadoEl = document.getElementById('filtroResultado');
  const filtroEstadoTrade = filtroEstadoTradeEl ? filtroEstadoTradeEl.value : 'Todos';
  const filtroResultado = filtroResultadoEl ? filtroResultadoEl.value : 'Todos';

  let ordenadas = [...ops].sort((a, b) => obtenerMomentoEntrada(b) - obtenerMomentoEntrada(a));

  if (filtroEstadoTrade !== 'Todos') {
    ordenadas = ordenadas.filter(op => (op.estadoTrade || 'Cerrado') === filtroEstadoTrade);
  }
  if (filtroResultado !== 'Todos') {
    ordenadas = ordenadas.filter(op => op.calculos && op.calculos.estado === filtroResultado);
  }

  document.getElementById('operacionesCount').textContent = ops.length;

  const cuentasList = getCuentasList();

  actualizarDashboard(ops);

  if (ordenadas.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="11">${ops.length === 0 ? 'Aún no hay operaciones registradas. Usa el formulario de arriba para agregar la primera.' : 'Ningún Trade coincide con los filtros seleccionados.'}</td></tr>`;
    return;
  }

  tbody.innerHTML = ordenadas.map(op => {
    const direccionBadge = op.direccion === 'Compra'
      ? `<span class="badge success"><span class="badge-dot"></span>Compra</span>`
      : `<span class="badge danger"><span class="badge-dot"></span>Venta</span>`;

    const calc = op.calculos || {};
    const pnlClass = (calc.pnlNeto > 0) ? 'positive' : (calc.pnlNeto < 0) ? 'negative' : '';
    const rClass = (calc.rMultiple > 0) ? 'positive' : (calc.rMultiple < 0) ? 'negative' : '';
    const pctClass = (calc.resultadoPct > 0) ? 'positive' : (calc.resultadoPct < 0) ? 'negative' : '';

    const esAbierto = (op.estadoTrade || 'Cerrado') === 'Abierto';
    const estadoTradeBadge = esAbierto
      ? `<span class="badge gold"><span class="badge-dot"></span>🟡 Abierto</span>`
      : `<span class="badge info"><span class="badge-dot"></span>🔵 Cerrado</span>`;

    let resultadoBadge = `<span style="color: var(--color-text-muted);">Pendiente de cierre</span>`;
    if (calc.estado === 'Ganadora') resultadoBadge = `<span class="badge success"><span class="badge-dot"></span>Ganadora</span>`;
    else if (calc.estado === 'Perdedora') resultadoBadge = `<span class="badge danger"><span class="badge-dot"></span>Perdedora</span>`;
    else if (calc.estado === 'Break Even') resultadoBadge = `<span class="badge warning"><span class="badge-dot"></span>Break Even</span>`;
    else if (!esAbierto) resultadoBadge = `<span class="badge warning"><span class="badge-dot"></span>Sin datos</span>`;

    const filaClase = esAbierto ? 'trade-abierto' : '';

    const botonCerrar = esAbierto
      ? `<button class="btn-cerrar-trade" data-id="${op.id}" title="Cerrar Trade">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>
        </button>`
      : '';

    return `<tr data-row-id="${op.id}" class="${filaClase}">
      <td>${escapeHtml(op.idTrade || '—')}</td>
      <td>${escapeHtml(op.fecha || '—')}</td>
      <td>${escapeHtml(op.activo || '—')}</td>
      <td>${escapeHtml(op.mercado || '—')}</td>
      <td>${direccionBadge}</td>
      <td class="${pnlClass}">${formatMoney(calc.pnlNeto)}</td>
      <td class="${rClass}">${formatR(calc.rMultiple)}</td>
      <td class="${pctClass}">${formatPct(calc.resultadoPct)}</td>
      <td>${estadoTradeBadge}</td>
      <td>${resultadoBadge}</td>
      <td class="col-actions">
        <div class="row-actions">
          <button class="btn-view" data-id="${op.id}" title="Ver">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="btn-edit" data-id="${op.id}" title="Editar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg>
          </button>
          ${botonCerrar}
          <button class="btn-delete" data-id="${op.id}" title="Eliminar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// --- Funciones auxiliares ---
function mostrarAvisoEstadoTrade(data) {
  if (data.estadoTrade === 'Cerrado') {
    showToast('success', '🟢 Trade cerrado', 'Trade guardado y cerrado correctamente.');
  } else {
    showToast('warning', '🟡 Trade Abierto', 'Trade guardado como Abierto. Podrás cerrarlo posteriormente desde el Historial.');
  }
}

function verificarCompletitudRegistro(data) {
  const p = data.psicologia || {};
  const psicologiaCompleta = !!(
    p.estadoEmocional ||
    p.cumplimientoPlan ||
    p.hiceBien || p.hiceMal || p.aprendizaje || p.proximaVez ||
    p.causaResultado
  );
  const evidenciaCompleta = !!(data.imagenBase64 || data.linkGrafico);
  return {
    psicologiaCompleta,
    evidenciaCompleta,
    completo: psicologiaCompleta && evidenciaCompleta
  };
}

function mostrarAvisoCompletitud(completitud) {
  if (completitud.completo) return;
  const faltantes = [];
  if (!completitud.psicologiaCompleta) faltantes.push('Psicología');
  if (!completitud.evidenciaCompleta) faltantes.push('Evidencia');
  showToast(
    'warning',
    'Sugerencia',
    `Aún no has diligenciado el módulo de ${faltantes.join(' y ')}. Registrar esta información te ayudará a detectar patrones de comportamiento.`
  );
}

const CAMPOS_APERTURA_BLOQUEABLES = [
  'cuenta', 'fecha', 'horaEntrada', 'mercado', 'tipoOperacion', 'activo',
  'estrategiaNombre', 'temporalidad', 'precioEntrada', 'stopLoss', 'takeProfit',
  'margenUtilizado', 'apalancamiento', 'tamanoPosicion', 'riesgoPct'
];

function establecerModoCierre(activo) {
  CAMPOS_APERTURA_BLOQUEABLES.forEach(campo => {
    const el = document.querySelector(`[data-field="${campo}"]`);
    if (el) el.disabled = activo;
  });
  const aviso = document.getElementById('modoCierreAviso');
  if (aviso) aviso.style.display = activo ? 'block' : 'none';
}

// --- Exportar funciones necesarias ---
export function getEditingId() { return editingId; }
export function setEditingId(id) { editingId = id; }
export function getImagenTemporal() { return imagenTemporal; }
export function setImagenTemporal(data) { imagenTemporal = data; }
