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
  // Sprint TV-3A — estado del modal de registro de movimientos. Mismo
  // patrón que editingId/imagenTemporal: variables simples de módulo,
  // sin arquitectura nueva.
  let movimientoTradeIdActual = null;
  let movimientoDireccionTradeActual = null;
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

  // Sprint (conexión de Trades) — ya no depende de contadorTrades/window.storage.
  // El siguiente TM-XXXXXX se deriva de las operaciones ya cargadas desde
  // Supabase: el número más alto encontrado + 1. cargarContadorTrades() /
  // persistirContadorTrades() quedan sin usar (código muerto, no se borran
  // por si algo más las necesita) — ya no se llaman desde aquí.
  function generarSiguienteIdTrade(){
    let maxNum = 0;
    operaciones.forEach(op => {
      const match = op.idTrade && op.idTrade.match(/^TM-(\d+)$/);
      if(match){
        const num = parseInt(match[1], 10);
        if(num > maxNum) maxNum = num;
      }
    });
    return 'TM-' + String(maxNum + 1).padStart(6, '0');
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
     PERSISTENCIA (Supabase — tabla `trades`)

     Sprint previo a Sprint 5: hasta aquí, las Operaciones (Trades) eran
     el ÚNICO dato que seguía viviendo en window.storage (exclusivo de
     artifacts de Claude.ai) — no existía fuera de una sesión de Claude.
     Cuentas, Activos y el Administrador de Variables ya se habían
     conectado antes; esto cierra la migración completa a Supabase.

     trade_data (JSONB) guarda el objeto `op` completo tal cual —
     el mismo modelo que ya usaban Ficha Técnica, Dashboard, etc. — así
     que no hace falta traducir nombres de campo (a diferencia de
     Cuentas/Activos, aquí no hay mapeo UI<->DB porque la tabla ya se
     diseñó para guardar JSON libre).
     ============================================================ */
  async function loadOperations(){
    const { data, error } = await supabaseClient
      .from('trades')
      .select('id, trade_data')
      .order('created_at', { ascending: true });

    if(error){
      console.error('No se pudieron cargar las operaciones desde Supabase:', error);
      showToast('danger', 'No se pudieron cargar tus operaciones', error.message);
      operaciones = [];
      return;
    }
    operaciones = (data || []).map(row => Object.assign({}, row.trade_data, { id: row.id }));
  }

  // Crea UNA operación nueva en Supabase. Devuelve el objeto `op` ya con el
  // id real (UUID) que asignó Supabase — quien llama debe usar ESE objeto,
  // no el que tenía antes de guardar.
  async function crearOperacionEnSupabase(op){
    const { data: userData } = await supabaseClient.auth.getUser();
    const userId = userData && userData.user ? userData.user.id : null;

    const tradeData = Object.assign({}, op);
    delete tradeData.id; // el id real lo genera Supabase, no se guarda dos veces

    const { data, error } = await supabaseClient
      .from('trades')
      .insert({ user_id: userId, trade_data: tradeData })
      .select('id, trade_data')
      .single();

    if(error){
      console.error('No se pudo crear la operación en Supabase:', error);
      throw error;
    }
    return Object.assign({}, data.trade_data, { id: data.id });
  }

  // Actualiza UNA operación existente por su id (UUID real de Supabase).
  async function actualizarOperacionEnSupabase(id, op){
    const tradeData = Object.assign({}, op);
    delete tradeData.id;

    const { data, error } = await supabaseClient
      .from('trades')
      .update({ trade_data: tradeData })
      .eq('id', id)
      .select('id, trade_data')
      .single();

    if(error){
      console.error('No se pudo actualizar la operación en Supabase:', error);
      throw error;
    }
    return Object.assign({}, data.trade_data, { id: data.id });
  }

  async function eliminarOperacionEnSupabase(id){
    const { error } = await supabaseClient.from('trades').delete().eq('id', id);
    if(error){
      console.error('No se pudo eliminar la operación en Supabase:', error);
      throw error;
    }
  }

  /* ============================================================
     Sprint TV-1C — capa de persistencia para trade_movements.
     Únicamente estas 2 funciones. Ningún llamador todavía en el
     proyecto (ninguna UI, ningún flujo real de creación de
     movimientos) — eso queda explícitamente para un Sprint futuro.
     Mismo patrón exacto que crearOperacionEnSupabase()/loadOperations()
     de arriba: supabaseClient.auth.getUser() para el usuario, insert/
     select con .single(), console.error + throw en el catch, sin
     showToast aquí (lo maneja quien llame a estas funciones).
     ============================================================ */
  async function crearMovimientoEnSupabase(movimiento){
    const { data: userData } = await supabaseClient.auth.getUser();
    const userId = userData && userData.user ? userData.user.id : null;

    if(!movimiento || !movimiento.trade_id){
      throw new Error('crearMovimientoEnSupabase requiere movimiento.trade_id.');
    }

    // Solo los campos reales de la tabla (estructura confirmada en la
    // auditoría TV-1A) — nunca se pasa el objeto de entrada tal cual.
    const registro = {
      trade_id: movimiento.trade_id,
      user_id: userId,
      movement_type: movimiento.movement_type,
      movement_category: movimiento.movement_category,
      occurred_at: movimiento.occurred_at,
      price: movimiento.price !== undefined ? movimiento.price : null,
      quantity: movimiento.quantity !== undefined ? movimiento.quantity : null,
      // direction: en este Sprint se guarda tal cual venga en el objeto de
      // entrada — la derivación automática (Trade.direccion + movement_type)
      // es responsabilidad del Sprint futuro que construya el flujo real de
      // creación de movimientos, no de esta capa de persistencia.
      direction: movimiento.direction !== undefined ? movimiento.direction : null,
      commission: movimiento.commission !== undefined ? movimiento.commission : null,
      amount: movimiento.amount !== undefined ? movimiento.amount : null,
      notes: movimiento.notes !== undefined ? movimiento.notes : null,
      // TV-1D — null y undefined (ausente o explícito) se tratan igual:
      // ausencia de metadata -> {} (compatible con NOT NULL DEFAULT
      // '{}'::jsonb). Cualquier otro valor recibido (incluido {} y objetos
      // con contenido) se conserva exactamente tal cual.
      metadata: (movimiento.metadata === undefined || movimiento.metadata === null) ? {} : movimiento.metadata
    };

    const { data, error } = await supabaseClient
      .from('trade_movements')
      .insert(registro)
      .select()
      .single();

    if(error){
      console.error('No se pudo crear el movimiento en Supabase:', error);
      throw error;
    }
    return data; // incluye el id real generado por Supabase
  }

  async function cargarMovimientosDelTrade(tradeId){
    const { data, error } = await supabaseClient
      .from('trade_movements')
      .select()
      .eq('trade_id', tradeId)
      .order('occurred_at', { ascending: true })
      .order('created_at', { ascending: true }); // desempate estable si occurred_at coincide

    if(error){
      console.error('No se pudieron cargar los movimientos del Trade:', error);
      throw error;
    }
    return data || []; // Trade sin movimientos (histórico) -> [], nunca se inventa nada
  }

  // Se conserva SOLO para migrarCuentasDeOperaciones()/migrarContextosTecnicos()
  // (app.js), que mutan varias operaciones en memoria y esperan poder
  // "guardar todo lo que cambió" al final. trades.js YA NO la usa para su
  // propio CRUD (crear/editar/eliminar usan las 3 funciones de arriba,
  // más precisas y sin reescribir operaciones que no cambiaron).
  async function persistirOperaciones(){
    try{
      for(const op of operaciones){
        if(!op.id) continue;
        const tradeData = Object.assign({}, op);
        delete tradeData.id;
        const { error } = await supabaseClient.from('trades').update({ trade_data: tradeData }).eq('id', op.id);
        if(error){
          console.error('No se pudo actualizar una operación (persistirOperaciones):', error);
        }
      }
    }catch(e){
      console.error('Error en persistirOperaciones (Supabase):', e);
      showToast('danger', 'No se pudo guardar', 'No se pudieron guardar los cambios en Supabase.');
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
