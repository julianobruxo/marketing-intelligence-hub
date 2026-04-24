/**
 * Mock Canva Provider alias.
 *
 * The real mock implementation lives in mock-design-provider.ts. This alias
 * exists so the registry can import a provider-specific name without changing
 * the underlying mock behavior.
 */

export { mockDesignProvider as mockCanvaProvider } from "./mock-design-provider";
