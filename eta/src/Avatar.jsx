import { useEffect, useRef, useState } from "react";
import { useGLTF, useFBX, useAnimations } from "@react-three/drei";

const DEFAULT_ANIMATION = "idle";
const TALKING_ANIMATION = "talking";

export function Avatar({ isSpeaking = false, ...props }) {
  const group = useRef();
  const { scene, animations: gltfAnimations } = useGLTF("/models/Avatar.glb");

  const idleClip = useFBX("/animation/Idle.fbx").animations?.[0];
  const talkingClip = useFBX("/animation/Talking.fbx").animations?.[0];
  const dancingClip = useFBX("/animation/Dancing.fbx").animations?.[0];
  const dyingClip = useFBX("/animation/Dying.fbx").animations?.[0];
  const clips = [
    ...(gltfAnimations ?? []),
    idleClip && Object.assign(idleClip, { name: DEFAULT_ANIMATION }),
    talkingClip && Object.assign(talkingClip, { name: TALKING_ANIMATION }),
    dancingClip && Object.assign(dancingClip, { name: "dancing" }),
    dyingClip && Object.assign(dyingClip, { name: "dying" }),
  ].filter(Boolean);

  const { actions } = useAnimations(clips, group);
  const [currentAnimation, setCurrentAnimation] = useState(DEFAULT_ANIMATION);

  useEffect(() => {
    const desiredAnimation = isSpeaking
      ? TALKING_ANIMATION
      : DEFAULT_ANIMATION;
    if (currentAnimation !== desiredAnimation) {
      setCurrentAnimation(desiredAnimation);
    }
  }, [isSpeaking, currentAnimation]);

  useEffect(() => {
    const action =
      actions?.[currentAnimation] || actions?.[DEFAULT_ANIMATION];
    action?.reset().fadeIn(0.4).play();
    return () => action?.fadeOut(0.2);
  }, [actions, currentAnimation]);

  return (
    <group ref={group} {...props} dispose={null}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload("/models/Avatar.glb");
