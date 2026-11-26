'use strict';

/**
 * Production Readiness Regression Suite (Opus Audit v3 Remediation):
 * Covers F01 (middleware.ts + stale cookie clear), F02 (not-found.tsx), F03 (loading.tsx + spinner CSS),
 * F04 (mutation rate limiting), F06/F07/F19 (render.yaml + Persistent Disk migration + start-web.js),
 * F08 (25 authoritative products), F12 (catalog-only seed + provision-admin + disable-demo-accounts),
 * F13 (SESSION_SECRET guard), F14 (canonical WEBHOOK_SECRET / WEBHOOK_SHARED_SECRET), and Render proxy OAuth origin.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');

if (!require.extensions['.ts']) {
  require.extensions['.ts'] = function compileTs(module, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        resolveJsonModule: true,
      },
      fileName: filename,
    });
    module._compile(transpiled.outputText, filename);
  };
}

const V2_ROOT = path.resolve(__dirname, '../../../../..');
const INDEP_DB_PATH = path.join(V2_ROOT, 'packages/database/prisma/independent_v2.db');
process.env.DATABASE_URL = `file:${INDEP_DB_PATH.replace(/\\/g, '/')}`;

const origResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveWorkspaceAliases(request, parent, isMain, options) {
  if (request === '@toantrung/contracts') {
    return path.join(V2_ROOT, 'packages/contracts/src/common/index.ts');
  }
  if (request.startsWith('@toantrung/contracts/')) {
    const sub = request.slice('@toantrung/contracts/'.length);
    return path.join(V2_ROOT, 'packages/contracts/src', sub, 'index.ts');
  }
  if (request === '@toantrung/database') {
    return path.join(V2_ROOT, 'packages/database/src/index.ts');
  }
  try {
    return origResolveFilename.call(this, request, parent, isMain, options);
  } catch (err) {
    if (request.startsWith('.') && parent && parent.filename) {
      const candidateTs = path.resolve(path.dirname(parent.filename), `${request}.ts`);
      if (fs.existsSync(candidateTs)) return candidateTs;
      const candidateIndexTs = path.resolve(path.dirname(parent.filename), request, 'index.ts');
      if (fs.existsSync(candidateIndexTs)) return candidateIndexTs;
    }
    throw err;
  }
};

const { getConfiguredWebhookSecret, getSessionSecret } = require(
  path.join(V2_ROOT, 'apps/api/src/core/config/index.ts'),
);
const { enforceMutationRateLimit, resolvePublicOrigin } = require(
  path.join(V2_ROOT, 'apps/api/src/core/http/index.ts'),
);
const { getAdapterReadinessMatrix } = require(path.join(V2_ROOT, 'apps/api/src/workers/index.ts'));
const { POST: postWebhookRoute } = require(
  path.join(V2_ROOT, 'apps/api/src/app/api/v1/tracking/webhook/route.ts'),
);
const { GET: getAuthMeRoute } = require(
  path.join(V2_ROOT, 'apps/api/src/app/api/v1/auth/me/route.ts'),
);
const { disableDemoAccounts } = require(
  path.join(V2_ROOT, 'packages/database/scripts/disable-demo-accounts.js'),
);

test('F19/F06/F07: render.yaml Blueprint and start-web.js configure Render Persistent Disk, PORT binding, and secrets', () => {
  const renderYamlPath = path.join(V2_ROOT, 'render.yaml');
  assert.ok(fs.existsSync(renderYamlPath), 'render.yaml must exist at repository root');
  const yaml = fs.readFileSync(renderYamlPath, 'utf8');

  assert.match(yaml, /mountPath:\s*\/data/);
  assert.match(yaml, /DATABASE_URL[\s\S]*value:\s*file:\/data\/independent_v2\.db/);
  assert.match(yaml, /STORAGE_ROOT[\s\S]*value:\s*\/data\/storage/);
  assert.match(yaml, /SKIP_SEED_ACCOUNTS[\s\S]*value:\s*"true"/);
  assert.match(yaml, /NODE_ENV[\s\S]*value:\s*production/);
  assert.match(yaml, /healthCheckPath:\s*\/api\/v1\/health/);
  assert.match(yaml, /SESSION_SECRET[\s\S]*generateValue:\s*true/);
  assert.match(yaml, /WEBHOOK_SECRET[\s\S]*generateValue:\s*true/);
  assert.match(yaml, /startCommand:.*release:migrate.*npm start/);

  const webPkg = JSON.parse(fs.readFileSync(path.join(V2_ROOT, 'apps/web/package.json'), 'utf8'));
  assert.match(webPkg.scripts.start, /start-web\.js/, 'apps/web start script must use start-web.js for $PORT support');
  assert.ok(fs.existsSync(path.join(V2_ROOT, 'scripts/start-web.js')), 'scripts/start-web.js must exist');
});

test('F06/F12: Fresh Persistent Disk SQLite migration is idempotent, catalog-only seed creates 0 demo users, provision-admin respects DATABASE_URL, and disable-demo-accounts enforces real-admin guard', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-v2-pd-test-'));
  const nestedDbPath = path.join(tmpDir, 'data', 'independent_v2.db');
  const tempDbUrl = `file:${nestedDbPath.replace(/\\/g, '/')}`;
  let tempPrisma = null;

  t.after(async () => {
    if (tempPrisma) {
      await tempPrisma.$disconnect().catch(() => {});
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
    } catch {
      // Ignore transient Windows file lock on temp dir cleanup
    }
  });

  const envBase = {
    ...process.env,
    NODE_ENV: 'production',
    DATABASE_URL: tempDbUrl,
    STORAGE_ROOT: path.join(tmpDir, 'storage'),
    SKIP_SEED_ACCOUNTS: 'true',
  };

  // 1. Fresh migrate + idempotent second run
  const migrateScript = path.join(V2_ROOT, 'packages/database/scripts/migrate-deploy.js');
  execFileSync(process.execPath, [migrateScript], { env: envBase, stdio: 'pipe' });
  execFileSync(process.execPath, [migrateScript], { env: envBase, stdio: 'pipe' });
  assert.ok(fs.existsSync(nestedDbPath), 'SQLite DB file must be created inside Persistent Disk path');

  // 2. Catalog-only seed must create 8 roles, 25 products, 0 users
  const seedScript = path.join(V2_ROOT, 'packages/database/scripts/seed.js');
  execFileSync(process.execPath, [seedScript, '--catalog-only'], { env: envBase, stdio: 'pipe' });

  const { PrismaClient } = require('@prisma/client');
  tempPrisma = new PrismaClient({ datasources: { db: { url: tempDbUrl } } });

  const [roleCount, prodCount, initialUsers] = await Promise.all([
    tempPrisma.role.count(),
    tempPrisma.product.count(),
    tempPrisma.user.count(),
  ]);
  assert.equal(roleCount, 8);
  assert.equal(prodCount, 25);
  assert.equal(initialUsers, 0, 'Catalog-only seed must NOT create demo accounts');

  // 3. provision-admin must write to temp DATABASE_URL (not hardcoded default DB)
  const provisionScript = path.join(V2_ROOT, 'packages/database/scripts/provision-admin.js');
  execFileSync(process.execPath, [provisionScript], {
    env: {
      ...envBase,
      ADMIN_BOOTSTRAP_EMAIL: 'real.admin@toantrung.vn',
      ADMIN_BOOTSTRAP_PASSWORD: 'StrongRealAdmin#2026!',
      ADMIN_BOOTSTRAP_NAME: 'Admin Thực Tế',
    },
    stdio: 'pipe',
  });

  const provisioned = await tempPrisma.user.findUnique({
    where: { email: 'real.admin@toantrung.vn' },
    include: { role: true },
  });
  assert.ok(provisioned, 'Provisioned admin must exist in Persistent Disk DB');
  assert.equal(provisioned.role.roleCode, 'ADMIN');

  // 4. disable-demo-accounts disables demo user and revokes sessions while keeping real admin
  const adminRole = await tempPrisma.role.findUnique({ where: { roleCode: 'ADMIN' } });
  const demoUser = await tempPrisma.user.create({
    data: {
      email: 'admin@toantrung.vn',
      fullName: 'Demo Admin',
      roleId: adminRole.id,
      department: 'admin',
      passwordHash: 'scrypt$00$00',
      isActive: true,
    },
  });
  await tempPrisma.userSession.create({
    data: {
      userId: demoUser.id,
      tokenHash: crypto.randomBytes(32).toString('hex'),
      csrfToken: crypto.randomBytes(16).toString('hex'),
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });

  const cutover = await disableDemoAccounts({ apply: true, client: tempPrisma });
  assert.equal(cutover.disabledCount, 1);
  assert.equal(cutover.revokedSessionCount, 1);

  const demoReloaded = await tempPrisma.user.findUnique({ where: { id: demoUser.id } });
  assert.equal(demoReloaded.isActive, false);
  const realReloaded = await tempPrisma.user.findUnique({ where: { id: provisioned.id } });
  assert.equal(realReloaded.isActive, true);

  // 5. Refuse lock-out if no non-demo real admin exists
  await tempPrisma.user.update({ where: { id: provisioned.id }, data: { isActive: false } });
  await assert.rejects(
    () => disableDemoAccounts({ apply: true, client: tempPrisma }),
    /REFUSED_NO_REAL_ADMIN/,
  );
});

test('F13/F14: Production SESSION_SECRET guard and canonical WEBHOOK_SECRET / WEBHOOK_SHARED_SECRET enforcement', async () => {
  assert.throws(
    () => getSessionSecret({ NODE_ENV: 'production', SESSION_SECRET: 'short' }),
    /MISSING_OR_WEAK_SESSION_SECRET/,
  );
  assert.throws(
    () =>
      getSessionSecret({
        NODE_ENV: 'production',
        SESSION_SECRET: 'toantrung-v2-production-default-secret-key-2026',
      }),
    /MISSING_OR_WEAK_SESSION_SECRET/,
  );
  const strong = crypto.randomBytes(36).toString('base64url');
  assert.equal(getSessionSecret({ NODE_ENV: 'production', SESSION_SECRET: strong }), strong);

  // Canonical webhook secret supports both WEBHOOK_SECRET and WEBHOOK_SHARED_SECRET
  assert.equal(getConfiguredWebhookSecret({ WEBHOOK_SECRET: 'sec-a' }), 'sec-a');
  assert.equal(getConfiguredWebhookSecret({ WEBHOOK_SHARED_SECRET: 'sec-b' }), 'sec-b');
  assert.equal(
    getConfiguredWebhookSecret({ WEBHOOK_SECRET: 'sec-a', WEBHOOK_SHARED_SECRET: 'sec-b' }),
    'sec-a',
  );

  const prevNodeEnv = process.env.NODE_ENV;
  const prevSecret = process.env.WEBHOOK_SECRET;
  const prevShared = process.env.WEBHOOK_SHARED_SECRET;

  try {
    process.env.NODE_ENV = 'production';
    delete process.env.WEBHOOK_SECRET;
    delete process.env.WEBHOOK_SHARED_SECRET;

    const unconfiguredRes = await postWebhookRoute(
      new Request('http://localhost:3000/api/v1/tracking/webhook', {
        method: 'POST',
        headers: { 'x-forwarded-for': '10.99.0.1', 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    assert.equal(unconfiguredRes.status, 503);

    process.env.WEBHOOK_SHARED_SECRET = 'prod-shared-webhook-secret-2026';
    const matrix = getAdapterReadinessMatrix();
    const webhookAdapter = matrix.find((m) => m.code === 'WEB_WEBHOOK_GTM');
    assert.equal(webhookAdapter.mode, 'LIVE_CONNECTED');

    const badSecretRes = await postWebhookRoute(
      new Request('http://localhost:3000/api/v1/tracking/webhook', {
        method: 'POST',
        headers: {
          'x-forwarded-for': '10.99.0.2',
          'x-webhook-secret': 'wrong-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      }),
    );
    assert.equal(badSecretRes.status, 401);
  } finally {
    process.env.NODE_ENV = prevNodeEnv;
    if (prevSecret === undefined) delete process.env.WEBHOOK_SECRET;
    else process.env.WEBHOOK_SECRET = prevSecret;
    if (prevShared === undefined) delete process.env.WEBHOOK_SHARED_SECRET;
    else process.env.WEBHOOK_SHARED_SECRET = prevShared;
  }
});

test('F04 & Render Proxy Origin: enforceMutationRateLimit blocks bursts with 429 + Retry-After and resolvePublicOrigin honors proxy headers', () => {
  const scope = `test_burst_${Date.now()}`;
  const req = new Request('http://0.0.0.0:10000/api/v1/leads', {
    method: 'POST',
    headers: {
      'x-forwarded-for': '198.51.100.77',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'toantrung-crm-v2.onrender.com',
    },
  });

  assert.equal(resolvePublicOrigin(req), 'https://toantrung-crm-v2.onrender.com');

  assert.equal(enforceMutationRateLimit(req, scope, 999, 2, 60_000), null);
  assert.equal(enforceMutationRateLimit(req, scope, 999, 2, 60_000), null);
  const blocked = enforceMutationRateLimit(req, scope, 999, 2, 60_000);
  assert.ok(blocked, '3rd request must be rate limited');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('Retry-After'), '60');
});

test('F01/F02/F03: Server-side auth middleware, stale cookie cleanup, branded 404, and accessible loading spinner exist', async () => {
  const mwPath = path.join(V2_ROOT, 'apps/web/src/middleware.ts');
  const notFoundPath = path.join(V2_ROOT, 'apps/web/src/app/not-found.tsx');
  const rootLoadingPath = path.join(V2_ROOT, 'apps/web/src/app/loading.tsx');
  const wsLoadingPath = path.join(V2_ROOT, 'apps/web/src/app/(workspace)/loading.tsx');
  const globalsCssPath = path.join(V2_ROOT, 'apps/web/src/app/globals.css');

  assert.ok(fs.existsSync(mwPath), 'apps/web/src/middleware.ts must exist');
  assert.ok(fs.existsSync(notFoundPath), 'apps/web/src/app/not-found.tsx must exist');
  assert.ok(fs.existsSync(rootLoadingPath), 'apps/web/src/app/loading.tsx must exist');
  assert.ok(fs.existsSync(wsLoadingPath), 'apps/web/src/app/(workspace)/loading.tsx must exist');

  const mwSrc = fs.readFileSync(mwPath, 'utf8');
  assert.match(mwSrc, /tt_v2_indep_session/);
  assert.match(mwSrc, /x-forwarded-host/);
  assert.match(mwSrc, /NextResponse\.redirect/);

  const wsLoadingSrc = fs.readFileSync(wsLoadingPath, 'utf8');
  assert.match(wsLoadingSrc, /<progress\b/);
  assert.doesNotMatch(wsLoadingSrc, /aria-live/);

  const cssSrc = fs.readFileSync(globalsCssPath, 'utf8');
  assert.match(cssSrc, /@property --arc-start/);
  assert.match(cssSrc, /forced-colors:\s*active/);
  assert.match(cssSrc, /prefers-reduced-motion:\s*reduce/);
  assert.match(cssSrc, /@supports not \(background-clip:\s*border-area\)/);

  // Stale/invalid session cookie sent to /api/v1/auth/me?optional=1 must be cleared with Max-Age=0
  const staleRes = await getAuthMeRoute(
    new Request('http://localhost:3000/api/v1/auth/me?optional=1', {
      headers: { cookie: 'tt_v2_indep_session=expired_invalid_token_1234567890' },
    }),
  );
  assert.equal(staleRes.status, 200);
  const staleJson = await staleRes.json();
  assert.equal(staleJson.data.authenticated, false);
  const setCookie = staleRes.headers.get('set-cookie') || '';
  assert.match(setCookie, /tt_v2_indep_session=;/);
  assert.match(setCookie, /Max-Age=0/i);
});
