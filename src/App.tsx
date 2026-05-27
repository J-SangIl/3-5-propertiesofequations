/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  DndContext, 
  DragOverlay, 
  useDraggable, 
  useDroppable, 
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  TouchSensor,
} from '@dnd-kit/core';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  RefreshCcw, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight,
  Scale as ScaleIcon
} from 'lucide-react';
import confetti from 'canvas-confetti';

// --- Types ---

type Mode = 'PRACTICE' | 'EASY' | 'NORMAL' | 'HARD';

interface BallData {
  id: string;
  type: 'x' | 'number';
  value: number; // For 'x', value is the multiplier (e.g. 1 for 'x', -1 for '-x')
  displayValue: string; // "x", "-x", "5", "-3"
}

interface Problem {
  xValue: number;
  reference: {
    left: BallData[];
    right: BallData[];
  };
  interactive: {
    pool: BallData[];
  };
}

// --- Helpers ---

const generateId = () => Math.random().toString(36).substring(2, 9);

const createBall = (type: 'x' | 'number', val: number): BallData => {
  let displayValue = "";
  if (type === 'x') {
    if (val === 1) displayValue = "x";
    else if (val === -1) displayValue = "-x";
    else displayValue = `${val}x`;
  } else {
    displayValue = val.toString();
  }
  return { id: generateId(), type, value: val, displayValue };
};

// --- Components ---

interface DraggableBallProps {
  ball: BallData;
  key?: string | number | null;
}

const DraggableBall = ({ ball }: DraggableBallProps) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ball.id,
    data: ball,
  });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    zIndex: isDragging ? 100 : 1,
    touchAction: 'none',
  };

  // Blue for positive, Red for negative
  const isPositive = ball.type === 'x' ? ball.value > 0 : ball.value > 0;
  const colorClass = isPositive 
    ? 'bg-blue-600 border-blue-400 shadow-blue-200' 
    : 'bg-red-600 border-red-400 shadow-red-200';
  
  // Custom pentagon clip-path for X types - remove border if pentagon to avoid glitches
  const shapeClass = ball.type === 'x' 
    ? '[clip-path:polygon(50%_0%,100%_38%,82%_100%,18%_100%,0%_38%)] border-none' 
    : 'rounded-full border-4';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`
        w-12 h-12 md:w-14 md:h-14 flex items-center justify-center cursor-grab active:cursor-grabbing font-black text-xl text-white shadow-lg transition-all duration-200 hover:scale-105
        ${colorClass} ${shapeClass}
        ${isDragging ? 'opacity-30' : 'opacity-100'}
      `}
      id={`ball-${ball.id}`}
    >
      {ball.displayValue}
    </div>
  );
};

const StaticBall = ({ ball }: { ball: BallData, key?: string | number | null }) => {
    const isPositive = ball.type === 'x' ? ball.value > 0 : ball.value > 0;
    const colorClass = isPositive 
      ? 'bg-blue-600 shadow-blue-100' 
      : 'bg-red-600 shadow-red-100';
    const shapeClass = ball.type === 'x' 
      ? '[clip-path:polygon(50%_0%,100%_38%,82%_100%,18%_100%,0%_38%)]' 
      : 'rounded-full';

    return (
        <div 
          className={`
            w-8 h-8 md:w-9 md:h-9 flex items-center justify-center font-bold text-xs text-white shadow-md
            ${colorClass} ${shapeClass}
          `}
          id={`static-ball-${ball.id}`}
        >
          {ball.displayValue}
        </div>
    );
};

interface DropPanProps {
  id: string;
  balls: BallData[];
}

const DropPan = ({ id, balls }: DropPanProps) => {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`
        w-32 h-20 md:w-48 md:h-28 rounded-b-xl border-b-4 border-l-2 border-r-2 relative flex flex-wrap gap-1 p-2 items-end justify-center transition-all duration-300
        ${isOver ? 'bg-indigo-100/50 border-indigo-400' : 'bg-slate-50/50 border-slate-300'}
      `}
      id={`pan-${id}`}
    >
      {balls.map((ball) => (
        <DraggableBall key={ball.id} ball={ball} />
      ))}
      <div className="absolute top-2 w-full flex justify-center opacity-0 pointer-events-none">
        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-tighter"></span>
      </div>
    </div>
  );
};

const PoolDropZone = ({ children }: { children: React.ReactNode }) => {
  const { setNodeRef, isOver } = useDroppable({ id: 'pool' });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 flex flex-wrap gap-3 items-center justify-center relative p-2 rounded-xl transition-all duration-300 ${
        isOver ? 'bg-indigo-950/50 ring-4 ring-indigo-400/40 scale-102' : ''
      }`}
      id="pool"
    >
      {children}
    </div>
  );
};

const ScaleVisual = ({ leftWeight, rightWeight, children }: { leftWeight: number, rightWeight: number, children: React.ReactNode[] }) => {
    // Determine tilt. 0 is level. max is +/- 12 deg
    // Invert rotation so that the heavier side tilts down (diff > 0 means left is heavier -> rotates counter-clockwise / negative)
    const diff = leftWeight - rightWeight;
    const tilt = diff === 0 ? 0 : Math.max(-12, Math.min(12, -diff * 0.4));

    return (
        <div className="relative w-full flex flex-col items-center justify-end h-48 md:h-64 overflow-visible" id="scale-container">
            {/* Beam */}
            <motion.div 
                className="w-full h-1.5 md:h-2 bg-slate-400 relative rounded-full flex justify-between px-10 items-start"
                animate={{ rotate: tilt }}
                transition={{ type: 'spring', stiffness: 45, damping: 12 }}
                id="scale-beam"
            >
                {/* Pivot point */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-500 border-2 border-white"></div>
                
                {/* Pantographs / Pan Supports */}
                <div className="absolute left-[15%] top-0 h-28 md:h-36 w-0.5 bg-slate-300 origin-top flex flex-col items-center">
                    <div className="mt-full translate-y-[1.5rem] md:translate-y-[2rem]">
                        {children[0]}
                    </div>
                </div>
                <div className="absolute right-[15%] top-0 h-28 md:h-36 w-0.5 bg-slate-300 origin-top flex flex-col items-center">
                    <div className="mt-full translate-y-[1.5rem] md:translate-y-[2rem]">
                        {children[1]}
                    </div>
                </div>
            </motion.div>

            {/* Base */}
            <div className="w-1.5 md:w-2 h-32 bg-slate-400 rounded-t-full -mt-2 z-0 relative">
               <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-slate-300 transform rotate-45"></div>
            </div>
            <div className="w-24 md:w-32 h-3 bg-slate-500 rounded-lg -mt-1 shadow-md"></div>
        </div>
    );
};

// --- Main App ---

export default function App() {
  const [mode, setMode] = useState<Mode>('EASY');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [leftPan, setLeftPan] = useState<BallData[]>([]);
  const [rightPan, setRightPan] = useState<BallData[]>([]);
  const [pool, setPool] = useState<BallData[]>([]);
  const [activeBall, setActiveBall] = useState<BallData | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'warning', message: string } | null>(null);
  const [solvedCounts, setSolvedCounts] = useState<{ EASY: number, NORMAL: number, HARD: number }>({ EASY: 0, NORMAL: 0, HARD: 0 });
  const [isChecking, setIsChecking] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 5 } })
  );

  const startNewProblem = useCallback(() => {
    // Logic to ensure x balls are on only one side in the solution
    const generateProblemV2 = (currentMode: Mode): Problem => {
      let xValue = 2;
      let A = 1;
      let C = 0;
      let B = 5;

      if (currentMode === 'PRACTICE' || currentMode === 'EASY') {
        xValue = Math.floor(Math.random() * 4) + 2; // 2 to 5
        A = Math.floor(Math.random() * 2) + 1; // 1 to 2
        C = Math.floor(Math.random() * A); // 0 to A-1
        B = Math.floor(Math.random() * 5) + 3; // 3 to 7
      } else if (currentMode === 'NORMAL') {
        xValue = Math.floor(Math.random() * 7) + 2; // 2 to 8
        A = Math.floor(Math.random() * 3) + 1; // 1 to 3
        C = Math.floor(Math.random() * A); // 0 to A-1
        B = Math.floor(Math.random() * 12) + 3; // 3 to 14
      } else {
        // HARD (old NORMAL)
        xValue = Math.floor(Math.random() * 8) + 2; // 2 to 9
        if (Math.random() > 0.5) xValue = -xValue;
        A = Math.floor(Math.random() * 3) + 1; // 1 to 3
        C = Math.floor(Math.random() * 3) - 1; // -1 to 1
        B = Math.floor(Math.random() * 20) - 10; // -10 to 9
      }

      const safeA = A === C ? A + 1 : A;
      let D = (safeA - C) * xValue + B;

      // Ensure reference weights don't exceed 60 (or 20 for EASY/PRACTICE)
      const maxRefLimit = (currentMode === 'PRACTICE' || currentMode === 'EASY') ? 20 : 60;
      let refWeight = safeA * xValue + B;
      if (Math.abs(refWeight) > maxRefLimit) {
        // Fallback to a simpler set if exceeds
        xValue = Math.sign(xValue) * 2;
        D = (safeA - C) * xValue + B;
      }

      const refLeft: BallData[] = [];
      for (let i = 0; i < Math.abs(safeA); i++) refLeft.push(createBall('x', Math.sign(safeA)));
      if (B !== 0) refLeft.push(createBall('number', B));
      const refRight: BallData[] = [];
      for (let i = 0; i < Math.abs(C); i++) refRight.push(createBall('x', Math.sign(C)));
      if (D !== 0) refRight.push(createBall('number', D));

      // Interactive: Varied target weight logic constrained appropriately
      const isEasyDifficulty = (currentMode === 'PRACTICE' || currentMode === 'EASY');

      const xCount = isEasyDifficulty ? 1 : (Math.floor(Math.random() * 2) + 2); // 1 for EASY/PRACTICE, 2 to 3 for NORMAL/HARD
      const xBalls = Array.from({ length: xCount }, () => createBall('x', (currentMode === 'HARD') ? (Math.random() > 0.5 ? 1 : -1) : 1));
      const xTotalWeight = xBalls.reduce((acc, b) => acc + b.value * xValue, 0);

      let targetW: number;
      if (isEasyDifficulty) {
        targetW = Math.max(Math.abs(xTotalWeight) + 2, Math.floor(Math.random() * 5) + 10);
        if (targetW > 20) targetW = 20;
      } else {
        // Limit target weight to max 60
        const minW = Math.abs(xTotalWeight) + 5;
        const maxW = 60;
        targetW = Math.floor(Math.random() * (maxW - Math.max(minW, 30))) + Math.max(minW, 30);
        if (targetW > 60) targetW = 60;
      }
      
      // Side 1: weight = xTotalWeight + numSide1 = targetW
      const numSide1Value = targetW - xTotalWeight;
      // Split numSide1Value into 1 or 2 balls
      let side1Balls: BallData[] = [...xBalls];
      if (numSide1Value !== 0) {
        if (Math.abs(numSide1Value) > 15 && Math.random() > 0.4 && !isEasyDifficulty) {
             const split = Math.floor(numSide1Value * (Math.random() * 0.4 + 0.3));
             side1Balls.push(createBall('number', split));
             side1Balls.push(createBall('number', numSide1Value - split));
        } else {
             side1Balls.push(createBall('number', numSide1Value));
        }
      }

      // Side 2: weight = numSide2 = targetW
      let side2Balls: BallData[] = [];
      let remaining = targetW;
      const ballCount = (isEasyDifficulty || Math.random() > 0.6) ? 2 : 3;
      for (let i = 0; i < ballCount - 1; i++) {
          const val = Math.floor(remaining * (Math.random() * 0.4 + 0.3));
          if (val === 0) continue;
          side2Balls.push(createBall('number', val));
          remaining -= val;
      }
      side2Balls.push(createBall('number', remaining));

      return {
        xValue,
        reference: { left: refLeft, right: refRight },
        interactive: { pool: [...side1Balls, ...side2Balls].sort(() => Math.random() - 0.5) }
      };
    };

    const newProb = generateProblemV2(mode);
    setProblem(newProb);
    setLeftPan([]);
    setRightPan([]);
    setPool(newProb.interactive.pool);
    setFeedback(null);
    setIsChecking(false);
    setIsCorrect(false);
  }, [mode]);

  useEffect(() => {
    startNewProblem();
  }, [startNewProblem]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveBall(event.active.data.current as BallData);
    if (isChecking) setIsChecking(false);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveBall(null);
    if (!over) return;

    const ballId = active.id as string;
    const targetId = over.id as string;

    const removeFromSource = (id: string, list: BallData[]) => list.filter(b => b.id !== id);
    const findBall = (id: string) => pool.find(b => b.id === id) || leftPan.find(b => b.id === id) || rightPan.find(b => b.id === id);

    const ball = findBall(ballId);
    if (!ball) return;

    setPool(prev => removeFromSource(ballId, prev));
    setLeftPan(prev => removeFromSource(ballId, prev));
    setRightPan(prev => removeFromSource(ballId, prev));

    if (targetId === 'left-pan') setLeftPan(prev => [...prev, ball]);
    else if (targetId === 'right-pan') setRightPan(prev => [...prev, ball]);
    else if (targetId === 'pool') setPool(prev => [...prev, ball]);
  };

  const checkSolution = () => {
    if (isCorrect) return;
    if (pool.length > 0) {
      setFeedback({ type: 'warning', message: '공을 모두 사용해야 합니다.' });
      return;
    }
    if (!problem) return;

    const calcWeight = (list: BallData[]) => list.reduce((acc, curr) => acc + (curr.type === 'x' ? curr.value * problem.xValue : curr.value), 0);
    const leftW = calcWeight(leftPan);
    const rightW = calcWeight(rightPan);

    setIsChecking(true);
    const isMatched = leftW === rightW;
    setIsCorrect(isMatched);

    if (isMatched) {
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      setFeedback({ type: 'success', message: '정답입니다!' });
      if (mode !== 'PRACTICE') {
        setSolvedCounts(prev => ({ ...prev, [mode]: prev[mode as keyof typeof prev] + 1 }));
      }
      setTimeout(() => startNewProblem(), 2000);
    } else {
      setFeedback({ type: 'error', message: '틀렸습니다. 다시 풀어보세요.' });
    }
  };

  const showWeights = mode === 'PRACTICE' || (isChecking && isCorrect);
  const leftInteractiveWeight = useMemo(() => showWeights && problem ? leftPan.reduce((acc, curr) => acc + (curr.type === 'x' ? curr.value * problem.xValue : curr.value), 0) : 0, [leftPan, problem, showWeights]);
  const rightInteractiveWeight = useMemo(() => showWeights && problem ? rightPan.reduce((acc, curr) => acc + (curr.type === 'x' ? curr.value * problem.xValue : curr.value), 0) : 0, [rightPan, problem, showWeights]);

  if (!problem) return null;

  return (
    <div className="h-screen bg-slate-50 font-sans flex flex-col p-6 gap-6 overflow-hidden select-none" id="main-container">
      {/* Header Section */}
      <header className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-200 gap-4" id="header">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg shadow-md shadow-indigo-100">
            <ScaleIcon className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-xl font-black text-slate-800 leading-tight">등식의 성질</h1>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 w-full md:w-auto">
            <button onClick={() => setMode('PRACTICE')} className={`flex-1 md:flex-initial px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-bold transition-all ${mode === 'PRACTICE' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`} id="btn-practice">연습 모드</button>
            <button onClick={() => setMode('EASY')} className={`flex-1 md:flex-initial px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-bold transition-all ${mode === 'EASY' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`} id="btn-easy">쉬운 모드</button>
            <button onClick={() => setMode('NORMAL')} className={`flex-1 md:flex-initial px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-bold transition-all ${mode === 'NORMAL' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`} id="btn-normal">일반 모드</button>
            <button onClick={() => setMode('HARD')} className={`flex-1 md:flex-initial px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-bold transition-all ${mode === 'HARD' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`} id="btn-hard">어려운 모드</button>
          </div>
          <div className="flex items-center justify-center gap-3 bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100 w-full sm:w-auto shrink-0">
            <Trophy className="w-5 h-5 text-amber-500" />
            <div className="flex gap-3 text-sm font-black text-slate-700">
              <span className="text-emerald-600">E: {solvedCounts.EASY}</span>
              <span className="text-indigo-600">N: {solvedCounts.NORMAL}</span>
              <span className="text-purple-600">H: {solvedCounts.HARD}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden" id="workspace">
        {/* Left: Problem Section */}
        <section className="bg-white rounded-3xl border-2 border-slate-200 p-6 flex flex-col items-center relative overflow-hidden shadow-sm" id="reference-section">
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10">
            <h2 className="text-lg font-black text-slate-800 bg-white/80 backdrop-blur-sm px-4 py-1 rounded-full border border-slate-100 shadow-sm">x의 무게는 얼마일까요?</h2>
          </div>
          <div className="flex-1 w-full flex items-center justify-center">
            <ScaleVisual 
              leftWeight={problem.reference.left.reduce((a,c) => a + (c.type === 'x' ? c.value * problem.xValue : c.value), 0)}
              rightWeight={problem.reference.right.reduce((a,c) => a + (c.type === 'x' ? c.value * problem.xValue : c.value), 0)}
            >
              <div className="w-40 h-24 md:w-48 md:h-32 border-b-4 border-l-2 border-r-2 border-slate-400 flex flex-wrap gap-1 p-2 items-end justify-center rounded-b-xl overflow-hidden bg-slate-50/50">
                {problem.reference.left.map(b => <StaticBall key={b.id} ball={b} />)}
              </div>
              <div className="w-40 h-24 md:w-48 md:h-32 border-b-4 border-l-2 border-r-2 border-slate-400 flex flex-wrap gap-1 p-2 items-end justify-center rounded-b-xl overflow-hidden bg-slate-50/50">
                {problem.reference.right.map(b => <StaticBall key={b.id} ball={b} />)}
              </div>
            </ScaleVisual>
          </div>

          {/* Left Buttons Area */}
          <div className="w-full flex gap-3 mt-auto">
            <button 
              onClick={startNewProblem} 
              className="flex-1 px-4 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-2xl transition-all border border-slate-200 shadow-sm active:translate-y-1 text-sm flex items-center justify-center gap-2" 
              id="btn-new-problem"
            >
              <RefreshCcw className="w-4 h-4" />
              다른 문제
            </button>
            <button 
                onClick={() => {
                    if (problem) {
                        setPool(problem.interactive.pool);
                        setLeftPan([]);
                        setRightPan([]);
                        setFeedback(null);
                        setIsChecking(false);
                    }
                }} 
                className="flex-1 px-4 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-2xl transition-all border border-slate-200 shadow-sm active:translate-y-1 text-sm flex items-center justify-center gap-2" 
                id="btn-reset-pool"
            >
              <RefreshCcw className="w-4 h-4" />
              초기화
            </button>
          </div>
        </section>

        {/* Right: Challenge Section */}
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <section className="bg-white rounded-3xl border-2 border-indigo-200 p-6 flex flex-col items-center relative shadow-xl shadow-indigo-50" id="challenge-section">
            <div className="text-center mt-6">
              <h2 className="text-xl font-black text-slate-800 mb-1">평형을 만드세요</h2>
              <p className="text-indigo-400 text-sm font-medium">모든 공을 사용해야 합니다.</p>
            </div>
            
            <div className="flex-1 w-full flex items-center justify-center">
              <ScaleVisual leftWeight={leftInteractiveWeight} rightWeight={rightInteractiveWeight}>
                <DropPan id="left-pan" balls={leftPan} />
                <DropPan id="right-pan" balls={rightPan} />
              </ScaleVisual>
            </div>

            {/* Weights display for Practice mode or after checking (if correct) */}
            {showWeights && (
              <div className="w-full grid grid-cols-2 gap-4 mb-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-center h-16 flex flex-col justify-center">
                  <div className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">왼쪽 무게</div>
                  <div className="text-lg font-black text-indigo-600">{leftInteractiveWeight}</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-center h-16 flex flex-col justify-center">
                  <div className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">오른쪽 무게</div>
                  <div className="text-lg font-black text-purple-600">{rightInteractiveWeight}</div>
                </div>
              </div>
            )}

            {/* Bottom Pool Area (Right Side) */}
            <div className="w-full mt-4 bg-indigo-900 rounded-2xl p-4 shadow-xl min-h-[9rem] flex flex-col" id="ball-tray">
              <div className="text-indigo-300 text-[9px] font-black uppercase tracking-widest mb-2 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                사용 가능한 공
              </div>
              <PoolDropZone>
                <AnimatePresence>
                  {pool.map((ball) => <DraggableBall key={ball.id} ball={ball} />)}
                </AnimatePresence>
                
                {/* Dynamic Complete Button */}
                {pool.length === 0 && (
                   <motion.button 
                     initial={{ opacity: 0, scale: 0.8 }}
                     animate={{ opacity: 1, scale: 1 }}
                     disabled={isCorrect}
                     onClick={checkSolution} 
                     className="px-16 py-5 bg-amber-400 hover:bg-amber-300 text-indigo-900 font-black rounded-2xl transition-all shadow-lg shadow-amber-500/40 text-xl active:translate-y-1 flex items-center justify-center gap-2 border-4 border-amber-200 disabled:opacity-50 disabled:pointer-events-none" 
                     id="btn-complete"
                   >
                     완료
                     <ChevronRight className="w-6 h-6" />
                   </motion.button>
                )}
              </PoolDropZone>
            </div>

            {/* Feedback Message */}
            <AnimatePresence>
              {feedback && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`absolute top-24 left-1/2 -translate-x-1/2 px-6 py-2 rounded-full border-2 font-black text-sm shadow-xl z-20 ${
                  feedback.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' :
                  feedback.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' :
                  'bg-amber-50 border-amber-200 text-amber-700'
                }`}>
                  {feedback.message}
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          <DragOverlay dropAnimation={null}>
            {activeBall ? (() => {
              const isPositive = activeBall.value > 0;
              const colorClass = isPositive ? 'bg-blue-600' : 'bg-red-600';
              const shapeClass = activeBall.type === 'x' ? '[clip-path:polygon(50%_0%,100%_38%,82%_100%,18%_100%,0%_38%)]' : 'rounded-full border-4 border-white/40';
              return (
                <div className={`w-16 h-16 flex items-center justify-center font-black text-2xl text-white shadow-2xl scale-110 rotate-3 ${colorClass} ${shapeClass}`}>
                  {activeBall.displayValue}
                </div>
              );
            })() : null}
          </DragOverlay>
        </DndContext>
      </main>

      {/* Decorative Blurs */}
      <div className="absolute -z-10 top-20 right-20 w-64 h-64 bg-indigo-100 rounded-full blur-3xl opacity-30 pointer-events-none"></div>
      <div className="absolute -z-10 bottom-20 left-20 w-96 h-96 bg-emerald-100 rounded-full blur-3xl opacity-30 pointer-events-none"></div>
    </div>
  );
}
