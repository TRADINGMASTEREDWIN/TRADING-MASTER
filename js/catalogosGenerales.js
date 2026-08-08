/* ============================================================
   CATÁLOGOS GENERALES — Trading Master (Fase 3)

   6 catálogos administrables, todos construidos sobre el mismo
   motor genérico ya usado en Activos y Variables (js/catalog.js) —
   cero CRUD nuevo, cero motor nuevo:

   1. Brokers               (tabla: brokers)
   2. Mercados               (tabla: markets)
   3. Temporalidades         (tabla: timeframes)
   4. Horizontes de Trading  (tabla: trading_horizons)
   5. Tipos de Entrada       (tabla: entry_types)
   6. Direcciones            (tabla: directions — Long/Short)

   markets/timeframes/trading_horizons/brokers YA EXISTÍAN en la base
   de datos (con datos semilla, salvo brokers) — este archivo solo les
   agrega el administrador que les faltaba. directions/entry_types son
   las 2 tablas genuinamente nuevas de esta Fase (ver fase3_seed_catalogos.sql).

   Cada catálogo también alimenta su campo correspondiente del
   formulario de Trades (poblarSelectXOperacion / renderXOperacion) —
   sin tocar trades.js: collectFormData()/populateForm() ya leen y
   escriben [data-field] de forma genérica, así que un <select
   data-field="..."> nuevo (Tipo de Entrada) o un <select>/.segmented
   ya existente que ahora se puebla distinto (Mercado, Temporalidad,
   Tipo de Trade, Dirección) no requieren ningún cambio ahí.

   Depende de:
   - js/catalog.js  -> motor genérico de catálogos
   - js/supabase.js -> objeto global `supabaseClient`
   - utils.js       -> escapeHtml()
   - index.html     -> showToast(), openModal()
   ============================================================ */

  /* ============================================================
     1. BROKERS
     ============================================================ */
  let brokersGenerales = [];
  let editingBrokerGeneralId = null;

  function mapearBrokerUIaSupabase(data){
    return { name: data.nombre, website: data.sitioWeb || null, logo_url: data.logoUrl || null, is_active: data.estado === 'activo' };
  }
  function mapearBrokerSupabaseAUI(row){
    return { id: row.id, nombre: row.name, sitioWeb: row.website || '', logoUrl: row.logo_url || '', estado: row.is_active ? 'Activo' : 'Inactivo' };
  }
  const configBrokers = {
    tabla: 'brokers', ordenarPor: 'created_at',
    atributoCampo: 'broker-campo', datasetCampo: 'brokerCampo',
    atributoErrorFor: 'broker-error-for', datasetErrorFor: 'brokerErrorFor',
    idSegmentedEstado: 'estadoBrokerSegmented', estadoActivoLabel: 'Activo', estadoInactivoLabel: 'Inactivo', valorEstadoActivoDefault: 'activo',
    camposRequeridos: [{ campo: 'nombre', etiqueta: 'Nombre' }],
    idBotonGuardar: 'brokerSaveBtn', idBotonCancelar: 'brokerCancelBtn', idBadgeEditando: 'brokerEditBadge',
    idSubtitulo: 'brokerFormSub', idLabelBotonGuardar: 'brokerSaveBtnLabel',
    textoSubtituloDefault: 'Registra un nuevo broker', textoBotonGuardarDefault: 'Guardar broker', textoBotonGuardarEditando: 'Actualizar broker',
    idFormCard: 'broker-form-card',
    idTablaBody: 'brokersTableBody', idContador: 'brokersCount', colspanVacio: 3,
    mensajeVacio: 'Aún no has registrado ningún broker manualmente. También se crean solos al escribir la Plataforma en Cuentas.',
    claseBotonEditar: 'btn-edit-broker', claseBotonToggle: 'btn-toggle-broker', claseBotonEliminar: 'btn-delete-broker',
    campoNombrePrincipal: 'nombre', nombreSingular: 'Broker', nombreParaToast: (d) => d.nombre,
    obtenerEstadoArray: () => brokersGenerales, establecerEstadoArray: (n) => { brokersGenerales = n; },
    obtenerEditingId: () => editingBrokerGeneralId, establecerEditingId: (id) => { editingBrokerGeneralId = id; },
    mapearUIaDB: mapearBrokerUIaSupabase, mapearDBaUI: mapearBrokerSupabaseAUI,
    renderFila: (b) => `<tr>
      <td>${escapeHtml(b.nombre || '—')}</td>
      <td>${b.estado === 'Activo' ? `<span class="badge success"><span class="badge-dot"></span>Activo</span>` : `<span class="badge neutral"><span class="badge-dot"></span>Inactivo</span>`}</td>
      <td class="col-actions"><div class="row-actions">
        <button class="btn-edit-broker" data-id="${b.id}" title="Editar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg></button>
        <button class="btn-toggle-broker" data-id="${b.id}" title="${b.estado === 'Activo' ? 'Inactivar' : 'Activar'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg></button>
        <button class="btn-delete-broker" data-id="${b.id}" title="Eliminar definitivamente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
      </div></td></tr>`
  };
  async function cargarBrokersGeneralesDesdeSupabase(){ await catalogoCargarDesdeSupabase(configBrokers); }
  function renderBrokersGeneralesTable(){ catalogoRenderTabla(configBrokers); }
  async function guardarBrokerGeneral(){ await catalogoGuardar(configBrokers); }
  function editarBrokerGeneral(id){ catalogoEditar(configBrokers, id); }
  async function toggleEstadoBrokerGeneral(id){ await catalogoToggleEstado(configBrokers, id); }
  function attachBrokersGeneralesListeners(){ catalogoAttachListeners(configBrokers); }


  /* ============================================================
     2. MERCADOS
     ============================================================ */
  let mercadosGenerales = [];
  let editingMercadoGeneralId = null;

  function mapearMercadoUIaSupabase(data){ return { name: data.nombre, is_active: data.estado === 'activo' }; }
  function mapearMercadoSupabaseAUI(row){ return { id: row.id, nombre: row.name, estado: row.is_active ? 'Activo' : 'Inactivo' }; }
  const configMercados = {
    tabla: 'markets', ordenarPor: 'sort_order',
    atributoCampo: 'mercadogen-campo', datasetCampo: 'mercadogenCampo',
    atributoErrorFor: 'mercadogen-error-for', datasetErrorFor: 'mercadogenErrorFor',
    idSegmentedEstado: 'estadoMercadoGenSegmented', estadoActivoLabel: 'Activo', estadoInactivoLabel: 'Inactivo', valorEstadoActivoDefault: 'activo',
    camposRequeridos: [{ campo: 'nombre', etiqueta: 'Nombre' }],
    idBotonGuardar: 'mercadoGenSaveBtn', idBotonCancelar: 'mercadoGenCancelBtn', idBadgeEditando: 'mercadoGenEditBadge',
    idSubtitulo: 'mercadoGenFormSub', idLabelBotonGuardar: 'mercadoGenSaveBtnLabel',
    textoSubtituloDefault: 'Registra un nuevo mercado', textoBotonGuardarDefault: 'Guardar mercado', textoBotonGuardarEditando: 'Actualizar mercado',
    idFormCard: 'mercadogen-form-card',
    idTablaBody: 'mercadosGenTableBody', idContador: 'mercadosGenCount', colspanVacio: 2,
    mensajeVacio: 'Aún no has registrado ningún mercado.',
    claseBotonEditar: 'btn-edit-mercadogen', claseBotonToggle: 'btn-toggle-mercadogen', claseBotonEliminar: 'btn-delete-mercadogen',
    campoNombrePrincipal: 'nombre', nombreSingular: 'Mercado', nombreParaToast: (d) => d.nombre,
    obtenerEstadoArray: () => mercadosGenerales, establecerEstadoArray: (n) => { mercadosGenerales = n; },
    obtenerEditingId: () => editingMercadoGeneralId, establecerEditingId: (id) => { editingMercadoGeneralId = id; },
    mapearUIaDB: mapearMercadoUIaSupabase, mapearDBaUI: mapearMercadoSupabaseAUI,
    alTerminarGuardar: () => { poblarSelectMercadoOperacion(); }, alTerminarToggle: () => { poblarSelectMercadoOperacion(); },
    renderFila: (m) => `<tr>
      <td>${escapeHtml(m.nombre || '—')}</td>
      <td class="col-actions"><div class="row-actions">
        <button class="btn-edit-mercadogen" data-id="${m.id}" title="Editar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg></button>
        <button class="btn-toggle-mercadogen" data-id="${m.id}" title="${m.estado === 'Activo' ? 'Inactivar' : 'Activar'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg></button>
        <button class="btn-delete-mercadogen" data-id="${m.id}" title="Eliminar definitivamente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
      </div></td></tr>`
  };
  async function cargarMercadosGeneralesDesdeSupabase(){ await catalogoCargarDesdeSupabase(configMercados); }
  function renderMercadosGeneralesTable(){ catalogoRenderTabla(configMercados); }
  async function guardarMercadoGeneral(){ await catalogoGuardar(configMercados); }
  function editarMercadoGeneral(id){ catalogoEditar(configMercados, id); }
  async function toggleEstadoMercadoGeneral(id){ await catalogoToggleEstado(configMercados, id); }
  function attachMercadosGeneralesListeners(){ catalogoAttachListeners(configMercados); }

  function poblarSelectMercadoOperacion(){
    const select = document.getElementById('selectMercado');
    if(!select) return;
    const activos = mercadosGenerales.filter(m => m.estado === 'Activo');
    select.innerHTML = `<option value="">Selecciona…</option>` +
      activos.map(m => `<option value="${escapeHtml(m.nombre)}">${escapeHtml(m.nombre)}</option>`).join('');
  }


  /* ============================================================
     3. TEMPORALIDADES
     ============================================================ */
  let temporalidadesGenerales = [];
  let editingTemporalidadGeneralId = null;

  function mapearTemporalidadUIaSupabase(data){
    return { code: data.codigo, name: data.nombre, minutes_equivalent: parseInt(data.minutos, 10) || 1, is_active: data.estado === 'activo' };
  }
  function mapearTemporalidadSupabaseAUI(row){
    return { id: row.id, codigo: row.code, nombre: row.name, minutos: row.minutes_equivalent, estado: row.is_active ? 'Activo' : 'Inactivo' };
  }
  const configTemporalidades = {
    tabla: 'timeframes', ordenarPor: 'sort_order',
    atributoCampo: 'temporalidadgen-campo', datasetCampo: 'temporalidadgenCampo',
    atributoErrorFor: 'temporalidadgen-error-for', datasetErrorFor: 'temporalidadgenErrorFor',
    idSegmentedEstado: 'estadoTemporalidadGenSegmented', estadoActivoLabel: 'Activo', estadoInactivoLabel: 'Inactivo', valorEstadoActivoDefault: 'activo',
    camposRequeridos: [
      { campo: 'codigo', etiqueta: 'Código' }, { campo: 'nombre', etiqueta: 'Nombre' },
      { campo: 'minutos', etiqueta: 'Minutos equivalentes', esNumerico: true }
    ],
    idBotonGuardar: 'temporalidadGenSaveBtn', idBotonCancelar: 'temporalidadGenCancelBtn', idBadgeEditando: 'temporalidadGenEditBadge',
    idSubtitulo: 'temporalidadGenFormSub', idLabelBotonGuardar: 'temporalidadGenSaveBtnLabel',
    textoSubtituloDefault: 'Registra una nueva temporalidad', textoBotonGuardarDefault: 'Guardar temporalidad', textoBotonGuardarEditando: 'Actualizar temporalidad',
    idFormCard: 'temporalidadgen-form-card',
    idTablaBody: 'temporalidadesGenTableBody', idContador: 'temporalidadesGenCount', colspanVacio: 3,
    mensajeVacio: 'Aún no has registrado ninguna temporalidad.',
    claseBotonEditar: 'btn-edit-temporalidadgen', claseBotonToggle: 'btn-toggle-temporalidadgen', claseBotonEliminar: 'btn-delete-temporalidadgen',
    campoNombrePrincipal: 'nombre', nombreSingular: 'Temporalidad', nombreParaToast: (d) => d.nombre,
    obtenerEstadoArray: () => temporalidadesGenerales, establecerEstadoArray: (n) => { temporalidadesGenerales = n; },
    obtenerEditingId: () => editingTemporalidadGeneralId, establecerEditingId: (id) => { editingTemporalidadGeneralId = id; },
    mapearUIaDB: mapearTemporalidadUIaSupabase, mapearDBaUI: mapearTemporalidadSupabaseAUI,
    alTerminarGuardar: () => { poblarSelectTemporalidadOperacion(); }, alTerminarToggle: () => { poblarSelectTemporalidadOperacion(); },
    renderFila: (t) => `<tr>
      <td>${escapeHtml(t.nombre || '—')} <span style="color:var(--color-text-muted); font-size:var(--fs-xs);">(${escapeHtml(t.codigo)})</span></td>
      <td>${t.minutos || '—'}</td>
      <td class="col-actions"><div class="row-actions">
        <button class="btn-edit-temporalidadgen" data-id="${t.id}" title="Editar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg></button>
        <button class="btn-toggle-temporalidadgen" data-id="${t.id}" title="${t.estado === 'Activo' ? 'Inactivar' : 'Activar'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg></button>
        <button class="btn-delete-temporalidadgen" data-id="${t.id}" title="Eliminar definitivamente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
      </div></td></tr>`
  };
  async function cargarTemporalidadesGeneralesDesdeSupabase(){ await catalogoCargarDesdeSupabase(configTemporalidades); }
  function renderTemporalidadesGeneralesTable(){ catalogoRenderTabla(configTemporalidades); }
  async function guardarTemporalidadGeneral(){ await catalogoGuardar(configTemporalidades); }
  function editarTemporalidadGeneral(id){ catalogoEditar(configTemporalidades, id); }
  async function toggleEstadoTemporalidadGeneral(id){ await catalogoToggleEstado(configTemporalidades, id); }
  function attachTemporalidadesGeneralesListeners(){ catalogoAttachListeners(configTemporalidades); }

  // NOTA DE ALCANCE: NO reemplaza TEMPORALIDADES_POR_TIPO_TRADE (qué
  // temporalidades se ven/ocultan según el Tipo de Trade, IMP-03) — esa
  // lógica sigue en app.js tal cual; usaría trading_horizon_timeframes y es
  // una pieza más grande que queda fuera del alcance de esta Fase.
  function poblarSelectTemporalidadOperacion(){
    const select = document.getElementById('selectTemporalidad');
    if(!select) return;
    const activas = temporalidadesGenerales.filter(t => t.estado === 'Activo');
    select.innerHTML = `<option value="">Selecciona…</option>` +
      activas.map(t => `<option value="${escapeHtml(t.codigo)}">${escapeHtml(t.codigo)}</option>`).join('');
  }


  /* ============================================================
     4. HORIZONTES DE TRADING
     ============================================================ */
  let horizontesGenerales = [];
  let editingHorizonteGeneralId = null;

  function mapearHorizonteUIaSupabase(data){ return { code: data.codigo, name: data.nombre, is_active: data.estado === 'activo' }; }
  function mapearHorizonteSupabaseAUI(row){ return { id: row.id, codigo: row.code, nombre: row.name, estado: row.is_active ? 'Activo' : 'Inactivo' }; }
  const configHorizontes = {
    tabla: 'trading_horizons', ordenarPor: 'sort_order',
    atributoCampo: 'horizontegen-campo', datasetCampo: 'horizontegenCampo',
    atributoErrorFor: 'horizontegen-error-for', datasetErrorFor: 'horizontegenErrorFor',
    idSegmentedEstado: 'estadoHorizonteGenSegmented', estadoActivoLabel: 'Activo', estadoInactivoLabel: 'Inactivo', valorEstadoActivoDefault: 'activo',
    camposRequeridos: [{ campo: 'codigo', etiqueta: 'Código' }, { campo: 'nombre', etiqueta: 'Nombre' }],
    idBotonGuardar: 'horizonteGenSaveBtn', idBotonCancelar: 'horizonteGenCancelBtn', idBadgeEditando: 'horizonteGenEditBadge',
    idSubtitulo: 'horizonteGenFormSub', idLabelBotonGuardar: 'horizonteGenSaveBtnLabel',
    textoSubtituloDefault: 'Registra un nuevo horizonte de trading', textoBotonGuardarDefault: 'Guardar horizonte', textoBotonGuardarEditando: 'Actualizar horizonte',
    idFormCard: 'horizontegen-form-card',
    idTablaBody: 'horizontesGenTableBody', idContador: 'horizontesGenCount', colspanVacio: 2,
    mensajeVacio: 'Aún no has registrado ningún horizonte de trading.',
    claseBotonEditar: 'btn-edit-horizontegen', claseBotonToggle: 'btn-toggle-horizontegen', claseBotonEliminar: 'btn-delete-horizontegen',
    campoNombrePrincipal: 'nombre', nombreSingular: 'Horizonte', nombreParaToast: (d) => d.nombre,
    obtenerEstadoArray: () => horizontesGenerales, establecerEstadoArray: (n) => { horizontesGenerales = n; },
    obtenerEditingId: () => editingHorizonteGeneralId, establecerEditingId: (id) => { editingHorizonteGeneralId = id; },
    mapearUIaDB: mapearHorizonteUIaSupabase, mapearDBaUI: mapearHorizonteSupabaseAUI,
    alTerminarGuardar: () => { poblarSelectTipoTradeOperacion(); }, alTerminarToggle: () => { poblarSelectTipoTradeOperacion(); },
    renderFila: (h) => `<tr>
      <td>${escapeHtml(h.nombre || '—')} <span style="color:var(--color-text-muted); font-size:var(--fs-xs);">(${escapeHtml(h.codigo)})</span></td>
      <td class="col-actions"><div class="row-actions">
        <button class="btn-edit-horizontegen" data-id="${h.id}" title="Editar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg></button>
        <button class="btn-toggle-horizontegen" data-id="${h.id}" title="${h.estado === 'Activo' ? 'Inactivar' : 'Activar'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg></button>
        <button class="btn-delete-horizontegen" data-id="${h.id}" title="Eliminar definitivamente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
      </div></td></tr>`
  };
  async function cargarHorizontesGeneralesDesdeSupabase(){ await catalogoCargarDesdeSupabase(configHorizontes); }
  function renderHorizontesGeneralesTable(){ catalogoRenderTabla(configHorizontes); }
  async function guardarHorizonteGeneral(){ await catalogoGuardar(configHorizontes); }
  function editarHorizonteGeneral(id){ catalogoEditar(configHorizontes, id); }
  async function toggleEstadoHorizonteGeneral(id){ await catalogoToggleEstado(configHorizontes, id); }
  function attachHorizontesGeneralesListeners(){ catalogoAttachListeners(configHorizontes); }

  function poblarSelectTipoTradeOperacion(){
    const select = document.getElementById('selectTipoTrade');
    if(!select) return;
    const activos = horizontesGenerales.filter(h => h.estado === 'Activo');
    select.innerHTML = `<option value="">Selecciona…</option>` +
      activos.map(h => `<option value="${escapeHtml(h.codigo)}">${escapeHtml(h.nombre)}</option>`).join('');
  }


  /* ============================================================
     5. TIPOS DE ENTRADA (concepto nuevo — Mercado/Límite/Stop/Stop Limit)
     ============================================================ */
  let tiposEntradaGenerales = [];
  let editingTipoEntradaGeneralId = null;

  function mapearTipoEntradaUIaSupabase(data){ return { code: data.codigo, name: data.nombre, is_active: data.estado === 'activo' }; }
  function mapearTipoEntradaSupabaseAUI(row){ return { id: row.id, codigo: row.code, nombre: row.name, estado: row.is_active ? 'Activo' : 'Inactivo' }; }
  const configTiposEntrada = {
    tabla: 'entry_types', ordenarPor: 'sort_order',
    atributoCampo: 'tipoentradagen-campo', datasetCampo: 'tipoentradagenCampo',
    atributoErrorFor: 'tipoentradagen-error-for', datasetErrorFor: 'tipoentradagenErrorFor',
    idSegmentedEstado: 'estadoTipoEntradaGenSegmented', estadoActivoLabel: 'Activo', estadoInactivoLabel: 'Inactivo', valorEstadoActivoDefault: 'activo',
    camposRequeridos: [{ campo: 'codigo', etiqueta: 'Código' }, { campo: 'nombre', etiqueta: 'Nombre' }],
    idBotonGuardar: 'tipoEntradaGenSaveBtn', idBotonCancelar: 'tipoEntradaGenCancelBtn', idBadgeEditando: 'tipoEntradaGenEditBadge',
    idSubtitulo: 'tipoEntradaGenFormSub', idLabelBotonGuardar: 'tipoEntradaGenSaveBtnLabel',
    textoSubtituloDefault: 'Registra un nuevo tipo de entrada', textoBotonGuardarDefault: 'Guardar tipo de entrada', textoBotonGuardarEditando: 'Actualizar tipo de entrada',
    idFormCard: 'tipoentradagen-form-card',
    idTablaBody: 'tiposEntradaGenTableBody', idContador: 'tiposEntradaGenCount', colspanVacio: 2,
    mensajeVacio: 'Aún no has registrado ningún tipo de entrada.',
    claseBotonEditar: 'btn-edit-tipoentradagen', claseBotonToggle: 'btn-toggle-tipoentradagen', claseBotonEliminar: 'btn-delete-tipoentradagen',
    campoNombrePrincipal: 'nombre', nombreSingular: 'Tipo de Entrada', nombreParaToast: (d) => d.nombre,
    obtenerEstadoArray: () => tiposEntradaGenerales, establecerEstadoArray: (n) => { tiposEntradaGenerales = n; },
    obtenerEditingId: () => editingTipoEntradaGeneralId, establecerEditingId: (id) => { editingTipoEntradaGeneralId = id; },
    mapearUIaDB: mapearTipoEntradaUIaSupabase, mapearDBaUI: mapearTipoEntradaSupabaseAUI,
    alTerminarGuardar: () => { poblarSelectTipoEntradaOperacion(); }, alTerminarToggle: () => { poblarSelectTipoEntradaOperacion(); },
    renderFila: (t) => `<tr>
      <td>${escapeHtml(t.nombre || '—')} <span style="color:var(--color-text-muted); font-size:var(--fs-xs);">(${escapeHtml(t.codigo)})</span></td>
      <td class="col-actions"><div class="row-actions">
        <button class="btn-edit-tipoentradagen" data-id="${t.id}" title="Editar"><svg viewBox="0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg></button>
        <button class="btn-toggle-tipoentradagen" data-id="${t.id}" title="${t.estado === 'Activo' ? 'Inactivar' : 'Activar'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg></button>
        <button class="btn-delete-tipoentradagen" data-id="${t.id}" title="Eliminar definitivamente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
      </div></td></tr>`
  };
  async function cargarTiposEntradaGeneralesDesdeSupabase(){ await catalogoCargarDesdeSupabase(configTiposEntrada); }
  function renderTiposEntradaGeneralesTable(){ catalogoRenderTabla(configTiposEntrada); }
  async function guardarTipoEntradaGeneral(){ await catalogoGuardar(configTiposEntrada); }
  function editarTipoEntradaGeneral(id){ catalogoEditar(configTiposEntrada, id); }
  async function toggleEstadoTipoEntradaGeneral(id){ await catalogoToggleEstado(configTiposEntrada, id); }
  function attachTiposEntradaGeneralesListeners(){ catalogoAttachListeners(configTiposEntrada); }

  // Alimenta el <select data-field="tipoEntrada" id="selectTipoEntrada"> NUEVO
  // del formulario (no existía ningún campo equivalente antes de esta Fase).
  function poblarSelectTipoEntradaOperacion(){
    const select = document.getElementById('selectTipoEntrada');
    if(!select) return;
    const activos = tiposEntradaGenerales.filter(t => t.estado === 'Activo');
    select.innerHTML = `<option value="">Selecciona…</option>` +
      activos.map(t => `<option value="${escapeHtml(t.codigo)}">${escapeHtml(t.nombre)}</option>`).join('');
  }


  /* ============================================================
     6. DIRECCIONES (Long/Short — reemplaza Compra/Venta hardcodeado)
     ============================================================ */
  let direccionesGenerales = [];
  let editingDireccionGeneralId = null;

  function mapearDireccionUIaSupabase(data){ return { code: data.codigo, name: data.nombre, is_active: data.estado === 'activo' }; }
  function mapearDireccionSupabaseAUI(row){ return { id: row.id, codigo: row.code, nombre: row.name, estado: row.is_active ? 'Activo' : 'Inactivo' }; }
  const configDirecciones = {
    tabla: 'directions', ordenarPor: 'sort_order',
    atributoCampo: 'direcciongen-campo', datasetCampo: 'direcciongenCampo',
    atributoErrorFor: 'direcciongen-error-for', datasetErrorFor: 'direcciongenErrorFor',
    idSegmentedEstado: 'estadoDireccionGenSegmented', estadoActivoLabel: 'Activo', estadoInactivoLabel: 'Inactivo', valorEstadoActivoDefault: 'activo',
    camposRequeridos: [{ campo: 'codigo', etiqueta: 'Código' }, { campo: 'nombre', etiqueta: 'Nombre' }],
    idBotonGuardar: 'direccionGenSaveBtn', idBotonCancelar: 'direccionGenCancelBtn', idBadgeEditando: 'direccionGenEditBadge',
    idSubtitulo: 'direccionGenFormSub', idLabelBotonGuardar: 'direccionGenSaveBtnLabel',
    textoSubtituloDefault: 'Registra una nueva dirección', textoBotonGuardarDefault: 'Guardar dirección', textoBotonGuardarEditando: 'Actualizar dirección',
    idFormCard: 'direcciongen-form-card',
    idTablaBody: 'direccionesGenTableBody', idContador: 'direccionesGenCount', colspanVacio: 2,
    mensajeVacio: 'Aún no has registrado ninguna dirección.',
    claseBotonEditar: 'btn-edit-direcciongen', claseBotonToggle: 'btn-toggle-direcciongen', claseBotonEliminar: 'btn-delete-direcciongen',
    campoNombrePrincipal: 'nombre', nombreSingular: 'Dirección', nombreParaToast: (d) => d.nombre,
    obtenerEstadoArray: () => direccionesGenerales, establecerEstadoArray: (n) => { direccionesGenerales = n; },
    obtenerEditingId: () => editingDireccionGeneralId, establecerEditingId: (id) => { editingDireccionGeneralId = id; },
    mapearUIaDB: mapearDireccionUIaSupabase, mapearDBaUI: mapearDireccionSupabaseAUI,
    alTerminarGuardar: () => { renderDireccionSegmentedOperacion(); }, alTerminarToggle: () => { renderDireccionSegmentedOperacion(); },
    renderFila: (d) => `<tr>
      <td>${escapeHtml(d.nombre || '—')} <span style="color:var(--color-text-muted); font-size:var(--fs-xs);">(interno: ${escapeHtml(d.codigo)})</span></td>
      <td class="col-actions"><div class="row-actions">
        <button class="btn-edit-direcciongen" data-id="${d.id}" title="Editar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg></button>
        <button class="btn-toggle-direcciongen" data-id="${d.id}" title="${d.estado === 'Activo' ? 'Inactivar' : 'Activar'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg></button>
        <button class="btn-delete-direcciongen" data-id="${d.id}" title="Eliminar definitivamente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
      </div></td></tr>`
  };
  async function cargarDireccionesGeneralesDesdeSupabase(){ await catalogoCargarDesdeSupabase(configDirecciones); }
  function renderDireccionesGeneralesTable(){ catalogoRenderTabla(configDirecciones); }
  async function guardarDireccionGeneral(){ await catalogoGuardar(configDirecciones); }
  function editarDireccionGeneral(id){ catalogoEditar(configDirecciones, id); }
  async function toggleEstadoDireccionGeneral(id){ await catalogoToggleEstado(configDirecciones, id); }
  function attachDireccionesGeneralesListeners(){ catalogoAttachListeners(configDirecciones); }

  // Reemplaza el contenido del #direccionSegmented hardcodeado (Compra/Venta)
  // por lo que haya en Supabase — SIN tocar trades.js: collectFormData() sigue
  // leyendo `document.querySelector('#direccionSegmented button.active').dataset.direction`,
  // y ese dataset.direction sigue siendo 'Compra'/'Venta' (el CODE interno),
  // solo cambia la ETIQUETA visible ('Long'/'Short'). El HTML estático
  // original (Compra/Venta) queda como respaldo si por algún motivo no hay
  // datos en Supabase — nunca se deja el selector vacío.
  function renderDireccionSegmentedOperacion(){
    const container = document.getElementById('direccionSegmented');
    if(!container) return;
    const activas = direccionesGenerales.filter(d => d.estado === 'Activo');
    if(activas.length === 0) return; // conserva el HTML estático de respaldo

    container.innerHTML = activas.map(d =>
      `<button class="${d.codigo === 'Venta' ? 'sell' : 'buy'}" type="button" data-direction="${escapeHtml(d.codigo)}">${escapeHtml(d.nombre)}</button>`
    ).join('');

    const primerBoton = container.querySelector('button[data-direction="Compra"]') || container.querySelector('button');
    if(primerBoton) primerBoton.classList.add('active');
  }

  // Los botones se regeneran dinámicamente, así que el listener genérico de
  // .segmented (attachVisualListeners, ya corrido para entonces) no los
  // alcanza — se delega aquí, una sola vez, sobre el contenedor.
  function attachDireccionSegmentedOperacionListener(){
    const container = document.getElementById('direccionSegmented');
    if(!container) return;
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if(!btn) return;
      container.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  }


  /* ============================================================
     ARRANQUE DEL MÓDULO — llamado desde app.js (initApp)
     ============================================================ */
  async function inicializarCatalogosGenerales(){
    await cargarBrokersGeneralesDesdeSupabase();
    await cargarMercadosGeneralesDesdeSupabase();
    await cargarTemporalidadesGeneralesDesdeSupabase();
    await cargarHorizontesGeneralesDesdeSupabase();
    await cargarTiposEntradaGeneralesDesdeSupabase();
    await cargarDireccionesGeneralesDesdeSupabase();

    poblarSelectMercadoOperacion();
    poblarSelectTemporalidadOperacion();
    poblarSelectTipoTradeOperacion();
    poblarSelectTipoEntradaOperacion();
    renderDireccionSegmentedOperacion();

    renderBrokersGeneralesTable();
    renderMercadosGeneralesTable();
    renderTemporalidadesGeneralesTable();
    renderHorizontesGeneralesTable();
    renderTiposEntradaGeneralesTable();
    renderDireccionesGeneralesTable();
  }

  function attachCatalogosGeneralesListeners(){
    attachBrokersGeneralesListeners();
    attachMercadosGeneralesListeners();
    attachTemporalidadesGeneralesListeners();
    attachHorizontesGeneralesListeners();
    attachTiposEntradaGeneralesListeners();
    attachDireccionesGeneralesListeners();
    attachDireccionSegmentedOperacionListener();
  }
