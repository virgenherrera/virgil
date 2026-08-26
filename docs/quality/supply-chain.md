# Supply Chain Integrity

[← docs/](../README.md) · [← quality/](./README.md)

Las dependencias externas son superficie de ataque y fuente de tech debt. Virgil
impone tres invariantes sobre la cadena de suministro, agnosticos de lenguaje y
plataforma.

Fuente: `principia/constitution.md`, Seccion 7h.

## Los tres invariantes

| Invariante | Proposito |
|------------|-----------|
| **versionPinning** | Reproducibilidad absoluta: cero ambiguedad en versiones |
| **securityAudit** | Gate blocking: no se construye sobre dependencias vulnerables |
| **bumpDependencies** | Mantenimiento controlado: actualizar sin introducir riesgo |

## versionPinning: versiones exactas, sin rangos

Todas las dependencias se declaran con version exacta. Sin rangos, sin prefijos de
compatibilidad.

| Regla | Correcto | Incorrecto |
|-------|----------|------------|
| Version exacta | `1.2.3` | `^1.2.3`, `~1.2.3`, `>=1.2.0` |
| Gestor versionado | Version del gestor pinneada al proyecto | Usar "la version que haya" |
| Lock file versionado | Lock file commiteado como fuente de verdad | Lock file en `.gitignore` |

### Por que versiones exactas

- **Elimina version drift**: lo que pasa en CI es lo que corre en produccion
- **Reproducibilidad**: cualquier desarrollador, en cualquier maquina, obtiene
  las mismas versiones
- **Auditabilidad**: se sabe exactamente que version esta instalada sin ambiguedad

El lock file captura el arbol completo de dependencias transitivas. Se versiona y
se respeta como fuente de verdad, no como artefacto generado descartable.

El invariante aplica independientemente del ecosistema: npm/pnpm/yarn, Go modules,
Cargo, pip/uv, Maven/Gradle, o cualquier otro gestor.

## securityAudit: gate blocking en Setup

Antes de construir, se ejecuta un escaneo de vulnerabilidades sobre el arbol de
dependencias. Esta verificacion es una gate blocking del paso 1 (Setup) del
[Echo System](echo-system.md).

### Comportamiento por ambiente

| Ambiente | Comportamiento |
|----------|---------------|
| **Dev** | Pre-push hook: alerta, no bloquea |
| **CI** | Pipeline stage: gate blocking |
| **CD** | Deployment gate: bloqueo absoluto |

En Dev el escaneo alerta pero no bloquea, priorizando el feedback rapido del
desarrollador. En CI y CD, dependencias con vulnerabilidades altas o criticas
bloquean el pipeline.

### Umbral de severidad

El umbral de severidad (high, critical, o ambos) lo define el Method Pack. El
Kernel impone que el escaneo se ejecute; el Pack decide el umbral.

La herramienta de escaneo es agnostica: `pnpm audit`, `go vuln check`,
`cargo audit`, `pip-audit`, `mvn dependency-check`, o el equivalente del
ecosistema.

## bumpDependencies: actualizacion controlada en 3 pasos

Las versiones exactas previenen drift pero acumulan tech debt si no se actualizan.
El ciclo bumpDependencies resuelve esta tension:

| Paso | Que hace | Por que |
|------|----------|---------|
| 1. **Security Fix** | Resolver vulnerabilidades conocidas | Partir de una base segura |
| 2. **Update Check** | Aplicar actualizaciones con version exacta | Actualizar sin rangos |
| 3. **Security Fix** | Re-ejecutar escaneo post-actualizacion | Detectar vulnerabilidades nuevas |

Despues del ciclo completo, el Echo System se ejecuta integro (5 pasos). Si alguna
gate falla, se revierte la actualizacion y se investiga la causa.

### bumpDependencies es explicito, no automatico

bumpDependencies no es un paso del Echo. Es un proceso de mantenimiento que precede
al Echo. Se ejecuta de forma explicita, tipicamente en una cadencia definida por
el equipo:

- Semanal
- Por sprint
- Pre-release

El MIM puede delegar la cadencia al Method Pack, pero la ejecucion nunca es
automatica ni silenciosa. Siempre es un acto deliberado.

## Documentos relacionados

- [Echo System](echo-system.md) -- securityAudit es gate del paso 1 (Setup)
- [QA Gates](qa-gates.md) -- seguridad como gate del pipeline de certificacion

---

← Anterior: [complianceByDesign](./compliance.md) · [↑ quality](./README.md) · [↑↑ docs](../README.md)
