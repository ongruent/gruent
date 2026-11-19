package channels

import (
	"fmt"
	"slices"
	"strings"
)

type ValidationError struct {
	ChannelErrors []string            `json:"channelErrors"`
	NodeErrors    map[string][]string `json:"nodeErrors"`
}

/*
Validates the channel DAG according to the channel rules.

- Only one source node may be present.

- Must have more than one node.

- Any node may only have one connected input.

- Any node may have many connected outputs, which we refer to as "branching" or "branches".

- A branch may end in any type of node (except a source node).

- No "hanging nodes", or nodes without at least one edge.

- No duplicate edges.

- Edges cannot connect inputs and outputs of the same node.

- Runtime size must be valid.
*/
func (c *Channel) Validate() *ValidationError {
	validationErrors := &ValidationError{
		ChannelErrors: []string{},
		NodeErrors:    map[string][]string{},
	}

	// Check if channel has more than one node
	if len(c.Nodes) < 2 {
		validationErrors.ChannelErrors = append(validationErrors.ChannelErrors, "Channel must have more than one node.")
	}

	// Populate nodeMap and initialize inDegree and outDegree maps
	nodeMap := make(map[string]Node)
	edgeMap := make(map[string]bool)
	inDegree := make(map[string]int)
	outDegree := make(map[string]int)
	sourceNodeCount := 0

	for _, node := range c.Nodes {
		nodeMap[node.Id] = node
		inDegree[node.Id] = 0
		outDegree[node.Id] = 0
		if node.Metadata.Type == "source" {
			sourceNodeCount++
		}
	}

	// Ensure only one source node is present
	if sourceNodeCount > 1 {
		validationErrors.ChannelErrors = append(validationErrors.ChannelErrors, "Only one source node is allowed.")
	}

	// Calculate inDegree and outDegree for each node based on edges
	for _, edge := range c.Edges {
		if _, exists := nodeMap[edge.From.NodeId]; !exists {
			validationErrors.ChannelErrors = append(validationErrors.ChannelErrors, fmt.Sprintf("Edge from node %s does not exist.", edge.From.NodeId))
		}
		if _, exists := nodeMap[edge.To.NodeId]; !exists {
			validationErrors.ChannelErrors = append(validationErrors.ChannelErrors, fmt.Sprintf("Edge to node %s does not exist.", edge.To.NodeId))
		}

		// Check for duplicate edges
		edgeKey := fmt.Sprintf("%s-%s-%s-%s", edge.From.NodeId, edge.From.IoId, edge.To.NodeId, edge.To.IoId)
		if edgeMap[edgeKey] {
			validationErrors.ChannelErrors = append(validationErrors.ChannelErrors, fmt.Sprintf("Duplicate edge detected between nodes %s and %s with IO points %s and %s.", edge.From.NodeId, edge.To.NodeId, edge.From.IoId, edge.To.IoId))
		}
		edgeMap[edgeKey] = true

		inDegree[edge.To.NodeId]++
		outDegree[edge.From.NodeId]++
	}

	// Validate no "hanging" nodes (nodes with no edges)
	for nodeId, node := range nodeMap {
		if inDegree[nodeId] == 0 && outDegree[nodeId] == 0 {
			validationErrors.ChannelErrors = append(validationErrors.ChannelErrors, fmt.Sprintf("Node %s (%s) is a hanging node with no edges.", nodeId, node.Metadata.Name))
		}
	}

	// Validate that each node has exactly one input (inDegree == 1) and at least one output
	for nodeId, degree := range inDegree {
		node := nodeMap[nodeId]

		if degree > 1 {
			validationErrors.ChannelErrors = append(validationErrors.ChannelErrors, fmt.Sprintf("Node %s (%s) has more than one input.", nodeId, node.Metadata.Name))
		}
		if degree == 0 && nodeMap[nodeId].Metadata.Type != "source" {
			validationErrors.ChannelErrors = append(validationErrors.ChannelErrors, fmt.Sprintf("Node %s (%s) has no input and is not a source node.", nodeId, node.Metadata.Name))
		}
	}

	// Validate that each edge is not connecting two inputs or two outputs
	for _, edge := range c.Edges {
		fromIoDirection := "output"
		toIoDirection := "output"

		if strings.Contains(strings.ToLower(edge.From.IoId), "input") {
			fromIoDirection = "input"
		}

		if strings.Contains(strings.ToLower(edge.To.IoId), "input") {
			toIoDirection = "input"
		}

		if fromIoDirection == "output" && toIoDirection == "output" {
			fromNode := nodeMap[edge.From.NodeId]
			toNode := nodeMap[edge.To.NodeId]
			validationErrors.ChannelErrors = append(validationErrors.ChannelErrors, fmt.Sprintf("Edge %s (between %s and %s) connects two outputs.", edge.Id, fromNode.Metadata.Name, toNode.Metadata.Name))
		}

		if fromIoDirection == "input" && toIoDirection == "input" {
			fromNode := nodeMap[edge.From.NodeId]
			toNode := nodeMap[edge.To.NodeId]
			validationErrors.ChannelErrors = append(validationErrors.ChannelErrors, fmt.Sprintf("Edge %s (between %s and %s) connects two inputs.", edge.Id, fromNode.Metadata.Name, toNode.Metadata.Name))
		}

		if edge.From.NodeId == edge.To.NodeId {
			fromNode := nodeMap[edge.From.NodeId]
			toNode := nodeMap[edge.To.NodeId]
			validationErrors.ChannelErrors = append(validationErrors.ChannelErrors, fmt.Sprintf("Edge %s (between %s and %s) connects an input to an output from the same node %s.", edge.Id, fromNode.Metadata.Name, toNode.Metadata.Name, edge.From.NodeId))
		}
	}

	// Validate runtime size
	validSizes := []string{"small", "medium", "large"}
	if !slices.Contains(validSizes, c.Runtime.Size) {
		validationErrors.ChannelErrors = append(validationErrors.ChannelErrors, fmt.Sprintf("Invalid runtime size. Must be one of: %s. Received: %s.", strings.Join(validSizes, ", "), c.Runtime.Size))
	}

	// Validate node config
	for _, node := range c.Nodes {
		nodeValidationErrors := node.ValidateConfig()
		if len(nodeValidationErrors) > 0 {
			validationErrors.NodeErrors[node.Id] = nodeValidationErrors
		}
	}

	// If there are no validation errors, return nil
	if len(validationErrors.ChannelErrors) <= 0 && len(validationErrors.NodeErrors) <= 0 {
		return nil
	}

	return validationErrors
}

// Step categories of the channel editor and the step library (libs/engine/steps).
var stepTypes = []string{"source", "processing", "conditional", "action", "custom"}

// ValidateConfig checks that a node has a known step category. Configurations are validated elsewhere:
// steps from the step library against their definitions (PATCH /v1/channels/validate and the controller's
// compiler), and legacy steps by the controller's compiler.
func (n *Node) ValidateConfig() []string {
	if !slices.Contains(stepTypes, n.Metadata.Type) {
		return []string{fmt.Sprintf("Invalid node type: %s.", n.Metadata.Type)}
	}
	return nil
}
