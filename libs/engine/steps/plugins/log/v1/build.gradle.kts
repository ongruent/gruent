// Runtime implementation of this step library definition. The group is unique per plugin type, since every
// version module is named v<N>. Included by settings.gradle.kts because this
// directory has a build file; the runtime discovers the step through META-INF/services.
plugins {
  kotlin("jvm")
  `java-library`
}

group = "com.gruent.steps.plugins.log"

dependencies {
  api(project(":libs:engine:steps:api"))
  implementation(project(":libs:engine:steps:kotlin"))

  testImplementation(platform(libs.junit.bom))
  testImplementation(libs.junit.jupiter)
  testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")
  testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}
