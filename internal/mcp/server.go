package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"

	"github.com/virgenherrera/virgil/internal/contracts"
	"github.com/virgenherrera/virgil/internal/protocol"
	runtimeimpl "github.com/virgenherrera/virgil/internal/runtime"
	"github.com/virgenherrera/virgil/internal/wire"
)

// Server is the MCP stdio server for Virgil. It reads JSON-RPC 2.0
// requests from an io.Reader (typically stdin), dispatches them to the
// Virgil runtime, and writes JSON-RPC 2.0 responses to an io.Writer
// (typically stdout). Diagnostic logs go to stderr.
type Server struct {
	targetRoot string
	version    string
	registry   *contracts.Registry
	state      *ProjectState
	builder    *Builder
	logger     *log.Logger
}

// NewServer creates a Server rooted at targetRoot. The version string
// is reported in the MCP initialize handshake.
func NewServer(targetRoot, version string) *Server {
	return &Server{
		targetRoot: targetRoot,
		version:    version,
		builder:    NewBuilder(targetRoot),
	}
}

// Run starts the MCP stdio read loop. It blocks until ctx is cancelled
// or the reader reaches EOF. Every JSON line read from r is dispatched
// and the response (if any) is written to w. Lifecycle logs go to errW.
func (s *Server) Run(ctx context.Context, r io.Reader, w io.Writer, errW io.Writer) error {
	s.logger = log.New(errW, "virgil-mcp: ", log.LstdFlags)
	s.logger.Println("server starting")

	// Build the contract registry once at startup.
	reg, err := contracts.NewRegistry()
	if err != nil {
		return fmt.Errorf("create schema registry: %w", err)
	}
	s.registry = reg

	// Load initial project state (best-effort — may not be initialized yet).
	s.refreshState()

	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), 1<<20) // 1 MB max token

	for scanner.Scan() {
		select {
		case <-ctx.Done():
			s.logger.Println("server stopping: context cancelled")
			return ctx.Err()
		default:
		}

		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var req JSONRPCRequest
		if err := json.Unmarshal(line, &req); err != nil {
			resp := JSONRPCResponse{
				JSONRPC: "2.0",
				Error: &JSONRPCError{
					Code:    -32700,
					Message: "Parse error",
					Data:    err.Error(),
				},
			}
			s.writeResponse(w, resp)
			continue
		}

		if req.IsNotification() {
			// Notifications expect no response. Log and skip.
			s.logger.Printf("notification: %s", req.Method)
			continue
		}

		resp := s.dispatch(req)
		s.writeResponse(w, resp)
	}

	if err := scanner.Err(); err != nil {
		s.logger.Printf("scanner error: %v", err)
		return fmt.Errorf("read stdin: %w", err)
	}

	s.logger.Println("server stopping: EOF")
	return nil
}

// dispatch routes a JSON-RPC request to the appropriate handler method.
func (s *Server) dispatch(req JSONRPCRequest) JSONRPCResponse {
	switch req.Method {
	case "initialize":
		return s.handleInitialize(req)
	case "tools/list":
		return s.handleToolsList(req)
	case "tools/call":
		return s.handleToolsCall(req)
	default:
		return JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error: &JSONRPCError{
				Code:    -32601,
				Message: "Method not found",
				Data:    fmt.Sprintf("unknown method: %s", req.Method),
			},
		}
	}
}

// --- MCP initialize ---

type initializeParams struct {
	ProtocolVersion string `json:"protocolVersion"`
}

type initializeResult struct {
	ProtocolVersion string     `json:"protocolVersion"`
	Capabilities    toolsCap   `json:"capabilities"`
	ServerInfo      serverInfo `json:"serverInfo"`
}

type toolsCap struct {
	Tools struct{} `json:"tools"`
}

type serverInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

func (s *Server) handleInitialize(req JSONRPCRequest) JSONRPCResponse {
	s.logger.Println("initialize handshake")
	return JSONRPCResponse{
		JSONRPC: "2.0",
		ID:      req.ID,
		Result: initializeResult{
			ProtocolVersion: "2024-11-05",
			Capabilities:    toolsCap{},
			ServerInfo: serverInfo{
				Name:    "virgil",
				Version: s.version,
			},
		},
	}
}

// --- tools/list ---

type toolsListResult struct {
	Tools []ToolDefinition `json:"tools"`
}

func (s *Server) handleToolsList(req JSONRPCRequest) JSONRPCResponse {
	s.logger.Println("tools/list")
	return JSONRPCResponse{
		JSONRPC: "2.0",
		ID:      req.ID,
		Result:  toolsListResult{Tools: Tools()},
	}
}

// --- tools/call ---

type toolCallParams struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

type toolCallContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type toolCallResult struct {
	Content []toolCallContent `json:"content"`
	IsError bool              `json:"isError"`
}

func (s *Server) handleToolsCall(req JSONRPCRequest) JSONRPCResponse {
	var params toolCallParams
	if err := json.Unmarshal(req.Params, &params); err != nil {
		return JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error: &JSONRPCError{
				Code:    -32602,
				Message: "Invalid params",
				Data:    err.Error(),
			},
		}
	}

	s.logger.Printf("tools/call: %s", params.Name)

	switch params.Name {
	case "virgil_status":
		return s.callStatus(req.ID)
	case "virgil_init":
		return s.callInit(req.ID, params.Arguments)
	case "virgil_write":
		return s.callWrite(req.ID, params.Arguments)
	case "virgil_transition":
		return s.callTransition(req.ID, params.Arguments)
	default:
		return JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error: &JSONRPCError{
				Code:    -32602,
				Message: "Invalid params",
				Data:    fmt.Sprintf("unknown tool: %s", params.Name),
			},
		}
	}
}

// --- tool implementations ---

func (s *Server) callStatus(id json.RawMessage) JSONRPCResponse {
	s.refreshState()
	return s.jsonTextResult(id, s.state, false)
}

func (s *Server) callInit(id json.RawMessage, args json.RawMessage) JSONRPCResponse {
	var a struct {
		ProjectID string `json:"project_id"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return s.invalidParams(id, err)
	}

	envelope, err := s.builder.BuildInit(a.ProjectID)
	if err != nil {
		return s.toolError(id, err)
	}
	return s.invokeAndRespond(id, envelope)
}

func (s *Server) callWrite(id json.RawMessage, args json.RawMessage) JSONRPCResponse {
	var a protocol.WriteInput
	if err := json.Unmarshal(args, &a); err != nil {
		return s.invalidParams(id, err)
	}

	s.refreshState()
	envelope, err := s.builder.BuildWrite(s.state, a)
	if err != nil {
		return s.toolError(id, err)
	}
	return s.invokeAndRespond(id, envelope)
}

func (s *Server) callTransition(id json.RawMessage, args json.RawMessage) JSONRPCResponse {
	var a protocol.TransitionInput
	if err := json.Unmarshal(args, &a); err != nil {
		return s.invalidParams(id, err)
	}

	s.refreshState()
	envelope, err := s.builder.BuildTransition(s.state, a)
	if err != nil {
		return s.toolError(id, err)
	}
	return s.invokeAndRespond(id, envelope)
}

// --- helpers ---

// invokeAndRespond executes a wire.InvokeEnvelope through the runtime and
// returns the simplified result as a JSON-RPC response with text content.
func (s *Server) invokeAndRespond(id json.RawMessage, envelope wire.InvokeEnvelope) JSONRPCResponse {
	result, err := runtimeimpl.Invoke(s.registry, envelope)
	if err != nil {
		return s.toolError(id, err)
	}

	// Refresh state after mutations so subsequent calls see updated state,
	// and so the success message can detect a completed planning boundary
	// (all tasks at status "refined") using post-operation state.
	s.refreshState()

	planningComplete := s.state != nil && s.state.PlanningComplete
	simple := SimplifyResult(result, planningComplete)

	isError := simple.Status == "error" || simple.Status == "blocked"
	return s.jsonTextResult(id, simple, isError)
}

func (s *Server) refreshState() {
	state, err := LoadState(s.targetRoot)
	if err != nil {
		s.logger.Printf("warning: load state: %v", err)
		return
	}
	s.state = state
}

func (s *Server) jsonTextResult(id json.RawMessage, v any, isError bool) JSONRPCResponse {
	text, err := json.Marshal(v)
	if err != nil {
		return JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      id,
			Error: &JSONRPCError{
				Code:    -32603,
				Message: "Internal error",
				Data:    err.Error(),
			},
		}
	}
	return JSONRPCResponse{
		JSONRPC: "2.0",
		ID:      id,
		Result: toolCallResult{
			Content: []toolCallContent{{Type: "text", Text: string(text)}},
			IsError: isError,
		},
	}
}

func (s *Server) invalidParams(id json.RawMessage, err error) JSONRPCResponse {
	return JSONRPCResponse{
		JSONRPC: "2.0",
		ID:      id,
		Error: &JSONRPCError{
			Code:    -32602,
			Message: "Invalid params",
			Data:    err.Error(),
		},
	}
}

func (s *Server) toolError(id json.RawMessage, err error) JSONRPCResponse {
	s.logger.Printf("tool error: %v", err)
	return s.jsonTextResult(id, SimpleResult{
		Status:  "error",
		Message: err.Error(),
		Error:   err.Error(),
	}, true)
}

func (s *Server) writeResponse(w io.Writer, resp JSONRPCResponse) {
	data, err := json.Marshal(resp)
	if err != nil {
		s.logger.Printf("fatal: marshal response: %v", err)
		return
	}
	data = append(data, '\n')
	if _, err := w.Write(data); err != nil {
		s.logger.Printf("fatal: write response: %v", err)
	}
}
