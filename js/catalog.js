/* ============================================================
   MOTOR GENÉRICO DE CATÁLOGOS — Trading Master

   Funciones reutilizables para el CRUD de catálogos administrables
   simples (Activos, y en el futuro Brokers, Variables, Emociones,
   etc.) — el mismo patrón de formulario + tabla + editar +
   activar/desactivar que ya probamos y dejamos funcionando en
   Cuentas, extraído aquí para no repetir ese código en cada
   módulo nuevo.

   accounts.js NO se tocó ni usa este archivo — sigue exactamente
   igual, probado y funcionando. Esta extracción aplica hacia
   adelante (Activos y los que sigan), no hacia atrás.

   Cómo se usa: cada módulo (ej. assets.js) define un objeto de
   configuración con sus nombres de campo, su mapeo UI<->Supabase y
   el HTML de su fila de tabla, y llama a estas funciones genéricas
   en vez de reescribir el mismo CRUD desde cero. Ver assets.js
   como ejemplo de referencia para los próximos catálogos.

   Reutiliza (sin duplicar) los helpers de .segmented ya existentes
   en trades.js: leerSegmentedActivo(), aplicarSegmentedActivo().

   Depende de:
   - js/supabase.js -> objeto global `supabaseClient`
   - js/trades.js   -> leerSegmentedActivo(), aplicarSegmentedActivo()
   - js/utils.js    -> escapeHtml()
   - index.html     -> showToast()
   ============================================================ */

  function catalogoCollectFormData(config){
    const data = {};
    document.querySelectorAll(`[data-${config.atributoCampo}]`).forEach(el => {
      data[el.dataset[config.datasetCampo]] = el.value.trim();
    });
    if(config.idSegmentedEstado){
      data.estado = leerSegmentedActivo(config.idSegmentedEstado);
    }
    // Generalización aditiva (Sprint Variables): cualquier campo booleano/enum
    // adicional que use el mismo mecanismo de .segmented — Activos y Cuentas
    // no la usan (solo tienen "estado"), así que esto no les afecta en nada.
    if(config.camposSegmentedExtra){
      config.camposSegmentedExtra.forEach(({ idSegmented, dataKey }) => {
        data[dataKey] = leerSegmentedActivo(idSegmented);
      });
    }
    return data;
  }

  function catalogoPopulateForm(config, item){
    document.querySelectorAll(`[data-${config.atributoCampo}]`).forEach(el => {
      const campo = el.dataset[config.datasetCampo];
      el.value = item[campo] !== undefined && item[campo] !== null ? item[campo] : '';
    });
    if(config.idSegmentedEstado){
      aplicarSegmentedActivo(config.idSegmentedEstado, item.estado === config.estadoActivoLabel ? 'activo' : 'inactivo');
    }
    if(config.camposSegmentedExtra){
      config.camposSegmentedExtra.forEach(({ idSegmented, dataKey }) => {
        aplicarSegmentedActivo(idSegmented, item[dataKey]);
      });
    }
  }

  function catalogoLimpiarErrores(config){
    document.querySelectorAll(`[data-${config.atributoCampo}]`).forEach(el => el.classList.remove('is-invalid'));
    document.querySelectorAll(`[data-${config.atributoErrorFor}]`).forEach(el => el.classList.remove('visible'));
  }

  function catalogoMostrarErrores(config, errores){
    Object.keys(errores).forEach(campo => {
      const input = document.querySelector(`[data-${config.atributoCampo}="${campo}"]`);
      const msg = document.querySelector(`[data-${config.atributoErrorFor}="${campo}"]`);
      if(input) input.classList.add('is-invalid');
      if(msg) msg.classList.add('visible');
    });
  }

  function catalogoValidateForm(config, data){
    catalogoLimpiarErrores(config);
    const errores = {};
    const faltantes = [];
    config.camposRequeridos.forEach(({ campo, etiqueta, esNumerico }) => {
      const valor = data[campo];
      if(!valor || (esNumerico && isNaN(parseFloat(valor)))){
        errores[campo] = true;
        faltantes.push(etiqueta);
      }
    });
    const valido = Object.keys(errores).length === 0;
    if(!valido) catalogoMostrarErrores(config, errores);
    return { valido, faltantes };
  }

  function catalogoResetForm(config){
    document.querySelectorAll(`[data-${config.atributoCampo}]`).forEach(el => { el.value = ''; });
    if(config.idSegmentedEstado){
      aplicarSegmentedActivo(config.idSegmentedEstado, config.valorEstadoActivoDefault || 'activo');
    }
    if(config.camposSegmentedExtra){
      config.camposSegmentedExtra.forEach(({ idSegmented, valorDefault }) => {
        aplicarSegmentedActivo(idSegmented, valorDefault || 'no');
      });
    }
    catalogoLimpiarErrores(config);

    config.establecerEditingId(null);
    if(config.idBadgeEditando) document.getElementById(config.idBadgeEditando).style.display = 'none';
    if(config.idSubtitulo) document.getElementById(config.idSubtitulo).textContent = config.textoSubtituloDefault;
    if(config.idLabelBotonGuardar) document.getElementById(config.idLabelBotonGuardar).textContent = config.textoBotonGuardarDefault;
  }

  async function catalogoCargarDesdeSupabase(config){
    const { data, error } = await supabaseClient
      .from(config.tabla)
      .select(config.selectQuery || '*')
      .order(config.ordenarPor || 'created_at', { ascending: true });

    if(error){
      console.error(`No se pudo cargar ${config.tabla}:`, error);
      showToast('danger', 'No se pudo cargar', error.message);
      config.establecerEstadoArray([]);
      return;
    }
    config.establecerEstadoArray((data || []).map(config.mapearDBaUI));
  }

  async function catalogoGuardar(config){
    const data = catalogoCollectFormData(config);
    const { valido, faltantes } = catalogoValidateForm(config, data);
    if(!valido){
      showToast('danger', 'No es posible guardar', `Faltan: ${faltantes.join(', ')}.`);
      return;
    }

    const payload = await config.mapearUIaDB(data);
    const editingId = config.obtenerEditingId();
    const nombreToast = config.nombreParaToast(data);

    if(editingId){
      const { error } = await supabaseClient.from(config.tabla).update(payload).eq('id', editingId);
      if(error){
        console.error(`Error actualizando ${config.tabla}:`, error);
        showToast('danger', 'No se pudo actualizar', error.message);
        return;
      }
      showToast('success', `${config.nombreSingular} actualizado`, `${nombreToast} se guardó correctamente.`);
    }else{
      const { data: userData } = await supabaseClient.auth.getUser();
      const userId = userData && userData.user ? userData.user.id : null;

      const { error } = await supabaseClient.from(config.tabla).insert(Object.assign({ user_id: userId }, payload));
      if(error){
        console.error(`Error creando en ${config.tabla}:`, error);
        showToast('danger', `No se pudo crear`, error.message);
        return;
      }
      showToast('success', `${config.nombreSingular} creado`, `${nombreToast} ya está disponible.`);
    }

    await catalogoCargarDesdeSupabase(config);
    catalogoRenderTabla(config);
    if(config.alTerminarGuardar) config.alTerminarGuardar();
    catalogoResetForm(config);
  }

  function catalogoEditar(config, id){
    const item = config.obtenerEstadoArray().find(i => i.id === id);
    if(!item) return;
    config.establecerEditingId(id);
    catalogoPopulateForm(config, item);
    if(config.idBadgeEditando) document.getElementById(config.idBadgeEditando).style.display = 'inline-flex';
    if(config.idSubtitulo) document.getElementById(config.idSubtitulo).textContent = `Editando "${item[config.campoNombrePrincipal]}"`;
    if(config.idLabelBotonGuardar) document.getElementById(config.idLabelBotonGuardar).textContent = config.textoBotonGuardarEditando;
    if(config.idFormCard) document.getElementById(config.idFormCard).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // No se elimina nada físicamente (misma filosofía que Cuentas): solo se
  // alterna activo/inactivo, preservando la integridad de lo que ya lo referencia.
  async function catalogoToggleEstado(config, id){
    const item = config.obtenerEstadoArray().find(i => i.id === id);
    if(!item) return;
    const nuevoEstado = item.estado === config.estadoActivoLabel ? config.estadoInactivoLabel : config.estadoActivoLabel;
    const esActivo = nuevoEstado === config.estadoActivoLabel;

    const { error } = await supabaseClient.from(config.tabla).update({ is_active: esActivo }).eq('id', id);
    if(error){
      console.error(`Error actualizando estado en ${config.tabla}:`, error);
      showToast('danger', 'No se pudo actualizar el estado', error.message);
      return;
    }

    await catalogoCargarDesdeSupabase(config);
    catalogoRenderTabla(config);
    if(config.alTerminarToggle) config.alTerminarToggle();
    showToast('success', 'Estado actualizado', `${item[config.campoNombrePrincipal]} ahora está ${nuevoEstado}.`);
  }

  // Sprint 5 (parte 2) — DELETE físico real. Distinto de catalogoToggleEstado:
  // esto no se puede deshacer. El propio index.html debe traer, por cada
  // catálogo, el botón con la clase que indique config.claseBotonEliminar —
  // la confirmación se pide SIEMPRE antes de llamar a esta función (ver
  // catalogoAttachListeners), nunca se borra sin que el usuario confirme.
  async function catalogoEliminarDefinitivo(config, id){
    const item = config.obtenerEstadoArray().find(i => i.id === id);
    const { error } = await supabaseClient.from(config.tabla).delete().eq('id', id);
    if(error){
      console.error(`Error eliminando definitivamente en ${config.tabla}:`, error);
      showToast('danger', 'No se pudo eliminar', error.message);
      return;
    }

    await catalogoCargarDesdeSupabase(config);
    catalogoRenderTabla(config);
    if(config.alTerminarToggle) config.alTerminarToggle(); // mismo hook: repuebla selects relacionados
    showToast('success', 'Eliminado definitivamente', `${item ? item[config.campoNombrePrincipal] : 'El registro'} se borró de la base de datos.`);
  }

  function catalogoRenderTabla(config){
    const tbody = document.getElementById(config.idTablaBody);
    if(!tbody) return;
    const lista = config.obtenerEstadoArray();
    if(config.idContador) document.getElementById(config.idContador).textContent = lista.length;

    if(lista.length === 0){
      tbody.innerHTML = `<tr class="empty-row"><td colspan="${config.colspanVacio}">${config.mensajeVacio}</td></tr>`;
      return;
    }
    tbody.innerHTML = lista.map(config.renderFila).join('');
  }

  function catalogoAttachListeners(config){
    document.getElementById(config.idBotonGuardar).addEventListener('click', () => catalogoGuardar(config));
    document.getElementById(config.idBotonCancelar).addEventListener('click', () => catalogoResetForm(config));

    document.querySelectorAll(`[data-${config.atributoCampo}]`).forEach(el => {
      el.addEventListener('input', () => {
        el.classList.remove('is-invalid');
        const campo = el.dataset[config.datasetCampo];
        const msg = document.querySelector(`[data-${config.atributoErrorFor}="${campo}"]`);
        if(msg) msg.classList.remove('visible');
      });
    });

    document.getElementById(config.idTablaBody).addEventListener('click', (e) => {
      const editBtn = e.target.closest(`.${config.claseBotonEditar}`);
      const toggleBtn = e.target.closest(`.${config.claseBotonToggle}`);
      const deleteBtn = config.claseBotonEliminar ? e.target.closest(`.${config.claseBotonEliminar}`) : null;
      if(editBtn){ catalogoEditar(config, editBtn.dataset.id); return; }
      if(toggleBtn){ catalogoToggleEstado(config, toggleBtn.dataset.id); return; }
      if(deleteBtn){
        const id = deleteBtn.dataset.id;
        const item = config.obtenerEstadoArray().find(i => i.id === id);
        const nombre = item ? item[config.campoNombrePrincipal] : 'este registro';
        openModal({
          titulo: 'Eliminar definitivamente',
          cuerpo: `¿Seguro que quieres eliminar "${nombre}" de forma permanente? Esta acción no se puede deshacer.`,
          onConfirm: () => catalogoEliminarDefinitivo(config, id)
        });
      }
    });
  }

  // Puebla un <select> con filas de cualquier tabla — generaliza lo que antes
  // se escribía a mano por cada FK (ej. poblarSelectMercadoActivo en
  // assets.js). Útil para relaciones simples de un solo nivel (id + etiqueta).
  async function catalogoPoblarSelectFK({ idSelect, tabla, camposSelect, ordenarPor, etiquetaFn }){
    const select = document.getElementById(idSelect);
    if(!select) return;
    const { data, error } = await supabaseClient
      .from(tabla)
      .select(camposSelect || 'id, name')
      .order(ordenarPor || 'sort_order', { ascending: true });

    if(error){
      console.error(`No se pudo cargar ${tabla} para el select:`, error);
      showToast('danger', 'No se pudo cargar', error.message);
      return;
    }
    select.innerHTML = `<option value="">Selecciona…</option>` +
      (data || []).map(row => `<option value="${row.id}">${escapeHtml(etiquetaFn(row))}</option>`).join('');
  }
