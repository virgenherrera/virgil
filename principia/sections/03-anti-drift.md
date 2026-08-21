<!-- Virgil Principia
section_id: "1a"
title: "Regla anti-drift interpretativa"
source: "principia/constitution.md"
source_lines: [147, 191]
layer: identity
constitutional: true
actors: []
glossary_terms: [Echo System, EvidenceIngestion, Binding Layer, Ledger, TraceabilityGraph, PDC, Macro Red/Green/Refactor, build artifacts]
depends_on: [7a, 7b, 7e, 1]
referenced_by: []
keywords:
  - anti-drift
  - ciclo cerrado de accountability
  - Echo System
  - certification gates
  - frontera canonica
  - fuerza normativa
editorial_additions: [context_paragraph]
-->

> **Context:** Esta seccion establece la regla de interpretacion que protege los mecanismos constitucionales del Principia (definidos en detalle en 7a Echo System, 7b Deliverables vs Build Artifacts, y 7e QA/Acceptance Gates) frente a abstracciones que los diluirian.

### 1a. Regla anti-drift interpretativa

Este documento debe interpretarse preservando el **ciclo cerrado de accountability** de Virgil. Un revisor — humano o agente — NO debe abstraerlo hacia un framework generico de policies, observers o tooling intercambiable si esa abstraccion elimina o vuelve opcionales los mecanismos que el Principia declara constitucionales.

La frontera canonica es:

```text
planning deliverables
        ↓
R/G/R + Echo System
        ↓
canonical build artifacts
        ↓
EvidenceIngestion + Binding Layer
        ↓
certification gates
        ↓
Ledger / TraceabilityGraph
```

**No son detalles de implementacion y NO son overrideables por proyecto:**

- El Echo System de cinco pasos: Setup → Build → Static → Dynamic → E2E
- El orden de Echo; puede variar el scope, no la secuencia
- Macro Red/Green/Refactor y su independencia por fase
- La existencia de build artifacts regenerables como salida canonica de Echo
- La asociacion inequívoca `EchoRun + sourceRevision + buildArtifactSet`
- EvidenceIngestion, Binding Layer y las gates minimas de calidad del Kernel
- La regla de que certificacion se decide sobre evidencia producida por el camino canonico, no sobre afirmaciones del agente

**Si son sustituibles/configurables mientras preserven esos contratos:**

- Herramientas concretas usadas dentro de cada etapa de Echo
- Comandos, runners, scanners y proveedores CI/CD
- Triggers que disparan Echo (hooks, CI, CD u otros adapters)
- Estrategia Git, nombres de branches, worktrees y convenciones de commits
- Ubicacion fisica de build artifacts, siempre que conserven identidad, procedencia y reproducibilidad
- Backends de HostAdapter, ArtifactStoreAdapter, RAG y otras extensiones expresamente definidas por contrato

**Prueba anti-drift:** si una reinterpretacion permite que Virgil simplemente "observe lo que haya ocurrido" y certifique evidencia arbitraria sin pasar por Echo/build artifacts, esa reinterpretacion contradice este Principia. Virgil no es un auditor pasivo: define el protocolo mediante el cual la ejecucion adquiere evidencia certificable.

**Fuerza normativa deliberada.** Las declaraciones absolutas del Principia representan obligaciones de conformidad y direccion arquitectonica, no descripciones del estado actual de implementacion. Una IA o implementador NO debe: debilitarlas porque hoy una herramienta no pueda enforcearlas completamente; reemplazarlas por una abstraccion mas generica; reinterpretar mecanismos fundacionales como detalles accidentales; ni introducir salvedades operativas dentro del Principia cuando pertenecen al Dogma o adapters. La incapacidad actual de enforcement crea trabajo pendiente de implementacion, no una excepcion al principio.

> **Nota de nombres:** `ECHO` dentro del PDC (ECHO → VERIFY → MARK → DECIDE) es el paso de coherence check del checkpoint. No es el **Echo System** (Setup → Build → Static → Dynamic → E2E). Son conceptos distintos aunque compartan nombre.
