/* ============================================================
   STORAGE - Persistencia en LocalStorage (window.storage)
   ============================================================ */

const STORAGE_KEY = 'tradingJournalOperations';
const CONTADOR_TRADES_KEY = 'tradingJournalContadorTrades';
const CUENTAS_KEY = 'tradingJournalCuentas';
const CONTADOR_CUENTAS_KEY = 'tradingJournalContadorCuentas';
const PLAN_TRADING_KEY = 'tradingJournalPlan';

let operaciones = [];
let cuentas = [];
let planTrading = {};
let contadorTrades = 0;
let contadorCuentas = 0;

// --- Operaciones ---
export function getOperaciones() {
  return operaciones;
}

export function setOperaciones(data) {
  operaciones = data;
}

export async function loadOperations() {
  try {
    const res = await window.storage.get(STORAGE_KEY, false);
    operaciones = res && res.value ? JSON.parse(res.value) : [];
  } catch (e) {
    operaciones = [];
  }
  return operaciones;
}

export async function persistirOperaciones() {
  try {
    await window.storage.set(STORAGE_KEY, JSON.stringify(operaciones), false);
  } catch (e) {
    console.error('No se pudo guardar en window.storage:', e);
  }
}

// --- Contador de Trades ---
export async function cargarContadorTrades() {
  try {
    const res = await window.storage.get(CONTADOR_TRADES_KEY, false);
    contadorTrades = (res && res.value) ? (parseInt(res.value, 10) || 0) : 0;
  } catch (e) {
    contadorTrades = 0;
  }
  return contadorTrades;
}

export async function persistirContadorTrades() {
  try {
    await window.storage.set(CONTADOR_TRADES_KEY, String(contadorTrades), false);
  } catch (e) {
    console.error('No se pudo guardar el contador de Trade ID:', e);
  }
}

export function getContadorTrades() {
  return contadorTrades;
}

export function incrementarContadorTrades() {
  contadorTrades += 1;
  return contadorTrades;
}

export function generarSiguienteIdTrade() {
  contadorTrades += 1;
  return 'TM-' + String(contadorTrades).padStart(6, '0');
}

// --- Cuentas ---
export function getCuentas() {
  return cuentas;
}

export function setCuentas(data) {
  cuentas = data;
}

export async function cargarCuentas() {
  try {
    const res = await window.storage.get(CUENTAS_KEY, false);
    cuentas = (res && res.value) ? JSON.parse(res.value) : [];
  } catch (e) {
    cuentas = [];
  }
  return cuentas;
}

export async function persistirCuentas() {
  try {
    await window.storage.set(CUENTAS_KEY, JSON.stringify(cuentas), false);
  } catch (e) {
    console.error('No se pudo guardar la cuenta:', e);
  }
}

export async function cargarContadorCuentas() {
  try {
    const res = await window.storage.get(CONTADOR_CUENTAS_KEY, false);
    contadorCuentas = (res && res.value) ? (parseInt(res.value, 10) || 0) : 0;
  } catch (e) {
    contadorCuentas = 0;
  }
  return contadorCuentas;
}

export async function persistirContadorCuentas() {
  try {
    await window.storage.set(CONTADOR_CUENTAS_KEY, String(contadorCuentas), false);
  } catch (e) {
    console.error('No se pudo guardar el contador de ID de Cuenta:', e);
  }
}

export function generarSiguienteIdCuenta() {
  contadorCuentas += 1;
  return 'CTA-' + String(contadorCuentas).padStart(6, '0');
}

// --- Plan de Trading ---
const PLAN_TRADING_DEFAULTS = {
  objetivos: 'Objetivos anuales:\n\nObjetivos mensuales:\n\nObjetivos semanales:\n',
  principios: '',
  gestionRiesgo: 'Riesgo máximo por operación:\nRiesgo diario:\nRiesgo semanal:\nDrawdown permitido:\n',
  mercados: '',
  estrategias: '',
  checklistEntrada: '',
  gestionOperacion: 'Stop Loss:\nBreak Even:\nParciales:\nSalida:\n',
  psicologia: '',
  revisionSemanal: '',
  notas: ''
};

export function getPlanTrading() {
  return planTrading;
}

export function setPlanTrading(data) {
  planTrading = data;
}

export async function loadPlanTrading() {
  try {
    const res = await window.storage.get(PLAN_TRADING_KEY, false);
    const guardado = res && res.value ? JSON.parse(res.value) : {};
    planTrading = Object.assign({}, PLAN_TRADING_DEFAULTS, guardado);
  } catch (e) {
    planTrading = Object.assign({}, PLAN_TRADING_DEFAULTS);
  }
  return planTrading;
}

export async function guardarPlanTrading() {
  try {
    await window.storage.set(PLAN_TRADING_KEY, JSON.stringify(planTrading), false);
  } catch (e) {
    console.error('No se pudo guardar el Plan de Trading:', e);
  }
}

// --- Obtener nombre de cuenta por ID ---
export function obtenerNombreCuentaPorId(valor, cuentasList) {
  if (!valor) return '—';
  const cuenta = cuentasList.find(c => c.idCuenta === valor);
  return cuenta ? cuenta.nombre : valor;
}

// --- Migraciones de compatibilidad ---
export async function migrarIdsCuentas() {
  let cambios = false;
  const cuentasList = getCuentas();
  cuentasList.forEach(c => {
    if (!c.idCuenta) {
      c.idCuenta = generarSiguienteIdCuenta();
      cambios = true;
    }
  });
  if (cambios) {
    setCuentas(cuentasList);
    await persistirContadorCuentas();
    await persistirCuentas();
  }
}

export async function migrarCuentasDeOperaciones() {
  let cambios = false;
  const ops = getOperaciones();
  const cuentasList = getCuentas();
  ops.forEach(op => {
    if (!op.cuenta) return;
    const yaEsIdValido = cuentasList.some(c => c.idCuenta === op.cuenta);
    if (yaEsIdValido) return;
    const cuentaPorNombre = cuentasList.find(c => c.nombre === op.cuenta);
    if (cuentaPorNombre) {
      op.cuenta = cuentaPorNombre.idCuenta;
      cambios = true;
    }
  });
  if (cambios) {
    setOperaciones(ops);
    await persistirOperaciones();
  }
}

export function migrarContextoTecnicoDeOperacion(op) {
  if (op.contextoTecnico) return false;
  const legado = op.contextoMercado;
  if (!legado) return false;

  const nuevo = {};
  let huboDato = false;
  let huboAmbiguo = false;

  const TEMPORALIDADES = ['1M', '1W', '1D', '4H', '1H', '15m', '5m'];
  TEMPORALIDADES.forEach(tf => {
    const estado = legado[tf];
    if (!estado) return;
    huboDato = true;
    if (estado === 'Alcista') nuevo[tf] = 'sobre';
    else if (estado === 'Bajista') nuevo[tf] = 'bajo';
    else huboAmbiguo = true;
  });

  if (!huboDato) return false;
  op.contextoTecnico = nuevo;
  if (huboAmbiguo) op.contextoTecnicoPendienteRevision = true;
  return true;
}

export async function migrarContextosTecnicos() {
  let cambios = false;
  const ops = getOperaciones();
  ops.forEach(op => {
    if (migrarContextoTecnicoDeOperacion(op)) cambios = true;
  });
  if (cambios) {
    setOperaciones(ops);
    await persistirOperaciones();
  }
}
