// Kotlin consumer of the node contract: shared validation/codec support plus the generated configuration
// types in ../generated/kotlin (written by `nx run nodes:compile`, never edited by hand).
plugins {
  kotlin("jvm")
  `java-library`
}

group = "com.gruent.nodes"

sourceSets {
  main {
    kotlin.srcDir("../generated/kotlin")
  }
}

dependencies {
  api(libs.kotlinx.serialization.json)

  testImplementation(platform(libs.junit.bom))
  testImplementation(libs.junit.jupiter)
  testImplementation(libs.junit.jupiter.params)
  testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

val nodeLibraryRoot = layout.projectDirectory.dir("..").asFile.absolutePath

tasks.test {
  useJUnitPlatform()
  // Shared fixtures, definitions and the manifest are read from the node library root.
  systemProperty("nodes.root", nodeLibraryRoot)
  inputs.dir("../plugins")
  inputs.file("../generated/manifest.json")
}
