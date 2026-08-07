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
            opciones: opcionesVariables.filter(o => o.variable === v.id && o.estado === 'Activo')
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

  function renderVariablesObservadas(){
    const container = document.getElementById('variablesObservadasContainer');
    if(!container){
      console.error('[Variables Observadas] No se encontró #variablesObservadasContainer en el DOM. ' +
        'Causa más probable: el bloque HTML no se pegó en index.html, o el id tiene una errata.');
      return;
    }

    const arbol = construirArbolVariablesObservadas();
    console.log(`[Variables Observadas] Categorías activas con variables activas: ${arbol.length}`,
      arbol.map(a => a.categoria.nombre));

    if(arbol.length === 0){
      container.innerHTML = `<span style="color: var(--color-text-muted); font-size: var(--fs-sm);">Aún no hay categorías de Variables activas con al menos una Variable activa. Créalas desde el módulo "🧩 Variables".</span>`;
      return;
    }

    container.innerHTML = arbol.map(({ categoria, variables }) => `
      <div class="card" style="background: var(--color-bg); margin-top: var(--space-4);">
        <div class="card-body" style="padding: var(--space-4);">
          <div class="form-field-full" style="font-size: var(--fs-sm); font-weight: 700; color: var(--color-text-secondary); margin-bottom: var(--space-2);">${escapeHtml(categoria.nombre)}</div>
          ${variables.map(({ variable, tipo, opciones }, i) => `
            <div class="form-field form-field-full vo-variable" data-variable-id="${variable.id}" data-tipo="${tipo}"
                 style="${i > 0 ? 'margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--color-border);' : ''}">
              <label>${escapeHtml(variable.nombre)}</label>
              <div class="vo-control">${construirControlValorObservado(tipo, opciones)}</div>
              <div style="margin-top: var(--space-2); display:flex; align-items:center; gap: var(--space-3);">
                <span style="font-size: var(--fs-xs); color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.04em;">¿Influyó en mi decisión?</span>
                <div class="segmented vo-influyo-segmented">
                  <button class="sell active" type="button" data-valor="no">No</button>
                  <button class="buy" type="button" data-valor="si">Sí</button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  // Listener único delegado sobre todo el contenedor — necesario porque el
  // contenido se genera dinámicamente DESPUÉS de que corre el listener
  // genérico de .segmented en attachVisualListeners() (ese solo alcanza a
  // los .segmented que ya existían en el HTML al momento de ejecutarse).
  function attachVariablesObservadasListeners(){
    const container = document.getElementById('variablesObservadasContainer');
    if(!container){
      console.error('[Variables Observadas] attachVariablesObservadasListeners: contenedor no encontrado, no se pudo conectar el listener de clics.');
      return;
    }
    container.addEventListener('click', (e) => {
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
    });
  }

  // --- Recolección / aplicación (usadas desde trades.js) ---

  function obtenerVariablesObservadasData(){
    const resultado = [];
    document.querySelectorAll('#variablesObservadasContainer .vo-variable').forEach(bloque => {
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
      }else{ // single_select
        const activo = bloque.querySelector('.vo-valor-chips .chip.active');
        valorObservado = activo ? activo.dataset.value : null;
      }

      const influyoBtn = bloque.querySelector('.vo-influyo-segmented button.active');
      const influyoEnDecision = influyoBtn ? influyoBtn.dataset.valor === 'si' : false;

      resultado.push({
        variable_id: variableId,
        valor_observado: valorObservado,
        influyo_en_decision: influyoEnDecision
      });
    });
    return resultado;
  }

  function aplicarVariablesObservadasData(lista){
    const datos = Array.isArray(lista) ? lista : [];
    document.querySelectorAll('#variablesObservadasContainer .vo-variable').forEach(bloque => {
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
      }else{ // single_select
        const valor = registro ? registro.valor_observado : null;
        bloque.querySelectorAll('.vo-valor-chips .chip').forEach(c => c.classList.toggle('active', c.dataset.value === valor));
      }

      const influyo = (registro && registro.influyo_en_decision) ? 'si' : 'no';
      bloque.querySelectorAll('.vo-influyo-segmented button').forEach(b => b.classList.toggle('active', b.dataset.valor === influyo));
    });
  }

  // Ficha Técnica — bloque de solo lectura, mínimo, para poder verificar
  // visualmente que lo guardado es correcto. No toca el resto de la Ficha.
  function construirBloqueFichaVariablesObservadas(variablesObservadas){
    const lista = Array.isArray(variablesObservadas) ? variablesObservadas : [];
    if(lista.length === 0) return '';

    const filas = lista.map(registro => {
      const variable = variablesTrading.find(v => v.id === registro.variable_id);
      const nombreVariable = variable ? variable.nombre : registro.variable_id;

      let textoValor = '—';
      if(Array.isArray(registro.valor_observado)){
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

      return `${filaCampoFicha(escapeHtml(nombreVariable), escapeHtml(textoValor) + influyoBadge)}`;
    }).join('');

    return `
      <div class="ficha-block">
        <div class="ficha-block-title">Variables Observadas</div>
        <div class="ficha-field-list">${filas}</div>
      </div>
    `;
  }
