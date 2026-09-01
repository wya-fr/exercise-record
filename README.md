# FitTrack Daily - 每日運動與健身記錄網頁 (Firebase 雲端多使用者版)

一個介面極簡現代、專為記錄每日運動項目與訓練細節設計的 Web 應用程式，支援 **Firebase 雲端多使用者登入與跨裝置即時同步**。

---

## 🌟 核心功能一覽

1. **🔐 雲端多使用者登入與資料隔離 (Firebase Auth + Firestore)**
   - **Google 一鍵登入** 或 **Email + 密碼註冊登入**。
   - **資料獨立隔離**：每位使用者擁有專屬的雲端記錄空間 (`users/{uid}/workouts`)，不同帳號互不干擾。
   - **跨裝置即時同步**：手機、平板、電腦登入同一帳號隨時無縫同步。
   - **離線訪客模式**：未登入時仍可使用 LocalStorage 離線記錄。

2. **📅 每日運動記錄與打卡**
   - **日期快速跳轉**：前一天/後一天快速切換或日曆挑選任意日期。
   - **連續運動打卡 (Streak)**：自動計算連續運動天數。
   - **當日總結指標**：即時計算訓練項目數、總時長、預估消耗熱量、重訓總容量 (kg) 與組數。

3. **🏋️ 智慧型動態運動記錄表單**
   - **重訓 / 阻力**：記錄動作名稱、多組重量 (kg) × 次數 (reps)，支援「+ 複製上一組」，自動計算訓練總容量與預估 1RM (Epley 公式)。
   - **有氧運動**：記錄慢跑、飛輪、游泳、跳繩等時長、距離 (km)、心率 (bpm)，自動估算消耗卡路里。
   - **核心 / HIIT / 伸展瑜珈 / 球類**：支援自覺強度評分 (RPE 1~10)、鍛鍊部位與備註筆記。

4. **🗓️ 運動月曆檢視**
   - 直觀顯示當月每一天是否有運動與項目數量，點擊任意日期即可跳轉查看或補登。

5. **📊 數據分析與視覺化圖表**
   - 每週目標達成進度條（天數與時長）。
   - 運動類型分佈圓餅圖（各類別時長佔比）。
   - 近 7 天訓練時長與卡路里趨勢圖。

6. **💾 備份與資料管理**
   - 一鍵匯出 / 匯入 JSON 備份檔。
   - 匯出 CSV 報表（支援 Excel 分析）。
   - 一鍵載入示範資料（點擊 ✨ 按鈕快速預覽完整圖表效果）。

---

## 🔥 Firebase 雲端設定教學 (3 分鐘快速啟用)

若要讓每個人透過自己的帳號登入並同步資料，只需在 Firebase Console 完成以下簡單設定：

### 步驟 1：建立 Firebase 專案
1. 前往 [Firebase Console](https://console.firebase.google.com/)。
2. 點擊 **「新增專案」**，輸入專案名稱（例如 `fittrack-daily`），依提示完成建立。

### 步驟 2：啟用 Authentication（身份驗證）
1. 在左側選單點擊 **「建構 (Build)」 > 「Authentication」**，點擊 **「開始使用」**。
2. 在 **「登入方式 (Sign-in method)」** 啟用：
   - **電子郵件/密碼 (Email/Password)**（啟用第一項即可）。
   - **Google**（選填，若需要 Google 一鍵登入請啟用）。

### 步驟 3：啟用 Cloud Firestore（雲端資料庫）
1. 在左側選單點擊 **「建構 (Build)」 > 「Firestore Database」**，點擊 **「建立資料庫」**。
2. 選擇位置（例如 `asia-east1` 台灣），安全規則選擇 **「測試模式 (Test mode)」** 或設定規則：
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

### 步驟 4：取得 Web 設定資訊並填入網頁
1. 在 Firebase 專案首頁點擊 **「專案設定 (Project settings)」** 齒輪圖示。
2. 在下方「您的應用程式」中點擊 **「Web (</>)」** 新增網頁應用程式。
3. 複製 `firebaseConfig` 物件內容。
4. **方式 A**：直接打開網頁，點擊右上角 **「⚙️ (Firebase 設定)」** 貼上 JSON 設定並儲存。
5. **方式 B**：將設定貼入專案內的 `firebase-config.js` 檔案中。

---

## 🚀 如何啟動網頁

### 方法一：直接雙擊開啟
在檔案總管中直接雙擊開啟 `index.html` 即可使用！

### 方法二：透過 Python 本機伺服器
在專案目錄下執行：
```powershell
python start_server.py
```
伺服器將在 `http://localhost:8000` 啟動並自動在瀏覽器中開啟。
