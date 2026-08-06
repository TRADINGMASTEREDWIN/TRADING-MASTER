/* ============================================================
   CLIENTE SUPABASE — Trading Master

   Único archivo que inicializa la conexión a Supabase.
   El resto de la aplicación utiliza el objeto global
   window.supabaseClient.

   ============================================================ */

const SUPABASE_URL = 'https://pxaqnmxjcmddfgihfnzm.supabase.co';

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4YXFubXhqY21kZGZnaWhmbnptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0Mjg0NzEsImV4cCI6MjEwMTAwNDQ3MX0.3Gqf9N3Otl4qEDbcrCkzeWrICcR2nR5T5zUh2MEVK3g';

// Crear el cliente de Supabase y dejarlo disponible globalmente
window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

// Referencia local opcional
const supabaseClient = window.supabaseClient;

// Verificación rápida (puedes quitar estos console.log después)
console.log('✅ Supabase cargado');
console.log('URL:', SUPABASE_URL);
console.log('Cliente:', window.supabaseClient);
