# QA Gates

La certificacion en Virgil combina gates mecanicas deterministas y verificacion
estructurada de alineacion arquitectonica. Las gates mecanicas son binarias: pasan
o no pasan. La verificacion mecanica es el mecanismo primario; el review humano
es condicional.

Fuente: `principia/constitution.md`, Secciones 7e y 11d.

## Pipeline de certificacion

Las gates se ejecutan en secuencia. Cada una debe pasar antes de avanzar a la
siguiente:

| Orden | Gate | Que verifica | Tipo |
|-------|------|-------------|------|
| 1 | **Echo completo** | Los 5 pasos del Echo System pasaron (green) | Mecanica |
| 2 | **Verificacion funcional** | Cada AC tiene un test que pasa | Mecanica |
| 3 | **Verificacion de contratos** | APIs, schemas e interfaces respetan definiciones | Mecanica |
| 4 | **Coverage gate** | Sin regresion de cobertura, nuevo codigo cubierto | Mecanica |
| 5 | **Metricas de calidad** | Mutation score, CRAP, complejidad, dependencias | Mecanica |
| 6 | **Seguridad** | Scanners reportan cero vulnerabilidades criticas | Mecanica |
| 7 | **ARCH** | Implementacion conforme a design.md | Estructurada |

Si todas las gates pasan: **CERTIFICADO**. Si alguna falla: **ESCALAR** a la fase
correspondiente.

## Metricas de calidad (gate 5)

La gate de metricas evalua multiples dimensiones:

### Mutation testing

Mide la fortaleza real de los tests. Si mutar el codigo no rompe ningun test, el
test no protege lo que dice proteger. El mutation score tiene un umbral minimo
definido por el dogma.

El MIM puede autorizar excepciones documentadas para codigo donde mutation testing
es computacionalmente prohibitivo (test suites de integracion pesada, codigo generado,
adapters de terceros). Cada excepcion requiere tag explicito, justificacion y revision
periodica. Los umbrales de mutation score son no-relajables para el codigo no
exceptuado.

### CRAP score

Change Risk Anti-Patterns: combina complejidad y cobertura para evaluar el riesgo
de modificar una funcion. Un CRAP score alto indica codigo riesgoso de cambiar.

### Complejidad ciclomatica

Funciones simples, con paths de ejecucion limitados. El umbral lo define el dogma
por tier (strict, standard, relaxed).

### Estructura de dependencias

Cero ciclos en el grafo de dependencias. Los ciclos crean acoplamiento que impide
testing aislado.

### Tamano de modulo

LOC acotado por modulo. Modulos grandes son candidatos a descomposicion.

## Verificacion estructurada: ARCH (gate 7)

La gate ARCH valida que la implementacion esta alineada con `design.md`. A diferencia
de las gates mecanicas, esta utiliza comparacion semantica documentada y trazable.

La gate ARCH involucra juicio del agente orquestador: no es determinista (Principia
S3b). Utiliza comparacion semantica documentada y trazable entre las decisiones de
diseno y la implementacion real. Es una verificacion estructurada, no una gate
mecanica binaria como test pass/fail.

## Review humano: opcional por defecto, blocking con compliance

El review humano no forma parte del pipeline de certificacion por defecto:

| Contexto | Review humano | Blocking |
|----------|--------------|----------|
| Proyecto sin perfil regulatorio | Opcional, no-blocking | No |
| Proyecto con perfil de compliance (HIPAA, PCI DSS, GDPR) | Obligatorio | Si |

Cuando el proyecto declara un perfil de compliance regulatoria, el Method Pack
activa automaticamente review humano como gate blocking adicional sobre logica
de autorizacion y modelado de dominio. Esta activacion es automatica, no opt-in.
Consulta [complianceByDesign](compliance.md) para detalles.

## El PDC no es parte de la certificacion

El Post-Delegation Checkpoint (PDC) opera durante la ejecucion como safeguard de
coherencia. Puede detener una delegacion incoherente, pero no certifica ni aprueba
codigo. La certificacion la determinan exclusivamente las gates de este pipeline.

## Escalacion especifica

Cuando una gate falla, el rechazo identifica la fase exacta que debe corregirse:

| Tipo de gap | Que fallo | Re-delegar a |
|-------------|----------|--------------|
| Codigo no satisface test | Implementacion incompleta | Green |
| Suite de tests incompleta | Tests faltantes | Red |
| Contrato violado | Interfaz rota | prePhase |
| Diseno no reflejado en codigo | Arquitectura divergente | Refactor |
| Feature faltante en planning | Deliverable insuficiente | Planning |

## Documentos relacionados

- [Echo System](echo-system.md) -- gate 1: los 5 pasos deben pasar
- [Binding Layer](binding-layer.md) -- nivel de confianza que alimenta las gates
- [Red/Green/Refactor](red-green-refactor.md) -- V1 es la gate final del ciclo
- [complianceByDesign](compliance.md) -- cuando el review humano se vuelve blocking
