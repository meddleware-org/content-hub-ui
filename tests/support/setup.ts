// jsdom lacks the modal <dialog> methods UiDialog uses; this gives it the same open/close state a browser has.
import { installDialogShim } from '@meddleware/frontend-config/vitest'

installDialogShim()
