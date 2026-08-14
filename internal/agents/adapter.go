package agents

// Adapter is the integration contract between Virgil and a single AI agent.
// Callers dispatch through Adapter methods rather than branching per agent
// identity, so adding a new agent means adding a new Adapter implementation,
// not modifying existing call sites (Open/Closed Principle).
type Adapter interface {
	// Identity
	Agent() AgentID
	Name() string // Human-readable: "Claude Code"
	Tier() SupportTier

	// Detection
	Detect(homeDir string) bool
	InstallCommand() string // What to tell user if not detected

	// Config paths (each agent returns ITS paths — no hardcoded ~/.claude/)
	GlobalConfigDir(homeDir string) string
	SettingsPath(homeDir string) string
	SkillsDir(homeDir string) string
	CommandsDir(homeDir string) string
	SystemPromptPath(homeDir string) string

	// Strategies (HOW to inject — each agent has its own format)
	MCPStrategy() MCPStrategy
	SystemPromptStrategy() SystemPromptStrategy

	// Capabilities (not all agents support all features)
	SupportsSkills() bool
	SupportsCommands() bool
	SupportsMCP() bool
	SupportsSystemPrompt() bool

	// Installation (agent-agnostic — caller uses adapter paths)
	WriteMCPConfig(settingsPath string, serverName string, config map[string]any) error
	WriteSkill(skillsDir string, skillID string, content []byte) error
	WriteCommand(commandsDir string, cmdID string, content []byte) error
	InjectSystemPrompt(promptPath string, sectionID string, content []byte) error
}
