package mcp

import "encoding/json"

// JSONRPCRequest represents a JSON-RPC 2.0 request or notification.
// Notifications have no ID field (nil).
type JSONRPCRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// IsNotification returns true when the message has no id field,
// meaning it is a JSON-RPC 2.0 notification that expects no response.
func (r *JSONRPCRequest) IsNotification() bool {
	return len(r.ID) == 0
}

// JSONRPCResponse represents a JSON-RPC 2.0 response (success or error).
type JSONRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  any             `json:"result,omitempty"`
	Error   *JSONRPCError   `json:"error,omitempty"`
}

// JSONRPCError is the error object in a JSON-RPC 2.0 error response.
type JSONRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}
