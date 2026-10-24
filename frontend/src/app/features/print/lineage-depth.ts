import type { PersonDto } from '@genealogie/shared';

/**
 * Number of generations actually present above and below a person, among
 * the loaded people (traversal protected against loops).
 */
export function lineageDepth(rootId: string, people: PersonDto[]): { ancestors: number; descendants: number } {
  const byId = new Map(people.map((person) => [person.id, person]));
  const depth = (next: (person: PersonDto) => (string | undefined)[]): number => {
    const seen = new Set([rootId]);
    let frontier = [rootId];
    let generations = 0;
    for (;;) {
      frontier = frontier
        .flatMap((id) => {
          const person = byId.get(id);
          return person ? next(person) : [];
        })
        .filter((id): id is string => !!id && byId.has(id) && !seen.has(id));
      frontier.forEach((id) => seen.add(id));
      if (frontier.length === 0) {
        return generations;
      }
      generations++;
    }
  };
  return {
    ancestors: depth((person) => [person.fatherId, person.motherId]),
    descendants: depth((person) => person.unions.flatMap((union) => union.childIds)),
  };
}
