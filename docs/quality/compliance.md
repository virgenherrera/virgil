# complianceByDesign

Si cada test aserta la forma exacta del DTO (campos presentes, campos ausentes,
tipos), se obtiene verificacion de compliance sin suites separadas. Compliance no
es un proyecto adicional: es un efecto secundario del diseno correcto.

Fuente: `principia/constitution.md`, Seccion 7g.

## Tres mecanismos, un efecto

complianceByDesign combina tres practicas de testing que, juntas, producen compliance
como resultado emergente:

| Mecanismo | Que hace |
|-----------|----------|
| **Aserciones estrictas de DTO** | Verifican la forma completa del DTO: campos presentes, ausentes, tipos exactos |
| **abuseCases** | Testing adversarial: inyeccion, acceso no autorizado, datos malformados |
| **Validacion estructural** | Schemas, hashing, encryption, accesibilidad (A11y) |

Ninguno de estos mecanismos es especifico de compliance. Son buenas practicas de
testing que, al combinarse, cubren los controles tecnicos que los frameworks
regulatorios exigen.

## Alcance: solo controles tecnicos de datos

complianceByDesign cubre exclusivamente la capa de controles tecnicos de datos:

- Minimizacion de datos (campos presentes vs ausentes en DTOs)
- Control de acceso por campo (que datos ve cada rol)
- Validacion de forma (schemas, tipos, limites)

Los frameworks regulatorios cubiertos a nivel de capa de datos son:

| Framework | Que cubre complianceByDesign |
|-----------|------------------------------|
| **HIPAA** | Controles tecnicos de datos de salud |
| **PCI DSS** | Controles tecnicos de datos de pago |
| **GDPR** | Controles tecnicos de datos personales |

### Lo que NO cubre

complianceByDesign no es un framework de compliance. No cubre:

- Controles organizacionales
- Controles fisicos
- Controles legales
- Controles procedimentales
- Segregacion de responsabilidades

Estos controles requieren procesos fuera del alcance de Virgil.

## Review humano: activacion automatica con perfil regulatorio

Cuando el proyecto declara un perfil de compliance regulatoria (HIPAA, PCI DSS,
GDPR), el comportamiento de las [QA Gates](qa-gates.md) cambia:

| Contexto | Review humano | Blocking |
|----------|--------------|----------|
| Sin perfil regulatorio | Opcional, no-blocking | No |
| Con perfil regulatorio | **Obligatorio** | **Si** |

El scope del review humano blocking cubre logica de autorizacion y modelado de
dominio. La activacion es automatica e incondicional una vez declarado el perfil.
No es opt-in.

Lo delegable es la declaracion del perfil regulatorio del proyecto, no la activacion
del gate de review. El MIM declara el perfil. A partir de ahi, el Method Pack activa
review humano como gate blocking sin que nadie pueda desactivarlo.

## Principio de diseno, no framework

complianceByDesign es un principio de diseno: si asiertas estrictamente la forma de
tus datos en cada test, los controles tecnicos de compliance se verifican como efecto
secundario. No necesitas una suite de compliance separada si tus tests ya verifican
que cada DTO tiene exactamente los campos que debe tener, nada mas y nada menos.

## Documentos relacionados

- [QA Gates](qa-gates.md) -- donde el review humano se vuelve gate blocking
- [Testing Matrix](matriz-de-testing.md) -- el tier App/Servicio donde viven estas aserciones
- [droppableCode](droppable-code.md) -- cobertura como detector de codigo no justificado
