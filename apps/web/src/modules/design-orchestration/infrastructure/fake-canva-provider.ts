/**
 * @deprecated Use mockDesignProvider from ./mock-design-provider instead.
 *
 * This re-export exists only for backward compatibility with any code
 * that still imports fakeCanvaProvider by name.  It is a direct alias
 * for the provider-neutral mockDesignProvider.
 *
 * This file will be removed in a follow-up cleanup once all import sites
 * have been updated to use mockDesignProvider or getDesignExecutionProvider().
 */

export { mockDesignProvider as fakeCanvaProvider } from "./mock-design-provider";
