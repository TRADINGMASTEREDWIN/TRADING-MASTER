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
  // Selectores básicos
  poblarSelect(document.getElementById('selectMercado'), MERCADOS, 'Selecciona…');
  poblarSelect(document.getElementById('selectTipoOperacion'), TIPOS_OPERACION, 'Selecciona…');
  poblarSelect(document.getElementById('selectTipoCuenta'), ['Real', 'Demo', 'Fondeada'], 'Selecciona…');
  poblarSelect(document.getElementById('selectMonedaCuenta'), ['USD', 'USDT', 'EUR', 'COP'], 'Selecciona…');
  poblarSelectActivo(document.getElementById('selectActivo'));
  poblarSelect(document.getElementById('selectEstrategia'), ESTRATEGIAS, 'Selecciona una estrategia…');
  poblarSelect(document.getElementById('selectTipoTrade'), TIPOS_TRADE, 'Selecciona…');
  poblarSelect(document.getElementById('selectTemporalidad'), TEMPORALIDADES, 'Selecciona…');
  
  // Contexto Técnico
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

  // Verificar Supabase
  verificarConexionSupabase();

  // Cargar datos
  await cargarContadorCuentas();
  await cargarCuentas();
  await cargarContadorTrades();
  await loadOperations();
  
  // Migraciones
  await migrarIdsCuentas();
  await migrarCuentasDeOperaciones();
  await migrarContextosTecnicos();

  // Construir UI dinámica
  construirCamposDinamicos();
  
  // Renderizar
  poblarSelectCuentaOperacion();
  renderCuentasTable();
  renderTable();
  
  // Plan de Trading
  await renderPlanTrading();
  
  // Adjuntar listeners
  attachVisualListeners();
  attachNavListeners();
  attachModalListeners();
  attachFichaListeners();
  attachPlanTradingListeners();
  attachCuentasListeners();
  attachFormListeners();
  attachTableListeners();

  console.log('✅ Trading Master inicializado correctamente');
}

// --- Funciones auxiliares para listeners (placeholder) ---
function attachFormListeners() {
  // Form listeners - implementación completa en trades.js
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
  // Table listeners - implementación completa en trades.js
  const tbody = document.getElementById('operationsTableBody');
  if (tbody) {
    tbody.addEventListener('click', (e) => {
      console.log('Acción en tabla');
    });
  }
}

// --- Iniciar ---
document.addEventListener('DOMContentLoaded', async function() {
  // Inicializar autenticación primero
  await initAuth();
  
  // Luego inicializar la app
  await initApp();
});
