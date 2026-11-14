import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { LandingSite } from '../data/sites'

interface LunarTerrain3DProps {
  site: LandingSite
  sunAzimuth: number
  sunElevation: number
  earthAzimuth: number
  earthElevation: number
  className?: string
}

const toRadians = (degrees: number) => degrees * Math.PI / 180

interface Lighting {
  sunAzimuth: number
  sunElevation: number
  earthAzimuth: number
  earthElevation: number
}

interface RayObjects {
  line: THREE.Line
  marker: THREE.Mesh
}

function directionFromAzEl(azimuth: number, elevation: number, length: number) {
  const az = toRadians(azimuth)
  const el = toRadians(elevation)
  const horizontal = Math.cos(el) * length
  return new THREE.Vector3(Math.sin(az) * horizontal, Math.sin(el) * length, Math.cos(az) * horizontal)
}

export function LunarTerrain3D({ site, sunAzimuth, sunElevation, earthAzimuth, earthElevation, className }: LunarTerrain3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const lightingRef = useRef<Lighting>({ sunAzimuth, sunElevation, earthAzimuth, earthElevation })
  const updateLightingRef = useRef<((lighting: Lighting) => void) | null>(null)
  lightingRef.current = { sunAzimuth, sunElevation, earthAzimuth, earthElevation }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#020617')
    scene.fog = new THREE.Fog('#020617', 13, 32)
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    camera.position.set(8, 7, 10)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    container.appendChild(renderer.domElement)

    const ambient = new THREE.HemisphereLight('#cbd5e1', '#111827', 1.05)
    scene.add(ambient)
    const sunLight = new THREE.DirectionalLight('#fff1cf', 2.8)
    sunLight.castShadow = true
    sunLight.shadow.mapSize.set(1024, 1024)
    sunLight.shadow.camera.left = -9
    sunLight.shadow.camera.right = 9
    sunLight.shadow.camera.top = 9
    sunLight.shadow.camera.bottom = -9
    sunLight.shadow.bias = -0.0005
    scene.add(sunLight)

    const terrainGroup = new THREE.Group()
    scene.add(terrainGroup)
    const size = 16
    const segments = 88
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments)
    geometry.rotateX(-Math.PI / 2)
    const positions = geometry.attributes.position as THREE.BufferAttribute
    const profile = site.horizonProfile.length ? site.horizonProfile : Array(36).fill(0)
    const interpolateHorizon = (azimuth: number) => {
      const index = ((azimuth % 360) + 360) % 360 / 10
      const a = Math.floor(index) % profile.length
      const b = (a + 1) % profile.length
      return THREE.MathUtils.lerp(profile[a], profile[b], index - Math.floor(index))
    }
    const isCrater = /haworth/i.test(site.id)
    const craterScale = isCrater ? 1 : /malapert/i.test(site.id) ? -0.55 : -0.15
    const baseElevation = THREE.MathUtils.clamp(site.elevationMeters / 5000, -0.45, 1) * 0.5
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i)
      const z = positions.getZ(i)
      const radius = Math.hypot(x, z)
      const azimuth = (Math.atan2(x, z) * 180 / Math.PI + 360) % 360
      const horizonHeight = Math.tan(toRadians(interpolateHorizon(azimuth))) * size * 0.32
      const craterBowl = isCrater ? -2.5 * Math.exp(-((radius / 3.1) ** 2)) + 1.35 * Math.exp(-(((radius - 5.5) / 1.15) ** 2)) : 0
      const massif = /malapert/i.test(site.id) ? 1.25 * Math.exp(-((radius / 3.5) ** 2)) : 0
      const ridge = /connecting/i.test(site.id) ? 0.45 * Math.sin((x + z) * 0.65) * Math.exp(-radius / 8) : 0
      const noise = 0.12 * Math.sin(x * 2.4 + z * 1.2) * Math.cos(z * 2.8 - x * 0.7) + 0.055 * Math.sin(x * 5.3 + z * 3.7)
      positions.setY(i, baseElevation + horizonHeight + craterScale * (0.1 * (radius / 8)) + craterBowl + massif + ridge + noise)
    }
    geometry.computeVertexNormals()
    const surface = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#666b70', roughness: 0.96, metalness: 0.04, flatShading: true }))
    surface.receiveShadow = true
    surface.castShadow = true
    terrainGroup.add(surface)
    const wire = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#aab3bd', wireframe: true, transparent: true, opacity: 0.18 }))
    wire.position.y = 0.008
    terrainGroup.add(wire)

    const beaconY = baseElevation + (isCrater ? -1.05 : 0.12)
    const beacon = new THREE.Group()
    beacon.position.set(0, beaconY, 0)
    const beaconStem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.6, 8), new THREE.MeshStandardMaterial({ color: '#dbeafe', emissive: '#22d3ee', emissiveIntensity: 0.35 }))
    beaconStem.position.y = 0.3
    beacon.add(beaconStem)
    const beaconGlow = new THREE.PointLight('#22d3ee', 1.6, 3)
    beaconGlow.position.y = 0.65
    beacon.add(beaconGlow)
    scene.add(beacon)

    const rayGroup = new THREE.Group()
    scene.add(rayGroup)
    const addRay = (color: string): RayObjects => {
      const lineGeometry = new THREE.BufferGeometry()
      const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })
      const line = new THREE.Line(lineGeometry, material)
      rayGroup.add(line)
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), new THREE.MeshBasicMaterial({ color }))
      rayGroup.add(marker)
      return { line, marker }
    }
    const sunRay = addRay('#f59e0b')
    const earthRay = addRay('#06b6d4')

    const ground = new THREE.GridHelper(24, 24, '#334155', '#1e293b')
    ground.position.y = -0.8
    scene.add(ground)

    let azimuth = Math.PI / 4
    let polar = 1.05
    let distance = 14
    let dragging = false
    let previousX = 0
    let previousY = 0
    const updateCamera = () => {
      polar = THREE.MathUtils.clamp(polar, 0.25, Math.PI / 2.05)
      camera.position.set(distance * Math.sin(polar) * Math.sin(azimuth), distance * Math.cos(polar), distance * Math.sin(polar) * Math.cos(azimuth))
      camera.lookAt(0, 0, 0)
    }
    const onPointerDown = (event: PointerEvent) => { dragging = true; previousX = event.clientX; previousY = event.clientY; renderer.domElement.setPointerCapture(event.pointerId) }
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return
      azimuth -= (event.clientX - previousX) * 0.008
      polar -= (event.clientY - previousY) * 0.008
      previousX = event.clientX
      previousY = event.clientY
      updateCamera()
      renderer.render(scene, camera)
    }
    const onPointerUp = () => { dragging = false }
    const onWheel = (event: WheelEvent) => {
      distance = THREE.MathUtils.clamp(distance + event.deltaY * 0.01, 8, 24)
      updateCamera()
      renderer.render(scene, camera)
    }
    const resizeObserver = new ResizeObserver(() => {
      const width = Math.max(1, container.clientWidth)
      const height = Math.max(1, container.clientHeight)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.render(scene, camera)
    })
    resizeObserver.observe(container)
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointercancel', onPointerUp)
    renderer.domElement.addEventListener('wheel', onWheel, { passive: true })
    updateCamera()

    sunLight.target.position.set(0, beaconY, 0)
    scene.add(sunLight.target)

    const updateRay = (ray: RayObjects, azimuth: number, elevation: number) => {
      const start = new THREE.Vector3(0, beaconY + 0.25, 0)
      const end = start.clone().add(directionFromAzEl(azimuth, elevation, 12))
      ray.line.geometry.setFromPoints([start, end])
      ray.marker.position.copy(end)
    }
    const updateLighting = (lighting: Lighting) => {
      sunLight.position.copy(directionFromAzEl(lighting.sunAzimuth, lighting.sunElevation, 10))
      updateRay(sunRay, lighting.sunAzimuth, lighting.sunElevation)
      updateRay(earthRay, lighting.earthAzimuth, lighting.earthElevation)
      renderer.render(scene, camera)
    }
    updateLightingRef.current = updateLighting
    updateLighting(lightingRef.current)

    return () => {
      updateLightingRef.current = null
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('pointercancel', onPointerUp)
      renderer.domElement.removeEventListener('wheel', onWheel)
      terrainGroup.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((material) => material.dispose())
        }
      })
      rayGroup.traverse((object) => {
        if (object instanceof THREE.Line || object instanceof THREE.Mesh) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((material) => material.dispose())
        }
      })
      beacon.traverse((object) => {
        if (object instanceof THREE.Mesh) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach((material) => material.dispose()) }
      })
      ground.geometry.dispose()
      ;(ground.material as THREE.Material).dispose()
      beaconStem.geometry.dispose()
      ;(beaconStem.material as THREE.Material).dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [site.id, site.lat, site.lon, site.elevationMeters, site.horizonProfile])

  useEffect(() => {
    updateLightingRef.current?.({ sunAzimuth, sunElevation, earthAzimuth, earthElevation })
  }, [sunAzimuth, sunElevation, earthAzimuth, earthElevation])

  return <div ref={containerRef} className={`h-full min-h-[320px] w-full touch-none overflow-hidden rounded-xl ${className ?? ''}`} aria-label={`Interactive 3D lunar terrain for ${site.name}`} />
}
