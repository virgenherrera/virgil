# Flujo de invocacion

[← docs/](../README.md) · [← lifecycle/](./README.md)

Cada operacion en Virgil sigue un flujo canonico: el Actor emite una solicitud, el HostAdapter la resuelve, el Kernel la ejecuta y persiste el resultado. Este flujo garantiza trazabilidad e2e desde la intencion hasta la evidencia registrada.

Fuente: `principia/constitution.md`, Seccion 3b.

## Flujo canonico

El camino que recorre cada invocacion tiene cuatro participantes:

| Participante | Responsabilidad |
|-------------|-----------------|
| Actor | Emite la solicitud (MIM, Desarrollador o Implementador) |
| HostAdapter | Traduce la solicitud al protocolo del Kernel; resuelve identidades |
| Virgil Kernel | Valida, compila contexto, ejecuta la operacion, ingiere evidencia, registra en Ledger |
| ArtifactStore | Persiste el deliverable resultante |

### Secuencia de pasos

1. El Actor envia una solicitud al HostAdapter.
2. El HostAdapter resuelve las tres identidades de invocacion (ver seccion siguiente).
3. El Kernel valida que source y target sean distintos.
4. El Kernel compila el ContextBrief con los deliverables relevantes.
5. El Kernel ejecuta la operacion canonica.
6. El Kernel persiste el deliverable en el ArtifactStore.
7. El Kernel ingiere la evidencia producida.
8. El Kernel registra la transicion en el Ledger.
9. El Kernel devuelve resultado y estado al HostAdapter.
10. El HostAdapter devuelve la respuesta al Actor.

## Las tres identidades de invocacion

Al inicio de cada invocacion, el HostAdapter resuelve tres identidades que acompanan toda la operacion.

| Identidad | Que referencia | Proposito |
|-----------|----------------|-----------|
| DogmaRef | El dogma operativo (`docs/`) | Saber que reglas normativas aplican |
| ProjectRef | El proyecto objetivo (target) | Saber sobre que proyecto se opera |
| RunContext | El run o cambio activo | Saber en que contexto de ejecucion estamos |

Estas tres identidades se nombran como participantes del flujo canonico. La especificacion de sus campos pertenece al layer de protocolo (`docs/protocol/`), no al Principia.

## Pasos deterministas vs pasos de juicio

El flujo canonico contiene dos tipos de pasos. Distinguirlos es importante porque tienen propiedades de confianza distintas.

### Pasos deterministas

Son binarios, sin subjetividad. No hay interpretacion posible:

- Validar que source != target
- Gates de certificacion: test pass/fail, mutation score, CRAP, coverage, CVE scan
- Persistencia del deliverable
- Registro en el Ledger (idempotente)

### Pasos mediados por juicio

Involucran razonamiento del agente orquestador. No son deterministas y deben dejar evidencia trazable:

- Compilacion del ContextBrief (seleccion de deliverables relevantes)
- Pasos de planning y escalacion
- Alineacion arquitectonica
- Verificacion de coherencia (PDC)

## PDC: safeguard de coherencia, no gate de certificacion

El Post-Delegation Checkpoint (PDC) opera durante la ejecucion como safeguard de coherencia de orquestacion. Es importante entender que el PDC:

- **Es**: un mecanismo que puede detener una delegacion incoherente.
- **No es**: un gate de certificacion. No certifica ni aprueba codigo.

La certificacion la determinan exclusivamente las gates del pipeline de QA definidas por el Kernel:

- Gates mecanicas deterministas (test results, mutation score, coverage, CRAP, CVE scan).
- Verificacion estructurada de alineacion arquitectonica (gate ARCH).
- Review humano como gate blocking adicional (solo cuando el proyecto declara perfil de compliance regulatoria).

El PDC tiene cuatro pasos internos:

| Paso | Que valida |
|------|------------|
| ECHO | El output de la delegacion es coherente (no confundir con el Echo System de 5 pasos) |
| VERIFY | El output esta completo segun el contrato |
| MARK | Persistir el resultado via TPM |
| DECIDE | Determinar si se avanza a la siguiente accion |

## Atomicidad y recovery

El flujo muestra pasos secuenciales (persistir, ingerir evidencia, registrar transicion). Si el proceso falla entre pasos, el mecanismo de [recuperacion](recuperacion.md) reconcilia el estado derivando la fase actual desde los deliverables existentes, no desde un puntero almacenado.

El Ledger implementa idempotencia: registrar una transicion ya registrada es un no-op. Esto hace seguro re-ejecutar el flujo despues de una interrupcion parcial.

## Documentos relacionados

- Las transiciones que este flujo ejecuta estan definidas en la [maquina de estados](maquina-de-estados.md).
- La compresion de ceremonia via [FastForward](fastforward.md) afecta que pasos de planning se ejecutan, pero el flujo de invocacion permanece igual.
- La reconstruccion del estado tras interrupciones se cubre en [Recuperacion](recuperacion.md).
- El detalle del delegationContract y el PDC completo se cubren en [docs de contexto](../context-and-knowledge/).

---

← Anterior: [FastForward](./fastforward.md) · [↑ lifecycle](./README.md) · [↑↑ docs](../README.md) · Siguiente: [Recuperacion](./recuperacion.md) →
