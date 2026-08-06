/* ============================================================
   CLIENTE SUPABASE — Trading Master

   Único archivo que inicializa la conexión a Supabase. El resto de
   la aplicación accede a través del objeto global `supabaseClient`
   (por ejemplo, accounts.js lo usa directamente, sin importarlo:
   toda la app sigue viviendo en un único ámbito global, sin
   type="module" ni bundlers).

   Requiere que el <script> del SDK de Supabase (CDN) se cargue ANTES
   que este archivo — ver instrucciones de index.html.
   ============================================================ */

const SUPABASE_URL = 'https://pxaqnmxjcmddfgihfnzm.supabase.co';   // <-- reemplazar con tu Project URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4YXFubXhqY21kZGZnaWhmbnptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0Mjg0NzEsImV4cCI6MjEwMTAwNDQ3MX0.3Gqf9N3Otl4qEDbcrCkzeWrICcR2nR5T5zUh2MEVK3g';               // <-- reemplazar con tu anon/public key

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
