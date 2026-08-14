// Package skills embeds the SKILL.md assets that teach AI agents how to use
// the Virgil MCP tools (virgil_init, virgil_new, virgil_propose,
// virgil_approve, virgil_status). These files are compiled into the virgil
// binary and extracted to an agent's skills directory during `virgil
// install`.
package skills

import "embed"

//go:embed virgil-workflow/SKILL.md virgil-init/SKILL.md virgil-new/SKILL.md virgil-propose/SKILL.md virgil-approve/SKILL.md virgil-status/SKILL.md
var skillAssets embed.FS
