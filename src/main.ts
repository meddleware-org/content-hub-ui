// Standalone SPA bootstrap: the design-token and ui reset stylesheets, then the App shell. (The library
// path, src/index.ts, exports ContentHubView and leaves global styles to the host.)
// The design tokens: every colour, space and type size the components use.
import '@meddleware/design-tokens/tokens.css'
// The seasonal accent colours that `useSeason` switches between.
import '@meddleware/design-tokens/seasons.css'
// The shared reset and base styles.
import '@meddleware/ui/reset.css'
// Vue's application factory.
import { createApp } from 'vue'
// Applies the seasonal accent colours.
import { useSeason } from '@meddleware/ui'
// The standalone shell.
import App from './App.vue'

// Apply the seasonal accent colours.
useSeason()
// Mount the application.
createApp(App).mount('#app')
