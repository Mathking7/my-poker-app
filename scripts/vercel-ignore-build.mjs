import { execFileSync } from 'node:child_process';

const BUILD_AFFECTING_PATTERNS = [
  /^src\//,
  /^public\//,
  /^index\.html$/,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^vite\.config\.[cm]?js$/,
  /^eslint\.config\.[cm]?js$/,
  /^tailwind\.config\.[cm]?js$/,
  /^postcss\.config\.[cm]?js$/,
  /^vercel\.json$/,
  /^scripts\/logic-tests\.mjs$/,
  /^scripts\/vercel-ignore-build\.mjs$/,
];

const runGit = (args) => execFileSync('git', args, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
}).trim();

const getChangedFiles = () => {
  try {
    runGit(['rev-parse', 'HEAD^']);
  } catch {
    return null;
  }

  try {
    return runGit(['diff', '--name-only', 'HEAD^', 'HEAD'])
      .split(/\r?\n/)
      .map((file) => file.replace(/\\/g, '/').trim())
      .filter(Boolean);
  } catch {
    return null;
  }
};

const changedFiles = getChangedFiles();

if (!changedFiles?.length) {
  console.log('No comparable file diff found; continuing Vercel build.');
  process.exit(1);
}

const buildAffectingFiles = changedFiles.filter((file) => (
  BUILD_AFFECTING_PATTERNS.some((pattern) => pattern.test(file))
));

if (buildAffectingFiles.length > 0) {
  console.log('Continuing Vercel build. Build-affecting files changed:');
  buildAffectingFiles.forEach((file) => console.log(`- ${file}`));
  process.exit(1);
}

console.log('Skipping Vercel build. Only docs, workflow, smoke, or Firebase rules files changed:');
changedFiles.forEach((file) => console.log(`- ${file}`));
process.exit(0);
