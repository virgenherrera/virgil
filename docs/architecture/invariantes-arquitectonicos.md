# Invariantes arquitectonicos

[← docs/](../README.md) · [← architecture/](./README.md)

Los 9 invariantes arquitectonicos definen las reglas de construccion:
como se estructura Virgil internamente, como fluye la informacion,
como se acoplan los componentes.

Fuente: `principia/constitution.md`, Secciones 4b y 4c.

## A1: Identidad antes que inferencia

**Invariante:** Cada entidad tiene identidad explicita antes de que
cualquier sistema la infiera o resuelva.

**Implicacion practica:** Deliverables, features, lanes y revisiones
reciben identificadores explicitos al crearse. El RAG, el
codebaseMemory y el TraceabilityGraph operan sobre entidades
identificadas, no sobre texto libre que deba interpretarse.

**Que previene:** Ambiguedad sobre que entidad se esta consultando,
modificando o certificando. Inferencias incorrectas por falta de
identidad explicita.

## A2: Autoridad separada de retrieval

**Invariante:** La fuente de verdad (Ledger, ArtifactRepository) y el
mecanismo de consulta (RAG, codebaseMemory) son componentes distintos.

**Implicacion practica:** El RAG y el TraceabilityGraph son
proyecciones derivadas, reconstruibles desde las fuentes autoritativas.
Si una proyeccion se desincroniza, se reconstruye. Nunca se escribe
en la proyeccion para corregir la fuente.

**Que previene:** Que una proyeccion corrupta se convierta en fuente
de verdad. Que la perdida del RAG implique perdida de datos. Que el
agente modifique el indice en lugar de la fuente.

## A3: Contexto compilado por contrato

**Invariante:** El contexto que recibe un sub-agente es compilado por
el ContextCompiler y entregado via delegationContract, no leido
libremente por el sub-agente.

**Implicacion practica:** El SM decide que contexto es relevante y lo
entrega como ContextBrief o como topic_key para lectura acotada del
RAG. El sub-agente no navega el repositorio por su cuenta. Seis campos
obligatorios definen el contrato de cada delegacion.

**Que previene:** Sub-agentes con acceso ilimitado que queman tokens
leyendo archivos irrelevantes. Contexto no trazable (sin registro de
que se incluyo y que se excluyo).

## A4: Trazabilidad end-to-end

**Invariante:** El grafo intencion a decision a trabajo a evidencia es
reconstruible para cualquier deliverable.

**Implicacion practica:** El TraceabilityGraph conecta cada pieza de
codigo con la decision que la motivo, los tests que la validan y la
evidencia que la certifica. Si una certificacion se cuestiona, el
grafo permite auditar el camino completo.

**Que previene:** Codigo sin justificacion rastreable. Decisiones de
diseno perdidas. Evidencia desconectada de su origen.

## A5: Planning es distinto de execution

**Invariante:** Planning produce deliverables aprobados; execution los
implementa sin modificarlos.

**Implicacion practica:** Si execution detecta que un deliverable es
ambiguo o insuficiente, emite PlanningGapDetected y devuelve el
control a planning. Execution nunca reescribe un deliverable aprobado.
Las fases de planning se comprimen via FastForward; las gates de
calidad del Kernel se ejecutan integras siempre.

**Que previene:** Agentes que reinterpretan specs durante la
implementacion. Scope creep silencioso. Divergencia entre lo planeado
y lo construido sin registro.

## A6: Host y Store son adapters distintos

**Invariante:** El adapter de host (descubrimiento e invocacion) y el
adapter de store (persistencia y retrieval) son concerns independientes.

**Implicacion practica:** Un mismo host (Claude, GPT, etc.) puede usar
stores distintos (repo-docs, Jira, Confluence). Un mismo store puede
servir hosts diferentes. El Kernel interactua con ambos a traves de
contratos, sin acoplamiento entre ellos.

**Que previene:** Que cambiar de host requiera cambiar de store.
Acoplamiento entre descubrimiento y persistencia. Vendor lock-in.

## A7: Entrega incremental

**Invariante:** El sistema se entrega en slices que aportan valor
verificable de forma independiente.

**Implicacion practica:** Cada slice pasa por el ciclo completo de
planning, ejecucion y certificacion. No se espera a tener "todo
listo" para verificar. Cada iteracion produce un incremento
certificado.

**Que previene:** Big bang releases. Integraciones tardias que revelan
incompatibilidades. Periodos largos sin feedback.

## A8: Control plane separado de ceremonia

**Invariante:** El Kernel impone calidad universal; el Method Pack
define ceremonia.

**Implicacion practica:** Los invariantes de calidad (Echo, R/G/R,
mutation testing, fitness functions) pertenecen al Kernel y aplican
sin excepcion. El Method Pack (Scrum, Kanban, etc.) define cuantos
roles participan, como se itera y que gates ceremoniales se
comprimen. Un Pack puede agregar mecanismos de calidad adicionales
pero nunca reducir el minimo del Kernel.

**Que previene:** Que un Method Pack desactive gates de calidad. Que la
ceremonia sea pretexto para omitir verificacion. Que la calidad
dependa del proceso elegido.

## A9: Dogma separado de RAG operativo

**Invariante:** Los documentos normativos de Virgil (dogma, `docs/`) y
la proyeccion operativa (RAG) son distintos en identidad, ownership y
write policy.

**Implicacion practica:** `Virgil/docs/` es normativo y read-only para
consumidores. `{target}/docs/virgil/` es el namespace gestionado del
proyecto. El RAG es una proyeccion derivada que indexa ambos pero no
es fuente de verdad de ninguno.

**Que previene:** Que un agente modifique el dogma a traves del RAG.
Que la documentacion normativa se mezcle con los deliverables del
proyecto. Confusion de autoridad entre namespaces.

## Relacion entre gobierno y arquitectura

Fuente: `principia/constitution.md`, Seccion 4c.

Gobierno y arquitectura son capas complementarias:

- **Gobierno** (6 principios): define las reglas del juego -- como se
  toman decisiones, como se valida, como se gestiona.
- **Arquitectura** (9 invariantes): define las reglas de construccion
  -- como se estructura el sistema, como fluye la informacion.

Ambas capas confluyen en el Principia y se aplican con igual autoridad
en Modo Desarrollo (Virgil es el objeto) y Modo Consumo (Virgil es la
herramienta). Ninguna capa tiene prioridad sobre la otra; ambas son
necesarias y complementarias.

La separacion es deliberada: un principio de gobierno como GP-4
(constraint sobre confianza) se manifiesta en la arquitectura a traves
de A3 (contexto compilado por contrato) y del invariante de
independencia del compositeAgent. Pero la motivacion (gobierno) y la
realizacion (arquitectura) viven en capas distintas.

---

← Anterior: [Principios de gobierno](./principios-de-gobierno.md) · [↑ architecture](./README.md) · [↑↑ docs](../README.md) · Siguiente: [Componentes](./componentes.md) →
