# معماری نرم‌افزار ToInfinity

**⚠️ SPECIFICATION DOCUMENT - ORIGINAL PLAN**

This document represents the **original architectural specification** from the planning phase. The actual implementation may differ.

**For current, accurate implementation details, see:**
- **[../../ARCHITECTURE_CURRENT.md](../../ARCHITECTURE_CURRENT.md)** - Complete current architecture
- **[../../README.md](../../README.md)** - Documentation index

---

## نسخه ۱.۰

---

## ۱. نمای کلی معماری

### ۱.۱ معماری لایه‌ای (Layered Architecture)

```mermaid
graph TD
    A[Presentation Layer - PWA] --> B[API Gateway]
    B --> C[Application Layer]
    C --> D[Business Logic Layer]
    D --> E[Data Access Layer]
    E --> F[Database - PostgreSQL]
    
    A --> G[Service Worker]
    G --> H[Local Storage / IndexedDB]
    
    C --> I[External Services]
    I --> J[Telegram Bot API]
    I --> K[AI APIs - Grok/GPT]
    I --> L[GPS / Geocoding API]
    I --> M[Email Service]
```

---

## ۲. معماری کامپوننت‌ها

```mermaid
graph TB
    subgraph "Client - PWA"
        UI[UI Components]
        Store[State Management]
        SW[Service Worker]
        Cache[Cache Storage]
    end
    
    subgraph "Backend Services"
        Gateway[API Gateway]
        Auth[Authentication Service]
        Voice[Voice Service]
        AI[AI Analysis Service]
        Credit[Credit Management]
        Report[Reporting Service]
        Notif[Notification Service]
    end
    
    subgraph "External Services"
        Telegram[Telegram Bot]
        AIModels[AI Models]
        GPS[GPS/Geocoding]
        Email[Email]
    end
    
    subgraph "Data Layer"
        DB[(PostgreSQL)]
        Redis[(Redis Cache)]
    end
    
    UI --> Gateway
    Store --> UI
    SW --> Cache
    SW --> Gateway
    
    Gateway --> Auth
    Gateway --> Voice
    Gateway --> AI
    Gateway --> Credit
    Gateway --> Report
    Gateway --> Notif
    
    Voice --> Telegram
    AI --> AIModels
    Voice --> GPS
    Notif --> Telegram
    Notif --> Email
    
    Auth --> DB
    Voice --> DB
    AI --> DB
    Credit --> DB
    Report --> DB
    Notif --> DB
    
    Gateway --> Redis
```

---

## ۳. فلوی داده (Data Flow)

### ۳.۱ جریان ضبط و تحلیل ویس

```mermaid
sequenceDiagram
    participant User
    participant PWA
    participant ServiceWorker
    participant Backend
    participant TelegramBot
    participant AIService
    participant Database
    
    User->>PWA: ضبط ویس
    PWA->>PWA: دریافت GPS
    PWA->>Backend: آدرس AI از GPS
    Backend-->>PWA: آدرس متنی
    
    alt آنلاین
        PWA->>Backend: ارسال متادیتا
        Backend->>TelegramBot: فوروارد ویس
        Backend->>Database: ذخیره متادیتا
        Backend->>AIService: درخواست تحلیل
        AIService-->>Backend: نتیجه تحلیل
        Backend->>Database: ذخیره تحلیل
        Backend-->>PWA: موفق
    else آفلاین
        PWA->>ServiceWorker: ذخیره محلی
        ServiceWorker->>Cache: Queue
        Note over ServiceWorker: منتظر آنلاین
        ServiceWorker->>Backend: Sync بعد آنلاین
    end
```

---

## ۴. معماری امنیت

### ۴.۱ لایه‌های امنیتی

```mermaid
graph TD
    A[HTTPS - TLS 1.3] --> B[API Gateway]
    B --> C[JWT Validation]
    C --> D[Role-Based Access Control]
    D --> E[Data Encryption]
    E --> F[Audit Logging]
    
    G[2FA - Voice Confirmation] --> B
    H[Rate Limiting] --> B
    I[CORS Policy] --> B
```

### ۴.۲ احراز هویت و مجوزدهی

1. **Authentication Flow**:
   - Telegram OAuth
   - JWT Token Generation
   - Refresh Token Mechanism

2. **Authorization**:
   - Role-based (USER, ADMIN)
   - Hierarchical (Manager-Employee)
   - Feature-based (تیک خاموش = غیب کامل)

3. **Data Security**:
   - Encryption at rest (GPS, Customer data)
   - Encryption in transit (HTTPS)
   - No voice storage on server
   - Anonymization for reports

---

## ۵. معماری مقیاس‌پذیری

### ۵.۱ استراتژی Scaling

```mermaid
graph LR
    LB[Load Balancer] --> S1[Server Instance 1]
    LB --> S2[Server Instance 2]
    LB --> S3[Server Instance 3]
    
    S1 --> Cache[Redis Cluster]
    S2 --> Cache
    S3 --> Cache
    
    S1 --> DB[PostgreSQL Primary]
    S2 --> DB
    S3 --> DB
    
    DB --> R1[Read Replica 1]
    DB --> R2[Read Replica 2]
```

### ۵.۲ Caching Strategy

1. **Redis Cache**:
   - User sessions
   - API responses
   - Frequent queries

2. **Browser Cache**:
   - Static assets
   - Service Worker cache
   - LocalStorage for offline data

3. **Database Query Optimization**:
   - Indexes
   - Query optimization
   - Materialized views

---

## ۶. معماری PWA

### ۶.۱ Service Worker Strategy

```mermaid
graph TD
    A[Service Worker] --> B{Request Type?}
    
    B -->|Static Assets| C[Cache First]
    C --> D[Check Cache]
    D -->|Hit| E[Return from Cache]
    D -->|Miss| F[Fetch from Network]
    F --> G[Update Cache]
    G --> E
    
    B -->|API Calls| H[Network First]
    H --> I[Try Network]
    I -->|Success| J[Update Cache]
    J --> K[Return Response]
    I -->|Fail| L[Return from Cache]
    
    B -->|Voice Data| M[Queue Strategy]
    M --> N{Online?}
    N -->|Yes| O[Send Immediately]
    N -->|No| P[Add to Queue]
    P --> Q[Sync when Online]
```

---

## ۷. معماری میکروسرویس‌ها (اختیاری برای آینده)

### ۷.۱ تقسیم به میکروسرویس‌ها

```mermaid
graph TB
    Gateway[API Gateway] --> Auth[Auth Service]
    Gateway --> Voice[Voice Service]
    Gateway --> AI[AI Service]
    Gateway --> Credit[Credit Service]
    Gateway --> Report[Report Service]
    Gateway --> Notif[Notification Service]
    
    Auth --> AuthDB[(Auth DB)]
    Voice --> VoiceDB[(Voice DB)]
    AI --> AIDB[(AI DB)]
    Credit --> CreditDB[(Credit DB)]
    Report --> ReportDB[(Report DB)]
    
    Notif --> MessageQueue[Message Queue]
    MessageQueue --> TelegramWorker[Telegram Worker]
    MessageQueue --> EmailWorker[Email Worker]
```

---

## ۸. API Design

### ۸.۱ RESTful Endpoints

| Method | Endpoint | توضیح |
|--------|----------|-------|
| POST | /auth/telegram | ورود با تلگرام |
| POST | /auth/refresh | Refresh token |
| GET | /users | لیست کاربران |
| GET | /users/:id | جزئیات کاربر |
| POST | /voice/record | ارسال متادیتای ویس |
| POST | /ai/analyze | درخواست تحلیل |
| GET | /ai/results/:id | نتیجه تحلیل |
| POST | /credit/request | درخواست اعتباری |
| POST | /credit/approve | تأیید اعتباری |
| GET | /reports/educational | گزارشات آموزشی |
| GET | /reports/financial | گزارشات مالی |
| POST | /notifications | ارسال نوتیفیکیشن |

### ۸.۲ WebSocket Endpoints

| Event | توضیح |
|-------|-------|
| dashboard:update | بروزرسانی زنده داشبورد |
| notification:new | نوتیفیکیشن جدید |
| debt:alert | هشدار مانده |
| gps:alert | هشدار GPS کالای فراموش شده |

---

## ۹. دیاگرام استقرار (Deployment)

```mermaid
graph TB
    subgraph "Production Environment"
        subgraph "Cloud Server"
            Nginx[Nginx - Reverse Proxy]
            App1[Backend Instance 1]
            App2[Backend Instance 2]
            PWAServ[PWA Static Files]
        end
        
        subgraph "Database Cluster"
            PG[PostgreSQL Primary]
            PG_Replica[PostgreSQL Replica]
        end
        
        subgraph "Cache"
            Redis[Redis Cluster]
        end
        
        subgraph "Monitoring"
            Prometheus[Prometheus]
            Grafana[Grafana]
            Logs[Log Aggregator]
        end
    end
    
    subgraph "External Services"
        Telegram[Telegram]
        AI[AI APIs]
    end
    
    Nginx --> App1
    Nginx --> App2
    Nginx --> PWAServ
    
    App1 --> PG
    App2 --> PG
    App1 --> Redis
    App2 --> Redis
    
    PG --> PG_Replica
    
    App1 --> Telegram
    App2 --> Telegram
    App1 --> AI
    App2 --> AI
    
    App1 --> Prometheus
    App2 --> Prometheus
    Prometheus --> Grafana
```

---

## ۱۰. تکنولوژی‌های پیشنهادی

### ۱۰.۱ Frontend

| Component | Technology | دلیل انتخاب |
|-----------|-----------|------------|
| Framework | React / Vue | PWA support, Community |
| State Management | Redux / Vuex | Centralized state |
| UI Library | Material-UI / Vuetify | RTL support, Persian |
| PWA | Workbox | Service Worker management |
| Build Tool | Vite | Fast build, Modern |

### ۱۰.۲ Backend

| Component | Technology | دلیل انتخاب |
|-----------|-----------|------------|
| Runtime | Node.js / Python | AI integration, Fast |
| Framework | Express / FastAPI | Lightweight, Flexible |
| ORM | Prisma / SQLAlchemy | Type-safe, Migrations |
| API Docs | Swagger / OpenAPI | Auto-generated docs |
| Background Jobs | Bull / Celery | Queue management |

### ۱۰.۳ Database

| Component | Technology | دلیل انتخاب |
|-----------|-----------|------------|
| Primary DB | PostgreSQL 14+ | JSONB support, Reliable |
| Cache | Redis | Fast, In-memory |
| Search | PostgreSQL Full-Text | Built-in, No extra service |

### ۱۰.۴ DevOps

| Component | Technology | دلیل انتخاب |
|-----------|-----------|------------|
| Container | Docker | Consistency |
| Orchestration | Docker Compose / K8s | Scaling |
| CI/CD | GitHub Actions | Integrated |
| Monitoring | Prometheus + Grafana | Open-source, Powerful |
| Logging | ELK / Loki | Centralized logs |

---

**تاریخ**: ۱۴۰۳/۰۹/۲۱
**نسخه**: ۱.۰
**وضعیت**: نهایی
