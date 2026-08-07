/* ============================================================
   GESTIÓN DE CUENTAS — Trading Master
   Etapa 4 de modularización: módulo de Cuentas (AC-01 / AC-01.1).

   Contiene el CRUD completo de cuentas: formulario, validaciones,
   tabla, listeners y el poblado del selector de cuenta que usa el
   formulario de operaciones.

   *** CONEXIÓN A SUPABASE ***
   Este módulo ya no persiste en window.storage: lee y escribe
   directamente en la tabla `accounts` de Supabase. El resto del
   archivo (formulario, validaciones, render de la tabla, listeners)
   es idéntico al original — solo cambió CÓMO se guarda/carga, no
   cómo se usa el módulo desde la UI.

   Cambios de fondo (documentados aquí para no repetirlo en cada
   función):
   1. `idCuenta` ahora es el UUID que genera Supabase (antes era un
      contador local "CTA-000001"). generarSiguienteIdCuenta() y
      persistirContadorCuentas() (de storage.js) ya NO se usan.
   2. `plataforma` (texto libre) se traduce a `broker_id` (UUID hacia
      la tabla `brokers`) buscando o creando el broker por nombre.
   3. `descripcion` y `notas` (2 campos del formulario) se combinan en
      la única columna `description` de la tabla, con un separador
      que permite reconstruirlos al leer de vuelta.
   4. cargarCuentas() vive en storage.js y se invoca desde app.js —
      ninguno de los dos se modificó aquí. Ver instrucciones aparte
      para el único ajuste necesario en app.js.

   Depende de:
   - js/supabase.js -> objeto global `supabaseClient`
   - storage.js  -> estado `cuentas`, `editingCuentaId`
   - utils.js    -> escapeHtml(), formatMoney()
   - index.html  -> showToast(), poblarSelect(), TIPOS_CUENTA, MONEDAS
   ============================================================ */

  /* ============================================================
     TRADUCCIÓN UI <-> SUPABASE (Data Mapper)
     La UI sigue hablando en español (nombre, tipoCuenta, moneda...);
     Supabase habla en snake_case en inglés (name, account_type,
     currency...). Estas funciones son el único lugar que conoce
     ambos idiomas.
     ============================================================ */

  const SEPARADOR_NOTAS = '\n---NOTAS---\n';

  // descripcion + notas (2 campos del formulario) -> 1 sola columna `description`
  function combinarDescripcionYNotas(descripcion, notas){
    const d = (descripcion || '').trim();
    const n = (notas || '').trim();
    if(d && n) return `${d}${SEPARADOR_NOTAS}${n}`;
    if(d) return d;
    if(n) return `${SEPARADOR_NOTAS}${n}`;
    return '';
  }

  // El proceso inverso: 1 columna `description` -> descripcion + notas
  function separarDescripcionYNotas(description){
    const texto = description || '';
    const idx = texto.indexOf(SEPARADOR_NOTAS);
    if(idx === -1) return { descripcion: texto, notas: '' };
    return {
      descripcion: texto.slice(0, idx),
      notas: texto.slice(idx + SEPARADOR_NOTAS.length)
    };
  }

  // Busca un broker por nombre (propio o global); si no existe, lo crea.
  // Así "plataforma" sigue siendo texto libre para el usuario, aunque la
  // tabla accounts solo acepte una referencia (broker_id).
  async function buscarOCrearBrokerPorNombre(nombre){
    const limpio = (nombre || '').trim();
    if(!limpio) return null;

    const { data: existente, error: errorBusqueda } = await supabaseClient
      .from('brokers')
      .select('id')
      .ilike('name', limpio)
      .limit(1)
      .maybeSingle();

    if(errorBusqueda){
      console.error('Error buscando broker:', errorBusqueda);
      return null;
    }
    if(existente) return existente.id;

    const { data: userData } = await supabaseClient.auth.getUser();
    const userId = userData && userData.user ? userData.user.id : null;

    const { data: creado, error: errorCreacion } = await supabaseClient
      .from('brokers')
      .insert({ user_id: userId, name: limpio })
      .select('id')
      .single();

    if(errorCreacion){
      console.error('Error creando broker:', errorCreacion);
      return null;
    }
    return creado.id;
  }

  // UI (español, formulario) -> fila de Supabase (snake_case, inglés)
  async function mapearCuentaUIaSupabase(data){
    const brokerId = await buscarOCrearBrokerPorNombre(data.plataforma);
    return {
      broker_id: brokerId,
      name: data.nombre,
      account_type: data.tipoCuenta,
      currency: data.moneda,
      initial_capital: data.capitalInicial ? parseFloat(data.capitalInicial) : null,
      target_capital: data.capitalObjetivo ? parseFloat(data.capitalObjetivo) : null,
      max_drawdown_pct: data.drawdownMaximo ? parseFloat(data.drawdownMaximo) : null,
      max_daily_loss_pct: data.perdidaMaximaDiaria ? parseFloat(data.perdidaMaximaDiaria) : null,
      start_date: data.fechaInicio || null,
      color: data.color || null,
      description: combinarDescripcionYNotas(data.descripcion, data.notas),
      is_active: data.estado === 'Activa'
    };
  }

  // Fila de Supabase -> objeto en el idioma que ya entiende el resto de la
  // aplicación (renderCuentasTable, poblarSelectCuentaOperacion, Ficha
  // Técnica, etc. — ninguno de ellos se modificó).
  function mapearCuentaSupabaseAUI(row){
    const { descripcion, notas } = separarDescripcionYNotas(row.description);
    return {
      id: row.id,
      idCuenta: row.id,               // ver nota: ya no es "CTA-000001", es el UUID de Supabase
      nombre: row.name,
      plataforma: row.broker_nombre || '',   // ver poblarPlataformaEnFilas()
      tipoCuenta: row.account_type,
      moneda: row.currency,
      capitalInicial: row.initial_capital,
      capitalObjetivo: row.target_capital,
      drawdownMaximo: row.max_drawdown_pct,
      perdidaMaximaDiaria: row.max_daily_loss_pct,
      fechaInicio: row.start_date,
      color: row.color,
      descripcion,
      notas,
      estado: row.is_active ? 'Activa' : 'Inactiva',
      fechaCreacion: row.created_at
    };
  }

  /* ============================================================
     CARGA DESDE SUPABASE
     Reemplaza a cargarCuentas() (storage.js). Ver instrucciones para
     el único ajuste necesario en app.js — este archivo no lo toca.
     ============================================================ */
  async function cargarCuentasDesdeSupabase(){
    const { data, error } = await supabaseClient
      .from('accounts')
      .select('*, brokers(name)')
      .order('created_at', { ascending: true });

    if(error){
      console.error('No se pudieron cargar las cuentas:', error);
      showToast('danger', 'No se pudieron cargar las cuentas', error.message);
      cuentas = [];
      return;
    }

    cuentas = (data || []).map(row => mapearCuentaSupabaseAUI(
      Object.assign({}, row, { broker_nombre: row.brokers ? row.brokers.name : '' })
    ));
  }

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

    const payload = await mapearCuentaUIaSupabase(data);

    if(editingCuentaId){
      const { error } = await supabaseClient
        .from('accounts')
        .update(payload)
        .eq('id', editingCuentaId);

      if(error){
        console.error('Error actualizando cuenta:', error);
        showToast('danger', 'No se pudo actualizar', error.message);
        return;
      }
      showToast('success', 'Cuenta actualizada', `${data.nombre} se guardó correctamente.`);
    }else{
      const { data: userData } = await supabaseClient.auth.getUser();
      const userId = userData && userData.user ? userData.user.id : null;

      const { error } = await supabaseClient
        .from('accounts')
        .insert(Object.assign({ user_id: userId }, payload));

      if(error){
        console.error('Error creando cuenta:', error);
        showToast('danger', 'No se pudo crear la cuenta', error.message);
        return;
      }
      showToast('success', 'Cuenta creada', `${data.nombre} ya está disponible en el formulario de operaciones.`);
    }

    await cargarCuentasDesdeSupabase();
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
    const nuevoEstado = cuenta.estado === 'Activa' ? 'Inactiva' : 'Activa';

    const { error } = await supabaseClient
      .from('accounts')
      .update({ is_active: nuevoEstado === 'Activa' })
      .eq('id', id);

    if(error){
      console.error('Error actualizando estado de la cuenta:', error);
      showToast('danger', 'No se pudo actualizar el estado', error.message);
      return;
    }

    await cargarCuentasDesdeSupabase();
    renderCuentasTable();
    poblarSelectCuentaOperacion();
    showToast('success', 'Estado actualizado', `${cuenta.nombre} ahora está ${nuevoEstado}.`);
  }

  // Sprint 5 (parte 2) — DELETE físico real, distinto de toggleEstadoCuenta.
  // No se puede deshacer; el llamador (attachCuentasListeners) siempre pide
  // confirmación antes vía openModal().
  async function eliminarCuentaDefinitivamente(id){
    const cuenta = cuentas.find(c => c.id === id);
    const { error } = await supabaseClient.from('accounts').delete().eq('id', id);

    if(error){
      console.error('Error eliminando definitivamente la cuenta:', error);
      showToast('danger', 'No se pudo eliminar', error.message);
      return;
    }

    await cargarCuentasDesdeSupabase();
    renderCuentasTable();
    poblarSelectCuentaOperacion();
    showToast('success', 'Eliminada definitivamente', `${cuenta ? cuenta.nombre : 'La cuenta'} se borró de la base de datos.`);
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
            <button class="btn-delete-cuenta" data-id="${c.id}" title="Eliminar definitivamente">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
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
      const deleteBtn = e.target.closest('.btn-delete-cuenta');
      if(editBtn){ editarCuenta(editBtn.dataset.id); return; }
      if(toggleBtn){ toggleEstadoCuenta(toggleBtn.dataset.id); return; }
      if(deleteBtn){
        const id = deleteBtn.dataset.id;
        const cuenta = cuentas.find(c => c.id === id);
        openModal({
          titulo: 'Eliminar definitivamente',
          cuerpo: `¿Seguro que quieres eliminar la cuenta "${cuenta ? cuenta.nombre : ''}" de forma permanente? Esta acción no se puede deshacer.`,
          onConfirm: () => eliminarCuentaDefinitivamente(id)
        });
      }
    });
  }
