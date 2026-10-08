import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './views/styles.css'
import App from './App.tsx'
import { hydrateFromDb } from './models/repository/store'

// Primero se cargan los datos de la base de datos local (data/champions.db) y luego se pinta la app
hydrateFromDb().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
