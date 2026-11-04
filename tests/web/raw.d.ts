// The web tests run in Node but the project is typed without its types: only what a test reads source files with.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string
}
