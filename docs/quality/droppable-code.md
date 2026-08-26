# droppableCode

[← docs/](../README.md) · [← quality/](./README.md)

Codigo con 0% de cobertura en appTests no tiene justificacion para existir.
La cobertura no es metrica de vanidad: es un detector mecanico de codigo muerto.

Fuente: `principia/constitution.md`, Seccion 7f.

## Principio

Si un fragmento de codigo no esta cubierto por ningun test del tier App/Servicio
(appTests), es un candidato a eliminacion. El razonamiento es directo: si ningun
test lo ejercita, no hay evidencia de que el codigo funciona ni de que alguien
lo necesita.

## droppableCode vs safeToAutoDelete

No todo droppableCode se puede eliminar automaticamente. Existen dos categorias:

| Categoria | Criterio | Accion |
|-----------|----------|--------|
| **droppableCode** | 0% cobertura en appTests | Requiere decision: eliminar o justificar |
| **safeToAutoDelete** | droppableCode + criterios mecanicos | Eliminacion mecanica automatica |

Los criterios mecanicos de `safeToAutoDelete` son:

- Sin dependientes vivos
- Sin ejecucion observada durante N ciclos
- Sin cobertura transitiva

Si el codigo cumple los tres criterios, se puede eliminar de forma segura sin
decision humana. El droppableCode que no cumple estos criterios requiere decision
humana: eliminarlo o justificar su existencia con una excepcion documentada.

## Threshold de cobertura

El threshold de cobertura es obligatorio y tiene una regla estricta: **nunca se
reduce sin autorizacion explicita del MIM**.

La cobertura se mide solo sobre archivos con logica real (cobertura selectiva).
Archivos de configuracion, tipos, constantes y otros archivos sin logica ejecutable
no participan en la medicion.

## Excepciones documentadas

Existen cuatro categorias de excepcion reconocidas:

| Excepcion | Ejemplo |
|-----------|---------|
| **Codigo defensivo** | Paths de failure modes raros |
| **Feature flags** | Paths de flags no activos actualmente |
| **Boilerplate de adapters** | Interfaces externas aun no ejercitadas |
| **Codigo legado** | En proceso de migracion activa |

Cada excepcion requiere:

- Un tag explicito en el archivo que la identifica
- Revision periodica para evaluar si la excepcion sigue siendo valida

Las excepciones no son permanentes. Son aplazamientos documentados que deben
re-evaluarse.

## Excepciones de mutation testing

El mismo mecanismo de excepcion aplica a mutation testing. El MIM puede autorizar
excepciones para codigo donde mutation testing es computacionalmente prohibitivo:

- Test suites de integracion pesada
- Codigo generado
- Adapters de terceros

Los umbrales de mutation score son no-relajables para el codigo no exceptuado.

## Documentos relacionados

- [Testing Matrix](matriz-de-testing.md) -- define appTests como tier primario
- [QA Gates](qa-gates.md) -- coverage gate en el pipeline de certificacion
- [Red/Green/Refactor](red-green-refactor.md) -- la fase Refactor donde se evaluan metricas

---

← Anterior: [QA Gates](./qa-gates.md) · [↑ quality](./README.md) · [↑↑ docs](../README.md) · Siguiente: [complianceByDesign](./compliance.md) →
