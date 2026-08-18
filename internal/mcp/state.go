package mcp

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/virgenherrera/virgil/internal/protocol"
)

// indexFileName is the auto-generated navigation index repodocs.Write
// republishes in docs/ and each of its kind subdirectories after every
// virgil.write. It carries no frontmatter and must be excluded from doc and
// task counts here, mirroring the skip in repodocs' own index scan.
const indexFileName = "README.md"

// ProjectState is the simplified view of the Virgil project at targetRoot,
// derived from virgil.json and the doc files under docs/.
type ProjectState struct {
	Initialized      bool
	ProjectID        string
	TargetRoot       string
	RequirementCount int
	DesignCount      int
	TaskCounts       TaskCounts
}

// TaskCounts tracks the number of tasks by status.
type TaskCounts struct {
	Backlog  int
	Refined  int
	Active   int
	Done     int
	Released int
}

// LoadState reads virgil.json from targetRoot and scans docs/ to derive the
// project state. If virgil.json does not exist the project is not initialized.
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

	state.RequirementCount = countDocFiles(targetRoot, "requirements")
	state.DesignCount = countDocFiles(targetRoot, "design")
	state.TaskCounts = countTasksByStatus(targetRoot)

	return state, nil
}

func countDocFiles(targetRoot, dir string) int {
	dirPath := filepath.Join(targetRoot, "docs", dir)
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return 0
	}
	count := 0
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".md") && entry.Name() != indexFileName {
			count++
		}
	}
	return count
}

func countTasksByStatus(targetRoot string) TaskCounts {
	var counts TaskCounts
	tasksDir := filepath.Join(targetRoot, "docs", "tasks")
	entries, err := os.ReadDir(tasksDir)
	if err != nil {
		return counts
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") || entry.Name() == indexFileName {
			continue
		}
		taskPath := filepath.Join(tasksDir, entry.Name())
		raw, err := os.ReadFile(taskPath)
		if err != nil {
			continue
		}
		fm, err := extractDocFrontmatter(raw)
		if err != nil {
			continue
		}
		switch fm.Status {
		case protocol.TaskStatusBacklog:
			counts.Backlog++
		case protocol.TaskStatusRefined:
			counts.Refined++
		case protocol.TaskStatusActive:
			counts.Active++
		case protocol.TaskStatusDone:
			counts.Done++
		case protocol.TaskStatusReleased:
			counts.Released++
		}
	}
	return counts
}

// extractDocFrontmatter parses the JSON frontmatter from a doc file
// delimited by "<!-- virgil:meta\n" and "\n-->\n\n". Two legacy open markers
// are also accepted, each paired with the legacy close marker
// "\n---\n\n", so documents written before the HTML-comment frontmatter
// migration continue to parse: "---json\n" (pre-rc.7) and "---\n" (rc.7).
// None of the three open markers is a prefix of another, so detection is
// unambiguous.
func extractDocFrontmatter(raw []byte) (protocol.DocFrontmatter, error) {
	const frontmatterOpen = "<!-- virgil:meta\n"
	const frontmatterClose = "\n-->\n\n"
	const frontmatterOpenLegacyJSON = "---json\n" // pre-rc.7
	const frontmatterOpenLegacyYAML = "---\n"     // rc.7 (commit 9fe8805)
	const frontmatterCloseLegacy = "\n---\n\n"

	content := string(raw)
	marker, closer := frontmatterOpen, frontmatterClose
	switch {
	case len(content) >= len(frontmatterOpen) && content[:len(frontmatterOpen)] == frontmatterOpen:
		// marker, closer already set to the current format.
	case len(content) >= len(frontmatterOpenLegacyJSON) && content[:len(frontmatterOpenLegacyJSON)] == frontmatterOpenLegacyJSON:
		marker, closer = frontmatterOpenLegacyJSON, frontmatterCloseLegacy
	case len(content) >= len(frontmatterOpenLegacyYAML) && content[:len(frontmatterOpenLegacyYAML)] == frontmatterOpenLegacyYAML:
		marker, closer = frontmatterOpenLegacyYAML, frontmatterCloseLegacy
	default:
		return protocol.DocFrontmatter{}, fmt.Errorf("missing frontmatter open marker")
	}
	rest := content[len(marker):]
	closeIdx := -1
	for i := 0; i <= len(rest)-len(closer); i++ {
		if rest[i:i+len(closer)] == closer {
			closeIdx = i
			break
		}
	}
	if closeIdx < 0 {
		return protocol.DocFrontmatter{}, fmt.Errorf("missing frontmatter close marker")
	}
	jsonBlock := rest[:closeIdx]

	var fm protocol.DocFrontmatter
	if err := json.Unmarshal([]byte(jsonBlock), &fm); err != nil {
		return protocol.DocFrontmatter{}, fmt.Errorf("decode frontmatter: %w", err)
	}
	return fm, nil
}
