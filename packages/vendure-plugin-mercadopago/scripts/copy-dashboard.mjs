// The dashboard extension is shipped as source: the dashboard build compiles it with the app.
import { cpSync, rmSync } from 'node:fs';

rmSync('dist/dashboard', { recursive: true, force: true });
cpSync('src/dashboard', 'dist/dashboard', { recursive: true });
