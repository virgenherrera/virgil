package contracts

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io/fs"
	"reflect"
	"strings"

	virgil "github.com/virgenherrera/virgil"
	"github.com/virgenherrera/virgil/internal/protocol"
)

var fixtureAssets = map[string]struct {
	FixturePath string
	ScriptPath  string
}{
	"t0-init-repo-docs-happy": {
		FixturePath: "docs/slices/01-planning/validation/fixtures/t0/t0-init-repo-docs-happy/fixture.json",
		ScriptPath:  "docs/slices/01-planning/validation/fixtures/t0/t0-init-repo-docs-happy/actor-script.json",
	},
	"t0-init-unmanaged-write-blocked": {
		FixturePath: "docs/slices/01-planning/validation/fixtures/t0/t0-init-unmanaged-write-blocked/fixture.json",
		ScriptPath:  "docs/slices/01-planning/validation/fixtures/t0/t0-init-unmanaged-write-blocked/actor-script.json",
	},
	"t0-init-idempotent-retry": {
		FixturePath: "docs/slices/01-planning/validation/fixtures/t0/t0-init-idempotent-retry/fixture.json",
		ScriptPath:  "docs/slices/01-planning/validation/fixtures/t0/t0-init-idempotent-retry/actor-script.json",
	},
}

var FixtureOrder = []string{
	"t0-init-repo-docs-happy",
	"t0-init-unmanaged-write-blocked",
	"t0-init-idempotent-retry",
}

type Fixture struct {
	Definition protocol.ScenarioFixture
	Script     protocol.ActorScript
}

func (registry *Registry) LoadAllT0Fixtures() (map[string]Fixture, error) {
	if err := verifyDogmaFixture(); err != nil {
		return nil, err
	}

	assets := virgil.CanonicalAssets()
	loaded := make(map[string]Fixture, len(fixtureAssets))
	for _, fixtureID := range FixtureOrder {
		paths := fixtureAssets[fixtureID]
		fixtureRaw, err := fs.ReadFile(assets, paths.FixturePath)
		if err != nil {
			return nil, fmt.Errorf("read fixture %s: %w", fixtureID, err)
		}
		if err := registry.Validate(SchemaScenarioFixture, fixtureRaw); err != nil {
			return nil, fmt.Errorf("fixture %s: %w", fixtureID, err)
		}
		definition, err := protocol.DecodeScenarioFixture(fixtureRaw)
		if err != nil {
			return nil, fmt.Errorf("fixture %s: %w", fixtureID, err)
		}

		scriptRaw, err := fs.ReadFile(assets, paths.ScriptPath)
		if err != nil {
			return nil, fmt.Errorf("read actor script for %s: %w", fixtureID, err)
		}
		if err := registry.Validate(SchemaActorScript, scriptRaw); err != nil {
			return nil, fmt.Errorf("actor script for %s: %w", fixtureID, err)
		}
		script, err := protocol.DecodeActorScript(scriptRaw)
		if err != nil {
			return nil, fmt.Errorf("actor script for %s: %w", fixtureID, err)
		}

		if err := validateFixtureRelations(fixtureID, definition, script, scriptRaw); err != nil {
			return nil, err
		}
		if err := validateFixtureSemantics(definition, script, fixtureRaw); err != nil {
			return nil, fmt.Errorf("fixture %s semantic contract: %w", fixtureID, err)
		}
		loaded[fixtureID] = Fixture{Definition: definition, Script: script}
	}
	return loaded, nil
}

func validateFixtureRelations(fixtureID string, fixture protocol.ScenarioFixture, script protocol.ActorScript, scriptRaw []byte) error {
	if fixture.FixtureID != fixtureID {
		return fmt.Errorf("fixture path identifies %q but document identifies %q", fixtureID, fixture.FixtureID)
	}
	if fixture.Layer != "T0" || fixture.ProtocolVersion != protocol.Version {
		return fmt.Errorf("fixture %s has incompatible layer or protocol", fixtureID)
	}
	wantScriptURI := "fixture://validation/" + fixtureID + "/actor-script.json"
	if fixture.ActorProfile.Script.URI != wantScriptURI {
		return fmt.Errorf("fixture %s references script URI %q, want %q", fixtureID, fixture.ActorProfile.Script.URI, wantScriptURI)
	}
	if fixture.ActorProfile.Script.Revision != script.ScriptRevision {
		return fmt.Errorf("fixture %s script revision does not match ActorScript", fixtureID)
	}
	if fixture.ActorProfile.Script.Digest != digest(scriptRaw) {
		return fmt.Errorf("fixture %s ActorScript digest mismatch", fixtureID)
	}
	if script.ScriptID != "script-"+fixtureID || script.ProtocolVersion != protocol.Version {
		return fmt.Errorf("fixture %s ActorScript identity mismatch", fixtureID)
	}
	if !reflect.DeepEqual(fixture.InitialRequest.Actor, script.Actor) {
		return fmt.Errorf("fixture %s actor differs from ActorScript actor", fixtureID)
	}
	if fixture.InitialRequest.DogmaRef.Source.URI != virgil.FixtureDogmaV1URI ||
		fixture.InitialRequest.DogmaRef.Source.Digest != virgil.FixtureDogmaV1Digest ||
		fixture.InitialRequest.DogmaRef.Digest != virgil.FixtureDogmaV1Digest {
		return fmt.Errorf("fixture %s dogma binding does not match bundled dogma", fixtureID)
	}
	if fixture.TargetRepo.URI != fixture.InitialRequest.ProjectRef.Target.URI {
		return fmt.Errorf("fixture %s target URI mismatch", fixtureID)
	}
	return nil
}

func verifyDogmaFixture() error {
	if digest([]byte(virgil.FixtureDogmaV1)) != virgil.FixtureDogmaV1Digest {
		return fmt.Errorf("bundled dogma bytes do not match canonical digest")
	}
	return nil
}

func digest(raw []byte) string {
	sum := sha256.Sum256(raw)
	return "sha256:" + strings.ToLower(hex.EncodeToString(sum[:]))
}
