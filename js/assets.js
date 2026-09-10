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
    claseBotonEliminar: 'btn-delete-activo',

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
          <button class="btn-delete-activo" data-id="${a.id}" title="Eliminar definitivamente">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
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
    attachCryptoBuscadorListeners(); // Sprint MARKET-2B.1
  }

  /* ============================================================
     Sprint MARKET-2B.1 — Buscador inteligente de activos Crypto.
     NO modifica marketData.js/storage.js/Supabase. #selectActivo NUNCA
     se elimina ni se reemplaza — sigue siendo la única fuente de verdad
     para collectFormData()/populateForm()/actualizarVisibilidadActivoOtro();
     este módulo solo lo mantiene sincronizado cuando el usuario elige un
     resultado del buscador. Mercados NO Crypto: cero cambios de
     comportamiento (el buscador simplemente permanece oculto).
     ============================================================ */
  const MERCADO_CRYPTO = 'Cripto'; // valor real confirmado en MERCADOS (index.html) — no "Crypto"/"CRYPTO"

  let catalogoCryptoCargando = false;
  let catalogoCryptoConError = false;

  function alternarModoCryptoActivo(){
    const selectMercadoEl = document.getElementById('selectMercado');
    const wrapperSelectNormal = document.getElementById('activoSelectWrapper');
    const wrapperCrypto = document.getElementById('cryptoBuscadorWrapper');
    if(!selectMercadoEl || !wrapperSelectNormal || !wrapperCrypto) return;

    const esCrypto = selectMercadoEl.value === MERCADO_CRYPTO;
    wrapperSelectNormal.style.display = esCrypto ? 'none' : '';
    wrapperCrypto.style.display = esCrypto ? '' : 'none';

    if(esCrypto) asegurarCatalogoCryptoCargado();
  }

  async function asegurarCatalogoCryptoCargado(){
    if(typeof InstrumentCatalog === 'undefined') return; // catálogo unificado no cargado -> no romper nada
    if(InstrumentCatalog.getCatalog().length > 0){
      renderEstadoBuscadorCrypto('');
      return;
    }
    if(catalogoCryptoCargando) return;

    catalogoCryptoCargando = true;
    catalogoCryptoConError = false;
    renderEstadoBuscadorCrypto('Cargando catálogo de instrumentos…');

    try{
      const resultado = await InstrumentCatalog.load();
      catalogoCryptoConError = resultado.status === 'ERROR' && resultado.instruments.length === 0;
      if(catalogoCryptoConError){
        throw new Error('Ningún proveedor de instrumentos está disponible.');
      }
      renderEstadoBuscadorCrypto(resultado.status === 'PARTIAL'
        ? 'Catálogo parcialmente disponible. Algunos mercados podrían no aparecer.'
        : '');
    }catch(error){
      console.error('MARKET-4.2.4: no se pudo cargar el catálogo unificado de instrumentos:', error);
      catalogoCryptoConError = true;
      renderEstadoBuscadorCrypto('No se pudo cargar el catálogo de instrumentos. <button type="button" id="cryptoReintentarBtn" class="btn-secondary" style="margin-left:8px;">Reintentar</button>');
    }finally{
      catalogoCryptoCargando = false;
    }
  }

  function renderEstadoBuscadorCrypto(mensajeHtml){
    const estadoEl = document.getElementById('cryptoBuscadorEstado');
    if(estadoEl) estadoEl.innerHTML = mensajeHtml;
  }

  async function manejarBusquedaCrypto(){
    const inputEl = document.getElementById('cryptoBuscadorInput');
    const resultadosEl = document.getElementById('cryptoBuscadorResultados');
    if(!inputEl || !resultadosEl) return;

    const query = inputEl.value.trim();
    if(!query || catalogoCryptoConError || typeof InstrumentCatalog === 'undefined'){
      resultadosEl.style.display = 'none';
      resultadosEl.innerHTML = '';
      return;
    }

    try{
      const resultados = (await InstrumentCatalog.search(query)).slice(0, 20);
      if(resultados.length === 0){
        resultadosEl.style.display = '';
        resultadosEl.innerHTML = `<div style="padding: var(--space-2); color: var(--color-text-muted); font-size: var(--fs-sm);">Sin resultados para "${escapeHtml(query)}".</div>`;
        return;
      }

      resultadosEl.style.display = '';
      resultadosEl.innerHTML = resultados.map(r =>
        `<div class="crypto-buscador-item" data-symbol="${escapeHtml(r.symbol)}" data-exchange="${escapeHtml(r.exchange)}" data-market-type="${escapeHtml(r.marketType)}" data-instrument-id="${escapeHtml(r.id)}" style="padding: var(--space-2); cursor:pointer; border-bottom:1px solid var(--color-border); display:flex; justify-content:space-between; gap:var(--space-3);">
          <strong>${escapeHtml(r.symbol)}</strong>
          <span style="color: var(--color-text-muted); font-size: var(--fs-sm);">${escapeHtml(r.exchange)} · ${escapeHtml(r.marketType)} · ${escapeHtml(r.baseAsset)} / ${escapeHtml(r.quoteAsset)}</span>
        </div>`
      ).join('');
    }catch(error){
      console.error('MARKET-4.2.4: error buscando instrumentos:', error);
      resultadosEl.style.display = '';
      resultadosEl.innerHTML = `<div style="padding: var(--space-2); color: var(--color-text-muted); font-size: var(--fs-sm);">No se pudo realizar la búsqueda.</div>`;
    }
  }

  // Sincroniza #selectActivo (nunca lo reemplaza) e imita exactamente lo
  // que ya hace poblarSelectActivoOperacion(): agrega la opción si falta,
  // fija su valor, y dispara 'change' para reutilizar
  // actualizarVisibilidadActivoOtro() ya existente sin duplicar esa lógica.
  function seleccionarActivoCrypto(symbol, instrumento){
    const selectActivoEl = document.getElementById('selectActivo');
    if(!selectActivoEl) return;

    let opcion = Array.from(selectActivoEl.options).find(o => o.value === symbol);
    if(!opcion){
      opcion = document.createElement('option');
      opcion.value = symbol;
      opcion.textContent = symbol;
      selectActivoEl.appendChild(opcion);
    }
    selectActivoEl.value = symbol;
    if(instrumento){
      selectActivoEl.dataset.instrumentId = instrumento.instrumentId || '';
      selectActivoEl.dataset.exchange = instrumento.exchange || '';
      selectActivoEl.dataset.marketType = instrumento.marketType || '';
    } else {
      delete selectActivoEl.dataset.instrumentId;
      delete selectActivoEl.dataset.exchange;
      delete selectActivoEl.dataset.marketType;
    }
    selectActivoEl.dispatchEvent(new Event('change'));

    const inputEl = document.getElementById('cryptoBuscadorInput');
    const resultadosEl = document.getElementById('cryptoBuscadorResultados');
    if(inputEl) inputEl.value = symbol;
    if(resultadosEl){ resultadosEl.innerHTML = ''; resultadosEl.style.display = 'none'; }
  }

  /* ============================================================
     Sprint MARKET-3 — Precio en vivo dentro del formulario de Trade.
     Reutiliza BinanceMarketData (sin WebSockets nuevos). NUNCA escribe en
     "Precio de entrada" ([data-field="precioEntrada"]) — son campos
     completamente independientes y esta función jamás los toca.
     ============================================================ */
  let symbolSuscritoFormulario = null;
  let callbackPrecioFormulario = null;

  function formatearPrecioVivo(valor){
    return '$' + valor.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
  }

  function desuscribirPrecioFormularioActual(){
    if(symbolSuscritoFormulario && callbackPrecioFormulario && typeof BinanceMarketData !== 'undefined'){
      BinanceMarketData.unsubscribePrice(symbolSuscritoFormulario, callbackPrecioFormulario);
    }
    symbolSuscritoFormulario = null;
    callbackPrecioFormulario = null;
  }

  // Expuesta para que trades.js pueda llamarla desde resetForm() — evita
  // dejar una suscripción "huérfana" cuando se guarda/cancela/limpia el
  // formulario sin que el navegador dispare 'change' (resetForm() asigna
  // .value directamente, sin dispatchEvent).
  function limpiarPrecioEnVivoFormulario(){
    desuscribirPrecioFormularioActual();
    const bloquePrecio = document.getElementById('precioVivoWrapper');
    if(bloquePrecio) bloquePrecio.style.display = 'none';
  }

  function actualizarPrecioEnVivoFormulario(){
    const selectActivoEl = document.getElementById('selectActivo');
    const selectMercadoEl = document.getElementById('selectMercado');
    const bloquePrecio = document.getElementById('precioVivoWrapper');
    if(!selectActivoEl || !selectMercadoEl || !bloquePrecio) return;

    const esCrypto = selectMercadoEl.value === MERCADO_CRYPTO;
    const symbolActual = esCrypto ? selectActivoEl.value : null;
    const symbolValido = symbolActual && symbolActual !== 'Otro...' && symbolActual !== '';

    if(symbolSuscritoFormulario && symbolSuscritoFormulario !== symbolActual){
      desuscribirPrecioFormularioActual(); // PASO — cambio de activo o de mercado: fuera el listener anterior
    }

    if(!esCrypto || !symbolValido){
      bloquePrecio.style.display = 'none';
      return;
    }

    bloquePrecio.style.display = '';

    if(symbolSuscritoFormulario === symbolActual) return; // ya suscrito a este mismo símbolo, nada que hacer

    const precioValorEl = document.getElementById('precioVivoValor');
    const precioEstadoEl = document.getElementById('precioVivoEstado');
    if(precioValorEl) precioValorEl.textContent = '—';
    if(precioEstadoEl) precioEstadoEl.textContent = 'Cargando...';

    if(typeof BinanceMarketData === 'undefined') return;

    callbackPrecioFormulario = (data) => {
      if(precioValorEl) precioValorEl.textContent = formatearPrecioVivo(data.price);
      if(precioEstadoEl) precioEstadoEl.textContent = '● EN VIVO · Binance';
    };
    symbolSuscritoFormulario = symbolActual;
    BinanceMarketData.subscribePrice(symbolActual, callbackPrecioFormulario);

    const cacheado = BinanceMarketData.getPrice(symbolActual);
    if(cacheado !== null && precioValorEl){
      precioValorEl.textContent = formatearPrecioVivo(cacheado);
      if(precioEstadoEl) precioEstadoEl.textContent = '● EN VIVO · Binance';
    }
  }

  function attachCryptoBuscadorListeners(){
    const selectMercadoEl = document.getElementById('selectMercado');
    if(selectMercadoEl){
      selectMercadoEl.addEventListener('change', alternarModoCryptoActivo);
      selectMercadoEl.addEventListener('change', actualizarPrecioEnVivoFormulario); // Sprint MARKET-3
    }

    const inputEl = document.getElementById('cryptoBuscadorInput');
    if(inputEl) inputEl.addEventListener('input', manejarBusquedaCrypto);

    const resultadosEl = document.getElementById('cryptoBuscadorResultados');
    if(resultadosEl){
      resultadosEl.addEventListener('click', (e) => {
        const item = e.target.closest('.crypto-buscador-item');
        if(item) seleccionarActivoCrypto(item.dataset.symbol, {
          instrumentId: item.dataset.instrumentId,
          exchange: item.dataset.exchange,
          marketType: item.dataset.marketType
        });
      });
    }

    const estadoEl = document.getElementById('cryptoBuscadorEstado');
    if(estadoEl){
      estadoEl.addEventListener('click', (e) => {
        if(e.target.id === 'cryptoReintentarBtn') asegurarCatalogoCryptoCargado();
      });
    }

    // Sprint MARKET-3 — mismo evento 'change' de #selectActivo que ya
    // dispara seleccionarActivoCrypto() vía dispatchEvent; no interfiere
    // con actualizarVisibilidadActivoOtro() (trades.js), ambos listeners
    // conviven sin conflicto.
    const selectActivoEl = document.getElementById('selectActivo');
    if(selectActivoEl) selectActivoEl.addEventListener('change', actualizarPrecioEnVivoFormulario);

    alternarModoCryptoActivo(); // estado inicial correcto (por si el formulario ya trae un mercado seleccionado)
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
