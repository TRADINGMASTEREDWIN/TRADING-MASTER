/* ============================================================
   APP - Inicialización y orquestación de módulos
   ============================================================ */

import { supabase, verificarConexionSupabase } from './supabase.js';
import { initAuth } from './auth.js';
import {
  loadOperations, persistirOperaciones, cargarContadorTrades,
  cargarCuentas, cargarContadorCuentas, setOperaciones,
  migrarIdsCuentas, migrarCuentasDeOperaciones, migrarContextosTecnicos,
  getCuentas, setCuentas, getOperaciones
} from './storage.js';
import { actualizarDashboard } from './dashboard.js';
import { renderTable } from './trades.js';
import { renderCuentasTable, poblarSelectCuentaOperacion, attachCuentasListeners } from './accounts.js';
import { renderPlanTrading, attachPlanTradingListeners } from './plan.js';
import {
  attachVisualListeners, attachNavListeners, attachModalListeners,
  attachFichaListeners, showToast
} from './ui.js';

// --- Constantes ---
const TEMPORALIDADES = ['1M', '1W', '1D', '4H', '1H', '15m', '5m'];
const ESTRATEGIAS = ['Estrategia Scalping', 'Estrategia Intradía', 'Estrategia Swing'];
const TIPOS_TRADE = ['Scalping', 'Intradía', 'Swing', 'Position'];
const MERCADOS = ['Cripto', 'Acciones', 'Oro'];
const TIPOS_OPERACION = ['Spot', 'Futuros', 'Margin', 'Loan'];
const ACTIVOS_FAVORITOS = ['BTC', 'ETH', 'SOL', 'XAU (Oro)', 'AAPL', 'TSLA'];

// --- Construcción de campos dinámicos ---
function construirCamposDinamicos() {
  poblarSelect(document.getElementById('selectMercado'), MERCADOS, 'Selecciona…');
  poblarSelect(document.getElementById('selectTipoOperacion'), TIPOS_OPERACION, 'Selecciona…');
  poblarSelect(document.getElementById('selectTipoCuenta'), ['Real', 'Demo', 'Fondeada'], 'Selecciona…');
  poblarSelect(document.getElementById('selectMonedaCuenta'), ['USD', 'USDT', 'EUR', 'COP'], 'Selecciona…');
  poblarSelectActivo(document.getElementById('selectActivo'));
  poblarSelect(document.getElementById('selectEstrategia'), ESTRATEGIAS, 'Selecciona una estrategia…');
  poblarSelect(document.getElementById('selectTipoTrade'), TIPOS_TRADE, 'Selecciona…');
  poblarSelect(document.getElementById('selectTemporalidad'), TEMPORALIDADES, 'Selecciona…');
  
  poblarContextoTecnicoChips(document.getElementById('contextoMercadoGrid'));
  actualizarTemporalidadesVisibles();
}

function poblarSelect(selectEl, opciones, textoVacio) {
  if (!selectEl) return;
  let html = `<option value="">${textoVacio}</option>`;
  html += opciones.map(op => `<option value="${op}">${op}</option>`).join('');
  selectEl.innerHTML = html;
}

function poblarSelectActivo(selectEl) {
  if (!selectEl) return;
  let html = `<option value="">Selecciona…</option>`;
  html += ACTIVOS_FAVORITOS.map(a => `<option value="${a}">${a}</option>`).join('');
  html += `<option value="Otro...">Otro...</option>`;
  selectEl.innerHTML = html;
}

function poblarContextoTecnicoChips(containerEl) {
  if (!containerEl) return;
  const bloques = [
    { titulo: 'Contexto Macro', temporalidades: ['1W', '1D'] },
    { titulo: 'Contexto Operativo', temporalidades: ['4H', '1H'] },
    { titulo: 'Ejecución', temporalidades: ['15m', '5m'] }
  ];
  const EMA50_ESTADOS = [
    { valor: 'sobre', etiqueta: 'Sobre EMA50', emoji: '🟢' },
    { valor: 'en', etiqueta: 'En la EMA50', emoji: '🟡' },
    { valor: 'bajo', etiqueta: 'Bajo EMA50', emoji: '🔴' }
  ];

  containerEl.innerHTML = bloques.map(bloque => `
    <div class="contexto-bloque" data-bloque="${bloque.titulo}">
      <div class="contexto-bloque-titulo">${bloque.titulo}</div>
      ${bloque.temporalidades.map(tf => `
        <div class="contexto-fila" data-timeframe="${tf}">
          <span class="contexto-fila-label">${tf}</span>
          <div class="contexto-chip-row">
            ${EMA50_ESTADOS.map(e => `<span class="chip contexto-estado-chip" data-value="${e.valor}">${e.emoji} ${e.etiqueta}</span>`).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');
}

function actualizarTemporalidadesVisibles() {
  const tipoTrade = document.getElementById('selectTipoTrade').value;
  const config = TEMPORALIDADES_POR_TIPO_TRADE[tipoTrade] || TEMPORALIDADES_POR_DEFECTO;

  document.querySelectorAll('#contextoMercadoGrid .contexto-fila').forEach(fila => {
    const tf = fila.dataset.timeframe;
    const visible = config.visibles.includes(tf);
    fila.style.display = visible ? 'flex' : 'none';
    fila.classList.toggle('contexto-fila-opcional', config.opcionales.includes(tf));
  });

  document.querySelectorAll('#contextoMercadoGrid .contexto-bloque').forEach(bloque => {
    const algunaFilaVisible = Array.from(bloque.querySelectorAll('.contexto-fila'))
      .some(fila => fila.style.display !== 'none');
    bloque.style.display = algunaFilaVisible ? 'flex' : 'none';
  });
}

const TEMPORALIDADES_POR_TIPO_TRADE = {
  'Scalping': { visibles: ['1W', '1D', '4H', '1H', '15m', '5m'], opcionales: [] },
  'Intradía': { visibles: ['1W', '1D', '4H', '1H', '15m'], opcionales: ['15m'] },
  'Swing': { visibles: ['1W', '1D', '4H', '1H'], opcionales: [] },
  'Position': { visibles: ['1W', '1D', '4H', '1H'], opcionales: [] }
};
const TEMPORALIDADES_POR_DEFECTO = { visibles: ['1W', '1D', '4H', '1H', '15m', '5m'], opcionales: [] };

// --- Inicialización ---
export async function initApp() {
  console.log('🚀 Inicializando Trading Master...');

  verificarConexionSupabase();

  await cargarContadorCuentas();
  await cargarCuentas();
  await cargarContadorTrades();
  await loadOperations();
  
  await migrarIdsCuentas();
  await migrarCuentasDeOperaciones();
  await migrarContextosTecnicos();

  construirCamposDinamicos();
  
  poblarSelectCuentaOperacion();
  renderCuentasTable();
  renderTable();
  
  await renderPlanTrading();
  
  attachVisualListeners();
  attachNavListeners();
  attachModalListeners();
  attachFichaListeners();
  attachPlanTradingListeners();
  attachCuentasListeners();
  attachFormListeners();
  attachTableListeners();
  attachFormTabListeners();

  console.log('✅ Trading Master inicializado correctamente');
}

// --- Listeners para pestañas del formulario ---
function attachFormTabListeners() {
  document.querySelectorAll('.form-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      // Desactivar todas las pestañas y paneles
      document.querySelectorAll('.form-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.form-panel').forEach(p => p.classList.remove('active'));
      
      // Activar la pestaña clickeada y su panel correspondiente
      tab.classList.add('active');
      const panelId = tab.dataset.tab;
      const panel = document.querySelector(`.form-panel[data-panel="${panelId}"]`);
      if (panel) {
        panel.classList.add('active');
      }
      
      // Si es la pestaña "resumen", renderizar el resumen previo
      if (panelId === 'resumen') {
        renderResumenPrevio();
      }
    });
  });
}

// --- Renderizar resumen previo ---
function renderResumenPrevio() {
  const contenedor = document.getElementById('resumenPrevioContenido');
  if (!contenedor) return;

  // Recolectar datos del formulario
  const data = collectFormData();
  
  // Crear objeto de operación preliminar
  const operacionPreliminar = Object.assign({}, data, { 
    calculos: calcularOperacion(data) 
  });

  contenedor.innerHTML = `
    <div style="margin-bottom: var(--space-4); padding: var(--space-3) var(--space-4); background: var(--color-warning-soft); border: 1px solid var(--color-warning); border-radius: var(--radius-md); font-size: var(--fs-sm); color: var(--color-text);">
      ⚠ Esta es una vista previa — nada se ha guardado todavía. Revisa que todo esté correcto antes de presionar "Guardar operación".
    </div>
    ${construirHtmlFicha(operacionPreliminar)}
  `;
}

// --- Funciones auxiliares para el resumen ---
function collectFormData() {
  const data = {};
  document.querySelectorAll('[data-field]').forEach(el => {
    data[el.dataset.field] = el.value.trim();
  });
  data.direccion = document.querySelector('#direccionSegmented button.active').dataset.direction;
  data.estadoTrade = (data.fechaSalida && data.horaSalida && data.precioSalida) ? 'Cerrado' : 'Abierto';
  return data;
}

function calcularOperacion(datos) {
  // Versión simplificada para el resumen previo
  const resultado = { pnlNeto: null, estado: null };
  if (datos.estadoTrade === 'Abierto') {
    resultado.estado = 'Abierto';
    return resultado;
  }
  // Aquí iría el cálculo completo, pero para el resumen es suficiente
  return resultado;
}

function construirHtmlFicha(op) {
  // Versión simplificada para el resumen previo
  return `<div style="color: var(--color-text-secondary);">Vista previa de la operación: ${op.activo || 'Sin activo'}</div>`;
}

// --- Funciones auxiliares para listeners (placeholder) ---
function attachFormListeners() {
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');
  const cancelBtn = document.getElementById('cancelBtn');

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      console.log('Guardar operación');
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      console.log('Resetear formulario');
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      console.log('Cancelar');
    });
  }
}

function attachTableListeners() {
  const tbody = document.getElementById('operationsTableBody');
  if (tbody) {
    tbody.addEventListener('click', (e) => {
      console.log('Acción en tabla');
    });
  }
}

// --- Iniciar ---
document.addEventListener('DOMContentLoaded', async function() {
  await initAuth();
  await initApp();
});
