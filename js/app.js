/* ============================================================
   INICIALIZACIÓN — Trading Master
   Etapa 8 (última) de modularización: arranque de la aplicación.

   Contiene initApp() (el orquestador que llama a todos los módulos),
   las migraciones de compatibilidad que corren una sola vez al
   cargar (IDs de cuenta, cuenta por nombre→ID, contexto técnico),
   la construcción de los selects/campos dinámicos del formulario, y
   la invocación final que arranca todo.
   El código es idéntico al que estaba en index.html.

   Depende de funciones y estado de TODOS los demás módulos
   (storage.js, accounts.js, plan.js, dashboard.js, trades.js) y de
   showToast()/attachVisualListeners() que permanecen en index.html.
   Por eso este es el ÚLTIMO script en cargar: todo lo demás ya debe
   existir antes de que initApp() se ejecute.
   ============================================================ */

  async function migrarIdsCuentas(){
    let cambios = false;
    cuentas.forEach(c => {
      if(!c.idCuenta){
        c.idCuenta = generarSiguienteIdCuenta();
        cambios = true;
      }
    });
    if(cambios){
      await persistirContadorCuentas();
      await persistirCuentas();
    }
  }

  async function migrarCuentasDeOperaciones(){
    let cambios = false;
    operaciones.forEach(op => {
      if(!op.cuenta) return;
      const yaEsIdValido = cuentas.some(c => c.idCuenta === op.cuenta);
      if(yaEsIdValido) return;
      const cuentaPorNombre = cuentas.find(c => c.nombre === op.cuenta);
      if(cuentaPorNombre){
        op.cuenta = cuentaPorNombre.idCuenta;
        cambios = true;
      }
    });
    if(cambios){
      await persistirOperaciones();
    }
  }

  function migrarContextoTecnicoDeOperacion(op){
    if(op.contextoTecnico) return false; // ya tiene el nuevo modelo
    const legado = op.contextoMercado;
    if(!legado) return false; // operación sin ningún contexto registrado

    const nuevo = {};
    let huboDato = false;
    let huboAmbiguo = false;

    TEMPORALIDADES.forEach(tf => {
      const estado = legado[tf];
      if(!estado) return;
      huboDato = true;
      if(estado === 'Alcista') nuevo[tf] = 'sobre';
      else if(estado === 'Bajista') nuevo[tf] = 'bajo';
      else huboAmbiguo = true; // Lateral / Transición — se deja sin dato
    });

    if(!huboDato) return false;
    op.contextoTecnico = nuevo;
    if(huboAmbiguo) op.contextoTecnicoPendienteRevision = true;
    return true;
  }

  async function migrarContextosTecnicos(){
    let cambios = false;
    operaciones.forEach(op => {
      if(migrarContextoTecnicoDeOperacion(op)) cambios = true;
    });
    if(cambios){
      await persistirOperaciones();
    }
  }

  async function initApp(){
    const sesionValida = await verificarSesionYMostrarUI();
    if(!sesionValida) return; // Sin sesión: se queda en pantalla de Login (auth.js). Al iniciar sesión, auth.js vuelve a llamar a initApp().

    construirCamposDinamicos();
    mostrarEstadoCargando();
    await cargarContadorCuentas();  // ID permanente de Cuenta (AC-01.1)
    await cargarCuentas();          // Gestión de Cuentas (AC-01)
    await migrarIdsCuentas();       // Asigna idCuenta a cuentas creadas antes de AC-01.1
    await cargarActivosDesdeSupabase(); // Gestión de Activos
    await poblarSelectMercadoActivo();  // Select de Mercado del formulario de Activos
    await inicializarModuloVariables(); // Gestión de Variables (Categorías, Variables, Opciones)
    await inicializarCatalogosGenerales(); // Fase 3 — Brokers, Mercados, Temporalidades, Horizontes, Tipos de Entrada, Direcciones
    poblarTemporalidadesParaVariable(); // Sprint UX-2A — necesita temporalidadesGenerales, recién cargado arriba
    // Sprint 3 — aislado en try/catch: si algo aquí falla, se ve claramente
    // en consola pero NO detiene el resto de initApp() (Dashboard, Trades,
    // Plan, etc. deben seguir funcionando aunque este bloque falle).
    try{
      await cargarDataTypesParaVariablesObservadas();
      await cargarTemporalidadesDeVariablesMatriz(); // Sprint UX-2A — Indicadores Técnicos (EMA, etc.)
      renderVariablesObservadas();
      renderCategoriasEnBloquePropio(); // Sprint 4 — Liquidez, Estructura, ... (y ahora Indicadores Técnicos)
    }catch(errorVariablesObservadas){
      console.error('[Variables Observadas] Error al construir el bloque:', errorVariablesObservadas);
    }
    await loadOperations();
    await cargarContadorTrades();   // Identificador de Trade (v0.4.5)
    await migrarCuentasDeOperaciones(); // Migra op.cuenta de nombre a idCuenta (AC-01.1)
    await migrarContextosTecnicos();    // Migra contextoMercado (interpretado) a contextoTecnico (IMP-02)
    poblarSelectCuentaOperacion();
    poblarSelectActivoOperacion();   // Gestión de Activos — reemplaza a poblarSelectActivo()
    renderCuentasTable();
    renderActivosTable();            // Gestión de Activos
    renderTable();
    await loadPlanTrading();   // Mi Plan de Trading (Fase 4.3)
    renderPlanTrading();
    attachVisualListeners();   // theme, sidebar, tabs, chips, segmented (heredado de Fase 1)
    attachFormListeners();     // guardar, limpiar, cancelar, imagen
    attachTableListeners();    // delegación de editar/eliminar/ver
    attachModalListeners();
    attachFichaListeners();    // Ficha Técnica del Trade (Fase 4.2)
    attachPlanTradingListeners(); // Mi Plan de Trading (Fase 4.3)
    attachCuentasListeners();     // Gestión de Cuentas (AC-01)
    attachActivosListeners();     // Gestión de Activos
    attachModuloVariablesListeners(); // Gestión de Variables
    attachCatalogosGeneralesListeners(); // Fase 3
    try{
      attachVariablesObservadasListeners(); // Sprint 3
    }catch(errorListenersVO){
      console.error('[Variables Observadas] Error al conectar sus listeners:', errorListenersVO);
    }
  }

  function construirCamposDinamicos(){
    // Fase 3 — Mercado, Tipo de Trade y Temporalidad ya no se pueblan aquí
    // (listas estáticas) sino en inicializarCatalogosGenerales(), después de
    // cargar sus catálogos desde Supabase — mismo criterio ya usado para
    // Cuenta y Activo.
    poblarSelect(document.getElementById('selectTipoOperacion'), TIPOS_OPERACION, 'Selecciona…');
    poblarSelect(document.getElementById('selectTipoCuenta'), TIPOS_CUENTA, 'Selecciona…');
    poblarSelect(document.getElementById('selectMonedaCuenta'), MONEDAS, 'Selecciona…');
    // Gestión de Activos: el selector de Activo ya no se puebla aquí (dato
    // estático) sino en poblarSelectActivoOperacion(), después de cargar los
    // activos guardados — mismo criterio ya usado para Cuenta.
    poblarSelect(document.getElementById('selectEstrategia'), ESTRATEGIAS, 'Selecciona una estrategia…');
    // AC-01: el selector de Cuenta ya no se puebla aquí (dato estático) sino
    // en poblarSelectCuentaOperacion(), después de cargar las cuentas guardadas.
    poblarContextoTecnicoChips(document.getElementById('contextoMercadoGrid'));
    // Sprint 4.1 — se eliminó actualizarTemporalidadesVisibles() de aquí:
    // dependía de datos que Supabase aún no ha cargado en este punto
    // (construirCamposDinamicos corre de forma síncrona, antes de los
    // await de más abajo). poblarSelectTemporalidadSegunTipoTrade(), en
    // inicializarCatalogosGenerales() (más abajo), ya deja el estado
    // inicial correcto una vez los datos reales están disponibles.

    // ARQ-01 — Variable de Decisión: Liquidez
    // (value = código corto para análisis; texto visible = etiqueta larga)
    // Sprint 4 — guardia agregada: el HTML antiguo de Liquidez ya no existe
    // en index.html (se sustituyó por el bloque dinámico), así que este
    // elemento puede no existir. Sin la guardia, esto rompía TODO initApp().
    const selectZonaLiquidez = document.getElementById('liquidezZonaPrincipal');
    if(selectZonaLiquidez){
      selectZonaLiquidez.innerHTML =
        `<option value="">Selecciona…</option>` +
        LIQUIDEZ_ZONAS.map(z => `<option value="${z.valor}">${z.etiqueta}</option>`).join('');
    }
    poblarSegmented(document.getElementById('liquidezPeso'), LIQUIDEZ_PESO);
    poblarSegmented(document.getElementById('liquidezRecuperacion'), LIQUIDEZ_RECUPERACION);
    poblarSegmented(document.getElementById('liquidezBarrido'), LIQUIDEZ_BARRIDO);
    poblarSegmented(document.getElementById('liquidezCalidadBarrido'), LIQUIDEZ_CALIDAD_BARRIDO);
    poblarSegmented(document.getElementById('liquidezMetodoEntrada'), LIQUIDEZ_METODO_ENTRADA);

    // IMP-04 — Variable de Decisión: Estructura
    poblarGrupoConEstrella(document.getElementById('estructuraReferencias'), ESTRUCTURA_REFERENCIAS, 'referencias');
    poblarGrupoConEstrella(document.getElementById('estructuraFormaciones'), ESTRUCTURA_FORMACIONES, 'formaciones');
    poblarGrupoMultiSeleccion(document.getElementById('estructuraUbicacion'), ESTRUCTURA_UBICACION);
    poblarGrupoMultiSeleccion(document.getElementById('estructuraHipotesis'), ESTRUCTURA_HIPOTESIS);
    poblarGrupoConEstrella(document.getElementById('estructuraConfirmaciones'), ESTRUCTURA_CONFIRMACIONES, 'confirmaciones');

    // ASE X — Variable de Decisión: Price Action
    poblarGrupoConEstrellaObjetos(document.getElementById('priceActionPatrones'), PRICE_ACTION_PATRONES, 'patrones');
    poblarGrupoConEstrella(document.getElementById('priceActionLectura'), PRICE_ACTION_LECTURA, 'lectura');
    poblarGrupoConEstrella(document.getElementById('priceActionConfirmaciones'), PRICE_ACTION_CONFIRMACIONES, 'confirmaciones');

    // Desequilibrios
    poblarGrupoConEstrellaObjetos(document.getElementById('desequilibriosObservados'), DESEQUILIBRIOS_OBSERVADOS, 'observados');

    // Volumen
    poblarGrupoConEstrella(document.getElementById('volumenLectura'), VOLUMEN_LECTURA, 'lectura');
    poblarGrupoConEstrella(document.getElementById('volumenVrvp'), VOLUMEN_VRVP, 'vrvp');

    poblarGrupoMultiSeleccion(document.getElementById('confirmacionesCheckboxGroup'), CONFIRMACIONES);

    // Fase 4.4 — Psicología y Aprendizaje
    poblarGrupoChipsConEmoji(document.getElementById('psicologiaEstadoEmocionalGroup'), ESTADOS_EMOCIONALES);
    poblarGrupoMultiSeleccion(document.getElementById('psicologiaConcentracionGroup'), NIVELES_CONCENTRACION);
    poblarGrupoChipsConEmoji(document.getElementById('psicologiaCristoIndicadorGroup'), CRISTO_INDICADOR);
    poblarGrupoMultiSeleccion(document.getElementById('psicologiaEmocionesDuranteGroup'), EMOCIONES_DURANTE);
    poblarGrupoMultiSeleccion(document.getElementById('psicologiaCumplimientoGroup'), CUMPLIMIENTO_PLAN_OPCIONES);
    poblarGrupoMultiSeleccion(document.getElementById('psicologiaCausaResultadoGroup'), CAUSAS_RESULTADO);
  }

/* ============================================================
     ARRANQUE
     ============================================================ */
  initApp().catch((error) => {
    console.error('Error al iniciar Trading Master:', error);
    const root = document.getElementById('app');
    if(root){
      root.insertAdjacentHTML('afterbegin', `
        <div style="grid-column: 1 / -1; padding: 24px; background: #2A1212; border: 1px solid #EF4444; color: #FFFFFF; font-family: sans-serif; margin: 16px;">
          <strong>⚠ Trading Master no pudo iniciar correctamente.</strong><br>
          Error: ${(error && error.message) ? error.message : String(error)}<br>
          <span style="font-size: 12px; color: #9CA3AF;">Revisa la consola del navegador (F12 → Console) para más detalle, y comparte ese mensaje exacto.</span>
        </div>
      `);
    }
  });