# Codebase Memory

Grafo estructural determinista del codigo fuente. Complementa al RAG:
el RAG opera sobre deliverables y documentacion (semantico); el
codebaseMemory opera sobre estructura del codigo (AST).

Fuente: `principia/constitution.md`, Seccion 8f.

## Que es

El codebaseMemory es una herramienta que permite a Virgil "ver" el
codigo sin "leerlo". Mapea relaciones entre entidades de codigo
mediante un parser AST determinista, sin embeddings ni vectorizacion.

No es un RAG de codigo. No mete codigo fuente completo en un indice
vectorial. Indexa ESTRUCTURA, no contenido.

## Que indexa

### Entidades

Archivos, modulos, clases, funciones, interfaces, tipos, tests, rutas.
Cada entidad tiene identidad explicita, ubicacion y metadata asociada.

### Relaciones

| Relacion | Ejemplo |
|----------|---------|
| calls | `AuthService.validate()` llama a `TokenStore.get()` |
| imports | `handler.ts` importa `AuthMiddleware` |
| inheritance | `AdminUser` extiende `BaseUser` |
| contains | modulo `auth/` contiene `login.ts`, `register.ts` |
| test-covers | `auth.test.ts` cubre `AuthService` |
| data-flow | `UserDTO` fluye de `controller` a `service` |

### Metadata

Signaturas de funciones, ubicacion en el filesystem y asociacion con
commits. Suficiente para responder queries estructurales sin abrir los
archivos.

## Que excluye

El codebaseMemory se mantiene liviano al excluir:

- **Embeddings de codigo fuente completo:** no vectoriza archivos
- **Chunks vectoriales linea por linea:** no indexa contenido textual
- **Edges ambiguos:** si no hay evidencia estructural suficiente, el
  edge no se registra. Sin edge es mejor que edge dudoso

## Construccion determinista

El grafo se construye por un parser AST determinista, no por
inferencia de un LLM. Esto garantiza:

- **Cobertura determinista** del corpus parseable
- **Velocidad** de indexacion
- **Soundness conservadora** de los edges: una relacion se registra
  solo cuando existe evidencia estructural suficiente

Los edges ambiguos se omiten deliberadamente. Ausencia de edge no
prueba ausencia de una relacion runtime o dinamica; solo indica que no
hay evidencia estructural.

## Actualizacion incremental

La actualizacion no reconstruye el grafo completo en cada cambio:

1. Un file watcher detecta cambios en archivos
2. Compara content hashes para identificar archivos realmente
   modificados
3. Re-parsea SOLO los archivos modificados
4. Actualiza el grafo incrementalmente

## Watermark independiente

El codebaseMemory mantiene su propio watermark, independiente del RAG.
La actualizacion incremental via file watcher actualiza el watermark
automaticamente al commit que disparo el cambio. El invariante de
certificacion (sourceRevision alcanzable desde watermark) aplica a
ambas proyecciones.

## Instancias en lanes paralelos

En escenarios de lanes paralelos de ejecucion, cada mutation domain
aislado mantiene su propia instancia del grafo. Los grafos divergentes
se reconcilian al integrar codigo: la revision integrada dispara
reconstruccion incremental del grafo desde su AST.

No hay grafo compartido entre lanes divergentes. Cada lane tiene
vision precisa de su propio estado.

## Complemento del RAG, no reemplazo

| Aspecto | RAG | codebaseMemory |
|---------|-----|----------------|
| Dominio | Deliverables, documentacion | Codigo fuente |
| Tipo de consulta | Semantica ("que dice el design sobre auth?") | Estructural ("quien llama a esta funcion?") |
| Indexacion | Lexico/vectorial | AST determinista |
| Naturaleza | Proyeccion derivada | Proyeccion derivada |

Ambos comparten la misma visibilidad escalonada: el orquestador ve
todo el grafo; los sub-agentes ven scope acotado via
delegationContract.

## Ejemplos de queries

- "Que funciones dependen de AuthMiddleware?"
- "Que tests cubren el modulo de pagos?"
- "Que se rompe si cambio la interfaz de UserService?"
- "Que archivos importan este tipo?"

Estas consultas se resuelven por navegacion del grafo, sin cargar
codigo fuente en el prompt y sin quemar tokens.

## Documentos relacionados

- [Sistema RAG](./sistema-rag.md) -- complemento semantico del
  codebaseMemory
- [Flujo de contexto](./flujo-de-contexto.md) -- como se compila y
  entrega el contexto de ambas fuentes
