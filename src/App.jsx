import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  BookOpen,
  Check,
  Plus,
  Clock,
  Library,
  ChevronRight,
  X,
  Flame,
  Volume2,
  VolumeX,
  Cloud,
  CloudOff,
  RefreshCw,
  Bookmark,
  Feather,
  Trash2,
  Edit3,
  CheckSquare,
  Square,
  ArrowUp,
  ArrowDown,
  Languages,
  CheckCircle2
} from 'lucide-react';
import {
  initGoogleAuth,
  requestGoogleLogin,
  pullFromGoogleDrive,
  pushToGoogleDrive,
} from './googleDriveSync';

const INITIAL_BOOKS = [
  {
    id: 'bk_1',
    title: '클린 아키텍처',
    author: '로버트 C. 마틴',
    totalPages: 352,
    currentPage: 120,
    coverColor: '#2B4C7E',
    status: 'reading',
  },
  {
    id: 'bk_2',
    title: '아주 작은 습관의 힘',
    author: '제임스 클리어',
    totalPages: 360,
    currentPage: 285,
    coverColor: '#2C5E4F',
    status: 'reading',
  },
  {
    id: 'bk_3',
    title: '도둑맞은 집중력',
    author: '요한 하리',
    totalPages: 464,
    currentPage: 464,
    coverColor: '#8C4A32',
    status: 'done',
  },
];

const INITIAL_ENGLISH_BOOKS = [
  {
    id: 'ebk_1',
    title: '영어회화 핵심패턴 233',
    author: '백선엽',
    totalUnits: 233,
    currentUnit: 45,
    unitLabel: '문장',
    coverColor: '#2B4C7E',
    status: 'studying',
  },
];

const INITIAL_ENGLISH_LOGS = [
  {
    id: 'elog_1',
    bookId: 'ebk_1',
    bookTitle: '영어회화 핵심패턴 233',
    date: '2026-11-20',
    durationMin: 15,
    unitsPracticed: 5,
    unitLabel: '문장',
    sentence: 'I am supposed to finish this report by tomorrow.',
    meaning: '내일까지 이 보고서를 끝내기로 되어 있어요.',
  },
];

const INITIAL_ROUTINE = {
  id: 'rt_daily',
  title: '매일 성장 루틴',
  steps: [
    { id: 'st_1', name: '물 한 잔 & 가벼운 스트레칭', durationSec: 180, category: 'normal' },
    { id: 'st_2', name: '영어 문장 연습', durationSec: 900, category: 'english' },
    { id: 'st_3', name: '깊이 있는 독서 시간', durationSec: 1200, category: 'reading' },
  ],
};

function migrateRoutine(rt) {
  if (!rt || !Array.isArray(rt.steps)) return INITIAL_ROUTINE;
  return {
    ...rt,
    steps: rt.steps.map((s) =>
      s.name === '영어 문장 암기 & 쉐도잉' ? { ...s, name: '영어 문장 연습' } : s
    ),
  };
}

function formatUnit(value, unitLabel = '문장') {
  return unitLabel === 'p' ? `${value}p` : `${value}${unitLabel}`;
}

function getLocalDateStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function App() {
  const loadLocal = (key, fallback) => {
    try {
      const saved = localStorage.getItem(key);
      return saved !== null ? JSON.parse(saved) : fallback;
    } catch {
      return fallback;
    }
  };

  const [activeTab, setActiveTab] = useState('routine');
  const [books, setBooks] = useState(() => loadLocal('rb_books', INITIAL_BOOKS));
  const [routine, setRoutine] = useState(() => migrateRoutine(loadLocal('rb_routine', INITIAL_ROUTINE)));
  const [readingLogs, setReadingLogs] = useState(() =>
    loadLocal('rb_logs', [
      {
        id: 'log_1',
        bookId: 'bk_1',
        bookTitle: '클린 아키텍처',
        date: '2026-11-20',
        durationMin: 20,
        pagesRead: 15,
        memo: '컴포넌트 결합도와 응집도 원칙 정리',
      },
    ])
  );
  const [englishBooks, setEnglishBooks] = useState(() =>
    loadLocal('rb_english_books', INITIAL_ENGLISH_BOOKS)
  );
  const [englishLogs, setEnglishLogs] = useState(() =>
    loadLocal('rb_english_logs', INITIAL_ENGLISH_LOGS)
  );

  // 오늘 날짜 기준 실제 완료된 루틴 단계 ID 목록 (항목별 독립 상태 유지)
  const [completedStepIds, setCompletedStepIds] = useState(() => {
    const savedDate = loadLocal('rb_steps_date', null);
    const today = getLocalDateStr(0);
    if (savedDate !== today) return [];
    return loadLocal('rb_completed_steps', []);
  });

  // 연속 달성 일수 및 마지막 완료 날짜 관리
  const [lastCompletedDate, setLastCompletedDate] = useState(() =>
    loadLocal('rb_last_date', null)
  );
  const [streakCount, setStreakCount] = useState(() => {
    const savedCount = loadLocal('rb_streak', 0);
    const savedDate = loadLocal('rb_last_date', null);
    if (!savedDate) return savedCount;
    const today = getLocalDateStr(0);
    const yesterday = getLocalDateStr(-1);
    if (savedDate !== today && savedDate !== yesterday) {
      return 0;
    }
    return savedCount;
  });

  // 연속 일수 수동 수정 모달 상태
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [streakInput, setStreakInput] = useState('');

  // Google Drive 동기화 상태
  const [syncStatus, setSyncStatus] = useState('disconnected');
  const isInitialRemoteLoad = useRef(false);

  // 타이머 상태
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(
    () => loadLocal('rb_routine', INITIAL_ROUTINE).steps[0]?.durationSec || 600
  );
  const [isRunning, setIsRunning] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // 루틴 편집 상태
  const [isEditingRoutine, setIsEditingRoutine] = useState(false);
  const [draftRoutine, setDraftRoutine] = useState(routine);

  // 서재 및 독서노트 선택/일괄 삭제 상태
  const [isSelectingBooks, setIsSelectingBooks] = useState(false);
  const [selectedBookIdsForDelete, setSelectedBookIdsForDelete] = useState([]);
  const [isSelectingLogs, setIsSelectingLogs] = useState(false);
  const [selectedLogIdsForDelete, setSelectedLogIdsForDelete] = useState([]);

  // 영어학습 교재 및 문장노트 선택/일괄 삭제 상태
  const [isSelectingEnglishBooks, setIsSelectingEnglishBooks] = useState(false);
  const [selectedEnglishBookIdsForDelete, setSelectedEnglishBookIdsForDelete] = useState([]);
  const [isSelectingEnglishLogs, setIsSelectingEnglishLogs] = useState(false);
  const [selectedEnglishLogIdsForDelete, setSelectedEnglishLogIdsForDelete] = useState([]);

  // 독서 연동 상태
  const [selectedBookId, setSelectedBookId] = useState(() => {
    const initial = loadLocal('rb_books', INITIAL_BOOKS);
    const reading = initial.find((b) => b.status === 'reading');
    return reading ? reading.id : initial[0]?.id || '';
  });
  const [showBookSelectModal, setShowBookSelectModal] = useState(false);
  const [showReadingLogModal, setShowReadingLogModal] = useState(false);
  const [completedReadingDuration, setCompletedReadingDuration] = useState(0);

  // 영어학습 연동 상태
  const [selectedEnglishBookId, setSelectedEnglishBookId] = useState(() => {
    const initial = loadLocal('rb_english_books', INITIAL_ENGLISH_BOOKS);
    const studying = initial.find((b) => b.status === 'studying');
    return studying ? studying.id : initial[0]?.id || '';
  });
  const [showEnglishBookSelectModal, setShowEnglishBookSelectModal] = useState(false);
  const [showEnglishLogModal, setShowEnglishLogModal] = useState(false);
  const [completedEnglishDuration, setCompletedEnglishDuration] = useState(0);
  const [isDirectEnglishLog, setIsDirectEnglishLog] = useState(false);
  const [pendingCompleteStepId, setPendingCompleteStepId] = useState(null);

  // 모달 입력 상태
  const [endPageInput, setEndPageInput] = useState('');
  const [memoInput, setMemoInput] = useState('');
  const [showAddBookModal, setShowAddBookModal] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState('');
  const [newBookAuthor, setNewBookAuthor] = useState('');
  const [newBookTotalPages, setNewBookTotalPages] = useState('');

  // 영어학습 모달 입력 상태
  const [englishEndUnitInput, setEnglishEndUnitInput] = useState('');
  const [englishSentenceInput, setEnglishSentenceInput] = useState('');
  const [englishMeaningInput, setEnglishMeaningInput] = useState('');
  const [showAddEnglishBookModal, setShowAddEnglishBookModal] = useState(false);
  const [newEnglishBookTitle, setNewEnglishBookTitle] = useState('');
  const [newEnglishBookAuthor, setNewEnglishBookAuthor] = useState('');
  const [newEnglishBookTotalUnits, setNewEnglishBookTotalUnits] = useState('');
  const [newEnglishBookUnitLabel, setNewEnglishBookUnitLabel] = useState('문장');

  const safeStepIdx = routine.steps.length > 0 ? Math.min(currentStepIdx, routine.steps.length - 1) : 0;
  const currentStep = routine.steps[safeStepIdx] || {
    id: 'empty',
    name: '루틴 단계를 추가해주세요',
    durationSec: 600,
    category: 'normal',
  };
  const selectedBook = books.find((b) => b.id === selectedBookId) || books[0];
  const selectedEnglishBook =
    englishBooks.find((b) => b.id === selectedEnglishBookId) || englishBooks[0];
  const audioCtxRef = useRef(null);

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
              if (remoteData.routine) {
                const migrated = migrateRoutine(remoteData.routine);
                setRoutine(migrated);
                if (migrated.steps?.[0]) {
                  setCurrentStepIdx(0);
                  setTimeLeft(migrated.steps[0].durationSec);
                }
              }
              if (remoteData.readingLogs) setReadingLogs(remoteData.readingLogs);
              if (remoteData.englishBooks) setEnglishBooks(remoteData.englishBooks);
              if (remoteData.englishLogs) setEnglishLogs(remoteData.englishLogs);
              if (typeof remoteData.streakCount === 'number') setStreakCount(remoteData.streakCount);
              if (remoteData.lastCompletedDate !== undefined) {
                setLastCompletedDate(remoteData.lastCompletedDate);
              }
              if (
                remoteData.stepsDate === getLocalDateStr(0) &&
                Array.isArray(remoteData.completedStepIds)
              ) {
                setCompletedStepIds(remoteData.completedStepIds);
              }
            } else {
              await pushToGoogleDrive({
                books,
                routine,
                readingLogs,
                englishBooks,
                englishLogs,
                streakCount,
                lastCompletedDate,
                completedStepIds,
                stepsDate: getLocalDateStr(0),
              });
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

  // 로컬 저장 + Drive 자동 백업
  useEffect(() => {
    const today = getLocalDateStr(0);
    localStorage.setItem('rb_books', JSON.stringify(books));
    localStorage.setItem('rb_routine', JSON.stringify(routine));
    localStorage.setItem('rb_logs', JSON.stringify(readingLogs));
    localStorage.setItem('rb_english_books', JSON.stringify(englishBooks));
    localStorage.setItem('rb_english_logs', JSON.stringify(englishLogs));
    localStorage.setItem('rb_streak', JSON.stringify(streakCount));
    localStorage.setItem('rb_last_date', JSON.stringify(lastCompletedDate));
    localStorage.setItem('rb_completed_steps', JSON.stringify(completedStepIds));
    localStorage.setItem('rb_steps_date', JSON.stringify(today));

    if (syncStatus === 'disconnected') return;
    if (isInitialRemoteLoad.current) {
      isInitialRemoteLoad.current = false;
      return;
    }

    setSyncStatus('syncing');
    const debounceTimer = setTimeout(async () => {
      try {
        await pushToGoogleDrive({
          books,
          routine,
          readingLogs,
          englishBooks,
          englishLogs,
          streakCount,
          lastCompletedDate,
          completedStepIds,
          stepsDate: today,
        });
        setSyncStatus('synced');
      } catch (err) {
        console.error(err);
        setSyncStatus('error');
      }
    }, 2000);

    return () => clearTimeout(debounceTimer);
  }, [books, routine, readingLogs, englishBooks, englishLogs, streakCount, lastCompletedDate, completedStepIds]);

  // 차분한 종소리 알림음
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
      osc.frequency.setValueAtTime(type === 'complete' ? 659.25 : 523.25, ctx.currentTime);
      if (type === 'complete') {
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.18);
      }

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.7);
    } catch {
      // 무시
    }
  };

  // 다른 항목 선택 시 완료 상태는 건드리지 않고 해당 단계로 포커스만 이동
  const selectStep = (index) => {
    const targetStep = routine.steps[index];
    if (!targetStep) return;
    setIsRunning(false);
    setCurrentStepIdx(index);
    setTimeLeft(targetStep.durationSec);

    if (targetStep.category === 'reading' && books.filter((b) => b.status === 'reading').length > 0) {
      setShowBookSelectModal(true);
    } else if (
      targetStep.category === 'english' &&
      englishBooks.filter((b) => b.status === 'studying').length > 0
    ) {
      setShowEnglishBookSelectModal(true);
    }
  };

  // 지정한 단계(기본값: 현재 단계) 완료 트리거
  const handleStepComplete = (targetIdx = safeStepIdx) => {
    if (routine.steps.length === 0) return;
    const targetStep = routine.steps[targetIdx];
    if (!targetStep) return;

    playChime('step');

    if (targetStep.category === 'reading' && selectedBook) {
      setIsRunning(false);
      setPendingCompleteStepId(targetStep.id);
      setCompletedReadingDuration(targetStep.durationSec);
      setEndPageInput(String(selectedBook.currentPage));
      setMemoInput('');
      setShowReadingLogModal(true);
      return;
    }

    if (targetStep.category === 'english') {
      setIsRunning(false);
      setPendingCompleteStepId(targetStep.id);
      setCompletedEnglishDuration(targetStep.durationSec);
      setEnglishEndUnitInput(selectedEnglishBook ? String(selectedEnglishBook.currentUnit) : '');
      setEnglishSentenceInput('');
      setEnglishMeaningInput('');
      setIsDirectEnglishLog(false);
      setShowEnglishLogModal(true);
      return;
    }

    markStepDoneAndAdvance(targetStep.id);
  };

  // 루틴 목록에서 항목을 빠르게 완료하거나 완료 취소
  const handleQuickToggleStep = (index) => {
    const targetStep = routine.steps[index];
    if (!targetStep) return;

    if (completedStepIds.includes(targetStep.id)) {
      setCompletedStepIds((prev) => prev.filter((id) => id !== targetStep.id));
      return;
    }

    handleStepComplete(index);
  };

  // 실제 완료된 항목 ID만 기록하고, 현재 포커스된 단계가 완료된 경우 다음 미완료 항목으로 이동
  const markStepDoneAndAdvance = (stepId = currentStep.id) => {
    const targetId = stepId || currentStep.id;
    const nextCompletedIds = completedStepIds.includes(targetId)
      ? completedStepIds
      : [...completedStepIds, targetId];

    setPendingCompleteStepId(null);

    const allStepsDone =
      routine.steps.length > 0 &&
      routine.steps.every((step) => nextCompletedIds.includes(step.id));

    if (allStepsDone) {
      playChime('complete');
      setIsRunning(false);

      const today = getLocalDateStr(0);
      const yesterday = getLocalDateStr(-1);

      if (lastCompletedDate === today) {
        alert('오늘의 루틴 항목을 모두 다시 완료했습니다! (오늘 연속 일수는 이미 반영되었습니다)');
      } else {
        const nextStreak = lastCompletedDate === yesterday ? streakCount + 1 : 1;
        setStreakCount(nextStreak);
        setLastCompletedDate(today);
        alert(`오늘의 모든 루틴 항목을 완료했습니다! (${nextStreak}일 연속 달성)`);
      }

      // 전체 완료 후 다음 회차를 위해 초기화
      setCompletedStepIds([]);
      setCurrentStepIdx(0);
      setTimeLeft(routine.steps[0]?.durationSec || 600);
      return;
    }

    setCompletedStepIds(nextCompletedIds);

    // 현재 포커스된 단계를 완료한 경우에만 다음 미완료 단계로 자동 이동
    if (targetId === currentStep.id) {
      let nextIdx = routine.steps.findIndex(
        (s, idx) => idx > safeStepIdx && !nextCompletedIds.includes(s.id)
      );
      if (nextIdx === -1) {
        nextIdx = routine.steps.findIndex((s) => !nextCompletedIds.includes(s.id));
      }

      if (nextIdx !== -1) {
        selectStep(nextIdx);
      }
    }
  };

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleStepComplete(safeStepIdx);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isRunning, safeStepIdx, selectedBook, selectedEnglishBook, routine, completedStepIds]);

  const handleToggleStart = () => {
    if (routine.steps.length === 0) {
      alert('먼저 루틴 항목을 추가해주세요.');
      return;
    }
    if (
      !isRunning &&
      currentStep.category === 'reading' &&
      timeLeft === currentStep.durationSec &&
      books.filter((b) => b.status === 'reading').length > 0
    ) {
      setShowBookSelectModal(true);
      return;
    }
    if (
      !isRunning &&
      currentStep.category === 'english' &&
      timeLeft === currentStep.durationSec &&
      englishBooks.filter((b) => b.status === 'studying').length > 0
    ) {
      setShowEnglishBookSelectModal(true);
      return;
    }
    setIsRunning((prev) => !prev);
  };

  // --- 루틴 직접 편집 핸들러 ---
  const handleStartEditRoutine = () => {
    setIsRunning(false);
    setDraftRoutine(JSON.parse(JSON.stringify(routine)));
    setIsEditingRoutine(true);
  };

  const handleAddDraftStep = () => {
    const newStep = {
      id: `st_${Date.now()}`,
      name: '새 루틴 항목',
      durationSec: 600,
      category: 'normal',
    };
    setDraftRoutine((prev) => ({
      ...prev,
      steps: [...prev.steps, newStep],
    }));
  };

  const handleUpdateDraftStep = (id, field, value) => {
    setDraftRoutine((prev) => ({
      ...prev,
      steps: prev.steps.map((s) => (s.id === id ? { ...s, [field]: value } : s)),
    }));
  };

  const handleRemoveDraftStep = (id) => {
    setDraftRoutine((prev) => ({
      ...prev,
      steps: prev.steps.filter((s) => s.id !== id),
    }));
  };

  const handleMoveDraftStep = (index, direction) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= draftRoutine.steps.length) return;
    const updated = [...draftRoutine.steps];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIdx, 0, moved);
    setDraftRoutine((prev) => ({ ...prev, steps: updated }));
  };

  const handleSaveRoutineEdit = () => {
    if (draftRoutine.steps.length === 0) {
      alert('최소 1개 이상의 루틴 단계가 필요합니다.');
      return;
    }
    const cleaned = {
      ...draftRoutine,
      title: draftRoutine.title.trim() || '매일 성장 루틴',
      steps: draftRoutine.steps.map((s) => ({
        ...s,
        name: s.name.trim() || '이름 없는 단계',
        durationSec: Math.max(60, Number(s.durationSec) || 60),
      })),
    };
    const validIds = new Set(cleaned.steps.map((s) => s.id));
    setCompletedStepIds((prev) => prev.filter((id) => validIds.has(id)));
    setRoutine(cleaned);
    setCurrentStepIdx(0);
    setTimeLeft(cleaned.steps[0].durationSec);
    setIsEditingRoutine(false);
  };

  // --- 도서 삭제 및 연관 독서노트 연쇄 삭제 ---
  const deleteBooksWithCascade = (idsToDelete) => {
    if (idsToDelete.length === 0) return;
    const targetBooks = books.filter((b) => idsToDelete.includes(b.id));
    const targetTitles = targetBooks.map((b) => b.title);

    const remainingBooks = books.filter((b) => !idsToDelete.includes(b.id));
    setBooks(remainingBooks);

    setReadingLogs((prevLogs) =>
      prevLogs.filter(
        (log) =>
          !(log.bookId && idsToDelete.includes(log.bookId)) &&
          !targetTitles.includes(log.bookTitle)
      )
    );

    if (idsToDelete.includes(selectedBookId)) {
      const nextReading = remainingBooks.find((b) => b.status === 'reading');
      setSelectedBookId(nextReading ? nextReading.id : remainingBooks[0]?.id || '');
    }
  };

  const handleDeleteSingleBook = (book) => {
    if (
      window.confirm(
        `'${book.title}' 도서를 삭제하시겠습니까?\n이 책과 관련된 독서 문장 및 메모도 함께 삭제됩니다.`
      )
    ) {
      deleteBooksWithCascade([book.id]);
    }
  };

  const handleBatchDeleteBooks = () => {
    if (selectedBookIdsForDelete.length === 0) return;
    if (
      window.confirm(
        `선택한 ${selectedBookIdsForDelete.length}권의 도서를 삭제하시겠습니까?\n선택한 책들의 독서 문장 및 메모도 모두 삭제됩니다.`
      )
    ) {
      deleteBooksWithCascade(selectedBookIdsForDelete);
      setSelectedBookIdsForDelete([]);
      setIsSelectingBooks(false);
    }
  };

  const toggleBookSelect = (bookId) => {
    setSelectedBookIdsForDelete((prev) =>
      prev.includes(bookId) ? prev.filter((id) => id !== bookId) : [...prev, bookId]
    );
  };

  // --- 독서 문장 & 메모 개별/일괄 삭제 ---
  const handleDeleteSingleLog = (logId) => {
    if (window.confirm('이 독서 문장 & 메모를 삭제하시겠습니까?')) {
      setReadingLogs((prev) => prev.filter((l) => l.id !== logId));
    }
  };

  const handleBatchDeleteLogs = () => {
    if (selectedLogIdsForDelete.length === 0) return;
    if (
      window.confirm(`선택한 ${selectedLogIdsForDelete.length}개의 독서 기록을 삭제하시겠습니까?`)
    ) {
      setReadingLogs((prev) => prev.filter((l) => !selectedLogIdsForDelete.includes(l.id)));
      setSelectedLogIdsForDelete([]);
      setIsSelectingLogs(false);
    }
  };

  const toggleLogSelect = (logId) => {
    setSelectedLogIdsForDelete((prev) =>
      prev.includes(logId) ? prev.filter((id) => id !== logId) : [...prev, logId]
    );
  };

  // --- 연속 달성 일수 수동 수정 ---
  const handleSaveStreakEdit = (e) => {
    e.preventDefault();
    const parsed = Math.max(0, Math.floor(Number(streakInput) || 0));
    setStreakCount(parsed);
    if (parsed === 0) {
      setLastCompletedDate(null);
    } else if (!lastCompletedDate) {
      setLastCompletedDate(getLocalDateStr(-1));
    }
    setShowStreakModal(false);
  };

  // 독서 기록 저장
  const handleSaveReadingLog = (e) => {
    e.preventDefault();
    if (!selectedBook) return;

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
      bookId: selectedBook.id,
      bookTitle: selectedBook.title,
      date: getLocalDateStr(0),
      durationMin: Math.max(1, Math.round(completedReadingDuration / 60)),
      pagesRead,
      memo: memoInput.trim() || '꾸준한 독서 루틴 기록',
    };

    setReadingLogs((prev) => [newLog, ...prev]);
    setShowReadingLogModal(false);
    markStepDoneAndAdvance(pendingCompleteStepId);
  };

  // --- 영어 교재 삭제 및 연관 문장노트 연쇄 삭제 ---
  const deleteEnglishBooksWithCascade = (idsToDelete) => {
    if (idsToDelete.length === 0) return;
    const targetBooks = englishBooks.filter((b) => idsToDelete.includes(b.id));
    const targetTitles = targetBooks.map((b) => b.title);

    const remainingBooks = englishBooks.filter((b) => !idsToDelete.includes(b.id));
    setEnglishBooks(remainingBooks);

    setEnglishLogs((prevLogs) =>
      prevLogs.filter(
        (log) =>
          !(log.bookId && idsToDelete.includes(log.bookId)) &&
          !targetTitles.includes(log.bookTitle)
      )
    );

    if (idsToDelete.includes(selectedEnglishBookId)) {
      const nextStudying = remainingBooks.find((b) => b.status === 'studying');
      setSelectedEnglishBookId(nextStudying ? nextStudying.id : remainingBooks[0]?.id || '');
    }
  };

  const handleDeleteSingleEnglishBook = (book) => {
    if (
      window.confirm(
        `'${book.title}' 영어 교재를 삭제하시겠습니까?\n이 교재와 관련된 영어 문장 기록도 함께 삭제됩니다.`
      )
    ) {
      deleteEnglishBooksWithCascade([book.id]);
    }
  };

  const handleBatchDeleteEnglishBooks = () => {
    if (selectedEnglishBookIdsForDelete.length === 0) return;
    if (
      window.confirm(
        `선택한 ${selectedEnglishBookIdsForDelete.length}권의 영어 교재를 삭제하시겠습니까?\n선택한 교재들의 영어 문장 기록도 모두 삭제됩니다.`
      )
    ) {
      deleteEnglishBooksWithCascade(selectedEnglishBookIdsForDelete);
      setSelectedEnglishBookIdsForDelete([]);
      setIsSelectingEnglishBooks(false);
    }
  };

  const toggleEnglishBookSelect = (bookId) => {
    setSelectedEnglishBookIdsForDelete((prev) =>
      prev.includes(bookId) ? prev.filter((id) => id !== bookId) : [...prev, bookId]
    );
  };

  // --- 영어 문장 기록 개별/일괄 삭제 ---
  const handleDeleteSingleEnglishLog = (logId) => {
    if (window.confirm('이 영어 문장 기록을 삭제하시겠습니까?')) {
      setEnglishLogs((prev) => prev.filter((l) => l.id !== logId));
    }
  };

  const handleBatchDeleteEnglishLogs = () => {
    if (selectedEnglishLogIdsForDelete.length === 0) return;
    if (
      window.confirm(
        `선택한 ${selectedEnglishLogIdsForDelete.length}개의 영어 문장 기록을 삭제하시겠습니까?`
      )
    ) {
      setEnglishLogs((prev) =>
        prev.filter((l) => !selectedEnglishLogIdsForDelete.includes(l.id))
      );
      setSelectedEnglishLogIdsForDelete([]);
      setIsSelectingEnglishLogs(false);
    }
  };

  const toggleEnglishLogSelect = (logId) => {
    setSelectedEnglishLogIdsForDelete((prev) =>
      prev.includes(logId) ? prev.filter((id) => id !== logId) : [...prev, logId]
    );
  };

  // 영어학습 탭에서 직접 문장 기록 열기
  const handleOpenDirectEnglishLog = () => {
    setCompletedEnglishDuration(0);
    setEnglishEndUnitInput(selectedEnglishBook ? String(selectedEnglishBook.currentUnit) : '');
    setEnglishSentenceInput('');
    setEnglishMeaningInput('');
    setIsDirectEnglishLog(true);
    setShowEnglishLogModal(true);
  };

  // 영어 문장 연습 기록 저장
  const handleSaveEnglishLog = (e) => {
    e.preventDefault();
    const trimmedSentence = englishSentenceInput.trim();
    if (!trimmedSentence) return;

    let unitsPracticed = 0;
    let bookId = null;
    let bookTitle = '자유 영어 연습';
    let unitLabel = '문장';

    if (selectedEnglishBook) {
      bookId = selectedEnglishBook.id;
      bookTitle = selectedEnglishBook.title;
      unitLabel = selectedEnglishBook.unitLabel || '문장';

      const parsedEndUnit = Math.min(
        selectedEnglishBook.totalUnits,
        Math.max(
          selectedEnglishBook.currentUnit,
          Number(englishEndUnitInput) || selectedEnglishBook.currentUnit
        )
      );
      unitsPracticed = parsedEndUnit - selectedEnglishBook.currentUnit;
      const isFinished = parsedEndUnit >= selectedEnglishBook.totalUnits;

      setEnglishBooks((prevBooks) =>
        prevBooks.map((b) =>
          b.id === selectedEnglishBook.id
            ? {
                ...b,
                currentUnit: parsedEndUnit,
                status: isFinished ? 'done' : 'studying',
              }
            : b
        )
      );
    }

    const newLog = {
      id: `elog_${Date.now()}`,
      bookId,
      bookTitle,
      date: getLocalDateStr(0),
      durationMin: completedEnglishDuration > 0 ? Math.max(1, Math.round(completedEnglishDuration / 60)) : 0,
      unitsPracticed,
      unitLabel,
      sentence: trimmedSentence,
      meaning: englishMeaningInput.trim(),
    };

    setEnglishLogs((prev) => [newLog, ...prev]);
    setShowEnglishLogModal(false);

    if (!isDirectEnglishLog) {
      markStepDoneAndAdvance(pendingCompleteStepId);
    }
  };

  // 새 영어 교재 등록
  const handleAddEnglishBook = (e) => {
    e.preventDefault();
    if (!newEnglishBookTitle.trim() || !newEnglishBookTotalUnits) return;

    const coverPalette = ['#2B4C7E', '#3A5A8C', '#1F3A5F', '#4A5D7A', '#2C5E4F'];
    const pickedColor = coverPalette[englishBooks.length % coverPalette.length];

    const newBook = {
      id: `ebk_${Date.now()}`,
      title: newEnglishBookTitle.trim(),
      author: newEnglishBookAuthor.trim() || '저자/출판사 미상',
      totalUnits: Number(newEnglishBookTotalUnits),
      currentUnit: 0,
      unitLabel: newEnglishBookUnitLabel || '문장',
      coverColor: pickedColor,
      status: 'studying',
    };

    setEnglishBooks((prev) => [newBook, ...prev]);
    setSelectedEnglishBookId(newBook.id);
    setNewEnglishBookTitle('');
    setNewEnglishBookAuthor('');
    setNewEnglishBookTotalUnits('');
    setNewEnglishBookUnitLabel('문장');
    setShowAddEnglishBookModal(false);
  };

  // 새 책 등록
  const handleAddBook = (e) => {
    e.preventDefault();
    if (!newBookTitle.trim() || !newBookTotalPages) return;

    const coverPalette = ['#2C5E4F', '#2B4C7E', '#8C4A32', '#5B4B8A', '#7A5C38'];
    const pickedColor = coverPalette[books.length % coverPalette.length];

    const newBook = {
      id: `bk_${Date.now()}`,
      title: newBookTitle.trim(),
      author: newBookAuthor.trim() || '저자 미상',
      totalPages: Number(newBookTotalPages),
      currentPage: 0,
      coverColor: pickedColor,
      status: 'reading',
    };

    setBooks((prev) => [newBook, ...prev]);
    setSelectedBookId(newBook.id);
    setNewBookTitle('');
    setNewBookAuthor('');
    setNewBookTotalPages('');
    setShowAddBookModal(false);
  };

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const progressPercent =
    currentStep.durationSec > 0
      ? ((currentStep.durationSec - timeLeft) / currentStep.durationSec) * 100
      : 0;
  const radius = 114;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  const readingBooks = books.filter((b) => b.status === 'reading');
  const completedBooks = books.filter((b) => b.status === 'done');
  const studyingEnglishBooks = englishBooks.filter((b) => b.status === 'studying');
  const completedEnglishBooks = englishBooks.filter((b) => b.status === 'done');

  const accentColor =
    currentStep.category === 'reading'
      ? '#2C5E4F'
      : currentStep.category === 'english'
      ? '#2B4C7E'
      : '#C85A32';

  return (
    <div
      className="min-h-screen bg-[#FAF8F5] text-[#1E1D1A] flex flex-col items-center selection:bg-[#C85A32]/20"
      style={{ fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {/* 상단 에디토리얼 헤더 */}
      <header className="w-full max-w-xl px-5 py-4 flex items-center justify-between border-b border-[#E8E2D5] bg-[#FAF8F5]/95 backdrop-blur sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#1E1D1A] flex items-center justify-center text-[#FAF8F5]">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h1
              className="font-bold text-lg tracking-tight leading-none text-[#1E1D1A]"
              style={{ fontFamily: "'Noto Serif KR', serif" }}
            >
              RoutineBook
            </h1>
            <p className="text-[11px] text-[#78736A] mt-0.5">습관과 독서의 기록</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Google Drive 동기화 상태 버튼 */}
          <button
            onClick={requestGoogleLogin}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
              syncStatus === 'synced'
                ? 'bg-[#EEF5F1] border-[#C5DDD0] text-[#2C5E4F]'
                : syncStatus === 'syncing'
                ? 'bg-[#F3F0EA] border-[#DCD5C7] text-[#5C5850]'
                : syncStatus === 'error'
                ? 'bg-[#FDF0ED] border-[#F0C8BE] text-[#B84A32]'
                : 'bg-white border-[#E2DCD0] text-[#5C5850] hover:bg-[#F3F0EA]'
            }`}
            title="Google Drive 동기화"
          >
            {syncStatus === 'synced' && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[#2C5E4F]" />
                <span>동기화됨</span>
              </>
            )}
            {syncStatus === 'syncing' && (
              <>
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>저장 중</span>
              </>
            )}
            {syncStatus === 'error' && (
              <>
                <CloudOff className="w-3.5 h-3.5" />
                <span>재연결</span>
              </>
            )}
            {syncStatus === 'disconnected' && (
              <>
                <Cloud className="w-3.5 h-3.5 text-[#78736A]" />
                <span>Drive 연결</span>
              </>
            )}
          </button>

          {/* 연속 실천 스트릭 */}
          <button
            onClick={() => {
              setStreakInput(String(streakCount));
              setShowStreakModal(true);
            }}
            className="flex items-center gap-1 bg-[#F4EFE6] hover:bg-[#EAE2D3] border border-[#E6DFD1] px-2.5 py-1.5 rounded-lg transition"
            title="클릭하여 연속 달성 일수 수정"
          >
            <Flame className="w-3.5 h-3.5 text-[#C85A32] fill-[#C85A32]" />
            <span className="text-xs font-bold text-[#1E1D1A]">{streakCount}일</span>
          </button>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-1.5 rounded-lg bg-white border border-[#E2DCD0] text-[#5C5850] hover:text-[#1E1D1A] transition"
            title="종소리 켜기/끄기"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* 미니멀 언더라인 탭 네비게이션 */}
      <nav className="w-full max-w-xl px-5 border-b border-[#E8E2D5] bg-[#FAF8F5]">
        <div className="flex gap-4 sm:gap-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab('routine')}
            className={`py-3.5 text-sm font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === 'routine'
                ? 'border-[#1E1D1A] text-[#1E1D1A]'
                : 'border-transparent text-[#8A847A] hover:text-[#4A4741]'
            }`}
          >
            <Clock className="w-4 h-4" />
            루틴 타이머
          </button>
          <button
            onClick={() => setActiveTab('bookshelf')}
            className={`py-3.5 text-sm font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === 'bookshelf'
                ? 'border-[#1E1D1A] text-[#1E1D1A]'
                : 'border-transparent text-[#8A847A] hover:text-[#4A4741]'
            }`}
          >
            <Library className="w-4 h-4" />
            서재 & 독서노트
            <span className="text-xs px-1.5 py-0.5 rounded bg-[#EFECE6] text-[#5C5850]">
              {books.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('english')}
            className={`py-3.5 text-sm font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === 'english'
                ? 'border-[#2B4C7E] text-[#1E1D1A]'
                : 'border-transparent text-[#8A847A] hover:text-[#4A4741]'
            }`}
          >
            <Languages className="w-4 h-4" />
            영어학습
            <span className="text-xs px-1.5 py-0.5 rounded bg-[#EDF2F8] text-[#2B4C7E]">
              {englishBooks.length}
            </span>
          </button>
        </div>
      </nav>

      {/* 메인 컨텐츠 */}
      <main className="w-full max-w-xl px-5 py-6 flex-1">
        {activeTab === 'routine' ? (
          <div className="space-y-6">
            {/* 아날로그 크로노그래프 카드 */}
            <section className="bg-white border border-[#E6E0D4] rounded-2xl p-6 sm:p-8 flex flex-col items-center shadow-[0_2px_12px_rgba(30,29,26,0.03)]">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold tracking-wider uppercase text-[#78736A]">
                  STEP {routine.steps.length > 0 ? safeStepIdx + 1 : 0} OF {routine.steps.length}
                </span>
                {currentStep.category === 'reading' && readingBooks.length > 0 && (
                  <button
                    onClick={() => setShowBookSelectModal(true)}
                    className="px-2.5 py-1 rounded-md text-xs font-semibold bg-[#EEF5F1] text-[#2C5E4F] border border-[#C5DDD0] flex items-center gap-1 hover:bg-[#E2EFE8] transition"
                  >
                    <BookOpen className="w-3 h-3" />
                    {selectedBook ? selectedBook.title : '도서 선택'}
                  </button>
                )}
                {currentStep.category === 'english' && studyingEnglishBooks.length > 0 && (
                  <button
                    onClick={() => setShowEnglishBookSelectModal(true)}
                    className="px-2.5 py-1 rounded-md text-xs font-semibold bg-[#EDF2F8] text-[#2B4C7E] border border-[#C6D4E8] flex items-center gap-1 hover:bg-[#E1EAF5] transition"
                  >
                    <Languages className="w-3 h-3" />
                    {selectedEnglishBook ? selectedEnglishBook.title : '영어 교재 선택'}
                  </button>
                )}
              </div>

              <h2
                className="text-xl sm:text-2xl font-bold text-center text-[#1E1D1A] mb-6"
                style={{ fontFamily: "'Noto Serif KR', serif" }}
              >
                {currentStep.name}
              </h2>

              {/* 눈금이 있는 아날로그 원형 다이얼 */}
              <div className="relative flex items-center justify-center my-1">
                <svg className="w-64 h-64 -rotate-90 transform" viewBox="0 0 260 260">
                  <circle
                    cx="130"
                    cy="130"
                    r={radius + 9}
                    stroke="#E6E0D4"
                    strokeWidth="2"
                    strokeDasharray="2 9.9"
                    fill="transparent"
                  />
                  <circle
                    cx="130"
                    cy="130"
                    r={radius}
                    stroke="#F0ECE3"
                    strokeWidth="7"
                    fill="transparent"
                  />
                  <circle
                    cx="130"
                    cy="130"
                    r={radius}
                    stroke={accentColor}
                    strokeWidth="7"
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-500"
                  />
                </svg>

                <div className="absolute flex flex-col items-center">
                  <span
                    className="text-5xl sm:text-6xl font-bold tracking-tight text-[#1E1D1A]"
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatTime(timeLeft)}
                  </span>
                  <span className="text-xs text-[#8A847A] mt-2 font-medium">
                    목표 {Math.floor(currentStep.durationSec / 60)}분
                  </span>
                </div>
              </div>

              {/* 절제된 컨트롤 버튼 */}
              <div className="flex items-center gap-3 mt-7">
                <button
                  onClick={() => {
                    setIsRunning(false);
                    setTimeLeft(currentStep.durationSec);
                  }}
                  className="p-3.5 rounded-xl bg-[#F5F2EB] hover:bg-[#EBE6DC] text-[#5C5850] transition"
                  title="시간 초기화"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                <button
                  onClick={handleToggleStart}
                  style={{ backgroundColor: isRunning ? '#1E1D1A' : accentColor }}
                  className="px-9 py-3.5 rounded-xl font-semibold text-sm text-white flex items-center gap-2 shadow-sm hover:opacity-95 transition active:scale-[0.99]"
                >
                  {isRunning ? (
                    <>
                      <Pause className="w-4 h-4 fill-current" />
                      잠시 멈춤
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      몰입 시작
                    </>
                  )}
                </button>

                <button
                  onClick={() => handleStepComplete(safeStepIdx)}
                  className="p-3.5 rounded-xl bg-[#F5F2EB] hover:bg-[#EBE6DC] text-[#5C5850] transition"
                  title="현재 단계 완료"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>
            </section>

            {/* 루틴 체크리스트 및 직접 편집 섹션 */}
            <section className="bg-white border border-[#E6E0D4] rounded-2xl p-5">
              {!isEditingRoutine ? (
                <>
                  <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-[#F0ECE3]">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-[#1E1D1A]">{routine.title}</h3>
                      <span className="text-xs text-[#78736A]">
                        ({completedStepIds.length}/{routine.steps.length} 완료 • 총{' '}
                        {Math.round(routine.steps.reduce((acc, s) => acc + s.durationSec, 0) / 60)}분)
                      </span>
                    </div>
                    <button
                      onClick={handleStartEditRoutine}
                      className="px-2.5 py-1 rounded-lg bg-[#FAF8F5] hover:bg-[#EFECE6] border border-[#E2DCD0] text-xs font-medium text-[#4A4741] flex items-center gap-1 transition"
                    >
                      <Edit3 className="w-3 h-3" />
                      편집
                    </button>
                  </div>

                  <div className="space-y-2">
                    {routine.steps.map((step, index) => {
                      const isCurrent = index === safeStepIdx;
                      const isDone = completedStepIds.includes(step.id);

                      return (
                        <div
                          key={step.id}
                          onClick={() => selectStep(index)}
                          className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                            isCurrent
                              ? 'bg-[#FAF8F5] border-[#1E1D1A]/40'
                              : isDone
                              ? 'bg-[#FAF8F5]/60 border-[#EFECE6]'
                              : 'bg-white border-[#EFECE6] hover:border-[#D6CFC2]'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuickToggleStep(index);
                              }}
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition ${
                                isDone
                                  ? 'bg-[#2C5E4F] text-white hover:bg-[#234C40]'
                                  : isCurrent
                                  ? 'bg-[#1E1D1A] text-white hover:bg-[#2C5E4F]'
                                  : 'bg-[#F0ECE3] text-[#78736A] hover:bg-[#2C5E4F] hover:text-white'
                              }`}
                              title={isDone ? '완료 취소' : '빠르게 완료하기'}
                            >
                              {isDone ? <Check className="w-3.5 h-3.5" /> : index + 1}
                            </button>
                            <p
                              className={`text-sm font-semibold truncate ${
                                isDone ? 'line-through text-[#8A847A]' : 'text-[#1E1D1A]'
                              }`}
                            >
                              {step.name}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {step.category === 'reading' && (
                              <span className="text-[11px] px-2 py-0.5 rounded bg-[#EEF5F1] text-[#2C5E4F] font-medium">
                                독서기록
                              </span>
                            )}
                            {step.category === 'english' && (
                              <span className="text-[11px] px-2 py-0.5 rounded bg-[#EDF2F8] text-[#2B4C7E] font-medium">
                                영어학습
                              </span>
                            )}
                            <span
                              className="text-xs text-[#78736A] w-9 text-right"
                              style={{ fontFamily: "'JetBrains Mono', monospace" }}
                            >
                              {Math.floor(step.durationSec / 60)}m
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuickToggleStep(index);
                              }}
                              className={`px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 border transition ${
                                isDone
                                  ? 'bg-[#EEF5F1] border-[#C5DDD0] text-[#2C5E4F] hover:bg-[#E2EFE8]'
                                  : 'bg-[#FAF8F5] border-[#DCD5C7] text-[#4A4741] hover:bg-[#1E1D1A] hover:text-white hover:border-[#1E1D1A]'
                              }`}
                              title={isDone ? '완료 해제' : '이 항목 바로 완료'}
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{isDone ? '완료됨' : '완료'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                /* 루틴 편집 모드 UI */
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-2.5 border-b border-[#F0ECE3]">
                    <span className="text-xs font-bold text-[#C85A32]">루틴 항목 편집</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setIsEditingRoutine(false)}
                        className="px-2.5 py-1 rounded-lg bg-[#F5F2EB] text-xs font-medium text-[#5C5850] hover:bg-[#EAE4D7]"
                      >
                        취소
                      </button>
                      <button
                        onClick={handleSaveRoutineEdit}
                        className="px-3 py-1 rounded-lg bg-[#1E1D1A] text-xs font-semibold text-white hover:bg-[#33312C]"
                      >
                        저장 완료
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#78736A] mb-1">
                      루틴 제목
                    </label>
                    <input
                      type="text"
                      value={draftRoutine.title}
                      onChange={(e) =>
                        setDraftRoutine((prev) => ({ ...prev, title: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#FAF8F5] border border-[#D6CFC2] text-sm font-bold text-[#1E1D1A] focus:outline-none focus:border-[#1E1D1A]"
                    />
                  </div>

                  <div className="space-y-2.5">
                    {draftRoutine.steps.map((step, idx) => (
                      <div
                        key={step.id}
                        className="p-3 rounded-xl bg-[#FAF8F5] border border-[#E2DCD0] space-y-2.5"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#78736A] w-4">{idx + 1}.</span>
                          <input
                            type="text"
                            value={step.name}
                            onChange={(e) =>
                              handleUpdateDraftStep(step.id, 'name', e.target.value)
                            }
                            placeholder="할 일 이름 입력"
                            className="flex-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#D6CFC2] text-sm text-[#1E1D1A] focus:outline-none focus:border-[#1E1D1A]"
                          />
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleMoveDraftStep(idx, -1)}
                              disabled={idx === 0}
                              className="p-1.5 rounded text-[#5C5850] hover:bg-[#EAE4D7] disabled:opacity-30"
                              title="위로 이동"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveDraftStep(idx, 1)}
                              disabled={idx === draftRoutine.steps.length - 1}
                              className="p-1.5 rounded text-[#5C5850] hover:bg-[#EAE4D7] disabled:opacity-30"
                              title="아래로 이동"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveDraftStep(step.id)}
                              className="p-1.5 rounded text-[#B84A32] hover:bg-[#FDF0ED]"
                              title="단계 삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pl-6">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="1"
                              max="180"
                              value={Math.round(step.durationSec / 60)}
                              onChange={(e) =>
                                handleUpdateDraftStep(
                                  step.id,
                                  'durationSec',
                                  Math.max(1, Number(e.target.value)) * 60
                                )
                              }
                              className="w-16 px-2 py-1 rounded-lg bg-white border border-[#D6CFC2] text-xs font-semibold text-center text-[#1E1D1A]"
                            />
                            <span className="text-xs text-[#78736A]">분</span>
                          </div>

                          <select
                            value={step.category}
                            onChange={(e) =>
                              handleUpdateDraftStep(step.id, 'category', e.target.value)
                            }
                            className="ml-auto px-2.5 py-1 rounded-lg bg-white border border-[#D6CFC2] text-xs font-medium text-[#1E1D1A]"
                          >
                            <option value="normal">일반 루틴</option>
                            <option value="english">영어학습 연동</option>
                            <option value="reading">독서기록 연동</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleAddDraftStep}
                    className="w-full py-2.5 rounded-xl border border-dashed border-[#C7BFA8] text-xs font-semibold text-[#5C5850] hover:bg-[#FAF8F5] flex items-center justify-center gap-1.5 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    루틴 단계 추가하기
                  </button>
                </div>
              )}
            </section>
          </div>
        ) : activeTab === 'bookshelf' ? (
          /* 서재 & 독서노트 탭 */
          <div className="space-y-6">
            {/* 서재 요약 인덱스 카드 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white border border-[#E6E0D4] p-4 rounded-xl">
                <span className="text-xs text-[#78736A] block">읽는 중</span>
                <span
                  className="text-2xl font-bold text-[#1E1D1A] mt-1 block"
                  style={{ fontFamily: "'Noto Serif KR', serif" }}
                >
                  {readingBooks.length}권
                </span>
              </div>
              <div className="bg-white border border-[#E6E0D4] p-4 rounded-xl">
                <span className="text-xs text-[#78736A] block">완독 도서</span>
                <span
                  className="text-2xl font-bold text-[#2C5E4F] mt-1 block"
                  style={{ fontFamily: "'Noto Serif KR', serif" }}
                >
                  {completedBooks.length}권
                </span>
              </div>
              <div className="bg-white border border-[#E6E0D4] p-4 rounded-xl">
                <span className="text-xs text-[#78736A] block">독서 노트</span>
                <span
                  className="text-2xl font-bold text-[#C85A32] mt-1 block"
                  style={{ fontFamily: "'Noto Serif KR', serif" }}
                >
                  {readingLogs.length}편
                </span>
              </div>
            </div>

            {/* 내 서재 책장 */}
            <section className="bg-white border border-[#E6E0D4] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4 gap-2">
                <h3
                  className="font-bold text-base text-[#1E1D1A]"
                  style={{ fontFamily: "'Noto Serif KR', serif" }}
                >
                  나의 서재
                </h3>

                <div className="flex items-center gap-1.5">
                  {books.length > 0 && (
                    <button
                      onClick={() => {
                        setIsSelectingBooks((prev) => !prev);
                        setSelectedBookIdsForDelete([]);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                        isSelectingBooks
                          ? 'bg-[#FDF0ED] border-[#F0C8BE] text-[#B84A32]'
                          : 'bg-[#FAF8F5] border-[#E2DCD0] text-[#5C5850] hover:bg-[#EFECE6]'
                      }`}
                    >
                      {isSelectingBooks ? '선택 취소' : '선택'}
                    </button>
                  )}

                  {!isSelectingBooks && (
                    <button
                      onClick={() => setShowAddBookModal(true)}
                      className="px-3 py-1.5 rounded-lg bg-[#1E1D1A] hover:bg-[#33312C] text-white text-xs font-medium flex items-center gap-1 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      도서 추가
                    </button>
                  )}
                </div>
              </div>

              {isSelectingBooks && books.length > 0 && (
                <div className="mb-3 p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E2DCD0] flex items-center justify-between">
                  <button
                    onClick={() => {
                      if (selectedBookIdsForDelete.length === books.length) {
                        setSelectedBookIdsForDelete([]);
                      } else {
                        setSelectedBookIdsForDelete(books.map((b) => b.id));
                      }
                    }}
                    className="text-xs font-semibold text-[#4A4741] flex items-center gap-1.5"
                  >
                    {selectedBookIdsForDelete.length === books.length ? (
                      <CheckSquare className="w-4 h-4 text-[#1E1D1A]" />
                    ) : (
                      <Square className="w-4 h-4 text-[#8A847A]" />
                    )}
                    전체 선택 ({selectedBookIdsForDelete.length}/{books.length})
                  </button>

                  <button
                    onClick={handleBatchDeleteBooks}
                    disabled={selectedBookIdsForDelete.length === 0}
                    className="px-3 py-1.5 rounded-lg bg-[#B84A32] hover:bg-[#9E3D28] disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    선택 삭제 ({selectedBookIdsForDelete.length})
                  </button>
                </div>
              )}

              {books.length === 0 ? (
                <p className="text-xs text-[#8A847A] text-center py-8">
                  등록된 도서가 없습니다. 우측 상단의 '도서 추가' 버튼을 눌러 책을 등록해보세요.
                </p>
              ) : (
                <div className="space-y-3">
                  {books.map((book) => {
                    const pct = Math.round((book.currentPage / book.totalPages) * 100);
                    const isChecked = selectedBookIdsForDelete.includes(book.id);

                    return (
                      <div
                        key={book.id}
                        onClick={() => isSelectingBooks && toggleBookSelect(book.id)}
                        className={`p-4 rounded-xl border flex items-center gap-3.5 transition ${
                          isSelectingBooks ? 'cursor-pointer' : ''
                        } ${
                          isChecked
                            ? 'bg-[#FDF0ED]/60 border-[#E5AFA2]'
                            : 'bg-[#FAF8F5] border-[#EAE4D7]'
                        }`}
                      >
                        {isSelectingBooks && (
                          <div className="shrink-0 text-[#B84A32]">
                            {isChecked ? (
                              <CheckSquare className="w-5 h-5" />
                            ) : (
                              <Square className="w-5 h-5 text-[#A39D92]" />
                            )}
                          </div>
                        )}

                        <div
                          style={{ backgroundColor: book.coverColor }}
                          className="w-11 h-16 rounded-r-md rounded-l-sm flex flex-col justify-between p-1.5 shrink-0 shadow-[2px_3px_6px_rgba(0,0,0,0.12)] relative overflow-hidden"
                        >
                          <div className="w-full h-[1px] bg-white/30" />
                          <Bookmark className="w-3.5 h-3.5 text-white/80 self-end" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4
                              className="font-bold text-sm text-[#1E1D1A] truncate"
                              style={{ fontFamily: "'Noto Serif KR', serif" }}
                            >
                              {book.title}
                            </h4>

                            <div className="flex items-center gap-2 shrink-0">
                              {book.status === 'done' ? (
                                <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-[#EEF5F1] text-[#2C5E4F]">
                                  완독
                                </span>
                              ) : (
                                <span
                                  className="text-xs font-bold text-[#2C5E4F]"
                                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                                >
                                  {pct}%
                                </span>
                              )}

                              {!isSelectingBooks && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSingleBook(book);
                                  }}
                                  className="p-1 rounded-md text-[#A39D92] hover:text-[#B84A32] hover:bg-[#FDF0ED] transition"
                                  title="도서 및 연관 메모 삭제"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-[#78736A] mt-0.5">{book.author}</p>

                          <div className="w-full h-1.5 bg-[#E6E0D4] rounded-full mt-2.5 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500 bg-[#2C5E4F]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[11px] text-[#8A847A] mt-1.5">
                            <span>
                              {book.currentPage} / {book.totalPages}p
                            </span>
                            <span>남은 분량 {book.totalPages - book.currentPage}p</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* 만년필 독서 노트 */}
            <section className="bg-white border border-[#E6E0D4] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3
                  className="font-bold text-base flex items-center gap-2 text-[#1E1D1A]"
                  style={{ fontFamily: "'Noto Serif KR', serif" }}
                >
                  <Feather className="w-4 h-4 text-[#C85A32]" />
                  독서 문장 & 메모
                </h3>

                {readingLogs.length > 0 && (
                  <button
                    onClick={() => {
                      setIsSelectingLogs((prev) => !prev);
                      setSelectedLogIdsForDelete([]);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                      isSelectingLogs
                        ? 'bg-[#FDF0ED] border-[#F0C8BE] text-[#B84A32]'
                        : 'bg-[#FAF8F5] border-[#E2DCD0] text-[#5C5850] hover:bg-[#EFECE6]'
                    }`}
                  >
                    {isSelectingLogs ? '선택 취소' : '선택'}
                  </button>
                )}
              </div>

              {isSelectingLogs && readingLogs.length > 0 && (
                <div className="mb-3 p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E2DCD0] flex items-center justify-between">
                  <button
                    onClick={() => {
                      if (selectedLogIdsForDelete.length === readingLogs.length) {
                        setSelectedLogIdsForDelete([]);
                      } else {
                        setSelectedLogIdsForDelete(readingLogs.map((l) => l.id));
                      }
                    }}
                    className="text-xs font-semibold text-[#4A4741] flex items-center gap-1.5"
                  >
                    {selectedLogIdsForDelete.length === readingLogs.length ? (
                      <CheckSquare className="w-4 h-4 text-[#1E1D1A]" />
                    ) : (
                      <Square className="w-4 h-4 text-[#8A847A]" />
                    )}
                    전체 선택 ({selectedLogIdsForDelete.length}/{readingLogs.length})
                  </button>

                  <button
                    onClick={handleBatchDeleteLogs}
                    disabled={selectedLogIdsForDelete.length === 0}
                    className="px-3 py-1.5 rounded-lg bg-[#B84A32] hover:bg-[#9E3D28] disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    선택 삭제 ({selectedLogIdsForDelete.length})
                  </button>
                </div>
              )}

              {readingLogs.length === 0 ? (
                <p className="text-xs text-[#8A847A] text-center py-8">
                  아직 남겨진 독서 문장이나 메모가 없습니다.
                </p>
              ) : (
                <div className="space-y-3">
                  {readingLogs.map((log) => {
                    const isChecked = selectedLogIdsForDelete.includes(log.id);

                    return (
                      <article
                        key={log.id}
                        onClick={() => isSelectingLogs && toggleLogSelect(log.id)}
                        className={`p-4 rounded-xl border-l-4 border-l-[#2C5E4F] border flex items-start gap-3 transition ${
                          isSelectingLogs ? 'cursor-pointer' : ''
                        } ${
                          isChecked
                            ? 'bg-[#FDF0ED]/60 border-[#E5AFA2]'
                            : 'bg-[#FAF8F5] border-[#EAE4D7]'
                        }`}
                      >
                        {isSelectingLogs && (
                          <div className="pt-0.5 shrink-0 text-[#B84A32]">
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4" />
                            ) : (
                              <Square className="w-4 h-4 text-[#A39D92]" />
                            )}
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-sm text-[#1E1D1A] truncate">
                              {log.bookTitle}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className="text-xs text-[#8A847A]"
                                style={{ fontFamily: "'JetBrains Mono', monospace" }}
                              >
                                {log.date}
                              </span>
                              {!isSelectingLogs && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSingleLog(log.id);
                                  }}
                                  className="p-1 rounded-md text-[#A39D92] hover:text-[#B84A32] hover:bg-[#FDF0ED] transition"
                                  title="메모 삭제"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          <p
                            className="text-sm text-[#4A4741] mt-2 leading-relaxed"
                            style={{ fontFamily: "'Noto Serif KR', serif" }}
                          >
                            “{log.memo}”
                          </p>
                          <div className="flex items-center gap-3 mt-2.5 text-[11px] text-[#2C5E4F] font-semibold">
                            <span>{log.durationMin}분 독서</span>
                            <span>•</span>
                            <span>+{log.pagesRead}페이지 진도</span>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        ) : (
          /* 영어학습 탭 */
          <div className="space-y-6">
            {/* 영어학습 요약 인덱스 카드 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white border border-[#E6E0D4] p-4 rounded-xl">
                <span className="text-xs text-[#78736A] block">연습 중</span>
                <span
                  className="text-2xl font-bold text-[#1E1D1A] mt-1 block"
                  style={{ fontFamily: "'Noto Serif KR', serif" }}
                >
                  {studyingEnglishBooks.length}권
                </span>
              </div>
              <div className="bg-white border border-[#E6E0D4] p-4 rounded-xl">
                <span className="text-xs text-[#78736A] block">완주 교재</span>
                <span
                  className="text-2xl font-bold text-[#2B4C7E] mt-1 block"
                  style={{ fontFamily: "'Noto Serif KR', serif" }}
                >
                  {completedEnglishBooks.length}권
                </span>
              </div>
              <div className="bg-white border border-[#E6E0D4] p-4 rounded-xl">
                <span className="text-xs text-[#78736A] block">연습 문장</span>
                <span
                  className="text-2xl font-bold text-[#C85A32] mt-1 block"
                  style={{ fontFamily: "'Noto Serif KR', serif" }}
                >
                  {englishLogs.length}편
                </span>
              </div>
            </div>

            {/* 나의 영어 교재 책장 */}
            <section className="bg-white border border-[#E6E0D4] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4 gap-2">
                <h3
                  className="font-bold text-base text-[#1E1D1A]"
                  style={{ fontFamily: "'Noto Serif KR', serif" }}
                >
                  나의 영어 교재
                </h3>

                <div className="flex items-center gap-1.5">
                  {englishBooks.length > 0 && (
                    <button
                      onClick={() => {
                        setIsSelectingEnglishBooks((prev) => !prev);
                        setSelectedEnglishBookIdsForDelete([]);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                        isSelectingEnglishBooks
                          ? 'bg-[#FDF0ED] border-[#F0C8BE] text-[#B84A32]'
                          : 'bg-[#FAF8F5] border-[#E2DCD0] text-[#5C5850] hover:bg-[#EFECE6]'
                      }`}
                    >
                      {isSelectingEnglishBooks ? '선택 취소' : '선택'}
                    </button>
                  )}

                  {!isSelectingEnglishBooks && (
                    <button
                      onClick={() => setShowAddEnglishBookModal(true)}
                      className="px-3 py-1.5 rounded-lg bg-[#2B4C7E] hover:bg-[#223E68] text-white text-xs font-medium flex items-center gap-1 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      교재 추가
                    </button>
                  )}
                </div>
              </div>

              {isSelectingEnglishBooks && englishBooks.length > 0 && (
                <div className="mb-3 p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E2DCD0] flex items-center justify-between">
                  <button
                    onClick={() => {
                      if (selectedEnglishBookIdsForDelete.length === englishBooks.length) {
                        setSelectedEnglishBookIdsForDelete([]);
                      } else {
                        setSelectedEnglishBookIdsForDelete(englishBooks.map((b) => b.id));
                      }
                    }}
                    className="text-xs font-semibold text-[#4A4741] flex items-center gap-1.5"
                  >
                    {selectedEnglishBookIdsForDelete.length === englishBooks.length ? (
                      <CheckSquare className="w-4 h-4 text-[#1E1D1A]" />
                    ) : (
                      <Square className="w-4 h-4 text-[#8A847A]" />
                    )}
                    전체 선택 ({selectedEnglishBookIdsForDelete.length}/{englishBooks.length})
                  </button>

                  <button
                    onClick={handleBatchDeleteEnglishBooks}
                    disabled={selectedEnglishBookIdsForDelete.length === 0}
                    className="px-3 py-1.5 rounded-lg bg-[#B84A32] hover:bg-[#9E3D28] disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    선택 삭제 ({selectedEnglishBookIdsForDelete.length})
                  </button>
                </div>
              )}

              {englishBooks.length === 0 ? (
                <p className="text-xs text-[#8A847A] text-center py-8">
                  등록된 영어 교재가 없습니다. 우측 상단의 '교재 추가' 버튼을 눌러 연습 중인 책을 등록해보세요.
                </p>
              ) : (
                <div className="space-y-3">
                  {englishBooks.map((book) => {
                    const pct =
                      book.totalUnits > 0
                        ? Math.min(100, Math.round((book.currentUnit / book.totalUnits) * 100))
                        : 0;
                    const isChecked = selectedEnglishBookIdsForDelete.includes(book.id);
                    const unitLabel = book.unitLabel || '문장';

                    return (
                      <div
                        key={book.id}
                        onClick={() => isSelectingEnglishBooks && toggleEnglishBookSelect(book.id)}
                        className={`p-4 rounded-xl border flex items-center gap-3.5 transition ${
                          isSelectingEnglishBooks ? 'cursor-pointer' : ''
                        } ${
                          isChecked
                            ? 'bg-[#FDF0ED]/60 border-[#E5AFA2]'
                            : 'bg-[#FAF8F5] border-[#EAE4D7]'
                        }`}
                      >
                        {isSelectingEnglishBooks && (
                          <div className="shrink-0 text-[#B84A32]">
                            {isChecked ? (
                              <CheckSquare className="w-5 h-5" />
                            ) : (
                              <Square className="w-5 h-5 text-[#A39D92]" />
                            )}
                          </div>
                        )}

                        <div
                          style={{ backgroundColor: book.coverColor }}
                          className="w-11 h-16 rounded-r-md rounded-l-sm flex flex-col justify-between p-1.5 shrink-0 shadow-[2px_3px_6px_rgba(0,0,0,0.12)] relative overflow-hidden"
                        >
                          <div className="w-full h-[1px] bg-white/30" />
                          <Bookmark className="w-3.5 h-3.5 text-white/80 self-end" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4
                              className="font-bold text-sm text-[#1E1D1A] truncate"
                              style={{ fontFamily: "'Noto Serif KR', serif" }}
                            >
                              {book.title}
                            </h4>

                            <div className="flex items-center gap-2 shrink-0">
                              {book.status === 'done' ? (
                                <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-[#EDF2F8] text-[#2B4C7E]">
                                  완주
                                </span>
                              ) : (
                                <span
                                  className="text-xs font-bold text-[#2B4C7E]"
                                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                                >
                                  {pct}%
                                </span>
                              )}

                              {!isSelectingEnglishBooks && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSingleEnglishBook(book);
                                  }}
                                  className="p-1 rounded-md text-[#A39D92] hover:text-[#B84A32] hover:bg-[#FDF0ED] transition"
                                  title="교재 및 연관 문장 삭제"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-[#78736A] mt-0.5">{book.author}</p>

                          <div className="w-full h-1.5 bg-[#E6E0D4] rounded-full mt-2.5 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500 bg-[#2B4C7E]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[11px] text-[#8A847A] mt-1.5">
                            <span>
                              {book.currentUnit} / {formatUnit(book.totalUnits, unitLabel)}
                            </span>
                            <span>
                              남은 분량 {formatUnit(Math.max(0, book.totalUnits - book.currentUnit), unitLabel)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* 매일 영어 문장 노트 */}
            <section className="bg-white border border-[#E6E0D4] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4 gap-2">
                <h3
                  className="font-bold text-base flex items-center gap-2 text-[#1E1D1A]"
                  style={{ fontFamily: "'Noto Serif KR', serif" }}
                >
                  <Feather className="w-4 h-4 text-[#2B4C7E]" />
                  매일 영어 문장
                </h3>

                <div className="flex items-center gap-1.5">
                  {englishLogs.length > 0 && (
                    <button
                      onClick={() => {
                        setIsSelectingEnglishLogs((prev) => !prev);
                        setSelectedEnglishLogIdsForDelete([]);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                        isSelectingEnglishLogs
                          ? 'bg-[#FDF0ED] border-[#F0C8BE] text-[#B84A32]'
                          : 'bg-[#FAF8F5] border-[#E2DCD0] text-[#5C5850] hover:bg-[#EFECE6]'
                      }`}
                    >
                      {isSelectingEnglishLogs ? '선택 취소' : '선택'}
                    </button>
                  )}

                  {!isSelectingEnglishLogs && (
                    <button
                      onClick={handleOpenDirectEnglishLog}
                      className="px-3 py-1.5 rounded-lg bg-[#FAF8F5] hover:bg-[#EFECE6] border border-[#E2DCD0] text-xs font-medium text-[#2B4C7E] flex items-center gap-1 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      문장 기록
                    </button>
                  )}
                </div>
              </div>

              {isSelectingEnglishLogs && englishLogs.length > 0 && (
                <div className="mb-3 p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E2DCD0] flex items-center justify-between">
                  <button
                    onClick={() => {
                      if (selectedEnglishLogIdsForDelete.length === englishLogs.length) {
                        setSelectedEnglishLogIdsForDelete([]);
                      } else {
                        setSelectedEnglishLogIdsForDelete(englishLogs.map((l) => l.id));
                      }
                    }}
                    className="text-xs font-semibold text-[#4A4741] flex items-center gap-1.5"
                  >
                    {selectedEnglishLogIdsForDelete.length === englishLogs.length ? (
                      <CheckSquare className="w-4 h-4 text-[#1E1D1A]" />
                    ) : (
                      <Square className="w-4 h-4 text-[#8A847A]" />
                    )}
                    전체 선택 ({selectedEnglishLogIdsForDelete.length}/{englishLogs.length})
                  </button>

                  <button
                    onClick={handleBatchDeleteEnglishLogs}
                    disabled={selectedEnglishLogIdsForDelete.length === 0}
                    className="px-3 py-1.5 rounded-lg bg-[#B84A32] hover:bg-[#9E3D28] disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    선택 삭제 ({selectedEnglishLogIdsForDelete.length})
                  </button>
                </div>
              )}

              {englishLogs.length === 0 ? (
                <p className="text-xs text-[#8A847A] text-center py-8">
                  아직 기록된 영어 문장이 없습니다. 루틴의 '영어 문장 연습'을 완료하거나 '문장 기록' 버튼으로 남겨보세요.
                </p>
              ) : (
                <div className="space-y-3">
                  {englishLogs.map((log) => {
                    const isChecked = selectedEnglishLogIdsForDelete.includes(log.id);

                    return (
                      <article
                        key={log.id}
                        onClick={() => isSelectingEnglishLogs && toggleEnglishLogSelect(log.id)}
                        className={`p-4 rounded-xl border-l-4 border-l-[#2B4C7E] border flex items-start gap-3 transition ${
                          isSelectingEnglishLogs ? 'cursor-pointer' : ''
                        } ${
                          isChecked
                            ? 'bg-[#FDF0ED]/60 border-[#E5AFA2]'
                            : 'bg-[#FAF8F5] border-[#EAE4D7]'
                        }`}
                      >
                        {isSelectingEnglishLogs && (
                          <div className="pt-0.5 shrink-0 text-[#B84A32]">
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4" />
                            ) : (
                              <Square className="w-4 h-4 text-[#A39D92]" />
                            )}
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-sm text-[#1E1D1A] truncate">
                              {log.bookTitle}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className="text-xs text-[#8A847A]"
                                style={{ fontFamily: "'JetBrains Mono', monospace" }}
                              >
                                {log.date}
                              </span>
                              {!isSelectingEnglishLogs && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSingleEnglishLog(log.id);
                                  }}
                                  className="p-1 rounded-md text-[#A39D92] hover:text-[#B84A32] hover:bg-[#FDF0ED] transition"
                                  title="문장 기록 삭제"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          <p
                            className="text-sm font-medium text-[#1E1D1A] mt-2 leading-relaxed whitespace-pre-line"
                            style={{ fontFamily: "'Noto Serif KR', serif" }}
                          >
                            “{log.sentence}”
                          </p>
                          {log.meaning && (
                            <p className="text-xs text-[#6B665E] mt-1.5 leading-relaxed whitespace-pre-line">
                              {log.meaning}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-2.5 text-[11px] text-[#2B4C7E] font-semibold">
                            {log.durationMin > 0 && <span>{log.durationMin}분 연습</span>}
                            {log.durationMin > 0 && log.unitsPracticed > 0 && <span>•</span>}
                            {log.unitsPracticed > 0 && (
                              <span>+{formatUnit(log.unitsPracticed, log.unitLabel || '문장')} 진도</span>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* [모달 1] 읽을 책 선택 */}
      {showBookSelectModal && (
        <div className="fixed inset-0 bg-[#1E1D1A]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#FAF8F5] border border-[#DCD5C7] rounded-2xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3
                className="font-bold text-lg text-[#1E1D1A]"
                style={{ fontFamily: "'Noto Serif KR', serif" }}
              >
                지금 펼칠 책을 선택하세요
              </h3>
              <button
                onClick={() => setShowBookSelectModal(false)}
                className="p-1.5 rounded-lg text-[#78736A] hover:text-[#1E1D1A]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {readingBooks.map((book) => (
                <button
                  key={book.id}
                  onClick={() => setSelectedBookId(book.id)}
                  className={`w-full p-3.5 rounded-xl border text-left flex items-center justify-between transition ${
                    selectedBookId === book.id
                      ? 'bg-[#EEF5F1] border-[#2C5E4F] text-[#1E1D1A]'
                      : 'bg-white border-[#E6E0D4] text-[#4A4741] hover:border-[#C7BFA8]'
                  }`}
                >
                  <div>
                    <p className="font-bold text-sm">{book.title}</p>
                    <p className="text-xs text-[#78736A] mt-0.5">
                      현재 {book.currentPage}p / {book.totalPages}p
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#8A847A]" />
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                setShowBookSelectModal(false);
                setIsRunning(true);
              }}
              className="w-full mt-5 py-3.5 rounded-xl bg-[#2C5E4F] hover:bg-[#234C40] font-semibold text-sm text-white transition"
            >
              이 책으로 독서 시작
            </button>
          </div>
        </div>
      )}

      {/* [모달 2] 독서 완료 후 기록 */}
      {showReadingLogModal && selectedBook && (
        <div className="fixed inset-0 bg-[#1E1D1A]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSaveReadingLog}
            className="bg-[#FAF8F5] border border-[#DCD5C7] rounded-2xl w-full max-w-md p-6 shadow-xl space-y-5"
          >
            <div>
              <span className="text-xs font-semibold text-[#2C5E4F]">READING LOG</span>
              <h3
                className="font-bold text-xl text-[#1E1D1A] mt-0.5"
                style={{ fontFamily: "'Noto Serif KR', serif" }}
              >
                오늘의 독서를 기록합니다
              </h3>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#E6E0D4]">
              <p className="font-bold text-sm text-[#1E1D1A]">{selectedBook.title}</p>
              <p className="text-xs text-[#78736A] mt-1">
                이전 책갈피: {selectedBook.currentPage}p (전체 {selectedBook.totalPages}p)
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A4741] mb-1.5">
                마지막으로 읽은 페이지 번호
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={selectedBook.currentPage}
                  max={selectedBook.totalPages}
                  value={endPageInput}
                  onChange={(e) => setEndPageInput(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#D6CFC2] text-[#1E1D1A] font-bold text-lg focus:outline-none focus:border-[#2C5E4F]"
                  required
                />
                <span className="text-sm text-[#78736A] shrink-0">/ {selectedBook.totalPages}p</span>
              </div>
              {Number(endPageInput) > selectedBook.currentPage && (
                <p className="text-xs text-[#2C5E4F] mt-1.5 font-semibold">
                  오늘 총 {Number(endPageInput) - selectedBook.currentPage}페이지를 읽었습니다.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A4741] mb-1.5">
                기억하고 싶은 문장이나 단상
              </label>
              <input
                type="text"
                placeholder="책에서 발견한 한 줄을 남겨보세요"
                value={memoInput}
                onChange={(e) => setMemoInput(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#D6CFC2] text-sm text-[#1E1D1A] focus:outline-none focus:border-[#2C5E4F]"
              />
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowReadingLogModal(false);
                  markStepDoneAndAdvance(pendingCompleteStepId);
                }}
                className="flex-1 py-3 rounded-xl bg-[#EFECE6] hover:bg-[#E4DFD5] text-sm font-semibold text-[#5C5850] transition"
              >
                건너뛰기
              </button>
              <button
                type="submit"
                className="flex-2 px-6 py-3 rounded-xl bg-[#2C5E4F] hover:bg-[#234C40] text-sm font-semibold text-white transition"
              >
                책갈피 저장
              </button>
            </div>
          </form>
        </div>
      )}

      {/* [모달 3] 새 책 등록 */}
      {showAddBookModal && (
        <div className="fixed inset-0 bg-[#1E1D1A]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleAddBook}
            className="bg-[#FAF8F5] border border-[#DCD5C7] rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3
                className="font-bold text-lg text-[#1E1D1A]"
                style={{ fontFamily: "'Noto Serif KR', serif" }}
              >
                서재에 새 책 꽂기
              </h3>
              <button
                type="button"
                onClick={() => setShowAddBookModal(false)}
                className="p-1.5 rounded-lg text-[#78736A] hover:text-[#1E1D1A]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A4741] mb-1">책 제목 *</label>
              <input
                type="text"
                placeholder="예: 사피엔스"
                value={newBookTitle}
                onChange={(e) => setNewBookTitle(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#D6CFC2] text-sm text-[#1E1D1A] focus:outline-none focus:border-[#1E1D1A]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A4741] mb-1">저자</label>
              <input
                type="text"
                placeholder="예: 유발 하라리"
                value={newBookAuthor}
                onChange={(e) => setNewBookAuthor(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#D6CFC2] text-sm text-[#1E1D1A] focus:outline-none focus:border-[#1E1D1A]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A4741] mb-1">전체 페이지 수 *</label>
              <input
                type="number"
                min="1"
                placeholder="예: 636"
                value={newBookTotalPages}
                onChange={(e) => setNewBookTotalPages(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#D6CFC2] text-sm text-[#1E1D1A] focus:outline-none focus:border-[#1E1D1A]"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full mt-2 py-3 rounded-xl bg-[#1E1D1A] hover:bg-[#33312C] font-semibold text-sm text-white transition"
            >
              서재에 등록하기
            </button>
          </form>
        </div>
      )}

      {/* [모달 4] 연속 달성 일수 수동 수정 */}
      {showStreakModal && (
        <div className="fixed inset-0 bg-[#1E1D1A]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSaveStreakEdit}
            className="bg-[#FAF8F5] border border-[#DCD5C7] rounded-2xl w-full max-w-sm p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3
                className="font-bold text-lg text-[#1E1D1A] flex items-center gap-1.5"
                style={{ fontFamily: "'Noto Serif KR', serif" }}
              >
                <Flame className="w-5 h-5 text-[#C85A32] fill-[#C85A32]" />
                연속 실천 일수 수정
              </h3>
              <button
                type="button"
                onClick={() => setShowStreakModal(false)}
                className="p-1.5 rounded-lg text-[#78736A] hover:text-[#1E1D1A]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#78736A] leading-relaxed">
              루틴 전체 단계를 완료하면 하루에 1일씩 자동으로 올라갑니다. 실제 실천 일수와 다를 경우 아래에서 직접 수정할 수 있습니다.
            </p>

            <div>
              <label className="block text-xs font-semibold text-[#4A4741] mb-1">
                현재 연속 달성 일수 (일)
              </label>
              <input
                type="number"
                min="0"
                value={streakInput}
                onChange={(e) => setStreakInput(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#D6CFC2] text-base font-bold text-[#1E1D1A] focus:outline-none focus:border-[#C85A32]"
                required
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowStreakModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-[#EFECE6] hover:bg-[#E4DFD5] text-xs font-semibold text-[#5C5850] transition"
              >
                취소
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-[#C85A32] hover:bg-[#B24E29] text-xs font-semibold text-white transition"
              >
                일수 반영
              </button>
            </div>
          </form>
        </div>
      )}

      {/* [모달 5] 연습할 영어 교재 선택 */}
      {showEnglishBookSelectModal && (
        <div className="fixed inset-0 bg-[#1E1D1A]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#FAF8F5] border border-[#DCD5C7] rounded-2xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3
                className="font-bold text-lg text-[#1E1D1A]"
                style={{ fontFamily: "'Noto Serif KR', serif" }}
              >
                지금 연습할 영어 교재를 선택하세요
              </h3>
              <button
                onClick={() => setShowEnglishBookSelectModal(false)}
                className="p-1.5 rounded-lg text-[#78736A] hover:text-[#1E1D1A]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {studyingEnglishBooks.map((book) => (
                <button
                  key={book.id}
                  onClick={() => setSelectedEnglishBookId(book.id)}
                  className={`w-full p-3.5 rounded-xl border text-left flex items-center justify-between transition ${
                    selectedEnglishBookId === book.id
                      ? 'bg-[#EDF2F8] border-[#2B4C7E] text-[#1E1D1A]'
                      : 'bg-white border-[#E6E0D4] text-[#4A4741] hover:border-[#C7BFA8]'
                  }`}
                >
                  <div>
                    <p className="font-bold text-sm">{book.title}</p>
                    <p className="text-xs text-[#78736A] mt-0.5">
                      현재 {formatUnit(book.currentUnit, book.unitLabel)} /{' '}
                      {formatUnit(book.totalUnits, book.unitLabel)}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#8A847A]" />
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                setShowEnglishBookSelectModal(false);
                setIsRunning(true);
              }}
              className="w-full mt-5 py-3.5 rounded-xl bg-[#2B4C7E] hover:bg-[#223E68] font-semibold text-sm text-white transition"
            >
              이 교재로 연습 시작
            </button>
          </div>
        </div>
      )}

      {/* [모달 6] 영어 문장 연습 완료 후 기록 */}
      {showEnglishLogModal && (
        <div className="fixed inset-0 bg-[#1E1D1A]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSaveEnglishLog}
            className="bg-[#FAF8F5] border border-[#DCD5C7] rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-semibold text-[#2B4C7E]">ENGLISH PRACTICE LOG</span>
                <h3
                  className="font-bold text-xl text-[#1E1D1A] mt-0.5"
                  style={{ fontFamily: "'Noto Serif KR', serif" }}
                >
                  오늘의 영어 문장을 기록합니다
                </h3>
              </div>
              {isDirectEnglishLog && (
                <button
                  type="button"
                  onClick={() => setShowEnglishLogModal(false)}
                  className="p-1.5 rounded-lg text-[#78736A] hover:text-[#1E1D1A]"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {englishBooks.length > 0 && (
              <div className="p-3.5 rounded-xl bg-white border border-[#E6E0D4] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-[#78736A]">연습 교재</span>
                  {englishBooks.length > 1 && (
                    <select
                      value={selectedEnglishBook?.id || ''}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setSelectedEnglishBookId(nextId);
                        const nextBook = englishBooks.find((b) => b.id === nextId);
                        if (nextBook) setEnglishEndUnitInput(String(nextBook.currentUnit));
                      }}
                      className="text-xs font-semibold text-[#2B4C7E] bg-[#EDF2F8] px-2 py-1 rounded-md border border-[#C6D4E8]"
                    >
                      {englishBooks.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.title}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {selectedEnglishBook && (
                  <>
                    <p className="font-bold text-sm text-[#1E1D1A]">{selectedEnglishBook.title}</p>
                    <p className="text-xs text-[#78736A]">
                      이전 진도: {formatUnit(selectedEnglishBook.currentUnit, selectedEnglishBook.unitLabel)}{' '}
                      (전체 {formatUnit(selectedEnglishBook.totalUnits, selectedEnglishBook.unitLabel)})
                    </p>
                  </>
                )}
              </div>
            )}

            {selectedEnglishBook && (
              <div>
                <label className="block text-xs font-semibold text-[#4A4741] mb-1.5">
                  오늘까지 연습한 진도 ({selectedEnglishBook.unitLabel || '문장'})
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={selectedEnglishBook.currentUnit}
                    max={selectedEnglishBook.totalUnits}
                    value={englishEndUnitInput}
                    onChange={(e) => setEnglishEndUnitInput(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#D6CFC2] text-[#1E1D1A] font-bold text-lg focus:outline-none focus:border-[#2B4C7E]"
                    required
                  />
                  <span className="text-sm text-[#78736A] shrink-0">
                    / {formatUnit(selectedEnglishBook.totalUnits, selectedEnglishBook.unitLabel)}
                  </span>
                </div>
                {Number(englishEndUnitInput) > selectedEnglishBook.currentUnit && (
                  <p className="text-xs text-[#2B4C7E] mt-1.5 font-semibold">
                    오늘 총{' '}
                    {formatUnit(
                      Number(englishEndUnitInput) - selectedEnglishBook.currentUnit,
                      selectedEnglishBook.unitLabel
                    )}{' '}
                    연습했습니다.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#4A4741] mb-1.5">
                오늘 연습한 영어 문장 *
              </label>
              <textarea
                rows={3}
                placeholder="예: I am supposed to finish this report by tomorrow."
                value={englishSentenceInput}
                onChange={(e) => setEnglishSentenceInput(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#D6CFC2] text-sm text-[#1E1D1A] focus:outline-none focus:border-[#2B4C7E] resize-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A4741] mb-1.5">
                한국어 뜻 또는 메모 (선택)
              </label>
              <input
                type="text"
                placeholder="예: 내일까지 이 보고서를 끝내기로 되어 있어요."
                value={englishMeaningInput}
                onChange={(e) => setEnglishMeaningInput(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#D6CFC2] text-sm text-[#1E1D1A] focus:outline-none focus:border-[#2B4C7E]"
              />
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowEnglishLogModal(false);
                  if (!isDirectEnglishLog) {
                    markStepDoneAndAdvance(pendingCompleteStepId);
                  }
                }}
                className="flex-1 py-3 rounded-xl bg-[#EFECE6] hover:bg-[#E4DFD5] text-sm font-semibold text-[#5C5850] transition"
              >
                {isDirectEnglishLog ? '취소' : '건너뛰기'}
              </button>
              <button
                type="submit"
                className="flex-2 px-6 py-3 rounded-xl bg-[#2B4C7E] hover:bg-[#223E68] text-sm font-semibold text-white transition"
              >
                문장 저장
              </button>
            </div>
          </form>
        </div>
      )}

      {/* [모달 7] 새 영어 교재 등록 */}
      {showAddEnglishBookModal && (
        <div className="fixed inset-0 bg-[#1E1D1A]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleAddEnglishBook}
            className="bg-[#FAF8F5] border border-[#DCD5C7] rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3
                className="font-bold text-lg text-[#1E1D1A]"
                style={{ fontFamily: "'Noto Serif KR', serif" }}
              >
                새 영어 교재 등록하기
              </h3>
              <button
                type="button"
                onClick={() => setShowAddEnglishBookModal(false)}
                className="p-1.5 rounded-lg text-[#78736A] hover:text-[#1E1D1A]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A4741] mb-1">교재/책 제목 *</label>
              <input
                type="text"
                placeholder="예: 영어회화 핵심패턴 233"
                value={newEnglishBookTitle}
                onChange={(e) => setNewEnglishBookTitle(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#D6CFC2] text-sm text-[#1E1D1A] focus:outline-none focus:border-[#2B4C7E]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A4741] mb-1">저자 / 출판사</label>
              <input
                type="text"
                placeholder="예: 백선엽"
                value={newEnglishBookAuthor}
                onChange={(e) => setNewEnglishBookAuthor(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#D6CFC2] text-sm text-[#1E1D1A] focus:outline-none focus:border-[#2B4C7E]"
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-[#4A4741] mb-1">전체 분량 *</label>
                <input
                  type="number"
                  min="1"
                  placeholder="예: 233"
                  value={newEnglishBookTotalUnits}
                  onChange={(e) => setNewEnglishBookTotalUnits(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#D6CFC2] text-sm text-[#1E1D1A] focus:outline-none focus:border-[#2B4C7E]"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4A4741] mb-1">단위</label>
                <select
                  value={newEnglishBookUnitLabel}
                  onChange={(e) => setNewEnglishBookUnitLabel(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-[#D6CFC2] text-sm text-[#1E1D1A] focus:outline-none focus:border-[#2B4C7E]"
                >
                  <option value="문장">문장</option>
                  <option value="p">페이지(p)</option>
                  <option value="챕터">챕터</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full mt-2 py-3 rounded-xl bg-[#2B4C7E] hover:bg-[#223E68] font-semibold text-sm text-white transition"
            >
              영어학습에 등록하기
            </button>
          </form>
        </div>
      )}
    </div>
  );
}