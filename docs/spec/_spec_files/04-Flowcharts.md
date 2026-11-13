# فلوچارت‌های سیستم ToInfinity

## نسخه ۱.۰

---

## ۱. فلوچارت ورود و احراز هویت

```mermaid
flowchart TD
    Start([شروع]) --> SelectLang[انتخاب زبان<br/>فارسی/English/العربية]
    SelectLang --> SaveLang[ذخیره در localStorage و cookie]
    SaveLang --> ShowLogin[نمایش صفحه ورود]
    ShowLogin --> ShowBotLink[نمایش لینک ربات تلگرام]
    ShowBotLink --> UserClickLink{کاربر روی لینک کلیک کرد؟}
    
    UserClickLink -->|بله| TelegramOpen[بازکردن تلگرام]
    TelegramOpen --> UserStart[کاربر /start می‌زند]
    UserStart --> BotGetID[ربات telegram_id دریافت می‌کند]
    
    BotGetID --> CheckUser{کاربر در سیستم است؟}
    
    CheckUser -->|خیر - اولین کاربر| CreateFirstAdmin[ایجاد ادمین اولیه<br/>is_first_admin=true<br/>role=ADMIN]
    CreateFirstAdmin --> GeneratePass[تولید پسورد تصادفی]
    GeneratePass --> SendPassTelegram[ارسال پسورد به تلگرام]
    SendPassTelegram --> GenerateJWT[تولید JWT Token]
    
    CheckUser -->|خیر - کاربر عادی| CreateUser[ایجاد کاربر<br/>status=pending_manager]
    CreateUser --> NotifyManager[نوتیفیکیشن به مدیر]
    NotifyManager --> WaitApproval{منتظر تأیید}
    
    WaitApproval -->|تأیید شد| UpdateActive[status=active]
    UpdateActive --> GenerateJWT
    
    WaitApproval -->|رد شد| ShowReject[پیام: درخواست رد شد]
    ShowReject --> End1([پایان])
    
    CheckUser -->|بله| CheckStatus{وضعیت کاربر؟}
    
    CheckStatus -->|pending_manager| ShowPending[پیام: در انتظار تأیید مدیر]
    ShowPending --> End2([پایان])
    
    CheckStatus -->|active| GenerateJWT
    GenerateJWT --> SetSession[ذخیره JWT در session]
    SetSession --> RedirectDashboard[انتقال به داشبورد]
    RedirectDashboard --> End3([پایان])
```

---

## ۲. فلوچارت ضبط ویس مذاکره

```mermaid
flowchart TD
    Start([ورود به ابزارها → مذاکره]) --> ShowForm[نمایش فرم اجباری]
    ShowForm --> EnterCustomer[ورود نام مشتری<br/>متنی - تایپ آزاد]
    EnterCustomer --> SelectCategory[انتخاب صنف مشتری<br/>کشویی]
    
    SelectCategory --> CheckForm{هر دو فیلد پر شد؟}
    CheckForm -->|خیر| DisableBtn[دکمه ضبط غیرفعال<br/>خاکستری]
    DisableBtn --> ShowForm
    
    CheckForm -->|بله| EnableBtn[دکمه ضبط فعال<br/>قرمز]
    EnableBtn --> UserPressRec{کاربر دکمه را فشرد؟}
    
    UserPressRec -->|بله| RequestMic[درخواست مجوز میکروفون]
    RequestMic --> CheckMicPerm{مجوز داده شد؟}
    
    CheckMicPerm -->|خیر| ShowMicError[خطا: مجوز میکروفون نداده شد]
    ShowMicError --> End1([پایان])
    
    CheckMicPerm -->|بله| RequestGPS[درخواست مجوز GPS]
    RequestGPS --> CheckGPSPerm{مجوز GPS؟}
    
    CheckGPSPerm -->|خیر| ManualAddress[گزینه ورود دستی آدرس]
    ManualAddress --> StartRec1[شروع ضبط]
    
    CheckGPSPerm -->|بله| GetGPS[دریافت lat, lng, accuracy]
    GetGPS --> CheckAccuracy{accuracy < 10m?}
    
    CheckAccuracy -->|خیر| ShowGPSWarning[هشدار: دقت GPS پایین]
    ShowGPSWarning --> ManualOption{کاربر ادامه می‌دهد؟}
    ManualOption -->|خیر| ManualAddress
    ManualOption -->|بله| CallReverseGeo[فراخوانی Reverse Geocoding AI]
    
    CheckAccuracy -->|بله| CallReverseGeo
    CallReverseGeo --> GetAddress[دریافت آدرس متنی]
    GetAddress --> StartRec1
    
    StartRec1 --> RecordingLoop{در حال ضبط...}
    RecordingLoop --> CheckTime{بیش از 30 دقیقه؟}
    CheckTime -->|بله| ShowWarning[هشدار: هزینه بالای API]
    ShowWarning --> RecordingLoop
    
    CheckTime -->|خیر| UserStopRec{کاربر توقف کرد؟}
    UserStopRec -->|خیر| RecordingLoop
    
    UserStopRec -->|بله| StopRec[توقف ضبط]
    StopRec --> VoiceID[شناسایی صدا با voice_signature]
    VoiceID --> CheckVoiceMatch{صدا مطابقت دارد؟}
    
    CheckVoiceMatch -->|خیر| ShowVoiceError[خطا: صدا مطابقت ندارد]
    ShowVoiceError --> End2([پایان])
    
    CheckVoiceMatch -->|بله| CheckOnline{آنلاین است؟}
    
    CheckOnline -->|خیر| SaveLocal[ذخیره در localStorage PWA]
    SaveLocal --> QueueSync[افزودن به صف sync]
    QueueSync --> WaitOnline[منتظر آنلاین شدن]
    WaitOnline --> CheckOnline
    
    CheckOnline -->|بله| PrepareMetadata[آماده‌سازی متادیتا<br/>نام، صنف، GPS، زمان]
    PrepareMetadata --> ForwardTelegram[فوروارد به مدیر در تلگرام]
    ForwardTelegram --> CheckTelegramOK{ارسال موفق؟}
    
    CheckTelegramOK -->|خیر| FallbackEmail[Fallback: ارسال به ایمیل]
    FallbackEmail --> ExtractKeywords
    
    CheckTelegramOK -->|بله| ExtractKeywords[استخراج کلمات کلیدی]
    ExtractKeywords --> SaveMetadata[ذخیره متادیتا + کلمات<br/>بدون فایل ویس]
    SaveMetadata --> QueueAI[افزودن به صف تحلیل AI]
    QueueAI --> ShowSuccess[نمایش پیام موفقیت]
    ShowSuccess --> End3([پایان])
```

---

## ۳. فلوچارت تحلیل هوش مصنوعی

```mermaid
flowchart TD
    Start([شروع تحلیل AI]) --> GetFromQueue[دریافت از صف تحلیل]
    GetFromQueue --> CheckBudget{بودجه API باقی مانده؟}
    
    CheckBudget -->|خیر| StopAnalysis[توقف تحلیل]
    StopAnalysis --> NotifyBudget[نوتیفیکیشن: بودجه تمام شد]
    NotifyBudget --> OnlyForward[فقط فوروارد ادامه پیدا می‌کند]
    OnlyForward --> End1([پایان])
    
    CheckBudget -->|بله| GetUserLevel[دریافت سطح کاربر<br/>آماتور/نیمه/حرفه‌ای]
    GetUserLevel --> GetHardness[دریافت سطح سخت‌گیری<br/>ساده/معمولی/سخت]
    GetHardness --> GetTopics[دریافت موضوعات فعال]
    
    GetTopics --> Topic1{کلام فعال؟}
    Topic1 -->|بله| SampleVoice1[sample ۲+۲+۲ دقیقه]
    SampleVoice1 --> GetPrompt1[دریافت پرامپت کلام<br/>بر اساس سخت‌گیری]
    GetPrompt1 --> CallAPI1[فراخوانی AI API]
    CallAPI1 --> GetScore1[نمره ۰-۱۰۰ کلام]
    GetScore1 --> Topic2
    
    Topic1 -->|خیر| Topic2{لحن فعال؟}
    Topic2 -->|بله| SampleVoice2[sample ۲+۲+۲ دقیقه]
    SampleVoice2 --> GetPrompt2[دریافت پرامپت لحن]
    GetPrompt2 --> CallAPI2[فراخوانی AI API]
    CallAPI2 --> GetScore2[نمره ۰-۱۰۰ لحن]
    GetScore2 --> Topic3
    
    Topic2 -->|خیر| Topic3{استرس فعال؟}
    Topic3 -->|بله| AnalyzeStress[تحلیل استرس از صدا]
    AnalyzeStress --> GetScore3[نمره ۰-۱۰۰ استرس]
    GetScore3 --> Topic4
    
    Topic3 -->|خیر| Topic4{تکنیک فروش فعال؟}
    Topic4 -->|بله| SpeedUp[سرعت ۲x]
    SpeedUp --> GetPrompt4[پرامپت تکنیک فروش]
    GetPrompt4 --> CallAPI4[فراخوانی AI]
    CallAPI4 --> GetScore4[نمره ۰-۱۰۰ تکنیک]
    GetScore4 --> Topic5
    
    Topic4 -->|خیر| Topic5{جملات منفی فعال؟}
    Topic5 -->|بله| DetectNegative[شناسایی جملات منفی]
    DetectNegative --> CountNegative[شمارش]
    CountNegative --> GetScore5[نمره ۰-۱۰۰]
    GetScore5 --> Topic6
    
    Topic5 -->|خیر| Topic6{کالای استراتژیک فعال؟}
    Topic6 -->|بله| GetProducts[دریافت کالاهای استراتژیک]
    GetProducts --> CompareVoice[مقایسه با voice_sample]
    CompareVoice --> DetectForgotten[شناسایی فراموشی]
    DetectForgotten --> CalcOpportunity[محاسبه فرصت ۶-۷ روزه]
    CalcOpportunity --> SaveForgotten[ذخیره در forgotten_key_products]
    SaveForgotten --> Topic6End
    
    Topic6 -->|خیر| Topic6End[پایان موضوعات]
    
    Topic6End --> CalcOverall[محاسبه نمره کلی]
    CalcOverall --> DetectWeakness[شناسایی نقاط ضعف]
    DetectWeakness --> PrioritizeWeakness[اولویت‌بندی ۱-۶]
    PrioritizeWeakness --> CreateExercises[ایجاد تمرین‌های روزانه<br/>۳-۵ تا فقط اولویت اول]
    CreateExercises --> SaveAnalysis[ذخیره analysis_json]
    SaveAnalysis --> UpdateLevel[بروزرسانی سطح کاربر]
    UpdateLevel --> NotifyUser[نوتیفیکیشن به کاربر]
    NotifyUser --> End2([پایان])
```

---

## ۴. فلوچارت درخواست اعتباری و تأیید

```mermaid
flowchart TD
    Start([ورود به وصول → درخواست اعتباری]) --> EnterCode[ورود کد مشتری]
    EnterCode --> CheckCodeDB{کد در DB موجود است؟}
    
    CheckCodeDB -->|خیر| ShowCodeError[خطا: کد مشتری موجود نیست]
    ShowCodeError --> End1([پایان])
    
    CheckCodeDB -->|بله| CheckDebt{بدهی قبلی دارد؟}
    CheckDebt -->|بله| ShowDebtError[خطا: مشتری بدهکار - ممنوع]
    ShowDebtError --> End2([پایان])
    
    CheckDebt -->|خیر| EnterAmount[ورود مبلغ درخواست]
    EnterAmount --> SelectDate[انتخاب تاریخ تسویه]
    SelectDate --> SelectGuarantor[انتخاب ضامن]
    SelectGuarantor --> SubmitRequest[ثبت درخواست<br/>status=pending]
    
    SubmitRequest --> GetApprovalNodes[دریافت رده‌های تأیید<br/>requires_credit_approval=true]
    GetApprovalNodes --> SortNodes[مرتب‌سازی به ترتیب<br/>B → C → D]
    
    SortNodes --> FirstNode[ارسال به رده اول]
    FirstNode --> WaitApproval1{منتظر تأیید رده اول}
    
    WaitApproval1 -->|رد| RejectRequest[status=rejected]
    RejectRequest --> NotifyRejection[نوتیفیکیشن رد]
    NotifyRejection --> End3([پایان])
    
    WaitApproval1 -->|تأیید| SaveConfirm1[ذخیره تأیید در confirmations_json]
    SaveConfirm1 --> CheckMoreNodes{رده دیگری مانده؟}
    
    CheckMoreNodes -->|بله| NextNode[ارسال به رده بعدی]
    NextNode --> WaitApprovalNext{منتظر تأیید}
    WaitApprovalNext -->|رد| RejectRequest
    WaitApprovalNext -->|تأیید| SaveConfirmNext[ذخیره تأیید]
    SaveConfirmNext --> CheckMoreNodes
    
    CheckMoreNodes -->|خیر| AllApproved[همه رده‌ها تأیید کردند]
    AllApproved --> GenerateInvoice[تولید شماره فاکتور<br/>FAC-2025-00123]
    GenerateInvoice --> UpdateStatus[status=approved]
    UpdateStatus --> CreateDebtRecord[ایجاد رکورد در debts<br/>source=app]
    CreateDebtRecord --> NotifySuccess[نوتیفیکیشن موفقیت]
    NotifySuccess --> End4([پایان])
```

---

## ۵. فلوچارت نوتیفیکیشن کالاهای فراموش‌شده (GPS)

```mermaid
flowchart TD
    Start([Background Job]) --> QueryForgotten[Query از forgotten_key_products]
    QueryForgotten --> CheckOpportunity{opportunity_days <= ۶-۷?}
    
    CheckOpportunity -->|خیر| Sleep[Sleep تا دفعه بعد]
    Sleep --> End1([پایان])
    
    CheckOpportunity -->|بله| GetSellerLocation[دریافت موقعیت فروشنده<br/>از GPS فعلی]
    GetSellerLocation --> GetCustomerLocation[دریافت موقعیت مشتری<br/>از customers.location]
    GetCustomerLocation --> CalcDistance[محاسبه فاصله]
    
    CalcDistance --> CheckDistance{فاصله <= ۲۵ متر؟}
    CheckDistance -->|خیر| Sleep
    
    CheckDistance -->|بله| PrepareNotif[آماده‌سازی نوتیفیکیشن]
    PrepareNotif --> GetCustomerHistory[دریافت گزارش پیشین مشتری<br/>کالاها، فروش، رد/ادامه]
    GetCustomerHistory --> PrepareContent[محتوا:<br/>کالا، مشتری، فاصله، گزارش]
    PrepareContent --> SendPWA[ارسال PWA Notification]
    SendPWA --> SendTelegram[ارسال به تلگرام]
    
    SendTelegram --> ShowOptions[نمایش گزینه‌ها:<br/>ادامه / رد]
    ShowOptions --> WaitAction{کاربر کلیک کرد؟}
    
    WaitAction -->|ادامه| UpdateAction[action=continue]
    UpdateAction --> OpenNegotiation[باز کردن فرم مذاکره<br/>با پیش‌پر شده]
    OpenNegotiation --> End2([پایان])
    
    WaitAction -->|رد| UpdateActionReject[action=rejected]
    UpdateActionReject --> End3([پایان])
    
    WaitAction -->|timeout| End4([پایان])
```

---

## ۶. فلوچارت آفلاین Sync

```mermaid
flowchart TD
    Start([کاربر آفلاین می‌شود]) --> DetectOffline[تشخیص آفلاین]
    DetectOffline --> UserRecord{کاربر ویس ضبط می‌کند؟}
    
    UserRecord -->|بله| SaveLocal[ذخیره در localStorage PWA]
    SaveLocal --> AddQueue[افزودن به صف sync]
    AddQueue --> ShowOfflineMsg[نمایش: ذخیره محلی شد]
    ShowOfflineMsg --> WaitOnline[منتظر آنلاین شدن]
    
    WaitOnline --> CheckOnline{آنلاین شد؟}
    CheckOnline -->|خیر| WaitOnline
    
    CheckOnline -->|بله| ShowOnlineMsg[نمایش: اتصال برقرار شد]
    ShowOnlineMsg --> GetQueue[دریافت صف از localStorage]
    GetQueue --> CheckQueueEmpty{صف خالی است؟}
    
    CheckQueueEmpty -->|بله| End1([پایان])
    
    CheckQueueEmpty -->|خیر| GetFirstItem[دریافت اولین آیتم]
    GetFirstItem --> CheckSize{حجم بزرگ؟}
    
    CheckSize -->|بله| ChunkFile[تقسیم به chunk]
    ChunkFile --> SendChunk[ارسال chunk]
    SendChunk --> CheckChunkSuccess{موفق؟}
    CheckChunkSuccess -->|خیر| RetryChunk{retry < 3?}
    RetryChunk -->|بله| SendChunk
    RetryChunk -->|خیر| MarkFailed[علامت‌گذاری failed]
    MarkFailed --> CheckQueueEmpty
    CheckChunkSuccess -->|بله| NextChunk{chunk دیگر؟}
    NextChunk -->|بله| SendChunk
    NextChunk -->|خیر| RemoveFromQueue[حذف از صف]
    RemoveFromQueue --> CheckQueueEmpty
    
    CheckSize -->|خیر| SendDirect[ارسال مستقیم]
    SendDirect --> CheckSuccess{موفق؟}
    CheckSuccess -->|خیر| Retry{retry < 3?}
    Retry -->|بله| SendDirect
    Retry -->|خیر| MarkFailed
    CheckSuccess -->|بله| RemoveFromQueue
```

---

## ۷. فلوچارت گزارش عملکرد با مشتری (سرچ آدرس AI)

```mermaid
flowchart TD
    Start([ورود به گزارشات → عملکرد با مشتری]) --> ShowSearch[نمایش باکس جستجو]
    ShowSearch --> EnterSearch[ورود متن جستجو<br/>نام/صنف/آدرس]
    EnterSearch --> GetUserGPS[دریافت GPS فعلی کاربر]
    GetUserGPS --> SearchDB[جستجو در customers]
    
    SearchDB --> FilterName[فیلتر: name LIKE %search%]
    FilterName --> FilterCategory[فیلتر: type.name LIKE %search%]
    FilterCategory --> FilterAddress[فیلتر: address_text LIKE %search%]
    FilterAddress --> CalcDistances[محاسبه فاصله با GPS]
    CalcDistances --> SortByDistance[مرتب‌سازی بر اساس فاصله]
    SortByDistance --> GetTop5[دریافت ۳-۵ نزدیک‌ترین]
    
    GetTop5 --> ForEachCustomer{برای هر مشتری:}
    ForEachCustomer --> GetVoiceLogs[دریافت voice_logs]
    GetVoiceLogs --> ExtractKeywords[استخراج کالاهای گفته‌شده]
    ExtractKeywords --> CheckForgotten[چک forgotten_key_products]
    CheckForgotten --> CheckSales[چک debts برای فروش]
    CheckSales --> CheckReject[چک action=rejected]
    
    CheckReject --> PrepareSummary[خلاصه:<br/>کالاهای گفته‌شده<br/>فراموش‌شده<br/>فروش<br/>رد/ادامه]
    PrepareSummary --> ShowCustomerCard[نمایش کارت مشتری<br/>با فاصله GPS]
    ShowCustomerCard --> AddContinueBtn[دکمه ادامه مذاکره]
    AddContinueBtn --> ForEachCustomer
    
    ForEachCustomer -->|پایان| ShowResults[نمایش نتایج]
    ShowResults --> UserSelectCustomer{کاربر کلیک ادامه؟}
    
    UserSelectCustomer -->|بله| LoadHistory[بارگذاری گزارش پیشین]
    LoadHistory --> OpenNegotiation[باز کردن فرم مذاکره<br/>با متادیتای مشتری]
    OpenNegotiation --> End1([پایان])
    
    UserSelectCustomer -->|خیر| End2([پایان])
```

---

**تاریخ**: ۱۴۰۳/۰۹/۲۱
**نسخه**: ۱.۰
**وضعیت**: نهایی
