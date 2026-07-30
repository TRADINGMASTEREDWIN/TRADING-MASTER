/* ============================================================
   UTILS - Funciones de utilidad general
   ============================================================ */

// --- Formateadores ---
export function formatMoney(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return '—';
  const signo = valor > 0 ? '+' : '';
  return `${signo}$${valor.toFixed(2)}`;
}

export function formatPct(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return '—';
  const signo = valor > 0 ? '+' : '';
  return `${signo}${valor.toFixed(2)}%`;
}

export function formatR(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return '—';
  const signo = valor > 0 ? '+' : '';
  return `${signo}${valor.toFixed(2)}R`;
}

// --- Escape HTML ---
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

// --- Generador de ID ---
export function generarId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// --- Obtener momento de entrada para ordenar ---
export function obtenerMomentoEntrada(op) {
  const fecha = op.fecha || '1970-01-01';
  const hora = op.horaEntrada || '00:00';
  return new Date(`${fecha}T${hora}`);
}
