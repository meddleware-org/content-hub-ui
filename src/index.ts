// Library entry point: hosts import ContentHubView to render the admin console inline. It talks only to the
// same-origin admin API (/api/v1), so a host must serve it on the admin host behind the same access policy.
// The console view, for a host to render inline.
export { default as ContentHubView } from './ContentHubView.vue'
// The options a host may pass to substitute `fetch` and the sign-in reload.
export type { ConsoleOptions } from './console.js'
