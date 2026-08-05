/* ============================================================
   GESTIÓN DE CUENTAS — Trading Master
   Etapa 4 de modularización: módulo de Cuentas (AC-01 / AC-01.1).

   Contiene el CRUD completo de cuentas: formulario, validaciones,
   tabla, listeners y el poblado del selector de cuenta que usa el
   formulario de operaciones.
   El código es idéntico al que estaba en index.html.

   Depende de:
   - storage.js  -> estado `cuentas`, `editingCuentaId`, persistirCuentas(),
                    generarSiguienteIdCuenta()
   - utils.js    -> generarId(), escapeHtml(), formatMoney()
   - index.html  -> showToast(), poblarSelect(), TIPOS_CUENTA, MONEDAS
   ============================================================ */

  /* ============================================================
     GESTIÓN DE CUENTAS (AC-01)
     Mismo patrón de CRUD que operaciones, con su propio espacio de nombres
     (data-cuenta-campo en vez de data-field) para no interferir jamás con
     el formulario de operaciones que vive en la misma página.
     ============================================================ */
  function poblarSelectCuentaOperacion(){
    const select = document.getElementById('selectCuenta');
    if(!select) return;
    const activas = cuentas.filter(c => c.estado === 'Activa');
    let html = `<option value="">Selecciona una cuenta…</option>`;
    html += activas.map(c => {
      const etiqueta = escapeHtml(`${c.nombre} (${c.tipoCuenta || '—'} · ${c.moneda || '—'})`);
      return `<option value="${escapeHtml(c.idCuenta)}">${etiqueta}</option>`;
    }).join('');
    select.innerHTML = html;
  }

  function collectCuentaFormData(){
    const data = {};
    document.querySelectorAll('[data-cuenta-campo]').forEach(el => {
      data[el.dataset.cuentaCampo] = el.value.trim();
    });
    data.estado = document.querySelector('#estadoCuentaSegmented button.active').dataset.estado;
    return data;
  }

  function populateCuentaForm(cuenta){
    document.querySelectorAll('[data-cuenta-campo]').forEach(el => {
      el.value = cuenta[el.dataset.cuentaCampo] !== undefined ? cuenta[el.dataset.cuentaCampo] : '';
    });
    document.querySelectorAll('#estadoCuentaSegmented button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.estado === cuenta.estado);
    });
  }

  function limpiarErroresCuenta(){
    document.querySelectorAll('[data-cuenta-campo]').forEach(el => el.classList.remove('is-invalid'));
    document.querySelectorAll('[data-cuenta-error-for]').forEach(el => el.classList.remove('visible'));
  }

  function mostrarErroresCuenta(errores){
    Object.keys(errores).forEach(campo => {
      const input = document.querySelector(`[data-cuenta-campo="${campo}"]`);
      const msg = document.querySelector(`[data-cuenta-error-for="${campo}"]`);
      if(input) input.classList.add('is-invalid');
      if(msg) msg.classList.add('visible');
    });
  }

  function validateCuentaForm(data){
    limpiarErroresCuenta();
    const errores = {};
    const faltantes = [];

    [
      { campo: 'nombre', etiqueta: 'Nombre de la Cuenta' },
      { campo: 'plataforma', etiqueta: 'Plataforma' },
      { campo: 'tipoCuenta', etiqueta: 'Tipo de Cuenta' },
      { campo: 'moneda', etiqueta: 'Moneda' }
    ].forEach(({ campo, etiqueta }) => {
      if(!data[campo]){
        errores[campo] = true;
        faltantes.push(etiqueta);
      }
    });

    if(!data.capitalInicial || isNaN(parseFloat(data.capitalInicial))){
      errores.capitalInicial = true;
      faltantes.push('Capital Inicial');
    }

    const valido = Object.keys(errores).length === 0;
    if(!valido) mostrarErroresCuenta(errores);
    return { valido, faltantes };
  }

  function resetCuentaForm(){
    document.querySelectorAll('[data-cuenta-campo]').forEach(el => { el.value = ''; });
    document.querySelector('[data-cuenta-campo="color"]').value = '#2563EB';
    document.querySelector('#estadoCuentaSegmented button[data-estado="Activa"]').click();
    limpiarErroresCuenta();

    editingCuentaId = null;
    document.getElementById('cuentaEditBadge').style.display = 'none';
    document.getElementById('cuentaFormSub').textContent = 'Registra una nueva cuenta de trading';
    document.getElementById('cuentaSaveBtnLabel').textContent = 'Guardar cuenta';
  }

  async function guardarCuenta(){
    const data = collectCuentaFormData();
    const { valido, faltantes } = validateCuentaForm(data);
    if(!valido){
      showToast('danger', 'No es posible guardar', `Faltan: ${faltantes.join(', ')}.`);
      return;
    }

    if(editingCuentaId){
      const index = cuentas.findIndex(c => c.id === editingCuentaId);
      if(index !== -1){
        // Se preservan id, idCuenta y fechaCreacion — nunca se regeneran al editar.
        cuentas[index] = Object.assign({}, cuentas[index], data);
      }
      showToast('success', 'Cuenta actualizada', `${data.nombre} se guardó correctamente.`);
    }else{
      cuentas.push(Object.assign(
        { id: generarId(), idCuenta: generarSiguienteIdCuenta(), fechaCreacion: new Date().toISOString() },
        data
      ));
      await persistirContadorCuentas();
      showToast('success', 'Cuenta creada', `${data.nombre} ya está disponible en el formulario de operaciones.`);
    }

    await persistirCuentas();
    renderCuentasTable();
    poblarSelectCuentaOperacion();
    resetCuentaForm();
  }

  function editarCuenta(id){
    const cuenta = cuentas.find(c => c.id === id);
    if(!cuenta) return;
    editingCuentaId = id;
    populateCuentaForm(cuenta);
    document.getElementById('cuentaEditBadge').style.display = 'inline-flex';
    document.getElementById('cuentaFormSub').textContent = `Editando "${cuenta.nombre}"`;
    document.getElementById('cuentaSaveBtnLabel').textContent = 'Actualizar cuenta';
    document.getElementById('cuenta-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // No se eliminan cuentas físicamente (filosofía del módulo): solo se
  // alterna Activa/Inactiva, preservando la integridad histórica de los
  // Trades que ya la referencian.
  async function toggleEstadoCuenta(id){
    const cuenta = cuentas.find(c => c.id === id);
    if(!cuenta) return;
    cuenta.estado = cuenta.estado === 'Activa' ? 'Inactiva' : 'Activa';
    await persistirCuentas();
    renderCuentasTable();
    poblarSelectCuentaOperacion();
    showToast('success', 'Estado actualizado', `${cuenta.nombre} ahora está ${cuenta.estado === 'Activa' ? 'Activa' : 'Inactiva'}.`);
  }

  function renderCuentasTable(){
    const tbody = document.getElementById('cuentasTableBody');
    if(!tbody) return;
    document.getElementById('cuentasCount').textContent = cuentas.length;

    if(cuentas.length === 0){
      tbody.innerHTML = `<tr class="empty-row"><td colspan="8">Aún no has registrado ninguna cuenta. Usa el formulario de arriba para crear la primera.</td></tr>`;
      return;
    }

    tbody.innerHTML = cuentas.map(c => {
      const estadoBadge = c.estado === 'Activa'
        ? `<span class="badge success"><span class="badge-dot"></span>Activa</span>`
        : `<span class="badge neutral"><span class="badge-dot"></span>Inactiva</span>`;

      return `<tr>
        <td>${escapeHtml(c.idCuenta || '—')}</td>
        <td>${escapeHtml(c.nombre || '—')}</td>
        <td>${escapeHtml(c.plataforma || '—')}</td>
        <td>${escapeHtml(c.tipoCuenta || '—')}</td>
        <td>${formatMoney(parseFloat(c.capitalInicial))}</td>
        <td>${escapeHtml(c.moneda || '—')}</td>
        <td>${estadoBadge}</td>
        <td class="col-actions">
          <div class="row-actions">
            <button class="btn-edit-cuenta" data-id="${c.id}" title="Editar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg>
            </button>
            <button class="btn-toggle-cuenta" data-id="${c.id}" title="${c.estado === 'Activa' ? 'Inactivar' : 'Activar'}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  function attachCuentasListeners(){
    document.getElementById('cuentaSaveBtn').addEventListener('click', guardarCuenta);
    document.getElementById('cuentaCancelBtn').addEventListener('click', resetCuentaForm);

    document.querySelectorAll('[data-cuenta-campo]').forEach(el => {
      el.addEventListener('input', () => {
        el.classList.remove('is-invalid');
        const msg = document.querySelector(`[data-cuenta-error-for="${el.dataset.cuentaCampo}"]`);
        if(msg) msg.classList.remove('visible');
      });
    });

    document.getElementById('cuentasTableBody').addEventListener('click', (e) => {
      const editBtn = e.target.closest('.btn-edit-cuenta');
      const toggleBtn = e.target.closest('.btn-toggle-cuenta');
      if(editBtn){ editarCuenta(editBtn.dataset.id); return; }
      if(toggleBtn){ toggleEstadoCuenta(toggleBtn.dataset.id); }
    });
  }
