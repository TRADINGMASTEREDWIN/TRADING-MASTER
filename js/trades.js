/* ============================================================
   OPERACIONES (TRADES) — Trading Master
   Etapa 7 de modularización: el módulo más grande — formulario de
   registro, Variables de Decisión (Liquidez, Estructura, Price Action,
   Desequilibrios, Volumen), Psicología, Contexto Técnico, CRUD de
   operaciones, motor de cálculos de la operación, Ficha Técnica,
   historial, filtros y validaciones.
   El código es idéntico al que estaba en index.html.

   Depende de constantes y funciones que permanecen en index.html
   (MERCADOS, ESTRATEGIAS, LIQUIDEZ_*, ESTRUCTURA_*, etc., además de
   showToast(), construirCamposDinamicos(), attachVisualListeners()),
   y de storage.js/accounts.js/dashboard.js para el estado y los
   cálculos agregados. Todas esas referencias se resuelven en tiempo
   de ejecución (dentro de initApp()), nunca al cargar este archivo,
   así que el orden de los <script> no genera ningún problema.
   ============================================================ */

  function poblarSelect(selectEl, opciones, textoVacio){
    if(!selectEl) return;
    let html = `<option value="">${textoVacio}</option>`;
    html += opciones.map(op => `<option value="${op}">${op}</option>`).join('');
    selectEl.innerHTML = html;
  }

  function poblarGrupoMultiSeleccion(containerEl, opciones){
    if(!containerEl) return;
    containerEl.innerHTML = opciones
      .map(op => `<span class="chip" data-value="${op}">${op}</span>`)
      .join('');
  }

  function obtenerSeleccionadosDeGrupo(containerEl){
    if(!containerEl) return [];
    return Array.from(containerEl.querySelectorAll('.chip.active')).map(c => c.dataset.value);
  }

  function aplicarSeleccionEnGrupo(containerEl, valoresSeleccionados){
    if(!containerEl) return;
    const seleccionados = Array.isArray(valoresSeleccionados) ? valoresSeleccionados : [];
    containerEl.querySelectorAll('.chip').forEach(chip => {
      chip.classList.toggle('active', seleccionados.includes(chip.dataset.value));
    });
  }

  function poblarContextoTecnicoChips(containerEl){
    if(!containerEl) return;
    // IMP-03: 1M se retiró del grid — ninguna regla de Tipo de Trade lo
    // solicita (Scalping/Intradía/Swing/Position cubren como máximo hasta 1W).
    const bloques = [
      { titulo: 'Contexto Macro', temporalidades: ['1W', '1D'] },
      { titulo: 'Contexto Operativo', temporalidades: ['4H', '1H'] },
      { titulo: 'Ejecución', temporalidades: ['15m', '5m'] }
    ];

    containerEl.innerHTML = bloques.map(bloque => `
      <div class="contexto-bloque" data-bloque="${bloque.titulo}">
        <div class="contexto-bloque-titulo">${bloque.titulo}</div>
        ${bloque.temporalidades.map(tf => `
          <div class="contexto-fila" data-timeframe="${tf}">
            <span class="contexto-fila-label">${tf}</span>
            <div class="contexto-chip-row">
              ${EMA50_ESTADOS.map(e => `<span class="chip contexto-estado-chip" data-value="${e.valor}">${e.emoji} ${e.etiqueta}</span>`).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `).join('');
  }

  function obtenerContextoTecnico(){
    const resultado = {};
    document.querySelectorAll('.contexto-fila').forEach(fila => {
      if(fila.style.display === 'none') return; // IMP-03: oculta = no aplica a este Tipo de Trade
      const chipActivo = fila.querySelector('.contexto-estado-chip.active');
      const valor = chipActivo ? chipActivo.dataset.value : '';
      if(valor) resultado[fila.dataset.timeframe] = valor; // no crear claves vacías
    });
    return resultado;
  }

  function aplicarContextoTecnico(contextoTecnico){
    const datos = contextoTecnico || {};
    document.querySelectorAll('.contexto-fila').forEach(fila => {
      const valorGuardado = datos[fila.dataset.timeframe];
      fila.querySelectorAll('.contexto-estado-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.value === valorGuardado);
      });
    });
  }

  // Sprint 4.1 — se eliminó actualizarTemporalidadesVisibles() de aquí: su
  // única función era mostrar/ocultar filas de #contextoMercadoGrid, que ya
  // no existe desde el Sprint UX-2A (Indicadores Técnicos lo reemplazó) —
  // esta función seguía corriendo en cada cambio de Tipo de Trade sin
  // ningún efecto real. TEMPORALIDADES_POR_TIPO_TRADE (la constante que
  // usaba) también se eliminó por completo del proyecto. En su lugar,
  // poblarSelectTemporalidadSegunTipoTrade() (js/catalogosGenerales.js)
  // filtra de verdad el selector de Temporalidad usando Supabase.

  function actualizarVisibilidadOtroConfirmacion(){
    const container = document.getElementById('confirmacionesCheckboxGroup');
    const wrapper = document.getElementById('otroConfirmacionWrapper');
    if(!container || !wrapper) return;
    const otroChip = container.querySelector('.chip[data-value="Otro"]');
    const mostrar = !!(otroChip && otroChip.classList.contains('active'));
    wrapper.style.display = mostrar ? 'block' : 'none';
  }

  function obtenerPsicologiaData(){
    const seleccionUnica = (containerId) => {
      const el = document.querySelector(`#${containerId} .chip.active`);
      return el ? el.dataset.value : '';
    };
    const seleccionMultiple = (containerId) => {
      return Array.from(document.querySelectorAll(`#${containerId} .chip.active`)).map(c => c.dataset.value);
    };

    return {
      estadoEmocional: seleccionUnica('psicologiaEstadoEmocionalGroup'),
      concentracion: seleccionUnica('psicologiaConcentracionGroup'),
      cristoIndicador: seleccionUnica('psicologiaCristoIndicadorGroup'),
      emocionesDurante: seleccionMultiple('psicologiaEmocionesDuranteGroup'),
      emocionesOtro: document.getElementById('psicologiaEmocionesOtroInput').value.trim(),
      cumplimientoPlan: seleccionUnica('psicologiaCumplimientoGroup'),
      hiceBien: document.getElementById('psicologiaHiceBien').value.trim(),
      hiceMal: document.getElementById('psicologiaHiceMal').value.trim(),
      aprendizaje: document.getElementById('psicologiaAprendizaje').value.trim(),
      proximaVez: document.getElementById('psicologiaProximaVez').value.trim(),
      causaResultado: seleccionUnica('psicologiaCausaResultadoGroup')
    };
  }

  function aplicarPsicologiaData(psicologia){
    const datos = psicologia || {};
    const marcarUnica = (containerId, valor) => {
      document.querySelectorAll(`#${containerId} .chip`).forEach(chip => {
        chip.classList.toggle('active', chip.dataset.value === valor);
      });
    };
    const marcarMultiple = (containerId, valores) => {
      const lista = Array.isArray(valores) ? valores : [];
      document.querySelectorAll(`#${containerId} .chip`).forEach(chip => {
        chip.classList.toggle('active', lista.includes(chip.dataset.value));
      });
    };

    marcarUnica('psicologiaEstadoEmocionalGroup', datos.estadoEmocional);
    marcarUnica('psicologiaConcentracionGroup', datos.concentracion);
    marcarUnica('psicologiaCristoIndicadorGroup', datos.cristoIndicador);
    marcarMultiple('psicologiaEmocionesDuranteGroup', datos.emocionesDurante);
    document.getElementById('psicologiaEmocionesOtroInput').value = datos.emocionesOtro || '';
    marcarUnica('psicologiaCumplimientoGroup', datos.cumplimientoPlan);
    document.getElementById('psicologiaHiceBien').value = datos.hiceBien || '';
    document.getElementById('psicologiaHiceMal').value = datos.hiceMal || '';
    document.getElementById('psicologiaAprendizaje').value = datos.aprendizaje || '';
    document.getElementById('psicologiaProximaVez').value = datos.proximaVez || '';
    marcarUnica('psicologiaCausaResultadoGroup', datos.causaResultado);
    actualizarVisibilidadEmocionOtro();
  }

  function resetearPsicologia(){
    aplicarPsicologiaData({});
  }

  function leerToggleDecision(nombre){
    const activo = document.querySelector(`#toggle-decision-${nombre} button.active`);
    return activo ? activo.dataset.valor === 'si' : false;
  }

  function aplicarToggleDecision(nombre, aplica){
    document.querySelectorAll(`#toggle-decision-${nombre} button`).forEach(btn => {
      btn.classList.toggle('active', (btn.dataset.valor === 'si') === !!aplica);
    });
  }

  function actualizarVisibilidadDecision(nombre){
    const body = document.getElementById(`decisionBody-${nombre}`);
    if(body) body.style.display = leerToggleDecision(nombre) ? 'block' : 'none';
  }

  function leerSegmentedActivo(id){
    const activo = document.querySelector(`#${id} button.active`);
    return activo ? activo.dataset.valor : null;
  }

  function aplicarSegmentedActivo(id, valor){
    document.querySelectorAll(`#${id} button`).forEach(btn => {
      btn.classList.toggle('active', btn.dataset.valor === valor);
    });
  }

  function actualizarVisibilidadCalidadBarrido(){
    const wrapper = document.getElementById('liquidezCalidadBarridoWrapper');
    const valor = leerSegmentedActivo('liquidezBarrido');
    if(wrapper) wrapper.style.display = (valor && valor !== 'sinBarrido') ? 'block' : 'none';
  }

  function obtenerDecisionLiquidez(){
    const aplica = leerToggleDecision('liquidez');
    if(!aplica) return { aplica: false };
    const barrido = leerSegmentedActivo('liquidezBarrido');
    return {
      aplica: true,
      peso: leerSegmentedActivo('liquidezPeso'),
      zonaPrincipal: document.getElementById('liquidezZonaPrincipal').value,
      barrido,
      calidadBarrido: (barrido && barrido !== 'sinBarrido') ? leerSegmentedActivo('liquidezCalidadBarrido') : null,
      recuperacion: leerSegmentedActivo('liquidezRecuperacion'),
      metodoEntrada: leerSegmentedActivo('liquidezMetodoEntrada')
    };
  }

  function aplicarDecisionLiquidez(decisiones){
    const liquidez = (decisiones && decisiones.liquidez) || {};
    aplicarToggleDecision('liquidez', !!liquidez.aplica);
    aplicarSegmentedActivo('liquidezPeso', liquidez.peso || LIQUIDEZ_PESO[0].valor);
    document.getElementById('liquidezZonaPrincipal').value = liquidez.zonaPrincipal || '';
    // v0.5.x: operaciones anteriores guardaron `barrido` como booleano (Sí/No).
    // No hay una equivalencia confiable a parcial/completo, así que en el
    // formulario de edición se deja el valor por defecto en vez de inventarla
    // (la Ficha Técnica sí sigue mostrando el dato original de esas operaciones).
    const barridoValor = typeof liquidez.barrido === 'string' ? liquidez.barrido : LIQUIDEZ_BARRIDO[0].valor;
    aplicarSegmentedActivo('liquidezBarrido', barridoValor);
    aplicarSegmentedActivo('liquidezCalidadBarrido', liquidez.calidadBarrido || LIQUIDEZ_CALIDAD_BARRIDO[0].valor);
    actualizarVisibilidadCalidadBarrido();
    aplicarSegmentedActivo('liquidezRecuperacion', liquidez.recuperacion || LIQUIDEZ_RECUPERACION[0].valor);
    aplicarSegmentedActivo('liquidezMetodoEntrada', liquidez.metodoEntrada || LIQUIDEZ_METODO_ENTRADA[0].valor);
    actualizarVisibilidadDecision('liquidez');
  }

  function leerChipActivo(containerId){
    const activo = document.querySelector(`#${containerId} .chip.active`);
    return activo ? activo.dataset.value : '';
  }

  function aplicarChipActivo(containerId, valor){
    document.querySelectorAll(`#${containerId} .chip`).forEach(chip => {
      chip.classList.toggle('active', chip.dataset.value === valor);
    });
  }

  function obtenerSeleccionMultiple(containerId){
    return Array.from(document.querySelectorAll(`#${containerId} .chip.active`)).map(c => c.dataset.value);
  }

  function aplicarSeleccionMultiple(containerId, valores){
    const lista = Array.isArray(valores) ? valores : [];
    document.querySelectorAll(`#${containerId} .chip`).forEach(chip => {
      chip.classList.toggle('active', lista.includes(chip.dataset.value));
    });
  }

  function poblarGrupoConEstrella(containerEl, opciones, categoria){
    if(!containerEl) return;
    if(opciones.length === 0){
      containerEl.innerHTML = `<span style="color: var(--color-text-muted); font-size: var(--fs-sm); font-style: italic;">Próximamente — lista en definición.</span>`;
      return;
    }
    containerEl.innerHTML = opciones.map(op => `
      <span class="chip" data-value="${op}" data-categoria="${categoria}">${op}<span class="chip-estrella" title="Marcar como factor principal">⭐</span></span>
    `).join('');
  }

  function poblarGrupoConEstrellaObjetos(containerEl, opciones, categoria){
    if(!containerEl) return;
    containerEl.innerHTML = opciones.map(o => `
      <span class="chip" data-value="${o.valor}" data-categoria="${categoria}">${o.etiqueta}<span class="chip-estrella" title="Marcar como factor principal">⭐</span></span>
    `).join('');
  }

  function limpiarEstrellaEstructura(){
    document.querySelectorAll('#decisionBody-estructura .chip-estrella').forEach(e => e.classList.remove('activa'));
  }

  function obtenerFactorPrincipalEstructura(){
    const estrella = document.querySelector('#decisionBody-estructura .chip-estrella.activa');
    if(!estrella) return { categoria: '', valor: '' };
    const chip = estrella.closest('.chip');
    return { categoria: chip.dataset.categoria, valor: chip.dataset.value };
  }

  function aplicarFactorPrincipalEstructura(factorPrincipal){
    limpiarEstrellaEstructura();
    if(!factorPrincipal || !factorPrincipal.categoria || !factorPrincipal.valor) return;
    const chip = document.querySelector(
      `#decisionBody-estructura .chip[data-categoria="${factorPrincipal.categoria}"][data-value="${factorPrincipal.valor}"]`
    );
    const estrella = chip ? chip.querySelector('.chip-estrella') : null;
    if(estrella) estrella.classList.add('activa');
  }

  function obtenerDecisionEstructura(){
    const influye = leerToggleDecision('estructura');
    if(!influye) return { influye: false };

    return {
      influye: true,
      observaciones: {
        referencias: obtenerSeleccionMultiple('estructuraReferencias'),
        formaciones: obtenerSeleccionMultiple('estructuraFormaciones')
      },
      interpretacion: {
        ubicacion: leerChipActivo('estructuraUbicacion'),
        hipotesis: leerChipActivo('estructuraHipotesis')
      },
      confirmaciones: obtenerSeleccionMultiple('estructuraConfirmaciones'),
      factorPrincipal: obtenerFactorPrincipalEstructura()
    };
  }

  function aplicarDecisionEstructura(decisiones){
    const estructura = (decisiones && decisiones.estructura) || {};
    aplicarToggleDecision('estructura', !!estructura.influye);

    const obs = estructura.observaciones || {};
    aplicarSeleccionMultiple('estructuraReferencias', obs.referencias);
    aplicarSeleccionMultiple('estructuraFormaciones', obs.formaciones);
    aplicarSeleccionMultiple('estructuraConfirmaciones', estructura.confirmaciones);

    const interp = estructura.interpretacion || {};
    aplicarChipActivo('estructuraUbicacion', interp.ubicacion || '');
    aplicarChipActivo('estructuraHipotesis', interp.hipotesis || '');

    aplicarFactorPrincipalEstructura(estructura.factorPrincipal);
    actualizarVisibilidadDecision('estructura');
  }

  function limpiarEstrellaPriceAction(){
    document.querySelectorAll('#decisionBody-priceAction .chip-estrella').forEach(e => e.classList.remove('activa'));
  }

  function obtenerFactorPrincipalPriceAction(){
    const estrella = document.querySelector('#decisionBody-priceAction .chip-estrella.activa');
    if(!estrella) return { categoria: '', valor: '' };
    const chip = estrella.closest('.chip');
    return { categoria: chip.dataset.categoria, valor: chip.dataset.value };
  }

  function aplicarFactorPrincipalPriceAction(factorPrincipal){
    limpiarEstrellaPriceAction();
    if(!factorPrincipal || !factorPrincipal.categoria || !factorPrincipal.valor) return;
    const chip = document.querySelector(
      `#decisionBody-priceAction .chip[data-categoria="${factorPrincipal.categoria}"][data-value="${factorPrincipal.valor}"]`
    );
    const estrella = chip ? chip.querySelector('.chip-estrella') : null;
    if(estrella) estrella.classList.add('activa');
  }

  function obtenerDecisionPriceAction(){
    const influye = leerToggleDecision('priceAction');
    if(!influye) return { influye: false };
    return {
      influye: true,
      patrones: obtenerSeleccionMultiple('priceActionPatrones'),
      lectura: obtenerSeleccionMultiple('priceActionLectura'),
      confirmaciones: obtenerSeleccionMultiple('priceActionConfirmaciones'),
      factorPrincipal: obtenerFactorPrincipalPriceAction()
    };
  }

  function aplicarDecisionPriceAction(decisiones){
    const priceAction = (decisiones && decisiones.priceAction) || {};
    aplicarToggleDecision('priceAction', !!priceAction.influye);
    aplicarSeleccionMultiple('priceActionPatrones', priceAction.patrones);
    aplicarSeleccionMultiple('priceActionLectura', priceAction.lectura);
    aplicarSeleccionMultiple('priceActionConfirmaciones', priceAction.confirmaciones);
    aplicarFactorPrincipalPriceAction(priceAction.factorPrincipal);
    actualizarVisibilidadDecision('priceAction');
  }

  function limpiarEstrellaDesequilibrios(){
    document.querySelectorAll('#decisionBody-desequilibrios .chip-estrella').forEach(e => e.classList.remove('activa'));
  }

  function obtenerFactorPrincipalDesequilibrios(){
    const estrella = document.querySelector('#decisionBody-desequilibrios .chip-estrella.activa');
    if(!estrella) return { categoria: '', valor: '' };
    const chip = estrella.closest('.chip');
    return { categoria: chip.dataset.categoria, valor: chip.dataset.value };
  }

  function aplicarFactorPrincipalDesequilibrios(factorPrincipal){
    limpiarEstrellaDesequilibrios();
    if(!factorPrincipal || !factorPrincipal.categoria || !factorPrincipal.valor) return;
    const chip = document.querySelector(
      `#decisionBody-desequilibrios .chip[data-categoria="${factorPrincipal.categoria}"][data-value="${factorPrincipal.valor}"]`
    );
    const estrella = chip ? chip.querySelector('.chip-estrella') : null;
    if(estrella) estrella.classList.add('activa');
  }

  function obtenerDecisionDesequilibrios(){
    const influye = leerToggleDecision('desequilibrios');
    if(!influye) return { influye: false };
    return {
      influye: true,
      observados: obtenerSeleccionMultiple('desequilibriosObservados'),
      factorPrincipal: obtenerFactorPrincipalDesequilibrios()
    };
  }

  function aplicarDecisionDesequilibrios(decisiones){
    const desequilibrios = (decisiones && decisiones.desequilibrios) || {};
    aplicarToggleDecision('desequilibrios', !!desequilibrios.influye);
    aplicarSeleccionMultiple('desequilibriosObservados', desequilibrios.observados);
    aplicarFactorPrincipalDesequilibrios(desequilibrios.factorPrincipal);
    actualizarVisibilidadDecision('desequilibrios');
  }

  function limpiarEstrellaVolumen(){
    document.querySelectorAll('#decisionBody-volumen .chip-estrella').forEach(e => e.classList.remove('activa'));
  }

  function obtenerFactorPrincipalVolumen(){
    const estrella = document.querySelector('#decisionBody-volumen .chip-estrella.activa');
    if(!estrella) return { categoria: '', valor: '' };
    const chip = estrella.closest('.chip');
    return { categoria: chip.dataset.categoria, valor: chip.dataset.value };
  }

  function aplicarFactorPrincipalVolumen(factorPrincipal){
    limpiarEstrellaVolumen();
    if(!factorPrincipal || !factorPrincipal.categoria || !factorPrincipal.valor) return;
    const chip = document.querySelector(
      `#decisionBody-volumen .chip[data-categoria="${factorPrincipal.categoria}"][data-value="${factorPrincipal.valor}"]`
    );
    const estrella = chip ? chip.querySelector('.chip-estrella') : null;
    if(estrella) estrella.classList.add('activa');
  }

  function obtenerDecisionVolumen(){
    const influye = leerToggleDecision('volumen');
    if(!influye) return { influye: false };
    return {
      influye: true,
      lectura: obtenerSeleccionMultiple('volumenLectura'),
      vrvp: obtenerSeleccionMultiple('volumenVrvp'),
      factorPrincipal: obtenerFactorPrincipalVolumen()
    };
  }

  function aplicarDecisionVolumen(decisiones){
    const volumen = (decisiones && decisiones.volumen) || {};
    aplicarToggleDecision('volumen', !!volumen.influye);
    aplicarSeleccionMultiple('volumenLectura', volumen.lectura);
    aplicarSeleccionMultiple('volumenVrvp', volumen.vrvp);
    aplicarFactorPrincipalVolumen(volumen.factorPrincipal);
    actualizarVisibilidadDecision('volumen');
  }

  function verificarAdvertenciaEstructura(estructura){
    if(!estructura || !estructura.influye) return;
    const obs = estructura.observaciones || {};
    const totalElementos =
      (obs.referencias || []).length +
      (obs.formaciones || []).length +
      (estructura.confirmaciones || []).length;
    if(totalElementos === 0){
      showToast('warning', 'Estructura incompleta', 'Selecciona al menos un elemento estructural.');
    }
  }

  function attachPsicologiaGroupListeners(){
    const grupos = [
      'psicologiaEstadoEmocionalGroup',
      'psicologiaConcentracionGroup',
      'psicologiaCristoIndicadorGroup',
      'psicologiaEmocionesDuranteGroup',
      'psicologiaCumplimientoGroup',
      'psicologiaCausaResultadoGroup'
    ];

    grupos.forEach(id => {
      const container = document.getElementById(id);
      if(!container) return;
      container.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if(!chip) return;

        if(container.dataset.selectMode === 'multi'){
          chip.classList.toggle('active');
        }else{
          container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
        }

        if(id === 'psicologiaEmocionesDuranteGroup'){
          actualizarVisibilidadEmocionOtro();
        }
      });
    });
  }

  function poblarSelectActivo(selectEl){
    if(!selectEl) return;
    let html = `<option value="">Selecciona…</option>`;
    html += ACTIVOS_FAVORITOS.map(a => `<option value="${a}">${a}</option>`).join('');
    html += `<option value="Otro...">Otro...</option>`;
    selectEl.innerHTML = html;
  }

  function actualizarVisibilidadActivoOtro(){
    const select = document.getElementById('selectActivo');
    const wrapper = document.getElementById('activoOtroWrapper');
    if(!select || !wrapper) return;
    wrapper.style.display = (select.value === 'Otro...') ? 'block' : 'none';
  }

  function poblarGrupoChipsConEmoji(containerEl, opciones){
    if(!containerEl) return;
    containerEl.innerHTML = opciones
      .map(o => `<span class="chip" data-value="${o.valor}">${o.emoji} ${o.valor}</span>`)
      .join('');
  }

  function poblarSegmented(containerEl, opciones){
    if(!containerEl) return;
    containerEl.innerHTML = opciones
      .map((o, i) => `<button type="button" class="${i === 0 ? 'active' : ''}" data-valor="${o.valor}">${o.etiqueta}</button>`)
      .join('');
  }

  function actualizarVisibilidadEmocionOtro(){
    const container = document.getElementById('psicologiaEmocionesDuranteGroup');
    const wrapper = document.getElementById('psicologiaEmocionesOtroWrapper');
    if(!container || !wrapper) return;
    const otroChip = container.querySelector('.chip[data-value="Otro"]');
    wrapper.style.display = (otroChip && otroChip.classList.contains('active')) ? 'block' : 'none';
  }

  function mostrarEstadoCargando(){
    document.getElementById('operationsTableBody').innerHTML =
      `<tr class="empty-row"><td colspan="11">Cargando tu historial…</td></tr>`;
  }

  function collectFormData(){
    const data = {};
    document.querySelectorAll('[data-field]').forEach(el => {
      data[el.dataset.field] = el.value.trim();
    });

    // Activo: si el usuario eligió "Otro...", el valor real viene del campo de texto libre.
    if(data.activo === 'Otro...'){
      data.activo = data.activoOtro || 'Otro...';
    }
    delete data.activoOtro;

    data.direccion = document.querySelector('#direccionSegmented button.active').dataset.direction;
    // GT-01.1: el Estado del Trade ya no lo elige el usuario — se deduce
    // automáticamente. Si están los 3 datos mínimos de cierre, quedó Cerrado;
    // si falta cualquiera, quedó Abierto. Esta es la única fuente de verdad.
    data.estadoTrade = (data.fechaSalida && data.horaSalida && data.precioSalida) ? 'Cerrado' : 'Abierto';
    // Sprint 4.2 — se retiró data.psicologia = obtenerPsicologiaData() de
    // aquí: "Estado Mental del Trader" migró por completo al motor de
    // Variables Observadas. obtenerPsicologiaData()/aplicarPsicologiaData()
    // siguen existiendo sin usarse — la Ficha Técnica las necesita para
    // operaciones ANTIGUAS.
    // ARQ-01: todas las variables de decisión viven bajo un solo objeto,
    // extensible sin tocar collectFormData en el futuro (solo se agrega
    // la llamada correspondiente aquí cuando exista una nueva).
    // Sprint 5 — Estructura, Price Action, Desequilibrios y Volumen migraron
    // por completo a data.variablesObservadas (motor dinámico), mismo criterio
    // que Liquidez en el Sprint anterior. Las funciones obtenerDecisionX()/
    // aplicarDecisionX() siguen existiendo sin usarse — la Ficha Técnica las
    // necesita para operaciones ANTIGUAS que sí tienen estos campos.
    data.decisiones = {};
    // Sprint 3 — bloque dinámico construido desde Supabase (variable_categories
    // / trading_variables / variable_options). Independiente de op.decisiones:
    // ese objeto sigue siendo de los 5 bloques históricos, sin tocar.
    data.variablesObservadas = obtenerVariablesObservadasData();
    // Sprint UX-2A — se retiró data.contextoTecnico = obtenerContextoTecnico()
    // de aquí: el Contexto Técnico (EMA50 fijo) migró por completo al motor
    // de Variables Observadas, como la nueva categoría "Indicadores Técnicos".
    // obtenerContextoTecnico()/aplicarContextoTecnico() siguen existiendo sin
    // usarse — la Ficha Técnica las necesita para operaciones ANTIGUAS.
    // Sprint UX-1 — el bloque "Confirmaciones" se retiró del formulario (esa
    // información ya vive en Variables Observadas, sin duplicar). Se deja de
    // recolectar data.confirmaciones para operaciones nuevas; la Ficha
    // Técnica sigue mostrando el campo tal cual para operaciones antiguas
    // que ya lo tengan guardado.
    data.imagenBase64 = imagenTemporal;
    data.imagenNombre = document.getElementById('filePreviewName').textContent !== '—'
      ? document.getElementById('filePreviewName').textContent
      : null;
    return data;
  }

  function populateForm(op){
    document.querySelectorAll('[data-field]').forEach(el => {
      el.value = op[el.dataset.field] !== undefined ? op[el.dataset.field] : '';
    });

    // Activo: si el valor guardado no está entre los favoritos, es un activo personalizado ("Otro...").
    const selectActivoEl = document.getElementById('selectActivo');
    if(selectActivoEl){
      const esFavorito = ACTIVOS_FAVORITOS.includes(op.activo);
      selectActivoEl.value = esFavorito ? (op.activo || '') : (op.activo ? 'Otro...' : '');
      const activoOtroInput = document.querySelector('[data-field="activoOtro"]');
      if(activoOtroInput){
        activoOtroInput.value = (!esFavorito && op.activo) ? op.activo : '';
      }
      actualizarVisibilidadActivoOtro();
    }

    // Compatibilidad: operaciones de versiones anteriores (0.1–0.4) usaban un solo campo "comision".
    // Se migra ese valor a "Comisión apertura" para no perder el costo ya registrado.
    if(op.comisionApertura === undefined && op.comision !== undefined){
      const comisionAperturaEl = document.querySelector('[data-field="comisionApertura"]');
      if(comisionAperturaEl) comisionAperturaEl.value = op.comision;
    }

    document.querySelectorAll('#direccionSegmented button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.direction === op.direccion);
    });

    // Sprint 4.2 — se retiró aplicarPsicologiaData(op.psicologia) de aquí:
    // el HTML fijo de Psicología ya no existe. aplicarVariablesObservadasData(),
    // ya llamado arriba, repuebla Estado Mental del Trader para operaciones
    // que lo tengan guardado en el modelo nuevo.
    // ARQ-01: compatibilidad automática — si la operación es anterior a este
    // módulo, `op.decisiones` no existe; aplicarDecisionLiquidez ya maneja
    // ese caso con su propio fallback `{}` y deja el toggle en "No".
    // Sprint 4/5 — se retiraron las 5 líneas aplicarDecisionX(op.decisiones)
    // que iban aquí (Liquidez, Estructura, Price Action, Desequilibrios,
    // Volumen): el HTML que esas funciones necesitan ya no existe (todas
    // son dinámicas ahora). aplicarVariablesObservadasData(), justo abajo,
    // ya se encarga de repoblar los 5 bloques para operaciones que los
    // tengan guardados en el modelo nuevo.
    aplicarVariablesObservadasData(op.variablesObservadas); // Sprint 3

    // Compatibilidad: operaciones antiguas no tienen estos campos — quedan vacíos/sin marcar.
    // Sprint 4.1 — el Tipo de Trade de esta operación ya se asignó arriba
    // (bucle genérico de [data-field]); ahora se repuebla Temporalidad según
    // ESE Tipo de Trade y se vuelve a aplicar el valor guardado — el bucle
    // genérico corrió antes de que el selector tuviera las opciones
    // correctas filtradas, así que su primer intento no cuenta.
    poblarSelectTemporalidadSegunTipoTrade();
    const selectTemporalidadEl = document.getElementById('selectTemporalidad');
    if(selectTemporalidadEl) selectTemporalidadEl.value = op.temporalidad || '';
    // Sprint UX-2A — se retiró aplicarContextoTecnico(op.contextoTecnico) de
    // aquí: el HTML del EMA50 fijo ya no existe. aplicarVariablesObservadasData(),
    // arriba, ya repuebla Indicadores Técnicos para operaciones que los tengan
    // guardados en el modelo nuevo.
    // Sprint UX-1 — se retiró aplicarSeleccionEnGrupo(...op.confirmaciones)
    // de aquí: el HTML de Confirmaciones ya no existe en el formulario.
    actualizarVisibilidadOtroConfirmacion();

    if(op.imagenBase64){
      imagenTemporal = op.imagenBase64;
      mostrarPreviewImagen(op.imagenBase64, op.imagenNombre || 'imagen-guardada.png');
    }else{
      removeImage();
    }
  }

  function establecerModoCierre(activo){
    CAMPOS_APERTURA_BLOQUEABLES.forEach(campo => {
      const el = document.querySelector(`[data-field="${campo}"]`);
      if(el) el.disabled = activo;
    });
    const aviso = document.getElementById('modoCierreAviso');
    if(aviso) aviso.style.display = activo ? 'block' : 'none';
  }

  function validateForm(data){
    limpiarErroresCampo();
    const errores = {};
    const faltantes = [];

    CAMPOS_OBLIGATORIOS.forEach(({ campo, etiqueta }) => {
      const valor = data[campo];
      const vacio = (valor === undefined || valor === null || String(valor).trim() === '');
      if(vacio){
        errores[campo] = true;
        faltantes.push(etiqueta);
      }
    });

    CAMPOS_OBLIGATORIOS_NUMERICOS.forEach(campo => {
      if(errores[campo]) return; // ya está marcado como vacío, no duplicar
      if(data[campo] !== '' && isNaN(parseFloat(data[campo]))){
        errores[campo] = true;
        const etiqueta = (CAMPOS_OBLIGATORIOS.find(c => c.campo === campo) || {}).etiqueta || campo;
        faltantes.push(`${etiqueta} (debe ser un número válido)`);
      }
    });

    // GT-01: los datos de cierre solo se exigen cuando el Trade está Cerrado.
    // Un Trade Abierto se guarda sin ellos — ese es el objetivo del módulo.
    if(data.estadoTrade === 'Cerrado'){
      ['fechaSalida', 'horaSalida', 'precioSalida'].forEach(campo => {
        if(!data[campo]){
          errores[campo] = true;
          faltantes.push(campo === 'precioSalida' ? 'Precio de salida' : campo === 'fechaSalida' ? 'Fecha de salida' : 'Hora de salida');
        }
      });
      if(!errores.precioSalida && data.precioSalida !== '' && isNaN(parseFloat(data.precioSalida))){
        errores.precioSalida = true;
      }
    }else if(data.precioSalida !== '' && isNaN(parseFloat(data.precioSalida))){
      // Trade Abierto: precio de salida opcional, pero si se llena debe ser válido.
      errores.precioSalida = true;
    }

    // Riesgo %: opcional, pero si se llena debe estar entre 0 y 100.
    if(data.riesgoPct !== ''){
      const riesgoPct = parseFloat(data.riesgoPct);
      if(isNaN(riesgoPct) || riesgoPct < 0 || riesgoPct > 100){ errores.riesgoPct = true; }
    }

    if(data.comisionApertura !== ''){
      const comisionApertura = parseFloat(data.comisionApertura);
      if(isNaN(comisionApertura) || comisionApertura < 0){ errores.comisionApertura = true; }
    }

    if(data.comisionCierre !== ''){
      const comisionCierre = parseFloat(data.comisionCierre);
      if(isNaN(comisionCierre) || comisionCierre < 0){ errores.comisionCierre = true; }
    }

    if(data.costoAdicional !== ''){
      const costoAdicional = parseFloat(data.costoAdicional);
      if(isNaN(costoAdicional) || costoAdicional < 0){ errores.costoAdicional = true; }
    }

    const valido = Object.keys(errores).length === 0;
    if(!valido){ mostrarErroresCampo(errores); }
    return { valido, errores, faltantes };
  }

  function mostrarErroresCampo(errores){
    Object.keys(errores).forEach(campo => {
      const input = document.querySelector(`[data-field="${campo}"]`);
      const msg = document.querySelector(`[data-error-for="${campo}"]`);
      if(input) input.classList.add('is-invalid');
      if(msg) msg.classList.add('visible');
    });
  }

  function limpiarErroresCampo(){
    document.querySelectorAll('[data-field]').forEach(el => el.classList.remove('is-invalid'));
    document.querySelectorAll('.field-error').forEach(el => el.classList.remove('visible'));
  }

  function calcularOperacion(datos){
    const resultado = {
      pnl: null,
      pnlNeto: null,
      riesgoDinero: null,
      rewardDinero: null,
      rrPlanificado: null,
      rMultiple: null,
      resultadoPct: null,
      estado: null
    };

    // GT-01: un Trade Abierto aún no tiene resultado — se registra sin calcular
    // nada todavía. Reutiliza la misma forma de "resultado" que ya existe para
    // datos insuficientes; el Dashboard y las tablas ya saben tratar pnlNeto/estado
    // nulos o distintos de Ganadora/Perdedora/Break Even, así que no requieren cambios.
    if(datos.estadoTrade === 'Abierto'){
      resultado.estado = 'Abierto';
      return resultado;
    }

    const entrada = parseFloat(datos.precioEntrada);
    const salida = parseFloat(datos.precioSalida);
    const tamano = parseFloat(datos.tamanoPosicion);
    const direccion = datos.direccion;

    // Costo total de la operación (Fase 4.1): suma de Comisión apertura + Comisión cierre + Costo adicional.
    // Compatibilidad: operaciones de versiones 0.1–0.4 solo tenían un campo "comision" único.
    let comisionFinal;
    if(datos.comisionApertura !== undefined || datos.comisionCierre !== undefined || datos.costoAdicional !== undefined){
      const comisionApertura = parseFloat(datos.comisionApertura) || 0;
      const comisionCierre = parseFloat(datos.comisionCierre) || 0;
      const costoAdicional = parseFloat(datos.costoAdicional) || 0;
      comisionFinal = comisionApertura + comisionCierre + costoAdicional;
    }else{
      const comisionVal = parseFloat(datos.comision);
      comisionFinal = isNaN(comisionVal) ? 0 : comisionVal;
    }

    // Datos mínimos insuficientes: no se puede calcular nada de forma confiable.
    if(isNaN(entrada) || entrada === 0 || isNaN(salida) || isNaN(tamano) || tamano === 0){
      return resultado;
    }

    const cantidad = tamano / entrada;
    const variacion = (direccion === 'Venta') ? (entrada - salida) : (salida - entrada);

    const pnl = cantidad * variacion;
    const pnlNeto = pnl - comisionFinal;

    resultado.pnl = pnl;
    resultado.pnlNeto = pnlNeto;
    resultado.resultadoPct = (pnlNeto / tamano) * 100;

    if(pnlNeto === 0){ resultado.estado = 'Break Even'; }
    else if(pnlNeto > 0){ resultado.estado = 'Ganadora'; }
    else{ resultado.estado = 'Perdedora'; }

    // Riesgo, Reward, RR planificado y R múltiple: solo con Stop Loss válido.
    // TM-003 (v0.4.5): riesgoDinero/rewardDinero se toman como magnitud absoluta.
    // Antes, un Stop Loss ubicado del lado incorrecto podía volver negativo el
    // riesgo y así invertir el signo de R sin cambiar el Estado (basado en el
    // PnL), generando incoherencias como "Ganadora" + R negativo. Con la
    // magnitud absoluta, el signo de R SIEMPRE coincide con el signo del PnL neto.
    const stopLoss = parseFloat(datos.stopLoss);
    if(datos.stopLoss !== '' && datos.stopLoss !== undefined && !isNaN(stopLoss)){
      const riesgoUnitario = (direccion === 'Venta') ? (stopLoss - entrada) : (entrada - stopLoss);
      const riesgoDinero = Math.abs(cantidad * riesgoUnitario);
      resultado.riesgoDinero = riesgoDinero;

      if(riesgoDinero !== 0){
        resultado.rMultiple = pnlNeto / riesgoDinero;
      }

      const takeProfit = parseFloat(datos.takeProfit);
      if(datos.takeProfit !== '' && datos.takeProfit !== undefined && !isNaN(takeProfit)){
        const rewardUnitario = (direccion === 'Venta') ? (entrada - takeProfit) : (takeProfit - entrada);
        const rewardDinero = Math.abs(cantidad * rewardUnitario);
        resultado.rewardDinero = rewardDinero;

        if(riesgoDinero !== 0){
          resultado.rrPlanificado = rewardDinero / riesgoDinero;
        }
      }
    }

    return resultado;
  }

  function actualizarTamanoPosicionAutomatico(){
    const margenEl = document.querySelector('[data-field="margenUtilizado"]');
    const apalancamientoEl = document.querySelector('[data-field="apalancamiento"]');
    const tamanoEl = document.querySelector('[data-field="tamanoPosicion"]');
    if(!margenEl || !apalancamientoEl || !tamanoEl) return;

    const margen = parseFloat(margenEl.value);
    const apalancamiento = parseFloat(apalancamientoEl.value);
    if(!isNaN(margen) && !isNaN(apalancamiento)){
      tamanoEl.value = (margen * apalancamiento).toFixed(2);
    }
  }

  function verificarCompletitudRegistro(data){
    const p = data.psicologia || {};
    const psicologiaCompleta = !!(
      p.estadoEmocional ||
      p.cumplimientoPlan ||
      p.hiceBien || p.hiceMal || p.aprendizaje || p.proximaVez ||
      p.causaResultado
    );
    const evidenciaCompleta = !!(data.imagenBase64 || data.linkGrafico);
    return {
      psicologiaCompleta,
      evidenciaCompleta,
      completo: psicologiaCompleta && evidenciaCompleta
    };
  }

  function mostrarAvisoCompletitud(completitud){
    if(completitud.completo) return; // el toast de éxito ya indica "Registro completo ✓"
    const faltantes = [];
    if(!completitud.psicologiaCompleta) faltantes.push('Psicología');
    if(!completitud.evidenciaCompleta) faltantes.push('Evidencia');
    showToast(
      'warning',
      'Sugerencia',
      `Aún no has diligenciado el módulo de ${faltantes.join(' y ')}. Registrar esta información te ayudará a detectar patrones de comportamiento.`
    );
  }

  async function guardarOperacion(){
    const data = collectFormData();
    const { valido, faltantes } = validateForm(data);

    if(!valido){
      const detalle = (faltantes && faltantes.length)
        ? `Faltan: ${faltantes.join(', ')}.`
        : 'Revisa los campos marcados en rojo.';
      showToast('danger', 'No es posible guardar', detalle);
      return;
    }

    const completitud = verificarCompletitudRegistro(data);

    if(editingId){
      await actualizarOperacion(editingId, data);
    }else{
      const nuevaOperacionLocal = Object.assign(
        { idTrade: generarSiguienteIdTrade() },
        data,
        { calculos: calcularOperacion(data) }
      );
      // Sprint (conexión de Trades): el id ya no se genera localmente
      // (generarId()) — Supabase asigna el UUID real al insertar.
      try{
        const creada = await crearOperacionEnSupabase(nuevaOperacionLocal);
        operaciones.push(creada);
      }catch(error){
        showToast('danger', 'No se pudo guardar', error.message || 'Error al crear la operación en Supabase.');
        return;
      }
      renderTable();
      mostrarAvisoEstadoTrade(data);
      mostrarAvisoCompletitud(completitud);
      verificarAdvertenciaEstructura(data.decisiones.estructura);
      resetForm();
    }
  }

  function mostrarAvisoEstadoTrade(data){
    if(data.estadoTrade === 'Cerrado'){
      showToast('success', '🟢 Trade cerrado', 'Trade guardado y cerrado correctamente.');
    }else{
      showToast('warning', '🟡 Trade Abierto', 'Trade guardado como Abierto. Podrás cerrarlo posteriormente desde el Historial.');
    }
  }

  async function actualizarOperacion(id, data){
    const index = operaciones.findIndex(op => op.id === id);
    if(index === -1) return;
    const idTradeExistente = operaciones[index].idTrade; // nunca se regenera ni se pierde al editar
    const operacionActualizada = Object.assign({ id, idTrade: idTradeExistente }, data, { calculos: calcularOperacion(data) });
    try{
      const guardada = await actualizarOperacionEnSupabase(id, operacionActualizada);
      operaciones[index] = guardada;
    }catch(error){
      showToast('danger', 'No se pudo actualizar', error.message || 'Error al actualizar la operación en Supabase.');
      return;
    }
    renderTable();
    const completitud = verificarCompletitudRegistro(data);
    mostrarAvisoEstadoTrade(data);
    mostrarAvisoCompletitud(completitud);
    verificarAdvertenciaEstructura(data.decisiones.estructura);
    resetForm();
  }

  async function eliminarOperacion(id){
    try{
      await eliminarOperacionEnSupabase(id);
    }catch(error){
      showToast('danger', 'No se pudo eliminar', error.message || 'Error al eliminar la operación en Supabase.');
      return;
    }
    operaciones = operaciones.filter(op => op.id !== id);
    renderTable();
    showToast('success', 'Operación eliminada', 'El registro se quitó de tu historial.');
    if(editingId === id) resetForm();
  }

  function editarOperacion(id){
    const op = operaciones.find(o => o.id === id);
    if(!op) return;
    editingId = id;
    establecerModoCierre(false); // edición normal: todo editable, incluida la apertura
    populateForm(op);
    document.getElementById('editModeBadge').style.display = 'inline-flex';
    document.getElementById('saveBtnLabel').textContent = 'Actualizar operación';
    document.querySelector('.form-tab[data-tab="operacion"]').click();
    document.getElementById('nueva-operacion').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cerrarTrade(id){
    editarOperacion(id);
    establecerModoCierre(true);
    const fechaSalidaEl = document.querySelector('[data-field="fechaSalida"]');
    if(fechaSalidaEl) fechaSalidaEl.focus();
  }

  function resetForm(){
    document.querySelectorAll('[data-field]').forEach(el => { el.value = ''; });
    document.querySelector('#direccionSegmented button[data-direction="Compra"]').click();
    establecerModoCierre(false);
    // Sprint 4.2 — se retiró resetearPsicologia() de aquí, mismo motivo.
    // Sprint 4/5 — se retiraron las 5 líneas aplicarDecisionX({}) que iban
    // aquí (Liquidez, Estructura, Price Action, Desequilibrios, Volumen),
    // mismo motivo: su HTML ya no existe, ahora son dinámicas.
    aplicarVariablesObservadasData([]); // Sprint 3
    // Sprint UX-2A — se retiró aplicarContextoTecnico({}) de aquí, mismo motivo.
    poblarSelectTemporalidadSegunTipoTrade(); // Sprint 4.1 — vuelve al estado por defecto (Tipo de Trade en blanco)
    // Sprint UX-1 — se retiró aplicarSeleccionEnGrupo(...[]) de aquí, mismo motivo.
    actualizarVisibilidadOtroConfirmacion();
    actualizarVisibilidadActivoOtro();
    removeImage();
    limpiarErroresCampo();

    editingId = null;
    document.getElementById('editModeBadge').style.display = 'none';
    document.getElementById('saveBtnLabel').textContent = 'Guardar operación';
  }

  function filaCampoFicha(label, valor){
    return `<div class="ficha-field-row"><span class="label">${label}</span><span class="value">${valor}</span></div>`;
  }

  function obtenerMapaEmojiEstadosMercado(){
    const mapa = {};
    ESTADOS_MERCADO.forEach(e => { mapa[e.valor] = e.emoji; });
    return mapa;
  }

  function obtenerMapaEmojiEstadosEmocionales(){
    const mapa = {};
    ESTADOS_EMOCIONALES.forEach(e => { mapa[e.valor] = e.emoji; });
    return mapa;
  }

  function obtenerMapaEmojiCristoIndicador(){
    const mapa = {};
    CRISTO_INDICADOR.forEach(e => { mapa[e.valor] = e.emoji; });
    return mapa;
  }

  function construirHtmlFicha(op){
    const calc = op.calculos || {};
    const contexto = op.contextoMercado || {};
    const emojiPorEstado = obtenerMapaEmojiEstadosMercado();

    const pnlClass = calc.pnlNeto > 0 ? 'positive' : (calc.pnlNeto < 0 ? 'negative' : '');
    const rClass = calc.rMultiple > 0 ? 'positive' : (calc.rMultiple < 0 ? 'negative' : '');
    const pctClass = calc.resultadoPct > 0 ? 'positive' : (calc.resultadoPct < 0 ? 'negative' : '');

    // GT-01.2: Estado del Trade (ciclo de vida) y Resultado (desempeño) son
    // dos preguntas distintas — nunca se mezclan en un solo badge.
    const esTradeAbiertoHeader = (op.estadoTrade || 'Cerrado') === 'Abierto';
    const estadoTradeBadgeClase = esTradeAbiertoHeader ? 'gold' : 'info';
    const estadoTradeTexto = esTradeAbiertoHeader ? '🟡 Abierto' : '🔵 Cerrado';

    const resultadoBadgeClase = calc.estado === 'Ganadora' ? 'success' : calc.estado === 'Perdedora' ? 'danger' : calc.estado === 'Break Even' ? 'warning' : null;
    const resultadoValor = resultadoBadgeClase
      ? `<span class="badge ${resultadoBadgeClase}"><span class="badge-dot"></span>${escapeHtml(calc.estado)}</span>`
      : `<span style="color: var(--color-text-muted);">Pendiente de cierre</span>`;

    const direccionTexto = op.direccion === 'Compra' ? '🟢 Compra' : '🔴 Venta';

    const encabezado = `
      <div class="ficha-header">
        <div class="ficha-header-item"><span class="label">ID Trade</span><span class="value">${escapeHtml(op.idTrade || '—')}</span></div>
        <div class="ficha-header-item"><span class="label">Activo</span><span class="value">${escapeHtml(op.activo || '—')}</span></div>
        <div class="ficha-header-item"><span class="label">Dirección</span><span class="value">${direccionTexto}</span></div>
        <div class="ficha-header-item"><span class="label">Estado del Trade</span><span class="value"><span class="badge ${estadoTradeBadgeClase}"><span class="badge-dot"></span>${escapeHtml(estadoTradeTexto)}</span></span></div>
        <div class="ficha-header-item"><span class="label">Resultado</span><span class="value">${resultadoValor}</span></div>
        <div class="ficha-header-item"><span class="label">Resultado $</span><span class="value ${pnlClass}">${formatMoney(calc.pnlNeto)}</span></div>
        <div class="ficha-header-item"><span class="label">Resultado %</span><span class="value ${pctClass}">${formatPct(calc.resultadoPct)}</span></div>
        <div class="ficha-header-item"><span class="label">Resultado R</span><span class="value ${rClass}">${formatR(calc.rMultiple)}</span></div>
        <div class="ficha-header-item"><span class="label">Cuenta</span><span class="value">${escapeHtml(obtenerNombreCuentaPorId(op.cuenta))}</span></div>
        <div class="ficha-header-item"><span class="label">Tipo de Trade</span><span class="value">${escapeHtml(op.tipoTrade || '—')}</span></div>
        <div class="ficha-header-item"><span class="label">Fecha</span><span class="value">${escapeHtml(op.fecha || '—')}</span></div>
      </div>
    `;

    // GT-01.1: mientras el Trade esté Abierto, los datos de cierre que aún no
    // existan se muestran como "Pendiente de cierre" — nunca como un simple
    // "—" que podría confundirse con "dato no aplica", y nunca un valor inventado.
    const esTradeAbierto = calc.estado === 'Abierto';
    const textoCierre = (valor) => valor ? escapeHtml(valor) : (esTradeAbierto ? 'Pendiente de cierre' : '—');

    const bloqueDatos = `
      <div class="ficha-block">
        <div class="ficha-block-title">Datos del Trade</div>
        <div class="ficha-field-list">
          ${filaCampoFicha('Fecha entrada', escapeHtml(op.fecha || '—'))}
          ${filaCampoFicha('Hora entrada', escapeHtml(op.horaEntrada || '—'))}
          ${filaCampoFicha('Fecha salida', textoCierre(op.fechaSalida))}
          ${filaCampoFicha('Hora salida', textoCierre(op.horaSalida))}
          ${filaCampoFicha('Mercado', escapeHtml(op.mercado || '—'))}
          ${filaCampoFicha('Tipo de operación', escapeHtml(op.tipoOperacion || '—'))}
          ${filaCampoFicha('Activo', escapeHtml(op.activo || '—'))}
        </div>
      </div>
    `;

    // Compatibilidad: operaciones antiguas (0.1–0.4) solo tenían el campo "comision" único.
    const comisionAperturaMostrar = op.comisionApertura || op.comision || '—';

    const bloqueGestion = `
      <div class="ficha-block">
        <div class="ficha-block-title">Gestión</div>
        <div class="ficha-field-list">
          ${filaCampoFicha('Precio entrada', escapeHtml(op.precioEntrada || '—'))}
          ${filaCampoFicha('Precio salida', textoCierre(op.precioSalida))}
          ${filaCampoFicha('Stop Loss', escapeHtml(op.stopLoss || '—'))}
          ${filaCampoFicha('Take Profit', escapeHtml(op.takeProfit || '—'))}
          ${filaCampoFicha('Margen utilizado', escapeHtml(op.margenUtilizado || '—'))}
          ${filaCampoFicha('Apalancamiento', op.apalancamiento ? `${escapeHtml(op.apalancamiento)}X` : '—')}
          ${filaCampoFicha('Tamaño de posición', escapeHtml(op.tamanoPosicion || '—'))}
          ${filaCampoFicha('Comisión apertura', escapeHtml(String(comisionAperturaMostrar)))}
          ${filaCampoFicha('Comisión cierre', escapeHtml(op.comisionCierre || '—'))}
          ${filaCampoFicha('Costo adicional', escapeHtml(op.costoAdicional || '—'))}
        </div>
      </div>
    `;

    // IMP-02: bloque dual, sin tocar la lógica de comparación/análisis que
    // sigue debajo (esas siguen leyendo op.contextoMercado sin cambios, y
    // por eso mostrarán "información insuficiente" para operaciones nuevas
    // hasta que exista el cálculo automático basado en el nuevo modelo).
    const tieneContextoTecnico = !!op.contextoTecnico;
    const emojiPorEstadoTecnico = {};
    EMA50_ESTADOS.forEach(e => { emojiPorEstadoTecnico[e.valor] = e; });

    // IMP-03: se muestran únicamente las temporalidades que existen en el
    // objeto de esta operación (ya se guardaron solo las visibles para su
    // Tipo de Trade) — nunca filas vacías. El orden usa la misma lista base
    // de referencia que ya define el sistema, filtrada a lo realmente guardado.
    const filasContexto = tieneContextoTecnico
      ? TEMPORALIDADES_POR_DEFECTO.visibles
          .filter(tf => op.contextoTecnico[tf])
          .map(tf => {
            const valor = op.contextoTecnico[tf];
            const info = emojiPorEstadoTecnico[valor];
            const texto = info ? `${info.emoji} ${info.etiqueta}` : '—';
            return filaCampoFicha(tf, texto);
          }).join('')
      : TEMPORALIDADES.map(tf => {
          const estado = contexto[tf];
          const texto = estado ? `${emojiPorEstado[estado] || ''} ${estado}` : '—';
          return filaCampoFicha(tf, texto);
        }).join('');

    const avisoPendienteRevision = op.contextoTecnicoPendienteRevision
      ? `<div style="margin-top: var(--space-3); font-size: var(--fs-xs); color: var(--color-gold);">⚠ Algunas temporalidades no se pudieron migrar automáticamente (el dato anterior era "Lateral" o "Transición", sin equivalencia confiable) y quedaron pendientes de revisión.</div>`
      : '';

    const bloqueContexto = `
      <div class="ficha-block">
        <div class="ficha-block-title">${tieneContextoTecnico ? 'Contexto Técnico (EMA50)' : 'Contexto del Mercado'}</div>
        <div class="ficha-field-list">
          ${filasContexto}
        </div>
        ${avisoPendienteRevision}
      </div>
    `;

    const confirmacionesHtml = (op.confirmaciones || []).length
      ? op.confirmaciones.map(c => `<span class="ficha-tag">${escapeHtml(c)}</span>`).join('')
      : `<span style="color:var(--color-text-muted); font-size: var(--fs-sm);">Sin confirmaciones registradas</span>`;

    // Fase 4.2.1: "Estrategia" se reemplaza por "Plan de la Operación".
    const bloquePlanOperacion = `
      <div class="ficha-block">
        <div class="ficha-block-title">Plan de la Operación</div>
        <div class="ficha-field-list">
          ${filaCampoFicha('Estrategia', escapeHtml(op.estrategiaNombre || '—'))}
          ${filaCampoFicha('Tipo de Trade', escapeHtml(op.tipoTrade || '—'))}
          ${filaCampoFicha('Temporalidad de ejecución', escapeHtml(op.temporalidad || '—'))}
          ${filaCampoFicha('Dirección', direccionTexto)}
        </div>
        <div style="margin-top: var(--space-3);">${confirmacionesHtml}</div>
      </div>
    `;

    // ARQ-01 — Variable de Decisión: Liquidez. Resuelve los códigos cortos
    // guardados (ej. "EQH") a su etiqueta legible solo para mostrar aquí.
    const liquidez = (op.decisiones && op.decisiones.liquidez) || {};
    const resolverEtiqueta = (lista, valor) => (lista.find(o => o.valor === valor) || {}).etiqueta || '—';
    const bloqueDecisionLiquidez = `
      <div class="ficha-block">
        <div class="ficha-block-title">Variable de Decisión: Liquidez</div>
        ${liquidez.aplica ? `
          <div class="ficha-field-list">
            ${filaCampoFicha('Peso', resolverEtiqueta(LIQUIDEZ_PESO, liquidez.peso))}
            ${filaCampoFicha('Zona principal', resolverEtiqueta(LIQUIDEZ_ZONAS, liquidez.zonaPrincipal))}
            ${filaCampoFicha('Barrido al momento de la entrada', typeof liquidez.barrido === 'boolean'
              ? (liquidez.barrido ? 'Sí (registro anterior a este ajuste)' : 'No (registro anterior a este ajuste)')
              : resolverEtiqueta(LIQUIDEZ_BARRIDO, liquidez.barrido))}
            ${(liquidez.barrido === true || (typeof liquidez.barrido === 'string' && liquidez.barrido !== 'sinBarrido'))
              ? filaCampoFicha('Calidad del barrido', resolverEtiqueta(LIQUIDEZ_CALIDAD_BARRIDO, liquidez.calidadBarrido)) : ''}
            ${filaCampoFicha('Calidad de la recuperación', resolverEtiqueta(LIQUIDEZ_RECUPERACION, liquidez.recuperacion))}
            ${filaCampoFicha('Método de ejecución', resolverEtiqueta(LIQUIDEZ_METODO_ENTRADA, liquidez.metodoEntrada))}
          </div>
        ` : `<span style="color: var(--color-text-muted); font-size: var(--fs-sm);">La Liquidez no fue un factor determinante en esta operación.</span>`}
      </div>
    `;

    // IMP-04 — Variable de Decisión: Estructura. Cada badge de un elemento
    // que sea el factor principal se marca con ⭐ delante.
    const estructura = (op.decisiones && op.decisiones.estructura) || {};
    const badgesConEstrella = (lista, categoria) => {
      if(!lista || lista.length === 0) return '';
      return lista.map(valor => {
        const esFactorPrincipal = estructura.factorPrincipal
          && estructura.factorPrincipal.categoria === categoria
          && estructura.factorPrincipal.valor === valor;
        return `<span class="ficha-tag">${esFactorPrincipal ? '⭐ ' : ''}${escapeHtml(valor)}</span>`;
      }).join('');
    };

    const bloqueDecisionEstructura = `
      <div class="ficha-block">
        <div class="ficha-block-title">Variable de Decisión: Estructura</div>
        ${estructura.influye ? `
          <div class="ficha-field-list">
            ${filaCampoFicha('Ubicación dentro de la estructura', escapeHtml((estructura.interpretacion || {}).ubicacion || '—'))}
            ${filaCampoFicha('Escenario de Entrada', escapeHtml((estructura.interpretacion || {}).hipotesis || '—'))}
          </div>
          <div style="margin-top: var(--space-3);">
            ${badgesConEstrella((estructura.observaciones || {}).referencias, 'referencias')}
            ${badgesConEstrella((estructura.observaciones || {}).formaciones, 'formaciones')}
            ${badgesConEstrella(estructura.confirmaciones, 'confirmaciones')}
          </div>
        ` : `<span style="color: var(--color-text-muted); font-size: var(--fs-sm);">La Estructura no fue un factor determinante en esta operación.</span>`}
      </div>
    `;

    // ASE X — Variable de Decisión: Price Action
    const priceAction = (op.decisiones && op.decisiones.priceAction) || {};
    const badgesConEstrellaPriceAction = (lista, categoria) => {
      if(!lista || lista.length === 0) return '';
      return lista.map(valor => {
        const esFactorPrincipal = priceAction.factorPrincipal
          && priceAction.factorPrincipal.categoria === categoria
          && priceAction.factorPrincipal.valor === valor;
        // Patrones de vela guardan un código limpio (ej. "pinBar") — se
        // resuelve a su etiqueta legible solo para mostrar aquí. Lectura y
        // Validación de la lectura siguen siendo strings simples, sin cambios.
        const texto = categoria === 'patrones'
          ? ((PRICE_ACTION_PATRONES.find(p => p.valor === valor) || {}).etiqueta || valor)
          : valor;
        return `<span class="ficha-tag">${esFactorPrincipal ? '⭐ ' : ''}${escapeHtml(texto)}</span>`;
      }).join('');
    };
    const bloqueDecisionPriceAction = `
      <div class="ficha-block">
        <div class="ficha-block-title">Variable de Decisión: Price Action</div>
        ${priceAction.influye ? `
          <div>
            ${badgesConEstrellaPriceAction(priceAction.patrones, 'patrones') || '<span style="color: var(--color-text-muted); font-size: var(--fs-sm);">Sin patrones registrados.</span>'}
            ${badgesConEstrellaPriceAction(priceAction.lectura, 'lectura')}
            ${badgesConEstrellaPriceAction(priceAction.confirmaciones, 'confirmaciones')}
          </div>
        ` : `<span style="color: var(--color-text-muted); font-size: var(--fs-sm);">La Acción del Precio no fue un factor determinante en esta operación.</span>`}
      </div>
    `;

    // Variable de Decisión: Desequilibrios
    const desequilibrios = (op.decisiones && op.decisiones.desequilibrios) || {};
    // Compatibilidad (punto 5): "Imbalance" ya no existe como opción — las
    // operaciones históricas que lo guardaron se muestran con su equivalencia
    // por defecto, sin tocar el dato almacenado. Cualquier otro valor antiguo
    // (ej. "Fair Value Gap (FVG)", "Gap", "Mechazo" en mayúscula) ya es
    // legible por sí mismo y se muestra tal cual.
    const resolverEtiquetaDesequilibrio = (valor) => {
      const porCodigo = DESEQUILIBRIOS_OBSERVADOS.find(d => d.valor === valor);
      if(porCodigo) return porCodigo.etiqueta;
      if(valor === 'Imbalance') return 'FVG (Continuación)';
      return valor;
    };
    const badgesConEstrellaDesequilibrios = (lista, categoria) => {
      if(!lista || lista.length === 0) return '';
      return lista.map(valor => {
        const esFactorPrincipal = desequilibrios.factorPrincipal
          && desequilibrios.factorPrincipal.categoria === categoria
          && desequilibrios.factorPrincipal.valor === valor;
        return `<span class="ficha-tag">${esFactorPrincipal ? '⭐ ' : ''}${escapeHtml(resolverEtiquetaDesequilibrio(valor))}</span>`;
      }).join('');
    };
    const bloqueDecisionDesequilibrios = `
      <div class="ficha-block">
        <div class="ficha-block-title">Variable de Decisión: Desequilibrios</div>
        ${desequilibrios.influye
          ? `<div>${badgesConEstrellaDesequilibrios(desequilibrios.observados, 'observados') || '<span style="color: var(--color-text-muted); font-size: var(--fs-sm);">Sin desequilibrios registrados.</span>'}</div>`
          : `<span style="color: var(--color-text-muted); font-size: var(--fs-sm);">Los Desequilibrios no fueron un factor determinante en esta operación.</span>`}
      </div>
    `;

    // Variable de Decisión: Volumen
    const volumen = (op.decisiones && op.decisiones.volumen) || {};
    const badgesConEstrellaVolumen = (lista, categoria) => {
      if(!lista || lista.length === 0) return '';
      return lista.map(valor => {
        const esFactorPrincipal = volumen.factorPrincipal
          && volumen.factorPrincipal.categoria === categoria
          && volumen.factorPrincipal.valor === valor;
        return `<span class="ficha-tag">${esFactorPrincipal ? '⭐ ' : ''}${escapeHtml(valor)}</span>`;
      }).join('');
    };
    const bloqueDecisionVolumen = `
      <div class="ficha-block">
        <div class="ficha-block-title">Variable de Decisión: Volumen</div>
        ${volumen.influye ? `
          <div>
            ${badgesConEstrellaVolumen(volumen.lectura, 'lectura') || '<span style="color: var(--color-text-muted); font-size: var(--fs-sm);">Sin lectura de volumen registrada.</span>'}
            ${badgesConEstrellaVolumen(volumen.vrvp, 'vrvp')}
          </div>
        ` : `<span style="color: var(--color-text-muted); font-size: var(--fs-sm);">El Volumen no fue un factor determinante en esta operación.</span>`}
      </div>
    `;

    // Fase 4.2.1: comparación visual + análisis automático (solo interpretación, sin puntuaciones).
    const bloqueComparacionAnalisis = `
      <div class="ficha-block ficha-full">
        <div class="ficha-block-title">Comparación con el Contexto del Mercado</div>
        ${construirTablaComparacion(op, emojiPorEstado, direccionTexto)}
        <div class="ficha-block-title" style="margin-top: var(--space-5);">Análisis del Contexto</div>
        <div class="ficha-analisis-list">
          ${analizarContextoOperacion(op).map(m => `<div class="ficha-analisis-item">${escapeHtml(m)}</div>`).join('')}
        </div>
      </div>
    `;

    // Fase 4.4: Psicología y Aprendizaje — con compatibilidad hacia operaciones
    // de versiones anteriores (0.1–0.4.3) que aún no tenían el objeto `psicologia`.
    const psico = op.psicologia;
    let contenidoPsicologia;

    if(psico){
      const emojiEstadoEmocional = obtenerMapaEmojiEstadosEmocionales();
      const emojiCristo = obtenerMapaEmojiCristoIndicador();

      const estadoEmocionalTexto = psico.estadoEmocional
        ? `${emojiEstadoEmocional[psico.estadoEmocional] || ''} ${psico.estadoEmocional}` : '—';
      const cristoTexto = psico.cristoIndicador
        ? `${emojiCristo[psico.cristoIndicador] || ''} ${psico.cristoIndicador}` : '—';

      const emocionesBadges = (psico.emocionesDurante || []).length
        ? psico.emocionesDurante.map(em => {
            const extra = (em === 'Otro' && psico.emocionesOtro) ? `: ${escapeHtml(psico.emocionesOtro)}` : '';
            return `<span class="ficha-tag">${escapeHtml(em)}${extra}</span>`;
          }).join('')
        : `<span style="color:var(--color-text-muted); font-size: var(--fs-sm);">Sin emociones registradas durante la operación</span>`;

      contenidoPsicologia = `
        <div class="ficha-field-list">
          ${filaCampoFicha('Estado emocional', estadoEmocionalTexto)}
          ${filaCampoFicha('Concentración', psico.concentracion ? `${escapeHtml(psico.concentracion)}/5` : '—')}
          ${filaCampoFicha('Cristo Indicador', cristoTexto)}
          ${filaCampoFicha('Cumplimiento del plan', escapeHtml(psico.cumplimientoPlan || '—'))}
          ${filaCampoFicha('Causa del resultado', escapeHtml(psico.causaResultado || '—'))}
        </div>
        <div style="margin-top: var(--space-3);">${emocionesBadges}</div>
        <div class="ficha-field-list" style="margin-top: var(--space-4);">
          ${filaCampoFicha('¿Qué hice bien?', escapeHtml(psico.hiceBien || '—'))}
          ${filaCampoFicha('¿Qué hice mal?', escapeHtml(psico.hiceMal || '—'))}
          ${filaCampoFicha('¿Qué aprendí?', escapeHtml(psico.aprendizaje || '—'))}
          ${filaCampoFicha('¿Qué haré diferente?', escapeHtml(psico.proximaVez || '—'))}
        </div>
      `;
    }else{
      // Operación de versión anterior a la 0.4.4 — se muestran sus campos originales.
      contenidoPsicologia = `
        <div class="ficha-field-list">
          ${filaCampoFicha('Estado emocional', escapeHtml(op.estadoEmocional || '—'))}
          ${filaCampoFicha('Nivel de confianza', escapeHtml(op.nivelConfianza || '—'))}
          ${filaCampoFicha('Errores', escapeHtml(op.erroresCometidos || '—'))}
          ${filaCampoFicha('Notas', escapeHtml(op.notas || '—'))}
        </div>
      `;
    }

    const bloquePsicologia = `
      <div class="ficha-block ficha-full">
        <div class="ficha-block-title">Psicología y Aprendizaje</div>
        ${contenidoPsicologia}
      </div>
    `;

    let evidenciaHtml = '';
    if(op.imagenBase64){
      evidenciaHtml += `<img src="${op.imagenBase64}" class="ficha-evidencia-img" alt="Captura de la operación">`;
    }
    if(op.linkGrafico){
      evidenciaHtml += `<div style="margin-top:${op.imagenBase64 ? 'var(--space-3)' : '0'};">
        <a href="${escapeHtml(op.linkGrafico)}" target="_blank" rel="noopener" class="btn-secondary" style="text-decoration:none;">Abrir gráfico ↗</a>
      </div>`;
    }
    if(!op.imagenBase64 && !op.linkGrafico){
      evidenciaHtml = `<span style="color:var(--color-text-muted); font-size: var(--fs-sm);">Sin evidencia registrada.</span>`;
    }

    const bloqueEvidencia = `
      <div class="ficha-block ficha-full">
        <div class="ficha-block-title">Evidencia</div>
        ${evidenciaHtml}
      </div>
    `;

    return encabezado + `
      <div class="ficha-grid">
        ${bloqueDatos}
        ${bloqueGestion}
        ${bloqueContexto}
        ${bloquePlanOperacion}
        ${bloqueDecisionLiquidez}
        ${bloqueDecisionEstructura}
        ${bloqueDecisionPriceAction}
        ${bloqueDecisionDesequilibrios}
        ${bloqueDecisionVolumen}
        ${construirBloqueFichaVariablesObservadas(op.variablesObservadas)}
        ${bloqueComparacionAnalisis}
        ${bloquePsicologia}
        ${bloqueEvidencia}
      </div>
    `;
  }

  function renderResumenPrevio(){
    const contenedor = document.getElementById('resumenPrevioContenido');
    if(!contenedor) return;

    const data = collectFormData();
    const operacionPreliminar = Object.assign({}, data, { calculos: calcularOperacion(data) });

    contenedor.innerHTML = `
      <div style="margin-bottom: var(--space-4); padding: var(--space-3) var(--space-4); background: var(--color-warning-soft); border: 1px solid var(--color-warning); border-radius: var(--radius-md); font-size: var(--fs-sm); color: var(--color-text);">
        ⚠ Esta es una vista previa — nada se ha guardado todavía. Revisa que todo esté correcto antes de presionar "Guardar operación".
      </div>
      ${construirHtmlFicha(operacionPreliminar)}
    `;
  }

  function construirTablaComparacion(op, emojiPorEstado, direccionTexto){
    const contexto = op.contextoMercado || {};
    const filas = TEMPORALIDADES.map(tf => {
      const estado = contexto[tf];
      const estadoTexto = estado ? `${emojiPorEstado[estado] || ''} ${estado}` : '—';
      return `<tr><td>${tf}</td><td>${estadoTexto}</td><td>${direccionTexto}</td></tr>`;
    }).join('');

    return `<table class="ficha-comparacion-table">
      <thead><tr><th>Temporalidad</th><th>Contexto del Mercado</th><th>Dirección de mi operación</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>`;
  }

  function clasificarEstadoRespectoDireccion(estado, esCompra){
    if(estado === 'Alcista') return esCompra ? 'alineado' : 'contra';
    if(estado === 'Bajista') return esCompra ? 'contra' : 'alineado';
    return 'neutral';
  }

  function analizarContextoOperacion(op){
    const contexto = op.contextoMercado || {};
    const esCompra = op.direccion === 'Compra';

    const entradas = TEMPORALIDADES
      .map(tf => ({ tf, estado: contexto[tf] }))
      .filter(item => !!item.estado);

    if(entradas.length === 0){
      return ['Información insuficiente para analizar el contexto.'];
    }

    const mensajes = [];
    let hayAlineado = false;
    let hayContra = false;

    entradas.forEach(({ tf, estado }) => {
      const clasificacion = clasificarEstadoRespectoDireccion(estado, esCompra);

      if(clasificacion === 'alineado'){
        hayAlineado = true;
      }else if(clasificacion === 'contra'){
        hayContra = true;
        mensajes.push(`⚠ Operación en contratendencia respecto a ${tf}.`);
      }else if(estado === 'Lateral'){
        mensajes.push(`⚪ Contexto lateral en ${tf}.`);
      }else if(estado === 'Transición'){
        mensajes.push(`🟡 Contexto en transición en ${tf}.`);
      }
    });

    if(hayAlineado && !hayContra){
      mensajes.unshift('✅ Operación alineada con la tendencia principal.');
    }else if(hayAlineado && hayContra){
      mensajes.unshift('⚠ Contexto mixto entre temporalidades.');
    }

    return mensajes;
  }

  function abrirFichaTecnica(id){
    const op = operaciones.find(o => o.id === id);
    if(!op) return;
    document.getElementById('fichaTitulo').textContent = `Ficha Técnica · ${op.activo || 'Operación'}`;
    document.getElementById('fichaBody').innerHTML = construirHtmlFicha(op);
    document.getElementById('fichaOverlay').classList.add('is-open');
  }

  function cerrarFichaTecnica(){
    document.getElementById('fichaOverlay').classList.remove('is-open');
  }

  function attachFichaListeners(){
    document.getElementById('fichaCloseBtn').addEventListener('click', cerrarFichaTecnica);
    document.getElementById('fichaOverlay').addEventListener('click', (e) => {
      if(e.target.id === 'fichaOverlay') cerrarFichaTecnica();
    });
  }

  function obtenerMomentoEntrada(op){
    const fecha = op.fecha || '1970-01-01';
    const hora = op.horaEntrada || '00:00';
    return new Date(`${fecha}T${hora}`);
  }

  function renderTable(){
    const tbody = document.getElementById('operationsTableBody');

    // GT-01.2: filtros funcionales e independientes de Estado del Trade y Resultado.
    const filtroEstadoTradeEl = document.getElementById('filtroEstadoTrade');
    const filtroResultadoEl = document.getElementById('filtroResultado');
    const filtroEstadoTrade = filtroEstadoTradeEl ? filtroEstadoTradeEl.value : 'Todos';
    const filtroResultado = filtroResultadoEl ? filtroResultadoEl.value : 'Todos';

    let ordenadas = [...operaciones].sort((a, b) => obtenerMomentoEntrada(b) - obtenerMomentoEntrada(a));

    if(filtroEstadoTrade !== 'Todos'){
      ordenadas = ordenadas.filter(op => (op.estadoTrade || 'Cerrado') === filtroEstadoTrade);
    }
    if(filtroResultado !== 'Todos'){
      ordenadas = ordenadas.filter(op => op.calculos && op.calculos.estado === filtroResultado);
    }

    document.getElementById('operacionesCount').textContent = operaciones.length;
    document.getElementById('statTotalOperaciones').textContent = operaciones.length;

    // El Dashboard se recalcula aquí porque renderTable() ya se invoca
    // después de cada registro, edición o eliminación (Fase 0.4: "Dashboard vivo").
    // GT-01.2: el Dashboard sigue leyendo `operaciones` completas (sin filtrar
    // por los filtros de historial) — su propia lógica ya separa Abiertos/Cerrados.
    actualizarDashboard();

    if(ordenadas.length === 0){
      tbody.innerHTML = `<tr class="empty-row"><td colspan="11">${operaciones.length === 0 ? 'Aún no hay operaciones registradas. Usa el formulario de arriba para agregar la primera.' : 'Ningún Trade coincide con los filtros seleccionados.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = ordenadas.map(op => {
      const direccionBadge = op.direccion === 'Compra'
        ? `<span class="badge success"><span class="badge-dot"></span>Compra</span>`
        : `<span class="badge danger"><span class="badge-dot"></span>Venta</span>`;

      const calc = op.calculos || {};
      const pnlClass = (calc.pnlNeto > 0) ? 'positive' : (calc.pnlNeto < 0) ? 'negative' : '';
      const rClass = (calc.rMultiple > 0) ? 'positive' : (calc.rMultiple < 0) ? 'negative' : '';
      const pctClass = (calc.resultadoPct > 0) ? 'positive' : (calc.resultadoPct < 0) ? 'negative' : '';

      // GT-01.2: dos conceptos, dos badges — nunca mezclados.
      // 1) Estado del Trade — ciclo de vida (¿sigue abierto o ya terminó?)
      const esAbierto = (op.estadoTrade || 'Cerrado') === 'Abierto';
      const estadoTradeBadge = esAbierto
        ? `<span class="badge gold"><span class="badge-dot"></span>🟡 Abierto</span>`
        : `<span class="badge info"><span class="badge-dot"></span>🔵 Cerrado</span>`;

      // 2) Resultado — desempeño (¿cómo terminó?). Solo existe si está Cerrado.
      let resultadoBadge = `<span style="color: var(--color-text-muted);">Pendiente de cierre</span>`;
      if(calc.estado === 'Ganadora') resultadoBadge = `<span class="badge success"><span class="badge-dot"></span>Ganadora</span>`;
      else if(calc.estado === 'Perdedora') resultadoBadge = `<span class="badge danger"><span class="badge-dot"></span>Perdedora</span>`;
      else if(calc.estado === 'Break Even') resultadoBadge = `<span class="badge warning"><span class="badge-dot"></span>Break Even</span>`;
      else if(!esAbierto) resultadoBadge = `<span class="badge warning"><span class="badge-dot"></span>Sin datos</span>`;

      const filaClase = esAbierto ? 'trade-abierto' : '';

      const botonCerrar = esAbierto
        ? `<button class="btn-cerrar-trade" data-id="${op.id}" title="Cerrar Trade">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>
          </button>`
        : '';

      return `<tr data-row-id="${op.id}" class="${filaClase}">
        <td>${escapeHtml(op.idTrade || '—')}</td>
        <td>${escapeHtml(op.fecha || '—')}</td>
        <td>${escapeHtml(op.activo || '—')}</td>
        <td>${escapeHtml(op.mercado || '—')}</td>
        <td>${direccionBadge}</td>
        <td class="${pnlClass}">${formatMoney(calc.pnlNeto)}</td>
        <td class="${rClass}">${formatR(calc.rMultiple)}</td>
        <td class="${pctClass}">${formatPct(calc.resultadoPct)}</td>
        <td>${estadoTradeBadge}</td>
        <td>${resultadoBadge}</td>
        <td class="col-actions">
          <div class="row-actions">
            <button class="btn-view" data-id="${op.id}" title="Ver">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="btn-edit" data-id="${op.id}" title="Editar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg>
            </button>
            ${botonCerrar}
            <button class="btn-delete" data-id="${op.id}" title="Eliminar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');

    renderOperacionesAbiertas(); // Sprint UX-1 — widget compacto, siempre visible, sin filtrar
  }

  // Sprint UX-1 — "Operaciones Abiertas": la parte del Historial que el
  // usuario pidió mantener siempre visible en Trades, sin tener que filtrar.
  // Reutiliza `operaciones` y el mismo estadoTrade ya calculado — ningún
  // cálculo nuevo, ninguna consulta nueva. Es una vista más liviana que el
  // Historial completo (sin PnL/R/%, que no tienen sentido sin un precio de
  // mercado en vivo — eso queda para cuando se conecten "flotantes").
  function renderOperacionesAbiertas(){
    const tbody = document.getElementById('operacionesAbiertasTableBody');
    if(!tbody) return;

    const abiertas = operaciones
      .filter(op => (op.estadoTrade || 'Cerrado') === 'Abierto')
      .sort((a, b) => obtenerMomentoEntrada(b) - obtenerMomentoEntrada(a));

    const contadorEl = document.getElementById('operacionesAbiertasCount');
    if(contadorEl) contadorEl.textContent = abiertas.length;

    if(abiertas.length === 0){
      tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No tienes operaciones abiertas en este momento.</td></tr>`;
      return;
    }

    tbody.innerHTML = abiertas.map(op => {
      const direccionBadge = op.direccion === 'Compra'
        ? `<span class="badge success"><span class="badge-dot"></span>Compra</span>`
        : `<span class="badge danger"><span class="badge-dot"></span>Venta</span>`;

      return `<tr data-row-id="${op.id}">
        <td>${escapeHtml(op.idTrade || '—')}</td>
        <td>${escapeHtml(op.fecha || '—')}</td>
        <td>${escapeHtml(op.activo || '—')}</td>
        <td>${direccionBadge}</td>
        <td class="col-actions">
          <div class="row-actions">
            <button class="btn-view" data-id="${op.id}" title="Ver">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="btn-edit" data-id="${op.id}" title="Editar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg>
            </button>
            <button class="btn-cerrar-trade" data-id="${op.id}" title="Cerrar Trade">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  function openModal({ titulo, cuerpo, onConfirm }){
    document.getElementById('modalTitle').textContent = titulo;
    document.getElementById('modalBody').textContent = cuerpo;
    const confirmBtn = document.getElementById('modalConfirmBtn');

    const nuevoConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(nuevoConfirmBtn, confirmBtn);
    nuevoConfirmBtn.addEventListener('click', () => {
      onConfirm();
      closeModal();
    });

    document.getElementById('modalOverlay').classList.add('is-open');
  }

  function closeModal(){
    document.getElementById('modalOverlay').classList.remove('is-open');
  }

  function attachModalListeners(){
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    document.getElementById('modalCancelBtn').addEventListener('click', closeModal);
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if(e.target.id === 'modalOverlay') closeModal();
    });
  }

  function handleImageSelect(file){
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      imagenTemporal = e.target.result;
      mostrarPreviewImagen(imagenTemporal, file.name);
    };
    reader.readAsDataURL(file);
  }

  function mostrarPreviewImagen(base64, nombre){
    const preview = document.getElementById('filePreview');
    const thumb = document.getElementById('filePreviewThumb');
    const name = document.getElementById('filePreviewName');

    thumb.style.backgroundImage = `url(${base64})`;
    name.textContent = nombre;
    preview.classList.add('visible');
    document.getElementById('removeImageBtn').disabled = false;
  }

  function removeImage(){
    imagenTemporal = null;
    document.getElementById('imageInput').value = '';
    document.getElementById('filePreviewThumb').style.backgroundImage = '';
    document.getElementById('filePreviewName').textContent = '—';
    document.getElementById('filePreview').classList.remove('visible');
  }

  function attachFormListeners(){
    document.getElementById('saveBtn').addEventListener('click', guardarOperacion);
    document.getElementById('resetBtn').addEventListener('click', resetForm);
    document.getElementById('cancelBtn').addEventListener('click', resetForm);

    const dropzone = document.getElementById('dropzone');
    const imageInput = document.getElementById('imageInput');
    dropzone.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', (e) => handleImageSelect(e.target.files[0]));

    document.getElementById('removeImageBtn').addEventListener('click', removeImage);

    // Sprint 4.1 — se eliminó este listener de aquí: apuntaba a
    // actualizarTemporalidadesVisibles() (ya eliminada). El nuevo listener
    // vive en js/catalogosGenerales.js (attachTemporalidadPorTipoTradeListener),
    // junto al resto de la lógica de Temporalidades filtradas por Horizonte.

    // Activo: mostrar/ocultar el campo de texto libre cuando se selecciona "Otro..."
    const selectActivoEl = document.getElementById('selectActivo');
    if(selectActivoEl){
      selectActivoEl.addEventListener('change', actualizarVisibilidadActivoOtro);
    }

    // Tamaño de posición = Margen utilizado × Apalancamiento (editable manualmente después)
    const margenEl = document.querySelector('[data-field="margenUtilizado"]');
    const apalancamientoEl = document.querySelector('[data-field="apalancamiento"]');
    if(margenEl && apalancamientoEl){
      [margenEl, apalancamientoEl].forEach(el => el.addEventListener('input', actualizarTamanoPosicionAutomatico));
    }

    // Quitar el estado de error apenas el usuario corrige el campo
    document.querySelectorAll('[data-field]').forEach(el => {
      el.addEventListener('input', () => {
        el.classList.remove('is-invalid');
        const msg = document.querySelector(`[data-error-for="${el.dataset.field}"]`);
        if(msg) msg.classList.remove('visible');
      });
    });

    // TM-002 (v0.4.5 / reforzado en v0.4.5.1): validación JS real para campos
    // numéricos/monetarios — no basta con inputmode="decimal", eso no bloquea
    // letras al escribir. El evento 'input' ya cubre pegar (Ctrl+V) en la
    // práctica, pero se agrega también 'paste' explícito para blindarlo
    // completamente (hallazgo de QA: "verificar también copiar/pegar").
    document.querySelectorAll('.input-numerico').forEach(el => {
      el.addEventListener('input', restringirEntradaNumerica);
      el.addEventListener('paste', () => {
        setTimeout(() => restringirEntradaNumerica({ target: el }), 0);
      });
    });
  }

  function restringirEntradaNumerica(e){
    const el = e.target;
    const cursorPos = el.selectionStart;
    const valorOriginal = el.value;

    let limpio = valorOriginal.replace(/[^0-9.]/g, '');
    const partes = limpio.split('.');
    if(partes.length > 2){
      limpio = partes[0] + '.' + partes.slice(1).join('');
    }

    if(limpio !== valorOriginal){
      const diferencia = valorOriginal.length - limpio.length;
      el.value = limpio;
      const nuevaPos = Math.max(0, cursorPos - diferencia);
      el.setSelectionRange(nuevaPos, nuevaPos);
    }
  }

  function attachTableListeners(){
    // GT-01.2: filtros independientes — cada uno solo dispara un re-render,
    // el filtrado real vive dentro de renderTable() (una sola fuente de verdad).
    const filtroEstadoTradeEl = document.getElementById('filtroEstadoTrade');
    const filtroResultadoEl = document.getElementById('filtroResultado');
    if(filtroEstadoTradeEl) filtroEstadoTradeEl.addEventListener('change', renderTable);
    if(filtroResultadoEl) filtroResultadoEl.addEventListener('change', renderTable);

    document.getElementById('operationsTableBody').addEventListener('click', manejarClicTablaOperaciones);

    // Sprint UX-1 — misma lógica de clic (Ver/Editar/Cerrar), sin duplicarla,
    // conectada también a la tabla compacta de Operaciones Abiertas.
    const tbodyAbiertas = document.getElementById('operacionesAbiertasTableBody');
    if(tbodyAbiertas) tbodyAbiertas.addEventListener('click', manejarClicTablaOperaciones);
  }

  function manejarClicTablaOperaciones(e){
      const viewBtn = e.target.closest('.btn-view');
      const editBtn = e.target.closest('.btn-edit');
      const cerrarBtn = e.target.closest('.btn-cerrar-trade');
      const deleteBtn = e.target.closest('.btn-delete');

      if(viewBtn){
        abrirFichaTecnica(viewBtn.dataset.id);
        return;
      }

      if(editBtn){
        editarOperacion(editBtn.dataset.id);
        return;
      }

      if(cerrarBtn){
        cerrarTrade(cerrarBtn.dataset.id);
        return;
      }

      if(deleteBtn){
        const id = deleteBtn.dataset.id;
        const op = operaciones.find(o => o.id === id);
        openModal({
          titulo: 'Eliminar operación',
          cuerpo: `¿Seguro que quieres eliminar la operación de ${op ? op.activo : 'este activo'}? Esta acción no se puede deshacer.`,
          onConfirm: () => eliminarOperacion(id)
        });
      }
  }