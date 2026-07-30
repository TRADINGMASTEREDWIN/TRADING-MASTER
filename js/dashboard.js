/* ============================================================
   DASHBOARD - Estadísticas y KPIs
   ============================================================ */

import { formatMoney, formatPct, formatR, escapeHtml } from './utils.js';
import { getOperaciones, obtenerNombreCuentaPorId, getCuentas } from './storage.js';

// --- Funciones de cálculo ---
export function calcularWinRate(lista) {
  if (lista.length === 0) return null;
  const ganadoras = lista.filter(op => op.calculos && op.calculos.estado === 'Ganadora');
  return (ganadoras.length / lista.length) * 100;
}

export function calcularProfitFactor(lista) {
  const ganadoras = lista.filter(op => op.calculos && op.calculos.estado === 'Ganadora');
  const perdedoras = lista.filter(op => op.calculos && op.calculos.estado === 'Perdedora');

  const gananciaBruta = ganadoras.reduce((sum, op) => sum + op.calculos.pnlNeto, 0);
  const perdidaBruta = Math.abs(perdedoras.reduce((sum, op) => sum + op.calculos.pnlNeto, 0));

  if (perdidaBruta === 0) {
    return gananciaBruta > 0 ? Infinity : null;
  }
  return gananciaBruta / perdidaBruta;
}

export function calcularExpectancy(lista) {
  const rValues = lista
    .map(op => (op.calculos ? op.calculos.rMultiple : null))
    .filter(v => typeof v === 'number' && !isNaN(v));
  if (rValues.length === 0) return null;
  return rValues.reduce((a, b) => a + b, 0) / rValues.length;
}

export function calcularDrawdown(lista) {
  const conDatos = lista
    .filter(op => op.calculos && typeof op.calculos.pnlNeto === 'number')
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  if (conDatos.length === 0) return null;

  let acumulado = 0, pico = 0, maxDrawdown = 0;
  conDatos.forEach(op => {
    acumulado += op.calculos.pnlNeto;
    if (acumulado > pico) pico = acumulado;
    const caida = pico - acumulado;
    if (caida > maxDrawdown) maxDrawdown = caida;
  });
  return maxDrawdown;
}

export function obtenerExtremoOperacion(lista, tipo) {
  const conDatos = lista.filter(op => op.calculos && typeof op.calculos.pnlNeto === 'number');
  if (conDatos.length === 0) return null;
  return conDatos.reduce((mejor, actual) => {
    if (!mejor) return actual;
    if (tipo === 'max') return actual.calculos.pnlNeto > mejor.calculos.pnlNeto ? actual : mejor;
    return actual.calculos.pnlNeto < mejor.calculos.pnlNeto ? actual : mejor;
  }, null);
}

export function calcularMejoresPorCategoria(lista) {
  const categorias = [
    { etiqueta: 'Estrategia', campo: 'estrategiaNombre' },
    { etiqueta: 'Activo', campo: 'activo' },
    { etiqueta: 'Tipo de Trade', campo: 'tipoTrade' },
    { etiqueta: 'Cuenta', campo: 'cuenta' },
    { etiqueta: 'Temporalidad', campo: 'temporalidad' }
  ];

  return categorias.map(cat => {
    const grupos = {};
    lista.forEach(op => {
      const valor = op[cat.campo];
      if (!valor || !op.calculos || typeof op.calculos.pnlNeto !== 'number') return;
      if (!grupos[valor]) grupos[valor] = [];
      grupos[valor].push(op.calculos.pnlNeto);
    });

    let mejorNombre = null, mejorPromedio = null;
    Object.keys(grupos).forEach(nombre => {
      const promedio = grupos[nombre].reduce((a, b) => a + b, 0) / grupos[nombre].length;
      if (mejorPromedio === null || promedio > mejorPromedio) {
        mejorPromedio = promedio;
        mejorNombre = nombre;
      }
    });

    return { etiqueta: cat.etiqueta, nombre: mejorNombre, promedio: mejorPromedio };
  });
}

export function calcularResumenPorCuenta(lista) {
  const cuentasList = getCuentas();
  const grupos = {};
  lista.forEach(op => {
    const cuenta = op.cuenta || 'Sin cuenta';
    if (!grupos[cuenta]) grupos[cuenta] = { total: 0, pnl: 0, ganadoras: 0 };
    grupos[cuenta].total += 1;
    if (op.calculos && typeof op.calculos.pnlNeto === 'number') {
      grupos[cuenta].pnl += op.calculos.pnlNeto;
    }
    if (op.calculos && op.calculos.estado === 'Ganadora') {
      grupos[cuenta].ganadoras += 1;
    }
  });

  return Object.keys(grupos).map(cuenta => {
    const g = grupos[cuenta];
    return {
      cuenta: cuenta === 'Sin cuenta' ? 'Sin cuenta' : obtenerNombreCuentaPorId(cuenta, cuentasList),
      operaciones: g.total,
      pnl: g.pnl,
      winRate: g.total > 0 ? (g.ganadoras / g.total) * 100 : null
    };
  });
}

// --- Cálculo completo del Dashboard ---
export function calcularDashboard(operaciones) {
  const lista = operaciones || [];
  const cerradas = lista.filter(op => (op.estadoTrade || 'Cerrado') === 'Cerrado');
  const conPnl = cerradas.filter(op => op.calculos && typeof op.calculos.pnlNeto === 'number');

  const capitalAcumulado = conPnl.reduce((sum, op) => sum + op.calculos.pnlNeto, 0);
  const ganadoras = cerradas.filter(op => op.calculos && op.calculos.estado === 'Ganadora');
  const perdedoras = cerradas.filter(op => op.calculos && op.calculos.estado === 'Perdedora');
  const breakEven = cerradas.filter(op => op.calculos && op.calculos.estado === 'Break Even');

  const promedioGanancia = ganadoras.length
    ? ganadoras.reduce((sum, op) => sum + op.calculos.pnlNeto, 0) / ganadoras.length
    : null;
  const promedioPerdida = perdedoras.length
    ? perdedoras.reduce((sum, op) => sum + op.calculos.pnlNeto, 0) / perdedoras.length
    : null;

  return {
    total: lista.length,
    capitalAcumulado: conPnl.length ? capitalAcumulado : null,
    winRate: calcularWinRate(cerradas),
    profitFactor: calcularProfitFactor(cerradas),
    expectancy: calcularExpectancy(cerradas),
    drawdownMax: calcularDrawdown(cerradas),
    promedioGanancia,
    promedioPerdida,
    ganadorasCount: ganadoras.length,
    perdedorasCount: perdedoras.length,
    breakEvenCount: breakEven.length,
    mejorOperacion: obtenerExtremoOperacion(cerradas, 'max'),
    peorOperacion: obtenerExtremoOperacion(cerradas, 'min'),
    rendimientoPorCategoria: calcularMejoresPorCategoria(cerradas),
    resumenPorCuenta: calcularResumenPorCuenta(cerradas)
  };
}

// --- Renderizar Dashboard ---
export function actualizarDashboard(operaciones) {
  const stats = calcularDashboard(operaciones);

  const capitalEl = document.getElementById('statCapitalAcumulado');
  capitalEl.textContent = formatMoney(stats.capitalAcumulado);
  capitalEl.classList.remove('positive', 'negative', 'neutral');
  if (stats.capitalAcumulado === null || stats.capitalAcumulado === 0) {
    capitalEl.classList.add('neutral');
  } else if (stats.capitalAcumulado > 0) {
    capitalEl.classList.add('positive');
  } else {
    capitalEl.classList.add('negative');
  }

  document.getElementById('statTotalOperaciones').textContent = stats.total;
  document.getElementById('statWinRate').textContent = stats.winRate !== null ? `${stats.winRate.toFixed(2)}%` : '—';

  const pfEl = document.getElementById('statProfitFactor');
  pfEl.textContent = stats.profitFactor === Infinity ? '∞' : (stats.profitFactor !== null ? stats.profitFactor.toFixed(2) : '—');
  pfEl.classList.remove('positive', 'negative');
  if (stats.profitFactor === Infinity || (stats.profitFactor !== null && stats.profitFactor >= 1)) {
    pfEl.classList.add('positive');
  } else if (stats.profitFactor !== null) {
    pfEl.classList.add('negative');
  }

  document.getElementById('statExpectancy').textContent = formatR(stats.expectancy);
  document.getElementById('statDrawdownMax').textContent =
    stats.drawdownMax !== null ? formatMoney(-stats.drawdownMax) : '—';
  document.getElementById('statPromedioGanancia').textContent = formatMoney(stats.promedioGanancia);
  document.getElementById('statPromedioPerdida').textContent = formatMoney(stats.promedioPerdida);

  document.getElementById('resumenGanadoras').textContent = stats.ganadorasCount;
  document.getElementById('resumenPerdedoras').textContent = stats.perdedorasCount;
  document.getElementById('resumenBreakEven').textContent = stats.breakEvenCount;
  document.getElementById('resumenMejorOperacion').textContent = stats.mejorOperacion
    ? `${stats.mejorOperacion.activo || '—'} · ${formatMoney(stats.mejorOperacion.calculos.pnlNeto)}`
    : '—';
  document.getElementById('resumenPeorOperacion').textContent = stats.peorOperacion
    ? `${stats.peorOperacion.activo || '—'} · ${formatMoney(stats.peorOperacion.calculos.pnlNeto)}`
    : '—';

  renderRendimientoPorCategoria(stats.rendimientoPorCategoria);
  renderResumenPorCuenta(stats.resumenPorCuenta);
}

function renderRendimientoPorCategoria(lista) {
  const tbody = document.getElementById('rendimientoCategoriaBody');
  if (!tbody) return;
  tbody.innerHTML = lista.map(item => `
    <tr>
      <td>${escapeHtml(item.etiqueta)}</td>
      <td>${item.nombre ? `${escapeHtml(item.nombre)} (${formatMoney(item.promedio)} prom.)` : '—'}</td>
    </tr>
  `).join('');
}

function renderResumenPorCuenta(lista) {
  const tbody = document.getElementById('resumenCuentaBody');
  if (!tbody) return;
  if (lista.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="4">Aún no hay operaciones registradas.</td></tr>`;
    return;
  }
  tbody.innerHTML = lista.map(item => {
    const pnlClass = item.pnl > 0 ? 'positive' : (item.pnl < 0 ? 'negative' : '');
    return `<tr>
      <td>${escapeHtml(item.cuenta)}</td>
      <td>${item.operaciones}</td>
      <td class="${pnlClass}">${formatMoney(item.pnl)}</td>
      <td>${item.winRate !== null ? item.winRate.toFixed(2) + '%' : '—'}</td>
    </tr>`;
  }).join('');
}
