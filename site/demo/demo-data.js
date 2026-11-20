/* Helmshell demo: fictional sample data (homelab "homelab", user "alex").
   Everything here is invented. Dates are relative to "now" so the demo always looks fresh.
   Classic script: defines window.HelmshellDemoData(lang) → the initial in-memory state used by demo-shim.js. */
(function () {
  'use strict';

  window.HelmshellDemoData = function build(lang) {
    const FR = lang === 'fr';
    const L = (fr, en) => (FR ? fr : en);
    const NOW = Math.floor(Date.now() / 1000);
    const min = (m) => NOW - Math.round(m * 60);
    const iso = (m) => new Date(min(m) * 1000).toISOString();
    const HOME = '/home/alex';
    const ROOT = `${HOME}/projects`;

    // Small deterministic hash (commit ids, uuids): same data on every reload
    const hex = (seed, n) => {
      let h1 = 0x811c9dc5, out = '';
      for (let i = 0; out.length < n; i++) {
        for (const c of `${seed}:${i}`) { h1 ^= c.charCodeAt(0); h1 = Math.imul(h1, 16777619) >>> 0; }
        out += h1.toString(16).padStart(8, '0');
      }
      return out.slice(0, n);
    };
    const uuid = (seed) => { const x = hex(seed, 32); return `${x.slice(0, 8)}-${x.slice(8, 12)}-4${x.slice(13, 16)}-a${x.slice(17, 20)}-${x.slice(20, 32)}`; };

    /* ---------------------------------------------------------------- files */
    const F = {};

    F.atlas = {
      'README.md': `# Atlas

Atlas is the team dashboard for our homelab projects: what is deployed, who touched it last,
and what is waiting for a review.

<img src="public/logo.svg" alt="Atlas logo" width="64" height="64">

## Stack

- **Next.js 15** (App Router) and **React 19**
- **Prisma** on PostgreSQL
- **Tailwind CSS**
- Deployed with **Coolify** at \`atlas.example.com\`

## Getting started

\`\`\`bash
cp .env.example .env
npm install
npx prisma migrate dev
npm run dev
\`\`\`

| Command | What it does |
| --- | --- |
| \`npm run dev\` | Dev server on port 3000 |
| \`npm test\` | Unit tests (Vitest) |
| \`npm run lint\` | ESLint + type check |
`,
      'CLAUDE.md': `# Atlas

Team dashboard for the homelab projects (Next.js 15, Prisma, PostgreSQL).

## Rules

- TypeScript strict mode: no \`any\`, no non-null assertions.
- Server components by default; add \`"use client"\` only when the component needs state.
- Data access goes through \`lib/\` (never call Prisma from a component).
- Every change to \`lib/\` comes with a test in \`tests/\`.
- Run \`npm test\` and \`npm run lint\` before saying a task is done.

## Useful commands

- \`npm run dev\`: dev server (port 3000)
- \`npm test\`: Vitest
- \`npx prisma studio\`: browse the database
`,
      'package.json': `{
  "name": "atlas",
  "version": "1.8.2",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint && tsc --noEmit",
    "test": "vitest run",
    "db:migrate": "prisma migrate deploy"
  },
  "dependencies": {
    "@prisma/client": "^6.1.0",
    "next": "^15.1.3",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "@types/react": "^19.0.2",
    "eslint": "^9.17.0",
    "prisma": "^6.1.0",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
`,
      'next.config.mjs': `/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  images: { remotePatterns: [{ protocol: 'https', hostname: '*.example.com' }] },
};

export default nextConfig;
`,
      'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "strict": true,
    "noEmit": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
`,
      'tailwind.config.ts': `import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { brand: { 50: '#eefbf7', 500: '#14a37f', 700: '#0b6b54' } },
    },
  },
} satisfies Config;
`,
      'prisma/schema.prisma': `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Project {
  id          String    @id @default(cuid())
  slug        String    @unique
  name        String
  description String?
  deployedAt  DateTime?
  owner       User      @relation(fields: [ownerId], references: [id])
  ownerId     String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model User {
  id       String    @id @default(cuid())
  email    String    @unique
  name     String
  projects Project[]
}
`,
      'app/layout.tsx': `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Atlas',
  description: 'What is running in the homelab, at a glance',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
`,
      'app/globals.css': `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: light dark;
}
`,
      'app/page.tsx': `import Link from 'next/link';
import { getStats } from '@/lib/projects';

export default async function Home() {
  const stats = await getStats();
  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-3xl font-semibold">Atlas</h1>
      <p className="mt-2 text-slate-600">{stats.projects} projects · {stats.deployed} deployed this week</p>
      <Link className="mt-6 inline-block text-brand-700 underline" href="/projects">
        Browse projects
      </Link>
    </main>
  );
}
`,
      'app/projects/page.tsx': `import { getProjects } from '@/lib/projects';
import { Pagination } from '@/components/Pagination';
import { ProjectCard } from '@/components/ProjectCard';

type Props = { searchParams: Promise<{ page?: string }> };

export default async function ProjectsPage({ searchParams }: Props) {
  const { page } = await searchParams;
  const current = Math.max(1, Number(page) || 1);
  const { items, pages } = await getProjects({ page: current, perPage: 20 });

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-semibold">Projects</h1>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {items.map((p) => (
          <li key={p.id}>
            <ProjectCard project={p} />
          </li>
        ))}
      </ul>
      <Pagination page={current} pages={pages} />
    </main>
  );
}
`,
      'components/ProjectCard.tsx': `import type { Project } from '@prisma/client';

export function ProjectCard({ project }: { project: Project }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-medium">{project.name}</h2>
      {project.description && <p className="mt-1 text-sm text-slate-600">{project.description}</p>}
      <p className="mt-3 text-xs text-slate-500">
        {project.deployedAt ? \`Deployed \${project.deployedAt.toLocaleDateString()}\` : 'Never deployed'}
      </p>
    </article>
  );
}
`,
      'components/Pagination.tsx': `import Link from 'next/link';

type Props = { page: number; pages: number };

export function Pagination({ page, pages }: Props) {
  if (pages <= 1) return null;
  const prev = page > 1 ? page - 1 : null;
  const next = page < pages ? page + 1 : null;
  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-between text-sm">
      {prev ? <Link href={\`?page=\${prev}\`}>← Previous</Link> : <span />}
      <span className="text-slate-500">
        Page {page} of {pages}
      </span>
      {next ? <Link href={\`?page=\${next}\`}>Next →</Link> : <span />}
    </nav>
  );
}
`,
      'lib/db.ts': `import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
`,
      'lib/projects.ts': `import { db } from './db';

export type Page<T> = { items: T[]; pages: number; total: number };

export async function getProjects({ page = 1, perPage = 20 } = {}): Promise<Page<Awaited<ReturnType<typeof db.project.findMany>>[number]>> {
  const take = Math.min(Math.max(perPage, 1), 100);
  const skip = (Math.max(page, 1) - 1) * take;
  const [items, total] = await Promise.all([
    db.project.findMany({ orderBy: { updatedAt: 'desc' }, skip, take }),
    db.project.count(),
  ]);
  return { items, total, pages: Math.max(1, Math.ceil(total / take)) };
}

export async function getStats() {
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const [projects, deployed] = await Promise.all([
    db.project.count(),
    db.project.count({ where: { deployedAt: { gte: weekAgo } } }),
  ]);
  return { projects, deployed };
}
`,
      'tests/projects.test.ts': `import { describe, expect, it, vi } from 'vitest';
import { getProjects } from '@/lib/projects';
import { db } from '@/lib/db';

vi.mock('@/lib/db', () => ({
  db: { project: { findMany: vi.fn(async () => []), count: vi.fn(async () => 45) } },
}));

describe('getProjects', () => {
  it('returns the first 20 projects by default', async () => {
    const page = await getProjects();
    expect(db.project.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 20 }));
    expect(page.pages).toBe(3);
  });

  it('skips the previous pages', async () => {
    await getProjects({ page: 3 });
    expect(db.project.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 40 }));
  });

  it('caps the page size at 100', async () => {
    await getProjects({ perPage: 5000 });
    expect(db.project.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
  });
});
`,
      'public/logo.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#14a37f"/><path d="M32 12 50 50H14z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><circle cx="32" cy="38" r="5" fill="#fff"/></svg>
`,
      'Dockerfile': `FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
`,
      '.env.example': `DATABASE_URL=postgresql://atlas:change-me@localhost:5432/atlas
NEXT_PUBLIC_SITE_URL=http://localhost:3000
`,
      '.gitignore': `node_modules/
.next/
.env
*.log
`,
      'package-lock.json': { size: 318204, text: '{\n  "name": "atlas",\n  "version": "1.8.2",\n  "lockfileVersion": 3,\n  "requires": true,\n  "packages": { "…": "(trimmed in the demo)" }\n}\n' },
    };

    F.ledger = {
      'README.md': `# Ledger API

Small invoicing API used by the homelab services (FastAPI + PostgreSQL + Redis).

## Run it

\`\`\`bash
docker compose up -d db redis
uv sync
uv run fastapi dev app/main.py
\`\`\`

The OpenAPI docs are served at \`/docs\`.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | \`/invoices\` | List invoices (paginated) |
| POST | \`/invoices\` | Create an invoice |
| GET | \`/invoices/{id}\` | One invoice |
| POST | \`/invoices/{id}/pay\` | Mark as paid |
| GET | \`/health\` | Liveness probe |
`,
      'CLAUDE.md': `# Ledger API

FastAPI service with SQLAlchemy 2 (async), Alembic migrations, PostgreSQL and Redis.

## Rules

- Type hints everywhere, \`ruff\` and \`mypy --strict\` must pass.
- New endpoints need a test in \`tests/\` (pytest + httpx AsyncClient).
- Money is stored in cents (\`int\`), never floats.
- Migrations: \`uv run alembic revision --autogenerate -m "..."\`, review before committing.

## Commands

- \`uv run pytest\`: tests
- \`uv run ruff check . && uv run mypy app\`: lint
`,
      'pyproject.toml': `[project]
name = "ledger-api"
version = "0.9.4"
requires-python = ">=3.12"
dependencies = [
    "fastapi[standard]>=0.115",
    "sqlalchemy[asyncio]>=2.0.36",
    "asyncpg>=0.30",
    "alembic>=1.14",
    "redis>=5.2",
    "pydantic-settings>=2.7",
]

[dependency-groups]
dev = ["pytest>=8.3", "pytest-asyncio>=0.25", "httpx>=0.28", "ruff>=0.8", "mypy>=1.14"]

[tool.ruff]
line-length = 110

[tool.pytest.ini_options]
asyncio_mode = "auto"
`,
      'app/__init__.py': '',
      'app/main.py': `from contextlib import asynccontextmanager

from fastapi import FastAPI

from .db import engine
from .routers import health, invoices


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(title="Ledger API", version="0.9.4", lifespan=lifespan)
app.include_router(health.router)
app.include_router(invoices.router, prefix="/invoices", tags=["invoices"])
`,
      'app/db.py': `from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .settings import settings

engine = create_async_engine(settings.database_url, pool_size=10, pool_pre_ping=True)
Session = async_sessionmaker(engine, expire_on_commit=False)


async def get_session():
    async with Session() as session:
        yield session
`,
      'app/settings.py': `from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://ledger:change-me@localhost:5432/ledger"
    redis_url: str = "redis://localhost:6379/0"
    page_size: int = 50


settings = Settings()
`,
      'app/models.py': `from datetime import datetime

from sqlalchemy import ForeignKey, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(200), unique=True)
    invoices: Mapped[list["Invoice"]] = relationship(back_populates="customer")


class Invoice(Base):
    __tablename__ = "invoices"
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    amount_cents: Mapped[int]
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    paid_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    customer: Mapped[Customer] = relationship(back_populates="invoices")
`,
      'app/routers/__init__.py': '',
      'app/routers/health.py': `from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
`,
      'app/routers/invoices.py': `from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Invoice
from ..settings import settings

router = APIRouter()


class InvoiceIn(BaseModel):
    customer_id: int
    amount_cents: int = Field(gt=0)
    currency: str = Field(default="EUR", min_length=3, max_length=3)


class InvoiceOut(InvoiceIn):
    id: int
    paid_at: datetime | None


@router.get("", response_model=list[InvoiceOut])
async def list_invoices(page: int = 1, session: AsyncSession = Depends(get_session)):
    query = select(Invoice).order_by(Invoice.id.desc())
    query = query.offset((page - 1) * settings.page_size).limit(settings.page_size)
    return (await session.scalars(query)).all()


@router.post("", response_model=InvoiceOut, status_code=201)
async def create_invoice(data: InvoiceIn, session: AsyncSession = Depends(get_session)):
    invoice = Invoice(**data.model_dump())
    session.add(invoice)
    await session.commit()
    return invoice


@router.post("/{invoice_id}/pay", response_model=InvoiceOut)
async def pay_invoice(invoice_id: int, session: AsyncSession = Depends(get_session)):
    invoice = await session.get(Invoice, invoice_id)
    if invoice is None:
        raise HTTPException(404, "Invoice not found")
    if invoice.paid_at is None:
        invoice.paid_at = datetime.now(UTC)
        await session.commit()
    return invoice
`,
      'tests/test_invoices.py': `async def test_create_and_pay(client):
    r = await client.post("/invoices", json={"customer_id": 1, "amount_cents": 4200})
    assert r.status_code == 201
    invoice = r.json()
    assert invoice["paid_at"] is None

    r = await client.post(f"/invoices/{invoice['id']}/pay")
    assert r.status_code == 200
    assert r.json()["paid_at"] is not None


async def test_amount_must_be_positive(client):
    r = await client.post("/invoices", json={"customer_id": 1, "amount_cents": 0})
    assert r.status_code == 422
`,
      'tests/conftest.py': `import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
`,
      'alembic.ini': `[alembic]
script_location = alembic
sqlalchemy.url = driver://user:pass@localhost/dbname
`,
      'alembic/env.py': `from alembic import context

from app.models import Base

target_metadata = Base.metadata
`,
      'Dockerfile': `FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY . .
EXPOSE 8000
CMD ["uv", "run", "fastapi", "run", "app/main.py", "--port", "8000"]
`,
      'docker-compose.yml': `services:
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: ledger
      POSTGRES_PASSWORD: change-me
    volumes: [pgdata:/var/lib/postgresql/data]
    ports: ["5432:5432"]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

volumes:
  pgdata:
`,
      'uv.lock': { size: 142880, text: 'version = 1\nrequires-python = ">=3.12"\n\n# (trimmed in the demo)\n' },
      '.gitignore': '.venv/\n__pycache__/\n.env\n.pytest_cache/\n',
    };

    F.tidy = {
      'README.md': `# tidy

\`tidy\` sorts the files of a folder into subfolders, following simple rules.

\`\`\`bash
tidy ~/Downloads                 # apply the rules once
tidy --watch ~/Downloads         # keep watching the folder
tidy --dry-run ~/Downloads       # show what would move
\`\`\`

## Rules

Rules live in \`~/.config/tidy/rules.toml\`:

\`\`\`toml
[[rule]]
match = ["*.pdf", "*.epub"]
to = "Documents"

[[rule]]
match = ["*.png", "*.jpg", "*.webp"]
to = "Pictures/{year}"
\`\`\`

## Install

\`\`\`bash
go install example.com/alex/tidy@latest
\`\`\`
`,
      'AGENTS.md': `# tidy

Go CLI (Go 1.23, cobra) that moves files into folders according to rules.

## Rules

- Standard library first; the only dependencies are cobra and BurntSushi/toml.
- \`go vet ./...\` and \`go test ./...\` must pass.
- Never delete a user file: moves only, and never overwrite (add a suffix).
- Table-driven tests for anything in \`internal/rules\`.
`,
      'go.mod': `module example.com/alex/tidy

go 1.23

require (
	github.com/BurntSushi/toml v1.4.0
	github.com/fsnotify/fsnotify v1.8.0
	github.com/spf13/cobra v1.8.1
)
`,
      'go.sum': { size: 2318, text: 'github.com/BurntSushi/toml v1.4.0 h1:…\n(trimmed in the demo)\n' },
      'main.go': `package main

import "example.com/alex/tidy/cmd"

func main() {
	cmd.Execute()
}
`,
      'cmd/root.go': `package cmd

import (
	"fmt"
	"os"

	"example.com/alex/tidy/internal/rules"
	"github.com/spf13/cobra"
)

var (
	dryRun bool
	watch  bool
)

var rootCmd = &cobra.Command{
	Use:   "tidy [folder]",
	Short: "Sort the files of a folder into subfolders",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		set, err := rules.Load(rules.DefaultPath())
		if err != nil {
			return err
		}
		if watch {
			return watchFolder(args[0], set)
		}
		moved, err := rules.Apply(args[0], set, dryRun)
		for _, m := range moved {
			fmt.Printf("%s → %s\\n", m.From, m.To)
		}
		return err
	},
}

func Execute() {
	rootCmd.Flags().BoolVar(&dryRun, "dry-run", false, "show what would move, without moving anything")
	rootCmd.Flags().BoolVarP(&watch, "watch", "w", false, "keep watching the folder")
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}
`,
      'cmd/watch.go': `package cmd

import (
	"log"
	"time"

	"example.com/alex/tidy/internal/rules"
	"github.com/fsnotify/fsnotify"
)

// watchFolder applies the rules each time files settle in the folder (debounced).
func watchFolder(dir string, set rules.Set) error {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	defer w.Close()
	if err := w.Add(dir); err != nil {
		return err
	}
	var timer *time.Timer
	for {
		select {
		case ev := <-w.Events:
			if ev.Has(fsnotify.Create) || ev.Has(fsnotify.Rename) {
				if timer != nil {
					timer.Stop()
				}
				timer = time.AfterFunc(800*time.Millisecond, func() {
					if _, err := rules.Apply(dir, set, dryRun); err != nil {
						log.Printf("tidy: %v", err)
					}
				})
			}
		case err := <-w.Errors:
			log.Printf("watch: %v", err)
		}
	}
}
`,
      'internal/rules/rules.go': `package rules

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/BurntSushi/toml"
)

type Rule struct {
	Match []string \`toml:"match"\`
	To    string   \`toml:"to"\`
}

type Set struct {
	Rules []Rule \`toml:"rule"\`
}

type Move struct{ From, To string }

func DefaultPath() string {
	dir, _ := os.UserConfigDir()
	return filepath.Join(dir, "tidy", "rules.toml")
}

func Load(path string) (Set, error) {
	var s Set
	_, err := toml.DecodeFile(path, &s)
	return s, err
}

// Target returns the folder a file goes to, or "" when no rule matches.
func (s Set) Target(name string, info os.FileInfo) string {
	for _, r := range s.Rules {
		for _, pattern := range r.Match {
			if ok, _ := filepath.Match(pattern, strings.ToLower(name)); ok {
				year := strconv.Itoa(info.ModTime().Year())
				return strings.ReplaceAll(r.To, "{year}", year)
			}
		}
	}
	return ""
}
`,
      'internal/rules/rules_test.go': `package rules

import (
	"os"
	"testing"
	"time"
)

type fakeInfo struct{ os.FileInfo }

func (fakeInfo) ModTime() time.Time { return time.Date(2024, 5, 1, 0, 0, 0, 0, time.UTC) }

func TestTarget(t *testing.T) {
	set := Set{Rules: []Rule{
		{Match: []string{"*.pdf"}, To: "Documents"},
		{Match: []string{"*.png", "*.jpg"}, To: "Pictures/{year}"},
	}}
	cases := map[string]string{
		"report.PDF":  "Documents",
		"holiday.jpg": "Pictures/2024",
		"notes.txt":   "",
	}
	for name, want := range cases {
		if got := set.Target(name, fakeInfo{}); got != want {
			t.Errorf("Target(%q) = %q, want %q", name, got, want)
		}
	}
}
`,
      'Makefile': `.PHONY: build test lint release

build:
	go build -o bin/tidy .

test:
	go test ./...

lint:
	go vet ./...

release:
	goreleaser release --clean
`,
      '.goreleaser.yaml': `builds:
  - env: [CGO_ENABLED=0]
    goos: [linux, darwin, windows]
    goarch: [amd64, arm64]
archives:
  - formats: [tar.gz]
    format_overrides:
      - goos: windows
        formats: [zip]
`,
      '.gitignore': 'bin/\ndist/\n',
    };

    F.handbook = {
      'README.md': `# Homelab handbook

The documentation of the homelab: how things are wired, how to back them up, and what to do when
something breaks at 2 a.m. Built with [Astro Starlight](https://starlight.astro.build).

\`\`\`bash
npm install
npm run dev
\`\`\`

Published at **docs.example.com** by Coolify on every push to \`main\`.
`,
      'CLAUDE.md': `# Homelab handbook

Astro Starlight site. Content lives in \`src/content/docs/\` (Markdown).

## Rules

- Write for "future me at 2 a.m.": short steps, exact commands, expected output.
- One page per topic; link pages together rather than repeating.
- Never put a real password, token or public IP in the docs: use \`192.168.1.x\` and \`example.com\`.
- \`npm run build\` must pass (it checks internal links).
`,
      'package.json': `{
  "name": "handbook",
  "type": "module",
  "version": "0.0.1",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "check-links": "astro build && linkinator dist --recurse"
  },
  "dependencies": {
    "@astrojs/starlight": "^0.30.3",
    "astro": "^5.1.1",
    "sharp": "^0.33.5"
  },
  "devDependencies": {
    "linkinator": "^6.1.2"
  }
}
`,
      'astro.config.mjs': `import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://docs.example.com',
  integrations: [
    starlight({
      title: 'Homelab handbook',
      sidebar: [
        { label: 'Start here', items: ['index', 'getting-started'] },
        { label: 'Operations', items: ['backups', 'networking', 'incidents'] },
      ],
    }),
  ],
});
`,
      'src/content/docs/index.md': `---
title: Homelab handbook
description: Everything about the homelab, in one place.
---

Welcome! This handbook covers the machines, the services they run and the routines that keep them healthy.

- **New here?** Start with [Getting started](/getting-started/).
- **Something is down?** Go to [Incidents](/incidents/).
`,
      'src/content/docs/getting-started.md': `---
title: Getting started
---

## The machines

| Name | Role | Address |
| --- | --- | --- |
| homelab | Main server (Coolify, Helmshell) | 192.168.1.10 |
| nas | Storage and backups | 192.168.1.20 |
| pi | DNS and monitoring | 192.168.1.30 |

## Access

Everything is reachable on the LAN or through the VPN. Ask for an account on the VPN first.
`,
      'src/content/docs/backups.md': `---
title: Backups
---

Backups run every night at 03:00 with \`restic\`, to the NAS and then to an offsite bucket.

\`\`\`bash
restic -r sftp:nas:/backups/homelab snapshots
restic -r sftp:nas:/backups/homelab restore latest --target /tmp/restore --include /srv/data/atlas
\`\`\`

Check the last run on the [status page](https://status.example.com).
`,
      'src/content/docs/networking.md': `---
title: Networking
---

- LAN: \`192.168.1.0/24\`, DHCP and DNS on \`pi\`.
- Reverse proxy: Traefik (managed by Coolify), certificates from Let's Encrypt.
- Public names: \`*.example.com\` point to the router, which forwards 80/443 to \`homelab\`.
`,
      'src/content/docs/incidents.md': `---
title: Incidents
---

1. Open Helmshell, **Home** page: anything red is listed under *To do*.
2. Check the app in **Deployments** (logs, last deployment).
3. Roll back from the project's **Deploy** tab if the last deployment broke it.
4. Write what happened at the bottom of this page.
`,
      'public/favicon.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#6750A4"/><path d="M18 16h20l8 8v24H18z" fill="#fff"/><path d="M24 30h16M24 37h16M24 44h10" stroke="#6750A4" stroke-width="3"/></svg>
`,
      '.gitignore': 'node_modules/\ndist/\n.astro/\n',
    };

    F.stack = {
      'README.md': `# homelab-stack

Docker Compose stack for the shared services of the homelab: Postgres, Redis, Uptime Kuma, Prometheus,
Grafana and an nginx front for the internal tools.

\`\`\`bash
cp .env.example .env    # then edit the passwords
make up                 # docker compose up -d
make logs s=grafana     # follow one service
\`\`\`

Volumes live under \`/srv/data/\` and are backed up every night (see the handbook).
`,
      'CLAUDE.md': `# homelab-stack

Compose file for the shared services. Changes here restart production services: be careful.

## Rules

- Pin every image to a major version (\`postgres:17\`, not \`latest\`).
- Secrets come from \`.env\` (never committed). Add new variables to \`.env.example\`.
- Run \`docker compose config -q\` to validate before saying a change is done.
- Never run \`docker compose down -v\` (it deletes the volumes).
`,
      'docker-compose.yml': `name: homelab

services:
  postgres:
    image: postgres:17
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
    volumes: [/srv/data/postgres:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    volumes: [/srv/data/redis:/data]

  uptime-kuma:
    image: louislam/uptime-kuma:1
    restart: unless-stopped
    volumes: [/srv/data/uptime-kuma:/app/data]
    ports: ["3001:3001"]

  prometheus:
    image: prom/prometheus:v3.0.1
    restart: unless-stopped
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - /srv/data/prometheus:/prometheus

  grafana:
    image: grafana/grafana:11.4.0
    restart: unless-stopped
    environment:
      GF_SECURITY_ADMIN_PASSWORD: \${GRAFANA_PASSWORD}
    volumes: [/srv/data/grafana:/var/lib/grafana]
    depends_on: [prometheus]

  nginx:
    image: nginx:1.27-alpine
    restart: unless-stopped
    volumes: [./nginx/nginx.conf:/etc/nginx/nginx.conf:ro]
    ports: ["8080:80"]
`,
      '.env.example': `POSTGRES_PASSWORD=change-me
GRAFANA_PASSWORD=change-me
`,
      'nginx/nginx.conf': `events {}

http {
  server {
    listen 80;
    location /grafana/ { proxy_pass http://grafana:3000/; }
    location /status/  { proxy_pass http://uptime-kuma:3001/; }
  }
}
`,
      'monitoring/prometheus.yml': `global:
  scrape_interval: 30s

scrape_configs:
  - job_name: node
    static_configs:
      - targets: ["192.168.1.10:9100", "192.168.1.20:9100", "192.168.1.30:9100"]
  - job_name: cadvisor
    static_configs:
      - targets: ["192.168.1.10:8081"]
`,
      'scripts/backup.sh': `#!/usr/bin/env bash
# Nightly backup of /srv/data with restic (called by a systemd timer at 03:00).
set -euo pipefail

export RESTIC_REPOSITORY="sftp:nas:/backups/homelab"
export RESTIC_PASSWORD_FILE="$HOME/.config/restic/password"

docker compose -f "$(dirname "$0")/../docker-compose.yml" exec -T postgres \\
  pg_dumpall -U postgres > /srv/data/postgres-dump.sql

restic backup /srv/data --exclude /srv/data/prometheus --tag nightly
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
`,
      'Makefile': `up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f $(s)

pull:
	docker compose pull && docker compose up -d
`,
      '.gitignore': '.env\n',
    };

    F.garden = {
      'README.md': `# Pocket Garden

A small Flutter app to remember when to water the plants (Android and iOS).

- One card per plant, with its watering rhythm
- Reminders through local notifications
- Sync between phones with Firebase (optional)

\`\`\`bash
flutter pub get
flutter run
\`\`\`
`,
      'pubspec.yaml': `name: pocket_garden
description: Remember when to water the plants.
version: 0.4.0+12
publish_to: none

environment:
  sdk: ">=3.5.0 <4.0.0"

dependencies:
  flutter:
    sdk: flutter
  firebase_core: ^3.8.1
  cloud_firestore: ^5.6.0
  flutter_local_notifications: ^18.0.1
  intl: ^0.19.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^5.0.0

flutter:
  uses-material-design: true
`,
      'analysis_options.yaml': 'include: package:flutter_lints/flutter.yaml\n',
      'lib/main.dart': `import 'package:flutter/material.dart';

import 'screens/garden_screen.dart';

void main() {
  runApp(const PocketGarden());
}

class PocketGarden extends StatelessWidget {
  const PocketGarden({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Pocket Garden',
      theme: ThemeData(colorSchemeSeed: const Color(0xFF366A35), useMaterial3: true),
      darkTheme: ThemeData(colorSchemeSeed: const Color(0xFF366A35), brightness: Brightness.dark, useMaterial3: true),
      home: const GardenScreen(),
    );
  }
}
`,
      'lib/models/plant.dart': `class Plant {
  const Plant({required this.name, required this.everyDays, required this.lastWatered});

  final String name;
  final int everyDays;
  final DateTime lastWatered;

  DateTime get nextWatering => lastWatered.add(Duration(days: everyDays));

  bool isThirsty(DateTime now) => !now.isBefore(nextWatering);

  Plant watered(DateTime when) => Plant(name: name, everyDays: everyDays, lastWatered: when);
}
`,
      'lib/screens/garden_screen.dart': `import 'package:flutter/material.dart';

import '../models/plant.dart';

class GardenScreen extends StatefulWidget {
  const GardenScreen({super.key});

  @override
  State<GardenScreen> createState() => _GardenScreenState();
}

class _GardenScreenState extends State<GardenScreen> {
  final _plants = <Plant>[
    Plant(name: 'Basil', everyDays: 2, lastWatered: DateTime.now().subtract(const Duration(days: 2))),
    Plant(name: 'Monstera', everyDays: 7, lastWatered: DateTime.now().subtract(const Duration(days: 3))),
  ];

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    return Scaffold(
      appBar: AppBar(title: const Text('My garden')),
      body: ListView(
        children: [
          for (final (i, p) in _plants.indexed)
            ListTile(
              leading: Icon(p.isThirsty(now) ? Icons.water_drop : Icons.eco),
              title: Text(p.name),
              subtitle: Text('Every \${p.everyDays} days'),
              trailing: IconButton(
                icon: const Icon(Icons.check),
                onPressed: () => setState(() => _plants[i] = p.watered(now)),
              ),
            ),
        ],
      ),
    );
  }
}
`,
      'test/plant_test.dart': `import 'package:flutter_test/flutter_test.dart';
import 'package:pocket_garden/models/plant.dart';

void main() {
  test('a plant is thirsty after its watering rhythm', () {
    final p = Plant(name: 'Basil', everyDays: 2, lastWatered: DateTime(2024, 5, 1));
    expect(p.isThirsty(DateTime(2024, 5, 2)), isFalse);
    expect(p.isThirsty(DateTime(2024, 5, 3)), isTrue);
  });
}
`,
      'android/app/build.gradle': `android {
    namespace "com.example.pocketgarden"
    compileSdk 35

    defaultConfig {
        applicationId "com.example.pocketgarden"
        minSdk 23
        targetSdk 35
        versionCode flutterVersionCode.toInteger()
        versionName flutterVersionName
    }
}
`,
      'ios/Runner/Info.plist': `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>Pocket Garden</string>
  <key>CFBundleIdentifier</key>
  <string>com.example.pocketgarden</string>
</dict>
</plist>
`,
      'assets/icon.png': { size: 18342, binary: true },
      '.gitignore': '.dart_tool/\nbuild/\n.flutter-plugins\n.flutter-plugins-dependencies\n',
    };

    /* ----------------------------------------------------------------- git */
    // [minutes ago, author, message, refs, files touched [[path, +, -]]]
    const ALEX = 'Alex Martin', SAM = 'Sam Rivera', BOT = 'Renovate Bot';
    const commits = (slug, list) => list.map(([m, author, msg, refs, files], i) => {
      const hash = hex(`${slug}-${i}-${msg}`, 40);
      return { hash, short: hash.slice(0, 7), author, email: `${author.split(' ')[0].toLowerCase()}@example.com`, when: min(m), refs: refs || '', msg, files: files || null };
    });

    const P = [];

    P.push({
      slug: 'atlas-web', name: 'Atlas', files: F.atlas, heavy: ['node_modules', '.next'],
      description: L('Tableau de bord de l’équipe : ce qui tourne, qui l’a modifié, ce qui attend une relecture.', 'Team dashboard: what is running, who changed it, what is waiting for a review.'),
      tags: ['TypeScript', 'Next.js', 'React', 'Tailwind CSS', 'Prisma', 'PostgreSQL', 'Docker', 'Node.js'], platforms: ['Web'],
      size: 612 * 1024 * 1024, mtime: min(9), icon: { color: ['#14a37f', '#0b6b54'], glyph: 'atlas' },
      remote: 'https://git.example.com/alex/atlas.git', app: 'atlas', commandsSaved: [{ label: 'Dev server', cmd: 'npm run dev' }, { label: 'Tests', cmd: 'npm test' }],
      git: {
        branch: 'main', ahead: 1, behind: 0, upstream: true, fetched: min(2),
        changes: [
          { kind: 'M', path: 'app/projects/page.tsx', add: 9, del: 4 },
          { kind: 'M', path: 'lib/projects.ts', add: 14, del: 3 },
          { kind: 'A', path: 'components/Pagination.tsx', add: 23, del: 0 },
          { kind: 'M', path: 'tests/projects.test.ts', add: 21, del: 2 },
        ],
        local: [['main', true, 'origin/main', 34], ['feat/dark-mode', false, 'origin/feat/dark-mode', 60 * 26], ['fix/session-timeout', false, '', 60 * 50]],
        remoteBranches: ['origin/renovate/next-15.x', 'origin/release/1.8'],
        log: commits('atlas', [
          [34, ALEX, 'Show the deployment date on project cards', 'HEAD -> main', [['components/ProjectCard.tsx', 6, 1]]],
          [60 * 3, SAM, 'Add getStats() for the home page', 'origin/main, origin/HEAD', [['lib/projects.ts', 11, 0], ['app/page.tsx', 4, 2]]],
          [60 * 5, ALEX, 'Use the standalone output in the Docker image', '', [['Dockerfile', 7, 3], ['next.config.mjs', 1, 0]]],
          [60 * 22, BOT, 'Update dependency next to v15.1.3', '', [['package.json', 1, 1], ['package-lock.json', 38, 38]]],
          [60 * 26, ALEX, 'Project cards: description and owner', 'feat/dark-mode', [['components/ProjectCard.tsx', 12, 2]]],
          [60 * 30, SAM, 'Prisma: add deployedAt to Project', '', [['prisma/schema.prisma', 1, 0]]],
          [60 * 49, ALEX, 'Move the Prisma client to lib/db.ts', '', [['lib/db.ts', 7, 0], ['lib/projects.ts', 2, 4]]],
          [60 * 52, ALEX, 'Tailwind brand colors', '', [['tailwind.config.ts', 3, 0]]],
          [60 * 75, SAM, 'Projects page (first version)', '', [['app/projects/page.tsx', 26, 0]]],
          [60 * 98, ALEX, 'Home page with a link to the projects', '', [['app/page.tsx', 18, 0]]],
          [60 * 120, ALEX, 'Prisma schema: Project and User', '', [['prisma/schema.prisma', 26, 0]]],
          [60 * 145, BOT, 'Update dependency typescript to v5.7.2', '', [['package.json', 1, 1]]],
          [60 * 170, ALEX, 'Dockerfile for Coolify', '', [['Dockerfile', 17, 0]]],
          [60 * 196, ALEX, 'ESLint and strict TypeScript', '', [['tsconfig.json', 4, 1], ['package.json', 2, 1]]],
          [60 * 240, ALEX, 'Initial commit: Next.js 15 app router', 'tag: v0.1.0', [['package.json', 22, 0], ['app/layout.tsx', 15, 0]]],
        ]),
      },
      // Interactive terminal sessions (tmux) of the project
      repo: { claude: { alive: true, status: 'busy', rc: true, created: min(47), since: min(1), context: { used: 38, size: 200000, tokens: 76000 } } },
      history: {
        claude: [
          { title: L('Pagination de la page /projects', 'Pagination for the /projects page'), m: 6, prompts: 3 },
          { title: L('Pourquoi le build Docker échoue sur Coolify ?', 'Why does the Docker build fail on Coolify?'), m: 60 * 5, prompts: 5 },
          { title: L('Ajoute la date de déploiement sur les cartes', 'Show the deployment date on the cards'), m: 60 * 26, prompts: 2 },
          { title: L('Migration Prisma pour deployedAt', 'Prisma migration for deployedAt'), m: 60 * 30, prompts: 4 },
        ],
      },
    });

    P.push({
      slug: 'ledger-api', name: 'Ledger API', files: F.ledger, heavy: ['.venv', '__pycache__', '.pytest_cache'],
      description: L('API de facturation des services du homelab (FastAPI, PostgreSQL, Redis).', 'Invoicing API for the homelab services (FastAPI, PostgreSQL, Redis).'),
      tags: ['Python', 'FastAPI', 'PostgreSQL', 'Redis', 'Docker'], platforms: ['Web'],
      size: 214 * 1024 * 1024, mtime: min(18), icon: { color: ['#0061A4', '#003a63'], glyph: 'ledger' },
      remote: 'https://git.example.com/alex/ledger-api.git', app: 'ledger',
      git: {
        branch: 'main', ahead: 0, behind: 2, upstream: true, fetched: min(4), changes: [],
        local: [['main', true, 'origin/main', 60 * 2], ['feat/refunds', false, 'origin/feat/refunds', 60 * 30]],
        remoteBranches: ['origin/dependabot/uv/fastapi-0.115.6'],
        log: commits('ledger', [
          [60 * 2, ALEX, 'Invoices: mark as paid is idempotent', 'HEAD -> main, origin/main', [['app/routers/invoices.py', 6, 3], ['tests/test_invoices.py', 9, 0]]],
          [60 * 7, ALEX, 'Health endpoint for Coolify', '', [['app/routers/health.py', 8, 0], ['app/main.py', 2, 1]]],
          [60 * 28, SAM, 'Pagination with settings.page_size', '', [['app/routers/invoices.py', 4, 1], ['app/settings.py', 1, 0]]],
          [60 * 30, SAM, 'WIP refunds model', 'feat/refunds', [['app/models.py', 14, 0]]],
          [60 * 53, ALEX, 'Store money in cents', '', [['app/models.py', 2, 2], ['app/routers/invoices.py', 3, 3]]],
          [60 * 76, ALEX, 'Alembic setup', '', [['alembic.ini', 3, 0], ['alembic/env.py', 5, 0]]],
          [60 * 100, ALEX, 'Async SQLAlchemy session', '', [['app/db.py', 11, 0]]],
          [60 * 124, ALEX, 'First endpoints: list and create invoices', '', [['app/routers/invoices.py', 30, 0]]],
          [60 * 150, ALEX, 'Initial commit', 'tag: v0.1.0', [['pyproject.toml', 20, 0], ['app/main.py', 8, 0]]],
        ]),
      },
      repo: { claude: { alive: true, status: 'idle', rc: false, created: min(60 * 3), since: min(14), context: { used: 61, size: 200000, tokens: 122000 } } },
      // Background session (claude remote-control) waiting for a Yes / No answer
      headless: { phase: 'question', question: L('Lancer `uv run alembic upgrade head` sur la base de dev ? [y/N]', 'Run `uv run alembic upgrade head` on the dev database? [y/N]'), started: min(23), mode: 'default', url: 'https://claude.ai/code/session_01demoLedger7Kq' },
      history: {
        claude: [
          { title: L('Rendre « payer une facture » idempotent', 'Make "pay invoice" idempotent'), m: 60 * 2 + 10, prompts: 4 },
          { title: L('Ajoute un endpoint /health pour Coolify', 'Add a /health endpoint for Coolify'), m: 60 * 7 + 5, prompts: 2 },
          { title: L('Revue de la migration des montants en centimes', 'Review the money-in-cents migration'), m: 60 * 53, prompts: 6 },
        ],
      },
    });

    P.push({
      slug: 'tidy', name: 'tidy', files: F.tidy, heavy: ['bin'],
      description: L('Petit outil en ligne de commande qui range un dossier selon des règles.', 'Small command-line tool that sorts a folder according to rules.'),
      tags: ['Go'], platforms: ['Linux', 'macOS', 'Windows'],
      size: 18 * 1024 * 1024, mtime: min(41), icon: { color: ['#00ADD8', '#00739a'], glyph: 'tidy' },
      remote: 'https://git.example.com/alex/tidy.git', app: '',
      commandsSaved: [{ label: 'Build', cmd: 'make build' }, { label: 'Tests', cmd: 'go test ./...' }],
      git: {
        branch: 'feat/watch-mode', ahead: 2, behind: 0, upstream: true, fetched: min(30),
        changes: [{ kind: 'M', path: 'cmd/watch.go', add: 6, del: 2 }],
        local: [['main', false, 'origin/main', 60 * 20], ['feat/watch-mode', true, 'origin/feat/watch-mode', 41], ['fix/symlinks', false, '', 60 * 4]],
        remoteBranches: [],
        log: commits('tidy', [
          [41, ALEX, 'watch: debounce events (800 ms)', 'HEAD -> feat/watch-mode', [['cmd/watch.go', 9, 2]]],
          [60 * 2, ALEX, 'Add --watch with fsnotify', 'origin/feat/watch-mode', [['cmd/watch.go', 38, 0], ['go.mod', 1, 0]]],
          [60 * 20, ALEX, 'Add --dry-run', 'origin/main, main', [['cmd/root.go', 8, 2]]],
          [60 * 44, ALEX, 'Rules: {year} placeholder', '', [['internal/rules/rules.go', 3, 1], ['internal/rules/rules_test.go', 6, 0]]],
          [60 * 70, ALEX, 'goreleaser config', 'tag: v0.3.0', [['.goreleaser.yaml', 12, 0]]],
          [60 * 96, ALEX, 'Table-driven tests for Target()', '', [['internal/rules/rules_test.go', 24, 0]]],
          [60 * 140, ALEX, 'Initial commit', 'tag: v0.1.0', [['main.go', 7, 0], ['cmd/root.go', 30, 0]]],
        ]),
      },
      repo: { codex: { alive: true, created: min(52) } },
      copies: [{ branch: 'fix/symlinks', changes: 2, ahead: 1, behind: 0, when: min(60 * 4), subject: 'Skip symlinks instead of following them', claude: false }],
      history: {
        codex: [
          { title: L('Ajoute un mode --watch avec fsnotify', 'Add a --watch mode with fsnotify'), m: 52, prompts: 3 },
          { title: L('Ajoute un flag --dry-run', 'Add a --dry-run flag'), m: 60 * 20, prompts: 2 },
        ],
        claude: [{ title: L('Tests table-driven pour Target()', 'Table-driven tests for Target()'), m: 60 * 96, prompts: 2 }],
      },
    });

    P.push({
      slug: 'handbook', name: L('Manuel du homelab', 'Homelab handbook'), files: F.handbook, heavy: ['node_modules', 'dist'],
      description: L('La documentation du homelab : schémas, sauvegardes, que faire quand tout casse à 2 h du matin.', 'The homelab docs: how things are wired, backups, what to do when it breaks at 2 a.m.'),
      tags: ['Astro', 'TypeScript', 'Node.js'], platforms: ['Web'],
      size: 96 * 1024 * 1024, mtime: min(60 * 6), icon: { color: ['#6750A4', '#3f2d78'], glyph: 'book' },
      remote: 'https://git.example.com/alex/handbook.git', app: 'docs',
      git: {
        branch: 'main', ahead: 0, behind: 0, upstream: true, fetched: min(60 * 6),
        changes: [{ kind: 'M', path: 'src/content/docs/backups.md', add: 4, del: 1 }],
        local: [['main', true, 'origin/main', 60 * 6]], remoteBranches: [],
        log: commits('handbook', [
          [60 * 6, SAM, 'Incidents: first steps', 'HEAD -> main, origin/main', [['src/content/docs/incidents.md', 12, 0]]],
          [60 * 29, ALEX, 'Backups: restore one folder', '', [['src/content/docs/backups.md', 6, 1]]],
          [60 * 54, ALEX, 'Networking page', '', [['src/content/docs/networking.md', 9, 0]]],
          [60 * 80, ALEX, 'Starlight sidebar', '', [['astro.config.mjs', 8, 2]]],
          [60 * 130, ALEX, 'Initial commit (Astro Starlight)', '', [['package.json', 18, 0]]],
        ]),
      },
      history: { claude: [{ title: L('Vérifie les liens internes', 'Check the internal links'), m: 60 * 9, prompts: 2 }] },
    });

    P.push({
      slug: 'homelab-stack', name: 'homelab-stack', files: F.stack, heavy: [],
      description: L('Services partagés en Docker Compose : Postgres, Redis, Uptime Kuma, Prometheus, Grafana.', 'Shared services with Docker Compose: Postgres, Redis, Uptime Kuma, Prometheus, Grafana.'),
      tags: ['Docker', 'PostgreSQL', 'Redis', 'Nginx', 'Shell'], platforms: ['Linux'],
      size: 3 * 1024 * 1024, mtime: min(60 * 11), icon: { color: ['#2496ED', '#0b5ea8'], glyph: 'stack' },
      remote: 'https://git.example.com/alex/homelab-stack.git', app: 'status',
      commandsSaved: [{ label: 'Validate', cmd: 'docker compose config -q' }, { label: 'Pull and restart', cmd: 'make pull' }],
      git: {
        branch: 'main', ahead: 0, behind: 0, upstream: true, fetched: min(60 * 11), changes: [],
        local: [['main', true, 'origin/main', 60 * 11]], remoteBranches: [],
        log: commits('stack', [
          [60 * 11, ALEX, 'Grafana 11.4', 'HEAD -> main, origin/main', [['docker-compose.yml', 1, 1]]],
          [60 * 34, ALEX, 'Prometheus: scrape the NAS and the Pi', '', [['monitoring/prometheus.yml', 2, 1]]],
          [60 * 58, ALEX, 'Nightly restic backup script', '', [['scripts/backup.sh', 14, 0]]],
          [60 * 140, ALEX, 'Initial stack', '', [['docker-compose.yml', 48, 0]]],
        ]),
      },
      history: { claude: [{ title: L('Inventaire de nettoyage', 'Cleanup inventory'), m: 60 * 3, prompts: 1 }] },
    });

    P.push({
      slug: 'pocket-garden', name: 'Pocket Garden', files: F.garden, heavy: ['.dart_tool', 'build'],
      description: L('Appli Flutter pour ne plus oublier d’arroser les plantes.', 'Flutter app to stop forgetting to water the plants.'),
      tags: ['Flutter', 'Dart', 'Firebase'], platforms: ['Android', 'iOS'],
      size: 1.3 * 1024 * 1024 * 1024, mtime: min(60 * 30), icon: { color: ['#366A35', '#1e451d'], glyph: 'leaf' },
      remote: '', app: '',
      git: {
        branch: 'main', ahead: 0, behind: 0, upstream: false, fetched: 0,
        changes: [{ kind: 'M', path: 'lib/screens/garden_screen.dart', add: 3, del: 1 }, { kind: 'A', path: 'assets/icon.png', add: 0, del: 0 }],
        local: [['main', true, '', 60 * 30]], remoteBranches: [],
        log: commits('garden', [
          [60 * 30, ALEX, 'Watering button on each plant', 'HEAD -> main', [['lib/screens/garden_screen.dart', 8, 2]]],
          [60 * 55, ALEX, 'Plant model and first test', '', [['lib/models/plant.dart', 14, 0], ['test/plant_test.dart', 10, 0]]],
          [60 * 140, ALEX, 'flutter create', '', [['pubspec.yaml', 24, 0], ['lib/main.dart', 22, 0]]],
        ]),
      },
      history: { claude: [{ title: L('Notifications locales pour l’arrosage', 'Local notifications for watering'), m: 60 * 31, prompts: 3 }] },
    });

    // Explicit diffs for the working-tree changes shown first in the Git tab
    const DIFFS = {
      'atlas-web:lib/projects.ts': `diff --git a/lib/projects.ts b/lib/projects.ts
index 3f1c2a9..8be41d0 100644
--- a/lib/projects.ts
+++ b/lib/projects.ts
@@ -1,13 +1,24 @@
 import { db } from './db';

-export async function getProjects() {
-  return db.project.findMany({ orderBy: { updatedAt: 'desc' } });
-}
+export type Page<T> = { items: T[]; pages: number; total: number };
+
+export async function getProjects({ page = 1, perPage = 20 } = {}): Promise<Page<Awaited<ReturnType<typeof db.project.findMany>>[number]>> {
+  const take = Math.min(Math.max(perPage, 1), 100);
+  const skip = (Math.max(page, 1) - 1) * take;
+  const [items, total] = await Promise.all([
+    db.project.findMany({ orderBy: { updatedAt: 'desc' }, skip, take }),
+    db.project.count(),
+  ]);
+  return { items, total, pages: Math.max(1, Math.ceil(total / take)) };
+}

 export async function getStats() {
   const weekAgo = new Date(Date.now() - 7 * 86400_000);
`,
      'atlas-web:app/projects/page.tsx': `diff --git a/app/projects/page.tsx b/app/projects/page.tsx
index 9a0b1e2..c43d7f1 100644
--- a/app/projects/page.tsx
+++ b/app/projects/page.tsx
@@ -1,15 +1,20 @@
 import { getProjects } from '@/lib/projects';
+import { Pagination } from '@/components/Pagination';
 import { ProjectCard } from '@/components/ProjectCard';

-export default async function ProjectsPage() {
-  const projects = await getProjects();
+type Props = { searchParams: Promise<{ page?: string }> };
+
+export default async function ProjectsPage({ searchParams }: Props) {
+  const { page } = await searchParams;
+  const current = Math.max(1, Number(page) || 1);
+  const { items, pages } = await getProjects({ page: current, perPage: 20 });

   return (
     <main className="mx-auto max-w-5xl p-8">
       <h1 className="text-2xl font-semibold">Projects</h1>
       <ul className="mt-6 grid gap-4 sm:grid-cols-2">
-        {projects.map((p) => (
+        {items.map((p) => (
           <li key={p.id}>
             <ProjectCard project={p} />
           </li>
         ))}
       </ul>
+      <Pagination page={current} pages={pages} />
     </main>
   );
 }
`,
      'tidy:cmd/watch.go': `diff --git a/cmd/watch.go b/cmd/watch.go
index 51d0c3e..a7e92b4 100644
--- a/cmd/watch.go
+++ b/cmd/watch.go
@@ -24,12 +24,16 @@ func watchFolder(dir string, set rules.Set) error {
 		select {
 		case ev := <-w.Events:
-			if ev.Op&fsnotify.Create != 0 {
-				rules.Apply(dir, set, dryRun)
+			if ev.Has(fsnotify.Create) || ev.Has(fsnotify.Rename) {
+				if timer != nil {
+					timer.Stop()
+				}
+				timer = time.AfterFunc(800*time.Millisecond, func() {
+					if _, err := rules.Apply(dir, set, dryRun); err != nil {
+						log.Printf("tidy: %v", err)
+					}
+				})
 			}
 		case err := <-w.Errors:
 			log.Printf("watch: %v", err)
`,
      'handbook:src/content/docs/backups.md': `diff --git a/src/content/docs/backups.md b/src/content/docs/backups.md
index 0c2e7b1..5a9f3d2 100644
--- a/src/content/docs/backups.md
+++ b/src/content/docs/backups.md
@@ -2,9 +2,12 @@
 title: Backups
 ---

-Backups run every night with \`restic\`.
+Backups run every night at 03:00 with \`restic\`, to the NAS and then to an offsite bucket.

 \`\`\`bash
 restic -r sftp:nas:/backups/homelab snapshots
+restic -r sftp:nas:/backups/homelab restore latest --target /tmp/restore --include /srv/data/atlas
 \`\`\`
+
+Check the last run on the [status page](https://status.example.com).
`,
      'pocket-garden:lib/screens/garden_screen.dart': `diff --git a/lib/screens/garden_screen.dart b/lib/screens/garden_screen.dart
index 2b7d4e0..e01f9c3 100644
--- a/lib/screens/garden_screen.dart
+++ b/lib/screens/garden_screen.dart
@@ -26,7 +26,9 @@ class _GardenScreenState extends State<GardenScreen> {
             ListTile(
-              leading: const Icon(Icons.eco),
+              leading: Icon(p.isThirsty(now) ? Icons.water_drop : Icons.eco),
               title: Text(p.name),
               subtitle: Text('Every \${p.everyDays} days'),
+              trailing: IconButton(
+                icon: const Icon(Icons.check),
`,
    };

    /* ------------------------------------------------------- background tasks */
    const TASKS = [
      {
        id: `${min(9)}-a1b2c3`, slug: 'atlas-web', agent: 'claude', mode: 'acceptEdits', kind: '', started: min(9), status: 'running',
        prompt: L('Ajoute un mode sombre qui suit le réglage du système, avec un bouton pour forcer clair ou sombre. Garde les contrastes AA.',
          'Add a dark mode that follows the system setting, with a toggle to force light or dark. Keep AA contrast.'),
        events: [
          { k: 'text', t: L('Je regarde d’abord comment les couleurs sont définies.', 'Let me first look at how the colors are defined.') },
          { k: 'tool', name: 'Read', detail: 'tailwind.config.ts' },
          { k: 'tool', name: 'Read', detail: 'app/layout.tsx' },
          { k: 'tool', name: 'Grep', detail: 'bg-slate-50|text-slate-900' },
          { k: 'text', t: L('Tailwind est en mode `media` par défaut : je passe en `class` pour permettre le bouton.', 'Tailwind uses `media` by default: switching to `class` so the toggle can work.') },
          { k: 'tool', name: 'Edit', detail: 'tailwind.config.ts' },
          { k: 'tool', name: 'Write', detail: 'components/ThemeToggle.tsx' },
        ],
        later: [
          { k: 'tool', name: 'Edit', detail: 'app/layout.tsx' },
          { k: 'tool', name: 'Bash', detail: 'npm run lint' },
          { k: 'text', t: L('Le lint passe. J’ajoute les variantes `dark:` aux cartes de projet.', 'Lint passes. Adding `dark:` variants to the project cards.') },
          { k: 'tool', name: 'Edit', detail: 'components/ProjectCard.tsx' },
          { k: 'tool', name: 'Bash', detail: 'npm test' },
        ],
      },
      {
        id: `${min(60 * 2)}-d4e5f6`, slug: 'ledger-api', agent: 'claude', mode: 'acceptEdits', kind: '', started: min(60 * 2 + 14), finished: min(60 * 2 + 3), status: 'ok',
        prompt: L('Mets à jour les dépendances et corrige les avertissements de dépréciation des tests.', 'Update the dependencies and fix the deprecation warnings in the tests.'),
        events: [
          { k: 'tool', name: 'Bash', detail: 'uv lock --upgrade' },
          { k: 'tool', name: 'Bash', detail: 'uv run pytest -q' },
          { k: 'text', t: L('3 avertissements : `datetime.utcnow()` est déprécié.', '3 warnings: `datetime.utcnow()` is deprecated.') },
          { k: 'tool', name: 'Edit', detail: 'app/routers/invoices.py' },
          { k: 'tool', name: 'Bash', detail: 'uv run pytest -q' },
        ],
        result: { error: false, turns: 9, duration: 642, cost: 0.41, text: L(
          '## Dépendances à jour\n\n- **fastapi** 0.115.2 → 0.115.6\n- **sqlalchemy** 2.0.35 → 2.0.36\n- **pytest-asyncio** 0.24 → 0.25\n\nLes avertissements venaient de `datetime.utcnow()` : remplacé par `datetime.now(UTC)` dans `app/routers/invoices.py`.\n\n`uv run pytest` : **14 tests passent**, plus aucun avertissement. Rien n’est validé : les changements t’attendent dans l’onglet Git.',
          '## Dependencies updated\n\n- **fastapi** 0.115.2 → 0.115.6\n- **sqlalchemy** 2.0.35 → 2.0.36\n- **pytest-asyncio** 0.24 → 0.25\n\nThe warnings came from `datetime.utcnow()`: replaced with `datetime.now(UTC)` in `app/routers/invoices.py`.\n\n`uv run pytest`: **14 tests pass**, no warnings left. Nothing is committed: the changes are waiting in the Git tab.') },
      },
      {
        id: `${min(60 * 3)}-0c1e2a`, slug: 'homelab-stack', agent: 'claude', mode: 'plan', kind: 'clean-report', started: min(60 * 3 + 6), finished: min(60 * 3), status: 'ok',
        prompt: 'Take stock of what is no longer needed in this project, without modifying or deleting anything:',
        events: [
          { k: 'tool', name: 'Bash', detail: 'git ls-files' },
          { k: 'tool', name: 'Read', detail: 'docker-compose.yml' },
          { k: 'tool', name: 'Grep', detail: 'GRAFANA_|POSTGRES_' },
        ],
        result: { error: false, turns: 4, duration: 214, text: L(
          '## Inventaire\n\n**Sûr à supprimer**\n- `nginx/nginx.conf` : bloc `location /status/` en double avec Uptime Kuma exposé sur 3001.\n\n**À vérifier**\n- `Makefile` : la cible `down` n’est plus utilisée (voir CLAUDE.md : jamais de `down -v`).\n\n**À garder**\n- `scripts/backup.sh` : appelé par le timer systemd.\n\nRien n’a été modifié.',
          '## Inventory\n\n**Safe to delete**\n- `nginx/nginx.conf`: the `location /status/` block duplicates Uptime Kuma exposed on 3001.\n\n**To check**\n- `Makefile`: the `down` target is no longer used (see CLAUDE.md: never `down -v`).\n\n**Keep**\n- `scripts/backup.sh`: called by the systemd timer.\n\nNothing was modified.') },
      },
      {
        id: `${min(60 * 9)}-7f8e9d`, slug: 'handbook', agent: 'codex', mode: 'auto', kind: '', started: min(60 * 9 + 4), finished: min(60 * 9), status: 'error',
        prompt: L('Vérifie tous les liens internes du site et corrige ceux qui sont cassés.', 'Check every internal link of the site and fix the broken ones.'),
        events: [
          { k: 'tool', name: 'shell', detail: 'npm run check-links' },
          { k: 'text', t: L('`linkinator` n’est pas installé : `npm install` a besoin du réseau, refusé par le bac à sable.', '`linkinator` is not installed: `npm install` needs the network, refused by the sandbox.') },
        ],
        result: { error: true, turns: 3, duration: 96, text: L(
          'Impossible de lancer la vérification : `npm install` demande un accès réseau, refusé en mode **Automatique**. Relance la tâche en **Accès complet**, ou installe les dépendances d’abord (`npm install`).',
          'Could not run the check: `npm install` needs network access, which **Automatic** mode refuses. Retry with **Full access**, or install the dependencies first (`npm install`).') },
      },
      {
        id: `${min(60 * 20)}-3b4c5d`, slug: 'tidy', agent: 'codex', mode: 'auto', kind: '', started: min(60 * 20 + 7), finished: min(60 * 20 + 1), status: 'ok',
        prompt: L('Ajoute un flag --dry-run qui affiche les déplacements sans rien toucher, avec un test.', 'Add a --dry-run flag that prints the moves without touching anything, with a test.'),
        events: [
          { k: 'tool', name: 'shell', detail: 'rg -n "Apply\\(" --type go' },
          { k: 'tool', name: 'apply_patch', detail: 'cmd/root.go' },
          { k: 'tool', name: 'shell', detail: 'go test ./...' },
        ],
        result: { error: false, turns: 6, duration: 371, text: L(
          'Ajouté `--dry-run` (`cmd/root.go`) : `rules.Apply` reçoit le drapeau et ne fait que lister les déplacements. `go test ./...` passe.',
          'Added `--dry-run` (`cmd/root.go`): `rules.Apply` receives the flag and only lists the moves. `go test ./...` passes.') },
      },
    ];

    /* ------------------------------------------------------------- activity */
    const ACTIVITY = [
      [3, L('Tâche confiée à Claude sur Atlas : Ajoute un mode sombre qui suit le réglage du système', 'Task given to Claude on Atlas: Add a dark mode that follows the system setting'), 'claude', 'atlas-web'],
      [23, L('Session Claude démarrée sur Ledger API (mode Demander à chaque action)', 'Claude session started on Ledger API (mode Ask before each action)'), 'claude', 'ledger-api'],
      [34, L('Commit « Show the deployment date on project cards » sur atlas-web', 'Commit "Show the deployment date on project cards" on atlas-web'), 'git', 'atlas-web'],
      [47, L('Session tmux « atlas-web » ouverte (Atlas)', 'tmux session "atlas-web" opened (Atlas)'), 'claude', 'atlas-web'],
      [52, L('Session tmux « codex-tidy » ouverte (tidy)', 'tmux session "codex-tidy" opened (tidy)'), 'claude', 'tidy'],
      [60 * 2, L('Commit « Invoices: mark as paid is idempotent » sur ledger-api', 'Commit "Invoices: mark as paid is idempotent" on ledger-api'), 'git', 'ledger-api'],
      [60 * 2 - 5, L('Déploiement de ledger-api lancé sur Coolify', 'Deployment of ledger-api started on Coolify'), 'deploy', null],
      [60 * 4, L('Connexion à Helmshell depuis 192.168.1.23', 'Signed in to Helmshell from 192.168.1.23'), 'login', null],
      [60 * 6, L('Domaine mis à jour : https://docs.example.com', 'Domain updated: https://docs.example.com'), 'domain', 'handbook'],
      [60 * 9, L('handbook : tâche en échec', 'handbook: task failed'), 'error', 'handbook'],
      [60 * 11, L('Application uptime-board arrêtée sur Coolify', 'Application uptime-board stopped on Coolify'), 'stop', 'homelab-stack'],
      [60 * 26, L('atlas-web : branche feat/dark-mode', 'atlas-web: branch feat/dark-mode'), 'git', 'atlas-web'],
      [60 * 30, L('Projet Pocket Garden créé', 'Project Pocket Garden created'), 'create', 'pocket-garden'],
    ].map(([m, text, kind, project]) => ({ t: min(m), text, kind, project }));

    /* ------------------------------------------------------------- Coolify */
    const APPS = [
      { key: 'atlas', name: 'atlas', status: 'running:healthy', fqdn: 'https://atlas.example.com', repo: 'alex/atlas', branch: 'main', build_pack: 'nixpacks', updated: iso(34), project: 'atlas-web' },
      { key: 'ledger', name: 'ledger-api', status: 'running:healthy', fqdn: 'https://api.example.com,https://ledger.example.com', repo: 'alex/ledger-api', branch: 'main', build_pack: 'nixpacks', updated: iso(60 * 2 - 3), project: 'ledger-api' },
      { key: 'docs', name: 'handbook', status: 'running:unknown', fqdn: 'https://docs.example.com', repo: 'alex/handbook', branch: 'main', build_pack: 'static', updated: iso(60 * 6), project: 'handbook' },
      { key: 'status', name: 'uptime-board', status: 'exited:unhealthy', fqdn: 'https://status.example.com', repo: '', image: 'louislam/uptime-kuma:1', branch: '', build_pack: 'dockerimage', updated: iso(60 * 11), project: 'homelab-stack' },
    ].map((a) => ({ ...a, uuid: hex(`app-${a.key}`, 24).replace(/[^a-z0-9]/g, '').slice(0, 24) }));
    const DEPS = {
      atlas: [[34, 'finished', 'Show the deployment date on project cards', 'a91c0f2'], [60 * 3, 'finished', 'Add getStats() for the home page', '5d02be1'], [60 * 5, 'failed', 'Use the standalone output in the Docker image', '7e3a9c4'], [60 * 22, 'finished', 'Update dependency next to v15.1.3', 'c88d013']],
      ledger: [[60 * 2 - 5, 'finished', 'Invoices: mark as paid is idempotent', '1f4b7aa'], [60 * 7, 'finished', 'Health endpoint for Coolify', '93cc21e'], [60 * 28, 'finished', 'Pagination with settings.page_size', '0be5f17']],
      docs: [[60 * 6, 'finished', 'Incidents: first steps', '44a0d9e'], [60 * 29, 'finished', 'Backups: restore one folder', 'b7e21c0']],
      status: [[60 * 11, 'cancelled-by-user', '', ''], [60 * 26, 'finished', '', '']],
    };
    const ENVS = {
      atlas: [['DATABASE_URL', 'postgresql://atlas:s3cr3t-demo@postgres:5432/atlas', false], ['NEXT_PUBLIC_SITE_URL', 'https://atlas.example.com', true], ['NODE_ENV', 'production', true]],
      ledger: [['DATABASE_URL', 'postgresql+asyncpg://ledger:s3cr3t-demo@postgres:5432/ledger', false], ['REDIS_URL', 'redis://redis:6379/0', false], ['PAGE_SIZE', '50', false]],
      docs: [],
      status: [['UPTIME_KUMA_DISABLE_FRAME_SAMEORIGIN', 'false', false]],
    };

    return {
      lang, now: NOW, home: HOME, root: ROOT, user: 'alex', hostname: 'homelab', hex, uuid, min, iso, L,
      projects: P, diffs: DIFFS, tasks: TASKS, activity: ACTIVITY, apps: APPS, deps: DEPS, envs: ENVS,
    };
  };
})();
