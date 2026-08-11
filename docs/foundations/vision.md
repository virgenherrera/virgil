# Visión y fundamentos

## Problema

Un agente puede ejecutar una tarea local y aun así perder el propósito global
del proyecto. El problema contrario también existe: inyectarle todo el
historial, todos los documentos y todo el código aumenta ruido, costo y riesgo
de mezclar decisiones que pertenecen a cambios distintos.

La situación empeora cuando la herramienta metodológica vive cerca del
proyecto que la consume. Si no hay identidades y límites explícitos, el agente
puede tratar la fuente de Virgil como si fuera el producto que debe modificar.

La metodología necesita resolver dos responsabilidades a la vez:

1. Mantener ownership global y continuidad entre sesiones, agentes y fases.
2. Entregar a cada ejecución solo el contexto mínimo suficiente para decidir y
   actuar dentro de su scope.

## Objetivo

Virgil **es la Secretaría Ejecutiva** del proyecto: un knowledge/control plane
agnóstico de host y metodología que mantiene identidad, un registro trazable
del trabajo, briefs de contexto y transiciones. Debe poder acompañar un cambio
desde la idea hasta el handoff, la implementación, la verificación, la entrega
y la operación cuando corresponda.

Virgil no es Scrum Master ni reemplaza los roles de una metodología. Cada
Method Pack posee su ceremonia, sus roles, su routing y sus gates. El pack
Scrum puede definir un Scrum Master opcional; otro pack puede definir otros
roles o ninguno. Virgil aplica esos contratos sin adoptar sus identidades.

La invariante que guía el diseño es:

> **`global ownership != global context injection`**

Ownership global significa conocer qué existe, quién lo posee, en qué estado
está, de dónde proviene y cómo se relaciona. No significa cargar el contenido
completo en cada prompt.

## Principios

### 1. Identidad antes que inferencia

El framework, el proyecto objetivo y el run/change activo DEBEN identificarse
de forma explícita. El directorio actual de la terminal no es suficiente para
inferirlos.

### 2. Autoridad separada de retrieval

Artefactos versionados, ledger y evidencia conservan la autoridad. Índices
léxicos, vectoriales o de grafo son proyecciones reconstruibles para lectura.

### 3. Contexto compilado por contrato

Cada actor recibe un `ContextBrief` derivado de su objetivo, límites,
dependencias y evidencia necesaria. El brief debe explicar qué se incluyó y de
dónde salió.

### 4. Trazabilidad de extremo a extremo

El proyecto debe poder recorrer la intención hasta el resultado entregado y
volver desde una evidencia técnica hacia la decisión que la originó.

### 5. Planning y execution conservan sus responsabilidades

Planning define y aprueba intención, criterios y decisiones. Execution los
implementa y produce evidencia. Si execution descubre un defecto de planning,
NO lo corrige silenciosamente: emite `PlanningGapDetected`.

### 6. El host es un adapter

Un host puede tener un solo agente, subagentes, ejecución paralela, Git,
herramientas remotas o ninguna de esas capacidades. El kernel expresa la
intención; el runtime adapter declara qué puede realizar y cómo degrada.

### 7. Entrega incremental

Cada vertical slice debe ser utilizable de punta a punta antes de agregar el
siguiente. Una abstracción sin un flujo ejecutable que la pruebe permanece en
roadmap, no en el contrato normativo.

### 8. Control plane separado de ceremonia

Virgil posee las primitivas comunes de conocimiento y control. Los Method
Packs poseen la política metodológica. El kernel no contiene roles ni
transiciones con nombres de una ceremonia particular.

## No-objetivos iniciales

Durante los primeros slices Virgil no intenta:

- soportar simultáneamente todos los Method Packs;
- ejecutar múltiples agentes en paralelo;
- implementar GraphRAG;
- imponer una estrategia universal de Git, CI/CD o despliegue;
- definir un catálogo exhaustivo de métricas de calidad;
- reemplazar al producto, al repositorio objetivo o a sus herramientas;
- convertir toda documentación histórica en reglas vigentes.

Estas capacidades pueden incorporarse cuando un slice previo haya establecido
los contratos y la evidencia necesarios.
