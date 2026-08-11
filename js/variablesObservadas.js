/* ============================================================
   VARIABLES OBSERVADAS — Trading Master (Sprint 3)

   Primer bloque del formulario de Trades construido 100% desde
   Supabase, sin ninguna lista quemada en JavaScript. Reutiliza los
   datos que el módulo de administración de Variables (Sprint 2,
   js/variables.js) ya cargó — categoriasVariables, variablesTrading,
   opcionesVariables — sin hacer ninguna consulta nueva a esas 3
   tablas. Solo `data_types` se consulta aparte (necesitamos el
   `code` estable, no el `name`, para decidir qué control dibujar,
   y variables.js no lo expone).

   IMPORTANTE — esto es ADITIVO, no un reemplazo:
   Los 5 bloques existentes (Liquidez, Estructura, Price Action,
   Desequilibrios, Volumen) siguen exactamente igual, con sus propias
   constantes y su propio guardado en op.decisiones.*. Este bloque
   nuevo es independiente, se guarda en op.variablesObservadas, y
   convivirá con los bloques antiguos hasta que Sprints futuros los
   migren uno por uno — tal como se pidió ("por etapas").

   Modelo de datos (op.variablesObservadas, array):
   [
     { variable_id, valor_observado, influyo_en_decision },
     ...
   ]
   - valor_observado: string (single_select/text/numeric),
     array de strings (multi_select), o boolean (boolean) — según
     el tipo de dato de esa variable.
   - influyo_en_decision: boolean, SIEMPRE independiente del valor
     observado (puede haber Barrido=Sí sin que haya influido, y
     viceversa no aplica pero se registra igual de independiente).

   Depende de:
   - js/variables.js -> categoriasVariables, variablesTrading, opcionesVariables
   - js/supabase.js  -> supabaseClient
   - utils.js        -> escapeHtml()
   - index.html      -> showToast(), #variablesObservadasContainer
   ============================================================ */

  let dataTypesPorId = {};

  async function cargarDataTypesParaVariablesObservadas(){
    const { data, error } = await supabaseClient.from('data_types').select('id, code');
    if(error){
      console.error('No se pudieron cargar los tipos de dato:', error);
      dataTypesPorId = {};
      return;
    }
    dataTypesPorId = {};
    (data || []).forEach(dt => { dataTypesPorId[dt.id] = dt.code; });
  }

  // Sprint UX-2A — Motor de Indicadores Técnicos. Qué Temporalidades usa
  // cada Variable de tipo timeframe_matrix (ej. EMA). Consulta propia,
  // independiente de la que hace variables.js para su propio administrador
  // (mismo criterio de no acoplar módulos ya usado en todo el proyecto).
  let temporalidadesPorVariableId = {};

  async function cargarTemporalidadesDeVariablesMatriz(){
    const { data, error } = await supabaseClient
      .from('trading_variable_timeframes')
      .select('variable_id, sort_order, timeframes(code, name)')
      .order('sort_order', { ascending: true });

    if(error){
      console.error('No se pudieron cargar las temporalidades de las variables matriciales:', error);
      temporalidadesPorVariableId = {};
      return;
    }
    temporalidadesPorVariableId = {};
    (data || []).forEach(row => {
      if(!row.timeframes) return;
      if(!temporalidadesPorVariableId[row.variable_id]) temporalidadesPorVariableId[row.variable_id] = [];
      temporalidadesPorVariableId[row.variable_id].push({ code: row.timeframes.code, name: row.timeframes.name });
    });
  }

  // Arma el árbol Categoría -> Variables -> Opciones, filtrando solo lo
  // activo en cada nivel, a partir de los arreglos que variables.js ya
  // cargó (categoriasVariables/variablesTrading/opcionesVariables) — cero
  // consultas nuevas a esas 3 tablas.
  function construirArbolVariablesObservadas(){
    // Guardia explícita: si variables.js no cargó ANTES que este archivo
    // (o su script ni siquiera está en el HTML), estas variables globales
    // no existirían y esto lanzaría un ReferenceError silencioso que
    // detendría TODO initApp(). Se detecta aquí y se avisa con claridad
    // en vez de fallar en silencio.
    if(typeof categoriasVariables === 'undefined' || typeof variablesTrading === 'undefined' || typeof opcionesVariables === 'undefined'){
      console.error('[Variables Observadas] categoriasVariables/variablesTrading/opcionesVariables no están definidas. ' +
        'Causa más probable: js/variables.js no se cargó, o se cargó DESPUÉS de js/variablesObservadas.js en index.html.');
      return [];
    }

    const categoriasActivas = categoriasVariables.filter(c => c.estado === 'Activo');

    return categoriasActivas
      .map(cat => {
        const variablesDeCategoria = variablesTrading
          .filter(v => v.categoria === cat.id && v.estado === 'Activo')
          .map(v => ({
            variable: v,
            tipo: dataTypesPorId[v.tipoDato] || 'text',
            opciones: opcionesVariables.filter(o => o.variable === v.id && o.estado === 'Activo'),
            temporalidadesMatriz: temporalidadesPorVariableId[v.id] || [] // Sprint UX-2A
          }));
        return { categoria: cat, variables: variablesDeCategoria };
      })
      .filter(grupo => grupo.variables.length > 0); // sin variables activas, no se muestra la categoría
  }

  function construirControlValorObservado(tipo, opciones){
    if(tipo === 'boolean'){
      return `<div class="segmented vo-valor-segmented">
        <button class="sell active" type="button" data-valor="no">No</button>
        <button class="buy" type="button" data-valor="si">Sí</button>
      </div>`;
    }
    if(tipo === 'numeric'){
      return `<input type="text" inputmode="decimal" class="input-numerico vo-valor-input" placeholder="0.00">`;
    }
    if(tipo === 'text'){
      return `<input type="text" class="vo-valor-input" placeholder="Describe brevemente...">`;
    }
    // single_select / multi_select
    if(opciones.length === 0){
      return `<span style="color: var(--color-text-muted); font-size: var(--fs-sm); font-style: italic;">Sin opciones configuradas todavía para esta variable.</span>`;
    }
    return `<div class="chip-group vo-valor-chips" data-modo="${tipo === 'multi_select' ? 'multi' : 'single'}">
      ${opciones.map(o => `<span class="chip" data-value="${escapeHtml(o.codigo)}">${o.icono ? escapeHtml(o.icono) + ' ' : ''}${escapeHtml(o.etiqueta)}</span>`).join('')}
    </div>`;
  }

  // Sprint UX-2A — control para variables tipo "timeframe_matrix" (ej. EMA):
  // una fila por Temporalidad vinculada, cada una con su propio chip-group
  // de selección única. Reutiliza la MISMA clase "vo-valor-chips" que ya
  // usa single_select — así el listener de clics (manejarClicVariableObservada,
  // más abajo) la reconoce automáticamente, sin necesitar código nuevo ahí.
  function construirControlMatrizTemporalidad(temporalidades, opciones){
    if(temporalidades.length === 0){
      return `<span style="color: var(--color-text-muted); font-size: var(--fs-sm); font-style: italic;">Esta variable todavía no tiene Temporalidades configuradas. Edítala desde "🧩 Variables".</span>`;
    }
    if(opciones.length === 0){
      return `<span style="color: var(--color-text-muted); font-size: var(--fs-sm); font-style: italic;">Sin opciones configuradas todavía para esta variable.</span>`;
    }
    return temporalidades.map(tf => `
      <div class="contexto-fila" data-timeframe-code="${escapeHtml(tf.code)}" style="display:flex; align-items:center; gap: var(--space-3); flex-wrap:wrap; margin-bottom: var(--space-2);">
        <span style="font-weight:700; min-width:44px; display:inline-block;">${escapeHtml(tf.code)}</span>
        <div class="chip-group vo-valor-chips" data-modo="single">
          ${opciones.map(o => `<span class="chip" data-value="${escapeHtml(o.codigo)}">${o.icono ? escapeHtml(o.icono) + ' ' : ''}${escapeHtml(o.etiqueta)}</span>`).join('')}
        </div>
      </div>
    `).join('');
  }

  // Combina nombre + config.periodo (si existe) para armar la etiqueta —
  // "EMA" con config={periodo:50} se muestra como "EMA 50". Genérico: no
  // depende de que la variable se llame "EMA" específicamente, cualquier
  // Variable con un período configurado se etiqueta igual.
  function construirEtiquetaVariable(variable){
    return variable.periodo ? `${variable.nombre} ${variable.periodo}` : variable.nombre;
  }

  // Sprint 4 — control de "importancia", genérico para cualquier variable con
  // importance_enabled=true (no exclusivo de Liquidez). Independiente de
  // valor_observado e influyo_en_decision, mismo principio de Sprint 3.
  function construirControlImportancia(){
    return `<div class="vo-importancia" style="margin-top: var(--space-2); display:flex; align-items:center; gap: var(--space-3);">
      <span style="font-size: var(--fs-xs); color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.04em;">¿Es especialmente importante?</span>
      <div class="segmented vo-importancia-segmented">
        <button class="sell active" type="button" data-valor="no">No</button>
        <button class="buy" type="button" data-valor="si">Sí</button>
      </div>
    </div>`;
  }

  // Sprint 4 — registro de categorías ya migradas a su propia posición fija
  // en el formulario (en vez del cajón genérico "Variables Observadas").
  // Para migrar la siguiente (ej. Estructura), se agrega UNA línea aquí y se
  // crea su contenedor en el HTML — nada más se duplica ni se reescribe.
  const CATEGORIAS_EN_BLOQUE_PROPIO = {
    'liquidez': 'liquidezDinamicaContainer',
    'estructura': 'estructuraDinamicaContainer',
    'price_action': 'priceActionDinamicaContainer',
    'desequilibrios': 'desequilibriosDinamicaContainer',
    'volumen': 'volumenDinamicaContainer',
    'indicadores_tecnicos': 'indicadoresTecnicosDinamicaContainer',
    'estado_mental': 'estadoMentalDinamicaContainer',
    'plan_operacion': 'planOperacionDinamicaContainer'
  };

  // HTML de una categoría completa — reutilizado tanto por el cajón genérico
  // como por los bloques propios (Liquidez), para no duplicar esta plantilla.
  // Sprint 4.2 — extraído de construirHtmlCategoria() para poder reutilizarlo
  // tanto cuando todas las Variables comparten Fase (caso de hoy: Liquidez,
  // Estructura, etc. — sin cambios) como cuando una categoría mezcla varias
  // Fases (caso nuevo: Estado Mental del Trader).
  function construirCuerpoVariables(variables){
    return variables.map(({ variable, tipo, opciones: opcionesVar, temporalidadesMatriz }, i) => {
      const etiqueta = construirEtiquetaVariable(variable); // Sprint UX-2A — "EMA" + config.periodo si existe
      const controlHtml = tipo === 'timeframe_matrix'
        ? construirControlMatrizTemporalidad(temporalidadesMatriz || [], opcionesVar)
        : construirControlValorObservado(tipo, opcionesVar);
      // Sprint 4.3 — el control "¿Influyó?" ahora es condicional. Por
      // defecto siempre se muestra (influence_enabled=true en la base de
      // datos para TODA variable existente) — cero cambio visual salvo en
      // Variables donde se desactivó explícitamente (ej. Hipótesis del Trade).
      const mostrarInfluyo = variable.influye !== false;
      return `
      <div class="form-field form-field-full vo-variable" data-variable-id="${variable.id}" data-tipo="${tipo}"
           style="${i > 0 ? 'margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--color-border);' : ''}">
        <label>${escapeHtml(etiqueta)}</label>
        <div class="vo-control">${controlHtml}</div>
        ${variable.importancia ? construirControlImportancia() : ''}
        ${mostrarInfluyo ? `
        <div style="margin-top: var(--space-2); display:flex; align-items:center; gap: var(--space-3);">
          <span style="font-size: var(--fs-xs); color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.04em;">¿Influyó en mi decisión?</span>
          <div class="segmented vo-influyo-segmented">
            <button class="sell active" type="button" data-valor="no">No</button>
            <button class="buy" type="button" data-valor="si">Sí</button>
          </div>
        </div>` : ''}
      </div>
    `;
    }).join('');
  }

  const ORDEN_FASES = ['PRE_TRADE', 'DURING_TRADE', 'POST_TRADE'];
  const ETIQUETA_FASE = { PRE_TRADE: 'Antes del Trade', DURING_TRADE: 'Durante el Trade', POST_TRADE: 'Después del Trade' };

  function construirHtmlCategoria(grupo, opciones){
    opciones = opciones || {};
    const { categoria, variables } = grupo;

    const titulo = opciones.ocultarTitulo ? '' :
      `<div class="form-field-full" style="font-size: var(--fs-sm); font-weight: 700; color: var(--color-text-secondary); margin-bottom: var(--space-2);">${escapeHtml(categoria.nombre)}</div>`;

    // Sprint 4.2 — si las Variables de esta categoría abarcan más de una
    // Fase (ej. Estado Mental del Trader), se agrupan con subtítulos en
    // orden Antes → Durante → Después. Si todas comparten la misma Fase
    // (el caso de HOY para Liquidez, Estructura, Price Action, etc.), se
    // renderiza exactamente igual que siempre — cero cambio visual ahí.
    const fasesPresentes = [...new Set(variables.map(v => v.variable.fase || 'PRE_TRADE'))];

    let cuerpo;
    if(fasesPresentes.length > 1){
      cuerpo = ORDEN_FASES
        .filter(fase => fasesPresentes.includes(fase))
        .map(fase => {
          const variablesDeFase = variables.filter(v => (v.variable.fase || 'PRE_TRADE') === fase);
          const subtitulo = `<div class="form-field-full" style="font-size: var(--fs-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-secondary); margin: var(--space-5) 0 var(--space-2);">${ETIQUETA_FASE[fase] || fase}</div>`;
          return subtitulo + construirCuerpoVariables(variablesDeFase);
        }).join('');
    }else{
      cuerpo = construirCuerpoVariables(variables);
    }

    if(opciones.sinTarjeta){
      return titulo + cuerpo;
    }
    return `
      <div class="card" style="background: var(--color-bg); margin-top: var(--space-4);">
        <div class="card-body" style="padding: var(--space-4);">${titulo}${cuerpo}</div>
      </div>
    `;
  }

  // Cajón genérico — todas las categorías activas EXCEPTO las que ya migraron
  // a su propio bloque fijo (ver CATEGORIAS_EN_BLOQUE_PROPIO).
  function renderVariablesObservadas(){
    const container = document.getElementById('variablesObservadasContainer');
    if(!container){
      console.error('[Variables Observadas] No se encontró #variablesObservadasContainer en el DOM. ' +
        'Causa más probable: el bloque HTML no se pegó en index.html, o el id tiene una errata.');
      return;
    }

    const arbol = construirArbolVariablesObservadas()
      .filter(grupo => !CATEGORIAS_EN_BLOQUE_PROPIO[grupo.categoria.codigo]);
    console.log(`[Variables Observadas] Categorías en el cajón genérico: ${arbol.length}`,
      arbol.map(a => a.categoria.nombre));

    if(arbol.length === 0){
      container.innerHTML = `<span style="color: var(--color-text-muted); font-size: var(--fs-sm);">Aún no hay categorías de Variables activas (fuera de las que ya tienen su propio bloque) con al menos una Variable activa. Créalas desde el módulo "🧩 Variables".</span>`;
      return;
    }

    container.innerHTML = arbol.map(grupo => construirHtmlCategoria(grupo)).join('');
  }

  // Sprint 4 — categorías migradas a SU PROPIO contenedor fijo en el formulario
  // (ej. Liquidez). Reutiliza el mismo árbol y la misma plantilla que el
  // cajón genérico — solo cambia dónde se inserta el resultado.
  function renderCategoriasEnBloquePropio(){
    const arbolCompleto = construirArbolVariablesObservadas();

    Object.entries(CATEGORIAS_EN_BLOQUE_PROPIO).forEach(([codigoCategoria, idContenedor]) => {
      const contenedor = document.getElementById(idContenedor);
      if(!contenedor){
        console.error(`[Variables Observadas] No se encontró #${idContenedor} para la categoría "${codigoCategoria}". ` +
          'Causa más probable: el bloque HTML no se pegó en index.html, o el id tiene una errata.');
        return;
      }

      const grupo = arbolCompleto.find(g => g.categoria.codigo === codigoCategoria);
      if(!grupo){
        console.log(`[Variables Observadas] La categoría "${codigoCategoria}" no está activa o no tiene variables activas.`);
        contenedor.innerHTML = `<span style="color: var(--color-text-muted); font-size: var(--fs-sm);">Esta categoría no está activa o no tiene variables activas todavía. Revisa el módulo "🧩 Variables".</span>`;
        return;
      }

      contenedor.innerHTML = construirHtmlCategoria(grupo, { ocultarTitulo: true, sinTarjeta: true });
    });
  }

  // Listener único delegado sobre todo el contenedor — necesario porque el
  // contenido se genera dinámicamente DESPUÉS de que corre el listener
  // genérico de .segmented en attachVisualListeners() (ese solo alcanza a
  // los .segmented que ya existían en el HTML al momento de ejecutarse).
  // Sprint 4 — un solo manejador reutilizado en TODOS los contenedores
  // (el cajón genérico y cada bloque propio como Liquidez), para no
  // duplicar esta lógica de clic por cada categoría migrada.
  function manejarClicVariableObservada(e){
    const segBtn = e.target.closest('.segmented button');
    if(segBtn){
      const grupo = segBtn.closest('.segmented');
      grupo.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      segBtn.classList.add('active');
      return;
    }
    const chip = e.target.closest('.vo-valor-chips .chip');
    if(chip){
      const grupo = chip.closest('.vo-valor-chips');
      if(grupo.dataset.modo === 'single'){
        grupo.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      }else{
        chip.classList.toggle('active');
      }
    }
  }

  function attachVariablesObservadasListeners(){
    const idsContenedores = ['variablesObservadasContainer'].concat(Object.values(CATEGORIAS_EN_BLOQUE_PROPIO));
    idsContenedores.forEach(id => {
      const container = document.getElementById(id);
      if(!container){
        console.error(`[Variables Observadas] attachVariablesObservadasListeners: #${id} no encontrado, no se pudo conectar el listener de clics.`);
        return;
      }
      container.addEventListener('click', manejarClicVariableObservada);
    });
  }

  // --- Recolección / aplicación (usadas desde trades.js) ---

  function obtenerVariablesObservadasData(){
    const resultado = [];
    // Sprint 4: selector global (ya no atado a un solo contenedor) — recoge
    // tanto el cajón genérico como cualquier bloque propio (ej. Liquidez).
    document.querySelectorAll('.vo-variable').forEach(bloque => {
      const variableId = bloque.dataset.variableId;
      const tipo = bloque.dataset.tipo;
      let valorObservado = null;

      if(tipo === 'boolean'){
        const activo = bloque.querySelector('.vo-valor-segmented button.active');
        valorObservado = activo ? (activo.dataset.valor === 'si') : null;
      }else if(tipo === 'numeric' || tipo === 'text'){
        const input = bloque.querySelector('.vo-valor-input');
        valorObservado = input && input.value.trim() ? input.value.trim() : null;
      }else if(tipo === 'multi_select'){
        const activos = Array.from(bloque.querySelectorAll('.vo-valor-chips .chip.active')).map(c => c.dataset.value);
        valorObservado = activos.length ? activos : null;
      }else if(tipo === 'timeframe_matrix'){
        // Sprint UX-2A — un valor por cada fila de Temporalidad dentro del
        // mismo bloque (ej. { "1W": "sobre", "1D": "bajo" }).
        const matriz = {};
        bloque.querySelectorAll('.contexto-fila[data-timeframe-code]').forEach(fila => {
          const tfCode = fila.dataset.timeframeCode;
          const activo = fila.querySelector('.vo-valor-chips .chip.active');
          if(activo) matriz[tfCode] = activo.dataset.value;
        });
        valorObservado = Object.keys(matriz).length > 0 ? matriz : null;
      }else{ // single_select
        const activo = bloque.querySelector('.vo-valor-chips .chip.active');
        valorObservado = activo ? activo.dataset.value : null;
      }

      const influyoBtn = bloque.querySelector('.vo-influyo-segmented button.active');
      const influyoEnDecision = influyoBtn ? influyoBtn.dataset.valor === 'si' : false;

      const registro = {
        variable_id: variableId,
        valor_observado: valorObservado,
        influyo_en_decision: influyoEnDecision
      };

      // Sprint 4 — solo presente si esta variable tiene importance_enabled=true
      // (el control ni siquiera existe en el DOM para las demás).
      const importanciaBtn = bloque.querySelector('.vo-importancia-segmented button.active');
      if(importanciaBtn){
        registro.es_importante = importanciaBtn.dataset.valor === 'si';
      }

      resultado.push(registro);
    });
    return resultado;
  }

  function aplicarVariablesObservadasData(lista){
    const datos = Array.isArray(lista) ? lista : [];
    document.querySelectorAll('.vo-variable').forEach(bloque => {
      const variableId = bloque.dataset.variableId;
      const tipo = bloque.dataset.tipo;
      const registro = datos.find(d => d.variable_id === variableId);

      if(tipo === 'boolean'){
        const valor = registro && registro.valor_observado === true ? 'si' : 'no';
        bloque.querySelectorAll('.vo-valor-segmented button').forEach(b => b.classList.toggle('active', b.dataset.valor === valor));
      }else if(tipo === 'numeric' || tipo === 'text'){
        const input = bloque.querySelector('.vo-valor-input');
        if(input) input.value = (registro && registro.valor_observado) ? registro.valor_observado : '';
      }else if(tipo === 'multi_select'){
        const seleccionados = (registro && Array.isArray(registro.valor_observado)) ? registro.valor_observado : [];
        bloque.querySelectorAll('.vo-valor-chips .chip').forEach(c => c.classList.toggle('active', seleccionados.includes(c.dataset.value)));
      }else if(tipo === 'timeframe_matrix'){
        // Sprint UX-2A — simétrico a la recolección: un valor por fila.
        const matriz = (registro && registro.valor_observado && typeof registro.valor_observado === 'object' && !Array.isArray(registro.valor_observado))
          ? registro.valor_observado : {};
        bloque.querySelectorAll('.contexto-fila[data-timeframe-code]').forEach(fila => {
          const tfCode = fila.dataset.timeframeCode;
          const valorGuardado = matriz[tfCode] || null;
          fila.querySelectorAll('.vo-valor-chips .chip').forEach(c => c.classList.toggle('active', c.dataset.value === valorGuardado));
        });
      }else{ // single_select
        const valor = registro ? registro.valor_observado : null;
        bloque.querySelectorAll('.vo-valor-chips .chip').forEach(c => c.classList.toggle('active', c.dataset.value === valor));
      }

      const influyo = (registro && registro.influyo_en_decision) ? 'si' : 'no';
      bloque.querySelectorAll('.vo-influyo-segmented button').forEach(b => b.classList.toggle('active', b.dataset.valor === influyo));

      const importancia = (registro && registro.es_importante) ? 'si' : 'no';
      bloque.querySelectorAll('.vo-importancia-segmented button').forEach(b => b.classList.toggle('active', b.dataset.valor === importancia));
    });
  }

  // Ficha Técnica — bloque de solo lectura, mínimo, para poder verificar
  // visualmente que lo guardado es correcto. No toca el resto de la Ficha.
  function construirBloqueFichaVariablesObservadas(variablesObservadas){
    const lista = Array.isArray(variablesObservadas) ? variablesObservadas : [];
    if(lista.length === 0) return '';

    const filas = lista.map(registro => {
      const variable = variablesTrading.find(v => v.id === registro.variable_id);
      const nombreVariable = variable ? construirEtiquetaVariable(variable) : registro.variable_id;

      let textoValor = '—';
      if(registro.valor_observado && typeof registro.valor_observado === 'object' && !Array.isArray(registro.valor_observado)){
        // Sprint UX-2A — matriz por temporalidad: "1W: Sobre · 1D: Bajo"
        textoValor = Object.entries(registro.valor_observado).map(([tf, codigoOpcion]) => {
          const opcion = opcionesVariables.find(o => o.codigo === codigoOpcion && o.variable === registro.variable_id);
          return `${tf}: ${opcion ? opcion.etiqueta : codigoOpcion}`;
        }).join(' · ') || '—';
      }else if(Array.isArray(registro.valor_observado)){
        textoValor = registro.valor_observado.map(codigo => {
          const opcion = opcionesVariables.find(o => o.codigo === codigo && o.variable === registro.variable_id);
          return opcion ? opcion.etiqueta : codigo;
        }).join(', ') || '—';
      }else if(typeof registro.valor_observado === 'boolean'){
        textoValor = registro.valor_observado ? 'Sí' : 'No';
      }else if(registro.valor_observado){
        const opcion = opcionesVariables.find(o => o.codigo === registro.valor_observado && o.variable === registro.variable_id);
        textoValor = opcion ? opcion.etiqueta : registro.valor_observado;
      }

      const influyoBadge = registro.influyo_en_decision
        ? `<span class="badge success" style="margin-left:6px;">Influyó</span>`
        : `<span class="badge neutral" style="margin-left:6px;">No influyó</span>`;
      const importanciaBadge = registro.es_importante
        ? `<span class="badge gold" style="margin-left:6px;">⭐ Importante</span>`
        : '';

      return `${filaCampoFicha(escapeHtml(nombreVariable), escapeHtml(textoValor) + influyoBadge + importanciaBadge)}`;
    }).join('');

    return `
      <div class="ficha-block">
        <div class="ficha-block-title">Variables Observadas</div>
        <div class="ficha-field-list">${filas}</div>
      </div>
    `;
  }
