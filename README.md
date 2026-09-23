# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
# finanzas-bruce
# finanzas-bruce
# finanzas-bruce

## Campos de gastos personalizados

En **Nuevo gasto**, el usuario puede crear un campo en Fijos, Variables o Proveedores.
**Administrar campos** permite archivar y reactivar conceptos. El catálogo se reutiliza
todos los meses y archivar un campo no modifica los gastos históricos.

Dexie versión 6 añade la tabla `expenseFields` y conserva los 19 identificadores originales.
Los movimientos continúan en `monthlyExpenses`, con el nombre del campo al guardar.
Los respaldos JSON versión 3 incluyen el catálogo; se siguen aceptando respaldos
anteriores. El botón de respaldo permite volver a subir cambios el mismo día.
La restauración automática sigue aplicándose solo a instalaciones sin datos locales;
no es una sincronización entre dispositivos.

### Pruebas

Con Node.js 22.18 o posterior:

- `npm test`: pruebas de migración, campos, validaciones, respaldos y fallos de escritura
  con IndexedDB simulada mediante fake-indexeddb.
- `npm run build`: comprobación TypeScript y compilación de producción.
- `npm run lint`: revisión estática.
