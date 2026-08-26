# Modos y roles

Virgil define 7 actores canonicos y 2 modos operativos. Este documento explica quien es quien en el sistema y como se relacionan.

Fuente: `principia/constitution.md`, Vocabulario de actores y Seccion 6a.

## Los 7 actores

| Actor | Que es | Cuando actua |
|---|---|---|
| **MIM** | Humano con autoridad final de decision. Aprueba, rechaza, desempata. Su veto es no negociable. | Siempre |
| **Desarrollador** | Humano + agente trabajando **sobre** Virgil (su codigo, tests, dogma). | Modo Desarrollo |
| **Implementador** | Agente externo trabajando **con** Virgil como herramienta. | Modo Consumo |
| **Virgil** | El binario: knowledge/control plane. | Ambos modos |
| **SM** | Session Manager: agente orquestador que coordina la sesion. Compila contexto, delega trabajo, ejecuta PDC. | Ejecucion |
| **TPM** | Task Progress Monitor: agente ligero que escanea estados y reporta al SM sin mutar deliverables. | Ejecucion |
| **PDC** | Post-Delegation Checkpoint: safeguard de coherencia que se ejecuta despues de cada delegacion del SM. Secuencia de 4 pasos: ECHO (coherence check) → VERIFY (completeness check) → MARK (persistir en TPM) → DECIDE (avanzar o escalar). | Post-delegacion |

> **Distincion importante**: Virgil (el binario) NO es el SM. Virgil es el knowledge/control plane que registra, traza y certifica. El SM es el agente orquestador que usa Virgil como herramienta para coordinar la sesion. Son entidades distintas con responsabilidades distintas.

### Quien eres tu en este sistema

- **Si desarrollas Virgil** (contribuyes a su codigo, tests o documentacion), eres el **Desarrollador** y posiblemente tambien el **MIM**.
- **Si usas Virgil en tu proyecto** (lo consumes como herramienta de planning y control), tu agente actua como **Implementador** y tu eres el **MIM** de tu proyecto.
- **Si eres un agente** orquestando trabajo, actuas como **SM** y delegas a sub-agentes bajo contratos explicitos.

## Los 2 modos operativos

Virgil opera en exactamente uno de dos modos. El mismo binario, los mismos contratos, las mismas gates de calidad. Lo que cambia es la direccion de agencia.

### Modo Desarrollo

Virgil es el **objeto** sobre el cual se trabaja.

- El Desarrollador (humano + agente) modifica codigo, tests y dogma de Virgil.
- Virgil se somete a sus propias reglas: el Principia gobierna como se desarrolla Virgil con la misma fuerza con que gobierna proyectos consumidores.
- El devRag (RAG de desarrollo) consulta `./principia/` y `./docs/` como fuentes.

### Modo Consumo

Virgil es la **herramienta** con la cual se trabaja.

- El Implementador (agente externo) consume Virgil via MCP/JSON-RPC.
- Virgil mantiene identidad, trazabilidad y contexto del proyecto consumidor.
- El consumerRag consulta el dogma de Virgil mas el RAG propio del proyecto.

### Propiedad notable

Ambos modos comparten los mismos principios, contratos y gates. No existe un "modo relajado" para desarrollar Virgil. Esta simetria es deliberada: si las reglas son buenas para los consumidores, son buenas para Virgil mismo.

## Delegacion de aprobaciones MIM

En equipos donde el MIM es tambien el unico desarrollador, los puntos de aprobacion MIM pueden consolidarse mediante **autorizacion permanente documentada**: el MIM emite una politica de proyecto que pre-autoriza categorias especificas de decision.

Lo que se puede delegar:

- Declaracion del perfil regulatorio del proyecto.
- Excepciones de cobertura.
- Activacion de break-glass bajo condiciones pre-definidas.

Lo que **no** se puede delegar:

- La activacion automatica de gates de review humano cuando el perfil de compliance lo requiere. Esa activacion es automatica e incondicional.

La delegacion reduce friccion sin eliminar trazabilidad: cada decision sigue quedando registrada y atribuida a la politica MIM vigente.

## Relacion entre actores

```text
MIM (humano, autoridad final)
 |
 |-- dirige --> SM (agente orquestador)
 |                |-- delega --> Sub-agentes (via delegationContract)
 |                |-- ejecuta --> PDC (checkpoint post-delegacion)
 |                |-- registra en --> TPM (tracking)
 |
 |-- es el --> Desarrollador (Modo Desarrollo)
 |-- dirige al --> Implementador (Modo Consumo)
```

El SM nunca actua sin direccion del MIM. Los sub-agentes nunca actuan sin un delegationContract del SM. El PDC se ejecuta despues de cada delegacion, sin excepcion.

## Siguiente lectura

Ahora que conoces los actores y modos, aprende como se estructura Virgil en [tres capas concentricas](modelo-tres-capas.md).
