import fs from 'fs';
import path from 'path';
import { Eta } from 'eta';

export interface RenderTemplatesOptions {
  projectDir: string; // Destination project root
  templatesDir: string; // Absolute path to the templates root
  data?: Record<string, any>; // Data passed to Eta templates
  verbose?: boolean; // Log each rendered file
  /**
   * Optional per-file variable map.
   * Key: relative output path (e.g. 'src/app/page.tsx') OR template relative path (e.g. 'src/app/page.tsx.eta').
   * Value: object merged into the template data ONLY for that file.
   */
  variables?: Record<string, Record<string, any>>;
}

/**
 * Recursively renders all .eta template files under templatesDir into projectDir,
 * preserving the relative folder structure and stripping the trailing .eta extension.
 */
export async function renderTemplates(opts: RenderTemplatesOptions): Promise<void> {
  const { projectDir, templatesDir, data = {}, verbose = true, variables } = opts;
  if (!fs.existsSync(templatesDir)) {
    if (verbose) console.warn('[renderTemplates] templatesDir does not exist:', templatesDir);
    return;
  }
  const eta = new Eta({ views: templatesDir, cache: false });

  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.eta')) {
        const relFromTemplates = path.relative(templatesDir, full);
        const outRel = relFromTemplates.replace(/\.eta$/, '');
        const outPath = path.join(projectDir, outRel);
        const templateContent = fs.readFileSync(full, 'utf8');
        let rendered: string;
        const fileVars = (variables && (variables[outRel] || variables[relFromTemplates])) || {};
        const mergedData = { ...data, ...fileVars };
        try {
          rendered = eta.renderString(templateContent, mergedData);
        } catch (e) {
          throw new Error(`Failed rendering template ${relFromTemplates}: ${(e as Error).message}`);
        }
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, rendered);
        if (verbose) console.log('  •', outRel);
      }
    }
  };

  if (verbose) console.log('▶ Rendering Eta templates...');
  walk(templatesDir);
}

// Heuristic to detect if we're running the CLI from a development checkout (vs an installed npm package).
// We treat presence of a .git directory at the package root OR an explicit env flag as dev mode.
export const isDevEnvironment = (): boolean => {
  if (process.env.JR_SCRIPTS_FORCE_DEV === '1') return true;
  try {
    // Walk upward from current file to find nearest package.json (limit depth to avoid traversing entire FS)
    let dir = __dirname;
    for (let i = 0; i < 6; i++) {
      const pkgPath = path.join(dir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        // If a .git folder exists alongside package.json we assume a repo checkout
        const gitDir = path.join(dir, '.git');
        return fs.existsSync(gitDir);
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // ignore
  }
  return false;
};
