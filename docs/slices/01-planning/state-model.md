# Slice 1 — Modelo de estado

## Unidad de estado

La única lifecycle persistida por este slice es la de una **revisión de
artefacto**. No se persiste una segunda máquina para “fase”, “completitud” o
“progreso”. La fase actual es una consulta derivada.

Cada cambio usa los tipos requeridos por su Method Pack. Para Scrum en Slice 1
el orden es:

```text
idea -> spec -> design -> tasks -> handoff
```

## Estados

| Estado | Significado |
|---|---|
| `draft` | Revisión creada; cualquier corrección de contenido requiere una revisión sucesora. |
| `awaiting_approval` | El productor la presentó al gate definido por el Method Pack. |
| `approved` | El gate aplicable pasó y Virgil registró la aprobación. |
| `withdrawn` | El draft o pedido de aprobación se abandonó sin borrar historial. |
| `superseded` | Una revisión aprobada posterior la reemplazó. |

`withdrawn` es necesario porque el store es append-only: permite abandonar una
revisión no aprobada sin eliminarla ni dejarla bloqueando el cambio.
`superseded` solo aplica a una revisión que alguna vez fue aprobada.

## Transiciones permitidas

```text
draft -> awaiting_approval
draft -> withdrawn
awaiting_approval -> approved
awaiting_approval -> withdrawn
approved -> superseded
```

Toda transición se persiste como evento. El contenido de una revisión es
inmutable desde que se publica. Una corrección retira la revisión presentada y
crea una sucesora en `draft`; no devuelve ni edita la misma revisión. Los
estados terminales `withdrawn` y `superseded` no tienen salida.

Solo PUEDE existir una revisión abierta (`draft` o `awaiting_approval`) por tipo
de artefacto y cambio. Esta invariante evita dos candidatos simultáneos dentro
del baseline single-writer.

No existen en Slice 1 estados persistidos llamados `phase`, `stale`,
`in_progress`, `complete` o equivalentes.

## Revisión aprobada efectiva

Una revisión `approved` es **efectiva** cuando:

1. no existe una revisión posterior del mismo artefacto en `draft` o
   `awaiting_approval`;
2. no está `superseded` ni `withdrawn`;
3. sus referencias upstream apuntan a las revisiones aprobadas efectivas
   actuales.

“Efectiva” es un predicado de consulta, no un estado persistido adicional.

Cuando una revisión nueva alcanza `approved`, Virgil registra
`approved -> superseded` para la revisión aprobada anterior del mismo
artefacto. Las revisiones downstream que referencian la anterior permanecen
intactas en el historial, pero dejan de satisfacer el predicado de efectividad.

## Derivación de fase

Virgil recorre el orden requerido por el Method Pack y selecciona el primer
tipo sin revisión aprobada efectiva. Ese tipo es el paso actual.

```text
current_step = first(required_artifacts, not has_effective_approved_revision)
```

Si todos tienen una revisión aprobada efectiva, planning está terminado. El
resultado de esta consulta no se guarda como otra máquina de estados.

## Cambios de contenido y revisiones

- Cada modificación produce un identificador de revisión nuevo.
- Una revisión referencia de forma explícita las revisiones upstream que usó.
- Solicitar correcciones a una revisión en `awaiting_approval` la pasa a
  `withdrawn`; el contenido corregido se guarda en una revisión nueva en
  `draft`.
- Aprobar nunca modifica el contenido aprobado.

## Pivot mínimo

Un pivot registra un evento con su razón y el primer tipo de artefacto
afectado. Luego crea una revisión `draft` para ese tipo.

Mientras esa revisión esté abierta, no hay revisión aprobada efectiva para ese
tipo y la fase se deriva allí. Al aprobar su reemplazo:

1. la revisión aprobada anterior pasa a `superseded`;
2. cualquier downstream que referencie la revisión anterior deja de ser
   efectivo por el predicado de referencias;
3. la derivación selecciona el primer downstream que debe revisarse.

Si el pivot se abandona, su revisión pasa a `withdrawn`; la revisión aprobada
anterior puede volver a ser efectiva si sus referencias siguen vigentes.
