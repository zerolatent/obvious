import { registerRootComponent } from "expo"

import App from "./App"

// registerRootComponent calls AppRegistry.registerComponent('main', () => App)
// and correctly configures the environment, whether running in Expo Go, a
// standalone build, or the web bundler.
registerRootComponent(App)
