package contracts

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"net/url"
	"path"
	"strings"

	"github.com/santhosh-tekuri/jsonschema/v6"
	virgil "github.com/virgenherrera/virgil"
)

const schemaBase = "https://schemas.virgil.dev/planning-slice1/v1alpha1/"

const (
	SchemaActorScript           = schemaBase + "actor-script.schema.json"
	SchemaAgentInteractionTrace = schemaBase + "agent-interaction-trace.schema.json"
	SchemaDocFrontmatter        = schemaBase + "doc-frontmatter.schema.json"
	SchemaCommon                = schemaBase + "common.schema.json"
	SchemaContextBrief          = schemaBase + "context-brief.schema.json"
	SchemaEffectRecord          = schemaBase + "effect-record.schema.json"
	SchemaEvidenceBundle        = schemaBase + "evidence-bundle.schema.json"
	SchemaFilesystemDiff        = schemaBase + "filesystem-diff.schema.json"
	SchemaFilesystemSnapshot    = schemaBase + "filesystem-snapshot.schema.json"
	SchemaOperationRequest      = schemaBase + "operation-request.schema.json"
	SchemaOperationResult       = schemaBase + "operation-result.schema.json"
	SchemaRunnerObservation     = schemaBase + "runner-observation-report.schema.json"
	SchemaScenarioFixture       = schemaBase + "scenario-fixture.schema.json"
	SchemaVirgilConfig          = schemaBase + "virgil-config.schema.json"
)

var schemaAssets = map[string]string{
	SchemaActorScript:           "docs/slices/01-planning/schemas/actor-script.schema.json",
	SchemaAgentInteractionTrace: "docs/slices/01-planning/schemas/agent-interaction-trace.schema.json",
	SchemaDocFrontmatter:        "docs/slices/01-planning/schemas/doc-frontmatter.schema.json",
	SchemaCommon:                "docs/slices/01-planning/schemas/common.schema.json",
	SchemaContextBrief:          "docs/slices/01-planning/schemas/context-brief.schema.json",
	SchemaEffectRecord:          "docs/slices/01-planning/schemas/effect-record.schema.json",
	SchemaEvidenceBundle:        "docs/slices/01-planning/schemas/evidence-bundle.schema.json",
	SchemaFilesystemDiff:        "docs/slices/01-planning/schemas/filesystem-diff.schema.json",
	SchemaFilesystemSnapshot:    "docs/slices/01-planning/schemas/filesystem-snapshot.schema.json",
	SchemaOperationRequest:      "docs/slices/01-planning/schemas/operation-request.schema.json",
	SchemaOperationResult:       "docs/slices/01-planning/schemas/operation-result.schema.json",
	SchemaRunnerObservation:     "docs/slices/01-planning/schemas/runner-observation-report.schema.json",
	SchemaScenarioFixture:       "docs/slices/01-planning/schemas/scenario-fixture.schema.json",
	SchemaVirgilConfig:          "docs/slices/01-planning/schemas/virgil-config.schema.json",
}

type Registry struct {
	schemas map[string]*jsonschema.Schema
}

type rejectExternalLoader struct{}

func (rejectExternalLoader) Load(schemaURL string) (any, error) {
	return nil, fmt.Errorf("external schema loading is disabled: %q is not bundled", schemaURL)
}

func NewRegistry() (*Registry, error) {
	assets := virgil.CanonicalAssets()
	rawSchemas := make(map[string][]byte, len(schemaAssets))
	parsedSchemas := make(map[string]any, len(schemaAssets))

	for expectedID, assetPath := range schemaAssets {
		raw, err := fs.ReadFile(assets, assetPath)
		if err != nil {
			return nil, fmt.Errorf("read bundled schema %s: %w", assetPath, err)
		}
		var document any
		if err := json.Unmarshal(raw, &document); err != nil {
			return nil, fmt.Errorf("parse bundled schema %s: %w", assetPath, err)
		}
		object, ok := document.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("bundled schema %s is not an object", assetPath)
		}
		actualID, _ := object["$id"].(string)
		if actualID != expectedID {
			return nil, fmt.Errorf("bundled schema %s has $id %q, want %q", assetPath, actualID, expectedID)
		}
		rawSchemas[expectedID] = raw
		parsedSchemas[expectedID] = document
	}

	if err := validateBundledReferenceClosure(parsedSchemas); err != nil {
		return nil, err
	}

	compiler := jsonschema.NewCompiler()
	compiler.UseLoader(rejectExternalLoader{})
	compiler.AssertFormat()
	for schemaID := range rawSchemas {
		if err := compiler.AddResource(schemaID, parsedSchemas[schemaID]); err != nil {
			return nil, fmt.Errorf("register bundled schema %s: %w", schemaID, err)
		}
	}

	compiled := make(map[string]*jsonschema.Schema, len(rawSchemas))
	for schemaID := range rawSchemas {
		schema, err := compiler.Compile(schemaID)
		if err != nil {
			return nil, fmt.Errorf("compile bundled schema %s: %w", schemaID, err)
		}
		compiled[schemaID] = schema
	}
	return &Registry{schemas: compiled}, nil
}

func (registry *Registry) Validate(schemaID string, raw []byte) error {
	schema, ok := registry.schemas[schemaID]
	if !ok {
		return fmt.Errorf("schema %q is not bundled", schemaID)
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return fmt.Errorf("decode instance for %s: %w", schemaID, err)
	}
	if err := schema.Validate(value); err != nil {
		return fmt.Errorf("validate instance against %s: %w", schemaID, err)
	}
	return nil
}

func validateBundledReferenceClosure(documents map[string]any) error {
	for schemaID, document := range documents {
		if err := walkReferences(schemaID, document, documents); err != nil {
			return fmt.Errorf("schema %s violates bundled-only resolution: %w", schemaID, err)
		}
	}
	return nil
}

func walkReferences(baseID string, node any, documents map[string]any) error {
	switch value := node.(type) {
	case map[string]any:
		for key, child := range value {
			if key == "$ref" || key == "$dynamicRef" {
				ref, ok := child.(string)
				if !ok {
					return fmt.Errorf("%s is not a string", key)
				}
				resolved, err := resolveReference(baseID, ref)
				if err != nil {
					return err
				}
				if _, bundled := documents[resolved]; !bundled {
					return fmt.Errorf("reference %q resolves outside bundle to %q", ref, resolved)
				}
			}
			if err := walkReferences(baseID, child, documents); err != nil {
				return err
			}
		}
	case []any:
		for _, child := range value {
			if err := walkReferences(baseID, child, documents); err != nil {
				return err
			}
		}
	}
	return nil
}

func resolveReference(baseID, reference string) (string, error) {
	base, err := url.Parse(baseID)
	if err != nil {
		return "", fmt.Errorf("parse base $id %q: %w", baseID, err)
	}
	ref, err := url.Parse(reference)
	if err != nil {
		return "", fmt.Errorf("parse reference %q: %w", reference, err)
	}
	resolved := base.ResolveReference(ref)
	resolved.Fragment = ""
	resolved.RawFragment = ""
	if resolved.Scheme != "https" || resolved.Host != "schemas.virgil.dev" {
		return "", fmt.Errorf("reference %q uses non-bundled origin", reference)
	}
	resolved.Path = path.Clean(resolved.Path)
	if !strings.HasPrefix(resolved.Path, "/planning-slice1/v1alpha1/") {
		return "", fmt.Errorf("reference %q escapes schema namespace", reference)
	}
	return resolved.String(), nil
}
