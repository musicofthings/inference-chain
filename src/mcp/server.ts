import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import YAML from 'yaml';
import { z } from 'zod';
import { evolveLedger, scoreLedger } from '../core/evolve.js';
import { type LedgerEvent, makeEvent } from '../core/events.js';
import { renderResumeBrief } from '../core/resume.js';
import {
  ChainLedgerSchema,
  InteractionUpdateSchema,
  SCHEMA_VERSION,
  SessionBriefSchema,
  type ChainLedger,
} from '../core/schemas.js';
import {
  appendEvent,
  ensureLedgerFile,
  lastEvent,
  verifyChain,
} from '../storage/jsonl.js';
import { PATHS, ic } from '../storage/paths.js';
import {
  eventCount,
  insertBrief,
  insertEvent,
  insertEvolution,
  insertUpdate,
  openDb,
  upsertChainState,
} from '../storage/sqlite.js';

function requireProject(): ChainLedger {
  if (!existsSync(PATHS.currentYml())) {
    throw new Error(
      `No .inference-chain/ project found in cwd (${process.cwd()}). Run "ic init --project-name <name>" first.`,
    );
  }
  return ChainLedgerSchema.parse(YAML.parse(readFileSync(PATHS.currentYml(), 'utf8')));
}

function appendChainEvent(args: {
  projectId: string;
  iteration: number;
  type: LedgerEvent['type'];
  payload: unknown;
}): LedgerEvent {
  ensureLedgerFile(PATHS.ledgerJsonl());
  const prev = lastEvent(PATHS.ledgerJsonl());
  const event = makeEvent({
    ...args,
    schemaVersion: SCHEMA_VERSION,
    parent: prev ? { id: prev.id, hash: prev.hash } : null,
  });
  appendEvent(PATHS.ledgerJsonl(), event);
  const db = openDb(PATHS.db());
  try {
    insertEvent(db, event);
  } finally {
    db.close();
  }
  return event;
}

function parseArtifact<T>(schema: z.ZodSchema<T>, raw: string): T {
  // Accept YAML or JSON — both deserialize through YAML.parse.
  return schema.parse(YAML.parse(raw));
}

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: 'inference-chain',
    version: '0.2.0',
  });

  server.tool(
    'chain_status',
    'Get the current Inference Chain status for the project rooted at the server cwd. Returns iteration, sizes, score, last event.',
    {},
    async () => {
      const ledger = requireProject();
      const db = openDb(PATHS.db());
      const count = eventCount(db);
      db.close();
      const payload = {
        project: ledger.project_id,
        iteration: ledger.iteration,
        events: count,
        stable_learnings: ledger.stable_learnings.length,
        active_hypotheses: ledger.active_hypotheses.length,
        rejected_hypotheses: ledger.rejected_hypotheses.length,
        do_not_repeat: ledger.do_not_repeat.length,
        next_best_action: ledger.current_frontier.next_best_action.length,
        blockers: ledger.current_frontier.blockers.length,
        score: scoreLedger(ledger),
        last_event: lastEvent(PATHS.ledgerJsonl())?.type ?? null,
      };
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    },
  );

  server.tool(
    'chain_resume_brief',
    'Render and return the resume brief markdown for the current ledger. Also persists to .inference-chain/resumes/resume_latest.md.',
    {},
    async () => {
      const ledger = requireProject();
      const text = renderResumeBrief(ledger);
      writeFileSync(PATHS.resumeLatest(), text);
      appendChainEvent({
        projectId: ledger.project_id,
        iteration: ledger.iteration,
        type: 'resume_brief_generated',
        payload: { iteration: ledger.iteration, via: 'mcp' },
      });
      return { content: [{ type: 'text', text }] };
    },
  );

  server.tool(
    'chain_ingest_update',
    'Validate and persist an InteractionUpdate. Body may be YAML or JSON matching the InteractionUpdate schema (kind: interaction_update).',
    { body: z.string().describe('YAML or JSON text of an InteractionUpdate') },
    async ({ body }) => {
      requireProject();
      const parsed = parseArtifact(InteractionUpdateSchema, body);
      writeFileSync(ic('inbox', 'latest-update.yml'), YAML.stringify(parsed));
      const db = openDb(PATHS.db());
      try {
        insertUpdate(db, {
          id: parsed.id,
          projectId: parsed.project_id,
          iteration: parsed.iteration,
          yaml: YAML.stringify(parsed),
          createdAt: new Date().toISOString(),
        });
      } finally {
        db.close();
      }
      appendChainEvent({
        projectId: parsed.project_id,
        iteration: parsed.iteration,
        type: 'interaction_update_captured',
        payload: { id: parsed.id, trigger: parsed.trigger, via: 'mcp' },
      });
      return {
        content: [
          { type: 'text', text: `Ingested InteractionUpdate ${parsed.id}. Call chain_evolve to apply.` },
        ],
      };
    },
  );

  server.tool(
    'chain_ingest_brief',
    'Validate and persist a SessionBrief. Body may be YAML or JSON matching the SessionBrief schema (kind: session_brief).',
    { body: z.string().describe('YAML or JSON text of a SessionBrief') },
    async ({ body }) => {
      requireProject();
      const parsed = parseArtifact(SessionBriefSchema, body);
      writeFileSync(ic('inbox', 'latest-brief.yml'), YAML.stringify(parsed));
      const db = openDb(PATHS.db());
      try {
        insertBrief(db, {
          id: parsed.id,
          projectId: parsed.project_id,
          iteration: parsed.iteration,
          yaml: YAML.stringify(parsed),
          createdAt: new Date().toISOString(),
        });
      } finally {
        db.close();
      }
      appendChainEvent({
        projectId: parsed.project_id,
        iteration: parsed.iteration,
        type: 'session_brief_captured',
        payload: { id: parsed.id, via: 'mcp' },
      });
      return {
        content: [
          { type: 'text', text: `Ingested SessionBrief ${parsed.id}. Call chain_evolve to apply.` },
        ],
      };
    },
  );

  server.tool(
    'chain_evolve',
    'Apply the inbox brief or update to the current ledger. Emits a MemoryEvolutionRecord and advances iteration for SessionBriefs.',
    { advance: z.boolean().optional().describe('Force iteration advance for InteractionUpdates') },
    async ({ advance }) => {
      const ledger = requireProject();
      const briefPath = PATHS.inboxBrief();
      const updatePath = PATHS.inboxUpdate();
      const before = scoreLedger(ledger);

      let result: ReturnType<typeof evolveLedger>;
      let sourceKind: 'session' | 'interaction';
      if (existsSync(briefPath)) {
        const brief = SessionBriefSchema.parse(YAML.parse(readFileSync(briefPath, 'utf8')));
        result = evolveLedger(ledger, { kind: 'session', value: brief }, true);
        sourceKind = 'session';
      } else if (existsSync(updatePath)) {
        const upd = InteractionUpdateSchema.parse(YAML.parse(readFileSync(updatePath, 'utf8')));
        result = evolveLedger(ledger, { kind: 'interaction', value: upd }, Boolean(advance));
        sourceKind = 'interaction';
      } else {
        throw new Error(
          'No inbox artifact. Call chain_ingest_update or chain_ingest_brief first.',
        );
      }

      const validated = ChainLedgerSchema.parse(result.updatedLedger);
      const ledgerYaml = YAML.stringify(validated);
      writeFileSync(PATHS.currentYml(), ledgerYaml);
      const recordYaml = YAML.stringify(result.evolutionRecord);
      writeFileSync(ic('evolutions', `${result.evolutionRecord.id}.yml`), recordYaml);

      const db = openDb(PATHS.db());
      try {
        insertEvolution(db, {
          id: result.evolutionRecord.id,
          projectId: result.evolutionRecord.project_id,
          fromIteration: result.evolutionRecord.from_iteration,
          toIteration: result.evolutionRecord.to_iteration,
          yaml: recordYaml,
          createdAt: result.evolutionRecord.created_at,
        });
        upsertChainState(db, validated, ledgerYaml);
      } finally {
        db.close();
      }
      appendChainEvent({
        projectId: validated.project_id,
        iteration: result.evolutionRecord.to_iteration,
        type: 'memory_evolution_created',
        payload: { id: result.evolutionRecord.id, source: result.evolutionRecord.source, via: 'mcp' },
      });
      appendChainEvent({
        projectId: validated.project_id,
        iteration: validated.iteration,
        type: 'ledger_evolved',
        payload: {
          from: result.evolutionRecord.from_iteration,
          to: result.evolutionRecord.to_iteration,
          source: sourceKind,
          via: 'mcp',
        },
      });

      // Best-effort archive of inbox file so re-runs don't double-apply.
      try {
        if (sourceKind === 'session' && existsSync(briefPath)) {
          writeFileSync(ic('briefs', `${result.evolutionRecord.id}-source.yml`), readFileSync(briefPath, 'utf8'));
          writeFileSync(briefPath, '');
        } else if (existsSync(updatePath)) {
          writeFileSync(ic('updates', `${result.evolutionRecord.id}-source.yml`), readFileSync(updatePath, 'utf8'));
          writeFileSync(updatePath, '');
        }
      } catch {
        // archival is non-critical
      }

      const after = scoreLedger(validated);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                from: result.evolutionRecord.from_iteration,
                to: result.evolutionRecord.to_iteration,
                source: sourceKind,
                score_before: before,
                score_after: after,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    'chain_verify',
    'Replay the JSONL hash chain and cross-check against SQLite event count.',
    {},
    async () => {
      if (!existsSync(PATHS.ledgerJsonl())) {
        throw new Error('Missing ledger.jsonl');
      }
      const report = verifyChain(PATHS.ledgerJsonl());
      const db = openDb(PATHS.db());
      const sqlite = eventCount(db);
      db.close();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ...report, sqlite_event_count: sqlite, in_sync: sqlite === report.total }, null, 2),
          },
        ],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
