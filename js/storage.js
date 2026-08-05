/* ============================================================
   PERSISTENCIA — Trading Master
   Etapa 3 de modularización: capa de almacenamiento.

   Contiene las claves de storage, el estado en memoria que se
   sincroniza con ellas, y las funciones de carga/guardado.
   El código es idéntico al que estaba en index.html.

   NOTA: si en el futuro se migra de window.storage a otro backend
   (Supabase, API propia, etc.), este es el único archivo que
   debería cambiar — el resto de la app llama a estas funciones
   sin saber qué hay debajo.
   ============================================================ */

  const STORAGE_KEY = 'tradingJournalOperations';
  let operaciones = [];        // array en memoria, sincronizado con localStorage
  let editingId = null;        // null = creando nueva operación, id = editando existente
  let imagenTemporal = null;   // base64 de la imagen seleccionada (temporal)
  let pendingDeleteId = null;  // id pendiente de confirmación de borrado

  const PLAN_TRADING_KEY = 'tradingJournalPlan';
  let planTrading = {};

  // --- Identificador de Trade (v0.4.5 — Parte 4) ---
  // Contador persistente e incremental, independiente del "id" interno usado
  // para CRUD/DOM. Nunca disminuye ni se reutiliza, aunque se eliminen operaciones.
  const CONTADOR_TRADES_KEY = 'tradingJournalContadorTrades';
  let contadorTrades = 0;

  async function cargarContadorTrades(){
    try{
      const res = await window.storage.get(CONTADOR_TRADES_KEY, false);
      contadorTrades = (res && res.value) ? (parseInt(res.value, 10) || 0) : 0;
    }catch(e){
      contadorTrades = 0;
    }
  }

  async function persistirContadorTrades(){
    try{
      await window.storage.set(CONTADOR_TRADES_KEY, String(contadorTrades), false);
    }catch(e){
      console.error('No se pudo guardar el contador de Trade ID:', e);
    }
  }

  function generarSiguienteIdTrade(){
    contadorTrades += 1;
    return 'TM-' + String(contadorTrades).padStart(6, '0');
  }

  // --- Gestión de Cuentas (AC-01) ---

  // Misma arquitectura de persistencia que operaciones/plan/contador: una
  // colección independiente en window.storage, cargada y guardada de forma
  // asíncrona con el mismo patrón try/catch ya establecido en todo el proyecto.
  const CUENTAS_KEY = 'tradingJournalCuentas';
  let cuentas = [];
  let editingCuentaId = null;

  // AC-01.1 — ID permanente de Cuenta (CTA-000001...), mismo patrón exacto
  // que el Identificador de Trade (TM-000001): contador persistente que
  // nunca decrece ni se reutiliza, independiente del "id" interno usado
  // para CRUD/DOM.
  const CONTADOR_CUENTAS_KEY = 'tradingJournalContadorCuentas';
  let contadorCuentas = 0;

  async function cargarContadorCuentas(){
    try{
      const res = await window.storage.get(CONTADOR_CUENTAS_KEY, false);
      contadorCuentas = (res && res.value) ? (parseInt(res.value, 10) || 0) : 0;
    }catch(e){
      contadorCuentas = 0;
    }
  }

  async function persistirContadorCuentas(){
    try{
      await window.storage.set(CONTADOR_CUENTAS_KEY, String(contadorCuentas), false);
    }catch(e){
      console.error('No se pudo guardar el contador de ID de Cuenta:', e);
    }
  }

  function generarSiguienteIdCuenta(){
    contadorCuentas += 1;
    return 'CTA-' + String(contadorCuentas).padStart(6, '0');
  }

  async function cargarCuentas(){
    try{
      const res = await window.storage.get(CUENTAS_KEY, false);
      cuentas = (res && res.value) ? JSON.parse(res.value) : [];
    }catch(e){
      cuentas = [];
    }
  }

  async function persistirCuentas(){
    try{
      await window.storage.set(CUENTAS_KEY, JSON.stringify(cuentas), false);
    }catch(e){
      console.error('No se pudo guardar la cuenta:', e);
      showToast('danger', 'No se pudo guardar', 'La cuenta no se guardó correctamente.');
    }
  }

  /* ============================================================
     PERSISTENCIA (Claude window.storage — personal, ligado a tu cuenta)
     ============================================================ */
  async function loadOperations(){
    try{
      const res = await window.storage.get(STORAGE_KEY, false);
      operaciones = res && res.value ? JSON.parse(res.value) : [];
    }catch(e){
      // La clave no existe aún (primera vez que se usa la app) u otro error de lectura
      operaciones = [];
    }
  }

  async function persistirOperaciones(){
    try{
      await window.storage.set(STORAGE_KEY, JSON.stringify(operaciones), false);
    }catch(e){
      console.error('No se pudo guardar en window.storage:', e);
      showToast('danger', 'No se pudo guardar', 'El almacenamiento de Claude falló. Intenta de nuevo.');
    }
  }

  /* ============================================================
     MI PLAN DE TRADING — persistencia y render (Fase 4.3)
     ============================================================ */
  async function loadPlanTrading(){
    try{
      const res = await window.storage.get(PLAN_TRADING_KEY, false);
      const guardado = res && res.value ? JSON.parse(res.value) : {};
      planTrading = Object.assign({}, PLAN_TRADING_DEFAULTS, guardado);
    }catch(e){
      // Primera vez que se usa el módulo (la clave aún no existe) u otro error de lectura.
      planTrading = Object.assign({}, PLAN_TRADING_DEFAULTS);
    }
  }

  async function guardarPlanTrading(){
    try{
      await window.storage.set(PLAN_TRADING_KEY, JSON.stringify(planTrading), false);
    }catch(e){
      console.error('No se pudo guardar el Plan de Trading:', e);
      showToast('danger', 'No se pudo guardar', 'El plan de trading no se guardó correctamente.');
    }
  }
