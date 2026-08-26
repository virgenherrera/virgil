# Modelo de interaccion

Como interactuan los componentes de Virgil: separacion de concerns,
independencia de adapters e invariante fundamental de contexto.

Fuente: `principia/constitution.md`, Secciones 6b y 6c.

## Separacion de concerns

Cada pieza tiene un ownership claro. La cadena de responsabilidad
fluye en una direccion definida:

| Capa | Responsabilidad | Ownership |
|------|-----------------|-----------|
| Method Pack | Ceremonia, roles, routing, gates adicionales | Inyecta politica al Kernel |
| Virgil Kernel | Identidad, trazabilidad, contexto, transiciones | Nucleo inmutable |
| HostAdapter | Discovery, invocacion, capabilities del host | Traduccion al host |
| ArtifactStoreAdapter | Persistencia, retrieval, write policy | Traduccion al store |

El flujo es:

1. El **Method Pack** inyecta politica de ceremonia al Kernel
   (cuantos roles participan, que gates se comprimen, como se itera).
2. El **Kernel** procesa la operacion aplicando sus invariantes
   universales de calidad.
3. El Kernel **invoca** via HostAdapter y **persiste** via
   ArtifactStoreAdapter.

## Independencia Host/Store

Host y Store son concerns INDEPENDIENTES. Esta separacion es un
invariante arquitectonico (A6), no una conveniencia.

**Que significa en la practica:**

- Un mismo host puede usar stores distintos. Ejemplo: Claude como host
  puede persistir deliverables en repo-docs para un proyecto y en Jira
  para otro.
- Un mismo store puede servir hosts diferentes. Ejemplo: Confluence
  como store puede recibir deliverables tanto de Claude como de GPT.
- Cambiar de host no requiere cambiar de store, y viceversa.

**Que NO es valido:**

- Acoplar la logica de descubrimiento/invocacion (host) con la logica
  de persistencia (store) en un solo adapter.
- Asumir que un host implica un store particular.

## Invariante fundamental

**global ownership no es igual a global context injection.**

Esta es la distincion mas importante del modelo de interaccion:

### Lo que Virgil SI hace

Virgil conoce TODO el inventario: sabe que existe cada deliverable,
quien lo posee, en que estado esta, como se conecta con otros
deliverables. Este es el ownership global -- el knowledge plane.

### Lo que Virgil NO hace

Virgil NO carga todo el contenido en cada prompt. Conocer la existencia
de un deliverable no implica inyectar su contenido completo cada vez
que un agente necesita contexto.

### Por que importa

La diferencia es critica por dos razones:

- **Tokens:** inyectar todo el contenido en cada prompt quema tokens
  innecesariamente y degrada la calidad de las respuestas por exceso
  de contexto.
- **Precision:** el ContextCompiler selecciona lo relevante para cada
  delegacion. Un sub-agente recibe un ContextBrief acotado a su
  objetivo, no un volcado completo.

### Como se implementa

El ownership global se distribuye entre componentes con responsabilidades distintas:

- El **Ledger** registra eventos, transiciones e historial inmutable del proyecto.
- El **ArtifactRepository** gestiona deliverables, revisiones y procedencia.
- El **ContextCompiler** selecciona lo relevante para cada delegacion.
- El **delegationContract** entrega al sub-agente solo lo que necesita.
- El **RAG** permite consultas acotadas sin cargar archivos completos.

El resultado: Virgil ve todo pero entrega solo lo necesario. El
inventario esta completo; el contexto esta compilado.

## Aplicacion en ambos modos

Este modelo de interaccion se aplica de forma identica en ambos modos
operativos:

- **Modo Desarrollo:** Virgil es el objeto. El desarrollador trabaja
  SOBRE Virgil. Los mismos principios de separacion, independencia y
  contexto compilado aplican.
- **Modo Consumo:** Virgil es la herramienta. El implementador trabaja
  CON Virgil via MCP/JSON-RPC. Los mismos contratos y gates aplican.

Mismos principios, mismos contratos, mismas gates. Diferente direccion
de agencia.

## Documentos relacionados

- [Componentes](./componentes.md) -- catalogo detallado de cada pieza
- [Invariantes arquitectonicos](./invariantes-arquitectonicos.md) --
  A6 (Host/Store independientes) y A3 (contexto por contrato)
- [Flujo de contexto](../context-and-knowledge/flujo-de-contexto.md)
  -- como fluye el contexto entre agentes
