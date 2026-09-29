export type ProjectCollaborator = { id: string; name: string; active: boolean };

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR").trim();
}

export function matchProjectCollaborator(people: ProjectCollaborator[], spokenName: string) {
  const wanted = normalize(spokenName);
  if (!wanted) return { status: "missing" as const, id: null };
  const active = people.filter((person) => person.active);
  const exact = active.filter((person) => normalize(person.name) === wanted);
  const matches = exact.length ? exact : active.filter((person) => normalize(person.name).split(/\s+/).includes(wanted));
  return matches.length === 1
    ? { status: "found" as const, id: matches[0].id }
    : { status: matches.length ? "ambiguous" as const : "missing" as const, id: null };
}
