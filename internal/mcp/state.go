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

// ProjectState is the simplified view of the Virgil project at targetRoot,
// derived from virgil.json and the doc files under docs/.
type ProjectState struct {
	Initialized      bool
	ProjectID        string
	TargetRoot       string
	RequirementCount int
	DesignCount      int
	TaskCounts       TaskCounts
	// PlanningComplete is true when the project has at least one task and
	// every task is at status "refined" -- i.e. planning is done and any
	// further action (implementation) requires explicit human authorization.
	PlanningComplete bool
	// Notice carries planningCompleteNotice when PlanningComplete is true,
	// and is empty otherwise.
	Notice string
}

// TaskCounts tracks the number of tasks by status.
type TaskCounts struct {
	Backlog  int
	Refined  int
	Active   int
	Done     int
	Released int
}

// Total returns the total number of tasks across all statuses.
func (tc TaskCounts) Total() int {
	return tc.Backlog + tc.Refined + tc.Active + tc.Done + tc.Released
}

// AllRefined reports whether the project has at least one task and every
// task is at status "refined". This is the planning-complete condition:
// the knowledge base is fully refined and implementation requires explicit
// human authorization before proceeding.
func (tc TaskCounts) AllRefined() bool {
	return tc.Total() > 0 && tc.Refined == tc.Total()
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
	state.PlanningComplete = state.TaskCounts.AllRefined()
	if state.PlanningComplete {
		state.Notice = planningCompleteNotice
	}

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
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".md") {
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
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
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
// delimited by "---json\n" and "\n---\n\n".
func extractDocFrontmatter(raw []byte) (protocol.DocFrontmatter, error) {
	const openMarker = "---json\n"
	const closeMarker = "\n---\n\n"

	content := string(raw)
	if len(content) < len(openMarker) || content[:len(openMarker)] != openMarker {
		return protocol.DocFrontmatter{}, fmt.Errorf("missing frontmatter open marker")
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
		return protocol.DocFrontmatter{}, fmt.Errorf("missing frontmatter close marker")
	}
	jsonBlock := rest[:closeIdx]

	var fm protocol.DocFrontmatter
	if err := json.Unmarshal([]byte(jsonBlock), &fm); err != nil {
		return protocol.DocFrontmatter{}, fmt.Errorf("decode frontmatter: %w", err)
	}
	return fm, nil
}
