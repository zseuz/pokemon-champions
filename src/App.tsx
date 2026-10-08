/**
 * Punto de entrada MVC: el controlador gestiona el estado y la vista lo muestra.
 *   Model      → src/models      (datos, dominio, motor de combate, análisis, persistencia)
 *   View       → src/views       (páginas y componentes de interfaz)
 *   Controller → src/controllers (hooks que conectan modelos y vistas)
 */
import { useAppController } from './controllers/useAppController';
import { AppView } from './views/AppView';

export default function App() {
  return <AppView {...useAppController()} />;
}
