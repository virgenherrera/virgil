# Garantia de Calidad

[← docs/](../README.md)

Virgil garantiza calidad mediante un ciclo cerrado de accountability: ocho mecanismos
interconectados donde cada uno alimenta al siguiente y ninguno funciona de forma aislada.
Si QA rechaza, el rechazo es especifico y escala a la fase exacta que debe corregirse.

Fuente: `principia/constitution.md`, Seccion 7 (completa) y Seccion 11d.

## El ciclo cerrado

El pipeline de calidad forma un circuito sin salidas laterales:

1. **Echo System** ejecuta el build pipeline determinista
2. Los **build artifacts** capturan los outputs de Echo
3. **Red/Green/Refactor** estructura la ejecucion en lotes
4. La **Testing Matrix** define que constituye una prueba valida
5. El **Binding Layer** traza la confianza de cada enlace test-codigo
6. **droppableCode** detecta codigo muerto por cobertura
7. **complianceByDesign** verifica cumplimiento como efecto secundario
8. **Supply Chain Integrity** asegura dependencias seguras
9. Las **QA Gates** certifican el resultado final

Si las gates rechazan, el rechazo identifica la fase exacta que fallo y re-delega
a esa fase. No existe un rechazo generico de "arreglar".

## Orden de lectura

Los documentos siguen el flujo del ciclo cerrado. Se recomienda leerlos en este orden:

1. [Echo System](echo-system.md) -- Pipeline determinista de 5 pasos
2. [Red/Green/Refactor](red-green-refactor.md) -- TDD por lotes con 5 gates
3. [Testing Matrix](matriz-de-testing.md) -- Modelo de boundaries, no piramide clasica
4. [Binding Layer](binding-layer.md) -- Tres niveles de confianza del enlace test-codigo
5. [QA Gates](qa-gates.md) -- Pipeline de certificacion mecanica
6. [droppableCode](droppable-code.md) -- Cobertura como detector de codigo muerto
7. [complianceByDesign](compliance.md) -- Compliance como efecto secundario del diseno
8. [Supply Chain Integrity](supply-chain.md) -- Dependencias exactas, auditadas y actualizadas

## Principio rector

Todos estos mecanismos operan bajo el principio GP-4: **constraint > confianza**.
La calidad se impone mediante gates mecanicas deterministas, no mediante promesas
del agente. Lo que se certifica se decide sobre evidencia producida por el camino
canonico (Echo + build artifacts), nunca sobre afirmaciones.

## Siguiente lectura

Una vez que comprendas el sistema de calidad, continua con
[Ejecucion](../execution/) para ver como se implementa el pipeline completo
de prePhase a Verify.

---

← Anterior: [Ejecucion](../execution/README.md) · [↑↑ docs](../README.md) · Siguiente: [Arquitectura](../architecture/README.md) →
