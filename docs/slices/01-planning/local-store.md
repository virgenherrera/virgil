# Slice 1 — Store local

## Propósito y límites

El store local persiste identidad, revisiones y eventos de Slice 1 fuera del
proyecto objetivo. Es un adapter de filesystem para un solo writer.

No es un RAG, una base de datos ni un coordinador concurrente. No ofrece
búsqueda semántica, transacciones multi-writer, locking ni replicación.

## Identidad y aislamiento

La inicialización recibe referencias explícitas para:

- `method_source`;
- `target`;
- `store_root`;
- `project_id`;
- `change_id` cuando se crea un cambio.

Antes de escribir, el adapter resuelve rutas canónicas, incluidos symlinks, y
aplica estos guards:

1. `method_source != target`;
2. `store_root` no está dentro de `method_source`;
3. `store_root` no está dentro de `target`;
4. el namespace se construye desde `project_id`, no desde el nombre del
   directorio;
5. `change_id` solo es único dentro de su `project_id`.

El self-hosting requiere una autorización explícita fuera del baseline de
Slice 1; no se infiere por igualdad de rutas.

## Layout conceptual

```text
{store_root}/
  projects/
    {project_id}/
      project.json
      events.jsonl
      changes/
        {change_id}/
          change.json
          events.jsonl
          artifacts/
            idea/
              rev-000001/
                envelope.json
                content.md
            spec/
              rev-000001/
                envelope.json
                content.md
            design/
            tasks/
            handoff/
          briefs/
            {brief_id}.json
```

`project.json` y `change.json` fijan identidad y referencias iniciales. El
`events.jsonl` del proyecto registra su inicialización; el de cada cambio
registra su lifecycle. Una actualización significativa se representa mediante
eventos o una revisión nueva, no mediante reescritura silenciosa del historial.

Cada directorio `rev-*` es inmutable después de publicarse. `events.jsonl` es
append-only y registra creación de revisiones, transiciones, aprobaciones,
pivots y decisiones relevantes. Los briefs también son inmutables para poder
auditar qué contexto recibió cada operación.

El layout es un contrato de Slice 1, no el schema definitivo de futuros
adapters.

## Expectativas de escritura atómica

Dentro del supuesto single-agent/single-writer:

1. un proyecto o cambio nuevo se prepara completo en un directorio temporal
   hermano, incluido su evento de creación, y se publica con un rename atómico;
2. una revisión o brief nuevo se escribe primero en un directorio o archivo
   temporal hermano;
3. su contenido y envelope se completan antes de publicarlo;
4. el objeto se publica mediante rename atómico del mismo filesystem;
5. después se agrega un único evento completo a `events.jsonl` que lo incorpora
   al estado derivado;
6. cada evento tiene identidad idempotente para detectar un reintento.

Si hay crash después del rename y antes del evento, la revisión o el brief es
huérfano y recovery lo ignora: solo un evento de creación completo lo incorpora
al estado derivado. Archivos temporales y objetos huérfanos no se promueven
automáticamente.

Una transición se confirma mediante una línea completa en `events.jsonl`. El
adapter debe evitar líneas parciales y reportar error si no puede garantizar
append durable dentro de las capacidades declaradas por el host.

## Concurrencia

Slice 1 admite un solo writer por cambio. Si el RuntimeAdapter detecta otro
writer o no puede garantizar exclusión single-agent, devuelve
`UNSUPPORTED_CAPABILITY` y detiene la operación. No usa last-write-wins y no
simula un lock.

Leases, compare-and-swap y coordinación de writers pertenecen al
[Slice 7](../../roadmap/vertical-slices.md#slice-7--graphrag-y-paralelismo).
