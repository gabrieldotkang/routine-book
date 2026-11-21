import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  BookOpen,
  CheckCircle2,
  Plus,
  Sparkles,
  Clock,
  BookMarked,
  ChevronRight,
  X,
  Flame,
  Calendar,
  Award,
  Volume2,
  VolumeX, Cloud, CloudOff, RefreshCw
} from 'lucide-react';
import {
  initGoogleAuth,
  requestGoogleLogin,
  pullFromGoogleDrive,
  pushToGoogleDrive,
} from './googleDriveSync';

// 초기 샘플 데이터
const INITIAL_BOOKS = [
  {
    id: 'bk_1',
    title: '클린 아키텍처',
    author: '로버트 C. 마틴',
    totalPages: 352,
    currentPage: 120,
    coverColor: 'bg-indigo-600',
    status: 'reading',
  },
  {
    id: 'bk_2',
    title: '아주 작은 습관의 힘',
    author: '제임스 클리어',
    totalPages: 360,
    currentPage: 285,
    coverColor: 'bg-emerald-600',
    status: 'reading',
  },
  {
    id: 'bk_3',
    title: '도둑맞은 집중력',
    author: '요한 하리',
    totalPages: 464,
    currentPage: 464,
    coverColor: 'bg-amber-600',
    status: 'done',
  },
];

const INITIAL_ROUTINE = {
  id: 'rt_daily',
  title: '매일 성장 루틴 (영어 + 독서)',
  steps: [
    { id: 'st_1', name: '물 한 잔 & 스트레칭', durationSec: 180, category: 'normal' },
    { id: 'st_2', name: '영어 문장 암기 & 쉐도잉', durationSec: 900, category: 'english' },
    { id: 'st_3', name: '독서 몰입 시간', durationSec: 1200, category: 'reading' },
  ],
};

export default function App() {
  // 로컬 스토리지 초기 로드 헬퍼
  const loadLocal = (key, fallback) => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : fallback;
    } catch {
      return fallback;
    }
  };
  
  const [activeTab, setActiveTab] = useState('routine');
  const [books, setBooks] = useState(() => loadLocal('rb_books', INITIAL_BOOKS));
  const [routine, setRoutine] = useState(() => loadLocal('rb_routine', INITIAL_ROUTINE));
  const [readingLogs, setReadingLogs] = useState(() => loadLocal('rb_logs', []));

  // 타이머 상태
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(INITIAL_ROUTINE.steps[0].durationSec);
  const [isRunning, setIsRunning] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [streakCount, setStreakCount] = useState(() => loadLocal('rb_streak', 7));

  // 독서 연동 상태
  const [selectedBookId, setSelectedBookId] = useState(INITIAL_BOOKS[0].id);
  const [showBookSelectModal, setShowBookSelectModal] = useState(false);
  const [showReadingLogModal, setShowReadingLogModal] = useState(false);
  const [completedReadingDuration, setCompletedReadingDuration] = useState(0);

  // 독서 기록 모달 입력 상태
  const [endPageInput, setEndPageInput] = useState('');
  const [memoInput, setMemoInput] = useState('');

  // 새 책 추가 모달 상태
  const [showAddBookModal, setShowAddBookModal] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState('');
  const [newBookAuthor, setNewBookAuthor] = useState('');
  const [newBookTotalPages, setNewBookTotalPages] = useState('');

  const currentStep = routine.steps[currentStepIdx];
  const selectedBook = books.find((b) => b.id === selectedBookId) || books[0];
  const audioCtxRef = useRef(null);
  
  // Google Drive 동기화 상태: 'disconnected' | 'syncing' | 'synced' | 'error'
  const [syncStatus, setSyncStatus] = useState('disconnected');
  const isInitialRemoteLoad = useRef(false);
  
  // Google OAuth 초기화
  useEffect(() => {
    const timer = setTimeout(() => {
      initGoogleAuth(
        async () => {
          setSyncStatus('syncing');
          try {
            const remoteData = await pullFromGoogleDrive();
            if (remoteData) {
              isInitialRemoteLoad.current = true;
              if (remoteData.books) setBooks(remoteData.books);
              if (remoteData.routine) setRoutine(remoteData.routine);
              if (remoteData.readingLogs) setReadingLogs(remoteData.readingLogs);
              if (typeof remoteData.streakCount === 'number') setStreakCount(remoteData.streakCount);
            } else {
              // Drive에 파일이 없으면 현재 로컬 데이터를 최초 업로드
              await pushToGoogleDrive({ books, routine, readingLogs, streakCount });
            }
            setSyncStatus('synced');
          } catch (err) {
            console.error(err);
            setSyncStatus('error');
          }
        },
        () => setSyncStatus('error')
      );
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // 데이터 변경 시 LocalStorage 즉시 저장 + Google Drive 디바운스(2초) 업로드
  useEffect(() => {
    localStorage.setItem('rb_books', JSON.stringify(books));
    localStorage.setItem('rb_routine', JSON.stringify(routine));
    localStorage.setItem('rb_logs', JSON.stringify(readingLogs));
    localStorage.setItem('rb_streak', JSON.stringify(streakCount));

    if (syncStatus === 'disconnected') return;
    if (isInitialRemoteLoad.current) {
      isInitialRemoteLoad.current = false;
      return;
    }

    setSyncStatus('syncing');
    const debounceTimer = setTimeout(async () => {
      try {
        await pushToGoogleDrive({ books, routine, readingLogs, streakCount });
        setSyncStatus('synced');
      } catch (err) {
        console.error(err);
        setSyncStatus('error');
      }
    }, 2000);

    return () => clearTimeout(debounceTimer);
  }, [books, routine, readingLogs, streakCount]);

  // Web Audio API 알림음 재생
  const playChime = (type = 'step') => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(type === 'complete' ? 880 : 587.33, ctx.currentTime);
      if (type === 'complete') {
        osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.15);
      }

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
      // 오디오 권한 제한 무시
    }
  };

  // 스텝 전환 시 독서 카테고리 체크
  const prepareStep = (index) => {
    const targetStep = routine.steps[index];
    setCurrentStepIdx(index);
    setTimeLeft(targetStep.durationSec);

    if (targetStep.category === 'reading') {
      setIsRunning(false);
      setShowBookSelectModal(true);
    }
  };

  // 스텝 완료 처리
  const handleStepComplete = () => {
    playChime('step');

    // 방금 끝난 스텝이 독서인 경우 독서 기록 모달 오픈
    if (currentStep.category === 'reading') {
      setIsRunning(false);
      setCompletedReadingDuration(currentStep.durationSec);
      setEndPageInput(String(selectedBook.currentPage));
      setMemoInput('');
      setShowReadingLogModal(true);
      return;
    }

    moveToNextStep();
  };

  const moveToNextStep = () => {
    if (currentStepIdx + 1 < routine.steps.length) {
      prepareStep(currentStepIdx + 1);
    } else {
      // 전체 루틴 완료
      playChime('complete');
      setIsRunning(false);
      setStreakCount((prev) => prev + 1);
      alert('🎉 오늘의 영어 & 독서 루틴을 모두 완료했습니다!');
      setCurrentStepIdx(0);
      setTimeLeft(routine.steps[0].durationSec);
    }
  };

  // 타이머 카운트다운 인터벌
  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleStepComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning, currentStepIdx, selectedBook]);

  // 타이머 시작 버튼 클릭
  const handleToggleStart = () => {
    if (!isRunning && currentStep.category === 'reading' && timeLeft === currentStep.durationSec) {
      setShowBookSelectModal(true);
      return;
    }
    setIsRunning((prev) => !prev);
  };

  // 독서 기록 저장 처리
  const handleSaveReadingLog = (e) => {
    e.preventDefault();
    const parsedEndPage = Math.min(
      selectedBook.totalPages,
      Math.max(selectedBook.currentPage, Number(endPageInput) || selectedBook.currentPage)
    );
    const pagesRead = parsedEndPage - selectedBook.currentPage;
    const isFinished = parsedEndPage >= selectedBook.totalPages;

    setBooks((prevBooks) =>
      prevBooks.map((b) =>
        b.id === selectedBook.id
          ? {
              ...b,
              currentPage: parsedEndPage,
              status: isFinished ? 'done' : 'reading',
            }
          : b
      )
    );

    const newLog = {
      id: `log_${Date.now()}`,
      bookTitle: selectedBook.title,
      date: new Date().toISOString().split('T')[0],
      durationMin: Math.max(1, Math.round(completedReadingDuration / 60)),
      pagesRead,
      memo: memoInput.trim() || '루틴 독서 완료',
    };

    setReadingLogs((prev) => [newLog, ...prev]);
    setShowReadingLogModal(false);
    moveToNextStep();
  };

  // 새 책 등록 처리
  const handleAddBook = (e) => {
    e.preventDefault();
    if (!newBookTitle.trim() || !newBookTotalPages) return;

    const colors = ['bg-blue-600', 'bg-purple-600', 'bg-rose-600', 'bg-teal-600', 'bg-indigo-600'];
    const randomColor = colors[books.length % colors.length];

    const newBook = {
      id: `bk_${Date.now()}`,
      title: newBookTitle.trim(),
      author: newBookAuthor.trim() || '저자 미상',
      totalPages: Number(newBookTotalPages),
      currentPage: 0,
      coverColor: randomColor,
      status: 'reading',
    };

    setBooks((prev) => [newBook, ...prev]);
    setSelectedBookId(newBook.id);
    setNewBookTitle('');
    setNewBookAuthor('');
    setNewBookTotalPages('');
    setShowAddBookModal(false);
  };

  // 시간 포맷 (MM:SS)
  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // 원형 프로그레스 계산
  const progressPercent = ((currentStep.durationSec - timeLeft) / currentStep.durationSec) * 100;
  const radius = 110;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  const readingBooks = books.filter((b) => b.status === 'reading');
  const completedBooks = books.filter((b) => b.status === 'done');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center selection:bg-indigo-500 selection:text-white">
      {/* 상단 헤더 */}
      <header className="w-full max-w-2xl px-5 py-4 flex items-center justify-between border-b border-slate-800/80 bg-slate-950/90 backdrop-blur sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
		  {/* Google Drive 동기화 버튼 */}
          <button
            onClick={requestGoogleLogin}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
              syncStatus === 'synced'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : syncStatus === 'syncing'
                ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                : syncStatus === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
            title="Google Drive 동기화"
          >
            {syncStatus === 'synced' && (
              <>
                <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                <span>동기화됨</span>
              </>
            )}
            {syncStatus === 'syncing' && (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                <span>저장 중...</span>
              </>
            )}
            {syncStatus === 'error' && (
              <>
                <CloudOff className="w-3.5 h-3.5 text-rose-400" />
                <span>재연결</span>
              </>
            )}
            {syncStatus === 'disconnected' && (
              <>
                <Cloud className="w-3.5 h-3.5 text-slate-400" />
                <span>Drive 연결</span>
              </>
            )}
          </button>

          {/* 기존 연속 달성 배지 & 알림음 버튼 유지 */}
          <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-full">
            <Flame className="w-4 h-4 text-amber-400 fill-amber-400" />
            <span className="text-xs font-bold text-amber-300">{streakCount}일 연속</span>
          </div>
		  
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight leading-none">RoutineBook</h1>
            <span className="text-[11px] text-slate-400">영어 & 독서 습관 타이머</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-full">
            <Flame className="w-4 h-4 text-amber-400 fill-amber-400" />
            <span className="text-xs font-bold text-amber-300">{streakCount}일 연속</span>
          </div>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
            title="알림음 켜기/끄기"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* 네비게이션 탭 */}
      <div className="w-full max-w-2xl px-5 pt-4">
        <div className="grid grid-cols-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('routine')}
            className={`py-2.5 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition ${
              activeTab === 'routine'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            루틴 타이머
          </button>
          <button
            onClick={() => setActiveTab('bookshelf')}
            className={`py-2.5 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition ${
              activeTab === 'bookshelf'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookMarked className="w-4 h-4" />
            내 서재 & 기록 ({books.length})
          </button>
        </div>
      </div>

      {/* 메인 컨텐츠 영역 */}
      <main className="w-full max-w-2xl px-5 py-6 flex-1">
        {activeTab === 'routine' ? (
          <div className="space-y-6">
            {/* 메인 타이머 카드 */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 flex flex-col items-center relative overflow-hidden shadow-xl">
              {/* 현재 단계 배지 */}
              <div className="flex items-center gap-2 mb-4">
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  STEP {currentStepIdx + 1} / {routine.steps.length}
                </span>
                {currentStep.category === 'reading' && (
                  <button
                    onClick={() => setShowBookSelectModal(true)}
                    className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 hover:bg-emerald-500/25 transition"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    {selectedBook ? selectedBook.title : '도서 선택'}
                  </button>
                )}
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-center mb-6">{currentStep.name}</h2>

              {/* 원형 SVG 타이머 */}
              <div className="relative flex items-center justify-center my-2">
                <svg className="w-64 h-64 -rotate-90 transform" viewBox="0 0 250 250">
                  <circle
                    cx="125"
                    cy="125"
                    r={radius}
                    stroke="currentColor"
                    strokeWidth="10"
                    fill="transparent"
                    className="text-slate-800"
                  />
                  <circle
                    cx="125"
                    cy="125"
                    r={radius}
                    stroke="currentColor"
                    strokeWidth="10"
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className={`transition-all duration-500 ${
                      currentStep.category === 'reading'
                        ? 'text-emerald-500'
                        : currentStep.category === 'english'
                        ? 'text-violet-500'
                        : 'text-indigo-500'
                    }`}
                  />
                </svg>

                <div className="absolute flex flex-col items-center">
                  <span className="text-5xl sm:text-6xl font-mono font-bold tracking-tight">
                    {formatTime(timeLeft)}
                  </span>
                  <span className="text-xs text-slate-400 mt-2">
                    전체 {Math.floor(currentStep.durationSec / 60)}분 중
                  </span>
                </div>
              </div>

              {/* 타이머 컨트롤 버튼 */}
              <div className="flex items-center gap-4 mt-8">
                <button
                  onClick={() => {
                    setIsRunning(false);
                    setTimeLeft(currentStep.durationSec);
                  }}
                  className="p-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  title="현재 단계 초기화"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>

                <button
                  onClick={handleToggleStart}
                  className={`px-8 py-4 rounded-2xl font-bold text-base flex items-center gap-2.5 shadow-lg transition transform active:scale-95 ${
                    isRunning
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
                  }`}
                >
                  {isRunning ? (
                    <>
                      <Pause className="w-5 h-5 fill-current" />
                      일시정지
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 fill-current" />
                      시작하기
                    </>
                  )}
                </button>

                <button
                  onClick={handleStepComplete}
                  className="p-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  title="단계 완료 / 다음으로 넘기기"
                >
                  <SkipForward className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 전체 루틴 스텝 리스트 */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-300">{routine.title}</h3>
                <span className="text-xs text-slate-500">
                  총 {Math.round(routine.steps.reduce((acc, s) => acc + s.durationSec, 0) / 60)}분 코스
                </span>
              </div>

              <div className="space-y-2.5">
                {routine.steps.map((step, index) => {
                  const isCurrent = index === currentStepIdx;
                  const isDone = index < currentStepIdx;

                  return (
                    <div
                      key={step.id}
                      onClick={() => {
                        setIsRunning(false);
                        prepareStep(index);
                      }}
                      className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                        isCurrent
                          ? 'bg-indigo-950/50 border-indigo-500/50'
                          : isDone
                          ? 'bg-slate-900/40 border-slate-800/60 opacity-60'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            isDone
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : isCurrent
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {isDone ? <CheckCircle2 className="w-4 h-4" /> : index + 1}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                            {step.name}
                            {step.category === 'reading' && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
                                독서 연동
                              </span>
                            )}
                            {step.category === 'english' && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/20">
                                영어 루틴
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      <span className="text-xs font-mono text-slate-400">
                        {Math.floor(step.durationSec / 60)}분
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* 서재 및 독서 기록 탭 */
          <div className="space-y-6">
            {/* 상단 통계 요약 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                <span className="text-xs text-slate-400 block mb-1">읽는 중인 책</span>
                <span className="text-2xl font-bold text-indigo-400">{readingBooks.length}권</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                <span className="text-xs text-slate-400 block mb-1">완독한 책</span>
                <span className="text-2xl font-bold text-emerald-400">{completedBooks.length}권</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                <span className="text-xs text-slate-400 block mb-1">누적 기록</span>
                <span className="text-2xl font-bold text-amber-400">{readingLogs.length}회</span>
              </div>
            </div>

            {/* 내 서재 리스트 */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <BookMarked className="w-4 h-4 text-indigo-400" />
                  내 서재 (진행률)
                </h3>
                <button
                  onClick={() => setShowAddBookModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold flex items-center gap-1 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  새 책 등록
                </button>
              </div>

              <div className="space-y-3">
                {books.map((book) => {
                  const pct = Math.round((book.currentPage / book.totalPages) * 100);
                  return (
                    <div
                      key={book.id}
                      className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/90 flex items-center gap-4"
                    >
                      <div
                        className={`w-12 h-16 rounded-lg ${book.coverColor} flex items-center justify-center shrink-0 shadow-md`}
                      >
                        <BookOpen className="w-6 h-6 text-white/90" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-bold text-sm text-slate-100 truncate">{book.title}</h4>
                          {book.status === 'done' ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-500/20 text-emerald-300 shrink-0">
                              완독 🎉
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-indigo-400 shrink-0">{pct}%</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{book.author}</p>

                        {/* 진행률 바 */}
                        <div className="w-full h-2 bg-slate-800 rounded-full mt-2.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              book.status === 'done' ? 'bg-emerald-500' : 'bg-indigo-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                          <span>
                            {book.currentPage} / {book.totalPages}p
                          </span>
                          <span>남은 페이지: {book.totalPages - book.currentPage}p</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 최근 독서 로그 */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
              <h3 className="font-bold text-base mb-4 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                최근 독서 기록
              </h3>
              <div className="space-y-3">
                {readingLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-slate-200">{log.bookTitle}</span>
                      <span className="text-xs text-slate-500">{log.date}</span>
                    </div>
                    <p className="text-xs text-slate-400">{log.memo}</p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-emerald-400 font-medium">
                      <span>⏱ {log.durationMin}분 독서</span>
                      <span>📖 +{log.pagesRead}페이지 읽음</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* [모달 1] 독서 스텝 시작 전 도서 선택 모달 */}
      {showBookSelectModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-400" />
                지금 읽을 책을 선택하세요
              </h3>
              <button
                onClick={() => setShowBookSelectModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {readingBooks.map((book) => (
                <button
                  key={book.id}
                  onClick={() => setSelectedBookId(book.id)}
                  className={`w-full p-3.5 rounded-xl border text-left flex items-center justify-between transition ${
                    selectedBookId === book.id
                      ? 'bg-emerald-950/50 border-emerald-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <p className="font-bold text-sm">{book.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      현재 {book.currentPage}p / {book.totalPages}p
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                setShowBookSelectModal(false);
                setIsRunning(true);
              }}
              className="w-full mt-5 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-white shadow-lg shadow-emerald-600/20 transition"
            >
              선택한 책으로 독서 타이머 시작
            </button>
          </div>
        </div>
      )}

      {/* [모달 2] 독서 타이머 종료 후 페이지 기록 모달 */}
      {showReadingLogModal && selectedBook && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSaveReadingLog}
            className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-center gap-2.5 text-emerald-400">
              <Sparkles className="w-6 h-6" />
              <h3 className="font-bold text-lg text-white">독서 루틴 완료! 기록을 남길까요?</h3>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <p className="text-xs text-slate-400">읽은 도서</p>
              <p className="font-bold text-base text-slate-100 mt-0.5">{selectedBook.title}</p>
              <p className="text-xs text-emerald-400 mt-1">
                이전 위치: {selectedBook.currentPage}페이지 (전체 {selectedBook.totalPages}p)
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                오늘 몇 페이지까지 읽으셨나요?
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={selectedBook.currentPage}
                  max={selectedBook.totalPages}
                  value={endPageInput}
                  onChange={(e) => setEndPageInput(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold text-lg focus:outline-none focus:border-emerald-500"
                  required
                />
                <span className="text-sm text-slate-400 shrink-0">/ {selectedBook.totalPages} p</span>
              </div>
              {Number(endPageInput) > selectedBook.currentPage && (
                <p className="text-xs text-emerald-400 mt-1.5 font-medium">
                  ✨ 오늘 총 {Number(endPageInput) - selectedBook.currentPage}페이지를 읽었습니다!
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                인상 깊은 문장이나 한 줄 메모 (선택)
              </label>
              <input
                type="text"
                placeholder="예: 작은 습관이 복리로 쌓여 정체성을 만든다."
                value={memoInput}
                onChange={(e) => setMemoInput(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowReadingLogModal(false);
                  moveToNextStep();
                }}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-slate-300 transition"
              >
                건너뛰기
              </button>
              <button
                type="submit"
                className="flex-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition"
              >
                저장하고 다음 단계로
              </button>
            </div>
          </form>
        </div>
      )}

      {/* [모달 3] 새 책 등록 모달 */}
      {showAddBookModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleAddBook}
            className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">새 책 서재에 추가</h3>
              <button
                type="button"
                onClick={() => setShowAddBookModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">책 제목 *</label>
              <input
                type="text"
                placeholder="예: 사피엔스"
                value={newBookTitle}
                onChange={(e) => setNewBookTitle(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">저자</label>
              <input
                type="text"
                placeholder="예: 유발 하라리"
                value={newBookAuthor}
                onChange={(e) => setNewBookAuthor(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">전체 페이지 수 *</label>
              <input
                type="number"
                min="1"
                placeholder="예: 636"
                value={newBookTotalPages}
                onChange={(e) => setNewBookTotalPages(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full mt-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-sm text-white transition"
            >
              서재에 등록하기
            </button>
          </form>
        </div>
      )}
    </div>
  );
}