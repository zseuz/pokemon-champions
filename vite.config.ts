import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { localDbPlugin } from './server/api.ts'

// https://vite.dev/config/
export default defineConfig({
  // localDbPlugin: API /api/* que guarda los datos en la base SQLite data/champions.db
  plugins: [react(), localDbPlugin()],
  // no recargar la app cada vez que se escribe en la base de datos (solo los archivos champions.db*)
  server: { watch: { ignored: [/[\/]data[\/]champions\.db/] } },
})
