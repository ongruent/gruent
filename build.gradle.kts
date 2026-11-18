plugins {
  // make Kotlin available, but do NOT apply it here
  id("org.jetbrains.kotlin.jvm") version "2.0.0" apply false
}

allprojects {
  repositories { mavenCentral() }
}

subprojects {
  // Configure ONLY projects that actually apply the Kotlin plugin
  plugins.withId("org.jetbrains.kotlin.jvm") {
    // Toolchain
    extensions.configure(
      org.jetbrains.kotlin.gradle.dsl.KotlinJvmProjectExtension::class.java
    ) {
      jvmToolchain(21)
    }

    // Kotlin compile options (Kotlin 2.x API)
    tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile::class.java).configureEach {
      compilerOptions.jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21)
      // compilerOptions.freeCompilerArgs.add("-Xjsr305=strict")
    }

    // Tests on JUnit Platform
    tasks.withType(Test::class.java).configureEach {
      useJUnitPlatform()
    }
  }

  // Java-only projects (like :libs:engine:steps:api) still get JUnit Platform
  tasks.withType(Test::class.java).configureEach { useJUnitPlatform() }
}

// ---- Helper aggregate tasks
tasks.register("buildSteps") {
  // Extract just the task paths during configuration
  val bundleTaskPaths = subprojects
    .filter { p ->
      p.path.startsWith(":libs:engine:steps:plugins:") &&
      p.tasks.findByName("bundleStep") != null
    }
    .map { "${it.path}:bundleStep" }
  
  dependsOn(bundleTaskPaths)
}

tasks.register("distSteps") {
  dependsOn("buildSteps")
  
  // Extract step metadata during configuration phase
  val stepProjectsData = subprojects
    .filter { it.path.startsWith(":libs:engine:steps:plugins:") }
    .mapNotNull { p ->
      val stepJsonFile = p.projectDir.resolve("step.json")
      if (!stepJsonFile.exists()) {
        null
      } else {
        try {
          // Read and parse JSON during configuration time
          val stepJsonText = stepJsonFile.readText()
          val stepJson = groovy.json.JsonSlurper().parseText(stepJsonText) as Map<*, *>
          mapOf(
            "path" to p.path,
            "projectDir" to p.projectDir.absolutePath,
            "category" to (stepJson["category"] as String),
            "name" to (stepJson["name"] as String),
            "version" to (stepJson["version"] as String)
          )
        } catch (e: Exception) {
          println("Warning: Could not parse step.json for project ${p.path}: ${e.message}")
          null
        }
      }
    }
  
  // Capture the root layout during configuration
  val rootBuildDir = layout.buildDirectory
  
  doLast {
    val dest = rootBuildDir.dir("dist/steps").get().asFile
    dest.mkdirs()

    stepProjectsData.forEach { projectInfo ->
      val projectDir = projectInfo["projectDir"] as String
      val stepCategory = projectInfo["category"] as String
      val stepName = projectInfo["name"] as String
      val stepVersion = projectInfo["version"] as String
      
      
      // Construct the jar path using standard File operations
      val jarFile = File("$projectDir/build/libs/$stepCategory-$stepName-$stepVersion.jar")
      
      if (jarFile.exists()) {
        println("Copying step $stepCategory-$stepName-$stepVersion to $dest/$stepCategory-$stepName-$stepVersion.jar...")
        jarFile.copyTo(
          target = File(dest, "$stepCategory-$stepName-$stepVersion.jar"),
          overwrite = true
        )
      } else {
        println("Warning: JAR file not found for $stepCategory-$stepName-$stepVersion: $jarFile")
      }
    }
  }
}

tasks.register("buildRuntime") {
  // Extract serializable data during configuration
  val runtimeProjectsData = subprojects
    .filter { it.path.startsWith(":services:runtime") }
    .map { p ->
      mapOf(
        "name" to p.name,
        "path" to p.path
      )
    }
  
  // Get the root project layout during configuration
  val rootBuildDir = layout.buildDirectory
  
  doLast {
    val dest = rootBuildDir.dir("dist/runtime").get().asFile
    dest.mkdirs()
    
    runtimeProjectsData.forEach { projectInfo ->
      val projectName = projectInfo["name"] as String
      val projectPath = projectInfo["path"] as String
      
      // Construct the jar path using the captured root build dir
      val jarFile = rootBuildDir
        .dir("../..${projectPath.replace(':', '/')}/build/libs/${projectName}-all.jar")
        .get().asFile
      
      if (jarFile.exists()) {
        jarFile.copyTo(File(dest, jarFile.name), overwrite = true)
      }
    }
  }
}