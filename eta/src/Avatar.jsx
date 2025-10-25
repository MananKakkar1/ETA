import { useEffect, useRef, useState } from "react";
import {
  useGLTF,
  useFBX,
  useAnimations,
} from "@react-three/drei";

export function Avatar(props) {
  const group = useRef();
  const { scene, animations: gltfAnimations } = useGLTF("/models/Avatar.glb");

  const idleClip = useFBX("/animation/Idle.fbx").animations?.[0];
  const talkingClip = useFBX("/animation/Talking.fbx").animations?.[0];
  const dancingClip = useFBX("/animation/Dancing.fbx").animations?.[0];

  const clips = [
    ...(gltfAnimations ?? []),
    idleClip && Object.assign(idleClip, { name: "idle" }),
    talkingClip && Object.assign(talkingClip, { name: "talking" }),
    dancingClip && Object.assign(dancingClip, { name: "dancing" }),
  ].filter(Boolean);

  const { actions } = useAnimations(clips, group);
  const [currentAnimation, setCurrentAnimation] = useState("idle");

  useEffect(() => {
    const action = actions?.[currentAnimation] || actions?.idle;
    action?.reset().fadeIn(0.4).play();
    return () => action?.fadeOut(0.2);
  }, [actions, currentAnimation]);

  useEffect(() => {
    const order = ["idle", "talking", "dancing"];
    let index = 0;
    const interval = window.setInterval(() => {
      index = (index + 1) % order.length;
      setCurrentAnimation(order[index]);
    }, 12000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <group ref={group} {...props} dispose={null}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload("/models/Avatar.glb");
