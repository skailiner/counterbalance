import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
const root = process.cwd(),
  publicMode = process.argv.includes('--public');
const skip = new Set([
  'node_modules',
  '.git',
  '.wrangler',
  '.vinext',
  '.next',
  'dist',
  'work',
  'outputs',
]);
const textExtensions = /\.(?:tsx?|m?[jc]s|json|html|css|md|svg|txt|yml|yaml)$/u;
const secrets = [
  /\bsk-[A-Za-z0-9_-]{20,}/u,
  /\bhf_[A-Za-z0-9]{20,}/u,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/u,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
];
const privateMetadata =
  /appgprj_|appgdep_|appgver_|skaihai\.chatgpt\.site|git\.chatgpt-team\.site/u;
function files(dir, source) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (
      source &&
      (skip.has(e.name) ||
        e.name.startsWith('.env') ||
        e.name === 'PRIVATE_RELEASE.md')
    )
      return [];
    const path = join(dir, e.name);
    if (e.isSymbolicLink()) return [];
    return e.isDirectory() ? files(path, source) : [path];
  });
}
let checked = 0;
for (const path of [
  ...files(root, true),
  ...files(join(root, 'dist', 'client'), false),
]) {
  if (!textExtensions.test(path)) continue;
  const text = readFileSync(path, 'utf8');
  checked++;
  if (secrets.some((pattern) => pattern.test(text)))
    throw new Error('Credential-like material in ' + relative(root, path));
  if (
    publicMode &&
    privateMetadata.test(text) &&
    !path.endsWith('check-release.mjs')
  )
    throw new Error(
      'Private hosting metadata in public release: ' + relative(root, path),
    );
}
const hosting = JSON.parse(
  readFileSync(join(root, '.openai', 'hosting.json'), 'utf8'),
);
if (
  hosting.static?.directory !== 'dist/client' ||
  hosting.d1 !== null ||
  hosting.r2 !== null
)
  throw new Error('Expected local-only static hosting configuration.');
if (publicMode && hosting.project_id)
  throw new Error('Public source must not contain private project metadata.');
if (statSync(join(root, 'dist', 'client', 'index.html')).size < 1000)
  throw new Error('Missing meaningful built page.');
const artifacts = files(join(root, 'dist', 'client'), false);
if (!artifacts.some((p) => /analysis\.worker-[^/\\]+\.js$/u.test(p)))
  throw new Error('Missing compiled analysis worker.');
console.log(
  'PASS: ' +
    checked +
    ' text files checked; ' +
    artifacts.length +
    ' static artifacts; ' +
    (publicMode ? 'public' : 'private') +
    ' release configuration valid. This is not a dependency vulnerability audit.',
);
