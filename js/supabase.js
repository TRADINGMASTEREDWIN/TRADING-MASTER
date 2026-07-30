/* ============================================================
   SUPABASE - Cliente y funciones de base de datos
   ============================================================ */

const SUPABASE_URL = 'https://pxaqnmxjcmddfgihfnzm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4YXFubXhqY21kZGZnaWhmbnptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0Mjg0NzEsImV4cCI6MjEwMTAwNDQ3MX0.3Gqf9N3Otl4qEDbcrCkzeWrICcR2nR5T5zUh2MEVK3g';

let supabaseClient = null;

try {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('✅ Supabase client initialized successfully');
} catch (error) {
  console.error('❌ Error initializing Supabase client:', error);
  supabaseClient = null;
}

export const supabase = supabaseClient;

// --- Función de prueba ---
export function verificarConexionSupabase() {
  if (supabaseClient) {
    console.log('✅ Supabase client is connected');
    return true;
  } else {
    console.error('❌ Supabase client is not connected');
    return false;
  }
}

// --- Guardar un trade en Supabase ---
export async function guardarTradeSupabase(trade) {
  if (!supabaseClient) {
    console.warn('⚠️ Supabase client not available');
    return { success: false, error: 'Supabase client not initialized' };
  }

  try {
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      console.warn('⚠️ No hay usuario autenticado, no se guarda en Supabase');
      return { success: false, error: 'Usuario no autenticado' };
    }

    const tradeData = {
      trade_data: trade,
      user_id: user.id
    };

    const { data, error } = await supabaseClient
      .from('trades')
      .insert(tradeData)
      .select();

    if (error) {
      console.error('❌ Error al guardar en Supabase:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ Trade guardado en Supabase:', data);
    return { success: true, data: data };
  } catch (error) {
    console.error('❌ Error en guardarTradeSupabase:', error);
    return { success: false, error: error.message };
  }
}

// --- Cargar trades desde Supabase ---
export async function cargarTradesDesdeSupabase() {
  if (!supabaseClient) {
    console.warn('⚠️ Supabase client not available');
    return { success: false, trades: [] };
  }

  try {
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      console.warn('⚠️ No hay usuario autenticado');
      return { success: false, trades: [] };
    }

    const { data, error } = await supabaseClient
      .from('trades')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error al cargar trades desde Supabase:', error);
      return { success: false, trades: [] };
    }

    const trades = data.map(item => item.trade_data);
    console.log(`✅ ${trades.length} trades cargados desde Supabase`);
    return { success: true, trades: trades };
  } catch (error) {
    console.error('❌ Error en cargarTradesDesdeSupabase:', error);
    return { success: false, trades: [] };
  }
}

// --- Actualizar un trade en Supabase ---
export async function actualizarTradeSupabase(tradeId, tradeData) {
  if (!supabaseClient) {
    return { success: false, error: 'Supabase client not initialized' };
  }

  try {
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Usuario no autenticado' };
    }

    // Buscar el registro por el id interno
    const { data: existingData, error: searchError } = await supabaseClient
      .from('trades')
      .select('id')
      .eq('trade_data->>id', tradeId)
      .single();

    if (searchError || !existingData) {
      // Si no existe, insertar
      return await guardarTradeSupabase(tradeData);
    }

    const { error: updateError } = await supabaseClient
      .from('trades')
      .update({ trade_data: tradeData })
      .eq('id', existingData.id);

    if (updateError) {
      console.error('❌ Error al actualizar en Supabase:', updateError);
      return { success: false, error: updateError.message };
    }

    console.log('✅ Trade actualizado en Supabase');
    return { success: true };
  } catch (error) {
    console.error('❌ Error en actualizarTradeSupabase:', error);
    return { success: false, error: error.message };
  }
}

// --- Eliminar un trade de Supabase ---
export async function eliminarTradeSupabase(tradeId) {
  if (!supabaseClient) {
    return { success: false, error: 'Supabase client not initialized' };
  }

  try {
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Usuario no autenticado' };
    }

    const { data: existingData, error: searchError } = await supabaseClient
      .from('trades')
      .select('id')
      .eq('trade_data->>id', tradeId)
      .single();

    if (searchError || !existingData) {
      console.warn('⚠️ Trade no encontrado en Supabase para eliminar');
      return { success: true };
    }

    const { error: deleteError } = await supabaseClient
      .from('trades')
      .delete()
      .eq('id', existingData.id);

    if (deleteError) {
      console.error('❌ Error al eliminar de Supabase:', deleteError);
      return { success: false, error: deleteError.message };
    }

    console.log('✅ Trade eliminado de Supabase');
    return { success: true };
  } catch (error) {
    console.error('❌ Error en eliminarTradeSupabase:', error);
    return { success: false, error: error.message };
  }
}

// --- Obtener el usuario actual ---
export async function getCurrentUser() {
  if (!supabaseClient) return null;
  try {
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error || !user) return null;
    return user;
  } catch (error) {
    return null;
  }
}
