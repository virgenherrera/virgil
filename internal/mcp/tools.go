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

// Tools returns the four Virgil MCP tool definitions.
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
			Name:        "virgil_write",
			Description: "Create or update a document in the project knowledge base. Supports idea, requirement, design, and task documents. Task documents include lifecycle status and refs linking to requirements, design docs, and implementing code.",
			InputSchema: json.RawMessage(`{
				"type": "object",
				"properties": {
					"doc_kind": {
						"type": "string",
						"enum": ["idea", "requirement", "design", "task"],
						"description": "The kind of document to create or update."
					},
					"slug": {
						"type": "string",
						"description": "Short identifier for the document (required for requirement, design, task; not used for idea)."
					},
					"category": {
						"type": "string",
						"description": "Category prefix for requirements (functional, non-functional) and design docs (arch, entity, api-contract, ci, cd, dataflow, otel, etc.)."
					},
					"content": {
						"type": "string",
						"description": "Markdown content for the document."
					},
					"status": {
						"type": "string",
						"enum": ["backlog", "refined", "active", "done", "released"],
						"description": "Initial status for task documents. Defaults to backlog if not specified. Only applicable to tasks."
					},
					"refs": {
						"type": "object",
						"description": "References linking this task to requirements, design docs, and implementing code. Only applicable to tasks.",
						"properties": {
							"requirements": {
								"type": "array",
								"items": { "type": "string" },
								"description": "Filenames of requirement docs this task implements."
							},
							"design": {
								"type": "array",
								"items": { "type": "string" },
								"description": "Filenames of design docs this task follows."
							},
							"implements": {
								"type": "array",
								"items": { "type": "string" },
								"description": "Source code paths this task delivers."
							}
						},
						"additionalProperties": false
					}
				},
				"required": ["doc_kind", "content"],
				"additionalProperties": false
			}`),
		},
		{
			Name:        "virgil_transition",
			Description: "Change the status of a task document. Follows the lifecycle state machine: backlog → refined → active → done → released.",
			InputSchema: json.RawMessage(`{
				"type": "object",
				"properties": {
					"task_slug": {
						"type": "string",
						"description": "The slug identifying the task to transition."
					},
					"new_status": {
						"type": "string",
						"enum": ["backlog", "refined", "active", "done", "released"],
						"description": "The target status for the task."
					},
					"refs_update": {
						"type": "object",
						"description": "Optional updated refs to apply alongside the status transition.",
						"properties": {
							"requirements": {
								"type": "array",
								"items": { "type": "string" }
							},
							"design": {
								"type": "array",
								"items": { "type": "string" }
							},
							"implements": {
								"type": "array",
								"items": { "type": "string" }
							}
						},
						"additionalProperties": false
					}
				},
				"required": ["task_slug", "new_status"],
				"additionalProperties": false
			}`),
		},
		{
			Name:        "virgil_status",
			Description: "Show the current project state: whether it is initialized, document counts by kind, and task counts by status.",
			InputSchema: json.RawMessage(`{
				"type": "object",
				"properties": {},
				"additionalProperties": false
			}`),
		},
	}
}
