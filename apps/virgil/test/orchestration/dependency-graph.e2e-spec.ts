import { DependencyGraphService } from '../../src/orchestration/dependency-graph.service.js';
import { DependencyGraphError } from '../../src/orchestration/orchestration.errors.js';
import type { TaskEnvelope } from '../../src/orchestration/task-envelope.schema.js';
import { TaskEnvelopeSchema } from '../../src/orchestration/task-envelope.schema.js';

function makeTaskEnvelope(name: string, dependencies: string[] = []): TaskEnvelope {
  return TaskEnvelopeSchema.parse({
    name,
    role: 'analysis',
    objective: `Objective for ${name}`,
    scope: ['scope-1'],
    deliverables: ['output.md'],
    acceptanceCriteria: ['done'],
    tier: 'worker' as const,
    dependencies,
  });
}

describe('DependencyGraphService', () => {
  let service: DependencyGraphService;

  beforeEach(() => {
    service = new DependencyGraphService();
  });

  describe('buildGraph', () => {
    it('builds a graph with no dependencies', () => {
      const envelopes = [makeTaskEnvelope('a'), makeTaskEnvelope('b')];
      const graph = service.buildGraph(envelopes);
      expect(graph.nodes.size).toBe(2);
      expect(graph.edges.get('a')).toEqual([]);
      expect(graph.edges.get('b')).toEqual([]);
    });

    it('builds a graph with dependencies', () => {
      const envelopes = [makeTaskEnvelope('a'), makeTaskEnvelope('b', ['a'])];
      const graph = service.buildGraph(envelopes);
      expect(graph.edges.get('b')).toEqual(['a']);
    });

    it('throws DependencyGraphError for duplicate task name', () => {
      const envelopes = [makeTaskEnvelope('a'), makeTaskEnvelope('a')];
      expect(() => service.buildGraph(envelopes)).toThrow(DependencyGraphError);
      try {
        service.buildGraph(envelopes);
      } catch (error) {
        expect((error as DependencyGraphError).involvedNodes).toContain('a');
      }
    });

    it('throws DependencyGraphError for missing dependency', () => {
      const envelopes = [makeTaskEnvelope('a', ['nonexistent'])];
      expect(() => service.buildGraph(envelopes)).toThrow(DependencyGraphError);
      try {
        service.buildGraph(envelopes);
      } catch (error) {
        const err = error as DependencyGraphError;
        expect(err.involvedNodes).toContain('a');
        expect(err.involvedNodes).toContain('nonexistent');
      }
    });

    it('throws DependencyGraphError for circular dependency', () => {
      const envelopes = [makeTaskEnvelope('a', ['b']), makeTaskEnvelope('b', ['a'])];
      expect(() => service.buildGraph(envelopes)).toThrow(DependencyGraphError);
      try {
        service.buildGraph(envelopes);
      } catch (error) {
        expect((error as DependencyGraphError).message).toContain('Circular');
      }
    });
  });

  describe('getDispatchWaves', () => {
    it('returns all tasks in one wave when no dependencies', () => {
      const envelopes = [makeTaskEnvelope('a'), makeTaskEnvelope('b'), makeTaskEnvelope('c')];
      const graph = service.buildGraph(envelopes);
      const waves = service.getDispatchWaves(graph);
      expect(waves).toHaveLength(1);
      expect(waves[0]).toEqual(['a', 'b', 'c']);
    });

    it('returns correct waves with linear dependencies', () => {
      const envelopes = [
        makeTaskEnvelope('a'),
        makeTaskEnvelope('b', ['a']),
        makeTaskEnvelope('c', ['b']),
      ];
      const graph = service.buildGraph(envelopes);
      const waves = service.getDispatchWaves(graph);
      expect(waves).toHaveLength(3);
      expect(waves[0]).toEqual(['a']);
      expect(waves[1]).toEqual(['b']);
      expect(waves[2]).toEqual(['c']);
    });

    it('returns correct waves with diamond dependencies', () => {
      const envelopes = [
        makeTaskEnvelope('root'),
        makeTaskEnvelope('left', ['root']),
        makeTaskEnvelope('right', ['root']),
        makeTaskEnvelope('final', ['left', 'right']),
      ];
      const graph = service.buildGraph(envelopes);
      const waves = service.getDispatchWaves(graph);
      expect(waves).toHaveLength(3);
      expect(waves[0]).toEqual(['root']);
      expect(waves[1]).toEqual(['left', 'right']);
      expect(waves[2]).toEqual(['final']);
    });
  });

  describe('toJSON', () => {
    it('serializes graph to JSON-friendly object', () => {
      const envelopes = [makeTaskEnvelope('a'), makeTaskEnvelope('b', ['a'])];
      const graph = service.buildGraph(envelopes);
      const json = service.toJSON(graph) as { nodes: Record<string, { role: string; dependencies: string[] }> };
      expect(json.nodes['a'].role).toBe('analysis');
      expect(json.nodes['a'].dependencies).toEqual([]);
      expect(json.nodes['b'].dependencies).toEqual(['a']);
    });
  });
});
