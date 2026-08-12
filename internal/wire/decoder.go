package wire

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"path/filepath"
	"time"
)

const (
	MaxEnvelopeBytes = 1 << 20
	MaxJSONDepth     = 64
)

func DecodeEnvelope(reader io.Reader) (Envelope, error) {
	raw, err := readLimited(reader, MaxEnvelopeBytes)
	if err != nil {
		return nil, err
	}
	if err := rejectAmbiguousJSON(raw); err != nil {
		return nil, err
	}

	var discriminator struct {
		RuntimeProtocol string `json:"runtime_protocol"`
		Kind            string `json:"kind"`
	}
	if err := json.Unmarshal(raw, &discriminator); err != nil {
		return nil, fmt.Errorf("decode envelope discriminator: %w", err)
	}
	if discriminator.RuntimeProtocol != RuntimeProtocol {
		return nil, fmt.Errorf("unsupported runtime_protocol %q", discriminator.RuntimeProtocol)
	}

	switch discriminator.Kind {
	case "invoke":
		var envelope InvokeEnvelope
		if err := decodeStrict(raw, &envelope); err != nil {
			return nil, fmt.Errorf("decode invoke envelope: %w", err)
		}
		if err := validateInvokeEnvelope(envelope); err != nil {
			return nil, fmt.Errorf("validate invoke envelope: %w", err)
		}
		return envelope, nil
	case "run_t0":
		var envelope RunT0Envelope
		if err := decodeStrict(raw, &envelope); err != nil {
			return nil, fmt.Errorf("decode run_t0 envelope: %w", err)
		}
		if err := validateRunT0Envelope(envelope); err != nil {
			return nil, fmt.Errorf("validate run_t0 envelope: %w", err)
		}
		return envelope, nil
	default:
		return nil, fmt.Errorf("unsupported envelope kind %q", discriminator.Kind)
	}
}

func validateInvokeEnvelope(envelope InvokeEnvelope) error {
	if envelope.ProcessID == "" || len(envelope.Request) == 0 {
		return fmt.Errorf("process_id and request are required")
	}
	if envelope.Bindings.Target.URI == "" || !filepath.IsAbs(envelope.Bindings.Target.Root) {
		return fmt.Errorf("target binding requires URI and absolute root")
	}
	if envelope.Bindings.Resources == nil {
		return fmt.Errorf("resource bindings are required")
	}
	return validateClock(envelope.Clock)
}

func validateRunT0Envelope(envelope RunT0Envelope) error {
	if len(envelope.FixtureIDs) == 0 {
		return fmt.Errorf("fixture_ids must not be empty")
	}
	if !filepath.IsAbs(envelope.WorkspaceRoot) || !filepath.IsAbs(envelope.EvidenceRoot) {
		return fmt.Errorf("workspace_root and evidence_root must be absolute")
	}
	return validateClock(envelope.Clock)
}

func validateClock(clock Clock) error {
	if clock.Now == "" {
		return fmt.Errorf("clock.now is required")
	}
	if _, err := time.Parse(time.RFC3339, clock.Now); err != nil {
		return fmt.Errorf("clock.now must be RFC3339")
	}
	return nil
}

func DecodeInvokeResult(raw []byte) (InvokeResult, error) {
	if err := rejectAmbiguousJSON(raw); err != nil {
		return InvokeResult{}, err
	}
	var result InvokeResult
	if err := decodeStrict(raw, &result); err != nil {
		return InvokeResult{}, fmt.Errorf("decode invoke_result: %w", err)
	}
	if result.RuntimeProtocol != RuntimeProtocol || result.Kind != "invoke_result" {
		return InvokeResult{}, fmt.Errorf("unexpected child response %q/%q", result.RuntimeProtocol, result.Kind)
	}
	return result, nil
}

func readLimited(reader io.Reader, limit int64) ([]byte, error) {
	raw, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return nil, fmt.Errorf("read JSON envelope: %w", err)
	}
	if int64(len(raw)) > limit {
		return nil, fmt.Errorf("JSON envelope exceeds %d bytes", limit)
	}
	if len(bytes.TrimSpace(raw)) == 0 {
		return nil, fmt.Errorf("empty JSON envelope")
	}
	return raw, nil
}

func decodeStrict(raw []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
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

func rejectAmbiguousJSON(raw []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := inspectJSONValue(decoder, 0); err != nil {
		return fmt.Errorf("ambiguous JSON: %w", err)
	}
	if _, err := decoder.Token(); err != io.EOF {
		if err == nil {
			return fmt.Errorf("ambiguous JSON: multiple values")
		}
		return fmt.Errorf("ambiguous JSON: %w", err)
	}
	return nil
}

func inspectJSONValue(decoder *json.Decoder, depth int) error {
	if depth > MaxJSONDepth {
		return fmt.Errorf("maximum depth %d exceeded", MaxJSONDepth)
	}
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	delimiter, ok := token.(json.Delim)
	if !ok {
		return nil
	}

	switch delimiter {
	case '{':
		seen := make(map[string]struct{})
		for decoder.More() {
			keyToken, err := decoder.Token()
			if err != nil {
				return err
			}
			key, ok := keyToken.(string)
			if !ok {
				return fmt.Errorf("object key is not a string")
			}
			if _, duplicate := seen[key]; duplicate {
				return fmt.Errorf("duplicate object key %q", key)
			}
			seen[key] = struct{}{}
			if err := inspectJSONValue(decoder, depth+1); err != nil {
				return err
			}
		}
		end, err := decoder.Token()
		if err != nil {
			return err
		}
		if end != json.Delim('}') {
			return fmt.Errorf("object not terminated")
		}
	case '[':
		for decoder.More() {
			if err := inspectJSONValue(decoder, depth+1); err != nil {
				return err
			}
		}
		end, err := decoder.Token()
		if err != nil {
			return err
		}
		if end != json.Delim(']') {
			return fmt.Errorf("array not terminated")
		}
	default:
		return fmt.Errorf("unexpected delimiter %q", delimiter)
	}
	return nil
}
