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

const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';   // <-- reemplazar con tu Project URL
const SUPABASE_ANON_KEY = 'TU-ANON-KEY-AQUI';               // <-- reemplazar con tu anon/public key

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
