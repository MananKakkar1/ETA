import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import { Avatar } from "../Avatar.jsx";
import "./home.css";

function AvatarCanvas() {
  return (
    <div className="home__canvas-wrapper">
      <Canvas camera={{ position: [0, 1.5, 2.5], fov: 35 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 5, 3]} intensity={1} />
        <Avatar position={[0, -1.1, 0]} />
        <OrbitControls enablePan={false} />
        <Environment preset="city" />
      </Canvas>
    </div>
  );
}

function Home() {
  return (
    <div className="home">
      <section className="home__header">
        <span className="home__eyebrow">Velvet Classroom</span>
        <h1 className="home__title">Persona-powered teaching that adapts to you.</h1>
        <p className="home__subtitle">
          Switch between Professor, Study Buddy, and Exam Coach personas to keep
          every concept sharp, stylish, and motivating—just like the Persona 3
          Reload cast.
        </p>
        <div className="home__actions">
          <a className="cta cta--primary" href="/login">
            Launch Session
          </a>
          <button className="cta cta--secondary" type="button">
            Browse Modules
          </button>
        </div>
        <div className="home__callout">
          <strong>Tip:</strong> Use Exam Coach before tests—rapid-fire recap with
          high-energy voice cues keeps momentum high.
        </div>
      </section>
      <AvatarCanvas />
    </div>
  );
}

export default Home;
