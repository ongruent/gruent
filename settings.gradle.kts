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
include(":libs:engine:nodes:api")

include(":libs:engine:nodes:kotlin")

// ---- Dynamic discovery of plugin implementation modules
// Expect structure: libs/engine/nodes/plugins/<pluginType>/v<N>, included only when it contains a
// build.gradle.kts. Definitions without an implementation (or consumed only as node.json + plugin.wasm
// packages) need no Gradle module.
val pluginsRoot = file("libs/engine/nodes/plugins")
if (pluginsRoot.exists()) {
  pluginsRoot.listFiles { f -> f.isDirectory }?.forEach { pluginType ->
    pluginType.listFiles { f -> f.isDirectory && f.resolve("build.gradle.kts").exists() }?.forEach { version ->
      val path = ":libs:engine:nodes:plugins:${pluginType.name}:${version.name}"
      include(path)
      project(path).projectDir = version
    }
  }
}
