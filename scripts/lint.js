#!/usr/bin/env node
/**
 * Garde de `yarn lint` : eslint --fix UNIQUEMENT sur des chemins explicites.
 *
 * Sans chemin, eslint 8 ne fait rien et sort en succès (faux vert) ; avec un glob large
 * (`src/` entier), `--fix` réécrirait les ~140 fichiers legacy encore en CRLF/ancien style —
 * blame détruit, conflits — sans que la CI le rattrape (elle ne vérifie que le diff de la PR).
 * D'où ce garde : pas de chemin → échec bruyant. Voir docs/domain-structure.md §2.j.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
if (!args.some((a) => !a.startsWith('-'))) {
  console.error('❌ yarn lint <fichiers|dossiers> — aucun chemin fourni.');
  console.error('   Jamais nu ni sur src/ entier : --fix réécrirait le legacy (docs/domain-structure.md §2.j).');
  process.exit(1);
}

// `eslint/bin/eslint.js` n'est pas dans les `exports` du package (eslint 8) — on passe par package.json.
const eslintBin = path.join(path.dirname(require.resolve('eslint/package.json')), 'bin', 'eslint.js');
const result = spawnSync(process.execPath, [eslintBin, '--fix', ...args], { stdio: 'inherit' });
process.exit(result.status ?? 1);
