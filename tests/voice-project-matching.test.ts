import test from "node:test";
import assert from "node:assert/strict";
import { matchProjectCollaborator } from "../lib/voice-project-matching";

test("la dictée ne choisit jamais arbitrairement un collaborateur ambigu ou inactif", () => {
  const team = [
    { id: "1", name: "Lucas Martin", active: true },
    { id: "2", name: "Lucas Moreau", active: true },
    { id: "3", name: "Élodie Bernard", active: true },
    { id: "4", name: "Hugo", active: false },
  ];
  assert.equal(matchProjectCollaborator(team, "Lucas").status, "ambiguous");
  assert.deepEqual(matchProjectCollaborator(team, "Elodie Bernard"), { status: "found", id: "3" });
  assert.equal(matchProjectCollaborator(team, "Hugo").status, "missing");
});
