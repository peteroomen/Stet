import { useCallback, useEffect, useRef, useState } from 'react';
import { Runtime, type Hud as HudData } from './game/runtime';
import type { Action } from './game/types';
import { useControls } from './input/useControls';
import type { ThemeName } from './render/theme';
import { Hud, StateLine } from './ui/Hud';
import { TraitLedger, TraitOffer } from './ui/Marginalia';
import { DeathScreen, TitleScreen } from './ui/Screens';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);

  const [hud, setHud] = useState<HudData | null>(null);
  const [theme, setTheme] = useState<ThemeName>('day');
  const [muted, setMuted] = useState(false);
  /** Has this player ever held? Until they have, the hint says how. */
  const [taught, setTaught] = useState(true);
  const [ledgerOpen, setLedger] = useState(false);

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
    setTaught(rt.taughtHold);
    rt.start();
    return () => {
      rt.stop();
      runtimeRef.current = null;
    };
  }, []);

  const screen = hud?.screen ?? 'title';

  const onDir = useCallback((act: Action) => {
    runtimeRef.current?.input(act);
  }, []);

  /**
   * A tap on the page. Begins a run from the title or death screen; holds your
   * ground during one.
   *
   * Holding used to need a button, which is one more permanent thing on a screen
   * that had too much on it. A tap is the gesture nobody has to be taught —
   * except the first time, which is what `taughtHold` is for.
   */
  const onConfirm = useCallback(() => {
    const rt = runtimeRef.current;
    if (!rt) return;
    // ONLY these two screens start a run. It used to be "anything that is not
    // playing", which quietly included `choosing` — so the tap that took a card
    // also threw the run away and dealt a fresh one at depth 1.
    if (rt.state.screen === 'title' || rt.state.screen === 'dead') {
      rt.newRun();
      return;
    }
    if (rt.state.screen !== 'playing') return;
    // Only counts as taught if the tap could actually hold. Out of budget it is
    // a no-op, and marking the lesson learned from a tap that did nothing is how
    // a tutorial hint disappears before it has taught anything.
    const budget = rt.state.rules.waitsPerFloor;
    const left = budget > 0 ? budget - rt.state.floorWaits : Infinity;
    if (!rt.state.rules.allowWait || left <= 0) return;
    rt.input('wait');
    if (!rt.taughtHold) {
      rt.taughtHold = true;
      setTaught(true);
    }
  }, []);

  const onGesture = useCallback(() => {
    runtimeRef.current?.unlockAudio();
  }, []);

  // While the card hand is up the board is frozen: swipes and taps would
  // otherwise spend a turn, or a hold, against a floor you have not started.
  useControls(stageRef, { onDir, onConfirm, onGesture, enabled: screen !== 'choosing' });

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

      {hud && (screen === 'playing' || screen === 'choosing') ? (
        <Hud hud={hud} onShowTraits={() => setLedger(true)} />
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
        {screen === 'choosing' && hud && (
          <TraitOffer
            ids={hud.offer}
            depth={hud.depth}
            onTake={(id) => runtimeRef.current?.takeTrait(id)}
          />
        )}
        {ledgerOpen && hud && (
          <TraitLedger ids={hud.traits} onClose={() => setLedger(false)} />
        )}
      </div>

      {hud && screen === 'playing' ? (
        <StateLine hud={hud} taughtHold={taught} />
      ) : (
        <div className="state" aria-hidden="true" />
      )}
    </div>
  );
}
