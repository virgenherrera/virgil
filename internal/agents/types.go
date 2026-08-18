// Package agents defines the adapter contract Virgil uses to install itself
// into different AI coding agents (Claude Code, Codex, ...). Each agent gets
// its own Adapter implementation; callers never branch on AgentID directly.
package agents

// AgentID identifies a supported AI agent.
type AgentID string

const (
	// Claude identifies Claude Code.
	Claude AgentID = "claude-code"
	// Codex identifies Codex.
	Codex AgentID = "codex"
)

// SupportTier describes how deeply Virgil integrates with an agent.
type SupportTier int

const (
	// TierFull means MCP, skills, and system prompt injection are all
	// supported.
	TierFull SupportTier = iota
	// TierPartial means only MCP integration is supported.
	TierPartial
)

// MCPStrategy describes how an adapter writes MCP server configuration.
type MCPStrategy int

const (
	// MCPStrategyJSONMerge merges the MCP server entry into a JSON
	// settings file (Claude Code's ~/.claude.json).
	MCPStrategyJSONMerge MCPStrategy = iota
	// MCPStrategyTOML writes the MCP server entry into a TOML config
	// file (Codex's config.toml).
	MCPStrategyTOML
	// MCPStrategySeparateFile writes the MCP server entry into its own
	// file (e.g. a dedicated mcp.json per server). Reserved for future
	// adapters.
	MCPStrategySeparateFile
)

// SystemPromptStrategy describes how an adapter injects Virgil's system
// prompt content into an agent's configuration.
type SystemPromptStrategy int

const (
	// StrategyMarkdownSections injects content between named
	// <!-- virgil:ID --> markers inside a markdown file (Claude Code).
	StrategyMarkdownSections SystemPromptStrategy = iota
	// StrategyFileReplace replaces the entire target file with the
	// generated content (Codex's AGENTS.md).
	StrategyFileReplace
	// StrategyAppendToFile appends content to an existing file. Reserved
	// for future adapters.
	StrategyAppendToFile
)
