# Contratos conceptuales mínimos

Este documento fija semántica mínima. No pretende definir todavía schemas
exhaustivos, formatos de archivo ni una API estable.

## ProjectRef

Identifica sin ambigüedad el proyecto objetivo.

Debe poder expresar:

- identidad estable del proyecto;
- raíz o referencia explícita del target;
- referencia del Method Pack y su versión;
- ubicación de los registros autoritativos.

Una ruta de filesystem por sí sola no reemplaza la identidad del proyecto.

## RunContext

Identifica el cambio activo y los límites dentro de los cuales puede actuar un
runtime.

Debe poder expresar:

- identidad del run/change y su `ProjectRef`;
- intención y scope;
- fase u outcome activo, derivado desde los artefactos cuando el slice así lo
  defina;
- baseline del target;
- Method Pack fijado para el run;
- RuntimeAdapter y snapshot de capacidades;
- permisos de lectura, escritura y escalación.

Todo efecto sobre el target o sobre el estado del proceso pertenece a un
`RunContext`.

## ArtifactEnvelope

Envuelve un artefacto sin imponer todavía su representación física.

Debe poder expresar:

- identidad, tipo y revisión;
- project y run/change de origen;
- owner y productores;
- estado de aprobación aplicable;
- referencia al contenido;
- procedencia y relaciones de trazabilidad;
- revisión que reemplaza o de la que deriva.

Una revisión aprobada no se muta en silencio. Un cambio produce una revisión y
una transición nuevas.

## ContextBrief

Es el paquete mínimo suficiente que recibe un actor para una operación.

Debe poder expresar:

- objetivo y resultado esperado;
- scope permitido y exclusiones;
- artefactos, hechos y evidencia seleccionados;
- referencias a las fuentes y su frescura;
- capacidades autorizadas;
- condiciones de éxito, bloqueo y escalación.

El brief no necesita contener el conocimiento global. Debe ser posible auditar
por qué cada fuente fue incluida.

## EvidenceEvent

Registra un hecho observable sin confundirlo con una conclusión o aprobación.

Debe poder expresar:

- identidad y tipo de evento;
- project, run/change, actor y tiempo;
- baseline o revisión del target observada;
- referencias a outputs verificables;
- relación con nodos del grafo de trazabilidad;
- integridad o identidad del contenido observado.

Ejemplos futuros incluyen resultados de tests, commits, builds, deploys y
decisiones humanas. El catálogo se definirá por slices.

## PlanningGapDetected

Es el mensaje mediante el cual execution devuelve una insuficiencia a
planning. Debe identificar:

- el run/change y scope afectado;
- la condición aprobada que no puede ejecutarse o verificarse;
- la evidencia que demuestra el gap;
- los nodos de trazabilidad afectados;
- si el trabajo puede continuar fuera de ese scope.

`PlanningGapDetected` NO autoriza a execution a redefinir ACs, decisiones o
handoffs aprobados.

## Grafo de trazabilidad

El backbone conceptual es:

```text
idea
  -> AC
  -> decision
  -> work
  -> handoff
  -> test
  -> code
  -> commit
  -> build
  -> deploy
  -> certification
```

Cada flecha representa una relación identificable y respaldada por evidencia,
no una coincidencia de texto. Los adapters pueden almacenar el grafo de formas
distintas, pero no cambiar el significado de sus relaciones.

## Ownership mínimo

| Concern | Autoridad |
|---|---|
| Ceremonia y gates | Method Pack activo |
| Identidad, ledger, grafo y briefs | Virgil (Secretaría Ejecutiva) |
| Contenido y aprobación de planning | Actores definidos por el Method Pack |
| Código y evidencia de ejecución | Execution bajo el RunContext |
| Decisiones que requieren autoridad humana | Humano identificado por el proyecto |

Persistir un resultado no convierte a Virgil en autor de su contenido.
Ejecutar un handoff no convierte a execution en owner de la intención aprobada.
