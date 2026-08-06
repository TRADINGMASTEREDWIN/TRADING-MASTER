/* ============================================================
   GESTIÓN DE ACTIVOS — Trading Master

   CRUD completo de Activos (crear, editar, activar/desactivar,
   listar), construido sobre el motor genérico de catálogos
   (js/catalog.js) — mismo patrón que Cuentas, sin duplicar su código.

   Este archivo solo define lo específico de Activos: sus campos,
   el mapeo hacia/desde Supabase, y cómo se ve su fila en la tabla.
   Todo el CRUD (guardar, editar, activar/desactivar, validar,
   renderizar) vive en catalog.js.

   Depende de:
   - js/catalog.js  -> motor genérico de catálogos
   - js/supabase.js -> objeto global `supabaseClient`
   - js/trades.js   -> leerSegmentedActivo(), aplicarSegmentedActivo()
                       (para el segmented Activo/Inactivo)
   - utils.js       -> escapeHtml()
   - index.html     -> showToast()
   ============================================================ */

  let activos = [];
  let editingActivoId = null;

  // UI (español, formulario) -> fila de Supabase
  async function mapearActivoUIaSupabase(data){
    return {
      market_id: data.mercado || null,
      symbol: data.simbolo,
      name: data.nombre || null,
      is_active: data.estado === 'activo'
    };
  }

  // Fila de Supabase -> objeto en el idioma que usa el resto de la app
  function mapearActivoSupabaseAUI(row){
    return {
      id: row.id,
      idActivo: row.id,
      simbolo: row.symbol,
      nombre: row.name || '',
      mercado: row.market_id,
      mercadoNombre: row.markets ? row.markets.name : '',
      estado: row.is_active ? 'Activo' : 'Inactivo'
    };
  }

  const configActivos = {
    tabla: 'assets',
    selectQuery: '*, markets(name)',
    ordenarPor: 'created_at',

    atributoCampo: 'activo-campo',
    datasetCampo: 'activoCampo',
    atributoErrorFor: 'activo-error-for',
    datasetErrorFor: 'activoErrorFor',

    idSegmentedEstado: 'estadoActivoSegmented',
    estadoActivoLabel: 'Activo',
    estadoInactivoLabel: 'Inactivo',
    valorEstadoActivoDefault: 'activo',

    camposRequeridos: [
      { campo: 'simbolo', etiqueta: 'Símbolo' },
      { campo: 'mercado', etiqueta: 'Mercado' }
    ],

    idBotonGuardar: 'activoSaveBtn',
    idBotonCancelar: 'activoCancelBtn',
    idBadgeEditando: 'activoEditBadge',
    idSubtitulo: 'activoFormSub',
    idLabelBotonGuardar: 'activoSaveBtnLabel',
    textoSubtituloDefault: 'Registra un nuevo activo',
    textoBotonGuardarDefault: 'Guardar activo',
    textoBotonGuardarEditando: 'Actualizar activo',
    idFormCard: 'activo-form-card',

    idTablaBody: 'activosTableBody',
    idContador: 'activosCount',
    colspanVacio: 5,
    mensajeVacio: 'Aún no has registrado ningún activo. Usa el formulario de arriba para crear el primero.',

    claseBotonEditar: 'btn-edit-activo',
    claseBotonToggle: 'btn-toggle-activo',

    campoNombrePrincipal: 'simbolo',
    nombreSingular: 'Activo',
    nombreParaToast: (data) => data.simbolo,

    obtenerEstadoArray: () => activos,
    establecerEstadoArray: (nuevo) => { activos = nuevo; },
    obtenerEditingId: () => editingActivoId,
    establecerEditingId: (id) => { editingActivoId = id; },

    mapearUIaDB: mapearActivoUIaSupabase,
    mapearDBaUI: mapearActivoSupabaseAUI,

    renderFila: (a) => `<tr>
      <td>${escapeHtml(a.simbolo || '—')}</td>
      <td>${escapeHtml(a.nombre || '—')}</td>
      <td>${escapeHtml(a.mercadoNombre || '—')}</td>
      <td>${a.estado === 'Activo'
        ? `<span class="badge success"><span class="badge-dot"></span>Activo</span>`
        : `<span class="badge neutral"><span class="badge-dot"></span>Inactivo</span>`}</td>
      <td class="col-actions">
        <div class="row-actions">
          <button class="btn-edit-activo" data-id="${a.id}" title="Editar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg>
          </button>
          <button class="btn-toggle-activo" data-id="${a.id}" title="${a.estado === 'Activo' ? 'Inactivar' : 'Activar'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
          </button>
        </div>
      </td>
    </tr>`,

    alTerminarGuardar: () => { poblarSelectActivoOperacion(); },
    alTerminarToggle: () => { poblarSelectActivoOperacion(); }
  };

  async function cargarActivosDesdeSupabase(){
    await catalogoCargarDesdeSupabase(configActivos);
  }

  function renderActivosTable(){
    catalogoRenderTabla(configActivos);
  }

  async function guardarActivo(){
    await catalogoGuardar(configActivos);
  }

  function editarActivo(id){
    catalogoEditar(configActivos, id);
  }

  async function toggleEstadoActivo(id){
    await catalogoToggleEstado(configActivos, id);
  }

  function resetActivoForm(){
    catalogoResetForm(configActivos);
  }

  function attachActivosListeners(){
    catalogoAttachListeners(configActivos);
  }

  // Puebla el <select> de Mercado del formulario de Activos con los
  // mercados existentes en Supabase (los 5 del sistema + los que el
  // usuario agregue si en el futuro se construye un módulo de Mercados).
  async function poblarSelectMercadoActivo(){
    const select = document.getElementById('selectMercadoActivo');
    if(!select) return;
    const { data, error } = await supabaseClient
      .from('markets')
      .select('id, name')
      .order('sort_order', { ascending: true });

    if(error){
      console.error('No se pudieron cargar los mercados:', error);
      showToast('danger', 'No se pudieron cargar los mercados', error.message);
      return;
    }
    select.innerHTML = `<option value="">Selecciona…</option>` +
      (data || []).map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
  }

  // Reemplaza a poblarSelectActivo() (trades.js) para el MISMO <select
  // id="selectActivo"> del formulario de operaciones — ahora alimentado
  // desde Supabase en vez de la constante ACTIVOS_FAVORITOS. Conserva la
  // opción "Otro..." tal cual para que actualizarVisibilidadActivoOtro()
  // (trades.js, sin tocar) siga funcionando exactamente igual.
  function poblarSelectActivoOperacion(){
    const select = document.getElementById('selectActivo');
    if(!select) return;
    const activosActivos = activos.filter(a => a.estado === 'Activo');
    let html = `<option value="">Selecciona…</option>`;
    html += activosActivos.map(a =>
      `<option value="${escapeHtml(a.simbolo)}">${escapeHtml(a.simbolo)}${a.nombre ? ' — ' + escapeHtml(a.nombre) : ''}</option>`
    ).join('');
    html += `<option value="Otro...">Otro...</option>`;
    select.innerHTML = html;
  }
