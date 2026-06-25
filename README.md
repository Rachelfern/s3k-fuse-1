# S3K Fuse – AI-Powered Conversational Commerce Platform

S3K Fuse is a full-stack AI commerce platform that enables customers to order products through natural language conversations while providing businesses with intelligent order management, payment verification, shipment tracking, and customer support workflows.

Built with Next.js, TypeScript, Supabase, and LLM-powered automation, the platform combines conversational shopping with real-world commerce operations.

## Features

### Customer Experience

- AI-powered chat ordering using natural language
- Product recommendations and guided shopping
- Cart management and checkout flow
- UPI payment support with QR code workflow
- Payment screenshot upload and verification
- Order tracking and status updates
- Return request initiation and tracking
- Customer onboarding experience

### Admin Experience

- Product inventory management
- Add and edit products
- Customer conversation management
- Order management dashboard
- Shipment tracking and status updates
- Return request processing
- Payment verification workflows
- Support escalation and issue prioritization

### AI Capabilities

- Conversational product discovery
- Order intent detection
- Cart building from customer messages
- Product recommendation engine
- Customer support assistance
- Conversation summarization
- Issue classification and prioritization

### Privacy & Compliance

- Customer consent management
- Data export requests
- Account deletion workflows
- DPDP compliance support
- Privacy policy management

## Tech Stack

### Frontend

- Next.js 15
- TypeScript
- Tailwind CSS
- shadcn/ui

### Backend

- Next.js API Routes
- Supabase PostgreSQL
- Supabase Storage

### AI

- Groq LLM APIs
- Ollama (local development)
- Custom conversation workflows

### Database

- PostgreSQL
- Relational commerce schema
- Order lifecycle management
- Customer and conversation tracking

## Architecture

```
Customer UI     →  Next.js App Router
API Layer       →  Next.js Route Handlers
Data Layer      →  Supabase PostgreSQL
AI Layer        →  Groq / Ollama
Storage         →  Supabase Storage
```

## Core Workflows

### Conversational Ordering

```
Customer Message  →  Intent Detection  →  Product Search
                 →  Cart Generation   →  AI Response  →  Checkout
```

### Order Lifecycle

```
Order Creation  →  Payment Verification  →  Shipment Processing
             →  Delivery Tracking      →  Return Management
```

### Support Operations

```
Customer Query  →  AI Classification  →  Priority Assignment
             →  Admin Review       →  Resolution
```

## Local Setup

```bash
git clone https://github.com/Rachelfern/s3k-fuse.git
cd s3k-fuse

npm install

cp .env.example .env.local

npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GROQ_API_KEY=
```

## Future Enhancements

- WhatsApp integration
- Real-time notifications
- Multi-vendor support
- Analytics dashboard
- Voice ordering
- Advanced recommendation models

## License

MIT License

