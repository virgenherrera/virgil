// Package mcp provides the protocol layer between an MCP server and the
// Virgil runtime. It contains only pure business logic: tool definitions,
// state loading, envelope building and result simplification. No server
// I/O, no JSON-RPC, no network.
package mcp

import "encoding/json"

// ToolDefinition is the MCP tool descriptor serialized into tool list
// responses. InputSchema carries a JSON Schema object describing the
// tool's parameters.
type ToolDefinition struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	InputSchema json.RawMessage `json:"inputSchema"`
}

// Tools returns the five Virgil MCP tool definitions in invocation order.
func Tools() []ToolDefinition {
	return []ToolDefinition{
		{
			Name:        "virgil_init",
			Description: "Initialize a Virgil-managed project. Creates virgil.json and AGENTS.md at the target root.",
			InputSchema: json.RawMessage(`{
				"type": "object",
				"properties": {
					"project_id": {
						"type": "string",
						"description": "Unique identifier for the project to initialize."
					}
				},
				"required": ["project_id"],
				"additionalProperties": false
			}`),
		},
		{
			Name:        "virgil_new",
			Description: "Start a new planning change within an initialized project. The project must not have an active change.",
			InputSchema: json.RawMessage(`{
				"type": "object",
				"properties": {
					"change_id": {
						"type": "string",
						"description": "Unique identifier for the change (safe relative path component, no slashes)."
					},
					"intent": {
						"type": "string",
						"description": "Human-readable description of what this change is about."
					}
				},
				"required": ["change_id", "intent"],
				"additionalProperties": false
			}`),
		},
		{
			Name:        "virgil_propose",
			Description: "Submit a content proposal for the current artifact step (idea, spec, design, tasks, or handoff). The proposal is written as a seed file and submitted for approval.",
			InputSchema: json.RawMessage(`{
				"type": "object",
				"properties": {
					"artifact_kind": {
						"type": "string",
						"enum": ["idea", "spec", "design", "tasks", "handoff"],
						"description": "The artifact kind to propose content for. Must match the current derived step."
					},
					"content": {
						"type": "string",
						"description": "Markdown content for the artifact proposal."
					}
				},
				"required": ["artifact_kind", "content"],
				"additionalProperties": false
			}`),
		},
		{
			Name:        "virgil_approve",
			Description: "Approve the current artifact revision that is awaiting approval. Advances the pipeline to the next step.",
			InputSchema: json.RawMessage(`{
				"type": "object",
				"properties": {
					"rationale": {
						"type": "string",
						"description": "Explanation of why this artifact revision is approved."
					}
				},
				"required": ["rationale"],
				"additionalProperties": false
			}`),
		},
		{
			Name:        "virgil_status",
			Description: "Show the current project state: whether it is initialized, the active change (if any), and the current derived step.",
			InputSchema: json.RawMessage(`{
				"type": "object",
				"properties": {},
				"additionalProperties": false
			}`),
		},
	}
}
