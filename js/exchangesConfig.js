/* ============================================================
   CONFIGURACIÓN → EXCHANGES — Fase 4.3.2

   Administración visual del catálogo de Exchanges (Supabase, tabla
   `exchanges`, creada en la Fase 4.3.1). Reutiliza el motor genérico
   de catalog.js (catalogoCargarDesdeSupabase / catalogoToggleEstado /
   catalogoRenderTabla / catalogoAttachListeners) — mismo patrón ya
   usado por Mercados y Brokers, sin duplicar esa lógica.

   ALCANCE DELIBERADO DE ESTA FASE:
   - Listar los exchanges reales desde Supabase (nunca hardcodeados).
   - Activar/Desactivar (is_active) — usa catalogoToggleEstado() tal
     cual, mismo mecanismo que ya usan Mercados/Brokers/etc.
   - Mostrar `capabilities` (JSONB) de forma GENÉRICA: cualquier
     código de capability, conocido o no, se muestra — nunca se
     oculta una capability nueva ni se inventa una que no esté en
     Supabase.
   - NO hay formulario de creación/edición: los 5 exchanges ya
     existen (creados por SQL en la 4.3.1). Por eso el objeto de
     configuración de abajo omite a propósito los campos de
     formulario (atributoCampo, idBotonGuardar, camposRequeridos,
     etc.) — el motor genérico solo los usa si están presentes, así
     que omitirlos es seguro y no rompe nada.
   - CONNECTED (cuenta conectada) NO existe en esta pantalla — ni
     siquiera se menciona. Esa es una fase futura de API Keys.
   ============================================================ */

let exchangesGenerales = [];

// Etiquetas legibles para las capabilities YA CONOCIDAS. Cualquier
// código que no esté aquí (ej. una futura PRIVATE_POSITIONS) sigue
// mostrándose igual, con una etiqueta genérica (ver
// etiquetaCapabilityGeneral) — nunca se descarta silenciosamente.
const ETIQUETAS_CAPABILITY_EXCHANGE = {
  SPOT: 'Spot',
  FUTURES: 'Futures',
  MARGIN: 'Margin',
  LOAN: 'Loan',
  PUBLIC_PRICE: 'Precio público',
  PUBLIC_HISTORICAL: 'Histórico público',
  PRIVATE_ORDERS: 'Órdenes (privado)',
  PRIVATE_TRADES: 'Trades (privado)',
  PRIVATE_BALANCES: 'Balances (privado)',
  PRIVATE_LOANS: 'Préstamos (privado)',
  PRIVATE_MARGIN: 'Margin (privado)',
  WEBSOCKET_PUBLIC: 'WebSocket público',
  WEBSOCKET_PRIVATE: 'WebSocket privado'
};

function etiquetaCapabilityGeneral(codigo){
  if(ETIQUETAS_CAPABILITY_EXCHANGE[codigo]) return ETIQUETAS_CAPABILITY_EXCHANGE[codigo];
  // Fallback genérico (PASO 5): "PRIVATE_POSITIONS" -> "Private Positions".
  // Nunca oculta una capability desconocida, solo le da una etiqueta legible.
  return String(codigo || '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Construye los chips de capabilities a partir del JSONB REAL de
// Supabase. Nunca inventa una capability que no esté presente en el
// objeto; nunca marca "implementado" si supported/implemented no son
// literalmente true.
function construirBadgesCapabilitiesExchange(capabilities){
  if(!capabilities || typeof capabilities !== 'object' || Object.keys(capabilities).length === 0){
    return '<span class="badge neutral"><span class="badge-dot"></span>Sin capacidades registradas</span>';
  }

  return Object.keys(capabilities).map(codigo => {
    const cap = capabilities[codigo] || {};
    const soportado = cap.supported === true;
    const implementado = cap.implemented === true;
    const etiqueta = escapeHtml(etiquetaCapabilityGeneral(codigo));

    // SUPPORTED + IMPLEMENTED -> verde (disponible de verdad hoy)
    if(soportado && implementado){
      return `<span class="badge success" title="Soportado: Sí · Implementado: Sí">✓ ${etiqueta}</span>`;
    }
    // SUPPORTED pero NO implementado -> naranja (pendiente, nunca se muestra como si funcionara)
    if(soportado && !implementado){
      return `<span class="badge warning" title="Soportado: Sí · Implementado: No">○ ${etiqueta}</span>`;
    }
    // NO soportado -> gris (no disponible en el exchange)
    return `<span class="badge neutral" title="Soportado: No">— ${etiqueta}</span>`;
  }).join(' ');
}

function mapearExchangeGeneralSupabaseAUI(row){
  return {
    id: row.id,
    nombre: row.name,
    code: row.code,
    estado: row.is_active ? 'Activo' : 'Inactivo',
    capabilities: row.capabilities || {}
  };
}

const configExchangesGenerales = {
  tabla: 'exchanges',
  ordenarPor: 'sort_order',
  estadoActivoLabel: 'Activo', estadoInactivoLabel: 'Inactivo',
  idTablaBody: 'exchangesGenTableBody', idContador: 'exchangesGenCount', colspanVacio: 3,
  mensajeVacio: 'No hay exchanges registrados.',
  claseBotonToggle: 'btn-toggle-exchangegen',
  campoNombrePrincipal: 'nombre',
  obtenerEstadoArray: () => exchangesGenerales,
  establecerEstadoArray: (n) => { exchangesGenerales = n; },
  mapearDBaUI: mapearExchangeGeneralSupabaseAUI,
  renderFila: (ex) => `<tr>
      <td>
        <div style="font-weight:600;">${escapeHtml(ex.nombre)}</div>
        <div style="font-size: var(--fs-sm); color: var(--color-text-muted);">${escapeHtml(ex.code)}</div>
      </td>
      <td>
        <span class="badge ${ex.estado === 'Activo' ? 'success' : 'neutral'}" style="display:inline-flex;"><span class="badge-dot"></span>${ex.estado}</span>
        <div style="margin-top: var(--space-2);">
          <button class="btn-secondary btn-toggle-exchangegen" data-id="${ex.id}" style="font-size: var(--fs-sm); padding: 4px 10px;">
            ${ex.estado === 'Activo' ? 'Desactivar' : 'Activar'}
          </button>
        </div>
      </td>
      <td>
        <div style="display:flex; flex-wrap:wrap; gap:6px; max-width: 480px;">${construirBadgesCapabilitiesExchange(ex.capabilities)}</div>
      </td>
    </tr>`
};

async function cargarExchangesGeneralesDesdeSupabase(){ await catalogoCargarDesdeSupabase(configExchangesGenerales); }
function renderExchangesGeneralesTable(){ catalogoRenderTabla(configExchangesGenerales); }
function attachExchangesGeneralesListeners(){ catalogoAttachListeners(configExchangesGenerales); }
