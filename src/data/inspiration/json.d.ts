// The corpus JSON is loaded via dynamic import (Vite handles JSON natively);
// the project doesn't enable `resolveJsonModule`, so type the two chunks here.
declare module '@/data/inspiration/*.json' {
  const value: unknown[];
  export default value;
}
