/* ============================================================
   UI - Componentes de interfaz (Toast, Modal, Navegación)
   ============================================================ */

import { escapeHtml } from './utils.js';

// --- Toast ---
export function showToast(tipo, titulo, detalle) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;

  const iconos = {
    success: '<polyline points="20 6 9 17 4 12"/>',
    danger: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    warning: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>'
  };

  toast.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconos[tipo] || iconos.success}</svg>
    <div>
      <div class="toast-title">${escapeHtml(titulo)}</div>
      <div class="toast-desc">${escapeHtml(detalle || '')}</div>
    </div>`;

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// --- Modal ---
export function openModal({ titulo, cuerpo, onConfirm }) {
  document.getElementById('modalTitle').textContent = titulo;
  document.getElementById('modalBody').textContent = cuerpo;
  const confirmBtn = document.getElementById('modalConfirmBtn');

  const nuevoConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(nuevoConfirmBtn, confirmBtn);
  nuevoConfirmBtn.addEventListener('click', () => {
    onConfirm();
    closeModal();
  });

  document.getElementById('modalOverlay').classList.add('is-open');
}

export function closeModal() {
  document.getElementById('modalOverlay').classList.remove('is-open');
}

export function attachModalListeners() {
  document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
  document.getElementById('modalCancelBtn').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
  });
}

// --- Ficha Técnica ---
export function abrirFichaTecnica(op, construirHtmlFichaFn) {
  if (!op) return;
  document.getElementById('fichaTitulo').textContent = `Ficha Técnica · ${op.activo || 'Operación'}`;
  document.getElementById('fichaBody').innerHTML = construirHtmlFichaFn(op);
  document.getElementById('fichaOverlay').classList.add('is-open');
}

export function cerrarFichaTecnica() {
  document.getElementById('fichaOverlay').classList.remove('is-open');
}

export function attachFichaListeners() {
  document.getElementById('fichaCloseBtn').addEventListener('click', cerrarFichaTecnica);
  document.getElementById('fichaOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'fichaOverlay') cerrarFichaTecnica();
  });
}

// --- Navegación ---
export function attachNavListeners() {
  const MODULOS_NAV = {
    'inicio': 'vistaInicio',
    'trades': 'vistaTrades',
    'cuentas': 'vistaCuentas',
    'estrategias': 'vistaEstrategias',
    'analytics': 'vistaAnalytics',
    'plan-trading': 'vistaPlanTrading',
    'configuracion': 'vistaConfiguracion'
  };

  function cambiarVista(navId) {
    Object.values(MODULOS_NAV).forEach(vid => {
      const el = document.getElementById(vid);
      if (el) el.style.display = 'none';
    });
    const idDestino = MODULOS_NAV[navId];
    if (idDestino) {
      const destino = document.getElementById(idDestino);
      if (destino) destino.style.display = 'block';
    }
  }

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      cambiarVista(item.dataset.nav);
    });
  });

  // Vista inicial: Inicio
  cambiarVista('inicio');
}

// --- Visuales (Tema, Sidebar) ---
export function attachVisualListeners() {
  const htmlEl = document.documentElement;
  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    const current = htmlEl.getAttribute('data-theme');
    htmlEl.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
  });

  const appEl = document.getElementById('app');
  document.getElementById('sidebarCollapseBtn').addEventListener('click', () => {
    appEl.classList.toggle('sidebar-collapsed');
  });

  const sidebarEl = document.getElementById('sidebar');
  document.getElementById('mobileMenuBtn').addEventListener('click', () => {
    sidebarEl.classList.toggle('mobile-open');
  });
}
