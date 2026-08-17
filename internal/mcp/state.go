package mcp

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/virgenherrera/virgil/internal/protocol"
)

// ProjectState is the simplified view of the Virgil project at targetRoot,
// derived from virgil.json and the artifact files under docs/{change_id}/.
type ProjectState struct {
	Initialized  bool
	ProjectID    string
	ActiveChange *ChangeState
	TargetRoot   string
}

// ChangeState captures the active change's identity and pipeline progress.
type ChangeState struct {
	ChangeID    string
	RunID       string
	DerivedStep string // current stage: idea, spec, design, tasks, handoff, complete
	Revision    string // revision of the latest artifact at the current step
}

// LoadState reads virgil.json from targetRoot and derives the project state.
// If virgil.json does not exist the project is not initialized.
func LoadState(targetRoot string) (*ProjectState, error) {
	if !filepath.IsAbs(targetRoot) {
		return nil, fmt.Errorf("target root must be absolute: %s", targetRoot)
	}

	configPath := filepath.Join(targetRoot, protocol.VirgilConfigFile)
	raw, err := os.ReadFile(configPath)
	if errors.Is(err, fs.ErrNotExist) {
		return &ProjectState{
			Initialized: false,
			TargetRoot:  targetRoot,
		}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read virgil.json: %w", err)
	}

	var cfg protocol.VirgilConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("decode virgil.json: %w", err)
	}

	state := &ProjectState{
		Initialized: true,
		ProjectID:   cfg.ProjectID,
		TargetRoot:  targetRoot,
	}

	if cfg.ActiveChange != nil {
		changeState := &ChangeState{
			ChangeID: cfg.ActiveChange.ChangeID,
			RunID:    cfg.ActiveChange.RunID,
		}
		derivedStep, revision := deriveStepFromArtifacts(targetRoot, cfg.ActiveChange.ChangeID)
		changeState.DerivedStep = derivedStep
		changeState.Revision = revision
		state.ActiveChange = changeState
	}

	return state, nil
}

// deriveStepFromArtifacts scans docs/{changeID}/ for numbered artifact files
// and determines the current derived step and the revision of the artifact at
// that step. The derived step is the first step in the pipeline that does not
// have an approved artifact file.
func deriveStepFromArtifacts(targetRoot, changeID string) (string, string) {
	lastRevision := ""
	for _, kind := range protocol.ArtifactStepOrder {
		dirName := protocol.ArtifactDirName(kind)
		filename := protocol.ArtifactFileName(kind)
		if filename == "" {
			return kind, lastRevision
		}
		artifactPath := filepath.Join(targetRoot, "docs", changeID, dirName, filename)
		raw, err := os.ReadFile(artifactPath)
		if err != nil {
			return kind, lastRevision
		}
		frontmatter, err := extractFrontmatter(raw)
		if err != nil {
			return kind, lastRevision
		}
		if frontmatter.Status == "awaiting_approval" {
			return kind, frontmatter.Revision
		}
		if frontmatter.Status != "approved" {
			return kind, lastRevision
		}
		lastRevision = frontmatter.Revision
	}
	return "complete", lastRevision
}

// extractFrontmatter parses the JSON frontmatter from a docs artifact file
// delimited by "---json\n" and "\n---\n\n".
func extractFrontmatter(raw []byte) (protocol.ArtifactFrontmatter, error) {
	const openMarker = "---json\n"
	const closeMarker = "\n---\n\n"

	content := string(raw)
	if len(content) < len(openMarker) || content[:len(openMarker)] != openMarker {
		return protocol.ArtifactFrontmatter{}, fmt.Errorf("missing frontmatter open marker")
	}
	rest := content[len(openMarker):]
	closeIdx := -1
	for i := 0; i <= len(rest)-len(closeMarker); i++ {
		if rest[i:i+len(closeMarker)] == closeMarker {
			closeIdx = i
			break
		}
	}
	if closeIdx < 0 {
		return protocol.ArtifactFrontmatter{}, fmt.Errorf("missing frontmatter close marker")
	}
	jsonBlock := rest[:closeIdx]

	var fm protocol.ArtifactFrontmatter
	if err := json.Unmarshal([]byte(jsonBlock), &fm); err != nil {
		return protocol.ArtifactFrontmatter{}, fmt.Errorf("decode frontmatter: %w", err)
	}
	return fm, nil
}
