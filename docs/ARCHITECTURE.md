# S3K Fuse — Architecture Overview

48-hour hackathon MVP for WhatsApp-style food ordering with AI.

## Stack (Phase 1)

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 App Router |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| UI | shadcn/ui (button, input, skeleton) |
| Icons | lucide-react |

**Not yet added:** Supabase, Ollama, API routes, feature pages.

## Target architecture

```
Customer UI (4 pages)
  Landing → Chat → Cart → Checkout
        ↓ fetch()
API Routes (inline Supabase, plain JSON)
        ↓
Supabase Postgres          Ollama qwen3:8b
  8 tables + seed            cart-builder + reply-draft
```

## Folder structure

```
s3k_Fuse/
├── docs/
│   └── ARCHITECTURE.md
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout
│   │   ├── globals.css         # Tailwind + design tokens
│   │   ├── page.tsx            # Landing (Phase 4)
│   │   ├── chat/page.tsx       # Phase 4
│   │   ├── cart/page.tsx       # Phase 4
│   │   ├── checkout/page.tsx   # Phase 4
│   │   └── api/                # Phase 2–3
│   ├── components/
│   │   ├── ui/                   # shadcn primitives
│   │   ├── chat/                 # Phase 4
│   │   ├── cart/                 # Phase 4
│   │   └── checkout/             # Phase 4
│   ├── lib/
│   │   ├── utils.ts              # cn() helper
│   │   ├── format.ts             # Phase 4
│   │   ├── demo.ts               # Phase 2 (seed constants)
│   │   ├── supabase.ts           # Phase 2
│   │   └── ai/                   # Phase 3
│   ├── providers/
│   │   └── cart.tsx              # Phase 5
│   └── types/
│       └── db.ts                   # Phase 2
├── supabase/
│   └── schema.sql                # Phase 2
├── components.json               # shadcn config
└── package.json
```

## Implementation phases

| Phase | Scope |
|-------|--------|
| **1** | Next.js + TS + Tailwind + shadcn + folder scaffold |
| **2** | Supabase schema, types, core API routes |
| **3** | Ollama AI (cart-builder, reply-draft) |
| **4** | UI pages + components |
| **5** | Wire UI to API (end-to-end demo) |
| **6** | Demo hardening (fallbacks, empty states) |

## Design principles

1. **Single data path** — UI calls `/api/*` only; no direct Supabase from client.
2. **No abstractions** — inline Supabase in route handlers; no repository layer.
3. **Smallest working version** — ship the demo path first, polish second.
4. **AI at two touchpoints** — parse order, draft reply. Nothing else.

## Demo flow (target)

```
Landing "Try demo"
  → POST /api/conversations
  → User types Hinglish order
  → POST /api/messages → AI cart-builder → PATCH /api/carts
  → AI reply-draft → assistant bubble + product cards
  → /cart → /checkout → POST /api/orders → success
```
