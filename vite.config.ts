import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { localDbPlugin } from './server/routes.ts'

// https://vite.dev/config/
export default defineConfig({
  // localDbPlugin: API /api/* que guarda los datos en la base SQLite data/champions.db
  plugins: [react(), localDbPlugin()],
  // no recargar la app cada vez que se escribe en la base de datos (solo los archivos champions.db*)
  server: { watch: { ignored: [/[/\\]data[/\\]champions\.db/] } },
  build: {
    rolldownOptions: {
      output: {
        // librerías y datos en trozos aparte: se descargan en paralelo y quedan en caché entre versiones
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[/\\](react|react-dom|scheduler)[/\\]/ },
            { name: 'calc', test: /node_modules[/\\]@smogon[/\\]/ },
            { name: 'data', test: /src[/\\]models[/\\]data[/\\].*\.json/ },
          ],
        },
      },
    },
    // los datos de Pokémon (movimientos, aprendizajes, meta) pesan por sí solos
    chunkSizeWarningLimit: 900,
  },
})
