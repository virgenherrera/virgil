# Arquitectura de Virgil

Vista general del diseno de sistema de Virgil: capas, componentes,
principios e invariantes que gobiernan la construccion.

Fuente: `principia/constitution.md`, Secciones 4a, 4b, 4c, 5, 6b, 6c.

## Orden de lectura

| # | Documento | Que cubre |
|---|-----------|-----------|
| 1 | [Principios de gobierno](./principios-de-gobierno.md) | Los 6 principios (GP-1 a GP-6) que definen las reglas del juego |
| 2 | [Invariantes arquitectonicos](./invariantes-arquitectonicos.md) | Los 9 invariantes (A1 a A9) que definen las reglas de construccion |
| 3 | [Componentes](./componentes.md) | Catalogo de piezas organizadas por capa: Kernel, Adapters, Method Packs |
| 4 | [Modelo de interaccion](./modelo-de-interaccion.md) | Separacion de concerns, independencia Host/Store, invariante fundamental |

## Relacion entre gobierno y arquitectura

Gobierno y arquitectura son capas complementarias que no se mezclan:

- **Gobierno** define las reglas del juego: como se toman decisiones,
  como se valida, como se gestiona.
- **Arquitectura** define las reglas de construccion: como se estructuran
  los componentes, como fluye la informacion, como se acoplan las piezas.

Ambas capas confluyen en el Principia y aplican con igual autoridad en
Modo Desarrollo y Modo Consumo.

## Documentos relacionados

- [Contexto y conocimiento](../context-and-knowledge/README.md) -- como
  Virgil gestiona conocimiento, persistencia y retrieval
- [Ciclo de vida](../lifecycle/README.md) -- maquina de estados y
  transiciones de proyecto
