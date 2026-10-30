## ADDED Requirements

### Requirement: Descubrimiento de registros administrativos
Los catálogos de servicios, barberos, productos, materiales y promociones SHALL permitir buscar por texto, ordenar por nombre y paginar resultados. Los registros con estado activo SHALL permitir filtrarlo. La pantalla SHALL distinguir una colección vacía de una búsqueda sin coincidencias y permitir limpiar filtros.

#### Scenario: Búsqueda sin coincidencias
- **WHEN** un administrador busca un registro inexistente
- **THEN** ve un mensaje sin resultados y puede restablecer el listado sin recargar la página

#### Scenario: Cambio de filtro desde otra página
- **WHEN** cambia la búsqueda o el estado mientras está en una página posterior
- **THEN** se muestra la primera página de los resultados filtrados con su cantidad correcta

### Requirement: Formularios bajo demanda y navegación legible
La administración SHALL presentar navegación agrupada y contexto de la sección. La creación de catálogos SHALL abrirse por decisión del usuario, indicando campos obligatorios, y conservar los valores ante errores. Edición y confirmaciones SHALL mantener navegación por teclado y no enviar cambios al cancelar. La interfaz SHALL adaptarse a móvil sin desplazamiento horizontal de toda la página.

#### Scenario: Crear y corregir un registro
- **WHEN** abre creación y el servidor rechaza los valores
- **THEN** el formulario mantiene los datos, muestra el error y permite corregirlo sin perder el listado

#### Scenario: Navegar desde móvil
- **WHEN** abre el panel en una pantalla de 390 píxeles
- **THEN** puede cambiar de sección, buscar y operar formularios con controles visibles y foco distinguible
