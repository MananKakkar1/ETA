import { useState, useEffect, useRef } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

/* added three.js imports */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'

function App() {
  const [count, setCount] = useState(0)

  // Chat state
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState([])
  const fileInputRef = useRef(null)

  /* three.js refs */
  const mountRef = useRef(null)
  const mixerRef = useRef(null)
  const requestRef = useRef(null)
  const modelRef = useRef(null)
  const fbxClipsRef = useRef([])

  useEffect(() => {
    // Setup three.js renderer, scene, camera
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf6f6f6)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.outputEncoding = THREE.sRGBEncoding
    mount.appendChild(renderer.domElement)

    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 1000)
    camera.position.set(0, 1.6, 2.5)

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6)
    hemi.position.set(0, 20, 0)
    scene.add(hemi)

    const dir = new THREE.DirectionalLight(0xffffff, 0.8)
    dir.position.set(5, 10, 7.5)
    scene.add(dir)

    const clock = new THREE.Clock()

    const gltfLoader = new GLTFLoader()
    const fbxLoader = new FBXLoader()

    let model = null
    // let mixer = null

    // Load GLB model
    gltfLoader.load(
      '/models/Avatar.glb',
      (gltf) => {
        model = gltf.scene
        modelRef.current = model
        model.traverse((c) => {
          if (c.isMesh) {
            c.castShadow = true
            c.receiveShadow = true
          }
        })
        scene.add(model)

        // scale the model down a tiny bit so it fits better in the frame
        model.scale.setScalar(1.05)
        
        // make model face forward (adjust if your asset uses a different forward axis)
        model.rotation.set(0, Math.PI, 0) // flip if model faces away; change to 0 if not needed

        // create mixer for model
        mixerRef.current = new THREE.AnimationMixer(model)

        // If an external FBX idle animation was loaded earlier, prefer that.
        if (fbxClipsRef.current && fbxClipsRef.current.length > 0) {
          mixerRef.current.stopAllAction()
          fbxClipsRef.current.forEach((clip) => {
            try {
              const action = mixerRef.current.clipAction(clip)
              action.reset().play()
            } catch (e) {
              console.warn('Failed to play FBX clip on model', e)
            }
          })
        } else if (gltf.animations && gltf.animations.length > 0) {
          // fallback to GLB's own animations
          try {
            const action = mixerRef.current.clipAction(gltf.animations[0])
            action.play()
          } catch (e) {
            console.warn('Failed to play GLB animation', e)
          }
        }

        // adjust camera to fit model
        const box = new THREE.Box3().setFromObject(model)
        const size = box.getSize(new THREE.Vector3()).length()
        const center = box.getCenter(new THREE.Vector3())
        const height = box.max.y - box.min.y

        // move the model down so its feet sit lower in the view.
        // tweak the multiplier (0.25-0.45) to taste.
        const downOffset = height * 0.35
        model.position.copy(center)
        model.position.y -= downOffset

        // recompute center after shifting model so camera/lookAt are correct
        const newBox = new THREE.Box3().setFromObject(model)
        const newCenter = newBox.getCenter(new THREE.Vector3())

        // position camera relative to model center — lower the camera a bit to show more of the lower body
        const camOffset = new THREE.Vector3(size * 0.7, size * 0.15, size * 0.7)
        camera.position.copy(newCenter).add(camOffset)
        camera.lookAt(newCenter)

        // orient model to face the camera (use lookAt then correct for forward axis)
        // keep model upright (use newCenter's y)
        model.lookAt(new THREE.Vector3(camera.position.x, newCenter.y, camera.position.z))
        model.rotation.x = 0
        model.rotation.z = 0

        // ensure forward faces the camera; if not, rotate 180deg
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(model.quaternion).normalize()
        const toCamera = new THREE.Vector3().subVectors(camera.position, model.position).normalize()
        if (forward.dot(toCamera) < 0) {
          model.rotateY(Math.PI)
        }
      },
      undefined,
      (err) => {
        console.error('Error loading Avatar.glb', err)
      }
    )

    // Try to load external FBX animation and apply to the GLB model
    // Idle.fbx should sit at public/animation/Idle.fbx -> served at /animation/Idle.fbx
    fbxLoader.load(
      '/animation/Idle.fbx',
      (fbx) => {
        // store clips so they can be applied once the GLB model is ready
        fbxClipsRef.current = fbx.animations || []

        if (fbxClipsRef.current.length === 0) {
          console.warn('FBX loaded but contains no animations')
          return
        }

        // If model already loaded, create mixer and play FBX clips immediately.
        if (modelRef.current) {
          mixerRef.current = mixerRef.current || new THREE.AnimationMixer(modelRef.current)
          mixerRef.current.stopAllAction()
          fbxClipsRef.current.forEach((clip) => {
            try {
              const action = mixerRef.current.clipAction(clip)
              action.reset().play()
            } catch (e) {
              console.warn('Failed to apply FBX clip to model', e)
            }
          })
          console.log('Applied FBX animation(s) from /animation/Idle.fbx')
        } else {
          // model not ready yet — they'll be applied when the GLB loads
          console.log('FBX animations cached; will apply when GLB model loads')
        }
      },
      undefined,
      (err) => {
        console.warn('No FBX animation loaded or failed to load /animation/Idle.fbx', err)
      }
    )

    // simple auto-rotate (visual), but user cannot interact - no OrbitControls added
    function animate() {
      const delta = clock.getDelta()
      if (mixerRef.current) mixerRef.current.update(delta)

      // removed autonomous rotation so the model stays still
      // if (model) {
      //   model.rotation.y += 0.002
      // }

      renderer.render(scene, camera)
      requestRef.current = requestAnimationFrame(animate)
    }
    animate()

    // handle resize
    function onResize() {
      if (!mount) return
      const w = mount.clientWidth
      const h = mount.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(requestRef.current)
      window.removeEventListener('resize', onResize)
      if (mixerRef.current) {
        mixerRef.current.stopAllAction()
        mixerRef.current.uncacheRoot(model)
      }
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  function handleFilesChange(e) {
    const files = Array.from(e.target.files || [])
    setAttachments(files)
  }

  function handleSend() {
    if (!text.trim() && attachments.length === 0) return
    const msg = {
      id: Date.now(),
      sender: 'You',
      text: text.trim(),
      attachments: attachments.map((f) => ({ name: f.name, url: URL.createObjectURL(f), size: f.size })),
      ts: new Date().toISOString(),
    }
    setMessages((m) => [...m, msg])
    setText('')
    setAttachments([])
    if (fileInputRef.current) fileInputRef.current.value = ''
    // NOTE: integrate real model/chat backend here later
  }

  function handleAttachClick() {
    fileInputRef.current?.click()
  }

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>

      <h1>Vite + React — ETA</h1>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* 3D Avatar viewer (three.js canvas). User cannot move the model. */}
        <div style={{ width: 400, border: '1px solid #ddd', padding: 8, borderRadius: 8 }}>
          <div
            ref={mountRef}
            style={{ width: '100%', height: 400, background: '#f6f6f6' }}
          />
          <div style={{ marginTop: 8, fontSize: 14 }}>
            Virtual Teaching Assistant (Avatar.glb) — animation from /animation/Idle.fbx (if present)
          </div>
        </div>

        {/* Chat UI */}
        <div style={{ flex: 1, maxWidth: 600 }}>
          <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, height: 480, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: 8 }}>
              {messages.length === 0 && <div style={{ color: '#666' }}>No messages yet. Say hello to the Virtual TA.</div>}
              {messages.map((m) => (
                <div key={m.id} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: '#333' }}><strong>{m.sender}</strong> <span style={{ color: '#888', fontSize: 11 }}>{new Date(m.ts).toLocaleTimeString()}</span></div>
                  {m.text && <div style={{ padding: '6px 8px', background: '#eef', borderRadius: 6, display: 'inline-block', marginTop: 4 }}>{m.text}</div>}
                  {m.attachments && m.attachments.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      {m.attachments.map((a, i) => (
                        <div key={i}>
                          <a href={a.url} download={a.name} rel="noopener noreferrer">{a.name}</a> <span style={{ color: '#888', fontSize: 12 }}>({Math.round(a.size / 1024)} KB)</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Type a message..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc' }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
              />
              <button type="button" onClick={handleAttachClick} style={{ padding: '8px 10px' }}>Attach</button>
              <button type="button" onClick={handleSend} style={{ padding: '8px 10px' }}>Send</button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={handleFilesChange}
            />

            {attachments.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 13 }}>
                Attachments:
                <ul style={{ margin: '6px 0 0 18px' }}>
                  {attachments.map((f, i) => <li key={i}>{f.name} ({Math.round(f.size / 1024)} KB)</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.jsx</code> and save to test HMR
        </p>
      </div>

      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  )
}

export default App
