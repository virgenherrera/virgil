# Límites del sistema

## Entidades que no deben confundirse

### Virgil

Virgil es el knowledge/control plane del proyecto. Posee identidad, ledger,
trazabilidad, compilación de `ContextBrief` y aplicación y registro de
transiciones. Estas responsabilidades son metodología-agnósticas.

Virgil no adopta roles ceremoniales. En particular, no finge ser Scrum Master.

### Dogma de Virgil

`Virgil/docs/` contiene el protocolo, los boundaries, Method Packs, quality y
slices canónicos. Un `DogmaRef` fija su source y versión. Para consumidores es
read-only y no recibe artefactos operativos del proyecto.

### Method Pack

Un Method Pack define outcomes, fases, ceremonia, roles, routing y gates para
una metodología. El pack Scrum es el predeterminado inicial. Waterfall, Kanban
y Shape Up son objetivos posteriores.

El Method Pack configura el kernel; no es el proyecto que se construye y no
posee el código del target. Scrum Master, si existe, es un rol opcional del
pack Scrum, no infraestructura core. Otros packs pueden definir roles distintos
o no definir ninguno.

### TargetProject

Es el proyecto que recibe el trabajo: su código, tests, configuración y
entregables, además de su documentación project-specific. Tiene una identidad y
una raíz explícitas. El target conserva sus propias reglas y herramientas.

Cuando se configura `repo-docs`, `{target}/docs/` es el corpus operativo del
consumidor y `{target}/docs/virgil/` es el write namespace recomendado. Ese
árbol no se convierte en dogma de Virgil por compartir el nombre `docs`.

### Run/Change

Es una unidad trazable de intención y trabajo dentro de un TargetProject. Un
run/change tiene identidad propia, baseline, Method Pack fijado para ese scope,
estado y evidencia. Dos cambios del mismo proyecto no comparten estado por
accidente.

### Kernel

El kernel de Virgil aplica contratos e invariantes comunes y conserva las
primitivas del knowledge/control plane. No contiene ceremonia de Scrum, Waterfall,
Kanban o Shape Up; recibe esa política desde el Method Pack.

### HostAdapter

Traduce discovery, activación, invocación y envelopes de Virgil a las
capacidades reales del host. Como mínimo declara si dispone de:

- lectura y escritura de archivos;
- shell;
- control de versiones;
- persistencia durable;
- delegación a otros agentes;
- paralelismo;
- herramientas o conectores externos.

Si falta una capacidad, el adapter DEBE rechazar la operación o usar una
degradación declarada. No debe simular silenciosamente garantías que el host no
ofrece.

### ArtifactStoreAdapter

Traduce las operaciones canónicas de identidad, ledger, artefactos, contexto y
retrieval al store configurado. `repo-docs` es el adapter local predeterminado;
Jira, Confluence, Basecamp, GitHub Projects/Issues u otros sistemas pueden ser
adapters equivalentes.

El kernel no contiene semántica específica de esos productos. Un
`ArtifactStoreRef` fija adapter, versión, ubicación/namespace y policy efectiva.
HostAdapter y ArtifactStoreAdapter son concerns independientes: un mismo host
puede usar stores distintos y un mismo store puede ser usado desde hosts
diferentes.

## Aislamiento

Toda invocación DEBE resolver de forma explícita:

1. el `DogmaRef`, incluidos Method Pack y versión;
2. el `ProjectRef` del TargetProject;
3. el run/change activo;
4. el `ArtifactStoreRef`, su adapter y policy;
5. el HostAdapter y su snapshot de capacidades.

La fuente del método y el target DEBEN ser referencias distintas:

> **`method_source != target`**

Un escenario de self-hosting —Virgil trabajando sobre Virgil— solo puede
habilitarse mediante una decisión explícita y auditable. Nunca se infiere por
estar parado en el repositorio de Virgil. Puede usar un ArtifactStoreAdapter
externo o temporal para evitar mezclar dogma canónico y RAG operativo.

Planning SOLO escribe mediante el ArtifactStoreAdapter configurado:

- con `repo-docs`, el write scope predeterminado queda dentro de
  `{target}/docs/virgil/`;
- `{target}/docs/**` fuera de ese namespace es read-only salvo opt-in explícito
  y acotado;
- código, producto y configuración del target siguen prohibidos;
- con un adapter externo, planning no modifica el working tree.

Execution solo modifica el target autorizado por su `RunContext`. Una policy de
store no amplía permisos de execution ni un permiso de execution amplía el
write scope de planning.

## Flujo de una invocación

```text
solicitud
  -> resolver DogmaRef + ProjectRef + ArtifactStoreRef + RunContext
  -> validar source/target, policies y capacidades
  -> discovery/invocación mediante HostAdapter
  -> consultar a Virgil (knowledge/control plane)
  -> compilar ContextBrief
  -> ejecutar la operación canónica
  -> persistir mediante ArtifactStoreAdapter
  -> ingerir evidencia
  -> registrar transición en el ledger
```

Skills y tools se ejecutan principalmente desde el contexto del repo consumidor,
pero ningún paso sustituye referencias explícitas por “el repo actual”. El cwd
puede ser una selección propuesta por el HostAdapter; no prueba identidad ni
autoriza escrituras.

## Trade-off de portabilidad

Separar HostAdapter y ArtifactStoreAdapter agrega dos negociaciones y una policy
de efectos explícita. A cambio permite combinar hosts y stores sin branches en
el kernel, mantener `repo-docs` como default simple y migrar a un sistema
externo sin reinterpretar el protocolo.
