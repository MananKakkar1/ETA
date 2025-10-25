import { use, useEffect, useRef, useState, useMemo } from "react";
import { useGLTF, useFBX, useAnimations } from "@react-three/drei";
import { LoopRepeat, LoopOnce } from "three";

const DEFAULT_ANIMATION = "idle";
const TALKING_ANIMATION = "talking";


export function Avatar({ isSpeaking = false, ...props }) {
  const group = useRef();
  const { scene, animations: gltfAnimations } = useGLTF("/models/Avatar.glb");

  const idleClip = useFBX("/animation/Idle.fbx").animations?.[0];
  const talkingClip = useFBX("/animation/Talking.fbx").animations?.[0];
  const dancingClip = useFBX("/animation/Dancing.fbx").animations?.[0];
  const dyingClip = useFBX("/animation/Dying.fbx").animations?.[0];
  const gangnam = useFBX("/animation/GangnamStyle.fbx").animations?.[0];
  const defeated = useFBX("/animation/Defeated.fbx").animations?.[0];
  const taunt = useFBX("/animation/Taunt.fbx").animations?.[0];

  // Memoize clips to avoid recreating the array on every render.
  // Clone animation clips before setting names so we don't mutate
  // the originals returned by useFBX/useGLTF.
  const clips = useMemo(() => {
    const result = [...(gltfAnimations ?? [])];
    if (idleClip)
      result.push(Object.assign(idleClip.clone(), { name: DEFAULT_ANIMATION }));
    if (talkingClip)
      result.push(
        Object.assign(talkingClip.clone(), { name: TALKING_ANIMATION })
      );
    if (dancingClip)
      result.push(Object.assign(dancingClip.clone(), { name: "dancing" }));
    if (dyingClip) result.push(Object.assign(dyingClip.clone(), { name: "dying" }));
    if (gangnam) result.push(Object.assign(gangnam.clone(), { name: "gangnam" }));
    if (defeated)
      result.push(Object.assign(defeated.clone(), { name: "defeated" }));
    if (taunt) result.push(Object.assign(taunt.clone(), { name: "taunt" }));
    return result;
  }, [gltfAnimations, idleClip, talkingClip, dancingClip, dyingClip, gangnam, defeated, taunt]);

  const { actions } = useAnimations(clips, group);
  const [currentAnimation, setCurrentAnimation] = useState(DEFAULT_ANIMATION);

  useEffect(() => {
    // Only switch to talking if we're currently idle.
    // Only return to idle if we were talking. This prevents typing
    // from overriding other animations (e.g. dancing).
    if (isSpeaking) {
      if (currentAnimation === DEFAULT_ANIMATION) {
        setCurrentAnimation(TALKING_ANIMATION);
      }
    } else {
      if (currentAnimation === TALKING_ANIMATION) {
        setCurrentAnimation(DEFAULT_ANIMATION);
      }
    }
  }, [isSpeaking, currentAnimation]);

  useEffect(() => {
    const action =
      actions?.[currentAnimation] || actions?.[DEFAULT_ANIMATION];
    if (!action) return;

    // reset, set looping for idle, then play
    action.reset();
    if (currentAnimation === DEFAULT_ANIMATION) {
      action.setLoop(LoopRepeat, Infinity);
    } else {
      // non-idle animations should play once (adjust as needed)
      action.setLoop(LoopOnce, 0);
    }
    action.fadeIn(0.4).play();

    return () => action.fadeOut(0.2);
  }, [actions, currentAnimation]);

  return (
    <group ref={group} {...props} dispose={null}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload("/models/Avatar.glb");
