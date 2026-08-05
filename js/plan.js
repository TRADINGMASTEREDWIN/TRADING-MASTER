/* ============================================================
   MI PLAN DE TRADING — Trading Master
   Etapa 5 de modularización: módulo del Plan de Trading (Fase 4.3).

   Contiene el renderizado de las tarjetas del plan y la lógica de
   edición en línea (editar / cancelar / guardar por tarjeta).
   El código es idéntico al que estaba en index.html.

   Depende de:
   - storage.js  -> estado `planTrading`, guardarPlanTrading()
   - index.html  -> showToast(), PLAN_TRADING_DEFAULTS
   ============================================================ */


  function renderPlanTrading(){
    document.querySelectorAll('.plan-view-text').forEach(el => {
      const key = el.dataset.viewFor;
      const contenido = (planTrading[key] || '').trim();
      if(contenido){
        el.textContent = contenido;
        el.classList.remove('plan-empty');
      }else{
        el.textContent = 'Aún no has documentado esta sección — haz clic en Editar para comenzar.';
        el.classList.add('plan-empty');
      }
    });
  }

  /* ============================================================
     MI PLAN DE TRADING — edición por tarjeta (Fase 4.3)
     ============================================================ */
  function cerrarEdicionPlanCard(card){
    const view = card.querySelector('.plan-view-text');
    const textarea = card.querySelector('.plan-textarea');
    const actions = card.querySelector('.plan-actions');
    const editBtn = card.querySelector('.plan-edit-btn');
    view.style.display = 'block';
    textarea.style.display = 'none';
    actions.style.display = 'none';
    editBtn.style.display = 'inline-flex';
  }

  function attachPlanTradingListeners(){
    const contenedor = document.getElementById('vistaPlanTrading');
    if(!contenedor) return;

    contenedor.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.plan-edit-btn');
      const cancelBtn = e.target.closest('.plan-cancel-btn');
      const saveBtn = e.target.closest('.plan-save-btn');

      if(editBtn){
        const card = editBtn.closest('.plan-card');
        const key = card.dataset.planKey;
        const view = card.querySelector('.plan-view-text');
        const textarea = card.querySelector('.plan-textarea');
        const actions = card.querySelector('.plan-actions');
        textarea.value = planTrading[key] || '';
        view.style.display = 'none';
        textarea.style.display = 'block';
        actions.style.display = 'flex';
        editBtn.style.display = 'none';
        textarea.focus();
        return;
      }

      if(cancelBtn){
        cerrarEdicionPlanCard(cancelBtn.closest('.plan-card'));
        return;
      }

      if(saveBtn){
        const card = saveBtn.closest('.plan-card');
        const key = card.dataset.planKey;
        const textarea = card.querySelector('.plan-textarea');
        planTrading[key] = textarea.value;
        await guardarPlanTrading();
        renderPlanTrading();
        cerrarEdicionPlanCard(card);
        showToast('success', 'Plan actualizado', 'Se guardó correctamente.');
      }
    });
  }
