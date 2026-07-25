import { useCallback, useEffect, useRef, useState } from 'react';
import { Runtime, type Hud as HudData } from './game/runtime';
import type { Dir } from './game/types';
import { useControls } from './input/useControls';
import type { ThemeName } from './render/theme';
import { Hud, StateLine } from './ui/Hud';
import { DeathScreen, TitleScreen } from './ui/Screens';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);

  const [hud, setHud] = useState<HudData | null>(null);
  const [theme, setTheme] = useState<ThemeName>('day');
  const [muted, setMuted] = useState(false);

  // The runtime owns the loop and pushes HUD data at most once per turn — React
  // never re-renders per frame, and never at pointer-move rate.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rt = new Runtime(canvas);
    runtimeRef.current = rt;
    rt.onHud = setHud;
    // Debug seam — lets the console and the screenshot script drive an exact board.
    (window as unknown as { __stet?: Runtime }).__stet = rt;
    setTheme(rt.themeName);
    setMuted(rt.muted);
    rt.start();
    return () => {
      rt.stop();
      runtimeRef.current = null;
    };
  }, []);

  const screen = hud?.screen ?? 'title';

  const onDir = useCallback((dir: Dir) => {
    runtimeRef.current?.input(dir);
  }, []);

  const onConfirm = useCallback(() => {
    const rt = runtimeRef.current;
    if (!rt) return;
    if (rt.state.screen !== 'playing') rt.newRun();
  }, []);

  const onGesture = useCallback(() => {
    runtimeRef.current?.unlockAudio();
  }, []);

  useControls(stageRef, { onDir, onConfirm, onGesture });

  const toggleTheme = useCallback(() => {
    const rt = runtimeRef.current;
    if (!rt) return;
    const next: ThemeName = rt.themeName === 'day' ? 'night' : 'day';
    rt.setTheme(next);
    setTheme(next);
  }, []);

  const toggleMute = useCallback(() => {
    const rt = runtimeRef.current;
    if (!rt) return;
    rt.unlockAudio();
    rt.toggleMute();
    setMuted(rt.muted);
  }, []);

  return (
    <div className="app">
      <div className="chrome">
        <button
          className="iconbtn"
          onClick={toggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? '⊘' : '♪'}
        </button>
        <button
          className="iconbtn"
          onClick={toggleTheme}
          aria-label={theme === 'day' ? 'Night' : 'Day'}
          title={theme === 'day' ? 'By candle' : 'By lamp'}
        >
          {theme === 'day' ? '☾' : '☀'}
        </button>
      </div>

      {hud && screen === 'playing' ? (
        <Hud hud={hud} />
      ) : (
        <header className="hud" aria-hidden="true" />
      )}

      <div className="stage" ref={stageRef}>
        <canvas className="board" ref={canvasRef} aria-label="The floor" role="img" />
        {screen === 'title' && (
          <TitleScreen best={hud?.best ?? 0} onBegin={() => runtimeRef.current?.newRun()} />
        )}
        {screen === 'dead' && hud && (
          <DeathScreen hud={hud} onAgain={() => runtimeRef.current?.newRun()} />
        )}
      </div>

      {hud && screen === 'playing' ? (
        <StateLine hud={hud} />
      ) : (
        <div className="state" aria-hidden="true" />
      )}
    </div>
  );
}
