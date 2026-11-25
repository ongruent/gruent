plugins {
  kotlin("jvm")
  kotlin("plugin.serialization") version "2.0.0"
  application
}

dependencies {
  implementation(project(":libs:engine:steps:api"))
  implementation(project(":libs:engine:steps:kotlin"))

  // Built-in steps. They register through META-INF/services, like external step packages would.
  runtimeOnly(project(":libs:engine:steps:plugins:timer-source:v1"))
  runtimeOnly(project(":libs:engine:steps:plugins:http-source:v1"))
  runtimeOnly(project(":libs:engine:steps:plugins:log:v1"))
  runtimeOnly(project(":libs:engine:steps:plugins:existence:v1"))
  runtimeOnly(project(":libs:engine:steps:plugins:compare:v1"))
  runtimeOnly(project(":libs:engine:steps:plugins:transform:v1"))
  runtimeOnly(project(":libs:engine:steps:plugins:http-response:v1"))
  runtimeOnly(project(":libs:engine:steps:plugins:relational-db:v1"))

  implementation(libs.kotlinx.serialization.json)
  implementation("io.nats:jnats:2.20.4")

  // Channel execution telemetry, exported over OTLP to the shared collector
  implementation(platform("io.opentelemetry:opentelemetry-bom:1.43.0"))
  implementation("io.opentelemetry:opentelemetry-api")
  implementation("io.opentelemetry:opentelemetry-sdk")
  implementation("io.opentelemetry:opentelemetry-exporter-otlp")

  // Process logs
  implementation("org.slf4j:slf4j-api:2.0.13")
  runtimeOnly(libs.logback.classic)

  testImplementation(platform(libs.junit.bom))
  testImplementation(libs.junit.jupiter)
  testImplementation(libs.junit.jupiter.params)
  testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")
  testImplementation("io.opentelemetry:opentelemetry-sdk-testing")
  testImplementation(project(":libs:engine:steps:plugins:timer-source:v1"))
  testImplementation(project(":libs:engine:steps:plugins:log:v1"))
  testImplementation(project(":libs:engine:steps:plugins:existence:v1"))
  testImplementation(project(":libs:engine:steps:plugins:http-source:v1"))
  testImplementation(project(":libs:engine:steps:plugins:http-response:v1"))
  testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

application {
  applicationName = "runtime"
  mainClass.set("com.gruent.runtime.MainKt")
}
