# Límites del sistema

## Entidades que no deben confundirse

### Virgil / Secretaría Ejecutiva

Virgil es el knowledge/control plane del proyecto. Posee identidad, ledger,
trazabilidad, compilación de `ContextBrief` y aplicación y registro de
transiciones. Estas responsabilidades son metodología-agnósticas.

Virgil no adopta roles ceremoniales. En particular, no finge ser Scrum Master.

### MethodPack

Un Method Pack define outcomes, fases, ceremonia, roles, routing y gates para
una metodología. El pack Scrum es el predeterminado inicial. Waterfall, Kanban
y Shape Up son objetivos posteriores.

El Method Pack configura el kernel; no es el proyecto que se construye y no
posee el código del target. Scrum Master, si existe, es un rol opcional del
pack Scrum, no infraestructura core. Otros packs pueden definir roles distintos
o no definir ninguno.

### TargetProject

Es el proyecto que recibe el trabajo: su código, tests, configuración y
entregables. Tiene una identidad y una raíz explícitas. El target conserva sus
propias reglas y herramientas.

### Run/Change

Es una unidad trazable de intención y trabajo dentro de un TargetProject. Un
run/change tiene identidad propia, baseline, Method Pack fijado para ese scope,
estado y evidencia. Dos cambios del mismo proyecto no comparten estado por
accidente.

### Kernel

El kernel de Virgil aplica contratos e invariantes comunes y conserva las
primitivas de Secretaría Ejecutiva. No contiene ceremonia de Scrum, Waterfall,
Kanban o Shape Up; recibe esa política desde el Method Pack.

### RuntimeAdapter

Traduce las operaciones del kernel a las capacidades reales del host. Como
mínimo declara si dispone de:

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

## Aislamiento

Toda invocación DEBE resolver de forma explícita:

1. la fuente y versión del Method Pack;
2. el TargetProject;
3. el run/change activo;
4. la ubicación de los registros autoritativos;
5. el RuntimeAdapter y su snapshot de capacidades.

La fuente del método y el target DEBEN ser referencias distintas:

> **`method_source != target`**

Un escenario de self-hosting —Virgil trabajando sobre Virgil— solo puede
habilitarse mediante una decisión explícita y auditable. Nunca se infiere por
estar parado en el repositorio de Virgil.

Planning no escribe código del target. Execution solo modifica el target
autorizado por su `RunContext`. Los registros de proceso viven en el store
configurado; no aparecen en el target por conveniencia del runtime.

## Flujo de una invocación

```text
solicitud
  -> resolver ProjectRef + RunContext
  -> validar source/target y capacidades
  -> consultar a Virgil (Secretaría Ejecutiva)
  -> compilar ContextBrief
  -> ejecutar mediante RuntimeAdapter
  -> ingerir evidencia
  -> registrar transición en el ledger
```

Ningún paso puede sustituir una referencia explícita por “el repo actual” sin
que el adapter lo declare como selección del usuario.

## Trade-off de portabilidad

Un contrato por capacidades agrega una negociación inicial y puede llevar a
flujos secuenciales en hosts limitados. A cambio evita que la metodología
dependa de nombres de tools, prompts, subagentes o mecanismos de filesystem de
un proveedor específico.
