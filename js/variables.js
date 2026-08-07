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
        </div>
      </td>
    </tr>`,

    // Al crear/editar/activar una categoría, el select de Categoría del
    // formulario de Variables (más abajo) debe reflejar el cambio.
    alTerminarGuardar: () => { poblarSelectCategoriaParaVariable(); },
    alTerminarToggle: () => { poblarSelectCategoriaParaVariable(); }
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
    return {
      category_id: data.categoria || null,
      data_type_id: data.tipoDato || null,
      code: data.codigo,
      name: data.nombre,
      importance_enabled: data.importancia === 'si',
      is_required: data.requerida === 'si',
      is_ai_enabled: data.ia === 'si',
      is_active: data.estado === 'activo'
    };
  }

  function mapearVariableSupabaseAUI(row){
    return {
      id: row.id,
      codigo: row.code,
      nombre: row.name,
      categoria: row.category_id,
      categoriaNombre: row.variable_categories ? row.variable_categories.name : '',
      tipoDato: row.data_type_id,
      tipoDatoNombre: row.data_types ? row.data_types.name : '',
      importancia: row.importance_enabled,
      requerida: row.is_required,
      ia: row.is_ai_enabled,
      estado: row.is_active ? 'Activo' : 'Inactivo'
    };
  }

  const configVariables = {
    tabla: 'trading_variables',
    selectQuery: '*, variable_categories(name), data_types(name)',
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
      { idSegmented: 'iaVariableSegmented', dataKey: 'ia', valorDefault: 'si' }
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

    campoNombrePrincipal: 'nombre',
    nombreSingular: 'Variable',
    nombreParaToast: (data) => data.nombre,

    obtenerEstadoArray: () => variablesTrading,
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
          <button class="btn-edit-variable" data-id="${v.id}" title="Editar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg>
          </button>
          <button class="btn-toggle-variable" data-id="${v.id}" title="${v.estado === 'Activo' ? 'Inactivar' : 'Activar'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
          </button>
        </div>
      </td>
    </tr>`,

    alTerminarGuardar: () => { poblarSelectVariableParaOpcion(); },
    alTerminarToggle: () => { poblarSelectVariableParaOpcion(); }
  };

  async function cargarVariablesDesdeSupabase(){ await catalogoCargarDesdeSupabase(configVariables); }
  function renderVariablesTable(){ catalogoRenderTabla(configVariables); }
  async function guardarVariable(){ await catalogoGuardar(configVariables); }
  function editarVariable(id){ catalogoEditar(configVariables, id); }
  async function toggleEstadoVariable(id){ await catalogoToggleEstado(configVariables, id); }
  function attachVariablesListeners(){ catalogoAttachListeners(configVariables); }

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

    campoNombrePrincipal: 'etiqueta',
    nombreSingular: 'Opción',
    nombreParaToast: (data) => data.etiqueta,

    obtenerEstadoArray: () => opcionesVariables,
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

    renderCategoriasVariablesTable();
    renderVariablesTable();
    renderOpcionesTable();
  }

  function attachModuloVariablesListeners(){
    attachCategoriasVariablesListeners();
    attachVariablesListeners();
    attachOpcionesListeners();
  }
