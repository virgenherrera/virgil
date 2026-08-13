# Virgil Quickstart — Prueba manual en 5 minutos

## 1. Compilar el binario

```bash
cd ~/projects/ai/virgil
docker run --rm -v "$(pwd)":/app -w /app golang:1.26.5 \
  sh -c 'GOOS=darwin GOARCH=arm64 go build -o /app/virgil-bin ./cmd/virgil'
cp virgil-bin /tmp/virgil && rm virgil-bin
```

Verifica: `file /tmp/virgil` debe decir `Mach-O 64-bit executable arm64`.

## 2. Preparar el directorio target

```bash
rm -rf ~/projects/challenge-a/{docs,seed,virgil.json,AGENTS.md}
cd ~/projects/challenge-a
```

Si no existe:

```bash
mkdir -p ~/projects/challenge-a && cd ~/projects/challenge-a && git init
```

## 3. Crear un seed file

```bash
mkdir -p seed/mi-feature
cat > seed/mi-feature/idea-proposal.md << 'SEED'
# Mi Primera Feature

Quiero construir un endpoint que diga "Hola Mundo" en JSON.

## Motivacion

Aprender como funciona Virgil.
SEED
```

## 4. Invocar virgil.init

Copia y pega este bloque completo en tu terminal:

```bash
echo '{
  "runtime_protocol": "virgil.dev/runtime/v1alpha1",
  "kind": "invoke",
  "process_id": "manual-001",
  "request": {
    "protocol_version": "virgil.dev/planning-slice1/v1alpha1",
    "operation": "virgil.init",
    "request_id": "req-init-001",
    "idempotency_key": "idem-init-001",
    "dogma_ref": {
      "dogma_id": "virgil-dogma",
      "version": "fixture-v1",
      "digest": "sha256:dc7670bf2e78e1a1cfa9f68a770a473b77c760f701fc9a1ce1eeb6d6211cd169",
      "source": {
        "uri": "fixture://dogma/virgil/v1",
        "digest": "sha256:dc7670bf2e78e1a1cfa9f68a770a473b77c760f701fc9a1ce1eeb6d6211cd169"
      },
      "method_pack": {"pack_id": "virgil", "pack_version": "fixture-v1"}
    },
    "project_ref": {
      "project_id": "challenge-a",
      "target": {"uri": "'"$(pwd)"'", "baseline": "none"},
      "dogma_ref_id": "virgil-dogma",
      "artifact_store_ref_id": "store-challenge-a"
    },
    "artifact_store_ref": {
      "store_ref_id": "store-challenge-a",
      "adapter": {"adapter_id": "repo-docs", "adapter_version": "v1alpha1"},
      "project_id": "challenge-a",
      "namespace": "docs",
      "policy": {
        "policy_version": "repo-docs/v1alpha1",
        "read_allowlist": ["docs/**"],
        "write_allowlist": ["docs/**"]
      }
    },
    "host": {
      "adapter": {"adapter_id": "generic-host", "adapter_version": "v1alpha1"},
      "capabilities": {"supported": ["operation.invoke", "effect.observe"]}
    },
    "actor": {
      "actor_id": "hugo",
      "kind": "human",
      "authority": ["virgil.operation.invoke"]
    },
    "input": {"project_id": "challenge-a"}
  },
  "bindings": {
    "target": {"uri": "'"$(pwd)"'", "root": "'"$(pwd)"'"},
    "resources": [{
      "uri": "fixture://dogma/virgil/v1",
      "content": "{\"dogma_id\":\"virgil-dogma\",\"method_pack\":\"virgil\",\"version\":\"fixture-v1\"}\n",
      "digest": "sha256:dc7670bf2e78e1a1cfa9f68a770a473b77c760f701fc9a1ce1eeb6d6211cd169"
    }]
  },
  "clock": {"now": "2026-08-13T10:00:00Z"}
}' | /tmp/virgil
```

Espera `"status": "success"`. Verifica:

```bash
ls -la virgil.json AGENTS.md
```

## 5. Invocar virgil.new

```bash
echo '{
  "runtime_protocol": "virgil.dev/runtime/v1alpha1",
  "kind": "invoke",
  "process_id": "manual-002",
  "request": {
    "protocol_version": "virgil.dev/planning-slice1/v1alpha1",
    "operation": "virgil.new",
    "request_id": "req-new-001",
    "idempotency_key": "idem-new-001",
    "dogma_ref": {
      "dogma_id": "virgil-dogma",
      "version": "fixture-v1",
      "digest": "sha256:dc7670bf2e78e1a1cfa9f68a770a473b77c760f701fc9a1ce1eeb6d6211cd169",
      "source": {
        "uri": "fixture://dogma/virgil/v1",
        "digest": "sha256:dc7670bf2e78e1a1cfa9f68a770a473b77c760f701fc9a1ce1eeb6d6211cd169"
      },
      "method_pack": {"pack_id": "virgil", "pack_version": "fixture-v1"}
    },
    "project_ref": {
      "project_id": "challenge-a",
      "target": {"uri": "'"$(pwd)"'", "baseline": "none"},
      "dogma_ref_id": "virgil-dogma",
      "artifact_store_ref_id": "store-challenge-a"
    },
    "artifact_store_ref": {
      "store_ref_id": "store-challenge-a",
      "adapter": {"adapter_id": "repo-docs", "adapter_version": "v1alpha1"},
      "project_id": "challenge-a",
      "namespace": "docs",
      "policy": {
        "policy_version": "repo-docs/v1alpha1",
        "read_allowlist": ["docs/**"],
        "write_allowlist": ["docs/**"]
      }
    },
    "host": {
      "adapter": {"adapter_id": "generic-host", "adapter_version": "v1alpha1"},
      "capabilities": {"supported": ["operation.invoke", "effect.observe"]}
    },
    "actor": {
      "actor_id": "hugo",
      "kind": "human",
      "authority": ["virgil.operation.invoke"]
    },
    "input": {
      "change_id": "mi-feature",
      "intent": "Endpoint hola mundo para aprender Virgil",
      "provenance": {"kind": "human_input", "captured_at": "2026-08-13T10:01:00Z"}
    }
  },
  "bindings": {
    "target": {"uri": "'"$(pwd)"'", "root": "'"$(pwd)"'"},
    "resources": [{
      "uri": "fixture://dogma/virgil/v1",
      "content": "{\"dogma_id\":\"virgil-dogma\",\"method_pack\":\"virgil\",\"version\":\"fixture-v1\"}\n",
      "digest": "sha256:dc7670bf2e78e1a1cfa9f68a770a473b77c760f701fc9a1ce1eeb6d6211cd169"
    }]
  },
  "clock": {"now": "2026-08-13T10:01:00Z"}
}' | /tmp/virgil
```

Del JSON de respuesta, copia el bloque `resolved_context.run_ref`. Lo necesitas para los siguientes pasos. Se ve algo asi:

```json
"run_ref": {
  "run_id": "run-XXXXXXXX",
  "project_id": "challenge-a",
  "change_id": "mi-feature",
  "baseline": "none"
}
```

## 6. Proponer la idea (content_proposal)

Reemplaza `RUN_ID_AQUI` con el `run_id` del paso anterior:

```bash
echo '{
  "runtime_protocol": "virgil.dev/runtime/v1alpha1",
  "kind": "invoke",
  "process_id": "manual-003",
  "request": {
    "protocol_version": "virgil.dev/planning-slice1/v1alpha1",
    "operation": "virgil.continue",
    "request_id": "req-propose-idea",
    "idempotency_key": "idem-propose-idea",
    "run_ref": {
      "run_id": "RUN_ID_AQUI",
      "project_id": "challenge-a",
      "change_id": "mi-feature",
      "baseline": "none"
    },
    "dogma_ref": {
      "dogma_id": "virgil-dogma",
      "version": "fixture-v1",
      "digest": "sha256:dc7670bf2e78e1a1cfa9f68a770a473b77c760f701fc9a1ce1eeb6d6211cd169",
      "source": {
        "uri": "fixture://dogma/virgil/v1",
        "digest": "sha256:dc7670bf2e78e1a1cfa9f68a770a473b77c760f701fc9a1ce1eeb6d6211cd169"
      },
      "method_pack": {"pack_id": "virgil", "pack_version": "fixture-v1"}
    },
    "project_ref": {
      "project_id": "challenge-a",
      "target": {"uri": "'"$(pwd)"'", "baseline": "none"},
      "dogma_ref_id": "virgil-dogma",
      "artifact_store_ref_id": "store-challenge-a"
    },
    "artifact_store_ref": {
      "store_ref_id": "store-challenge-a",
      "adapter": {"adapter_id": "repo-docs", "adapter_version": "v1alpha1"},
      "project_id": "challenge-a",
      "namespace": "docs",
      "policy": {
        "policy_version": "repo-docs/v1alpha1",
        "read_allowlist": ["docs/**"],
        "write_allowlist": ["docs/**"]
      }
    },
    "host": {
      "adapter": {"adapter_id": "generic-host", "adapter_version": "v1alpha1"},
      "capabilities": {"supported": ["operation.invoke", "effect.observe"]}
    },
    "actor": {
      "actor_id": "hugo",
      "kind": "human",
      "authority": ["virgil.operation.invoke"]
    },
    "input": {
      "change_id": "mi-feature",
      "entry": {
        "kind": "content_proposal",
        "artifact_kind": "idea",
        "content": {"uri": "seed/mi-feature/idea-proposal.md"}
      }
    }
  },
  "bindings": {
    "target": {"uri": "'"$(pwd)"'", "root": "'"$(pwd)"'"},
    "resources": [{
      "uri": "fixture://dogma/virgil/v1",
      "content": "{\"dogma_id\":\"virgil-dogma\",\"method_pack\":\"virgil\",\"version\":\"fixture-v1\"}\n",
      "digest": "sha256:dc7670bf2e78e1a1cfa9f68a770a473b77c760f701fc9a1ce1eeb6d6211cd169"
    }]
  },
  "clock": {"now": "2026-08-13T10:02:00Z"}
}' | /tmp/virgil
```

Verifica: `"derived_step": "idea"` y `docs/mi-feature/00-idea.md` existe con `"status": "awaiting_approval"`.

## 7. Aprobar la idea

```bash
echo '{
  "runtime_protocol": "virgil.dev/runtime/v1alpha1",
  "kind": "invoke",
  "process_id": "manual-004",
  "request": {
    "protocol_version": "virgil.dev/planning-slice1/v1alpha1",
    "operation": "virgil.continue",
    "request_id": "req-approve-idea",
    "idempotency_key": "idem-approve-idea",
    "run_ref": {
      "run_id": "RUN_ID_AQUI",
      "project_id": "challenge-a",
      "change_id": "mi-feature",
      "baseline": "none"
    },
    "dogma_ref": {
      "dogma_id": "virgil-dogma",
      "version": "fixture-v1",
      "digest": "sha256:dc7670bf2e78e1a1cfa9f68a770a473b77c760f701fc9a1ce1eeb6d6211cd169",
      "source": {
        "uri": "fixture://dogma/virgil/v1",
        "digest": "sha256:dc7670bf2e78e1a1cfa9f68a770a473b77c760f701fc9a1ce1eeb6d6211cd169"
      },
      "method_pack": {"pack_id": "virgil", "pack_version": "fixture-v1"}
    },
    "project_ref": {
      "project_id": "challenge-a",
      "target": {"uri": "'"$(pwd)"'", "baseline": "none"},
      "dogma_ref_id": "virgil-dogma",
      "artifact_store_ref_id": "store-challenge-a"
    },
    "artifact_store_ref": {
      "store_ref_id": "store-challenge-a",
      "adapter": {"adapter_id": "repo-docs", "adapter_version": "v1alpha1"},
      "project_id": "challenge-a",
      "namespace": "docs",
      "policy": {
        "policy_version": "repo-docs/v1alpha1",
        "read_allowlist": ["docs/**"],
        "write_allowlist": ["docs/**"]
      }
    },
    "host": {
      "adapter": {"adapter_id": "generic-host", "adapter_version": "v1alpha1"},
      "capabilities": {"supported": ["operation.invoke", "effect.observe"]}
    },
    "actor": {
      "actor_id": "hugo",
      "kind": "human",
      "authority": ["virgil.operation.invoke"]
    },
    "input": {
      "change_id": "mi-feature",
      "entry": {
        "kind": "approval",
        "artifact_id": "idea",
        "revision": "rev-000001",
        "decision": "approved",
        "rationale": "La idea esta clara, adelante"
      }
    }
  },
  "bindings": {
    "target": {"uri": "'"$(pwd)"'", "root": "'"$(pwd)"'"},
    "resources": [{
      "uri": "fixture://dogma/virgil/v1",
      "content": "{\"dogma_id\":\"virgil-dogma\",\"method_pack\":\"virgil\",\"version\":\"fixture-v1\"}\n",
      "digest": "sha256:dc7670bf2e78e1a1cfa9f68a770a473b77c760f701fc9a1ce1eeb6d6211cd169"
    }]
  },
  "clock": {"now": "2026-08-13T10:03:00Z"}
}' | /tmp/virgil
```

Verifica: `"derived_step": "spec"` (avanza al siguiente paso).

## 8. Repetir para spec, design, tasks, handoff

Para cada paso restante, repite el patron de los pasos 6 y 7:

1. Crea el seed file: `seed/mi-feature/{kind}-proposal.md`
2. Envia `content_proposal` con `"artifact_kind": "{kind}"`
3. Envia `approval` con `"artifact_id": "{kind}"`

Los kinds en orden: `spec`, `design`, `tasks`, `handoff`.

Recuerda:
- Incrementa `request_id`, `idempotency_key`, `process_id` y `clock.now` en cada llamada
- Usa siempre el mismo `run_id` del paso 5
- `derived_step` avanza: idea -> spec -> design -> tasks -> handoff -> complete

## 9. Verificar el resultado

Despues de aprobar handoff:

```bash
# Ver el arbol
find docs/mi-feature -type f | sort

# Ver frontmatter de la idea
head -20 docs/mi-feature/00-idea.md

# Ver virgil.json (active_change debe ser null)
cat virgil.json | python3 -m json.tool

# Ver AGENTS.md
head -10 AGENTS.md
```

## Troubleshooting

| Error | Causa | Solucion |
|-------|-------|----------|
| `PRECONDITION_FAILED: project is not initialized` | No ejecutaste `virgil.init` | Ejecuta el paso 4 |
| `STORE_POLICY_VIOLATION: namespace is outside...` | `write_allowlist` tiene mas de `["docs/**"]` | Usa exactamente `["docs/**"]` |
| `IDENTITY_AMBIGUOUS: run_ref does not match...` | `run_id` incorrecto en continue | Copia el `run_id` del response de `virgil.new` |
| `PRECONDITION_FAILED: a different change is already active` | Ya hay un change activo sin completar | Completa el change actual o usa otro target |
| `PRECONDITION_FAILED: no revision is awaiting approval` | Intentas aprobar sin proponer primero | Envia `content_proposal` antes de `approval` |

## Referencia rapida

```
virgil.init  -->  virgil.new  -->  virgil.continue (x10: 5 propose + 5 approve)
                                         |
                                   derived_step avanza:
                                   idea -> spec -> design -> tasks -> handoff -> complete
```
