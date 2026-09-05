/**
 * FitTrack Daily - 每日運動記錄核心邏輯 (含 Firebase 雲端多使用者支援)
 */

const { createApp, ref, reactive, computed, watch, onMounted, nextTick } = Vue;

const STORAGE_WORKOUTS_KEY = 'fittrack_workouts_v2';
const STORAGE_SETTINGS_KEY = 'fittrack_settings_v2';
const STORAGE_FB_CONFIG_KEY = 'fittrack_firebase_config_v2';

// 運動分類與常用動作庫
const CATEGORIES = [
  { id: 'strength', name: '重訓 / 阻力', icon: 'dumbbell', color: 'indigo', badgeClass: 'badge-strength', met: 5.0 },
  { id: 'cardio', name: '有氧運動', icon: 'zap', color: 'emerald', badgeClass: 'badge-cardio', met: 8.0 },
  { id: 'hiit', name: '核心 / HIIT', icon: 'flame', color: 'rose', badgeClass: 'badge-hiit', met: 7.0 },
  { id: 'stretch', name: '伸展 / 瑜珈', icon: 'heart', color: 'cyan', badgeClass: 'badge-stretch', met: 2.5 },
  { id: 'sports', name: '球類 / 戶外', icon: 'activity', color: 'amber', badgeClass: 'badge-sports', met: 6.5 },
];

const PRESET_EXERCISES = {
  strength: [
    { name: '伏地挺身 (Push-ups)', target: '胸部 / 核心' },
    { name: '深蹲 (Squat)', target: '下肢' },
    { name: '臥推 (Bench Press)', target: '胸部' },
    { name: '硬舉 (Deadlift)', target: '背部 / 臀腿' },
    { name: '仰臥起坐 (Sit-ups)', target: '核心 / 腹部' },
    { name: '啞鈴肩推 (Shoulder Press)', target: '肩部' },
    { name: '槓鈴划船 (Barbell Row)', target: '背部' },
    { name: '引體向上 (Pull-up)', target: '背部' },
    { name: '滑輪下拉 (Lat Pulldown)', target: '背部' },
    { name: '雙槓臂屈伸 (Dips)', target: '胸/三頭' },
    { name: '腿推機 (Leg Press)', target: '腿部' },
    { name: '啞鈴側平舉 (Lateral Raise)', target: '肩部' },
    { name: '二頭彎舉 (Bicep Curl)', target: '手臂' },
    { name: '三頭下壓 (Tricep Pushdown)', target: '手臂' },
    { name: '羅馬尼亞硬舉 (RDL)', target: '臀腿' },
    { name: '腿部彎舉 (Leg Curl)', target: '後腿' },
  ],
  cardio: [
    { name: '超慢跑 (Slow Jogging)', met: 6.0 },
    { name: '戶外慢跑 (Running)', met: 9.0 },
    { name: '跑步機 (Treadmill)', met: 8.5 },
    { name: '戶外騎行 (Cycling)', met: 7.5 },
    { name: '室內飛輪 (Spinning)', met: 8.0 },
    { name: '跳繩 (Jump Rope)', met: 10.0 },
    { name: '游泳 (Swimming)', met: 8.0 },
    { name: '划船機 (Rowing)', met: 7.0 },
    { name: '登山健行 (Hiking)', met: 6.0 },
    { name: '橢圓機 (Elliptical)', met: 5.5 },
    { name: '快走 (Brisk Walking)', met: 4.0 },
  ],
  hiit: [
    { name: '棒式支撐 (Plank)' },
    { name: '仰臥起坐 (Sit-ups)' },
    { name: '伏地挺身 (Push-ups)' },
    { name: '波比跳 (Burpees)' },
    { name: '開合跳 (Jumping Jacks)' },
    { name: '登山者 (Mountain Climbers)' },
    { name: '俄羅斯轉體 (Russian Twists)' },
    { name: '卷腹 (Crunches)' },
    { name: '徒手深蹲 (Air Squat)' },
    { name: '高抬腿 (High Knees)' },
    { name: '壺鈴擺盪 (Kettlebell Swings)' },
  ],
  stretch: [
    { name: '全身動態伸展' },
    { name: '滾筒筋膜放鬆 (Foam Rolling)' },
    { name: '哈達瑜珈 (Hatha Yoga)' },
    { name: '下肢腿部拉筋' },
    { name: '肩頸放鬆伸展' },
    { name: '脊椎活動度訓練' },
  ],
  sports: [
    { name: '籃球 (Basketball)' },
    { name: '羽球 (Badminton)' },
    { name: '網球 (Tennis)' },
    { name: '攀岩 / 抱石 (Climbing)' },
    { name: '足球 (Football)' },
    { name: '桌球 (Table Tennis)' },
    { name: '拳擊訓練 (Boxing)' },
  ],
};

function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

createApp({
  setup() {
    // 應用狀態
    const currentTab = ref('daily');
    const selectedDate = ref(getTodayString());
    const workouts = ref([]);
    
    // 使用者偏好設定
    const settings = reactive({
      userWeight: 65,
      weeklyWorkoutGoalDays: 4,
      weeklyDurationGoalMins: 150,
    });

    // Firebase 相關狀態
    const isFirebaseReady = ref(false);
    const currentUser = ref(null);
    const syncStatus = ref('offline'); // 'synced' | 'syncing' | 'offline' | 'error'
    const isAuthModalOpen = ref(false);
    const authMode = ref('login'); // 'login' | 'register'
    const authLoading = ref(false);
    const isConfigModalOpen = ref(false);
    const firebaseConfigRaw = ref('');

    const authForm = reactive({
      email: '',
      password: '',
      displayName: '',
    });

    // Firebase 實例
    let fbAuth = null;
    let fbDb = null;

    // 表單彈窗狀態
    const isModalOpen = ref(false);
    const isEditing = ref(false);
    const editingId = ref(null);
    const toastMessage = ref('');
    const showToast = ref(false);

    // 複製課表彈窗狀態
    const isCopyModalOpen = ref(false);
    const copySourceDate = ref('');
    const copyTargetDate = ref('');
    const selectedWorkoutIdsToCopy = ref([]);

    // 月曆檢視相關狀態
    const calendarMonth = ref(new Date());

    // 歷史記錄過濾
    const historyFilter = reactive({
      keyword: '',
      category: 'all',
      startDate: '',
      endDate: '',
    });

    // 運動表單模型
    const form = reactive({
      category: 'strength',
      name: '',
      customName: '',
      date: getTodayString(),
      time: '18:00',
      notes: '',
      
      // 重訓專用
      sets: [
        { weight: 40, reps: 10, completed: true, isWarmup: false },
        { weight: 40, reps: 10, completed: true, isWarmup: false },
        { weight: 40, reps: 10, completed: true, isWarmup: false },
      ],
      targetMuscle: '',

      // 有氧 / HIIT / 伸展專用
      duration: 30,
      distance: 5.0,
      heartRate: 135,
      calories: 0,
      intensity: 7,

      // 慢跑與騎行路線標註專用
      routeName: '',
      routePoints: [], // 經緯度航點陣列 [{lat, lng}]
    });

    // 圖表實例
    let categoryChartInstance = null;
    let weeklyTrendChartInstance = null;

    // 提示訊息通知
    const notify = (msg) => {
      toastMessage.value = msg;
      showToast.value = true;
      setTimeout(() => {
        showToast.value = false;
      }, 2800);
    };

    // ==========================================
    // 🌟 Firebase 初始化與雲端同步邏輯
    // ==========================================
    const initFirebase = () => {
      try {
        let config = null;
        const storedConfig = localStorage.getItem(STORAGE_FB_CONFIG_KEY);
        if (storedConfig) {
          try {
            config = JSON.parse(storedConfig);
          } catch (e) {}
        }

        if (!config && window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey) {
          config = window.FIREBASE_CONFIG;
        }

        if (config && config.apiKey && config.projectId) {
          if (!firebase.apps.length) {
            firebase.initializeApp(config);
          }
          fbAuth = firebase.auth();
          fbDb = firebase.firestore();
          isFirebaseReady.value = true;

          // 監聽使用者登入狀態
          fbAuth.onAuthStateChanged(async (user) => {
            if (user) {
              currentUser.value = {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || user.email.split('@')[0],
                photoURL: user.photoURL,
              };
              syncStatus.value = 'syncing';
              await loadUserDataFromFirestore(user.uid);
              syncStatus.value = 'synced';
              notify(`👋 歡迎回來，${currentUser.value.displayName}！已連線至雲端資料庫`);
            } else {
              currentUser.value = null;
              syncStatus.value = 'offline';
              loadLocalData(); // 訪客離線模式
            }
          });
        } else {
          isFirebaseReady.value = false;
          loadLocalData();
        }
      } catch (err) {
        console.error('Firebase init error:', err);
        isFirebaseReady.value = false;
        loadLocalData();
      }
    };

    // 載入 Firestore 雲端資料
    const loadUserDataFromFirestore = async (uid) => {
      if (!fbDb) return;
      try {
        // 1. 讀取個人偏好設定
        const settingsDoc = await fbDb.collection('users').doc(uid).collection('settings').doc('profile').get();
        if (settingsDoc.exists) {
          Object.assign(settings, settingsDoc.data());
        }

        // 2. 讀取運動記錄
        const snapshot = await fbDb.collection('users').doc(uid).collection('workouts').orderBy('date', 'desc').get();
        const cloudWorkouts = [];
        snapshot.forEach((doc) => {
          cloudWorkouts.push({ id: doc.id, ...doc.data() });
        });
        
        workouts.value = cloudWorkouts;
        localStorage.setItem(`${STORAGE_WORKOUTS_KEY}_${uid}`, JSON.stringify(cloudWorkouts));
      } catch (err) {
        console.error('Failed to load from Firestore:', err);
        syncStatus.value = 'error';
      }
    };

    // 儲存單筆運動記錄至 Firestore
    const syncWorkoutToFirestore = async (workoutData) => {
      if (!currentUser.value || !fbDb) return;
      try {
        syncStatus.value = 'syncing';
        await fbDb.collection('users').doc(currentUser.value.uid).collection('workouts').doc(workoutData.id).set(workoutData);
        syncStatus.value = 'synced';
      } catch (err) {
        console.error('Error syncing workout:', err);
        syncStatus.value = 'error';
      }
    };

    // 刪除 Firestore 中的運動記錄
    const deleteWorkoutFromFirestore = async (workoutId) => {
      if (!currentUser.value || !fbDb) return;
      try {
        syncStatus.value = 'syncing';
        await fbDb.collection('users').doc(currentUser.value.uid).collection('workouts').doc(workoutId).delete();
        syncStatus.value = 'synced';
      } catch (err) {
        console.error('Error deleting workout:', err);
        syncStatus.value = 'error';
      }
    };

    // 儲存偏好設定至 Firestore
    const syncSettingsToFirestore = async () => {
      if (!currentUser.value || !fbDb) return;
      try {
        await fbDb.collection('users').doc(currentUser.value.uid).collection('settings').doc('profile').set({ ...settings });
      } catch (err) {
        console.error('Error syncing settings:', err);
      }
    };

    // Email 密碼登入
    const handleEmailAuth = async () => {
      const email = (authForm.email || '').trim().toLowerCase();
      const password = (authForm.password || '').trim();

      if (!email || !password) {
        alert('請填寫 Email 信箱與密碼！');
        return;
      }
      if (!fbAuth) {
        alert('Firebase 連線初始化中，請稍候重試或重新整理網頁！');
        return;
      }
      authLoading.value = true;
      try {
        if (authMode.value === 'login') {
          await fbAuth.signInWithEmailAndPassword(email, password);
          isAuthModalOpen.value = false;
          notify('🎉 登入成功！已連線至您的雲端資料庫');
        } else {
          const cred = await fbAuth.createUserWithEmailAndPassword(email, password);
          if (authForm.displayName && cred.user) {
            await cred.user.updateProfile({ displayName: authForm.displayName.trim() });
          }
          isAuthModalOpen.value = false;
          notify('🎉 註冊成功！已為您建立專屬雲端健身空間！');
        }
      } catch (err) {
        console.error('Email Auth Error:', err);
        let msg = err.message;
        if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
          msg = '帳號或密碼錯誤，請重新確認！若尚未註冊，請切換至「註冊新帳號」。';
        } else if (err.code === 'auth/email-already-in-use') {
          msg = '此 Email 已經被註冊過囉！請直接點選「登入帳號」。';
        } else if (err.code === 'auth/weak-password') {
          msg = '密碼強度不足，請設定至少 6 位字元！';
        } else if (err.code === 'auth/invalid-email') {
          msg = 'Email 格式不正確，請確認是否有空格或輸入錯誤！';
        } else if (err.code === 'auth/operation-not-allowed') {
          msg = 'Firebase 專案尚未開啟 Email 登入功能，請在 Firebase 控制台的 Authentication -> Sign-in method 中啟用 Email/Password 提供者！';
        } else if (err.code === 'auth/network-request-failed') {
          msg = '手機網路連線逾時，請檢查連線後重試！';
        }
        alert('登入提示：' + msg);
      } finally {
        authLoading.value = false;
      }
    };

    // Google 一鍵登入
    const handleGoogleAuth = async () => {
      if (!fbAuth) {
        alert('Firebase 連線初始化中，請稍候重試！');
        return;
      }
      authLoading.value = true;
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await fbAuth.signInWithPopup(provider);
        isAuthModalOpen.value = false;
        notify('🎉 Google 登入成功！');
      } catch (err) {
        console.error('Google sign-in error:', err);
        if (err.code === 'auth/popup-blocked') {
          alert('手機瀏覽器阻擋了 Google 彈出視窗。請允許彈出視窗，或直接在下方使用 Email/密碼 登入/註冊！');
        } else if (err.code === 'auth/popup-closed-by-user') {
          // 使用者自行關閉視窗，不顯示報錯
        } else {
          alert('Google 登入提示：' + err.message);
        }
      } finally {
        authLoading.value = false;
      }
    };

    // 登出
    const handleLogout = async () => {
      if (confirm('確定要登出目前帳號嗎？')) {
        if (fbAuth) {
          await fbAuth.signOut();
        }
        currentUser.value = null;
        workouts.value = [];
        loadLocalData();
        notify('👋 您已安全登出');
      }
    };

    // 儲存自訂 Firebase Config
    const saveFirebaseConfig = () => {
      try {
        let parsed = null;
        if (typeof firebaseConfigRaw.value === 'string' && firebaseConfigRaw.value.trim().startsWith('{')) {
          parsed = JSON.parse(firebaseConfigRaw.value);
        } else {
          alert('請貼上合法的 JSON 格式 Firebase 設定物件！');
          return;
        }

        if (parsed && parsed.apiKey && parsed.projectId) {
          localStorage.setItem(STORAGE_FB_CONFIG_KEY, JSON.stringify(parsed));
          notify('✅ Firebase 設定已儲存！即將為您重新初始化...');
          isConfigModalOpen.value = false;
          setTimeout(() => {
            window.location.reload();
          }, 800);
        } else {
          alert('設定缺少 apiKey 或 projectId，請檢查設定內容！');
        }
      } catch (e) {
        alert('JSON 解析失敗，請確認格式正確！');
      }
    };

    // ==========================================
    // 本地資料存取與備份
    // ==========================================
    const loadLocalData = () => {
      try {
        const savedWorkouts = localStorage.getItem(STORAGE_WORKOUTS_KEY);
        if (savedWorkouts) {
          workouts.value = JSON.parse(savedWorkouts);
        } else {
          workouts.value = [];
        }

        const savedSettings = localStorage.getItem(STORAGE_SETTINGS_KEY);
        if (savedSettings) {
          Object.assign(settings, JSON.parse(savedSettings));
        }
      } catch (e) {
        console.error('Failed to load local data', e);
      }
    };

    const saveLocalData = () => {
      try {
        if (!currentUser.value) {
          localStorage.setItem(STORAGE_WORKOUTS_KEY, JSON.stringify(workouts.value));
          localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
        } else {
          localStorage.setItem(`${STORAGE_WORKOUTS_KEY}_${currentUser.value.uid}`, JSON.stringify(workouts.value));
          syncSettingsToFirestore();
        }
      } catch (e) {
        console.error('Failed to save data', e);
      }
    };

    // 監聽並自動保存
    watch(workouts, () => saveLocalData(), { deep: true });
    watch(settings, () => saveLocalData(), { deep: true });
    
    // 監聽畫面變動自動更新 Lucide 圖示
    watch([workouts, selectedDate, currentTab, isModalOpen, isCopyModalOpen, isAuthModalOpen, isConfigModalOpen, currentUser], () => {
      nextTick(() => {
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      });
    }, { deep: true });

    // 當日運動列表
    const dailyWorkouts = computed(() => {
      return workouts.value
        .filter((w) => w.date === selectedDate.value)
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    });

    // 當日統計指標
    const dailyStats = computed(() => {
      const list = dailyWorkouts.value;
      let totalDuration = 0;
      let totalCalories = 0;
      let totalSets = 0;
      let totalVolume = 0;

      list.forEach((w) => {
        if (w.duration) {
          totalDuration += Number(w.duration) || 0;
        }
        if (w.calories) {
          totalCalories += Number(w.calories) || 0;
        }
        if (w.category === 'strength' && Array.isArray(w.sets)) {
          w.sets.forEach((s) => {
            if (s.completed) {
              totalSets++;
              totalVolume += (Number(s.weight) || 0) * (Number(s.reps) || 0);
            }
          });
        }
      });

      return {
        count: list.length,
        duration: totalDuration,
        calories: Math.round(totalCalories),
        sets: totalSets,
        volume: totalVolume,
      };
    });

    // 連續運動天數 (Streak) 計算
    const currentStreak = computed(() => {
      const datesWithWorkouts = new Set(workouts.value.map((w) => w.date));
      if (datesWithWorkouts.size === 0) return 0;

      let streak = 0;
      let checkDate = new Date();
      const todayStr = getTodayString();

      if (!datesWithWorkouts.has(todayStr)) {
        checkDate.setDate(checkDate.getDate() - 1);
      }

      while (true) {
        const y = checkDate.getFullYear();
        const m = String(checkDate.getMonth() + 1).padStart(2, '0');
        const d = String(checkDate.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;

        if (datesWithWorkouts.has(dateStr)) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }

      return streak;
    });

    // 本週進度計算
    const thisWeekStats = computed(() => {
      const now = new Date();
      const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;
      
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      const weekDates = new Set();
      let weekDuration = 0;
      let weekCalories = 0;
      let weekVolume = 0;

      workouts.value.forEach((w) => {
        const wDate = new Date(w.date + 'T00:00:00');
        if (wDate >= monday && wDate <= sunday) {
          weekDates.add(w.date);
          weekDuration += Number(w.duration) || 0;
          weekCalories += Number(w.calories) || 0;
          if (w.category === 'strength' && Array.isArray(w.sets)) {
            w.sets.forEach((s) => {
              if (s.completed) {
                weekVolume += (Number(s.weight) || 0) * (Number(s.reps) || 0);
              }
            });
          }
        }
      });

      const daysCount = weekDates.size;
      const targetDays = settings.weeklyWorkoutGoalDays || 4;
      const daysProgress = Math.min(100, Math.round((daysCount / targetDays) * 100));

      const targetMins = settings.weeklyDurationGoalMins || 150;
      const minsProgress = Math.min(100, Math.round((weekDuration / targetMins) * 100));

      return {
        daysCount,
        targetDays,
        daysProgress,
        weekDuration,
        targetMins,
        minsProgress,
        weekCalories: Math.round(weekCalories),
        weekVolume,
      };
    });

    // 月曆網格計算
    const calendarDays = computed(() => {
      const year = calendarMonth.value.getFullYear();
      const month = calendarMonth.value.getMonth();

      const firstDayOfMonth = new Date(year, month, 1);
      const lastDayOfMonth = new Date(year, month + 1, 0);
      
      let startingDay = firstDayOfMonth.getDay() - 1;
      if (startingDay === -1) startingDay = 6;

      const totalDays = lastDayOfMonth.getDate();
      const days = [];

      // 填充上個月
      const prevMonthLastDay = new Date(year, month, 0).getDate();
      for (let i = startingDay - 1; i >= 0; i--) {
        const d = prevMonthLastDay - i;
        const prevMonth = month === 0 ? 11 : month - 1;
        const prevYear = month === 0 ? year - 1 : year;
        const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        days.push({
          date: dateStr,
          dayNumber: d,
          isCurrentMonth: false,
          isToday: dateStr === getTodayString(),
          hasWorkout: workouts.value.some((w) => w.date === dateStr),
          workoutCount: workouts.value.filter((w) => w.date === dateStr).length,
        });
      }

      // 當月天數
      for (let i = 1; i <= totalDays; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const dayWorkouts = workouts.value.filter((w) => w.date === dateStr);
        days.push({
          date: dateStr,
          dayNumber: i,
          isCurrentMonth: true,
          isToday: dateStr === getTodayString(),
          hasWorkout: dayWorkouts.length > 0,
          workoutCount: dayWorkouts.length,
          categories: [...new Set(dayWorkouts.map((w) => w.category))],
        });
      }

      // 填充下個月
      const remaining = 42 - days.length;
      if (remaining > 0 && remaining < 7) {
        for (let i = 1; i <= remaining; i++) {
          const nextMonth = month === 11 ? 0 : month + 1;
          const nextYear = month === 11 ? year + 1 : year;
          const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
          days.push({
            date: dateStr,
            dayNumber: i,
            isCurrentMonth: false,
            isToday: dateStr === getTodayString(),
            hasWorkout: workouts.value.some((w) => w.date === dateStr),
            workoutCount: workouts.value.filter((w) => w.date === dateStr).length,
          });
        }
      }

      return days;
    });

    // 歷史記錄過濾清單
    const filteredHistoryWorkouts = computed(() => {
      return workouts.value
        .filter((w) => {
          if (historyFilter.category !== 'all' && w.category !== historyFilter.category) {
            return false;
          }
          if (historyFilter.keyword) {
            const kw = historyFilter.keyword.toLowerCase();
            const nameMatch = (w.name || '').toLowerCase().includes(kw);
            const notesMatch = (w.notes || '').toLowerCase().includes(kw);
            const muscleMatch = (w.targetMuscle || '').toLowerCase().includes(kw);
            if (!nameMatch && !notesMatch && !muscleMatch) return false;
          }
          if (historyFilter.startDate && w.date < historyFilter.startDate) {
            return false;
          }
          if (historyFilter.endDate && w.date > historyFilter.endDate) {
            return false;
          }
          return true;
        })
        .sort((a, b) => {
          if (a.date === b.date) {
            return (b.time || '').localeCompare(a.time || '');
          }
          return b.date.localeCompare(a.date);
        });
    });

    // 當前類別的預設運動項目
    const currentCategoryPresets = computed(() => {
      return PRESET_EXERCISES[form.category] || [];
    });

    // 計算重訓總容量
    const formTotalVolume = computed(() => {
      if (form.category !== 'strength' || !Array.isArray(form.sets)) return 0;
      return form.sets.reduce((sum, s) => {
        return sum + (s.completed ? (Number(s.weight) || 0) * (Number(s.reps) || 0) : 0);
      }, 0);
    });

    // 計算預估 1RM (Epley 公式)
    const estimated1RM = computed(() => {
      if (form.category !== 'strength' || !Array.isArray(form.sets)) return 0;
      let max1RM = 0;
      form.sets.forEach((s) => {
        if (s.completed && s.weight > 0 && s.reps > 0) {
          const calculated = s.reps === 1 ? Number(s.weight) : Math.round(s.weight * (1 + s.reps / 30));
          if (calculated > max1RM) max1RM = calculated;
        }
      });
      return max1RM;
    });

    // 動態計算運動卡路里 (採用國際標準 MET 公式)
    const calculateEstimatedCalories = () => {
      const cat = CATEGORIES.find((c) => c.id === form.category);
      const preset = PRESET_EXERCISES[form.category]?.find((p) => p.name === form.name);
      const met = (preset && preset.met) ? preset.met : (cat ? cat.met : 6.0);
      const weight = Number(settings.userWeight) || 65;
      const durationHours = (Number(form.duration) || 0) / 60;
      form.calories = Math.round(met * weight * durationHours);
    };

    // 換日操作
    const changeDate = (offsetDays) => {
      const current = new Date(selectedDate.value + 'T00:00:00');
      current.setDate(current.getDate() + offsetDays);
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, '0');
      const d = String(current.getDate()).padStart(2, '0');
      selectedDate.value = `${y}-${m}-${d}`;
    };

    const goToToday = () => {
      selectedDate.value = getTodayString();
      calendarMonth.value = new Date();
    };

    // 月曆切換月份
    const changeCalendarMonth = (offsetMonths) => {
      const current = new Date(calendarMonth.value);
      current.setMonth(current.getMonth() + offsetMonths);
      calendarMonth.value = current;
    };

    const selectCalendarDate = (day) => {
      selectedDate.value = day.date;
      currentTab.value = 'daily';
    };

    // 快速微調時長
    const adjustDuration = (delta) => {
      const current = Number(form.duration) || 0;
      const next = Math.max(1, current + delta);
      form.duration = next;
      calculateEstimatedCalories();
    };

    // 快捷設定時長
    const setDuration = (mins) => {
      form.duration = Math.max(1, mins);
      calculateEstimatedCalories();
    };

    // ==================== 慢跑與騎行路線標註與地圖狀態 ====================
    const isRouteModalOpen = ref(false);
    const isViewerMapModalOpen = ref(false);
    const viewingWorkoutRoute = ref(null);
    const tempRoutePoints = ref([]); // [{lat, lng}]
    const isGpsLocating = ref(false);

    let routeDrawMap = null;
    let routeDrawPolyline = null;
    let routeDrawMarkers = [];

    let routeViewerMap = null;
    let routeViewerPolyline = null;
    let routeViewerMarkers = [];

    const QUICK_ROUTES = [
      '河濱公園自行車道 (Riverbank Bikeway)',
      '都會森林公園外環 (City Park Loop)',
      '學校標準操場 400m (Standard Track)',
      '社區外圍公路夜跑 (Night Road Route)',
      '景觀跨橋自行車環線 (Scenic Bridge Loop)',
      '山道爬坡心肺挑戰 (Hill Climb Challenge)',
    ];

    // 計算經緯度航點陣列的總測量里程 (公里, Haversine 公式)
    function calculateRouteDistance(points) {
      if (!Array.isArray(points) || points.length < 2) return 0;
      let totalKm = 0;
      const R = 6371; // 地球半徑 (km)
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const lat1 = (Number(p1.lat !== undefined ? p1.lat : p1[0])) * (Math.PI / 180);
        const lon1 = (Number(p1.lng !== undefined ? p1.lng : p1[1])) * (Math.PI / 180);
        const lat2 = (Number(p2.lat !== undefined ? p2.lat : p2[0])) * (Math.PI / 180);
        const lon2 = (Number(p2.lng !== undefined ? p2.lng : p2[1])) * (Math.PI / 180);
        const dLat = lat2 - lat1;
        const dLon = lon2 - lon1;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        totalKm += R * c;
      }
      return Number(totalKm.toFixed(2));
    }

    const tempRouteDistance = computed(() => {
      return calculateRouteDistance(tempRoutePoints.value);
    });

    // 開啟路線繪製與地圖標註彈窗
    const openRouteDrawModal = () => {
      tempRoutePoints.value = Array.isArray(form.routePoints)
        ? JSON.parse(JSON.stringify(form.routePoints))
        : [];
      isRouteModalOpen.value = true;

      nextTick(() => {
        initRouteDrawMap();
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      });
    };

    // 初始化繪圖地圖
    const initRouteDrawMap = () => {
      if (routeDrawMap) {
        routeDrawMap.remove();
        routeDrawMap = null;
      }

      const mapContainer = document.getElementById('route-draw-map');
      if (!mapContainer || typeof L === 'undefined') return;

      let center = [25.033, 121.5654];
      let zoom = 14;

      if (tempRoutePoints.value.length > 0) {
        center = [tempRoutePoints.value[0].lat, tempRoutePoints.value[0].lng];
      }

      routeDrawMap = L.map('route-draw-map', {
        zoomControl: true,
      }).setView(center, zoom);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors',
      }).addTo(routeDrawMap);

      // 點擊地圖新增航點
      routeDrawMap.on('click', (e) => {
        const { lat, lng } = e.latlng;
        tempRoutePoints.value.push({
          lat: Number(lat.toFixed(6)),
          lng: Number(lng.toFixed(6)),
        });
        updateRouteDrawLayers();
      });

      updateRouteDrawLayers();

      if (tempRoutePoints.value.length > 1) {
        const latLngs = tempRoutePoints.value.map((p) => [p.lat, p.lng]);
        routeDrawMap.fitBounds(latLngs, { padding: [30, 30] });
      } else if (tempRoutePoints.value.length === 0 && navigator.geolocation) {
        locateCurrentGPS(false);
      }
    };

    // 更新地圖上的路線折線與標記
    const updateRouteDrawLayers = () => {
      if (!routeDrawMap || typeof L === 'undefined') return;

      routeDrawMarkers.forEach((m) => routeDrawMap.removeLayer(m));
      routeDrawMarkers = [];

      if (routeDrawPolyline) {
        routeDrawMap.removeLayer(routeDrawPolyline);
        routeDrawPolyline = null;
      }

      if (tempRoutePoints.value.length === 0) return;

      const latLngs = tempRoutePoints.value.map((p) => [p.lat, p.lng]);

      routeDrawPolyline = L.polyline(latLngs, {
        color: '#06b6d4',
        weight: 5,
        opacity: 0.85,
        smoothFactor: 1,
      }).addTo(routeDrawMap);

      // 起點標記
      const startPoint = tempRoutePoints.value[0];
      const startIcon = L.divIcon({
        className: 'custom-map-pin bg-emerald-500 ring-2 ring-white',
        html: '<span>起</span>',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      const startMarker = L.marker([startPoint.lat, startPoint.lng], { icon: startIcon }).addTo(routeDrawMap);
      routeDrawMarkers.push(startMarker);

      // 終點標記
      if (tempRoutePoints.value.length >= 2) {
        const endPoint = tempRoutePoints.value[tempRoutePoints.value.length - 1];
        const endIcon = L.divIcon({
          className: 'custom-map-pin bg-rose-500 ring-2 ring-white',
          html: '<span>終</span>',
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });
        const endMarker = L.marker([endPoint.lat, endPoint.lng], { icon: endIcon }).addTo(routeDrawMap);
        routeDrawMarkers.push(endMarker);
      }
    };

    // GPS 定位
    const locateCurrentGPS = (showNotification = true) => {
      if (!navigator.geolocation) {
        if (showNotification) alert('您的瀏覽器不支援 GPS 地理定位功能！');
        return;
      }

      isGpsLocating.value = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          isGpsLocating.value = false;
          const { latitude, longitude } = pos.coords;
          if (routeDrawMap) {
            routeDrawMap.setView([latitude, longitude], 16);
            if (tempRoutePoints.value.length === 0) {
              tempRoutePoints.value.push({
                lat: Number(latitude.toFixed(6)),
                lng: Number(longitude.toFixed(6)),
              });
              updateRouteDrawLayers();
            }
          }
          if (showNotification) notify('📍 已成功定位至您的目前位置！');
        },
        (err) => {
          isGpsLocating.value = false;
          console.warn('GPS location error:', err);
          if (showNotification) alert('無法取得 GPS 定位，請確認手機或瀏覽器是否已允許定位權限！');
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    };

    // 復原上一個標記點
    const undoLastRoutePoint = () => {
      if (tempRoutePoints.value.length > 0) {
        tempRoutePoints.value.pop();
        updateRouteDrawLayers();
      }
    };

    // 清空所有標記點
    const clearRoutePoints = () => {
      if (tempRoutePoints.value.length === 0) return;
      if (confirm('確定要清空目前繪製的所有路線標記嗎？')) {
        tempRoutePoints.value = [];
        updateRouteDrawLayers();
      }
    };

    // 匯入 GPX 檔案
    const importGPXFile = (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target.result;
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(content, 'text/xml');
          const trkpts = xmlDoc.getElementsByTagName('trkpt');

          if (!trkpts || trkpts.length === 0) {
            alert('無法在此 GPX 檔案中找到運動軌跡座標 (trkpt)！');
            return;
          }

          const parsedPoints = [];
          const step = Math.max(1, Math.floor(trkpts.length / 350));
          for (let i = 0; i < trkpts.length; i += step) {
            const lat = parseFloat(trkpts[i].getAttribute('lat'));
            const lon = parseFloat(trkpts[i].getAttribute('lon'));
            if (!isNaN(lat) && !isNaN(lon)) {
              parsedPoints.push({
                lat: Number(lat.toFixed(6)),
                lng: Number(lon.toFixed(6)),
              });
            }
          }

          if (trkpts.length > 1) {
            const last = trkpts[trkpts.length - 1];
            const lat = parseFloat(last.getAttribute('lat'));
            const lon = parseFloat(last.getAttribute('lon'));
            if (!isNaN(lat) && !isNaN(lon)) {
              parsedPoints.push({
                lat: Number(lat.toFixed(6)),
                lng: Number(lon.toFixed(6)),
              });
            }
          }

          tempRoutePoints.value = parsedPoints;
          updateRouteDrawLayers();

          if (routeDrawMap && parsedPoints.length > 0) {
            const latLngs = parsedPoints.map((p) => [p.lat, p.lng]);
            routeDrawMap.fitBounds(latLngs, { padding: [30, 30] });
          }

          notify(`📁 成功解析 GPX 軌跡檔！共載入 ${parsedPoints.length} 個航點`);
        } catch (err) {
          console.error('GPX parse error:', err);
          alert('解析 GPX 檔案失敗，請確認檔案格式是否正確！');
        }
      };
      reader.readAsText(file);
      event.target.value = '';
    };

    // 儲存路線至表單
    const saveRouteToForm = () => {
      form.routePoints = JSON.parse(JSON.stringify(tempRoutePoints.value));
      const dist = tempRouteDistance.value;
      if (dist > 0) {
        form.distance = dist;
        calculateEstimatedCalories();
      }
      isRouteModalOpen.value = false;
      notify(`🗺️ 路線已成功套用！測量距離為 ${dist} km`);
    };

    // 清除已儲存的路線
    const removeFormRoute = () => {
      form.routePoints = [];
      notify('已清除此項目的路線軌跡標記');
    };

    // 選擇常用路線名稱快選
    const selectQuickRoute = (routeName) => {
      form.routeName = routeName;
    };

    // 查看已記錄的運動路線地圖彈窗
    const viewWorkoutRouteMap = (workout) => {
      viewingWorkoutRoute.value = workout;
      isViewerMapModalOpen.value = true;

      nextTick(() => {
        initRouteViewerMap(workout);
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      });
    };

    // 初始化查看地圖
    const initRouteViewerMap = (workout) => {
      if (routeViewerMap) {
        routeViewerMap.remove();
        routeViewerMap = null;
      }

      const container = document.getElementById('route-viewer-map');
      if (!container || typeof L === 'undefined' || !workout.routePoints || workout.routePoints.length === 0) return;

      const points = workout.routePoints;
      const center = [points[0].lat, points[0].lng];

      routeViewerMap = L.map('route-viewer-map', {
        zoomControl: true,
      }).setView(center, 15);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors',
      }).addTo(routeViewerMap);

      const latLngs = points.map((p) => [p.lat, p.lng]);

      routeViewerPolyline = L.polyline(latLngs, {
        color: '#06b6d4',
        weight: 5,
        opacity: 0.9,
      }).addTo(routeViewerMap);

      const startIcon = L.divIcon({
        className: 'custom-map-pin bg-emerald-500 ring-2 ring-white',
        html: '<span>起</span>',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      L.marker([points[0].lat, points[0].lng], { icon: startIcon }).addTo(routeViewerMap);

      if (points.length >= 2) {
        const last = points[points.length - 1];
        const endIcon = L.divIcon({
          className: 'custom-map-pin bg-rose-500 ring-2 ring-white',
          html: '<span>終</span>',
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });
        L.marker([last.lat, last.lng], { icon: endIcon }).addTo(routeViewerMap);
      }

      routeViewerMap.fitBounds(latLngs, { padding: [35, 35] });
    };

    // 開啟新增表單
    const openAddModal = (presetCategory) => {
      isEditing.value = false;
      editingId.value = null;

      const now = new Date();
      const currentHours = String(now.getHours()).padStart(2, '0');
      const currentMins = String(now.getMinutes()).padStart(2, '0');

      form.category = presetCategory || 'strength';
      form.name = PRESET_EXERCISES[form.category]?.[0]?.name || '';
      form.customName = '';
      form.date = selectedDate.value;
      form.time = `${currentHours}:${currentMins}`;
      form.notes = '';
      form.targetMuscle = '';
      form.duration = form.category === 'stretch' ? 15 : (form.category === 'hiit' ? 20 : 30);
      form.distance = 5.0;
      form.heartRate = 135;
      form.intensity = 7;
      form.routeName = '';
      form.routePoints = [];
      form.sets = [
        { weight: 40, reps: 10, completed: true, isWarmup: false },
        { weight: 40, reps: 10, completed: true, isWarmup: false },
        { weight: 40, reps: 10, completed: true, isWarmup: false },
      ];

      calculateEstimatedCalories();
      isModalOpen.value = true;
      nextTick(() => lucide.createIcons());
    };

    // 開啟編輯表單
    const openEditModal = (workout) => {
      isEditing.value = true;
      editingId.value = workout.id;

      form.category = workout.category || 'strength';
      form.name = workout.name || '';
      form.customName = '';
      form.date = workout.date || selectedDate.value;
      form.time = workout.time || '18:00';
      form.notes = workout.notes || '';
      form.targetMuscle = workout.targetMuscle || '';
      form.duration = workout.duration || 30;
      form.distance = workout.distance || 0;
      form.heartRate = workout.heartRate || 0;
      form.calories = workout.calories || 0;
      form.intensity = workout.intensity || 7;
      form.routeName = workout.routeName || '';
      form.routePoints = Array.isArray(workout.routePoints) ? JSON.parse(JSON.stringify(workout.routePoints)) : [];
      form.sets = workout.sets ? JSON.parse(JSON.stringify(workout.sets)) : [
        { weight: 40, reps: 10, completed: true, isWarmup: false }
      ];

      isModalOpen.value = true;
      nextTick(() => lucide.createIcons());
    };

    // 切換分類
    const onCategoryChange = (catId) => {
      form.category = catId;
      const presets = PRESET_EXERCISES[catId];
      if (presets && presets.length > 0) {
        form.name = presets[0].name;
      } else {
        form.name = '';
      }
      if (!isEditing.value) {
        form.duration = catId === 'stretch' ? 15 : (catId === 'hiit' ? 20 : 30);
      }
      calculateEstimatedCalories();
    };

    // 選擇預設動作
    const selectPresetExercise = (preset) => {
      form.name = preset.name;
      if (preset.target) {
        form.targetMuscle = preset.target;
      }
      calculateEstimatedCalories();
    };

    // 重訓組數操作
    const addSet = () => {
      const lastSet = form.sets[form.sets.length - 1];
      const newWeight = lastSet ? lastSet.weight : 40;
      const newReps = lastSet ? lastSet.reps : 10;
      form.sets.push({
        weight: newWeight,
        reps: newReps,
        completed: true,
        isWarmup: false,
      });
    };

    const removeSet = (index) => {
      if (form.sets.length > 1) {
        form.sets.splice(index, 1);
      }
    };

    const copyLastSet = () => {
      if (form.sets.length > 0) {
        const last = form.sets[form.sets.length - 1];
        form.sets.push({ ...last });
      }
    };

    // 儲存運動記錄
    const saveWorkout = () => {
      const finalName = form.customName.trim() ? form.customName.trim() : form.name;
      if (!finalName) {
        alert('請填寫或選擇運動項目名稱！');
        return;
      }

      if (!form.calories || form.calories <= 0) {
        calculateEstimatedCalories();
      }

      const workoutData = {
        id: isEditing.value ? editingId.value : Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        category: form.category,
        name: finalName,
        date: form.date,
        time: form.time,
        notes: form.notes,
        duration: Number(form.duration) || 0,
        calories: Number(form.calories) || 0,
        targetMuscle: form.targetMuscle,
        sets: form.category === 'strength' ? JSON.parse(JSON.stringify(form.sets)) : null,
        distance: form.category === 'cardio' ? Number(form.distance) || 0 : null,
        heartRate: Number(form.heartRate) || null,
        intensity: Number(form.intensity) || null,
        routeName: form.routeName ? form.routeName.trim() : '',
        routePoints: Array.isArray(form.routePoints) && form.routePoints.length > 0 ? JSON.parse(JSON.stringify(form.routePoints)) : null,
        updatedAt: new Date().toISOString(),
      };

      if (isEditing.value) {
        const idx = workouts.value.findIndex((w) => w.id === editingId.value);
        if (idx !== -1) {
          workouts.value[idx] = workoutData;
          notify('✅ 運動記錄已更新！');
        }
      } else {
        workouts.value.unshift(workoutData);
        selectedDate.value = form.date;
        notify('🎉 成功新增運動記錄！');
        triggerConfetti();
      }

      // 同步至雲端 Firestore
      if (currentUser.value) {
        syncWorkoutToFirestore(workoutData);
      }

      isModalOpen.value = false;
      saveLocalData();
      nextTick(() => {
        renderCharts();
        lucide.createIcons();
      });
    };

    // 歷史上有運動記錄的所有日期清單（依日期降序排列）
    const availableWorkoutDates = computed(() => {
      const dateMap = {};
      workouts.value.forEach((w) => {
        if (!w.date) return;
        if (!dateMap[w.date]) {
          dateMap[w.date] = { date: w.date, count: 0, names: [] };
        }
        dateMap[w.date].count++;
        if (dateMap[w.date].names.length < 2) {
          dateMap[w.date].names.push(w.name);
        }
      });
      return Object.values(dateMap).sort((a, b) => b.date.localeCompare(a.date));
    });

    // 取得指定日期前最近一次有運動記錄的日期
    const getLastWorkoutDate = (targetDate) => {
      const dates = availableWorkoutDates.value.filter((d) => d.date < targetDate);
      if (dates.length > 0) return dates[0].date;
      const otherDates = availableWorkoutDates.value.filter((d) => d.date !== targetDate);
      if (otherDates.length > 0) return otherDates[0].date;
      return null;
    };

    // 複製來源日期的運動項目
    const copySourceWorkouts = computed(() => {
      return workouts.value.filter((w) => w.date === copySourceDate.value);
    });

    // 開啟課表複製彈窗
    const openCopyModal = (targetDate) => {
      copyTargetDate.value = typeof targetDate === 'string' && targetDate ? targetDate : selectedDate.value;
      
      // 1. 預設檢查昨天是否有記錄
      const d = new Date(copyTargetDate.value + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const yesterdayStr = `${y}-${m}-${day}`;

      const yesterdayHasWorkouts = workouts.value.some((w) => w.date === yesterdayStr);
      if (yesterdayHasWorkouts) {
        copySourceDate.value = yesterdayStr;
      } else {
        // 2. 昨天沒記錄，自動選取最近一次有運動記錄的日期
        const lastDate = getLastWorkoutDate(copyTargetDate.value);
        copySourceDate.value = lastDate || yesterdayStr;
      }

      // 預設全選來源日期的項目
      selectedWorkoutIdsToCopy.value = workouts.value
        .filter((w) => w.date === copySourceDate.value)
        .map((w) => w.id);

      isCopyModalOpen.value = true;
      nextTick(() => {
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      });
    };

    // 點擊快捷歷史日期標籤
    const selectSourceDate = (dateStr) => {
      copySourceDate.value = dateStr;
      selectedWorkoutIdsToCopy.value = workouts.value
        .filter((w) => w.date === dateStr)
        .map((w) => w.id);
    };

    // 切換來源日期時，自動全選該日期的動作
    const onCopySourceDateChange = () => {
      selectedWorkoutIdsToCopy.value = copySourceWorkouts.value.map((w) => w.id);
    };

    // 全選 / 取消全選欲複製的項目
    const toggleSelectAllCopy = () => {
      if (selectedWorkoutIdsToCopy.value.length === copySourceWorkouts.value.length) {
        selectedWorkoutIdsToCopy.value = [];
      } else {
        selectedWorkoutIdsToCopy.value = copySourceWorkouts.value.map((w) => w.id);
      }
    };

    // 執行複製課表
    const confirmCopyWorkouts = async () => {
      if (selectedWorkoutIdsToCopy.value.length === 0) {
        alert('請至少勾選一個要複製的運動項目！');
        return;
      }

      const itemsToClone = copySourceWorkouts.value.filter((w) =>
        selectedWorkoutIdsToCopy.value.includes(w.id)
      );

      const clonedList = [];
      const currentNow = new Date();
      const curHours = String(currentNow.getHours()).padStart(2, '0');
      const curMins = String(currentNow.getMinutes()).padStart(2, '0');

      for (const item of itemsToClone) {
        const newId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        const cloned = {
          ...JSON.parse(JSON.stringify(item)),
          id: newId,
          date: copyTargetDate.value,
          time: item.time || `${curHours}:${curMins}`,
          updatedAt: new Date().toISOString(),
        };
        clonedList.push(cloned);
        if (currentUser.value && fbDb) {
          await syncWorkoutToFirestore(cloned);
        }
      }

      workouts.value = [...clonedList, ...workouts.value];
      selectedDate.value = copyTargetDate.value;
      saveLocalData();
      isCopyModalOpen.value = false;
      notify(`📋 成功複製 ${clonedList.length} 筆運動課表到 ${formatDateDisplay(copyTargetDate.value)}！`);
      triggerConfetti();
      nextTick(() => {
        renderCharts();
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      });
    };

    // 一鍵快速複製前一日或最近一次所有記錄
    const quickCopyPreviousDay = async () => {
      // 1. 取得目標日期的前一日
      const d = new Date(selectedDate.value + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const yesterdayStr = `${y}-${m}-${day}`;

      let sourceDate = yesterdayStr;
      let sourceWorkouts = workouts.value.filter((w) => w.date === sourceDate);

      // 2. 若昨天沒有任何記錄，智慧尋找「最近一次有記錄的日期」
      if (sourceWorkouts.length === 0) {
        const lastDate = getLastWorkoutDate(selectedDate.value);
        if (lastDate) {
          sourceDate = lastDate;
          sourceWorkouts = workouts.value.filter((w) => w.date === sourceDate);
        }
      }

      // 3. 若依然完全沒有任何歷史記錄，開啟示範資料或提示
      if (sourceWorkouts.length === 0) {
        if (confirm('目前資料庫中尚未有任何運動記錄可複製！是否要為您載入近期的示範運動課表？')) {
          await loadSampleData();
        }
        return;
      }

      // 4. 複製該日所有項目
      const clonedList = [];
      const currentNow = new Date();
      const curHours = String(currentNow.getHours()).padStart(2, '0');
      const curMins = String(currentNow.getMinutes()).padStart(2, '0');

      for (const item of sourceWorkouts) {
        const newId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        const cloned = {
          ...JSON.parse(JSON.stringify(item)),
          id: newId,
          date: selectedDate.value,
          time: item.time || `${curHours}:${curMins}`,
          updatedAt: new Date().toISOString(),
        };
        clonedList.push(cloned);
        if (currentUser.value && fbDb) {
          await syncWorkoutToFirestore(cloned);
        }
      }

      workouts.value = [...clonedList, ...workouts.value];
      saveLocalData();
      notify(`📋 已成功複製 ${formatDateDisplay(sourceDate)} 的 ${clonedList.length} 筆課表到今日！`);
      triggerConfetti();
      nextTick(() => {
        renderCharts();
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      });
    };

    // 單筆運動卡片複製到其他天
    const copySingleWorkout = async (workout) => {
      const targetDate = prompt(`要將「${workout.name}」複製到哪一天？(格式：YYYY-MM-DD)`, selectedDate.value);
      if (!targetDate || !targetDate.trim()) return;
      const cleanDate = targetDate.trim();
      
      // 驗證日期格式
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
        alert('日期格式不正確，請使用 YYYY-MM-DD 格式（例如：2026-09-02）');
        return;
      }

      const newId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
      const cloned = {
        ...JSON.parse(JSON.stringify(workout)),
        id: newId,
        date: cleanDate,
        updatedAt: new Date().toISOString(),
      };

      workouts.value.unshift(cloned);
      if (currentUser.value && fbDb) {
        await syncWorkoutToFirestore(cloned);
      }
      selectedDate.value = cleanDate;
      saveLocalData();
      notify(`📋 已將「${workout.name}」複製到 ${formatDateDisplay(cleanDate)}！`);
      triggerConfetti();
      nextTick(() => {
        renderCharts();
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      });
    };

    // 刪除運動
    const deleteWorkout = (id) => {
      if (confirm('確定要刪除這筆運動記錄嗎？')) {
        workouts.value = workouts.value.filter((w) => w.id !== id);
        if (currentUser.value) {
          deleteWorkoutFromFirestore(id);
        }
        notify('🗑️ 運動記錄已刪除');
        saveLocalData();
        nextTick(() => renderCharts());
      }
    };

    // 慶祝彩帶
    const triggerConfetti = () => {
      if (typeof confetti === 'function') {
        confetti({
          particleCount: 60,
          spread: 70,
          origin: { y: 0.75 },
          colors: ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#38bdf8']
        });
      }
    };

    const getCategoryInfo = (catId) => {
      return CATEGORIES.find((c) => c.id === catId) || CATEGORIES[0];
    };

    const formatDateDisplay = (dateStr) => {
      if (!dateStr) return '';
      const [year, month, day] = dateStr.split('-');
      const d = new Date(dateStr + 'T00:00:00');
      const weekDays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
      return `${month}月${day}日 (${weekDays[d.getDay()]})`;
    };

    // 圖表渲染
    const renderCharts = () => {
      if (currentTab.value !== 'analytics') return;

      const catCanvas = document.getElementById('categoryChart');
      const trendCanvas = document.getElementById('weeklyTrendChart');

      if (!catCanvas || !trendCanvas) return;

      const catCounts = {
        strength: 0,
        cardio: 0,
        hiit: 0,
        stretch: 0,
        sports: 0,
      };

      workouts.value.forEach((w) => {
        if (catCounts[w.category] !== undefined) {
          catCounts[w.category] += Number(w.duration) || 30;
        }
      });

      if (categoryChartInstance) categoryChartInstance.destroy();
      categoryChartInstance = new Chart(catCanvas, {
        type: 'doughnut',
        data: {
          labels: ['重訓/阻力', '有氧運動', '核心/HIIT', '伸展瑜珈', '球類戶外'],
          datasets: [{
            data: [
              catCounts.strength,
              catCounts.cardio,
              catCounts.hiit,
              catCounts.stretch,
              catCounts.sports,
            ],
            backgroundColor: [
              '#6366f1',
              '#10b981',
              '#f43f5e',
              '#06b6d4',
              '#f59e0b',
            ],
            borderWidth: 2,
            borderColor: '#1e293b',
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#94a3b8', boxWidth: 12, padding: 15, font: { family: 'Plus Jakarta Sans' } }
            },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  return ` ${ctx.label}: ${ctx.raw} 分鐘`;
                }
              }
            }
          },
          cutout: '70%',
        }
      });

      const last7Labels = [];
      const last7Durations = [];
      const last7Calories = [];

      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${day}`;
        const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
        
        last7Labels.push(`${m}/${day} (${dayNames[d.getDay()]})`);

        let dayMins = 0;
        let dayCals = 0;
        workouts.value.filter((w) => w.date === dateStr).forEach((w) => {
          dayMins += Number(w.duration) || 0;
          dayCals += Number(w.calories) || 0;
        });

        last7Durations.push(dayMins);
        last7Calories.push(dayCals);
      }

      if (weeklyTrendChartInstance) weeklyTrendChartInstance.destroy();
      weeklyTrendChartInstance = new Chart(trendCanvas, {
        type: 'bar',
        data: {
          labels: last7Labels,
          datasets: [
            {
              type: 'bar',
              label: '運動時長 (分鐘)',
              data: last7Durations,
              backgroundColor: 'rgba(99, 102, 241, 0.7)',
              borderColor: '#6366f1',
              borderWidth: 1,
              borderRadius: 6,
              yAxisID: 'y',
            },
            {
              type: 'line',
              label: '消耗熱量 (kcal)',
              data: last7Calories,
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              borderWidth: 2,
              tension: 0.3,
              pointBackgroundColor: '#10b981',
              yAxisID: 'y1',
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: { color: '#94a3b8' }
            },
            y: {
              type: 'linear',
              position: 'left',
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: { color: '#94a3b8' },
              title: { display: true, text: '分鐘', color: '#818cf8' }
            },
            y1: {
              type: 'linear',
              position: 'right',
              grid: { drawOnChartArea: false },
              ticks: { color: '#94a3b8' },
              title: { display: true, text: '卡路里', color: '#34d399' }
            }
          },
          plugins: {
            legend: {
              labels: { color: '#94a3b8' }
            }
          }
        }
      });
    };

    const switchTab = (tab) => {
      currentTab.value = tab;
      nextTick(() => {
        lucide.createIcons();
        if (tab === 'analytics') {
          renderCharts();
        }
      });
    };

    // 匯出 JSON
    const exportDataJSON = () => {
      const data = {
        version: '2.0',
        exportDate: new Date().toISOString(),
        user: currentUser.value ? currentUser.value.email : 'guest',
        settings: settings,
        workouts: workouts.value,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FitTrack_Backup_${getTodayString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify('📥 運動記錄已匯出為 JSON 備份！');
    };

    // ==================== CSV 匯出天數/區間篩選狀態 ====================
    const isExportModalOpen = ref(false);
    const exportPreset = ref('7'); // '7' | '30' | '90' | 'month' | 'year' | 'all' | 'custom'
    const exportStartDate = ref('');
    const exportEndDate = ref('');

    function formatDateYMD(d) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // 設定快捷匯出天數區間
    const setExportPreset = (preset) => {
      exportPreset.value = preset;
      const today = new Date();
      const todayStr = getTodayString();
      exportEndDate.value = todayStr;

      if (preset === '7') {
        const d = new Date();
        d.setDate(d.getDate() - 6);
        exportStartDate.value = formatDateYMD(d);
      } else if (preset === '30') {
        const d = new Date();
        d.setDate(d.getDate() - 29);
        exportStartDate.value = formatDateYMD(d);
      } else if (preset === '90') {
        const d = new Date();
        d.setDate(d.getDate() - 89);
        exportStartDate.value = formatDateYMD(d);
      } else if (preset === 'month') {
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        exportStartDate.value = `${y}-${m}-01`;
      } else if (preset === 'year') {
        const y = today.getFullYear();
        exportStartDate.value = `${y}-01-01`;
      } else if (preset === 'all') {
        if (workouts.value.length > 0) {
          const sorted = [...workouts.value].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
          exportStartDate.value = sorted[0].date || todayStr;
        } else {
          exportStartDate.value = todayStr;
        }
      }
    };

    // 開啟 CSV 匯出設定彈窗
    const openExportModal = () => {
      exportEndDate.value = getTodayString();
      setExportPreset(exportPreset.value || '7');
      isExportModalOpen.value = true;
      nextTick(() => {
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      });
    };

    // 依據所選日期區間篩選欲匯出的運動記錄
    const filteredExportWorkouts = computed(() => {
      if (exportPreset.value === 'all') {
        return [...workouts.value].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      }
      return workouts.value.filter((w) => {
        if (!w.date) return false;
        if (exportStartDate.value && w.date < exportStartDate.value) return false;
        if (exportEndDate.value && w.date > exportEndDate.value) return false;
        return true;
      }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    });

    // 計算匯出區間內的彙總統計
    const exportSummaryStats = computed(() => {
      const list = filteredExportWorkouts.value;
      const count = list.length;
      let totalDuration = 0;
      let totalCalories = 0;
      const daysSet = new Set();

      list.forEach((w) => {
        totalDuration += Number(w.duration) || 0;
        totalCalories += Number(w.calories) || 0;
        if (w.date) daysSet.add(w.date);
      });

      return {
        count,
        totalDuration,
        totalCalories,
        daysCount: daysSet.size,
      };
    });

    // 確認執行 CSV 檔案下載
    const confirmExportCSV = () => {
      const list = filteredExportWorkouts.value;
      if (list.length === 0) {
        alert('所選的日期區間內沒有任何運動記錄可匯出！');
        return;
      }

      let csvContent = '\uFEFF日期,時間,分類,項目名稱,訓練時長(分),消耗熱量(kcal),組數/重量詳情,部位/距離/強度,備註\n';
      list.forEach((w) => {
        const catName = getCategoryInfo(w.category).name;
        let details = '';
        if (w.category === 'strength' && Array.isArray(w.sets)) {
          details = w.sets.map((s, idx) => `組${idx + 1}:${s.weight}kg x ${s.reps}下`).join(' | ');
        } else if (w.category === 'cardio') {
          details = `距離:${w.distance || 0}km`;
        }
        const row = [
          w.date,
          w.time || '',
          `"${catName}"`,
          `"${(w.name || '').replace(/"/g, '""')}"`,
          w.duration || 0,
          w.calories || 0,
          `"${details.replace(/"/g, '""')}"`,
          `"${(w.targetMuscle || '').replace(/"/g, '""')}"`,
          `"${(w.notes || '').replace(/"/g, '""')}"`,
        ];
        csvContent += row.join(',') + '\n';
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      let filename = `FitTrack_Records_${exportStartDate.value}_至_${exportEndDate.value}.csv`;
      if (exportPreset.value === 'all') {
        filename = `FitTrack_Records_全部歷史_${getTodayString()}.csv`;
      }
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      isExportModalOpen.value = false;
      notify(`📊 成功匯出 ${list.length} 筆運動記錄 CSV 試算表！`);
    };

    // 匯入 JSON
    const importDataJSON = (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          if (Array.isArray(imported.workouts)) {
            workouts.value = imported.workouts;
            if (imported.settings) {
              Object.assign(settings, imported.settings);
            }
            saveLocalData();

            // 若已登入，逐筆同步至雲端 Firestore
            if (currentUser.value) {
              for (const w of imported.workouts) {
                await syncWorkoutToFirestore(w);
              }
            }

            notify('✅ 成功匯入 ' + imported.workouts.length + ' 筆運動記錄！');
            triggerConfetti();
            nextTick(() => {
              renderCharts();
              lucide.createIcons();
            });
          } else {
            alert('檔案格式不正確，找不到有效的運動記錄清單！');
          }
        } catch (err) {
          alert('解析 JSON 檔案失敗，請確認檔案格式！');
        }
      };
      reader.readAsText(file);
      event.target.value = '';
    };

    // 載入示範資料
    const loadSampleData = async () => {
      if (workouts.value.length > 0) {
        if (!confirm('載入示範資料將會加入近 10 天的運動示範記錄，確定要加入嗎？')) {
          return;
        }
      }

      const sampleList = [];
      const today = new Date();

      const samples = [
        { offset: 0, cat: 'strength', name: '深蹲 (Squat)', time: '18:30', duration: 50, sets: [{ weight: 60, reps: 10, completed: true }, { weight: 70, reps: 8, completed: true }, { weight: 80, reps: 6, completed: true }, { weight: 85, reps: 5, completed: true }], target: '下肢', notes: '今天狀況很好，最後一組突破 85kg！' },
        { offset: 0, cat: 'stretch', name: '下肢腿部拉筋', time: '19:25', duration: 15, calories: 40, notes: '滾筒放鬆股四頭與臀肌' },
        { offset: 1, cat: 'cardio', name: '戶外慢跑 (Running)', time: '07:00', duration: 35, distance: 5.2, heartRate: 145, calories: 320, notes: '清晨河濱公園慢跑，天氣涼爽' },
        { offset: 2, cat: 'strength', name: '臥推 (Bench Press)', time: '19:00', duration: 45, sets: [{ weight: 50, reps: 10, completed: true }, { weight: 60, reps: 8, completed: true }, { weight: 65, reps: 6, completed: true }], target: '胸部', notes: '胸肌發力感覺很扎實' },
        { offset: 2, cat: 'strength', name: '啞鈴肩推 (Shoulder Press)', time: '19:50', duration: 30, sets: [{ weight: 16, reps: 12, completed: true }, { weight: 18, reps: 10, completed: true }, { weight: 20, reps: 8, completed: true }], target: '肩部' },
        { offset: 4, cat: 'hiit', name: '波比跳 (Burpees)', time: '18:15', duration: 25, intensity: 9, calories: 240, notes: '高強度間歇，做完爆汗' },
        { offset: 5, cat: 'strength', name: '硬舉 (Deadlift)', time: '18:00', duration: 55, sets: [{ weight: 70, reps: 8, completed: true }, { weight: 90, reps: 6, completed: true }, { weight: 100, reps: 5, completed: true }], target: '背部 / 臀腿' },
        { offset: 6, cat: 'sports', name: '羽球 (Badminton)', time: '14:00', duration: 60, intensity: 8, calories: 420, notes: '和朋友雙打比賽，超累超好玩' },
        { offset: 8, cat: 'cardio', name: '室內飛輪 (Spinning)', time: '19:30', duration: 40, distance: 15.0, calories: 350, notes: '跟著有氧音樂節奏騎乘' },
      ];

      for (const s of samples) {
        const d = new Date(today);
        d.setDate(d.getDate() - s.offset);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${day}`;

        const item = {
          id: 'sample_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
          category: s.cat,
          name: s.name,
          date: dateStr,
          time: s.time,
          duration: s.duration,
          calories: s.calories || Math.round(s.duration * 7.5),
          sets: s.sets || null,
          targetMuscle: s.target || '',
          distance: s.distance || null,
          heartRate: s.heartRate || null,
          intensity: s.intensity || 7,
          notes: s.notes || '',
          updatedAt: new Date().toISOString(),
        };
        sampleList.push(item);
        if (currentUser.value) {
          await syncWorkoutToFirestore(item);
        }
      }

      workouts.value = [...sampleList, ...workouts.value];
      saveLocalData();
      notify('✨ 已載入示範運動資料！');
      triggerConfetti();
      nextTick(() => {
        renderCharts();
        lucide.createIcons();
      });
    };

    onMounted(() => {
      initFirebase();
      nextTick(() => {
        lucide.createIcons();
      });
    });

    return {
      CATEGORIES,
      PRESET_EXERCISES,
      currentTab,
      selectedDate,
      workouts,
      settings,
      isFirebaseReady,
      currentUser,
      syncStatus,
      isAuthModalOpen,
      authMode,
      authLoading,
      authForm,
      isConfigModalOpen,
      firebaseConfigRaw,
      isModalOpen,
      isEditing,
      editingId,
      isCopyModalOpen,
      copySourceDate,
      copyTargetDate,
      selectedWorkoutIdsToCopy,
      copySourceWorkouts,
      availableWorkoutDates,
      openCopyModal,
      selectSourceDate,
      onCopySourceDateChange,
      toggleSelectAllCopy,
      confirmCopyWorkouts,
      quickCopyPreviousDay,
      copySingleWorkout,
      toastMessage,
      showToast,
      calendarMonth,
      historyFilter,
      form,
      dailyWorkouts,
      dailyStats,
      currentStreak,
      thisWeekStats,
      calendarDays,
      filteredHistoryWorkouts,
      currentCategoryPresets,
      formTotalVolume,
      estimated1RM,
      getTodayString,
      notify,
      switchTab,
      changeDate,
      goToToday,
      changeCalendarMonth,
      selectCalendarDate,
      openAddModal,
      openEditModal,
      onCategoryChange,
      selectPresetExercise,
      adjustDuration,
      setDuration,
      isRouteModalOpen,
      isViewerMapModalOpen,
      viewingWorkoutRoute,
      tempRoutePoints,
      tempRouteDistance,
      isGpsLocating,
      QUICK_ROUTES,
      openRouteDrawModal,
      updateRouteDrawLayers,
      locateCurrentGPS,
      undoLastRoutePoint,
      clearRoutePoints,
      importGPXFile,
      saveRouteToForm,
      removeFormRoute,
      selectQuickRoute,
      viewWorkoutRouteMap,
      addSet,
      removeSet,
      copyLastSet,
      calculateEstimatedCalories,
      saveWorkout,
      deleteWorkout,
      getCategoryInfo,
      formatDateDisplay,
      exportDataJSON,
      isExportModalOpen,
      exportPreset,
      exportStartDate,
      exportEndDate,
      setExportPreset,
      openExportModal,
      filteredExportWorkouts,
      exportSummaryStats,
      confirmExportCSV,
      importDataJSON,
      loadSampleData,
      handleEmailAuth,
      handleGoogleAuth,
      handleLogout,
      saveFirebaseConfig,
    };
  }
}).mount('#app');
