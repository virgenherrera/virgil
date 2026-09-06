import { Injectable } from '@nestjs/common';
import type { TaskEnvelope } from './task-envelope.schema.js';
import { DependencyGraphError } from './orchestration.errors.js';

export interface DependencyGraph {
  readonly nodes: ReadonlyMap<string, TaskEnvelope>;
  readonly edges: ReadonlyMap<string, readonly string[]>;
}

@Injectable()
export class DependencyGraphService {
  buildGraph(envelopes: readonly TaskEnvelope[]): DependencyGraph {
    const nodes = new Map<string, TaskEnvelope>();
    const edges = new Map<string, readonly string[]>();

    for (const envelope of envelopes) {
      if (nodes.has(envelope.name)) throw new DependencyGraphError(`Duplicate task name: "${envelope.name}"`, [envelope.name]);
      nodes.set(envelope.name, envelope);
      edges.set(envelope.name, envelope.dependencies);
    }

    for (const [name, deps] of edges) {
      for (const dep of deps) {
        if (!nodes.has(dep)) throw new DependencyGraphError(`Task "${name}" depends on unknown task "${dep}"`, [name, dep]);
      }
    }

    this.detectCycles(nodes, edges);
    return { nodes, edges };
  }

  getDispatchWaves(graph: DependencyGraph): readonly string[][] {
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    for (const name of graph.nodes.keys()) {
      inDegree.set(name, 0);
      dependents.set(name, []);
    }

    for (const [name, deps] of graph.edges) {
      inDegree.set(name, deps.length);
      for (const dep of deps) { dependents.get(dep)!.push(name); }
    }

    const waves: string[][] = [];
    let remaining = new Set(graph.nodes.keys());

    while (remaining.size > 0) {
      const wave: string[] = [];
      for (const name of remaining) {
        if (inDegree.get(name)! === 0) wave.push(name);
      }
      if (wave.length === 0) throw new DependencyGraphError(`Cycle detected among remaining nodes: [${[...remaining].join(', ')}]`, [...remaining]);
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

  toJSON(graph: DependencyGraph): object {
    const nodes: Record<string, { role: string; dependencies: readonly string[] }> = {};
    for (const [name, envelope] of graph.nodes) {
      nodes[name] = { role: envelope.role, dependencies: graph.edges.get(name) ?? [] };
    }
    return { nodes };
  }

  private detectCycles(nodes: ReadonlyMap<string, TaskEnvelope>, edges: ReadonlyMap<string, readonly string[]>): void {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const path: string[] = [];

    const dfs = (name: string): void => {
      if (visited.has(name)) return;
      if (visiting.has(name)) {
        const cycleStart = path.indexOf(name);
        const cycle = path.slice(cycleStart);
        cycle.push(name);
        throw new DependencyGraphError(`Circular dependency detected: ${cycle.join(' -> ')}`, cycle);
      }
      visiting.add(name);
      path.push(name);
      for (const dep of edges.get(name) ?? []) dfs(dep);
      path.pop();
      visiting.delete(name);
      visited.add(name);
    };

    for (const name of nodes.keys()) dfs(name);
  }
}
