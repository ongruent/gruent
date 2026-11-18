pluginManagement {
  repositories {
    gradlePluginPortal()
    mavenCentral()
  }
}

plugins {
  id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

rootProject.name = "gruent"

// ---- Explicit modules
include(":services:runtime")
include(":libs:engine:steps:api")

include(":libs:engine:steps:kotlin")

// ---- Dynamic discovery of plugin implementation modules
// Expect structure: libs/engine/steps/plugins/<pluginType>/v<N>, included only when it contains a
// build.gradle.kts. Definitions without an implementation (or consumed only as step.json + plugin.wasm
// packages) need no Gradle module.
val pluginsRoot = file("libs/engine/steps/plugins")
if (pluginsRoot.exists()) {
  pluginsRoot.listFiles { f -> f.isDirectory }?.forEach { pluginType ->
    pluginType.listFiles { f -> f.isDirectory && f.resolve("build.gradle.kts").exists() }?.forEach { version ->
      val path = ":libs:engine:steps:plugins:${pluginType.name}:${version.name}"
      include(path)
      project(path).projectDir = version
    }
  }
}
