import { Injectable } from '@nestjs/common';
import type { TaskEnvelope } from './task-envelope.schema.js';
import { DependencyGraphError } from './orchestration.errors.js';

/** Directed acyclic graph of agent task dependencies (H10 D5). */
export interface DependencyGraph {
  readonly nodes: ReadonlyMap<string, TaskEnvelope>;
  readonly edges: ReadonlyMap<string, readonly string[]>;
}

/**
 * Builds and analyses the dependency DAG that determines which agent
 * assignments can be dispatched concurrently (H10 D5).
 */
@Injectable()
export class DependencyGraphService {
  /**
   * Constructs a DAG from task envelopes. Validates that all dependency
   * references resolve to known nodes and that no cycles exist.
   * @throws {DependencyGraphError} on missing dependencies or cycles.
   */
  buildGraph(envelopes: readonly TaskEnvelope[]): DependencyGraph {
    const nodes = new Map<string, TaskEnvelope>();
    const edges = new Map<string, readonly string[]>();

    for (const envelope of envelopes) {
      if (nodes.has(envelope.name)) {
        throw new DependencyGraphError(
          `Duplicate task name: "${envelope.name}"`,
          [envelope.name],
        );
      }
      nodes.set(envelope.name, envelope);
      edges.set(envelope.name, envelope.dependencies);
    }

    for (const [name, deps] of edges) {
      for (const dep of deps) {
        if (!nodes.has(dep)) {
          throw new DependencyGraphError(
            `Task "${name}" depends on unknown task "${dep}"`,
            [name, dep],
          );
        }
      }
    }

    this.detectCycles(nodes, edges);

    return { nodes, edges };
  }

  /**
   * Returns dispatch waves: groups of agent names eligible for parallel
   * execution. Wave 0 has no dependencies; wave N depends only on agents
   * in waves 0..N-1.
   */
  getDispatchWaves(graph: DependencyGraph): readonly string[][] {
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    for (const name of graph.nodes.keys()) {
      inDegree.set(name, 0);
      dependents.set(name, []);
    }

    for (const [name, deps] of graph.edges) {
      inDegree.set(name, deps.length);
      for (const dep of deps) {
        dependents.get(dep)!.push(name);
      }
    }

    const waves: string[][] = [];
    let remaining = new Set(graph.nodes.keys());

    while (remaining.size > 0) {
      const wave: string[] = [];

      for (const name of remaining) {
        if (inDegree.get(name)! === 0) {
          wave.push(name);
        }
      }

      if (wave.length === 0) {
        throw new DependencyGraphError(
          `Cycle detected among remaining nodes: [${[...remaining].join(', ')}]`,
          [...remaining],
        );
      }

      wave.sort();
      waves.push(wave);

      for (const name of wave) {
        remaining.delete(name);
        for (const dependent of dependents.get(name)!) {
          inDegree.set(dependent, inDegree.get(dependent)! - 1);
        }
      }
    }

    return waves;
  }

  /** Serializes the graph to a plain object for audit/debugging. */
  toJSON(graph: DependencyGraph): object {
    const nodes: Record<
      string,
      { role: string; dependencies: readonly string[] }
    > = {};

    for (const [name, envelope] of graph.nodes) {
      nodes[name] = {
        role: envelope.role,
        dependencies: graph.edges.get(name) ?? [],
      };
    }

    return { nodes };
  }

  /** DFS-based cycle detection with visiting/visited tracking. */
  private detectCycles(
    nodes: ReadonlyMap<string, TaskEnvelope>,
    edges: ReadonlyMap<string, readonly string[]>,
  ): void {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const path: string[] = [];

    const dfs = (name: string): void => {
      if (visited.has(name)) return;

      if (visiting.has(name)) {
        const cycleStart = path.indexOf(name);
        const cycle = path.slice(cycleStart);
        cycle.push(name);
        throw new DependencyGraphError(
          `Circular dependency detected: ${cycle.join(' -> ')}`,
          cycle,
        );
      }

      visiting.add(name);
      path.push(name);

      for (const dep of edges.get(name) ?? []) {
        dfs(dep);
      }

      path.pop();
      visiting.delete(name);
      visited.add(name);
    };

    for (const name of nodes.keys()) {
      dfs(name);
    }
  }
}
