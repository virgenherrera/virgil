package evidence

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strings"

	"github.com/virgenherrera/virgil/internal/wire"
)

var secretKeyNames = map[string]struct{}{
	"access_token":  {},
	"api_key":       {},
	"auth_token":    {},
	"authorization": {},
	"client_secret": {},
	"cookie":        {},
	"credential":    {},
	"credentials":   {},
	"password":      {},
	"passwd":        {},
	"private_key":   {},
	"refresh_token": {},
	"secret":        {},
}

var secretMarkers = []*regexp.Regexp{
	regexp.MustCompile(`(?i)-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----`),
	regexp.MustCompile(`(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{8,}`),
	regexp.MustCompile(`\bAKIA[0-9A-Z]{16}\b`),
	regexp.MustCompile(`\bgh[pousr]_[A-Za-z0-9]{20,}\b`),
	regexp.MustCompile(`\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b`),
	regexp.MustCompile(`\bsk-[A-Za-z0-9_-]{20,}\b`),
	regexp.MustCompile(`(?i)(?:[?&](?:access_token|api_key|auth_token|password|secret)=)[^&#\s]+`),
	regexp.MustCompile(`(?i)^[a-z][a-z0-9+.-]*://[^/@\s:]+:[^/@\s]+@`),
}

func validateSecretPolicy(policy SecretPolicy) error {
	seen := make(map[string]struct{}, len(policy.AllowedJSONPointers))
	for _, pointer := range policy.AllowedJSONPointers {
		if pointer == "" || pointer[0] != '/' {
			return fmt.Errorf("secret allowlist entry %q is not an absolute JSON pointer", pointer)
		}
		if _, duplicate := seen[pointer]; duplicate {
			return fmt.Errorf("duplicate secret allowlist entry %q", pointer)
		}
		seen[pointer] = struct{}{}
	}
	return nil
}

func scanJSONSecrets(label string, content []byte, policy SecretPolicy) error {
	if err := wire.ValidateUnambiguousJSON(content); err != nil {
		return fmt.Errorf("scan %s: %w", label, err)
	}
	decoder := json.NewDecoder(bytes.NewReader(content))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return fmt.Errorf("scan %s: %w", label, err)
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return fmt.Errorf("scan %s: multiple JSON values", label)
	}
	allowed := make(map[string]struct{}, len(policy.AllowedJSONPointers))
	for _, pointer := range policy.AllowedJSONPointers {
		allowed[pointer] = struct{}{}
	}
	var findings []string
	scanSecretValue(value, "", allowed, &findings)
	if len(findings) > 0 {
		sort.Strings(findings)
		return fmt.Errorf("secret scan rejected %s at %s", label, strings.Join(findings, ", "))
	}
	return nil
}

func scanNDJSONSecrets(label string, records [][]byte, policy SecretPolicy) error {
	for index, record := range records {
		if err := scanJSONSecrets(fmt.Sprintf("%s line %d", label, index+1), record, policy); err != nil {
			return err
		}
	}
	return nil
}

func scanSecretValue(value any, pointer string, allowed map[string]struct{}, findings *[]string) {
	switch typed := value.(type) {
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			childPointer := pointer + "/" + escapePointer(key)
			child := typed[key]
			if _, suspicious := secretKeyNames[strings.ToLower(key)]; suspicious && !emptySecretValue(child) && !pointerAllowed(childPointer, allowed) {
				*findings = append(*findings, childPointer)
				continue
			}
			scanSecretValue(child, childPointer, allowed, findings)
		}
	case []any:
		for index, child := range typed {
			scanSecretValue(child, fmt.Sprintf("%s/%d", pointer, index), allowed, findings)
		}
	case string:
		if pointerAllowed(pointer, allowed) {
			return
		}
		for _, marker := range secretMarkers {
			if marker.MatchString(typed) {
				*findings = append(*findings, pointer)
				return
			}
		}
	}
}

func pointerAllowed(pointer string, allowed map[string]struct{}) bool {
	_, ok := allowed[pointer]
	return ok
}

func emptySecretValue(value any) bool {
	if value == nil {
		return true
	}
	text, ok := value.(string)
	return ok && text == ""
}

func escapePointer(value string) string {
	value = strings.ReplaceAll(value, "~", "~0")
	return strings.ReplaceAll(value, "/", "~1")
}
