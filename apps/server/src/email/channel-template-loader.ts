import { Injector, RequestContext } from '@vendure/core';
import type { LoadTemplateInput, Partial, TemplateLoader } from '@vendure/email-plugin';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Channel codes become folder names, so only plain ones are accepted. */
const SAFE_CHANNEL_CODE = /^[A-Za-z0-9_-]+$/;

/**
 * Loads email templates with a per-store override (PRD 6.3, V9):
 *
 *   1. `<overridesDir>/<channel code>/<type>/<template>`  the store's own template
 *   2. each directory of `fallbackDirs`, in order         platform templates, then Vendure's
 *
 * A store that has no folder simply gets the platform templates.
 */
export class ChannelTemplateLoader implements TemplateLoader {
  constructor(
    private readonly overridesDir: string,
    private readonly fallbackDirs: string[],
  ) {}

  async loadTemplate(
    _injector: Injector,
    ctx: RequestContext,
    { type, templateName }: LoadTemplateInput,
  ): Promise<string> {
    const candidates = [
      ...(SAFE_CHANNEL_CODE.test(ctx.channel.code)
        ? [path.join(this.overridesDir, ctx.channel.code)]
        : []),
      ...this.fallbackDirs,
    ].map((dir) => path.join(dir, type, templateName));

    for (const candidate of candidates) {
      try {
        return await fs.readFile(candidate, 'utf-8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    throw new Error(`Email template "${type}/${templateName}" was not found.`);
  }

  async loadPartials(): Promise<Partial[]> {
    const partials = new Map<string, string>();
    // Later directories have lower priority, so they are read first and then overridden.
    for (const dir of [...this.fallbackDirs].reverse()) {
      const folder = path.join(dir, 'partials');
      const files = await fs.readdir(folder).catch(() => [] as string[]);
      for (const file of files) {
        partials.set(
          path.basename(file, '.hbs'),
          await fs.readFile(path.join(folder, file), 'utf-8'),
        );
      }
    }
    return [...partials].map(([name, content]) => ({ name, content }));
  }
}
