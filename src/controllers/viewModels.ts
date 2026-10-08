/** Tipos de datos preparados por los controladores para las vistas (view-models). */

/** Opción de un desplegable con buscador (habilidades, objetos, naturalezas, movimientos). */
export interface PickerOption {
  value: string;
  label: string;
  /** explicación corta (por qué se recomienda / qué hace) */
  detail?: string;
  score?: number;
  recommended?: boolean;
  disabled?: boolean;
  group: string;
  /** texto extra para buscar (p. ej. nombre en español) */
  search?: string;
}
