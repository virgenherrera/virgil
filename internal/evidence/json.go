package evidence

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/gowebpki/jcs"
	"github.com/virgenherrera/virgil/internal/contracts"
	"github.com/virgenherrera/virgil/internal/wire"
)

func digest(content []byte) string {
	value := sha256.Sum256(content)
	return fmt.Sprintf("sha256:%x", value)
}

func validateJSON(registry *contracts.Registry, schemaID string, content []byte) error {
	if len(content) == 0 {
		return fmt.Errorf("%s document is empty", schemaID)
	}
	if len(content) > maxResourceBytes {
		return fmt.Errorf("%s document exceeds %d bytes", schemaID, maxResourceBytes)
	}
	if err := wire.ValidateUnambiguousJSON(content); err != nil {
		return fmt.Errorf("%s document is ambiguous: %w", schemaID, err)
	}
	if err := registry.Validate(schemaID, content); err != nil {
		return err
	}
	return nil
}

func decodeObject(content []byte) (map[string]any, error) {
	if err := wire.ValidateUnambiguousJSON(content); err != nil {
		return nil, err
	}
	decoder := json.NewDecoder(bytes.NewReader(content))
	decoder.UseNumber()
	var object map[string]any
	if err := decoder.Decode(&object); err != nil {
		return nil, err
	}
	if object == nil {
		return nil, fmt.Errorf("top-level JSON value must be an object")
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return nil, fmt.Errorf("multiple JSON values")
		}
		return nil, err
	}
	return object, nil
}

func decodeStrict(content []byte, target any) error {
	if err := wire.ValidateUnambiguousJSON(content); err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(content))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return fmt.Errorf("multiple JSON values")
		}
		return err
	}
	return nil
}

// sealIntegrity calculates SHA-256 over RFC 8785 JCS after removing exactly
// /integrity/digest, then returns a canonical document containing that digest.
func sealIntegrity(content []byte) ([]byte, error) {
	object, err := decodeObject(content)
	if err != nil {
		return nil, fmt.Errorf("decode integrity document: %w", err)
	}
	if existing, ok := object["integrity"]; ok {
		integrityObject, ok := existing.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("integrity must be an object")
		}
		for key := range integrityObject {
			if key != "digest" && key != "canonicalization" {
				return nil, fmt.Errorf("integrity contains unsupported field %q", key)
			}
		}
		if algorithm, present := integrityObject["canonicalization"]; present && algorithm != "RFC8785" {
			return nil, fmt.Errorf("integrity canonicalization must be RFC8785")
		}
	}
	object["integrity"] = map[string]any{"canonicalization": "RFC8785"}
	unsigned, err := json.Marshal(object)
	if err != nil {
		return nil, fmt.Errorf("serialize unsigned integrity document: %w", err)
	}
	canonical, err := jcs.Transform(unsigned)
	if err != nil {
		return nil, fmt.Errorf("canonicalize unsigned integrity document with RFC8785: %w", err)
	}
	object["integrity"] = map[string]any{
		"canonicalization": "RFC8785",
		"digest":           digest(canonical),
	}
	sealed, err := json.Marshal(object)
	if err != nil {
		return nil, fmt.Errorf("serialize sealed integrity document: %w", err)
	}
	sealed, err = jcs.Transform(sealed)
	if err != nil {
		return nil, fmt.Errorf("canonicalize sealed integrity document with RFC8785: %w", err)
	}
	return sealed, nil
}

func validateNDJSON(registry *contracts.Registry, schemaID string, content []byte) ([][]byte, error) {
	if len(content) > maxResourceBytes {
		return nil, fmt.Errorf("NDJSON resource exceeds %d bytes", maxResourceBytes)
	}
	if len(content) == 0 {
		return [][]byte{}, nil
	}
	if content[len(content)-1] != '\n' {
		return nil, fmt.Errorf("NDJSON resource must end with a newline")
	}
	scanner := bufio.NewScanner(bytes.NewReader(content))
	buffer := make([]byte, 64<<10)
	scanner.Buffer(buffer, maxResourceBytes)
	var records [][]byte
	for line := 1; scanner.Scan(); line++ {
		record := bytes.Clone(scanner.Bytes())
		if len(bytes.TrimSpace(record)) == 0 {
			return nil, fmt.Errorf("NDJSON line %d is empty", line)
		}
		if err := validateJSON(registry, schemaID, record); err != nil {
			return nil, fmt.Errorf("NDJSON line %d: %w", line, err)
		}
		records = append(records, record)
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scan NDJSON resource: %w", err)
	}
	return records, nil
}

func validateSHA256(value, field string) error {
	if len(value) != len("sha256:")+64 || !strings.HasPrefix(value, "sha256:") {
		return fmt.Errorf("%s must be a lowercase SHA-256 digest", field)
	}
	for _, character := range value[len("sha256:"):] {
		if (character < '0' || character > '9') && (character < 'a' || character > 'f') {
			return fmt.Errorf("%s must be a lowercase SHA-256 digest", field)
		}
	}
	return nil
}
