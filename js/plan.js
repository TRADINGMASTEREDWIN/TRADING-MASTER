/* ============================================================
   PLAN - Mi Plan de Trading
   ============================================================ */

import { getPlanTrading, setPlanTrading, guardarPlanTrading, loadPlanTrading } from './storage.js';
import { showToast } from './ui.js';

// --- Renderizar Plan ---
export function renderPlanTrading() {
  const plan = getPlanTrading();
  document.querySelectorAll('.plan-view-text').forEach(el => {
    const key = el.dataset.viewFor;
    const contenido = (plan[key] || '').trim();
    if (contenido) {
      el.textContent = contenido;
      el.classList.remove('plan-empty');
    } else {
      el.textContent = 'Aún no has documentado esta sección — haz clic en Editar para comenzar.';
      el.classList.add('plan-empty');
    }
  });
}

// --- Cerrar edición de una tarjeta ---
function cerrarEdicionPlanCard(card) {
  const view = card.querySelector('.plan-view-text');
  const textarea = card.querySelector('.plan-textarea');
  const actions = card.querySelector('.plan-actions');
  const editBtn = card.querySelector('.plan-edit-btn');
  view.style.display = 'block';
  textarea.style.display = 'none';
  actions.style.display = 'none';
  editBtn.style.display = 'inline-flex';
}

// --- Attach listeners ---
export function attachPlanTradingListeners() {
  const contenedor = document.getElementById('vistaPlanTrading');
  if (!contenedor) return;

  contenedor.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.plan-edit-btn');
    const cancelBtn = e.target.closest('.plan-cancel-btn');
    const saveBtn = e.target.closest('.plan-save-btn');

    if (editBtn) {
      const card = editBtn.closest('.plan-card');
      const key = card.dataset.planKey;
      const view = card.querySelector('.plan-view-text');
      const textarea = card.querySelector('.plan-textarea');
      const actions = card.querySelector('.plan-actions');
      const plan = getPlanTrading();
      textarea.value = plan[key] || '';
      view.style.display = 'none';
      textarea.style.display = 'block';
      actions.style.display = 'flex';
      editBtn.style.display = 'none';
      textarea.focus();
      return;
    }

    if (cancelBtn) {
      cerrarEdicionPlanCard(cancelBtn.closest('.plan-card'));
      return;
    }

    if (saveBtn) {
      const card = saveBtn.closest('.plan-card');
      const key = card.dataset.planKey;
      const textarea = card.querySelector('.plan-textarea');
      const plan = getPlanTrading();
      plan[key] = textarea.value;
      setPlanTrading(plan);
      await guardarPlanTrading();
      renderPlanTrading();
      cerrarEdicionPlanCard(card);
      showToast('success', 'Plan actualizado', 'Se guardó correctamente.');
    }
  });
}
