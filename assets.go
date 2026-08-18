package virgil

import (
	"embed"
	"io/fs"
)

const (
	FixtureDogmaV1URI    = "fixture://dogma/virgil/v1"
	FixtureDogmaV1Digest = "sha256:dc7670bf2e78e1a1cfa9f68a770a473b77c760f701fc9a1ce1eeb6d6211cd169"
	FixtureDogmaV1       = "{\"dogma_id\":\"virgil-dogma\",\"method_pack\":\"virgil\",\"version\":\"fixture-v1\"}\n"
)

// canonicalAssets is owned by the module root because go:embed patterns may
// not traverse to parent directories. The schema glob deliberately embeds the
// complete versioned contract set, including evidence payload schemas; these
// are canonical docs assets, not generated or relaxed copies.
//
//go:embed docs/slices/01-planning/schemas/*.json docs/slices/01-planning/validation/fixtures/t0/*/*.json docs/slices/01-planning/validation/fixtures/t0/README.md
var canonicalAssets embed.FS

// CanonicalAssets exposes the embedded contract corpus as a read-only fs.FS.
func CanonicalAssets() fs.FS {
	return canonicalAssets
}

// VirgilConfigSchemaAssetPath is the embedded path of the canonical
// virgil.json JSON Schema. virgil.init materializes its bytes into
// managed_root so editors can resolve virgil.json's $schema pointer without
// network access.
const VirgilConfigSchemaAssetPath = "docs/slices/01-planning/schemas/virgil-config.schema.json"

// VirgilConfigSchema returns the raw bytes of the canonical virgil.json JSON
// Schema, as embedded in canonicalAssets.
func VirgilConfigSchema() ([]byte, error) {
	return fs.ReadFile(canonicalAssets, VirgilConfigSchemaAssetPath)
}
