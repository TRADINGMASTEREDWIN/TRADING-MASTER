/* ============================================================
   GESTIÓN DE VARIABLES — Trading Master

   Administrador completo de las 3 tablas que forman el motor
   configurable de Variables de Decisión:
     variable_categories -> trading_variables -> variable_options

   Construido sobre el mismo motor genérico de catálogos usado en
   Activos (js/catalog.js) — 3 configuraciones, no 3 CRUD reescritos
   a mano. Las relaciones (categoría de una variable, variable de
   una opción) se resuelven con selects poblados desde Supabase vía
   catalogoPoblarSelectFK() (también genérico, ver catalog.js).

   Este Sprint es SOLO el administrador — no toca el formulario de
   Trades ni sus listas fijas (ACTIVOS_FAVORITOS, LIQUIDEZ_PESO,
   etc.). Esa integración es el siguiente Sprint, según lo acordado.

   Depende de:
   - js/catalog.js  -> motor genérico de catálogos
   - js/supabase.js -> objeto global `supabaseClient`
   - js/trades.js   -> leerSegmentedActivo(), aplicarSegmentedActivo()
   - utils.js       -> escapeHtml()
   - index.html     -> showToast()
   ============================================================ */

  let categoriasVariables = [];
  let editingCategoriaVariableId = null;

  let variablesTrading = [];
  let editingVariableTradingId = null;

  let opcionesVariables = [];
  let editingOpcionVariableId = null;

  /* ============================================================
     SPRINT — Administrador de Variables con navegación jerárquica
     (Categoría → Variables de la categoría → Opciones de la Variable).
     Estado de navegación puro — no toca variable_categories,
     trading_variables, ni variable_options. Solo decide qué subconjunto
     de los arreglos ya cargados se muestra en cada tabla.
     ============================================================ */
  let categoriaVariablesSeleccionadaId = null; // null = "Todas"
  let variableSeleccionadaId = null;           // qué Variable muestra sus Opciones ahora mismo

  // Filtra por trading_variables.category_id — la misma relación que ya
  // existe, ninguna nueva. null = sin filtrar ("Todas").
  function variablesDeLaCategoriaSeleccionada(){
    if(!categoriaVariablesSeleccionadaId) return variablesTrading;
    return variablesTrading.filter(v => v.categoria === categoriaVariablesSeleccionadaId);
  }

  // Filtra por variable_options.variable_id — igual, relación ya existente.
  function opcionesDeLaVariableSeleccionada(){
    if(!variableSeleccionadaId) return [];
    return opcionesVariables.filter(o => o.variable === variableSeleccionadaId);
  }

  /* ============================================================
     1. CATEGORÍAS DE VARIABLES (variable_categories)
     ============================================================ */

  function mapearCategoriaVariableUIaSupabase(data){
    return {
      code: data.codigo,
      name: data.nombre,
      description: data.descripcion || null,
      context: data.contexto || null,
      phase: data.fase || 'PRE_TRADE',
      is_active: data.estado === 'activo'
    };
  }

  function mapearCategoriaVariableSupabaseAUI(row){
    return {
      id: row.id,
      codigo: row.code,
      nombre: row.name,
      descripcion: row.description || '',
      contexto: row.context || '',
      fase: row.phase,
      estado: row.is_active ? 'Activo' : 'Inactivo'
    };
  }

  const configCategoriasVariables = {
    tabla: 'variable_categories',
    selectQuery: '*',
    ordenarPor: 'created_at',

    atributoCampo: 'categoriavar-campo',
    datasetCampo: 'categoriavarCampo',
    atributoErrorFor: 'categoriavar-error-for',
    datasetErrorFor: 'categoriavarErrorFor',

    idSegmentedEstado: 'estadoCategoriaVarSegmented',
    estadoActivoLabel: 'Activo',
    estadoInactivoLabel: 'Inactivo',
    valorEstadoActivoDefault: 'activo',

    camposRequeridos: [
      { campo: 'codigo', etiqueta: 'Código' },
      { campo: 'nombre', etiqueta: 'Nombre' }
    ],

    idBotonGuardar: 'categoriaVarSaveBtn',
    idBotonCancelar: 'categoriaVarCancelBtn',
    idBadgeEditando: 'categoriaVarEditBadge',
    idSubtitulo: 'categoriaVarFormSub',
    idLabelBotonGuardar: 'categoriaVarSaveBtnLabel',
    textoSubtituloDefault: 'Crea una nueva categoría de Variables',
    textoBotonGuardarDefault: 'Guardar categoría',
    textoBotonGuardarEditando: 'Actualizar categoría',
    idFormCard: 'categoriavar-form-card',

    idTablaBody: 'categoriasVarTableBody',
    idContador: 'categoriasVarCount',
    colspanVacio: 4,
    mensajeVacio: 'Aún no has creado ninguna categoría. Usa el formulario de arriba para crear la primera (ej. "Liquidez", "Estructura").',

    claseBotonEditar: 'btn-edit-categoriavar',
    claseBotonToggle: 'btn-toggle-categoriavar',
    claseBotonEliminar: 'btn-delete-categoriavar',

    campoNombrePrincipal: 'nombre',
    nombreSingular: 'Categoría',
    nombreParaToast: (data) => data.nombre,

    obtenerEstadoArray: () => categoriasVariables,
    establecerEstadoArray: (nuevo) => { categoriasVariables = nuevo; },
    obtenerEditingId: () => editingCategoriaVariableId,
    establecerEditingId: (id) => { editingCategoriaVariableId = id; },

    mapearUIaDB: mapearCategoriaVariableUIaSupabase,
    mapearDBaUI: mapearCategoriaVariableSupabaseAUI,

    renderFila: (c) => `<tr>
      <td>${escapeHtml(c.nombre || '—')} <span style="color:var(--color-text-muted); font-size:var(--fs-xs);">(${escapeHtml(c.codigo)})</span></td>
      <td>${escapeHtml(c.fase || '—')}</td>
      <td>${c.estado === 'Activo'
        ? `<span class="badge success"><span class="badge-dot"></span>Activo</span>`
        : `<span class="badge neutral"><span class="badge-dot"></span>Inactivo</span>`}</td>
      <td class="col-actions">
        <div class="row-actions">
          <button class="btn-edit-categoriavar" data-id="${c.id}" title="Editar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg>
          </button>
          <button class="btn-toggle-categoriavar" data-id="${c.id}" title="${c.estado === 'Activo' ? 'Inactivar' : 'Activar'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
          </button>
          <button class="btn-delete-categoriavar" data-id="${c.id}" title="Eliminar definitivamente">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
          </button>
        </div>
      </td>
    </tr>`,

    // Al crear/editar/activar una categoría, el select de Categoría del
    // formulario de Variables (más abajo) debe reflejar el cambio.
    // Sprint — también el sidebar de navegación jerárquica.
    alTerminarGuardar: () => { poblarSelectCategoriaParaVariable(); renderCategoriasVariablesSidebar(); },
    alTerminarToggle: () => { poblarSelectCategoriaParaVariable(); renderCategoriasVariablesSidebar(); }
  };

  async function cargarCategoriasVariablesDesdeSupabase(){ await catalogoCargarDesdeSupabase(configCategoriasVariables); }
  function renderCategoriasVariablesTable(){ catalogoRenderTabla(configCategoriasVariables); }
  async function guardarCategoriaVariable(){ await catalogoGuardar(configCategoriasVariables); }
  function editarCategoriaVariable(id){ catalogoEditar(configCategoriasVariables, id); }
  async function toggleEstadoCategoriaVariable(id){ await catalogoToggleEstado(configCategoriasVariables, id); }
  function attachCategoriasVariablesListeners(){ catalogoAttachListeners(configCategoriasVariables); }


  /* ============================================================
     2. VARIABLES (trading_variables)
     ============================================================ */

  function mapearVariableUIaSupabase(data){
    // Sprint UX-2A — config es un JSONB genérico y extensible, no exclusivo
    // de "periodo". Hoy solo construimos {periodo:...} porque es lo único
    // que el formulario pide, pero el campo en sí no asume esa forma.
    const config = {};
    if(data.periodo && data.periodo.trim() !== ''){
      config.periodo = parseInt(data.periodo, 10);
    }
    return {
      category_id: data.categoria || null,
      data_type_id: data.tipoDato || null,
      code: data.codigo,
      name: data.nombre,
      config,
      phase: data.fase || 'PRE_TRADE', // Sprint 4.2
      importance_enabled: data.importancia === 'si',
      influence_enabled: data.influye !== 'no', // Sprint 4.3 — default true si el campo no viene en el HTML (compatibilidad)
      is_required: data.requerida === 'si',
      is_ai_enabled: data.ia === 'si',
      is_active: data.estado === 'activo'
    };
  }

  function mapearVariableSupabaseAUI(row){
    const config = row.config || {};
    return {
      id: row.id,
      codigo: row.code,
      nombre: row.name,
      categoria: row.category_id,
      categoriaNombre: row.variable_categories ? row.variable_categories.name : '',
      tipoDato: row.data_type_id,
      tipoDatoNombre: row.data_types ? row.data_types.name : '',
      tipoDatoCodigo: row.data_types ? row.data_types.code : '',
      periodo: config.periodo !== undefined ? String(config.periodo) : '',
      fase: row.phase || 'PRE_TRADE', // Sprint 4.2
      importancia: row.importance_enabled,
      influye: row.influence_enabled, // Sprint 4.3 — mismo patrón que importancia/requerida/ia
      requerida: row.is_required,
      ia: row.is_ai_enabled,
      estado: row.is_active ? 'Activo' : 'Inactivo'
    };
  }

  const configVariables = {
    tabla: 'trading_variables',
    selectQuery: '*, variable_categories(name), data_types(name, code)',
    ordenarPor: 'created_at',

    atributoCampo: 'variable-campo',
    datasetCampo: 'variableCampo',
    atributoErrorFor: 'variable-error-for',
    datasetErrorFor: 'variableErrorFor',

    idSegmentedEstado: 'estadoVariableSegmented',
    estadoActivoLabel: 'Activo',
    estadoInactivoLabel: 'Inactivo',
    valorEstadoActivoDefault: 'activo',

    // Las 3 banderas booleanas usan el mismo mecanismo .segmented que
    // "estado", generalizado en catalog.js para admitir varios a la vez.
    camposSegmentedExtra: [
      { idSegmented: 'importanciaVariableSegmented', dataKey: 'importancia', valorDefault: 'no' },
      { idSegmented: 'requeridaVariableSegmented', dataKey: 'requerida', valorDefault: 'no' },
      { idSegmented: 'iaVariableSegmented', dataKey: 'ia', valorDefault: 'si' },
      { idSegmented: 'influenciaVariableSegmented', dataKey: 'influye', valorDefault: 'si' } // Sprint 4.3
    ],

    camposRequeridos: [
      { campo: 'categoria', etiqueta: 'Categoría' },
      { campo: 'tipoDato', etiqueta: 'Tipo de dato' },
      { campo: 'codigo', etiqueta: 'Código' },
      { campo: 'nombre', etiqueta: 'Nombre' }
    ],

    idBotonGuardar: 'variableSaveBtn',
    idBotonCancelar: 'variableCancelBtn',
    idBadgeEditando: 'variableEditBadge',
    idSubtitulo: 'variableFormSub',
    idLabelBotonGuardar: 'variableSaveBtnLabel',
    textoSubtituloDefault: 'Crea una nueva variable dentro de una categoría',
    textoBotonGuardarDefault: 'Guardar variable',
    textoBotonGuardarEditando: 'Actualizar variable',
    idFormCard: 'variable-form-card',

    idTablaBody: 'variablesTableBody',
    idContador: 'variablesCount',
    colspanVacio: 5,
    mensajeVacio: 'Aún no has creado ninguna variable. Primero crea una categoría arriba, luego agrega sus variables aquí (ej. "Peso", "Zona principal").',

    claseBotonEditar: 'btn-edit-variable',
    claseBotonToggle: 'btn-toggle-variable',
    claseBotonEliminar: 'btn-delete-variable',

    campoNombrePrincipal: 'nombre',
    nombreSingular: 'Variable',
    nombreParaToast: (data) => data.nombre,

    obtenerEstadoArray: () => variablesDeLaCategoriaSeleccionada(), // Sprint — filtrado por categoría; establecerEstadoArray sigue guardando el arreglo COMPLETO
    establecerEstadoArray: (nuevo) => { variablesTrading = nuevo; },
    obtenerEditingId: () => editingVariableTradingId,
    establecerEditingId: (id) => { editingVariableTradingId = id; },

    mapearUIaDB: mapearVariableUIaSupabase,
    mapearDBaUI: mapearVariableSupabaseAUI,

    renderFila: (v) => `<tr>
      <td>${escapeHtml(v.nombre || '—')} <span style="color:var(--color-text-muted); font-size:var(--fs-xs);">(${escapeHtml(v.codigo)})</span></td>
      <td>${escapeHtml(v.categoriaNombre || '—')}</td>
      <td>${escapeHtml(v.tipoDatoNombre || '—')}</td>
      <td>${v.estado === 'Activo'
        ? `<span class="badge success"><span class="badge-dot"></span>Activo</span>`
        : `<span class="badge neutral"><span class="badge-dot"></span>Inactivo</span>`}</td>
      <td class="col-actions">
        <div class="row-actions">
          <button class="btn-ver-opciones-variable" data-id="${v.id}" title="Ver Opciones">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="btn-edit-variable" data-id="${v.id}" title="Editar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg>
          </button>
          <button class="btn-toggle-variable" data-id="${v.id}" title="${v.estado === 'Activo' ? 'Inactivar' : 'Activar'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
          </button>
          <button class="btn-delete-variable" data-id="${v.id}" title="Eliminar definitivamente">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
          </button>
        </div>
      </td>
    </tr>`,

    alTerminarGuardar: () => { poblarSelectVariableParaOpcion(); renderVariablesTable(); },
    alTerminarToggle: () => { poblarSelectVariableParaOpcion(); renderVariablesTable(); }
  };

  async function cargarVariablesDesdeSupabase(){ await catalogoCargarDesdeSupabase(configVariables); }
  function renderVariablesTable(){ catalogoRenderTabla(configVariables); }

  /* ============================================================
     SPRINT — Navegación jerárquica: sidebar de Categorías (dinámico,
     desde Supabase — nunca hardcodeado), breadcrumb, y el cambio entre
     el panel "Variables de la categoría" y "Opciones de la Variable".
     ============================================================ */

  function renderCategoriasVariablesSidebar(){
    const contenedor = document.getElementById('variablesCategoriaSidebar');
    if(!contenedor) return;
    const activas = categoriasVariables.filter(c => c.estado === 'Activo');
    const itemTodas = `<a class="config-subnav-item${!categoriaVariablesSeleccionadaId ? ' active' : ''}" data-var-categoria="">Todas</a>`;
    const itemsCategorias = activas.map(c => `
      <a class="config-subnav-item${categoriaVariablesSeleccionadaId === c.id ? ' active' : ''}" data-var-categoria="${c.id}">${escapeHtml(c.nombre)}</a>
    `).join('');
    contenedor.innerHTML = itemTodas + itemsCategorias;
  }

  function attachCategoriasVariablesSidebarListener(){
    const contenedor = document.getElementById('variablesCategoriaSidebar');
    if(!contenedor) return;
    contenedor.addEventListener('click', (e) => {
      const item = e.target.closest('[data-var-categoria]');
      if(!item) return;
      categoriaVariablesSeleccionadaId = item.dataset.varCategoria || null;
      variableSeleccionadaId = null; // al cambiar de categoría, se sale de cualquier Variable abierta
      mostrarPanelVariables();
      renderCategoriasVariablesSidebar();
      renderVariablesTable();
      actualizarBreadcrumbVariables();
    });
  }

  function nombreCategoriaSeleccionada(){
    if(!categoriaVariablesSeleccionadaId) return 'Todas';
    const cat = categoriasVariables.find(c => c.id === categoriaVariablesSeleccionadaId);
    return cat ? cat.nombre : 'Todas';
  }

  function actualizarBreadcrumbVariables(){
    const el = document.getElementById('variablesBreadcrumb');
    if(!el) return;
    let texto = `Variables / ${nombreCategoriaSeleccionada()}`;
    if(variableSeleccionadaId){
      const v = variablesTrading.find(x => x.id === variableSeleccionadaId);
      texto += ` / ${v ? v.nombre : ''}`;
    }
    el.textContent = texto; // textContent ya es seguro por sí mismo, no necesita escapeHtml
  }

  function mostrarPanelVariables(){
    const panelVariables = document.getElementById('panelListaVariables');
    const panelOpciones = document.getElementById('panelListaOpciones');
    if(panelVariables) panelVariables.style.display = '';
    if(panelOpciones) panelOpciones.style.display = 'none';
  }

  function mostrarPanelOpciones(){
    const panelVariables = document.getElementById('panelListaVariables');
    const panelOpciones = document.getElementById('panelListaOpciones');
    if(panelVariables) panelVariables.style.display = 'none';
    if(panelOpciones) panelOpciones.style.display = '';
  }

  function verOpcionesDeVariable(variableId){
    variableSeleccionadaId = variableId;
    mostrarPanelOpciones();
    renderOpcionesTable();
    actualizarBreadcrumbVariables();
  }

  function volverAVariables(){
    variableSeleccionadaId = null;
    mostrarPanelVariables();
    actualizarBreadcrumbVariables();
  }

  function attachVerOpcionesListener(){
    const tbody = document.getElementById('variablesTableBody');
    if(tbody){
      tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-ver-opciones-variable');
        if(btn) verOpcionesDeVariable(btn.dataset.id);
      });
    }
    const volverBtn = document.getElementById('volverAVariablesBtn');
    if(volverBtn) volverBtn.addEventListener('click', volverAVariables);
  }

  // Sprint UX-2A — envuelve catalogoGuardar() (sin modificarlo) para además
  // sincronizar las Temporalidades vinculadas cuando el tipo de dato es
  // "Matriz por temporalidad". Se captura la selección ANTES de llamar a
  // catalogoGuardar() porque esa función limpia el formulario al terminar.
  async function guardarVariable(){
    const esMatriz = esTipoMatrizSeleccionado();
    const contenedorTf = document.getElementById('temporalidadesVariableContainer');
    const temporalidadesSeleccionadas = (esMatriz && contenedorTf)
      ? Array.from(contenedorTf.querySelectorAll('.chk-temporalidad-variable:checked')).map(chk => chk.value)
      : null;

    const idGuardado = await catalogoGuardar(configVariables);

    if(idGuardado && temporalidadesSeleccionadas !== null){
      await sincronizarTemporalidadesDeVariable(idGuardado, temporalidadesSeleccionadas);
    }
    resetVariableFormMatriz();
  }

  // Sprint UX-2A — envuelve catalogoEditar() para además marcar los
  // checkboxes de Temporalidades ya vinculadas y mostrar/ocultar el bloque
  // de configuración de matriz según el tipo de la Variable que se edita.
  async function editarVariable(id){
    catalogoEditar(configVariables, id);
    actualizarVisibilidadConfigMatriz();
    await marcarTemporalidadesDeVariable(id);
  }

  async function toggleEstadoVariable(id){ await catalogoToggleEstado(configVariables, id); }

  function attachVariablesListeners(){
    // Sprint UX-2A — se usan los ganchos manejadorGuardarPersonalizado /
    // manejadorCancelarPersonalizado (ver catalog.js) en vez del comportamiento
    // genérico, para poder sincronizar las Temporalidades de la matriz.
    configVariables.manejadorGuardarPersonalizado = guardarVariable;
    configVariables.manejadorCancelarPersonalizado = resetVariableFormMatriz;
    catalogoAttachListeners(configVariables);

    const selectTipo = document.getElementById('selectDataTypeVariable');
    if(selectTipo) selectTipo.addEventListener('change', actualizarVisibilidadConfigMatriz);
  }

  function poblarSelectCategoriaParaVariable(){
    return catalogoPoblarSelectFK({
      idSelect: 'selectCategoriaVariable',
      tabla: 'variable_categories',
      camposSelect: 'id, name',
      ordenarPor: 'sort_order',
      etiquetaFn: (row) => row.name
    });
  }

  function poblarSelectDataTypeParaVariable(){
    return catalogoPoblarSelectFK({
      idSelect: 'selectDataTypeVariable',
      tabla: 'data_types',
      camposSelect: 'id, name',
      ordenarPor: 'name',
      etiquetaFn: (row) => row.name
    });
  }

  /* ============================================================
     SPRINT UX-2A — Motor de Indicadores Técnicos
     Soporte para Variables de tipo "timeframe_matrix" (ej. EMA): un campo
     de Período (dentro de config, genérico) y un selector de qué
     Temporalidades usa esa Variable en particular (tabla de relación
     trading_variable_timeframes, mismo patrón que trading_horizon_timeframes).
     ============================================================ */

  // Independiente del fetch de data_types que ya hace variablesObservadas.js
  // (mismo criterio de no acoplar módulos más de lo necesario) — aquí solo
  // se necesita para saber si el tipo seleccionado en ESTE formulario es
  // "timeframe_matrix", y así mostrar/ocultar el bloque de configuración.
  let dataTypesPorIdParaVariables = {};

  async function cargarDataTypesParaFormularioVariable(){
    const { data, error } = await supabaseClient.from('data_types').select('id, code');
    if(error){
      console.error('No se pudieron cargar los tipos de dato para el formulario de Variables:', error);
      dataTypesPorIdParaVariables = {};
      return;
    }
    dataTypesPorIdParaVariables = {};
    (data || []).forEach(dt => { dataTypesPorIdParaVariables[dt.id] = dt.code; });
  }

  function esTipoMatrizSeleccionado(){
    const select = document.getElementById('selectDataTypeVariable');
    return !!(select && dataTypesPorIdParaVariables[select.value] === 'timeframe_matrix');
  }

  // Muestra/oculta el bloque "Período + Temporalidades" según el Tipo de
  // dato elegido — genérico (no exclusivo de EMA): cualquier Variable futura
  // de tipo timeframe_matrix obtiene este mismo bloque automáticamente.
  function actualizarVisibilidadConfigMatriz(){
    const wrapper = document.getElementById('configMatrizVariableWrapper');
    if(!wrapper) return;
    wrapper.style.display = esTipoMatrizSeleccionado() ? '' : 'none';
  }

  // Puebla los checkboxes de Temporalidades reutilizando temporalidadesGenerales
  // — un arreglo que YA carga y mantiene js/catalogosGenerales.js (Fase 3).
  // Cero consultas nuevas para esto.
  function poblarTemporalidadesParaVariable(){
    const contenedor = document.getElementById('temporalidadesVariableContainer');
    if(!contenedor) return;
    if(typeof temporalidadesGenerales === 'undefined'){
      console.error('[Variables] temporalidadesGenerales no está definido — revisa que catalogosGenerales.js cargue antes que variables.js.');
      return;
    }
    const activas = temporalidadesGenerales.filter(t => t.estado === 'Activo');
    contenedor.innerHTML = activas.map(t => `
      <label style="display:inline-flex; align-items:center; gap:6px; margin-right:14px; margin-bottom:8px; font-weight:400;">
        <input type="checkbox" class="chk-temporalidad-variable" value="${t.id}"> ${escapeHtml(t.codigo)}
      </label>
    `).join('');
  }

  // Reemplaza TODOS los vínculos de la Variable por los que estén marcados
  // ahora mismo — mismo criterio simple ya usado para variable_options
  // (borrar y volver a insertar, sin intentar diffing).
  async function sincronizarTemporalidadesDeVariable(variableId, temporalidadIds){
    const { error: errorBorrar } = await supabaseClient
      .from('trading_variable_timeframes').delete().eq('variable_id', variableId);
    if(errorBorrar){
      console.error('No se pudieron limpiar las temporalidades previas de la Variable:', errorBorrar);
      showToast('danger', 'No se pudieron actualizar las temporalidades', errorBorrar.message);
      return;
    }
    if(temporalidadIds.length === 0) return;

    const filas = temporalidadIds.map((tfId, i) => ({ variable_id: variableId, timeframe_id: tfId, sort_order: i }));
    const { error: errorInsertar } = await supabaseClient.from('trading_variable_timeframes').insert(filas);
    if(errorInsertar){
      console.error('No se pudieron guardar las temporalidades de la Variable:', errorInsertar);
      showToast('danger', 'No se pudieron guardar las temporalidades', errorInsertar.message);
    }
  }

  async function marcarTemporalidadesDeVariable(variableId){
    const contenedor = document.getElementById('temporalidadesVariableContainer');
    if(!contenedor) return;
    contenedor.querySelectorAll('.chk-temporalidad-variable').forEach(chk => { chk.checked = false; });

    const { data, error } = await supabaseClient
      .from('trading_variable_timeframes').select('timeframe_id').eq('variable_id', variableId);
    if(error){
      console.error('No se pudieron cargar las temporalidades vinculadas a la Variable:', error);
      return;
    }
    const idsVinculados = new Set((data || []).map(r => r.timeframe_id));
    contenedor.querySelectorAll('.chk-temporalidad-variable').forEach(chk => {
      chk.checked = idsVinculados.has(chk.value);
    });
  }

  function resetVariableFormMatriz(){
    catalogoResetForm(configVariables);
    const contenedor = document.getElementById('temporalidadesVariableContainer');
    if(contenedor) contenedor.querySelectorAll('.chk-temporalidad-variable').forEach(chk => { chk.checked = false; });
    actualizarVisibilidadConfigMatriz();
  }


  /* ============================================================
     3. OPCIONES DE VARIABLES (variable_options)
     ============================================================ */

  function mapearOpcionUIaSupabase(data){
    return {
      variable_id: data.variable || null,
      code: data.codigo,
      label: data.etiqueta,
      color: data.color || null,
      icon: data.icono || null,
      is_active: data.estado === 'activo'
    };
  }

  function mapearOpcionSupabaseAUI(row){
    return {
      id: row.id,
      codigo: row.code,
      etiqueta: row.label,
      variable: row.variable_id,
      variableNombre: row.trading_variables ? row.trading_variables.name : '',
      color: row.color || '',
      icono: row.icon || '',
      estado: row.is_active ? 'Activo' : 'Inactivo'
    };
  }

  const configOpciones = {
    tabla: 'variable_options',
    selectQuery: '*, trading_variables(name)',
    ordenarPor: 'created_at',

    atributoCampo: 'opcionvar-campo',
    datasetCampo: 'opcionvarCampo',
    atributoErrorFor: 'opcionvar-error-for',
    datasetErrorFor: 'opcionvarErrorFor',

    idSegmentedEstado: 'estadoOpcionVarSegmented',
    estadoActivoLabel: 'Activo',
    estadoInactivoLabel: 'Inactivo',
    valorEstadoActivoDefault: 'activo',

    camposRequeridos: [
      { campo: 'variable', etiqueta: 'Variable' },
      { campo: 'codigo', etiqueta: 'Código' },
      { campo: 'etiqueta', etiqueta: 'Etiqueta' }
    ],

    idBotonGuardar: 'opcionVarSaveBtn',
    idBotonCancelar: 'opcionVarCancelBtn',
    idBadgeEditando: 'opcionVarEditBadge',
    idSubtitulo: 'opcionVarFormSub',
    idLabelBotonGuardar: 'opcionVarSaveBtnLabel',
    textoSubtituloDefault: 'Crea una nueva opción dentro de una variable',
    textoBotonGuardarDefault: 'Guardar opción',
    textoBotonGuardarEditando: 'Actualizar opción',
    idFormCard: 'opcionvar-form-card',

    idTablaBody: 'opcionesVarTableBody',
    idContador: 'opcionesVarCount',
    colspanVacio: 4,
    mensajeVacio: 'Aún no has creado ninguna opción. Primero crea una variable arriba (ej. "Peso"), luego agrega sus opciones aquí (ej. "Esencial", "Importante").',

    claseBotonEditar: 'btn-edit-opcionvar',
    claseBotonToggle: 'btn-toggle-opcionvar',
    claseBotonEliminar: 'btn-delete-opcionvar',

    campoNombrePrincipal: 'etiqueta',
    nombreSingular: 'Opción',
    nombreParaToast: (data) => data.etiqueta,

    obtenerEstadoArray: () => opcionesDeLaVariableSeleccionada(), // Sprint — filtrado por Variable; establecerEstadoArray sigue guardando el arreglo COMPLETO
    establecerEstadoArray: (nuevo) => { opcionesVariables = nuevo; },
    obtenerEditingId: () => editingOpcionVariableId,
    establecerEditingId: (id) => { editingOpcionVariableId = id; },

    mapearUIaDB: mapearOpcionUIaSupabase,
    mapearDBaUI: mapearOpcionSupabaseAUI,

    renderFila: (o) => `<tr>
      <td>${o.icono ? escapeHtml(o.icono) + ' ' : ''}${escapeHtml(o.etiqueta || '—')} <span style="color:var(--color-text-muted); font-size:var(--fs-xs);">(${escapeHtml(o.codigo)})</span></td>
      <td>${escapeHtml(o.variableNombre || '—')}</td>
      <td>${o.estado === 'Activo'
        ? `<span class="badge success"><span class="badge-dot"></span>Activo</span>`
        : `<span class="badge neutral"><span class="badge-dot"></span>Inactivo</span>`}</td>
      <td class="col-actions">
        <div class="row-actions">
          <button class="btn-edit-opcionvar" data-id="${o.id}" title="Editar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg>
          </button>
          <button class="btn-toggle-opcionvar" data-id="${o.id}" title="${o.estado === 'Activo' ? 'Inactivar' : 'Activar'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
          </button>
          <button class="btn-delete-opcionvar" data-id="${o.id}" title="Eliminar definitivamente">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
          </button>
        </div>
      </td>
    </tr>`
  };

  async function cargarOpcionesDesdeSupabase(){ await catalogoCargarDesdeSupabase(configOpciones); }
  function renderOpcionesTable(){ catalogoRenderTabla(configOpciones); }
  async function guardarOpcionVariable(){ await catalogoGuardar(configOpciones); }
  function editarOpcionVariable(id){ catalogoEditar(configOpciones, id); }
  async function toggleEstadoOpcionVariable(id){ await catalogoToggleEstado(configOpciones, id); }
  function attachOpcionesListeners(){ catalogoAttachListeners(configOpciones); }

  function poblarSelectVariableParaOpcion(){
    return catalogoPoblarSelectFK({
      idSelect: 'selectVariableOpcion',
      tabla: 'trading_variables',
      camposSelect: 'id, name, variable_categories(name)',
      ordenarPor: 'sort_order',
      etiquetaFn: (row) => `${row.variable_categories ? row.variable_categories.name + ' — ' : ''}${row.name}`
    });
  }


  /* ============================================================
     ARRANQUE DEL MÓDULO — llamado desde app.js (initApp)
     ============================================================ */
  async function inicializarModuloVariables(){
    await cargarCategoriasVariablesDesdeSupabase();
    await cargarVariablesDesdeSupabase();
    await cargarOpcionesDesdeSupabase();

    await poblarSelectCategoriaParaVariable();
    await poblarSelectDataTypeParaVariable();
    await poblarSelectVariableParaOpcion();

    // Sprint UX-2A — cargarDataTypesParaFormularioVariable() no depende de
    // nada más, se puede correr aquí. poblarTemporalidadesParaVariable() NO
    // se llama aquí a propósito: necesita temporalidadesGenerales, que
    // carga Fase 3 (inicializarCatalogosGenerales) DESPUÉS de este módulo
    // en app.js — se llama desde ahí, en el orden correcto.
    await cargarDataTypesParaFormularioVariable();
    actualizarVisibilidadConfigMatriz();

    renderCategoriasVariablesTable();
    renderVariablesTable();
    renderOpcionesTable();

    // Sprint — Navegación jerárquica: sidebar dinámico de Categorías +
    // breadcrumb inicial ("Variables / Todas"). El panel de Opciones
    // arranca vacío porque opcionesDeLaVariableSeleccionada() devuelve []
    // hasta que se entra a una Variable — comportamiento correcto, no un
    // caso especial que haya que manejar aquí.
    renderCategoriasVariablesSidebar();
    mostrarPanelVariables();
    actualizarBreadcrumbVariables();
  }

  function attachModuloVariablesListeners(){
    attachCategoriasVariablesListeners();
    attachVariablesListeners();
    attachOpcionesListeners();
    attachCategoriasVariablesSidebarListener(); // Sprint — Navegación jerárquica
    attachVerOpcionesListener();                // Sprint — Navegación jerárquica
  }
