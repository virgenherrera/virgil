# Testing Matrix

[← docs/](../README.md) · [← quality/](./README.md)

El valor de un test depende de donde se ubica la frontera del mock, no de la piramide
clasica. Virgil reemplaza la piramide de testing con un modelo basado en boundaries:
la frontera entre lo real y lo simulado determina la utilidad de cada test.

Fuente: `principia/constitution.md`, Seccion 7d (primera parte).

## Principio rector

**Constraint > confianza (GP-4)**: los tests con mocks internos verifican que el mock
funciona, no que el codigo funciona. Solo los tests que ejercitan el stack real producen
evidencia certificable.

## Los 4 tiers

### Tier Prohibido: Unit/File con mocks internos

Tests unitarios a nivel de archivo con mocks internos tienen valor cero. Estan
prohibidos.

Un test que mockea las dependencias internas de una funcion solo verifica que el mock
se comporta como el desarrollador espera, no que el codigo funciona contra el sistema
real. Virgil elimina esta categoria por completo.

### Tier Derivado: Module/Integration y Regression/Smoke

Estos tests no se desarrollan explicitamente. Se derivan de los tests de nivel App:

- **Module/Integration**: se filtran desde appTests por scope
- **Regression/Smoke**: se derivan por tags desde appTests y E2E

No requieren esfuerzo de desarrollo separado. Existen como subconjuntos del tier
explicito.

### Tier Explicito: App/Servicio y Solution/E2E

Este es el tier donde se invierte el esfuerzo de desarrollo de tests:

| Nivel | Boundary | Mocks | Rol |
|-------|----------|-------|-----|
| **App/Servicio** | Stack real completo | Sin mocks | Tier PRIMARIO. Coverage alta obligatoria |
| **Solution/E2E** | Multi-servicio | Cero mocks | Deploys, tags, merges. Solucion completa |

**App/Servicio es el tier primario.** Aqui se mide la cobertura, aqui se detecta
droppableCode, aqui se certifica la implementacion. Los tests ejercitan la aplicacion
contra su stack real (base de datos real, servicios reales, sin simulaciones).

**Solution/E2E** valida la solucion completa con multiples servicios interactuando.
Cero mocks en cualquier nivel.

### Tier Condicional: Performance/Load

Solo se desarrolla si `design.md` declara SLAs explicitos. Si no hay SLAs declarados,
no hay tests de performance.

## Resumen de tiers

| Tier | Que incluye | Desarrollo | Mocks |
|------|-------------|------------|-------|
| **Prohibido** | Unit/File con mocks internos | Prohibido | N/A |
| **Derivado** | Module, Regression, Smoke | Se filtra/deriva de App y E2E | N/A |
| **Explicito** | App/Servicio, Solution/E2E | Desarrollo explicito | Cero |
| **Condicional** | Performance/Load | Solo con SLAs declarados | Segun contexto |

## Patron de trazabilidad: matriz a codigo

Durante Red, los casos de prueba se definen como una matriz con nombres estaticos.
El codigo del test importa esos nombres. Esto crea un enlace buscable desde la
matriz documentada hasta la implementacion:

- La matriz es una clase/struct con nombres estaticos (en TypeScript: `static readonly`;
  en Go: `const` block; en Rust: `mod` con constantes)
- El test importa el nombre de la matriz como descripcion
- El RAG puede encontrar ambos extremos del enlace

Lo que importa es que la matriz y el test compartan un identificador rastreable,
independientemente de la tecnologia.

## Por que este modelo

La Testing Matrix implementa directamente el principio GP-4
(constraint > confianza):

- **Constraint**: prohibir mocks internos elimina la posibilidad de tests que no
  verifican nada real
- **Constraint**: obligar stack real en App/Servicio fuerza que los tests ejerciten
  el sistema como lo haria un usuario
- **Constraint**: derivar en vez de desarrollar tiers intermedios elimina la posibilidad
  de divergencia entre niveles

No se confia en que el desarrollador escribira buenos tests. Se estructura el sistema
para que solo se puedan escribir tests con valor real.

## Documentos relacionados

- [Red/Green/Refactor](red-green-refactor.md) -- la fase Red produce tests segun esta matriz
- [Binding Layer](binding-layer.md) -- como se traza la confianza del enlace test-codigo
- [droppableCode](droppable-code.md) -- cobertura en appTests como detector de codigo muerto

---

← Anterior: [Red/Green/Refactor](./red-green-refactor.md) · [↑ quality](./README.md) · [↑↑ docs](../README.md) · Siguiente: [Binding Layer](./binding-layer.md) →
