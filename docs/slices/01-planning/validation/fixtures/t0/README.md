# Fixtures T0 de Slice 1

Estas fixtures son los primeros contratos Red del harness app-level. Cada
scenario dirige un actor determinístico a través de la misma superficie pública
que usará un agente real y exige una traza y un EvidenceBundle completos.

- `t0-init-repo-docs-happy`: inicialización atómica bajo `docs/virgil/`;
  primer Red de publicación y aislamiento `repo-docs`.
- `t0-init-unmanaged-write-blocked`: policy fail-closed sin diff; materializa
  el caso C7.
- `t0-init-idempotent-retry`: replay en proceso fresco sin duplicar estado;
  materializa C13 y el mecanismo basal de recovery.

`fixture://dogma/virgil/v1` representa el dogma T0 mínimo con digest
`sha256:dc7670bf2e78e1a1cfa9f68a770a473b77c760f701fc9a1ce1eeb6d6211cd169`.
El fixture provider DEBE materializar exactamente estos bytes, incluido el
salto final:

```json
{"dogma_id":"virgil-dogma","method_pack":"virgil","version":"fixture-v1"}
```

Si no coinciden, la preparación termina como `fixture_failure`.

## Qué certifican

Certifican la interacción observable Agent↔Virgil: discovery, activación,
requests, guards, resultados, efectos y estado final. No prueban funciones
internas y no aceptan cobertura unitaria como sustituto.

Todavía son especificaciones **Red**: pasar JSON Schema demuestra solo que el
contrato es legible. El escenario obtiene `passed` únicamente cuando un harness
ejecuta el actor, observa los efectos y publica evidencia íntegra.
