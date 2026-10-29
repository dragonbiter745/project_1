# FoodCourt — Multi-Vendor QR Order & Pay POS

[![Frontend · Customer](https://github.com/dragonbiter745/project_1/actions/workflows/frontend-customer.yml/badge.svg?branch=main)](https://github.com/dragonbiter745/project_1/actions/workflows/frontend-customer.yml) [![Frontend · Landing](https://github.com/dragonbiter745/project_1/actions/workflows/frontend-landing.yml/badge.svg?branch=main)](https://github.com/dragonbiter745/project_1/actions/workflows/frontend-landing.yml) [![Frontend · Vendor](https://github.com/dragonbiter745/project_1/actions/workflows/frontend-vendor.yml/badge.svg?branch=main)](https://github.com/dragonbiter745/project_1/actions/workflows/frontend-vendor.yml) [![Frontend · Master admin](https://github.com/dragonbiter745/project_1/actions/workflows/frontend-master.yml/badge.svg?branch=main)](https://github.com/dragonbiter745/project_1/actions/workflows/frontend-master.yml) [![Backend · Cloud Functions](https://github.com/dragonbiter745/project_1/actions/workflows/backend-functions.yml/badge.svg?branch=main)](https://github.com/dragonbiter745/project_1/actions/workflows/backend-functions.yml) [![Firebase · Rules & indexes](https://github.com/dragonbiter745/project_1/actions/workflows/firebase-rules.yml/badge.svg?branch=main)](https://github.com/dragonbiter745/project_1/actions/workflows/firebase-rules.yml)

> **Startup Vision:** A multi-vendor food court mobile ordering platform inspired by Toast "Mobile Order & Pay". One QR code per table lets customers browse all court shops (Roll Me, Siddi Vinayaka Garden), build a unified multi-shop cart, pay once, and kitchen tickets are routed in real-time to each vendor's KDS tablet.

---

## 🏗 Architecture & Workspace Setup

```
REVA-NEST/
├── AGENTS.md                      # Antigravity agent strict guidelines
├── docs/
│   ├── PRD.md                     # Product Requirements Document (v1.0)
│   ├── architecture.md            # Architecture Decision Records (ADRs)
│   ├── runbook.md                 # Incident response & operational runbook
│   ├── menus/                     # Seed menus (Roll Me & Siddi Vinayaka Garden)
│   └── qr/                        # Printable table QR sheets (A4 PDF)
├── apps/
│   ├── customer/ (Port 5173)      # Mobile-first diner PWA (order.<domain>)
│   ├── vendor/ (Port 5174)        # Tablet KDS & kitchen management (vendor.<domain>)
│   └── master/ (Port 5175)        # Central food court operations & live ops
├── packages/
│   ├── shared/                    # Domain types, Zod schemas, integer paise money math
│   ├── ui/                        # Reusable design tokens, buttons, badges, veg dots
│   └── firebase-client/           # Firestore converters & local cross-tab reactive store
├── functions/                     # Cloud Functions v2 (Node 20 / TypeScript)
├── firebase/                      # firestore.rules, indexes, storage.rules, emulators
└── scripts/                       # Database seed scripts & QR code generator
```

---

## 🚀 Quickstart

### 1. Install dependencies
```bash
pnpm install
```

### 2. Run all three applications concurrently
```bash
pnpm dev
```

- **Customer PWA (Diner App):** [http://localhost:5173](http://localhost:5173)
- **Vendor Dashboard (KDS):** [http://localhost:5174](http://localhost:5174)
- **Master Admin (Ops):** [http://localhost:5175](http://localhost:5175)

---

## 💡 Key Design & Engineering Rules
1. **Money is always integer paise:** Never use floats for monetary values. 100 paise = 1 INR.
2. **Server-authoritative state:** The client never writes orders, prices, sub-orders, or points. Everything is verified against database menus.
3. **Multi-Vendor Single Cart:** Diners can order dishes from both Roll Me and Siddi Vinayaka Garden in one single payment.
4. **Idempotency:** Unique `checkoutKey` ensures double taps never create duplicate orders.
5. **Real-time Cross-Tab Synchronization:** Instant sync across Customer, Vendor KDS, and Master Admin out-of-the-box.
6. **Role-Based Security:** Granular Firebase rules isolate diner, vendor, and master admin access.
