// Standalone SPA bootstrap: the design-token and ui base stylesheets, then the App shell. (The library
// path, src/index.ts, exports ContentHubView and leaves global styles to the host.)
import '@meddleware/design-tokens/tokens.css'
import '@meddleware/design-tokens/seasons.css'
import '@meddleware/ui/base.css'
import { createApp } from 'vue'
import { useSeason } from '@meddleware/ui'
import App from './App.vue'

useSeason()
createApp(App).mount('#app')
