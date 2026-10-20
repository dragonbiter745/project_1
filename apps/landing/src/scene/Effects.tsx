import { Bloom, EffectComposer, N8AO, SMAA, TiltShift2, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useUi } from '../store/ui';

export function Effects() {
  const quality = useUi((s) => s.quality);
  const cinematic = useUi((s) => s.cameraMode === 'cinematic');
  const effects = [];
  if (quality !== 'low') {
    effects.push(
      <N8AO key="ao" halfRes depthAwareUpsampling aoRadius={1.1} distanceFalloff={0.9} intensity={quality === 'high' ? 2.2 : 1.7} quality={quality === 'high' ? 'medium' : 'performance'} />
    );
  }
  effects.push(<Bloom key="bloom" mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.25} intensity={quality === 'low' ? 0.45 : 0.85} radius={0.72} />);
  if (cinematic && quality === 'high') effects.push(<TiltShift2 key="tilt" blur={0.12} taper={0.45} />);
  effects.push(<ToneMapping key="tone" mode={ToneMappingMode.ACES_FILMIC} />);
  effects.push(<SMAA key="smaa" />);
  effects.push(<Vignette key="vignette" offset={0.3} darkness={0.5} />);
  return (
    <EffectComposer key={`${quality}-${cinematic}`} multisampling={0} enableNormalPass={false}>
      {effects}
    </EffectComposer>
  );
}
