# Ciclo de vida

[← docs/](../README.md)

Esta seccion cubre el flujo temporal de un proyecto gestionado por Virgil: desde que nace una idea hasta que opera en produccion. Aqui se describe como Virgil impone convergencia, gestiona transiciones y recupera estado despues de interrupciones.

## Que encontraras aqui

- Como avanza un proyecto a traves de fases bien definidas
- Que reglas gobiernan cada transicion
- Como se comprime la ceremonia cuando el contexto lo justifica
- Que ocurre internamente en cada invocacion al Kernel
- Como se reconstruye el estado despues de un crash o nueva sesion

## Orden de lectura recomendado

| Orden | Documento | Que cubre |
|-------|-----------|-----------|
| 1 | [Maquina de estados](maquina-de-estados.md) | Fases del proyecto, transiciones, loopback por gaps |
| 2 | [FastForward](fastforward.md) | Compresion de ceremonia segun gradiente de certeza |
| 3 | [Flujo de invocacion](flujo-de-invocacion.md) | Anatomia de cada llamada al Kernel |
| 4 | [Recuperacion](recuperacion.md) | Reconstruccion de estado tras crash o nueva sesion |

Fuente: `principia/constitution.md`, Secciones 3a, 3b, 10.

---

← Anterior: [Getting Started](../getting-started/README.md) · [↑↑ docs](../README.md) · Siguiente: [Ejecucion](../execution/README.md) →
