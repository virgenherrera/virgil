package skills

import (
	"fmt"
	"io/fs"
	"path"
	"sort"
	"strings"
)

// SkillEntry describes one embedded skill available for extraction into an
// agent's skills directory.
type SkillEntry struct {
	ID          string // directory name under internal/skills, e.g. "virgil-workflow"
	Name        string // frontmatter "name" field
	Description string // frontmatter "description" field
}

// List returns every embedded skill, sorted by ID, with Name and
// Description parsed from each SKILL.md's frontmatter.
func List() ([]SkillEntry, error) {
	matches, err := fs.Glob(skillAssets, "*/SKILL.md")
	if err != nil {
		return nil, fmt.Errorf("glob embedded skills: %w", err)
	}
	sort.Strings(matches)

	entries := make([]SkillEntry, 0, len(matches))
	for _, m := range matches {
		id := path.Dir(m)

		raw, err := skillAssets.ReadFile(m)
		if err != nil {
			return nil, fmt.Errorf("read embedded %s: %w", m, err)
		}

		name, description, err := parseFrontmatter(raw)
		if err != nil {
			return nil, fmt.Errorf("parse frontmatter for %s: %w", id, err)
		}

		entries = append(entries, SkillEntry{
			ID:          id,
			Name:        name,
			Description: description,
		})
	}

	return entries, nil
}

// Get returns the raw SKILL.md content for the given skill ID (the
// directory name under internal/skills, e.g. "virgil-workflow").
func Get(skillID string) ([]byte, error) {
	data, err := skillAssets.ReadFile(path.Join(skillID, "SKILL.md"))
	if err != nil {
		return nil, fmt.Errorf("skill %q not found: %w", skillID, err)
	}
	return data, nil
}

// parseFrontmatter extracts the "name" and "description" fields from a
// SKILL.md's YAML frontmatter. It intentionally avoids a full YAML parser:
// by convention both fields are single-line, optionally double-quoted
// scalars, which a line scan can extract without ambiguity.
func parseFrontmatter(raw []byte) (name, description string, err error) {
	lines := strings.Split(string(raw), "\n")
	if len(lines) == 0 || strings.TrimSpace(lines[0]) != "---" {
		return "", "", fmt.Errorf("missing frontmatter open marker")
	}

	for _, line := range lines[1:] {
		trimmed := strings.TrimSpace(line)
		if trimmed == "---" {
			break
		}
		switch {
		case strings.HasPrefix(trimmed, "name:"):
			name = unquote(strings.TrimSpace(strings.TrimPrefix(trimmed, "name:")))
		case strings.HasPrefix(trimmed, "description:"):
			description = unquote(strings.TrimSpace(strings.TrimPrefix(trimmed, "description:")))
		}
	}

	if name == "" {
		return "", "", fmt.Errorf("frontmatter missing name field")
	}
	if description == "" {
		return "", "", fmt.Errorf("frontmatter missing description field")
	}

	return name, description, nil
}

// unquote strips a single layer of surrounding double quotes, if present.
func unquote(s string) string {
	if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
		return s[1 : len(s)-1]
	}
	return s
}
