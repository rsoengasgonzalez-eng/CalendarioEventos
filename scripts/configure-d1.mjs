import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const databaseName = process.argv[2] || process.env.D1_DATABASE_NAME || 'planes-con-alma';
let output;
try {
  output = execFileSync('npx', ['wrangler', 'd1', 'list', '--json'], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });
} catch {
  console.error('No se pudo consultar Cloudflare. Ejecuta primero: npx wrangler login');
  process.exit(1);
}

let databases;
try {
  const start = output.indexOf('[');
  databases = JSON.parse(output.slice(start));
} catch {
  console.error('Wrangler no devolvió una lista D1 válida.');
  process.exit(1);
}

const database = databases.find(item => item.name === databaseName);
if (!database) {
  console.error(`No existe una base D1 llamada "${databaseName}".`);
  console.error('Bases encontradas:', databases.map(item => item.name).join(', ') || 'ninguna');
  console.error(`Créala con: npx wrangler d1 create ${databaseName}`);
  process.exit(1);
}

const id = database.uuid || database.id;
if (!id) {
  console.error('La base encontrada no contiene uuid/id.');
  process.exit(1);
}

const path = new URL('../wrangler.toml', import.meta.url);
let config = readFileSync(path, 'utf8');
config = config.replace(/\n# BEGIN MANAGED D1[\s\S]*?# END MANAGED D1\n?/g, '\n');
config += `\n# BEGIN MANAGED D1\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "${databaseName}"\ndatabase_id = "${id}"\n# END MANAGED D1\n`;
writeFileSync(path, config);
console.log(`D1 configurada: ${databaseName} (${id}) -> binding DB`);
