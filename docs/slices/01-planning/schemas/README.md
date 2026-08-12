# Schemas de Slice 1

Estos JSON Schemas definen la forma machine-readable del protocolo
`virgil.dev/planning-slice1/v1alpha1`.

Sus `$id` son identificadores canónicos. Los adapters DEBEN registrar los
schemas bundled y resolver referencias desde esa copia versionada; validarlos
no requiere acceso de red a `schemas.virgil.dev`.

## Contratos disponibles

- [`common.schema.json`](common.schema.json): referencias, adapters, actors,
  diagnósticos y tipos compartidos.
- [`operation-request.schema.json`](operation-request.schema.json): inputs
  estructurados de `virgil.init`, `virgil.new` y `virgil.continue`.
- [`effect-record.schema.json`](effect-record.schema.json): decisión de policy
  y efecto realmente observado.
- [`operation-result.schema.json`](operation-result.schema.json): resultado
  correlacionable, recuperable y no dependiente de prosa.

## Autoridad

Los schemas son normativos para la **estructura serializada**. El
[protocolo de operaciones](../operation-protocol.md) es normativo para la
semántica y las invariantes que JSON Schema no puede expresar por sí solo.

Si schema y protocolo parecen contradecirse, la implementación y el harness
DEBEN detenerse con un error de contrato. No eligen silenciosamente una fuente.

## Evolución

- Una corrección compatible puede agregar aclaraciones semánticas o constraints
  que no invaliden documentos válidos existentes.
- Un cambio incompatible publica una nueva versión de protocolo y nuevos `$id`.
- Un adapter declara exactamente qué versión acepta; no transforma versiones
  de forma implícita.

Este primer set cubre la invocación. ScenarioFixture, AgentInteractionTrace y
EvidenceBundle se agregan después, usando estas referencias sin duplicarlas.
