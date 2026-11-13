# دیاگرام موجودیت-رابطه (ERD)
# سیستم ToInfinity

## نسخه ۱.۰

---

## ۱. دیاگرام ERD کامل

```mermaid
erDiagram
    users ||--o{ org_nodes : "belongs_to"
    users ||--o{ users : "manages"
    users ||--o{ voice_logs : "creates"
    users ||--o{ credit_requests : "requests"
    users ||--o{ credit_requests : "guarantees"
    users ||--o{ debts : "has"
    users ||--o{ exercises : "performs"
    users ||--o{ notifications : "receives"
    users ||--o{ user_priorities : "has"
    users ||--o{ forgotten_key_products : "discovers"
    
    org_nodes ||--o{ org_nodes : "has_children"
    org_nodes ||--o{ user_confirmations : "confirms"
    
    product_groups ||--o{ products : "contains"
    brands ||--o{ products : "manufactures"
    products ||--o{ forgotten_key_products : "is_forgotten"
    
    customer_types ||--o{ customers : "categorizes"
    customers ||--o{ voice_logs : "subject_of"
    customers ||--o{ forgotten_key_products : "associated_with"
    
    api_connections }o--|| system_settings : "configured_in"
    ai_prompts }o--|| system_settings : "managed_by"
    
    users {
        int id PK
        string telegram_id UK
        string username UK
        string full_name
        string password_hash
        string role
        boolean active
        string status
        int org_node_id FK
        int manager_id FK
        string phone
        string level
        string language
        bytea voice_signature
        boolean is_first_admin
    }
    
    org_nodes {
        int id PK
        string title
        int parent_id FK
        int level
        boolean requires_credit_approval
    }
    
    user_confirmations {
        int id PK
        int user_id FK
        int confirmed_by_node_id FK
        string type
        timestamp confirmed_at
    }
    
    product_groups {
        int id PK
        string name
    }
    
    brands {
        int id PK
        string name
    }
    
    products {
        int id PK
        string name
        string code UK
        int group_id FK
        int brand_id FK
        boolean is_strategic
        jsonb daily_inventory
        bytea voice_sample
    }
    
    customer_types {
        int id PK
        string name
    }
    
    customers {
        int id PK
        string code UK
        string name
        int type_id FK
        jsonb location
        string address_text
        date credit_lock_until
    }
    
    voice_logs {
        int id PK
        int user_id FK
        int customer_id FK
        jsonb gps
        jsonb meta
        text_array keywords
        jsonb analysis_json
        string ai_model
        timestamp timestamp
    }
    
    credit_requests {
        int id PK
        int user_id FK
        string customer_code
        decimal amount
        date due_date
        int guarantor_user_id FK
        string status
        jsonb confirmations_json
    }
    
    debts {
        int id PK
        int seller_id FK
        string customer_code
        string invoice_number
        decimal amount
        date due_date
        string source
        string status
        string exit_reason
        boolean accountant_confirm
    }
    
    exercises {
        int id PK
        int user_id FK
        int priority
        string topic
        text description
        int daily_count
        int duration_days
    }
    
    notifications {
        int id PK
        int user_id FK
        string type
        boolean read
        timestamp created_at
    }
    
    api_connections {
        int id PK
        string topic
        string model
        string api_key
        string base_url
        boolean is_default
    }
    
    system_settings {
        string key PK
        text value
    }
    
    ai_prompts {
        int id PK
        string topic
        string level
        text prompt
    }
    
    user_priorities {
        int id PK
        int user_id FK
        string topic
        int priority
        int duration_days
        int target_score
    }
    
    forgotten_key_products {
        int id PK
        int user_id FK
        int customer_id FK
        int product_id FK
        timestamp last_mention
        int opportunity_days
        string action
    }
```

---

## ۲. روابط جداول

### ۲.۱ رابطه users

| جدول مقصد | نوع رابطه | توضیح |
|-----------|-----------|-------|
| org_nodes | N:1 | هر کاربر به یک رده تعلق دارد |
| users (manager) | N:1 | هر کاربر یک مدیر دارد |
| voice_logs | 1:N | هر کاربر چندین ویس ضبط می‌کند |
| credit_requests | 1:N | هر کاربر چندین درخواست اعتباری دارد |
| debts | 1:N | هر کاربر (فروشنده) چندین مانده دارد |
| exercises | 1:N | هر کاربر چندین تمرین دارد |
| notifications | 1:N | هر کاربر چندین نوتیفیکیشن دریافت می‌کند |

### ۲.۲ رابطه org_nodes

| جدول مقصد | نوع رابطه | توضیح |
|-----------|-----------|-------|
| org_nodes (parent) | N:1 | درخت سلسله‌مراتبی (self-reference) |
| user_confirmations | 1:N | هر رده چندین تأیید می‌کند |

### ۲.۳ رابطه products

| جدول مقصد | نوع رابطه | توضیح |
|-----------|-----------|-------|
| product_groups | N:1 | هر کالا به یک گروه تعلق دارد |
| brands | N:1 | هر کالا به یک برند تعلق دارد |
| forgotten_key_products | 1:N | کالا در چند مورد فراموش می‌شود |

### ۲.۴ رابطه customers

| جدول مقصد | نوع رابطه | توضیح |
|-----------|-----------|-------|
| customer_types | N:1 | هر مشتری به یک صنف تعلق دارد |
| voice_logs | 1:N | هر مشتری چندین مذاکره دارد |
| forgotten_key_products | 1:N | هر مشتری چندین کالای فراموش شده دارد |

---

## ۳. قوانین یکپارچگی

### ۳.۱ Cascade Delete

- **org_nodes**: اگر رده حذف شود، زیرمجموعه‌ها نباید حذف شوند (محدودیت)
- **users**: اگر کاربر حذف شود، voice_logs نباید حذف شوند (نگه‌داری تاریخچه)
- **products**: اگر کالا حذف شود، forgotten_key_products حذف می‌شوند

### ۳.۲ Cascade Update

- **کد مشتری**: اگر تغییر کند، در debts و credit_requests بروز شود

### ۳.۳ محدودیت‌ها

- **users.telegram_id**: UNIQUE
- **users.username**: UNIQUE
- **products.code**: UNIQUE
- **customers.code**: UNIQUE
- **org_nodes**: parent_id نمی‌تواند خودش باشد (جلوگیری از حلقه)
- **users.manager_id**: نمی‌تواند خودش باشد

---

## ۴. Index‌ها

### ۴.۱ Primary Keys
- همه جداول دارای id به عنوان PK

### ۴.۲ Foreign Keys
- تمام FK‌ها با index برای بهبود عملکرد query

### ۴.۳ Unique Indexes
- users.telegram_id
- users.username
- products.code
- customers.code

### ۴.۴ Performance Indexes
- voice_logs.user_id
- voice_logs.customer_id
- voice_logs.timestamp
- debts.seller_id
- debts.due_date
- notifications.user_id, read
- forgotten_key_products.user_id, opportunity_days

---

## ۵. نوع داده‌ها و محدودیت‌ها

### ۵.۱ JSONB Fields

| جدول | فیلد | ساختار |
|------|------|--------|
| customers | location | {lat: float, lng: float, accuracy: float} |
| voice_logs | gps | {lat: float, lng: float, accuracy: float, link: string} |
| voice_logs | meta | {customer_name: string, category: string, time: string} |
| voice_logs | analysis_json | {score: int, weaknesses: array, details: object} |
| credit_requests | confirmations_json | {node_id: int, confirmed_by: int, at: timestamp}[] |
| products | daily_inventory | {date: string, quantity: int, updated_at: timestamp} |

### ۵.۲ ENUM Types

#### user.role
- USER
- ADMIN

#### user.status
- pending_manager
- active
- suspended

#### user.level
- آماتور
- نیمه‌حرفه‌ای
- حرفه‌ای

#### credit_requests.status
- pending
- approved
- rejected

#### debts.status
- open
- closed

#### debts.source
- app
- excel

#### notifications.type
- over_credit
- expired
- blocked
- manager_alert
- forgotten_product

---

## ۶. Views مفید

### ۶.۱ user_hierarchy_view
```sql
CREATE VIEW user_hierarchy_view AS
SELECT 
    u.id, u.full_name, u.role, u.level,
    o.title AS org_node,
    m.full_name AS manager_name
FROM users u
LEFT JOIN org_nodes o ON u.org_node_id = o.id
LEFT JOIN users m ON u.manager_id = m.id;
```

### ۶.۲ active_debts_view
```sql
CREATE VIEW active_debts_view AS
SELECT 
    d.id, d.customer_code, d.amount, d.due_date,
    u.full_name AS seller_name,
    CASE 
        WHEN d.due_date < CURRENT_DATE THEN 'معوق'
        ELSE 'جاری'
    END AS debt_status
FROM debts d
JOIN users u ON d.seller_id = u.id
WHERE d.status = 'open';
```

### ۶.۳ forgotten_products_alert_view
```sql
CREATE VIEW forgotten_products_alert_view AS
SELECT 
    f.id, p.name AS product_name, c.name AS customer_name,
    u.full_name AS seller_name, f.opportunity_days,
    c.location
FROM forgotten_key_products f
JOIN products p ON f.product_id = p.id
JOIN customers c ON f.customer_id = c.id
JOIN users u ON f.user_id = u.id
WHERE f.opportunity_days <= 7 AND f.action IS NULL;
```

---

**تاریخ**: ۱۴۰۳/۰۹/۲۱
**نسخه**: ۱.۰
**وضعیت**: نهایی
